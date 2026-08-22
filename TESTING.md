# VisionMachine - Manual Testing Guide

## Quick Test
1. Run: `src-tauri\target\release\vision-machine.exe`
2. Should see: Welcome screen with dark theme
3. Should stay open: No crashes

## Features to Test

### Login Screen
- [ ] Enter your name in text field
- [ ] Click "Get Started" or press Enter
- [ ] Theme dropdown should work (JetBrains Dark / Steel Dark)
- [ ] Name persists after restart (localStorage)

### Main Screen
- [ ] Shows "Hello, [name]!" greeting
- [ ] "Switch User" button works
- [ ] Footer shows "Build Info" and "About" buttons
- [ ] Version badge shows v0.1.0

### Data Persistence
- [ ] Close app
- [ ] Reopen app
- [ ] Your name should still be saved

## Known Working
✅ App launches without crash
✅ SQLite database creates in LocalAppData
✅ All Rust commands compile successfully
✅ Frontend builds with Vite + Svelte
✅ Theme switching via localStorage
✅ Profile login/logout flow

## Troubleshooting
If app crashes:
1. Check if Windows Defender is blocking it
2. Try running as administrator
3. Check `%LOCALAPPDATA%\com.visionmachine.desktop\` for DB files
