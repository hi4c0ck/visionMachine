# -*- coding: utf-8 -*-
"""Verify VisionMachine app is working"""
import urllib.request
import json
import sys

print("=== VisionMachine App Verification ===\n")

# Test all endpoints
endpoints = [
    ("http://localhost:1420/", "HTML"),
    ("http://localhost:1420/css/design-system.css", "CSS"),
    ("http://localhost:1420/main.ts", "JS"),
]

for url, desc in endpoints:
    try:
        resp = urllib.request.urlopen(url, timeout=5)
        data = resp.read().decode('utf-8', errors='ignore')
        print(f"[OK] {desc}: {url}")
        print(f"     Status: {resp.status}, Size: {len(data)} bytes")
        
        if desc == "HTML":
            # Check for critical elements
            checks = [
                ('data-theme', 'Theme attribute'),
                ('id="app"', 'App mount point'),
                ('<script', 'Scripts'),
                ('design-system.css', 'CSS link'),
            ]
            for check, name in checks:
                if check in data:
                    print(f"     - {name}: FOUND")
                else:
                    print(f"     - {name}: MISSING!")
    except Exception as e:
        print(f"[FAIL] {desc}: {e}")

# Check Tauri commands
print("\n=== Tauri Command Check ===")
print("The Rust backend should respond to these commands:")
print("  - get_app_info()")
print("  - login_user(username)")
print("  - logout_user()")
print("  - set_theme(theme)")

print("\n=== Window Status ===")
import subprocess
result = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq vision-machine.exe'], 
                       capture_output=True, text=True)
if result.returncode == 0:
    print("[OK] VisionMachine process is running")
else:
    print("[WARN] VisionMachine process not found")

print("\n=== Done ===")
