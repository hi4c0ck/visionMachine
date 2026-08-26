/// End-to-end integration tests for v0.2.x backend flow
#[cfg(test)]
mod e2e_integration_tests {
    use crate::storage::db::Database;
    use std::path::PathBuf;

    async fn setup_test_db() -> (Database, PathBuf) {
        let temp_dir = std::env::temp_dir().join("visionmachine_e2e_test");
        std::fs::create_dir_all(&temp_dir).unwrap();
        
        let db = Database::new(temp_dir.to_str().unwrap()).await.unwrap();
        db.migrate().await.unwrap();
        
        (db, temp_dir)
    }

    #[tokio::test]
    async fn test_end_to_end_workflow() {
        let (db, _dir) = setup_test_db().await;
        
        // Step 1: Login (simulate user session)
        let username = "testuser".to_string();
        
        // Step 2: Create project
        let project_id = db.create_project(
            "default", 
            &format!("{}'s Project", username), 
            Some(format!("C:\\Projects\\{}'s Project", username).as_str())
        ).await.unwrap();
        
        // Verify project exists in DB
        let projects = db.list_projects("default").await.unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0]["id"].as_str().unwrap(), project_id);
        assert_eq!(projects[0]["name"].as_str().unwrap(), format!("{}'s Project", username));
        
        // Step 3: Create session with pipes
        let pipes_json = serde_json::json!([{
            "id": "pipe-1",
            "lengthFrames": 121,
            "qValue": 18,
            "cValue": 7,
            "segments": []
        }]).to_string();
        
        let session_id = db.create_session(
            &project_id,
            "First Session",
            Some(&pipes_json)
        ).await.unwrap();
        
        // Verify session exists
        let sessions = db.list_sessions(&project_id).await.unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0]["id"].as_str().unwrap(), session_id);
        assert_eq!(sessions[0]["name"].as_str().unwrap(), "First Session");
        
        // Step 4: Update session (simulates user changing FPS/resolution)
        db.update_session(&session_id, &serde_json::json!({
            "fps": 30,
            "resolution": "1080p",
            "orientation": "horizontal"
        })).await.unwrap();
        
        // Verify update persisted
        let sessions = db.list_sessions(&project_id).await.unwrap();
        assert_eq!(sessions[0]["fps"].as_i64().unwrap(), 30);
        assert_eq!(sessions[0]["resolution"].as_str().unwrap(), "1080p");
        
        // Step 5: Create another session
        let session2_id = db.create_session(
            &project_id,
            "Second Session",
            None
        ).await.unwrap();
        
        // Verify both sessions exist
        let sessions = db.list_sessions(&project_id).await.unwrap();
        assert_eq!(sessions.len(), 2);
        
        // Step 6: Delete first session
        db.delete_session(&session_id).await.unwrap();
        
        // Verify only second session remains
        let sessions = db.list_sessions(&project_id).await.unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0]["id"].as_str().unwrap(), session2_id);
        
        println!("✓ End-to-end workflow test passed");
    }

    #[tokio::test]
    async fn test_multiple_projects_with_sessions() {
        let (db, _dir) = setup_test_db().await;
        
        // Create multiple projects
        let project1_id = db.create_project("default", "Project Alpha", None).await.unwrap();
        let project2_id = db.create_project("default", "Project Beta", None).await.unwrap();
        let project3_id = db.create_project("default", "Project Gamma", None).await.unwrap();
        
        // Create sessions for each project
        for project_id in [&project1_id, &project2_id, &project3_id] {
            for i in 1..=3 {
                db.create_session(project_id, &format!("Session {}", i), None)
                    .await.unwrap();
            }
        }
        
        // Verify isolation
        let s1 = db.list_sessions(&project1_id).await.unwrap();
        let s2 = db.list_sessions(&project2_id).await.unwrap();
        let s3 = db.list_sessions(&project3_id).await.unwrap();
        
        assert_eq!(s1.len(), 3);
        assert_eq!(s2.len(), 3);
        assert_eq!(s3.len(), 3);
        
        // All sessions have unique IDs
        let all_ids: Vec<&str> = s1.iter().map(|s| s["id"].as_str().unwrap()).chain(
            s2.iter().map(|s| s["id"].as_str().unwrap())
        ).chain(
            s3.iter().map(|s| s["id"].as_str().unwrap())
        ).collect();
        
        assert_eq!(all_ids.len(), 9);
        assert_eq!(all_ids.iter().collect::<std::collections::HashSet<_>>().len(), 9);
        
        println!("✓ Multiple projects with sessions test passed");
    }

    #[tokio::test]
    async fn test_pipes_json_persistence() {
        let (db, _dir) = setup_test_db().await;
        
        let project_id = db.create_project("default", "Pipes Test", None).await.unwrap();
        
        // Create session with complex pipes JSON
        let pipes_data = serde_json::json!([
            {
                "id": "pipe-1",
                "lengthFrames": 121,
                "keyframes": [
                    {"frame": 0, "type": "url", "imageSrc": "http://example.com/img1.png"}
                ],
                "qValue": 18,
                "cValue": 7,
                "segments": [
                    {"frameStart": 0, "frameEnd": 60, "tag": "scene", "value": 0}
                ]
            },
            {
                "id": "pipe-2",
                "lengthFrames": 65,
                "keyframes": [],
                "qValue": 20,
                "cValue": 8,
                "segments": []
            }
        ]);
        
        let session_id = db.create_session(
            &project_id,
            "Complex Pipes Session",
            Some(&pipes_data.to_string())
        ).await.unwrap();
        
        // Retrieve and verify
        let sessions = db.list_sessions(&project_id).await.unwrap();
        let stored_pipes: serde_json::Value = serde_json::from_str(
            sessions[0]["pipes_json"].as_str().unwrap()
        ).unwrap();
        
        assert_eq!(stored_pipes.as_array().unwrap().len(), 2);
        assert_eq!(stored_pipes[0]["id"].as_str().unwrap(), "pipe-1");
        assert_eq!(stored_pipes[0]["lengthFrames"], 121);
        assert_eq!(stored_pipes[1]["id"].as_str().unwrap(), "pipe-2");
        
        println!("✓ Pipes JSON persistence test passed");
    }

    #[tokio::test]
    async fn test_session_update_fields() {
        let (db, _dir) = setup_test_db().await;
        
        let project_id = db.create_project("default", "Update Fields", None).await.unwrap();
        let session_id = db.create_session(&project_id, "Base Session", None)
            .await.unwrap();
        
        // Update various fields
        db.update_session(&session_id, &serde_json::json!({
            "name": "Updated Name",
            "fps": 24,
            "resolution": "720p",
            "orientation": "vertical",
            "total_generated_frames": 42
        })).await.unwrap();
        
        // Verify all updates
        let sessions = db.list_sessions(&project_id).await.unwrap();
        assert_eq!(sessions[0]["name"], "Updated Name");
        assert_eq!(sessions[0]["fps"], 24);
        assert_eq!(sessions[0]["resolution"], "720p");
        assert_eq!(sessions[0]["orientation"], "vertical");
        assert_eq!(sessions[0]["total_generated_frames"], 42);
        
        println!("✓ Session field updates test passed");
    }

    #[tokio::test]
    async fn test_cascade_delete_on_project() {
        let (db, _dir) = setup_test_db().await;
        
        let project_id = db.create_project("default", "Cascade Test", None).await.unwrap();
        let session1 = db.create_session(&project_id, "Child 1", None).await.unwrap();
        let session2 = db.create_session(&project_id, "Child 2", None).await.unwrap();
        
        // Delete project (simulated by direct delete)
        sqlx::query("DELETE FROM projects WHERE id = ?")
            .bind(&project_id)
            .execute(&db.pool)
            .await
            .unwrap();
        
        // Sessions should be gone via cascade
        let sessions = db.list_sessions(&project_id).await.unwrap();
        assert_eq!(sessions.len(), 0);
        
        println!("✓ Cascade delete on project test passed");
    }

    #[tokio::test]
    async fn test_empty_project_sessions() {
        let (db, _dir) = setup_test_db().await;
        
        let project_id = db.create_project("default", "Empty Project", None).await.unwrap();
        
        // List sessions for empty project
        let sessions = db.list_sessions(&project_id).await.unwrap();
        assert_eq!(sessions.len(), 0);
        
        println!("✓ Empty project sessions test passed");
    }

    #[tokio::test]
    async fn test_profile_isolation() {
        let (db, _dir) = setup_test_db().await;
        
        // Create profiles
        db.create_profile("Alice").await.unwrap();
        db.create_profile("Bob").await.unwrap();
        
        // Create projects for each profile
        let alice_project = db.create_project("alice-profile-id", "Alice's Project", None)
            .await.unwrap();
        let bob_project = db.create_project("bob-profile-id", "Bob's Project", None)
            .await.unwrap();
        
        // Create sessions for each project
        db.create_session(&alice_project, "Alice Session", None).await.unwrap();
        db.create_session(&bob_project, "Bob Session", None).await.unwrap();
        
        // Verify isolation
        let alice_projects = db.list_projects("alice-profile-id").await.unwrap();
        let bob_projects = db.list_projects("bob-profile-id").await.unwrap();
        
        assert_eq!(alice_projects.len(), 1);
        assert_eq!(bob_projects.len(), 1);
        assert_ne!(alice_projects[0]["id"].as_str().unwrap(), bob_project);
        
        println!("✓ Profile isolation test passed");
    }
}
