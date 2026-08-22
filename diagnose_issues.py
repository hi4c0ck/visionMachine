#!/usr/bin/env python3
"""Diagnose VisionMachine build issues"""
import os
import sys

print("=" * 60)
print("VISIONMACHINE DIAGNOSTIC REPORT")
print("=" * 60)

# 1. Check source structure
print("\n[1] SOURCE STRUCTURE CHECK")
print("-" * 60)
base = r"D:\work\horizonsMachine\VisionMachine"

# Check if App.svelte is in wrong place
app_svelte_root = os.path.join(base, "App.svelte")
app_svelte_src = os.path.join(base, "src", "App.svelte")
print(f"App.svelte at root: {app_svelte_root} ({os.path.exists(app_svelte_root)})")
print(f"App.svelte at src/: {app_svelte_src} ({os.path.exists(app_svelte_src)})")

# Check tsconfig includes
tsconfig = os.path.join(base, "tsconfig.json")
if os.path.exists(tsconfig):
    with open(tsconfig, 'r') as f:
        content = f.read()
    print(f"\ntsconfig.json content (relevant parts):")
    for line in content.split('\n'):
        if 'include' in line or 'src' in line or 'svelte' in line.lower():
            print(f"  {line.strip()}")

# Check vite config
vite_config = os.path.join(base, "vite.config.ts")
if os.path.exists(vite_config):
    with open(vite_config, 'r') as f:
        content = f.read()
    print(f"\nvite.config.ts content:")
    print(content)

# Check main.ts entry point
main_ts = os.path.join(base, "main.ts")
if os.path.exists(main_ts):
    with open(main_ts, 'r') as f:
        content = f.read()
    print(f"\nmain.ts content:")
    print(content)

# 2. Check frontendDist configuration
print("\n[2] TAURI CONFIGURATION CHECK")
print("-" * 60)
tauri_conf = os.path.join(base, "src-tauri", "tauri.conf.json")
if os.path.exists(tauri_conf):
    import json
    with open(tauri_conf, 'r') as f:
        config = json.load(f)
    build = config.get('build', {})
    app = config.get('app', {})
    print(f"frontendDist: {build.get('frontendDist')}")
    print(f"devUrl: {build.get('devUrl')}")
    print(f"Expected dist folder: {os.path.join(base, build.get('frontendDist', '..'))}")
    
# 3. Check if dist folder has proper output
print("\n[3] BUILD OUTPUT CHECK")
print("-" * 60)
dist_folder = os.path.join(base, "dist")
public_folder = os.path.join(base, "public")
print(f"dist/ exists: {os.path.exists(dist_folder)}")
if os.path.exists(dist_folder):
    files = os.listdir(dist_folder)
    print(f"  Files in dist/: {files}")
    
print(f"\npublic/ exists: {os.path.exists(public_folder)}")
if os.path.exists(public_folder):
    files = os.listdir(public_folder)
    print(f"  Files in public/: {files}")

# 4. Check for svelte files
print("\n[4] SVELTE FILES CHECK")
print("-" * 60)
svelte_files = []
for root, dirs, files in os.walk(base):
    # Skip node_modules and target
    dirs[:] = [d for d in dirs if d not in ['node_modules', 'target', '.git']]
    for f in files:
        if f.endswith('.svelte'):
            svelte_files.append(os.path.join(root, f))

print(f"Found {len(svelte_files)} .svelte files:")
for sf in svelte_files[:10]:
    print(f"  {sf}")

# 5. Check vite entry point
print("\n[5] VITE ENTRY POINT CHECK")
print("-" * 60)
index_html = os.path.join(base, "index.html")
if os.path.exists(index_html):
    print(f"Root index.html exists: YES")
    with open(index_html, 'r') as f:
        content = f.read()
    has_script = '<script' in content
    print(f"  Contains script tag: {has_script}")
    has_app_div = 'id="app"' in content or "id='app'" in content
    print(f"  Contains div#app: {has_app_div}")
else:
    print(f"Root index.html exists: NO")
    
public_index = os.path.join(base, "public", "index.html")
if os.path.exists(public_index):
    print(f"\npublic/index.html exists: YES (this is what Tauri uses)")
    with open(public_index, 'r') as f:
        content = f.read()
    has_script = '<script' in content
    print(f"  Contains script tag: {has_script}")
    has_app_div = 'id="app"' in content or "id='app'" in content
    print(f"  Contains div#app: {has_app_div}")
    print(f"  Content preview (first 200 chars):")
    print(f"  {content[:200]}...")

print("\n" + "=" * 60)
print("DIAGNOSIS COMPLETE")
print("=" * 60)
