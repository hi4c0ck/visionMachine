use tauri::Manager;

pub mod commands;
pub mod controllers;
pub mod models;
pub mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            // Profiles (Auth)
            commands::profiles::create_profile,
            commands::profiles::list_profiles,
            commands::profiles::get_current_profile,
            commands::profiles::login_profile,
            commands::profiles::logout_profile,
            
            // Projects
            commands::projects::create_project,
            commands::projects::list_projects,
            commands::projects::get_project,
            commands::projects::delete_project,
            
            // Sessions
            commands::sessions::create_session,
            commands::sessions::list_sessions,
            commands::sessions::get_session,
            commands::sessions::update_session_state,
            
            // Composer
            commands::composer::get_composer,
            commands::composer::save_composer,
            commands::composer::add_pipe,
            commands::composer::remove_pipe,
            commands::composer::set_keyframe,
            commands::composer::clear_keyframe,
            commands::composer::list_keyframes,
            commands::composer::generate_from_composer,
            
            // Artifacts
            commands::artifacts::create_artifact,
            commands::artifacts::list_artifacts_by_session,
            
            // Settings
            commands::settings::get_setting,
            commands::settings::set_setting,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
