# API Reference - Tauri Commands

## Overview

This document lists all Tauri commands available in VisionMachine for frontend-to-backend communication.

---

## Authentication Commands

### `login_user`

Authenticate a user with username.

**Parameters:**
```typescript
interface LoginUserParams {
  username: string;  // User's display name (required, non-empty)
}
```

**Returns:**
```typescript
Promise<string>  // Welcome message: "Welcome, {username}!"
```

**Error Cases:**
- Returns error if username is empty

**Frontend Usage:**
```typescript
import { invoke } from '@tauri-apps/api/core';

const result = await invoke('login_user', { username: 'John Doe' });
// result: "Welcome, John Doe!"
```

---

### `logout_user`

Log out the current user.

**Parameters:** None

**Returns:**
```typescript
Promise<void>
```

**Frontend Usage:**
```typescript
import { invoke } from '@tauri-apps/api/core';

await invoke('logout_user');
```

---

## Application Info Commands

### `get_app_info`

Get application metadata.

**Parameters:** None

**Returns:**
```typescript
Promise<{
  appName: string;   // "VisionMachine"
  version: string;   // Package version from Cargo.toml
}>
```

**Frontend Usage:**
```typescript
const info = await invoke('get_app_info');
console.log(info.appName);  // "VisionMachine"
console.log(info.version);  // "0.1.0"
```

---

## Theme Commands

### `set_theme`

Set the application theme (client-side management).

**Parameters:**
```typescript
interface SetThemeParams {
  theme: string;  // 'jetbrains-dark' | 'steel-dark' | 'light'
}
```

**Returns:**
```typescript
Promise<void>
```

**Note:** Theme is actually managed client-side via localStorage. This command exists for future server-side sync.

**Frontend Usage:**
```typescript
await invoke('set_theme', { theme: 'jetbrains-dark' });
```

---

## Error Logging Commands

### `report_error`

Report an error to the application log.

**Parameters:**
```typescript
interface ReportErrorParams {
  error: string;    // Error message (required)
  context: string;  // Context where error occurred (required)
}
```

**Returns:**
```typescript
Promise<void>
```

**Storage:** Errors are stored in memory (last 100 entries only).

**Frontend Usage:**
```typescript
await invoke('report_error', {
  error: 'Failed to load project',
  context: 'ProjectsPanel'
});
```

---

### `get_errors`

Retrieve recent errors from the log.

**Parameters:**
```typescript
interface GetErrorsParams {
  limit?: number;  // Max errors to return (default: 50)
}
```

**Returns:**
```typescript
Promise<Array<{
  timestamp: string;  // ISO 8601 format
  message: string;    // Full error message
}>>
```

**Frontend Usage:**
```typescript
const errors = await invoke('get_errors', { limit: 20 });
errors.forEach(({ timestamp, message }) => {
  console.log(`${timestamp}: ${message}`);
});
```

---

## Preflight Commands

### `get_preflight_report`

Get system preflight check results.

**Parameters:** None

**Returns:**
```typescript
Promise<PreflightReport>
```

**PreflightReport Structure:**
```typescript
interface PreflightReport {
  os: string;              // e.g., "Windows (x86_64)"
  status: 'passed' | 'failed';
  checks: Array<{
    name: string;          // Check name
    passed: boolean;       // Result
    message?: string;      // Optional details
  }>;
  timestamp: string;       // ISO 8601
}
```

**Frontend Usage:**
```typescript
const report = await invoke('get_preflight_report');
console.log(report.status);  // "passed"
```

---

## Complete Command List

| Command | Parameters | Returns | Description |
|---------|-----------|---------|-------------|
| `login_user` | `{ username: string }` | `string` | Authenticate user |
| `logout_user` | None | `void` | Logout user |
| `get_app_info` | None | `{ appName, version }` | App metadata |
| `set_theme` | `{ theme: string }` | `void` | Change theme |
| `report_error` | `{ error, context }` | `void` | Log error |
| `get_errors` | `{ limit? }` | `Array<{timestamp, message}>` | Get errors |
| `get_preflight_report` | None | `PreflightReport` | System checks |

---

## Error Handling Pattern

```typescript
import { invoke } from '@tauri-apps/api/core';

async function safeInvoke<T>(command: string, args?: any): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    const err = error as { kind?: string; message?: string };
    console.error(`[${command}]`, err.message || String(error));
    throw error;
  }
}

// Usage
const result = await safeInvoke('login_user', { username: 'John' });
```

---

## State Management (Rust Side)

```rust
#[derive(Clone)]
pub struct AppState {
    pub username: Arc<Mutex<Option<String>>>,
    pub preflight_report: Arc<Mutex<PreflightReport>>,
    pub error_log: Arc<Mutex<Vec<(String, String)>>>,
}
```

**Thread Safety:** All state uses `Arc<Mutex<...>>` for safe cross-thread access.