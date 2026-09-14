//! Thin Tauri commands for the welcome-page account list:
//! list accounts with data stats, and delete an account (either archiving
//! its data to the user-space cache folder or removing it entirely).

use crate::storage::accounts::{AccountService, AccountStats};
use crate::storage::archive;
use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

/// One row of the welcome-page account list, with the stats the delete
/// modal shows.
#[derive(Debug, Clone, Serialize)]
pub struct AccountView {
    pub id: String,
    pub name: String,
    pub sessions: i64,
    pub images: i64,
    pub videos: i64,
    /// The account owns generated data (deletion requires confirmation).
    pub has_data: bool,
}

#[derive(Serialize)]
pub struct DeleteAccountResult {
    /// Set when the data was archived ("delete all data" unchecked).
    pub cache_folder: Option<String>,
}

#[derive(Deserialize)]
pub struct DeleteAccountInput {
    pub profile_id: String,
    /// `true` = also remove generated files from disk.
    /// `false` = keep them in the user cache folder first.
    pub delete_all_data: bool,
}

/// List every account with its generated-data stats.
#[tauri::command]
pub async fn list_accounts(state: State<'_, AppState>) -> Result<Vec<AccountView>, String> {
    let db = state.db.lock().await;
    let service = AccountService::new(db.pool.clone());
    let mut views: Vec<AccountView> = Vec::new();
    for profile in db.list_profiles().await? {
        let id = profile
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let name = profile
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let stats: AccountStats = service.stats(&id).await?;
        views.push(AccountView {
            has_data: stats.has_data(),
            id,
            name,
            sessions: stats.sessions,
            images: stats.images,
            videos: stats.videos,
        });
    }
    Ok(views)
}

/// Delete an account. When `delete_all_data` is false, its generated data
/// is first preserved in the user cache folder.
#[tauri::command]
pub async fn delete_account(
    input: DeleteAccountInput,
    state: State<'_, AppState>,
) -> Result<DeleteAccountResult, String> {
    let db = state.db.lock().await;
    let service = AccountService::new(db.pool.clone());

    let cache_folder = if input.delete_all_data {
        archive::remove_files(&service.artifact_paths(&input.profile_id).await?);
        None
    } else if service.stats(&input.profile_id).await?.has_data() {
        let paths = service.artifact_paths(&input.profile_id).await?;
        let dump = service.data_dump(&input.profile_id).await?;
        let name = service.name(&input.profile_id).await?;
        Some(
            archive::archive_to_cache(&name, &paths, &dump)?
                .display()
                .to_string(),
        )
    } else {
        None
    };

    service.delete_cascade(&input.profile_id).await?;
    Ok(DeleteAccountResult { cache_folder })
}
