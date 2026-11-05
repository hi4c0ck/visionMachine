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
