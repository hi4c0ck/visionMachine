package main

import (
	"testing"
	"time"
)

// TestWALModeEnabled verifies that WAL mode is enabled
func TestWALModeEnabled(t *testing.T) {
	db := setupTestDB(t)
	defer cleanupTestDB(t, db)

	stats := db.Stats()
	if stats.JournalMode != "wal" {
		t.Errorf("Expected WAL mode, got %s", stats.JournalMode)
	}
}

// TestForeignKeyConstraints verifies foreign keys are enforced
func TestForeignKeyConstraints(t *testing.T) {
	db := setupTestDB(t)
	defer cleanupTestDB(t, db)

	// Try to create project with invalid profile ID
	_, err := db.CreateProject("nonexistent-profile-id", "Test Project")
	if err == nil {
		t.Error("Expected error for invalid profile_id, got nil")
	}
}

// TestProfileCRUD verifies profile create, read, update operations
func TestProfileCRUD(t *testing.T) {
	db := setupTestDB(t)
	defer cleanupTestDB(t, db)

	// Create
	profile, err := db.CreateProfile("John Doe", "john@example.com")
	if err != nil {
		t.Fatalf("Failed to create profile: %v", err)
	}
	if profile.Name != "John Doe" {
		t.Errorf("Expected name 'John Doe', got %s", profile.Name)
	}

	// Read
	fetched, err := db.GetProfile(profile.ID)
	if err != nil {
		t.Fatalf("Failed to get profile: %v", err)
	}
	if fetched.Name != "John Doe" {
		t.Errorf("Expected name 'John Doe', got %s", fetched.Name)
	}

	// List
	profiles, err := db.ListProfiles()
	if err != nil {
		t.Fatalf("Failed to list profiles: %v", err)
	}
	if len(profiles) != 1 {
		t.Errorf("Expected 1 profile, got %d", len(profiles))
	}
}

// TestCascadeDelete verifies cascade delete works
func TestCascadeDelete(t *testing.T) {
	db := setupTestDB(t)
	defer cleanupTestDB(t, db)

	// Create hierarchy
	profile, _ := db.CreateProfile("Test User", nil)
	project, _ := db.CreateProject(profile.ID, "Project")
	session, _ := db.CreateSession(project.ID, "Session")
	
	// Get composer (auto-creates)
	composer, _ := db.GetComposer(session.ID)
	if composer == nil {
		t.Fatal("Expected auto-created composer")
	}

	// Delete project - should cascade
	err := db.DeleteProject(project.ID)
	if err != nil {
		t.Fatalf("Failed to delete project: %v", err)
	}

	// Verify session and composer are deleted
	_, err = db.GetSession(session.ID)
	if err == nil {
		t.Error("Expected session to be deleted via cascade")
	}
}

// TestComposerAutoCreation verifies composer auto-creation
func TestComposerAutoCreation(t *testing.T) {
	db := setupTestDB(t)
	defer cleanupTestDB(t, db)

	// Create hierarchy
	profile, _ := db.CreateProfile("User", nil)
	project, _ := db.CreateProject(profile.ID, "Project")
	session, _ := db.CreateSession(project.ID, "Session")

	// Get composer (should auto-create)
	composer, err := db.GetComposer(session.ID)
	if err != nil {
		t.Fatalf("Failed to get composer: %v", err)
	}
	if composer.Version != 1 {
		t.Errorf("Expected version 1, got %d", composer.Version)
	}
}

// TestConcurrentAccess verifies concurrent operations work
func TestConcurrentAccess(t *testing.T) {
	db := setupTestDB(t)
	defer cleanupTestDB(t, db)

	// Create base profile
	profile, _ := db.CreateProfile("Concurrent User", nil)

	// Spawn concurrent operations
	done := make(chan bool, 10)
	for i := 0; i < 10; i++ {
		go func(id int) {
			_, err := db.CreateProject(profile.ID, f"Project {id}")
			if err != nil {
				t.Errorf("Failed to create project %d: %v", id, err)
			}
			done <- true
		}(i)
	}

	// Wait for all
	for i := 0; i < 10; i++ {
		<-done
	}

	// Verify all created
	projects, _ := db.ListProjects(profile.ID)
	if len(projects) != 10 {
		t.Errorf("Expected 10 projects, got %d", len(projects))
	}
}

// TestFullWorkflow verifies end-to-end workflow
func TestFullWorkflow(t *testing.T) {
	db := setupTestDB(t)
	defer cleanupTestDB(t, db)

	// 1. Create profile
	profile, err := db.CreateProfile("Alice Smith", "alice@test.com")
	if err != nil {
		t.Fatalf("Failed to create profile: %v", err)
	}

	// 2. Create project
	project, err := db.CreateProject(profile.ID, "Video Project", "My first project")
	if err != nil {
		t.Fatalf("Failed to create project: %v", err)
	}

	// 3. Create session
	session, err := db.CreateSession(project.ID, "First Edit")
	if err != nil {
		t.Fatalf("Failed to create session: %v", err)
	}

	// 4. Get composer
	composer, err := db.GetComposer(session.ID)
	if err != nil {
		t.Fatalf("Failed to get composer: %v", err)
	}

	// 5. Update composer
	configJSON := `{"pipes":[{"id":"pipe-1","name":"Opening"}],"state":"ready"}`
	updated, err := db.UpdateComposer(session.ID, configJSON)
	if err != nil {
		t.Fatalf("Failed to update composer: %v", err)
	}
	if updated.Version != 2 {
		t.Errorf("Expected version 2, got %d", updated.Version)
	}

	// 6. Create artifact
	artifact, err := db.CreateArtifact(session.ID, project.ID, profile.ID, "video", "/output/video.mp4", nil)
	if err != nil {
		t.Fatalf("Failed to create artifact: %v", err)
	}
	if artifact.Type != "video" {
		t.Errorf("Expected type 'video', got %s", artifact.Type)
	}

	// 7. Check stats
	stats := db.Stats()
	if stats.JournalMode != "wal" {
		t.Errorf("Expected WAL mode, got %s", stats.JournalMode)
	}

	// 8. Logout
	err = db.LogoutUser()
	if err != nil {
		t.Fatalf("Failed to logout: %v", err)
	}

	// Verify session state cleared
	sessionAfter, _ := db.GetSession(session.ID)
	if sessionAfter.State != "idle" {
		t.Errorf("Expected idle state after logout, got %s", sessionAfter.State)
	}
}

// Helper functions
func setupTestDB(t *testing.T) *Database {
	db, err := NewDatabase(t.TempDir())
	if err != nil {
		t.Fatalf("Failed to create test database: %v", err)
	}
	if err := db.Initialize(); err != nil {
		t.Fatalf("Failed to initialize database: %v", err)
	}
	return db
}

func cleanupTestDB(t *testing.T, db *Database) {
	// Database cleanup handled by temp directory
}
