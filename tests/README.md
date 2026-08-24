# VisionMachine Test Suite

Comprehensive QA tests to maintain app quality and prevent regressions.

## Running Tests

### Unit Tests (Vitest)
```bash
npm run test
```

### E2E Tests (Playwright)
```bash
npm run test:e2e
```

### Build Verification
```bash
npm run build
npm run tauri build -- --debug
```

## Test Coverage

| Category | Tests | Status |
|----------|-------|--------|
| Welcome Screen | 8 | ✅ |
| Workspace Layout | 6 | ✅ |
| Projects/Sessions | 10 | ✅ |
| Composer Panel | 12 | ✅ |
| Data Persistence | 8 | ✅ |
| Component Props | 6 | ✅ |
| Event Handling | 8 | ✅ |
| Build System | 4 | ✅ |

## Test Categories

### 1. Welcome Screen (src/App.svelte)
- Name input validation
- Button enable/disable state
- Theme persistence
- Logout flow
- Keyboard navigation (Enter)

### 2. Workspace Layout (src/components/Workspace.svelte)
- 5-container layout structure
- Frame component rendering
- ProjectsPanel integration
- ComposerPanel rendering
- ToolsPanel visibility
- Responsive behavior

### 3. Projects/Sessions Management
- Create project
- Delete project
- Create session
- Rename session
- Delete session
- Session selection
- Project selection
- Nested data structure

### 4. Composer Panel (src/components/ComposerPanel.svelte)
- Keyframe management (add/remove)
- Q/C slider controls
- Pipe length adjustment
- Global prompt editing
- Segment type picker
- Segment value editing
- Frame validation (8n+1)

### 5. Data Persistence
- localStorage save/load
- Project/Session CRUD persistence
- Selection state persistence
- Composer changes persistence
- Startup restoration

### 6. Component Communication
- Props validation
- Event handling
- State synchronization
- Callback invocation

### 7. Build System
- Vite build success
- TypeScript compilation
- Tauri build success
- MSI generation

## QA Checklist

Before committing any changes, verify:

- [ ] All unit tests pass (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] No console errors in browser
- [ ] Welcome screen works
- [ ] Can create/delete projects
- [ ] Can create/delete sessions
- [ ] Composer unlocks when session selected
- [ ] Data persists across restarts
- [ ] Logs are written correctly

## Regression Prevention

Tests specifically designed to catch common mistakes:

1. **Props Mismatch** - Verifies all component props match expected interfaces
2. **Event Chain** - Ensures events flow correctly between components
3. **State Updates** - Confirms $state changes trigger re-renders
4. **Type Safety** - Validates TypeScript interfaces are correct
5. **Build Integrity** - Checks compilation doesn't break

## Maintaining Quality

When adding new features:

1. Write tests first (TDD)
2. Run full test suite
3. Verify no regressions
4. Document new test cases
5. Update README if needed
