# App Rename Pattern

When renaming a Tauri app (e.g., VisionMachine → Studio), update ALL of these locations:

## Checklist

1. **Cargo.toml** - Update `name` and `version`
   ```toml
   [package]
   name = "vision-studio"
   version = "0.4.0"
   ```

2. **tauri.conf.json** - Update `productName`, `version`, `identifier`
   ```json
   {
     "productName": "Studio",
     "version": "0.4.0",
     "identifier": "com.visionstudio.desktop"
   }
   ```

3. **main.rs** - Update entry point to match new package name
   ```rust
   // WRONG (old name):
   vision_machine::run();
   // RIGHT (new name):
   vision_studio::run();
   ```

4. **migrations/*.sql** - Update any hardcoded references to old DB name or app name
   ```sql
   -- Rename DB references
   -- OLD: sqlite:///C:/Users/user/AppData/Local/com.visionmachine.desktop/visionmachine.db
   -- NEW: sqlite:///C:/Users/user/AppData/Local/com.visionstudio.desktop/studiodb.db
   ```

5. **src-tauri/src/lib.rs** - Update DB path and app data directory
   ```rust
   let db_path = app_data_dir.join("studiodb.db");
   // App data dir: com.visionstudio.desktop
   ```

6. **src/constants.ts** - Update APP_VERSION, appName, welcomeTitle
   ```ts
   const APP_VERSION = '0.4.0';
   const APP_CONSTANTS = {
     strings: {
       appName: 'Studio',
       welcomeTitle: 'Welcome to Studio',
     }
   };
   ```

7. **src/components/Frame.svelte** - Update logo text if hardcoded

## Pitfalls

- **main.rs entry point**: The most common post-rename crash is forgetting to update `main.rs`.
  Error: `cannot find module or crate 'vision_machine' in this scope`
  Fix: Change `vision_machine::run()` to `vision_studio::run()`

- **DB path mismatch**: Old DB files remain at old path; new installs use new path
  - Old: `C:/Users/user/AppData/Local/com.visionmachine.desktop/visionmachine.db`
  - New: `C:/Users/user/AppData/Local/com.visionstudio.desktop/studiodb.db`
  - Consider: Migrate data from old DB or start fresh

- **Stale MSIs**: Old installation MSIs still reference old app name
  - After rename, build new MSI: `npm run tauri build`
  - Users must reinstall to get new app name

- **Git tracking**: After rename, old files may still exist in git history
  - New commits will track renamed files
  - No action needed for git history

## Verification

After rename:
1. `cargo build --release` - Check no compile errors about missing modules
2. `npm run build` - Check frontend builds
3. `npm run tauri build` - Check new MSI created
4. Run exe - Verify app launches with new name
5. Check DB location - Should be at new path
6. Check logs - Log file at new app data directory
