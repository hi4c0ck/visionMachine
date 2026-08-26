/// Integration tests for v0.2.x backend integration
#[cfg(test)]
mod v02_integration_tests {
    use crate::storage::db::Database;
    use std::path::PathBuf;

    async fn setup_test_db() -> (Database, PathBuf) {
        let temp_dir = std::env::temp_dir().join("visionmachine_v02_integration");
        std::fs::create_dir_all(&temp_dir).unwrap();
        
        let db = Database::new(temp_dir.to_str().unwrap()).await.unwrap();
        db.migrate().await.unwrap();
        
        (db, temp_dir)
    }

    #[tokio::test]
    async fn test_create_and_list_projects() {
        let (db, _dir) = setup_test_db().await;
        
        // Create first project
        let id1 = db.create_project("default", "Project Alpha", Some("/path/alpha")).await.unwrap();
        assert!(!id1.is_empty());
        
        // Create second project
        let id2 = db.create_project("default", "Project Beta", None).await.unwrap();
        assert!(!id2.is_empty());
        assert_ne!(id1, id2);
        
        // List should return both
        let projects = db.list_projects("default").await.unwrap();
        assert_eq!(projects.len(), 2, "Should have 2 projects");
        
        // Verify names
        let names: Vec<&str> = projects.iter()
            .map(|p| p["name"].as_str().unwrap())
            .collect();
        assert!(names.contains(&"Project Alpha"));
        assert!(names.contains(&"Project Beta"));
        
        println!("✓ Create and list projects works");
    }

    #[tokio::test]
    async fn test_create_and_list_sessions() {
        let (db, _dir) = setup_test_db().await;
        
        // Create project first
        let project_id = db.create_project("default", "Test Project", None).await.unwrap();
        
        // Create sessions
        let session1 = db.create_session(&project_id, "Session 1", None).await.unwrap();
        let session2 = db.create_session(&project_id, "Session 2", None).await.unwrap();
        let session3 = db.create_session(&project_id, "Session 3", None).await.unwrap();
        
        assert!(!session1.is_empty());
        assert!(!session2.is_empty());
        assert!(!session3.is_empty());
        assert_ne!(session1, session2);
        assert_ne!(session2, session3);
        
        // List sessions for project
        let sessions = db.list_sessions(&project_id).await.unwrap();
        assert_eq!(sessions.len(), 3, "Should have 3 sessions");
        
        // Verify order (should be DESC by created_at)
        assert_eq!(sessions[0]["name"].as_str().unwrap(), "Session 3");
        assert_eq!(sessions[1]["name"].as_str().unwrap(), "Session 2");
        assert_eq!(sessions[2]["name"].as_str().unwrap(), "Session 1");
        
        println!("✓ Create and list sessions works");
    }

    #[tokio::test]
    async fn test_update_session() {
        let (db, _dir) = setup_test_db().await;
        
        let project_id = db.create_project("default", "Update Test", None).await.unwrap();
        let session_id = db.create_session(&project_id, "Original Name", None).await.unwrap();
        
        // Update session fields
        db.update_session(&session_id, &serde_json::json!({
            "name": "Updated Name",
            "fps": 30,
            "resolution": "1080p",
            "orientation": "vertical",
            "pipes_json": "[{\"id\":\"pipe-1\"}]"
        })).await.unwrap();
        
        // List and verify
        let sessions = db.list_sessions(&project_id).await.unwrap();
        assert_eq!(sessions.len(), 1);
        
        let session = &sessions[0];
        assert_eq!(session["name"].as_str().unwrap(), "Updated Name");
        assert_eq!(session["fps"].as_i64().unwrap(), 30);
        assert_eq!(session["resolution"].as_str().unwrap(), "1080p");
        assert_eq!(session["orientation"].as_str().unwrap(), "vertical");
        assert_eq!(session["pipes_json"].as_str().unwrap(), "[{\"id\":\"pipe-1\"}]");
        
        println!("✓ Update session works");
    }

    #[tokio::test]
    async fn test_delete_session() {
        let (db, _dir) = setup_test_db().await;
        
        let project_id = db.create_project("default", "Delete Test", None).await.unwrap();
        let session1 = db.create_session(&project_id, "To Delete", None).await.unwrap();
        let session2 = db.create_session(&project_id, "Keep", None).await.unwrap();
        
        // Delete first session
        db.delete_session(&session1).await.unwrap();
        
        // Verify only one remains
        let sessions = db.list_sessions(&project_id).await.unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0]["id"].as_str().unwrap(), session2);
        
        println!("✓ Delete session works");
    }

    #[tokio::test]
    async fn test_full_workflow() {
        let (db, _dir) = setup_test_db().await;
        
        // Create project
        let project_id = db.create_project("default", "Full Workflow Project", 
            Some("C:\\Projects\\Workflow")).await.unwrap();
        
        // Create first session with pipes
        let pipes_json = serde_json::json!([{
            "id": "pipe-1",
            "name": "Opening Scene",
            "config": {"model": "sdxl"}
        }]).to_string();
        
        let session1 = db.create_session(&project_id, "First Session", Some(&pipes_json))
            .await.unwrap();
        
        // Create second session
        let session2 = db.create_session(&project_id, "Second Session", None)
            .await.unwrap();
        
        // List projects
        let projects = db.list_projects("default").await.unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0]["name"].as_str().unwrap(), "Full Workflow Project");
        
        // List sessions
        let sessions = db.list_sessions(&project_id).await.unwrap();
        assert_eq!(sessions.len(), 2);
        
        // Update session
        db.update_session(&session1, &serde_json::json!({"fps": 24}))
            .await.unwrap();
        
        let sessions = db.list_sessions(&project_id).await.unwrap();
        assert_eq!(sessions[0]["fps"].as_i64().unwrap(), 24);
        
        println!("✓ Full workflow works");
    }

    #[tokio::test]
    async fn test_isolation_between_profiles() {
        let (db, _dir) = setup_test_db().await;
        
        // Create projects for different profiles
        let id1 = db.create_project("user_alice", "Alice Project", None).await.unwrap();
        let id2 = db.create_project("user_bob", "Bob Project", None).await.unwrap();
        let id3 = db.create_project("user_alice", "Alice Another", None).await.unwrap();
        
        // List for alice - should only see her projects
        let alice_projects = db.list_projects("user_alice").await.unwrap();
        assert_eq!(alice_projects.len(), 2);
        
        // List for bob - should only see his
        let bob_projects = db.list_projects("user_bob").await.unwrap();
        assert_eq!(bob_projects.len(), 1);
        assert_eq!(bob_projects[0]["id"].as_str().unwrap(), id2);
        
        println!("✓ Profile isolation works");
    }

    #[tokio::test]
    async fn test_default_profile_persistence() {
        let (db, _dir) = setup_test_db().await;
        
        // Create multiple projects with default profile
        for i in 0..5 {
            db.create_project("default", &format!("Default Project {}", i), None)
                .await.unwrap();
        }
        
        let projects = db.list_projects("default").await.unwrap();
        assert_eq!(projects.len(), 5);
        
        println!("✓ Default profile persistence works");
    }

    #[tokio::test]
    async fn test_session_with_pipes_json() {
        let (db, _dir) = setup_test_db().await;
        
        let project_id = db.create_project("default", "Pipes Test", None).await.unwrap();
        
        // Create session with pipes JSON
        let pipes_data = serde_json::json!([
            {"id": "pipe-1", "lengthFrames": 121, "qValue": 18, "cValue": 7},
            {"id": "pipe-2", "lengthFrames": 65, "qValue": 20, "cValue": 8}
        ]);
        
        let session_id = db.create_session(&project_id, "With Pipes", 
            Some(&pipes_data.to_string())).await.unwrap();
        
        // Retrieve and verify pipes stored correctly
        let sessions = db.list_sessions(&project_id).await.unwrap();
        assert_eq!(sessions.len(), 1);
        
        let stored_pipes: serde_json::Value = serde_json::from_str(
            sessions[0]["pipes_json"].as_str().unwrap()
        ).unwrap();
        
        assert_eq!(stored_pipes.as_array().unwrap().len(), 2);
        assert_eq!(stored_pipes[0]["id"].as_str().unwrap(), "pipe-1");
        
        println!("✓ Session with pipes JSON persists correctly");
    }
}
