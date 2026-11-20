// Hide the console window in release/MSI builds; debug builds keep it so
// backend logs stay visible during development. Without this attribute the
// binary links as a CONSOLE subsystem and Windows opens a terminal next to
// the app even when installed from the MSI.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Minimal entry point
fn main() {
    vision_machine::run();
}
