# -*- coding: utf-8 -*-
"""
Check WebView2 runtime status and basic diagnostics
"""
import subprocess
import os
import sys

print("=== WebView2 Runtime Check ===\n")

# Check if Edge/WebView2 is installed
edge_paths = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"),
    os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
]

for path in edge_paths:
    if os.path.exists(path):
        print(f"✓ Edge found at: {path}")
        break
else:
    print("✗ Edge not found in common locations")

# Check WebView2 runtime
webview_paths = [
    r"C:\Program Files (x86)\Microsoft\EdgeWebView\Application",
    r"C:\Program Files\Microsoft\EdgeWebView\Application",
]

for path in webview_paths:
    if os.path.exists(path):
        print(f"✓ WebView2 runtime dir: {path}")
        # List versions
        for item in os.listdir(path):
            print(f"  - Version: {item}")
            break

# Check if Tauri app process is running
print("\n=== Running Processes ===\n")
result = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq msedgewebview2.exe'], 
                       capture_output=True, text=True)
if "msedgewebview2.exe" in result.stdout:
    print("✓ WebView2 process is running")
else:
    print("✗ No WebView2 process found")

result = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq node.exe'], 
                       capture_output=True, text=True)
if "node.exe" in result.stdout:
    print("✓ Node.js process is running (Vite)")
else:
    print("✗ No Node.js process found")

# Check Rust toolchain
print("\n=== Rust Toolchain ===\n")
try:
    result = subprocess.run(['rustc', '--version'], capture_output=True, text=True)
    if result.returncode == 0:
        print(f"✓ Rust: {result.stdout.strip()}")
    else:
        print(f"✗ Rust check failed: {result.stderr}")
except FileNotFoundError:
    print("✗ rustc not found in PATH")

try:
    result = subprocess.run(['cargo', '--version'], capture_output=True, text=True)
    if result.returncode == 0:
        print(f"✓ Cargo: {result.stdout.strip()}")
    else:
        print(f"✗ Cargo check failed: {result.stderr}")
except FileNotFoundError:
    print("✗ cargo not found in PATH")
