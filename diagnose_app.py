#!/usr/bin/env python3
"""Diagnostic tool for VisionMachine app issues"""
import os
import sys
import subprocess
import time
import json
from pathlib import Path

def check_file(path, description):
    """Check if a file exists and get its size"""
    exists = os.path.exists(path)
    size = os.path.getsize(path) if exists else 0
    status = "[OK]" if exists and size > 0 else "[MISS]"
    print(f"{status} {description}: {'EXISTS' if exists else 'MISSING'} ({size:,} bytes)")
    return exists, size

def main():
    base = Path(r'D:\work\horizonsMachine\VisionMachine')
    exe_path = base / 'src-tauri/target/release/vision-machine.exe'
    dist_path = base / 'dist'
    
    print("=" * 70)
    print("VISIONMACHINE DIAGNOSTIC REPORT")
    print("=" * 70)
    
    # Check executable
    print("\n[1] EXECUTABLE CHECK")
    print("-" * 70)
    exists, size = check_file(exe_path, "Executable")
    if exists:
        print(f"  Location: {exe_path}")
        print(f"  Size: {size:,} bytes ({size/1024/1024:.2f} MB)")
    
    # Check dist folder
    print("\n[2] FRONTEND ASSETS CHECK")
    print("-" * 70)
    dist_index = dist_path / 'index.html'
    dist_assets = dist_path / 'assets'
    
    exists, _ = check_file(dist_index, "index.html")
    if exists:
        with open(dist_index, 'r', encoding='utf-8') as f:
            html = f.read()
        print(f"  Content preview:")
        print(f"  {html[:300]}...")
        
        # Check for critical elements
        has_app_div = 'id="app"' in html
        has_script = '<script' in html
        has_css = '<link' in html and 'stylesheet' in html
        print(f"\n  Has div#app: {'[OK]' if has_app_div else '[X]'}")
        print(f"  Has script tag: {'[OK]' if has_script else '[X]'}")
        print(f"  Has CSS link: {'[OK]' if has_css else '[X]'}")
    
    if dist_assets.exists():
        print(f"\n  Assets directory contents:")
        for f in dist_assets.iterdir():
            if f.is_file():
                print(f"    - {f.name} ({f.stat().st_size:,} bytes)")
    else:
        print(f"\n  ✗ Assets directory MISSING")
    
    # Check Tauri config
    print("\n[3] TAURI CONFIGURATION CHECK")
    print("-" * 70)
    tauri_conf = base / 'src-tauri/tauri.conf.json'
    if tauri_conf.exists():
        with open(tauri_conf, 'r') as f:
            config = json.load(f)
        
        frontend_dist = config.get('build', {}).get('frontendDist', '')
        expected_dist = base / frontend_dist
        
        print(f"  frontendDist setting: {frontend_dist}")
        print(f"  Expected path: {expected_dist}")
        print(f"  Path exists: {'[OK]' if expected_dist.exists() else '[X]'}")
        
        # Verify the path points to correct location
        if expected_dist.exists():
            actual_files = list(expected_dist.glob('*'))
            print(f"  Files in frontendDist: {len(actual_files)}")
            for f in actual_files[:5]:
                print(f"    - {f.name}")
    
    # Check source files
    print("\n[4] SOURCE FILES CHECK")
    print("-" * 70)
    src_app = base / 'src/App.svelte'
    src_main = base / 'src/main.ts'
    
    exists, _ = check_file(src_app, "App.svelte")
    exists, _ = check_file(src_main, "main.ts")
    
    if src_app.exists():
        with open(src_app, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        print(f"  App.svelte: {len(lines)} lines")
    
    # Check package.json
    print("\n[5] PACKAGE.JSON CHECK")
    print("-" * 70)
    pkg_json = base / 'package.json'
    if pkg_json.exists():
        with open(pkg_json, 'r') as f:
            pkg = json.load(f)
        
        scripts = pkg.get('scripts', {})
        print(f"  Available scripts:")
        for name, cmd in list(scripts.items())[:5]:
            print(f"    - {name}: {cmd[:50]}...")
    
    # Check WebView2
    print("\n[6] WEBVIEW2 CHECK")
    print("-" * 70)
    try:
        result = subprocess.run(
            ['reg', 'query', r'HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{56EB18F8-B008-4CBD-B6D2-8C97FE7E9062}', '/v', 'pv'],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            print("✓ WebView2 is installed")
        else:
            print("✗ WebView2 registry key not found")
    except Exception as e:
        print(f"✗ Error checking WebView2: {e}")
    
    # Summary
    print("\n" + "=" * 70)
    print("DIAGNOSTIC COMPLETE")
    print("=" * 70)
    
    # Check for common issues
    issues = []
    if not exe_path.exists():
        issues.append("Executable not found - need to build")
    if not dist_index.exists():
        issues.append("dist/index.html missing - frontend not built")
    if dist_assets.exists():
        js_files = list(dist_assets.glob('*.js'))
        if not js_files:
            issues.append("No JS bundles found in dist/assets")
    
    if issues:
        print("\n⚠ ISSUES FOUND:")
        for issue in issues:
            print(f"  - {issue}")
    else:
        print("\n✓ All basic checks passed")
        print("\nNext steps:")
        print("  1. Run the app: start '' '" + str(exe_path) + "'")
        print("  2. Check browser DevTools (F12) for JS errors")
        print("  3. Verify WebView2 is working properly")

if __name__ == '__main__':
    main()
