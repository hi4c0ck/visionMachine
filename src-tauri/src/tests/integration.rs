/// Integration tests for v0.2.x backend integration
#[cfg(test)]
mod integration_tests {
    use crate::storage::db::Database;
    use std::path::PathBuf;
    
    /// Helper to create test database
    async fn setup_test_db() -> (Database, PathBuf) {
        let temp_dir = std::env::temp_dir().join("visionmachine_integration_test");
        std::fs::create_dir_all(&temp_dir).unwrap();
        
        let db = Database::new(temp_dir.to_str().unwrap()).await.unwrap();
        db.migrate().await.unwrap();
        
        (db, temp_dir)
    }
    
    #[tokio::test]
    async fn test_create_and_list_profiles() {
        let (db, _dir) = setup_test_db().await;
        
        // Create profiles
        let id1 = db.create_profile("Alice").await.unwrap();
        let id2 = db.create_profile("Bob").await.unwrap();
        let id3 = db.create_profile("Charlie").await.unwrap();
        
        assert!(!id1.is_empty());
        assert!(!id2.is_empty());
        assert!(!id3.is_empty());
        assert_ne!(id1, id2);
        assert_ne!(id2, id3);
        
        // List profiles
        let profiles = db.list_profiles().await.unwrap();
        assert_eq!(profiles.len(), 3);
        
        let names: Vec<&str> = profiles.iter()
            .map(|p| p["name"].as_str().unwrap())
            .collect();
        assert!(names.contains(&"Alice"));
        assert!(names.contains(&"Bob"));
        assert!(names.contains(&"Charlie"));
        
        println!("✓ Profile creation and listing works");
    }
}
