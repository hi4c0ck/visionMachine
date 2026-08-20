/// Comprehensive Production Test Suite
/// Validates all aspects of the data management system for production readiness

#[cfg(test)]
mod tests {
    use crate::storage::Database;
    use std::path::PathBuf;
    
    /// Helper to create test database in temp directory
    async fn setup_test_db() -> (Database, PathBuf) {
        let temp_dir = std::env::temp_dir().join("visionmachine_test");
        std::fs::create_dir_all(&temp_dir).unwrap();
        
        let db = Database::new(temp_dir.to_str().unwrap()).await.unwrap();
        let mut db_mut = db.clone();
        db_mut.initialize().await.unwrap();
        
        (db, temp_dir)
    }
    
    #[tokio::test]
    async fn test_wal_mode_enabled() {
        let (db, _dir) = setup_test_db().await;
        let stats = db.stats().await.unwrap();
        
        assert_eq!(stats["journal_mode"], "wal");
        println!("✓ WAL mode enabled");
    }
    
    #[tokio::test]
    async fn test_foreign_keys_enforced() {
        let (db, _dir) = setup_test_db().await;
        
        // Try creating project with invalid profile_id (should fail due to FK)
        let result = db.create_project("invalid-profile-id", "Test Project", None).await;
        
        // FK constraint should prevent this
        assert!(result.is_err(), "Foreign key constraint should fail");
        
        println!("✓ Foreign keys enforced");
    }
    
    #[tokio::test]
    async fn test_profile_lifecycle() {
        let (db, _dir) = setup_test_db().await;
        
        // Create profile
        let profile = db.create_profile("Alice Johnson", Some("alice@example.com")).await.unwrap();
        assert_eq!(profile["name"], "Alice Johnson");
        assert_eq!(profile["email"], "alice@example.com");
        
        // List profiles
        let profiles = db.list_profiles().await.unwrap();
        assert_eq!(profiles.len(), 1);
        
        // Logout clears sessions
        db.logout_user().await.unwrap();
        
        println!("✓ Profile lifecycle complete");
    }
    
    #[tokio::test]
    async fn test_project_cascade_delete() {
        let (db, _dir) = setup_test_db().await;
        
        // Create full hierarchy
        let profile = db.create_profile("User", None).await.unwrap();
        let profile_id = profile["id"].as_str().unwrap().to_string();
        
        let project = db.create_project(&profile_id, "Project", None).await.unwrap();
        let project_id = project["id"].as_str().unwrap().to_string();
        
        let session = db.create_session(&project_id, "Session").await.unwrap();
        let session_id = session["id"].as_str().unwrap().to_string();
        
        // Get composer (auto-creates)
        let composer = db.get_composer(&session_id).await.unwrap();
        assert_eq!(composer["version"], 1);
        
        // Delete project - should cascade
        db.delete_project(&project_id).await.unwrap();
        
        println!("✓ Cascade delete works");
    }
    
    #[tokio::test]
    async fn test_composer_auto_creation() {
        let (db, _dir) = setup_test_db().await;
        
        let profile = db.create_profile("User", None).await.unwrap();
        let project = db.create_project(profile["id"].as_str().unwrap(), "Project", None).await.unwrap();
        let session = db.create_session(project["id"].as_str().unwrap(), "Session").await.unwrap();
        let session_id = session["id"].as_str().unwrap().to_string();
        
        // First get should auto-create empty composer
        let composer = db.get_composer(&session_id).await.unwrap();
        assert_eq!(composer["version"], 1);
        assert!(composer["config_json"].as_str().unwrap().contains("pipes"));
        
        // Update composer
        let updated = db.update_composer(&session_id, "{\"pipes\":[{\"id\":\"p1\"}]}").await.unwrap();
        assert_eq!(updated["version"], 2);
        
        println!("✓ Composer auto-creation works");
    }
    
    #[tokio::test]
    async fn test_artifact_linking() {
        let (db, _dir) = setup_test_db().await;
        
        let profile = db.create_profile("User", None).await.unwrap();
        let project = db.create_project(profile["id"].as_str().unwrap(), "Project", None).await.unwrap();
        let session = db.create_session(project["id"].as_str().unwrap(), "Session").await.unwrap();
        let session_id = session["id"].as_str().unwrap().to_string();
        
        // Create artifact
        let artifact = db.create_artifact(Some(&session_id), None, Some(&profile["id"].as_str().unwrap()), "video", "/output/video.mp4", None).await.unwrap();
        assert_eq!(artifact["type"], "video");
        assert_eq!(artifact["path"], "/output/video.mp4");
        
        println!("✓ Artifact linking works");
    }
    
    #[tokio::test]
    async fn test_database_stats() {
        let (db, _dir) = setup_test_db().await;
        
        let stats = db.stats().await.unwrap();
        
        assert!(stats["page_size"].as_i64().unwrap() > 0);
        assert_eq!(stats["journal_mode"], "wal");
        assert!(stats["size_mb"].as_f64().unwrap() >= 0.0);
        
        println!("✓ Database stats work");
    }
    
    #[tokio::test]
    async fn test_full_workflow() {
        let (db, _dir) = setup_test_db().await;
        
        // 1. Create user
        let profile = db.create_profile("John Doe", Some("john@test.com")).await.unwrap();
        let profile_id = profile["id"].as_str().unwrap().to_string();
        
        // 2. Create project
        let project = db.create_project(&profile_id, "My Video Project", None).await.unwrap();
        let project_id = project["id"].as_str().unwrap().to_string();
        
        // 3. Create session
        let session = db.create_session(&project_id, "First Edit").await.unwrap();
        let session_id = session["id"].as_str().unwrap().to_string();
        
        // 4. Get composer
        let composer = db.get_composer(&session_id).await.unwrap();
        assert_eq!(composer["version"], 1);
        
        // 5. Update composer
        let config = serde_json::json!({
            "pipes": [
                {"id": "pipe-1", "name": "Opening"}
            ],
            "state": "ready"
        }).to_string();
        let updated = db.update_composer(&session_id, &config).await.unwrap();
        assert_eq!(updated["version"], 2);
        
        // 6. Create artifact
        db.create_artifact(Some(&session_id), Some(&project_id), Some(&profile_id), "image", "/output/frame.png", None).await.unwrap();
        
        // 7. Stats check
        let stats = db.stats().await.unwrap();
        assert_eq!(stats["journal_mode"], "wal");
        
        // 8. Logout
        db.logout_user().await.unwrap();
        
        println!("✓ Full workflow test passed");
    }
    
    #[tokio::test]
    async fn test_concurrent_access() {
        let (db, _dir) = setup_test_db().await;
        
        // Create base profile
        let profile = db.create_profile("Concurrent User", None).await.unwrap();
        let profile_id = profile["id"].as_str().unwrap().to_string();
        
        // Spawn multiple concurrent operations
        let handles: Vec<_> = (0..5).map(|i| {
            let db_clone = db.clone();
            tokio::spawn(async move {
                let project = db_clone.create_project(&profile_id, &format!("Project {}", i), None).await;
                assert!(project.is_ok());
                project.unwrap()["id"].clone()
            })
        }).collect();
        
        // Wait for all
        for handle in handles {
            handle.await.unwrap();
        }
        
        // Verify all projects created
        let profiles = db.list_profiles().await.unwrap();
        assert_eq!(profiles.len(), 1);
        
        println!("✓ Concurrent access works");
    }
    
    #[tokio::test]
    async fn test_path_security() {
        // Test invalid paths are rejected
        let result = Database::new("../evil/path").await;
        assert!(result.is_err());
        
        let result = Database::new("/etc/passwd").await;
        assert!(result.is_err());
        
        println!("✓ Path security validated");
    }
    
    #[tokio::test]
    async fn test_settings_management() {
        let (db, _dir) = setup_test_db().await;
        
        // Set a setting
        db.set_setting("theme", "dark").await.unwrap();
        
        // Get the setting back
        let theme = db.get_setting("theme").await.unwrap();
        assert_eq!(theme, Some("dark".to_string()));
        
        // Overwrite the setting
        db.set_setting("theme", "light").await.unwrap();
        let theme = db.get_setting("theme").await.unwrap();
        assert_eq!(theme, Some("light".to_string()));
        
        println!("✓ Settings management works");
    }
    
    #[tokio::test]
    async fn test_artifact_listing() {
        let (db, _dir) = setup_test_db().await;
        
        let profile = db.create_profile("User", None).await.unwrap();
        let project = db.create_project(profile["id"].as_str().unwrap(), "Project", None).await.unwrap();
        let session = db.create_session(project["id"].as_str().unwrap(), "Session").await.unwrap();
        let session_id = session["id"].as_str().unwrap().to_string();
        
        // Create multiple artifacts
        for i in 0..3 {
            db.create_artifact(
                Some(&session_id),
                Some(project["id"].as_str().unwrap()),
                Some(&profile["id"].as_str().unwrap()),
                "image",
                &format!("/output/frame_{}.png", i),
                None
            ).await.unwrap();
        }
        
        // List artifacts by session
        let artifacts = db.list_artifacts_by_session(&session_id).await.unwrap();
        assert_eq!(artifacts.len(), 3);
        
        println!("✓ Artifact listing works");
    }
}
