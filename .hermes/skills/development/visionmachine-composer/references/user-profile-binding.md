# User Profile Binding Pattern

Projects and sessions should be tied to the user profile, not shared across all users.

## Architecture

```
User → Profile (hash-based ID) → Projects → Sessions
```

## Implementation

### Backend Commands

**profiles.rs** - User identity resolution:
```rust
#[tauri::command]
pub async fn get_user_profile(
    input: GetProfileInput,  // { user_name: String }
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db = state.db.lock().await;
    let profile_id = format!("profile_{}", hash_username(&input.user_name));
    let profile = db.get_or_create_profile(&profile_id, &input.user_name).await?;
    Ok(profile["id"].as_str().unwrap_or("").to_string())
}

fn hash_username(name: &str) -> String {
    let mut hasher = DefaultHasher::new();
    name.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}
```

**projects.rs** - Accept profile_id in input:
```rust
#[derive(Deserialize)]
pub struct CreateProjectInput {
    pub name: String,
    pub directory_path: Option<String>,
    pub profile_id: String,  // Added: user profile ID
}

#[tauri::command]
pub async fn create_project(
    input: CreateProjectInput,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db = state.db.lock().await;
    db.create_project(&input.profile_id, &input.name, input.directory_path.as_deref()).await?
}
```

### Frontend Pattern

**Workspace.svelte** - Get profile before operations:
```typescript
// On mount or before first project operation
if (!userProfileId) {
  const profileResult = await invoke('get_user_profile', {
    userName: userName
  });
  userProfileId = profileResult as string;
}

// When creating project
const result = await invoke('create_project', {
  input: {
    name: input.name,
    directory_path: projectPath,
    profile_id: userProfileId  // Pass profile ID
  }
});
```

## Database Schema

```sql
CREATE TABLE profiles (
    id TEXT PRIMARY KEY,      -- "profile_<hash>"
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,  -- FK to profiles
    name TEXT NOT NULL,
    directory_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);
```

## Pitfalls

- **Hardcoded "default" profile**: Old code used `db.create_project("default", ...)` 
  Fix: Pass actual profile_id from frontend

- **Missing profile_id in create_project input**: Ensure CreateProjectInput struct has `profile_id` field

- **Frontend not calling get_user_profile**: Profile must be obtained before first project operation
  Fix: Call get_user_profile on mount or before loadProjects()

- **Cross-user data leak**: Without profile_id filtering, all users see all projects
  Fix: WHERE profile_id = ? in list_projects query

## Verification

1. Create project as User A - check profile_id in DB
2. Create project as User B - check different profile_id
3. List projects for User A - only sees User A's projects
4. List projects for User B - only sees User B's projects
