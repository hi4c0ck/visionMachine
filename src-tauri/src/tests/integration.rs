#[cfg(test)]
mod integration_tests {
    use visionmachine_lib::storage::{Database, StorageManager};
    use std::path::PathBuf;
    
    /// Helper to create test database
    async fn setup_test_db() -> (Database, PathBuf) {
        let temp_dir = std::env::temp_dir().join("visionmachine_integration_test");
        std::fs::create_dir_all(&temp_dir).unwrap();
        
        let db = Database::new(temp_dir.to_str().unwrap()).await.unwrap();
        let mut db_mut = db.clone();
        db_mut.initialize().await.unwrap();
        
        (db, temp_dir)
    }
    
    #[tokio::test]
    async fn test_full_production_workflow() {
        let (db, _temp_dir) = setup_test_db().await;
        
        // 1. Create user profile
        let profile_result = db.create_profile("Alice Johnson", Some("alice@test.com")).await;
        assert!(profile_result.is_ok(), "Should create profile successfully");
        let profile = profile_result.unwrap();
        let profile_id = profile["id"].as_str().unwrap().to_string();
        
        // 2. Create project under profile
        let project_result = db.create_project(&profile_id, "AI Video Project", Some("My first video project")).await;
        assert!(project_result.is_ok(), "Should create project successfully");
        let project = project_result.unwrap();
        let project_id = project["id"].as_str().unwrap().to_string();
        
        // 3. Verify project has correct FK
        let fetched_project = db.get_project(&project_id).await.unwrap();
        assert_eq!(fetched_project["profile_id"], profile_id);
        
        // 4. Create session under project
        let session_result = db.create_session(&project_id, "First Edit Session").await;
        assert!(session_result.is_ok(), "Should create session successfully");
        let session = session_result.unwrap();
        let session_id = session["id"].as_str().unwrap().to_string();
        
        // 5. Verify session state is idle by default
        assert_eq!(session["state"], "idle");
        
        // 6. Get composer (should auto-create empty composer)
        let composer_result = db.get_composer(&session_id).await;
        assert!(composer_result.is_ok(), "Should get/create composer");
        let composer = composer_result.unwrap();
        assert_eq!(composer["version"], 1);
        
        // 7. Update composer with pipe data
        let config_json = serde_json::json!({
            "pipes": [
                {
                    "id": "pipe-1",
                    "name": "Opening Scene",
                    "order": 1,
                    "config": {"model": "sdxl", "temperature": 0.5},
                    "prompt_rows": [
                        {"id": "root", "tag": "subject", "value": "mountain landscape"}
                    ]
                }
            ],
            "state": "ready"
        }).to_string();
        
        let updated_composer = db.update_composer(&session_id, &config_json).await.unwrap();
        assert_eq!(updated_composer["version"], 2);
        
        // 8. Create artifact linked to session
        let artifact_result = db.create_artifact(
            Some(&session_id),
            Some(&project_id),
            Some(&profile_id),
            "image",
            "/output/keyframe_001.png",
            Some(r#"{"width": 1920, "height": 1080}"#)
        ).await;
        assert!(artifact_result.is_ok(), "Should create artifact");
        
        // 9. Verify artifact linking
        let artifacts = db.list_artifacts_by_session(&session_id).await.unwrap();
        assert_eq!(artifacts.len(), 1, "Should have 1 artifact");
        assert_eq!(artifacts[0]["type"], "image");
        
        // 10. List all sessions for project
        let sessions = db.list_sessions(&project_id).await.unwrap();
        assert_eq!(sessions.len(), 1, "Should have 1 session");
        assert_eq!(sessions[0]["name"], "First Edit Session");
        
        // 11. List all projects for profile
        let projects = db.list_projects(&profile_id).await.unwrap();
        assert_eq!(projects.len(), 1, "Should have 1 project");
        assert_eq!(projects[0]["name"], "AI Video Project");
        
        // 12. Update session state
        db.update_session_state(&session_id, "generating").await.unwrap();
        let updated_session = db.get_session(&session_id).await.unwrap();
        assert_eq!(updated_session["state"], "generating");
        
        // 13. Logout clears sessions
        db.logout_user().await.unwrap();
        let logged_out_session = db.get_session(&session_id).await.unwrap();
        assert_eq!(logged_out_session["state"], "idle", "Session should be reset to idle after logout");
        
        // 14. Check database stats
        let stats = db.stats().await.unwrap();
        assert!(stats["page_size"].as_i64().unwrap() > 0);
        assert_eq!(stats["journal_mode"], "wal");
        assert!(stats["size_mb"].as_f64().unwrap() >= 0.0);
        
        println!("✅ Full production workflow test passed!");
    }
    
    #[tokio::test]
    async fn test_cascade_delete_chain() {
        let (db, _temp_dir) = setup_test_db().await;
        
        // Create full hierarchy
        let profile = db.create_profile("Test User", None).await.unwrap();
        let project = db.create_project(profile["id"].as_str().unwrap(), "Project", None).await.unwrap();
        let session = db.create_session(project["id"].as_str().unwrap(), "Session").await.unwrap();
        let _composer = db.get_composer(session["id"].as_str().unwrap()).await.unwrap();
        
        // Delete project - should cascade to sessions and composers
        db.delete_project(project["id"].as_str().unwrap()).await.unwrap();
        
        // All related records should be deleted
        assert!(db.get_session(session["id"].as_str().unwrap()).await.is_err(), 
                "Session should be deleted via cascade");
        
        println!("✅ Cascade delete chain works correctly!");
    }
    
    #[tokio::test]
    async fn test_concurrent_operations() {
        let (db, _temp_dir) = setup_test_db().await;
        
        // Create base profile and project
        let profile = db.create_profile("Concurrent User", None).await.unwrap();
        let project = db.create_project(profile["id"].as_str().unwrap(), "Concurrent Project", None).await.unwrap();
        
        // Spawn multiple concurrent operations
        let handles: Vec<_> = (0..10).map(|i| {
            let db_clone = db.clone();
            let proj_id = project["id"].as_str().unwrap().to_string();
            
            tokio::spawn(async move {
                // Each task creates a session
                let session = db_clone.create_session(&proj_id, &format!("Session {}", i)).await;
                
                // Each task updates composer
                if i == 0 {
                    let config = serde_json::json!({"pipes": [], "state": "ready"}).to_string();
                    if let Ok(sess) = &session {
                        let _ = db_clone.update_composer(sess["id"].as_str().unwrap(), &config).await;
                    }
                }
                
                session.map(|s| s["id"].clone())
            })
        }).collect();
        
        // Await all tasks
        let results: Vec<_> = futures::future::join_all(handles).await;
        
        // All should succeed
        for (i, result) in results.iter().enumerate() {
            assert!(result.is_ok(), "Task {} join error", i);
            assert!(result.as_ref().unwrap().is_ok(), "Task {} failed", i);
        }
        
        // Verify all sessions were created
        let sessions = db.list_sessions(project["id"].as_str().unwrap()).await.unwrap();
        assert_eq!(sessions.len(), 10, "Should have 10 concurrent sessions");
        
        println!("✅ Concurrent operations work correctly!");
    }
    
    #[tokio::test]
    async fn test_validation_errors() {
        let (db, _temp_dir) = setup_test_db().await;
        
        // Test invalid UUID
        let result = db.get_profile("not-a-uuid").await;
        assert!(result.is_err(), "Should reject invalid UUID");
        
        // Test invalid path
        let result = Database::new("../evil/path").await;
        assert!(result.is_err(), "Should reject path traversal");
        
        println!("✅ Validation errors handled correctly!");
    }
    
    #[tokio::test]
    async fn test_artifact_relationships() {
        let (db, _temp_dir) = setup_test_db().await;
        
        let profile = db.create_profile("Artifact User", None).await.unwrap();
        let project = db.create_project(profile["id"].as_str().unwrap(), "Project", None).await.unwrap();
        let session = db.create_session(project["id"].as_str().unwrap(), "Session").await.unwrap();
        
        // Create multiple artifacts with different types
        let types = vec!["image", "video", "audio", "text"];
        for (i, art_type) in types.iter().enumerate() {
            db.create_artifact(
                Some(&session["id"].as_str().unwrap()),
                None,
                Some(&profile["id"].as_str().unwrap()),
                art_type,
                &format!("/output/file_{}.ext", i),
                None
            ).await.unwrap();
        }
        
        // List by session
        let artifacts = db.list_artifacts_by_session(&session["id"].as_str().unwrap()).await.unwrap();
        assert_eq!(artifacts.len(), 4, "Should have 4 artifacts");
        
        // Create another session
        let session2 = db.create_session(project["id"].as_str().unwrap(), "Session 2").await.unwrap();
        db.create_artifact(
            Some(&session2["id"].as_str().unwrap()),
            None,
            None,
            "config",
            "/output/config.json",
            None
        ).await.unwrap();
        
        // Verify isolation
        let artifacts_s1 = db.list_artifacts_by_session(&session["id"].as_str().unwrap()).await.unwrap();
        let artifacts_s2 = db.list_artifacts_by_session(&session2["id"].as_str().unwrap()).await.unwrap();
        assert_eq!(artifacts_s1.len(), 4);
        assert_eq!(artifacts_s2.len(), 1);
        
        println!("✅ Artifact relationships work correctly!");
    }
    
    #[tokio::test]
    async fn test_database_maintenance() {
        let (db, _temp_dir) = setup_test_db().await;
        
        // Create some data
        for i in 0..5 {
            db.create_profile(&format!("User {}", i), None).await.unwrap();
        }
        
        // Check stats before
        let stats_before = db.stats().await.unwrap();
        println!("Database size before: {} MB", stats_before["size_mb"]);
        
        // Vacuum should not fail
        db.vacuum().await.unwrap();
        
        // Check stats after
        let stats_after = db.stats().await.unwrap();
        println!("Database size after: {} MB", stats_after["size_mb"]);
        
        // Integrity check should pass
        let integrity: (String,) = sqlx::query_as("PRAGMA integrity_check")
            .fetch_one(&mut *db.conn.lock().await.unwrap())
            .await
            .unwrap();
        assert_eq!(integrity.0, "ok");
        
        println!("✅ Database maintenance operations work correctly!");
    }
}
