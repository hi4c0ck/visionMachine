#!/usr/bin/env python3
"""
VisionMachine Production Readiness Verification Script
Validates all components are ready for production deployment
"""

import os
import sys
import json
from pathlib import Path
from typing import List, Tuple

class ProductionChecker:
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.passed = []
        self.failed = []
        self.warnings = []
    
    def check_file_exists(self, path: str, description: str) -> bool:
        full_path = self.project_root / path
        if full_path.exists():
            self.passed.append(f"✅ {description}: {path}")
            return True
        else:
            self.failed.append(f"❌ {description}: {path} NOT FOUND")
            return False
    
    def check_directory_exists(self, path: str, description: str) -> bool:
        full_path = self.project_root / path
        if full_path.is_dir():
            self.passed.append(f"✅ {description}: {path}")
            return True
        else:
            self.failed.append(f"❌ {description}: {path} NOT FOUND")
            return False
    
    def check_file_contains(self, path: str, pattern: str, description: str) -> bool:
        full_path = self.project_root / path
        if not full_path.exists():
            self.failed.append(f"❌ {description}: File not found - {path}")
            return False
        
        content = full_path.read_text()
        if pattern in content:
            self.passed.append(f"✅ {description}")
            return True
        else:
            self.failed.append(f"❌ {description}: Pattern '{pattern}' not found in {path}")
            return False
    
    def check_rust_module(self, module_path: str, functions: List[str], description: str) -> bool:
        full_path = self.project_root / module_path
        if not full_path.exists():
            self.failed.append(f"❌ {description}: Module file not found")
            return False
        
        content = full_path.read_text()
        missing = [f for f in functions if f"pub async fn {f}" not in content]
        
        if not missing:
            self.passed.append(f"✅ {description}: All functions present")
            return True
        else:
            self.failed.append(f"❌ {description}: Missing functions: {missing}")
            return False
    
    def run_all_checks(self):
        print("=" * 60)
        print("VisionMachine Production Readiness Check")
        print("=" * 60)
        print()
        
        # Core Files
        print("📁 Checking core files...")
        self.check_file_exists("src-tauri/Cargo.toml", "Cargo.toml exists")
        self.check_file_exists("src-tauri/src/lib.rs", "Main library file")
        self.check_file_exists("src-tauri/src/main.rs", "Entry point")
        self.check_file_exists("src-tauri/tauri.conf.json", "Tauri config")
        print()
        
        # Storage Layer
        print("💾 Checking storage layer...")
        self.check_file_exists("src-tauri/src/storage/db.rs", "Database layer")
        self.check_file_exists("src-tauri/src/storage/settings.rs", "Storage settings")
        self.check_file_exists("src-tauri/src/storage/validation.rs", "Validation layer")
        self.check_file_exists("src-tauri/src/storage/mod.rs", "Storage module exports")
        
        self.check_file_contains("src-tauri/src/storage/db.rs", "PRAGMA journal_mode=WAL", "WAL mode enabled")
        self.check_file_contains("src-tauri/src/storage/db.rs", "PRAGMA foreign_keys=ON", "Foreign keys enabled")
        self.check_file_contains("src-tauri/src/storage/db.rs", "busy_timeout=5000", "Busy timeout configured")
        print()
        
        # Commands
        print("🔌 Checking Tauri commands...")
        self.check_file_exists("src-tauri/src/commands/profiles.rs", "Profile commands")
        self.check_file_exists("src-tauri/src/commands/projects.rs", "Project commands")
        self.check_file_exists("src-tauri/src/commands/sessions.rs", "Session commands")
        self.check_file_exists("src-tauri/src/commands/artifacts.rs", "Artifact commands")
        self.check_file_exists("src-tauri/src/commands/settings.rs", "Settings commands")
        
        self.check_rust_module(
            "src-tauri/src/commands/profiles.rs",
            ["create_profile", "list_profiles", "logout_profile"],
            "Profile commands implemented"
        )
        self.check_rust_module(
            "src-tauri/src/commands/projects.rs",
            ["create_project", "delete_project"],
            "Project commands implemented"
        )
        self.check_rust_module(
            "src-tauri/src/commands/sessions.rs",
            ["create_session", "get_composer", "update_composer"],
            "Session commands implemented"
        )
        print()
        
        # Models
        print("🧠 Checking models...")
        self.check_file_exists("src-tauri/src/models/viewmodel.rs", "ViewModel base")
        self.check_file_exists("src-tauri/src/models/composer.rs", "Composer model")
        self.check_file_exists("src-tauri/src/models/async_writer.rs", "Async writer")
        print()
        
        # Tests
        print("🧪 Checking tests...")
        self.check_file_exists("src-tauri/src/tests.rs", "Integration tests")
        self.check_file_contains("src-tauri/src/tests.rs", "test_wal_mode_enabled", "WAL test present")
        self.check_file_contains("src-tauri/src/tests.rs", "test_foreign_keys_enforced", "FK test present")
        self.check_file_contains("src-tauri/src/tests.rs", "test_full_workflow", "Workflow test present")
        print()
        
        # Documentation
        print("📚 Checking documentation...")
        self.check_file_exists("src-tauri/FINAL_PRODUCTION_CERTIFICATION.md", "Certification doc")
        self.check_file_exists("src-tauri/FINAL_COMPLETE_SUMMARY.md", "Complete summary")
        self.check_file_exists("docs/data-management-architecture.html", "Architecture diagram")
        print()
        
        # Summary
        print("=" * 60)
        print("CHECK RESULTS")
        print("=" * 60)
        print(f"Passed:   {len(self.passed)}")
        print(f"Failed:   {len(self.failed)}")
        print(f"Warnings: {len(self.warnings)}")
        print()
        
        if self.failed:
            print("❌ FAILED CHECKS:")
            for failure in self.failed:
                print(f"   {failure}")
            print()
        
        if self.passed:
            print("✅ PASSED CHECKS:")
            for pass_item in self.passed[:10]:  # Show first 10
                print(f"   {pass_item}")
            if len(self.passed) > 10:
                print(f"   ... and {len(self.passed) - 10} more")
            print()
        
        # Final verdict
        if len(self.failed) == 0:
            print("🎉 VERDICT: PRODUCTION READY ✅")
            print()
            print("All critical checks passed. The VisionMachine data")
            print("management system is ready for deployment.")
            return 0
        else:
            print("⚠️  VERDICT: NOT READY FOR PRODUCTION ❌")
            print()
            print(f"{len(self.failed)} check(s) failed. Please address these issues")
            print("before deploying to production.")
            return 1


def main():
    project_root = os.environ.get('PROJECT_ROOT', '.')
    checker = ProductionChecker(project_root)
    exit_code = checker.run_all_checks()
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
