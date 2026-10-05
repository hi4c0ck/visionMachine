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
