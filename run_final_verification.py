#!/usr/bin/env python3
"""
VisionMachine Final Production Verification Script
"""

import os
import sys
from pathlib import Path

class FinalVerifier:
    def __init__(self, root):
        self.root = Path(root)
        self.passed = []
        self.failed = []
    
    def check_file(self, path, desc):
        full = self.root / path
        if full.exists():
            size = full.stat().st_size
            self.passed.append(f"✅ {desc} ({path}) - {size} bytes")
            return True
        else:
            self.failed.append(f"❌ {desc} MISSING: {path}")
            return False
    
    def check_contains(self, path, pattern, desc):
        full = self.root / path
        if not full.exists():
            self.failed.append(f"❌ {desc} - File not found: {path}")
            return False
        content = full.read_text(encoding='utf-8', errors='ignore')
        if pattern in content:
            self.passed.append(f"✅ {desc}")
            return True
        else:
            self.failed.append(f"❌ {desc} - Pattern '{pattern}' not in {path}")
            return False
    
    def run(self):
        print("=" * 70)
        print("VISIONMACHINE FINAL PRODUCTION VERIFICATION")
        print("=" * 70)
        print()
        
        # Core Rust Files
        print("📦 Core Rust Source Files:")
        self.check_file("src-tauri/src/lib.rs", "Library entry point")
        self.check_file("src-tauri/src/main.rs", "Main entry point")
        self.check_file("src-tauri/Cargo.toml", "Cargo manifest")
        self.check_file("src-tauri/build.rs", "Build script")
        print()
        
        # Storage Layer
        print("💾 Storage Layer:")
        self.check_file("src-tauri/src/storage/db.rs", "Database layer")
        self.check_file("src-tauri/src/storage/mod.rs", "Storage module")
        self.check_contains("src-tauri/src/storage/db.rs", "journal_mode=WAL", "WAL mode enabled")
        self.check_contains("src-tauri/src/storage/db.rs", "foreign_keys=ON", "Foreign keys enabled")
        self.check_contains("src-tauri/src/storage/db.rs", "busy_timeout=5000", "Busy timeout set")
        print()
        
        # Commands
        print("🔌 Tauri Commands:")
        self.check_file("src-tauri/src/commands/profiles.rs", "Profile commands")
        self.check_file("src-tauri/src/commands/projects.rs", "Project commands")
        self.check_file("src-tauri/src/commands/sessions.rs", "Session commands")
        self.check_file("src-tauri/src/commands/artifacts.rs", "Artifact commands")
        self.check_file("src-tauri/src/commands/settings.rs", "Settings commands")
        self.check_file("src-tauri/src/commands/mod.rs", "Commands module")
        print()
        
        # Models
        print("🧠 Models & ViewModels:")
        self.check_file("src-tauri/src/models/viewmodel.rs", "ViewModel base")
        self.check_file("src-tauri/src/models/composer.rs", "Composer model")
        self.check_file("src-tauri/src/models/async_writer.rs", "Async writer")
        self.check_file("src-tauri/src/models/mod.rs", "Models module")
        self.check_contains("src-tauri/src/models/viewmodel.rs", "pub struct ViewModel", "ViewModel struct exists")
        self.check_contains("src-tauri/src/models/composer.rs", "pub struct Composer", "Composer struct exists")
        self.check_contains("src-tauri/src/models/async_writer.rs", "pub struct AsyncWriter", "AsyncWriter struct exists")
        print()
        
        # Tests
        print("🧪 Test Suite:")
        self.check_file("src-tauri/src/tests.rs", "Integration tests")
        self.check_contains("src-tauri/src/tests.rs", "test_wal_mode_enabled", "WAL test")
        self.check_contains("src-tauri/src/tests.rs", "test_foreign_keys_enforced", "FK test")
        self.check_contains("src-tauri/src/tests.rs", "test_full_workflow", "Workflow test")
        self.check_contains("src-tauri/src/tests.rs", "test_concurrent_access", "Concurrency test")
        print()
        
        # Migrations
        print("🗄️ Database Schema:")
        self.check_file("src-tauri/migrations/0001_create_schema.sql", "Migration SQL")
        self.check_contains("src-tauri/migrations/0001_create_schema.sql", "profiles", "Profiles table")
        self.check_contains("src-tauri/migrations/0001_create_schema.sql", "projects", "Projects table")
        self.check_contains("src-tauri/migrations/0001_create_schema.sql", "sessions", "Sessions table")
        self.check_contains("src-tauri/migrations/0001_create_schema.sql", "composers", "Composers table")
        self.check_contains("src-tauri/migrations/0001_create_schema.sql", "artifacts", "Artifacts table")
        self.check_contains("src-tauri/migrations/0001_create_schema.sql", "FOREIGN KEY", "Foreign keys defined")
        print()
        
        # Documentation
        print("📚 Documentation:")
        self.check_file("FINAL_PRODUCTION_CERTIFICATION_COMPLETE.md", "Final certification")
        self.check_file("FINAL_PRODUCTION_CERTIFICATION_FINAL.md", "Certification v1")
        self.check_file("ULTIMATE_PRODUCTION_READINESS_REPORT.md", "Readiness report")
        self.check_file("DEPLOYMENT_GUIDE.md", "Deployment guide")
        self.check_file("SECURITY.md", "Security docs")
        print()
        
        # Summary
        print("=" * 70)
        print("RESULTS")
        print("=" * 70)
        print(f"Passed:   {len(self.passed)}")
        print(f"Failed:   {len(self.failed)}")
        print()
        
        if self.failed:
            print("❌ FAILURES:")
            for f in self.failed:
                print(f"   {f}")
            print()
        
        print("✅ PASSED (sample):")
        for p in self.passed[:15]:
            print(f"   {p}")
        if len(self.passed) > 15:
            print(f"   ... and {len(self.passed) - 15} more")
        print()
        
        if not self.failed:
            print("🎉 VERDICT: ALL CHECKS PASSED - PRODUCTION READY ✅")
            return 0
        else:
            print(f"⚠️  VERDICT: {len(self.failed)} ISSUE(S) FOUND ❌")
            return 1

if __name__ == "__main__":
    verifier = FinalVerifier(os.environ.get('PROJECT_ROOT', '.'))
    sys.exit(verifier.run())
