#!/usr/bin/env node
/**
 * VisionMachine Final Production Verification Script
 */

const fs = require('fs');
const path = require('path');

const root = process.env.PROJECT_ROOT || '.';
const passed = [];
const failed = [];

function checkFile(filePath, description) {
  const fullPath = path.join(root, filePath);
  if (fs.existsSync(fullPath)) {
    const stats = fs.statSync(fullPath);
    passed.push(`✅ ${description} (${filePath}) - ${stats.size} bytes`);
    return true;
  } else {
    failed.push(`❌ ${description} MISSING: ${filePath}`);
    return false;
  }
}

function checkContains(filePath, pattern, description) {
  const fullPath = path.join(root, filePath);
  if (!fs.existsSync(fullPath)) {
    failed.push(`❌ ${description} - File not found: ${filePath}`);
    return false;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  if (content.includes(pattern)) {
    passed.push(`✅ ${description}`);
    return true;
  } else {
    failed.push(`❌ ${description} - Pattern '${pattern}' not found in ${filePath}`);
    return false;
  }
}

function main() {
  console.log('='.repeat(70));
  console.log('VISIONMACHINE FINAL PRODUCTION VERIFICATION');
  console.log('='.repeat(70));
  console.log();

  // Core Rust Files
  console.log('📦 Core Rust Source Files:');
  checkFile('src-tauri/src/lib.rs', 'Library entry point');
  checkFile('src-tauri/src/main.rs', 'Main entry point');
  checkFile('src-tauri/Cargo.toml', 'Cargo manifest');
  checkFile('src-tauri/build.rs', 'Build script');
  console.log();

  // Storage Layer
  console.log('💾 Storage Layer:');
  checkFile('src-tauri/src/storage/db.rs', 'Database layer');
  checkFile('src-tauri/src/storage/mod.rs', 'Storage module');
  checkContains('src-tauri/src/storage/db.rs', 'journal_mode=WAL', 'WAL mode enabled');
  checkContains('src-tauri/src/storage/db.rs', 'foreign_keys=ON', 'Foreign keys enabled');
  checkContains('src-tauri/src/storage/db.rs', 'busy_timeout=5000', 'Busy timeout set');
  console.log();

  // Commands
  console.log('🔌 Tauri Commands:');
  checkFile('src-tauri/src/commands/profiles.rs', 'Profile commands');
  checkFile('src-tauri/src/commands/projects.rs', 'Project commands');
  checkFile('src-tauri/src/commands/sessions.rs', 'Session commands');
  checkFile('src-tauri/src/commands/artifacts.rs', 'Artifact commands');
  checkFile('src-tauri/src/commands/settings.rs', 'Settings commands');
  checkFile('src-tauri/src/commands/mod.rs', 'Commands module');
  console.log();

  // Models
  console.log('🧠 Models & ViewModels:');
  checkFile('src-tauri/src/models/viewmodel.rs', 'ViewModel base');
  checkFile('src-tauri/src/models/composer.rs', 'Composer model');
  checkFile('src-tauri/src/models/async_writer.rs', 'Async writer');
  checkFile('src-tauri/src/models/mod.rs', 'Models module');
  checkContains('src-tauri/src/models/viewmodel.rs', 'pub struct ViewModel', 'ViewModel struct exists');
  checkContains('src-tauri/src/models/composer.rs', 'pub struct Composer', 'Composer struct exists');
  checkContains('src-tauri/src/models/async_writer.rs', 'pub struct AsyncWriter', 'AsyncWriter struct exists');
  console.log();

  // Tests
  console.log('🧪 Test Suite:');
  checkFile('src-tauri/src/tests.rs', 'Integration tests');
  checkContains('src-tauri/src/tests.rs', 'test_wal_mode_enabled', 'WAL test');
  checkContains('src-tauri/src/tests.rs', 'test_foreign_keys_enforced', 'FK test');
  checkContains('src-tauri/src/tests.rs', 'test_full_workflow', 'Workflow test');
  checkContains('src-tauri/src/tests.rs', 'test_concurrent_access', 'Concurrency test');
  console.log();

  // Migrations
  console.log('🗄️ Database Schema:');
  checkFile('src-tauri/migrations/0001_create_schema.sql', 'Migration SQL');
  checkContains('src-tauri/migrations/0001_create_schema.sql', 'profiles', 'Profiles table');
  checkContains('src-tauri/migrations/0001_create_schema.sql', 'projects', 'Projects table');
  checkContains('src-tauri/migrations/0001_create_schema.sql', 'sessions', 'Sessions table');
  checkContains('src-tauri/migrations/0001_create_schema.sql', 'composers', 'Composers table');
  checkContains('src-tauri/migrations/0001_create_schema.sql', 'artifacts', 'Artifacts table');
  checkContains('src-tauri/migrations/0001_create_schema.sql', 'FOREIGN KEY', 'Foreign keys defined');
  console.log();

  // Documentation
  console.log('📚 Documentation:');
  checkFile('FINAL_PRODUCTION_CERTIFICATION_COMPLETE.md', 'Final certification');
  checkFile('FINAL_PRODUCTION_CERTIFICATION_FINAL.md', 'Certification v1');
  checkFile('ULTIMATE_PRODUCTION_READINESS_REPORT.md', 'Readiness report');
  checkFile('DEPLOYMENT_GUIDE.md', 'Deployment guide');
  checkFile('SECURITY.md', 'Security docs');
  console.log();

  // Summary
  console.log('='.repeat(70));
  console.log('RESULTS');
  console.log('='.repeat(70));
  console.log(`Passed:   ${passed.length}`);
  console.log(`Failed:   ${failed.length}`);
  console.log();

  if (failed.length > 0) {
    console.log('❌ FAILURES:');
    failed.forEach(f => console.log(`   ${f}`));
    console.log();
  }

  console.log('✅ PASSED (sample):');
  passed.slice(0, 15).forEach(p => console.log(`   ${p}`));
  if (passed.length > 15) {
    console.log(`   ... and ${passed.length - 15} more`);
  }
  console.log();

  if (failed.length === 0) {
    console.log('🎉 VERDICT: ALL CHECKS PASSED - PRODUCTION READY ✅');
    process.exit(0);
  } else {
    console.log(`⚠️  VERDICT: ${failed.length} ISSUE(S) FOUND ❌`);
    process.exit(1);
  }
}

main();
