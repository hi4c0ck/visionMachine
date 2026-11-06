//! App-level window commands: close-guard handshake + renderer liveness.
//!
//! The close guard (lib.rs `on_window_event`) blocks a window close while
//! generation tasks are live and asks the frontend to confirm. These
//! commands let the frontend (a) disarm the backend's force-close watchdog
//! when the user explicitly chose "Keep working", and (b) ping renderer
//! liveness so a dead webview is logged instead of misdiagnosed.

use std::sync::atomic::Ordering;

use tauri::State;

use crate::AppState;

/// "Keep working" from the close-guard modal: the user chose to stay open,
/// so disarm the force-close watchdog (it would otherwise cancel the live
/// tasks 60 s after the original X-click despite this explicit "stay").
/// No-op when nothing is armed.
#[tauri::command]
pub fn close_dismissed(state: State<'_, AppState>) {
    state.close_watchdog_armed.store(false, Ordering::Release);
}

/// Renderer liveness ping (the UI calls it every 5 s). Records the last
/// heartbeat so the backend checker can detect a dead/wedged webview.
#[tauri::command]
pub fn ui_heartbeat(state: State<'_, AppState>) {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    state.last_ui_heartbeat_ms.store(now, Ordering::Release);
}

/// JS-side error/rejection capture. The packaged webview has no visible
/// console: the frontend forwards uncaught errors + unhandled rejections
/// here so a wedged UI leaves evidence in VisionMachine.log instead of a
/// silent "frozen window".
#[tauri::command]
pub fn js_error_log(message: String) {
    log::error!(
        "[UI] js error: {}",
        message.chars().take(4000).collect::<String>()
    );
}

/// In-app main-thread-stall report. The renderer's stall watchdog
/// (src/lib/stallWatch.ts) persists freeze records to localStorage and
/// flushes them here on the next healthy moment, so a frozen run is
/// diagnosable from VisionMachine.log without devtools or external
/// tooling. The stack is the recovery stack (the call chain that owned
/// the event loop when it finally freed up) plus the longtask stats.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StallReportInput {
    /// Unix ms the freeze started (worker-observed).
    pub started_at: u64,
    /// Unix ms the freeze ended, 0 = the app was force-closed mid-freeze.
    pub ended_at: u64,
    /// Main-thread recovery stack (empty when never recovered).
    pub recovery_stack: String,
    /// Longtask counts in the window that overlapped the freeze.
    pub longtask_count: u32,
    /// Worst longtask duration, ms.
    pub longtask_max_ms: u64,
    /// The session id the user was selecting when the freeze window started
    /// (empty = unknown / not a session-select window).
    pub context: String,
    /// The main-thread structure snapshot (DashSnapshot from
    /// src/lib/dashStore) the freeze-detecting worker held at the freeze
    /// onset — structure sizes + JS heap + pipeline ledger. `null` when
    /// the worker never received one (older build or reporter not yet
    /// mounted). This is the "which structure was big when the UI died"
    /// reading the main thread can't produce itself.
    #[serde(default)]
    pub snapshot: Option<serde_json::Value>,
}

/// Renderer-side frame-pipeline ledger line (src/lib/pipelineDiag.ts). The
/// UI flushes a compact, throttled snapshot of the thumbnail/decode pipeline
/// here so a memory-growth run is diagnosable from VisionMachine.log:
/// source churn, LRU evictions, in-flight decode depth, and the un-closed
/// clone bitmap count (the primary renderer texture-leak metric).
#[tauri::command]
pub fn log_pipeline_diag(message: String, state: tauri::State<'_, AppState>) {
    let line = message.chars().take(2000).collect::<String>();
    log::info!("[UI] pipeline diag: {}", line);
    state.dashboard.record_log_line(&format!("[UI] pipeline diag: {}", line));
}

#[tauri::command]
pub fn log_stall_report(input: StallReportInput, state: tauri::State<'_, AppState>) {
    let rec = input;
    let dur_s = if rec.ended_at > 0 {
        (rec.ended_at.saturating_sub(rec.started_at)) / 1000
    } else {
        u64::MAX // sentinel: never recovered (force-closed)
    };
    let dur_label = if dur_s == u64::MAX {
        ">65536 or never recovered".to_string()
    } else {
        dur_s.to_string()
    };
    let ctx_label = if rec.context.is_empty() {
        String::new()
    } else {
        format!(", while selecting session `{}`", rec.context)
    };
    log::warn!(
        "[UI] stall record: main thread blocked ~{}s{} (started {:#}, ended {:#}), {} longtask(s), max {}ms; recovery stack:\n{}",
        dur_label,
        ctx_label,
        rec.started_at,
        rec.ended_at,
        rec.longtask_count,
        rec.longtask_max_ms,
        if rec.recovery_stack.is_empty() { "(none — main thread never recovered)".to_string() } else { rec.recovery_stack.chars().take(4000).collect::<String>() }
    );
    // The worker-held structure snapshot at freeze onset — the reading the
    // pinned main thread can never produce itself.
    if let Some(snap) = &rec.snapshot {
        if !snap.is_null() {
            log::warn!(
                "[UI] structure snapshot at freeze onset: {}",
                snap.to_string().chars().take(4000).collect::<String>()
            );
        }
    }
    let dash_line = format!(
        "[UI] stall record: main thread blocked ~{}s{}",
        dur_label, ctx_label
    );
    state.dashboard.record_log_line(&dash_line);
}

/// On-demand process memory probe for the in-app RAM monitor chip. The UI
/// polls it every few seconds (a passive, generation-free read) so a user
/// can watch backend RSS without running a generation. Pairs with the
/// renderer's `performance.memory` snapshot for a two-process view.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryProbe {
    /// Backend process (vision-machine.exe) resident-set bytes.
    pub process_rss_bytes: u64,
    /// System total memory bytes.
    pub total_memory_bytes: u64,
    /// System available memory bytes.
    pub free_memory_bytes: u64,
    /// Generation tasks currently active.
    pub active_tasks: u32,
    /// The per-stage ring-buffer summary line (first → peak + peak stage),
    /// or an empty string when no generation has sampled yet.
    pub ring_summary: String,
    /// How many stage-attributed samples are in the ring buffer.
    pub ring_len: usize,
}

#[tauri::command]
pub fn memory_probe(state: State<'_, AppState>) -> Result<MemoryProbe, String> {
    let prof = state.generation.registry.memory_profiler();
    let (rss, total, free) = crate::generation::memory_profile::MemoryProfiler::probe();
    Ok(MemoryProbe {
        process_rss_bytes: rss,
        total_memory_bytes: total,
        free_memory_bytes: free,
        active_tasks: state.generation.registry.active_task_count() as u32,
        ring_summary: prof.summary_line(),
        ring_len: prof.snapshot().len(),
    })
}

/// Renderer pushes its module-level structure sizes + JS heap + pipeline/
/// stall snapshots to the live dashboard (src/lib/dashReport.ts). This is the
/// cross-process answer to "which structure is ratcheting": the backend can
/// read its own tasks/groups/ring directly, but the renderer's Maps live only
/// in the JS heap, so the renderer reports them and the dashboard merges.
#[tauri::command]
pub fn report_renderer_metrics(state: State<'_, AppState>, input: crate::dashboard::RendererMetrics) {
    state.dashboard.set_renderer_metrics(input);
}

/// Renderer pushes one stall/freeze/diagnostic line to the dashboard log ring
/// (in addition to `VisionMachine.log`). Keeps the feed alive even when the
/// main log file rotates.
#[tauri::command]
pub fn log_dashboard_line(state: State<'_, AppState>, message: String) {
    let line = message.chars().take(4000).collect::<String>();
    log::info!("[UI] RENDER: {}", line);
    state.dashboard.record_log_line(&format!("[UI] RENDER: {}", line));
}
