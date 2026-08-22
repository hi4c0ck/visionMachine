#!/usr/bin/env python3
"""Debug the VisionMachine build and runtime"""
import os
import json
import sys

print("=" * 70)
print("VISIONMACHINE DEBUG REPORT")
print("=" * 70)

base = r'D:\work\horizonsMachine\VisionMachine'

# 1. Check build outputs
print("\n[1] BUILD OUTPUT ANALYSIS")
print("-" * 70)

dist = os.path.join(base, 'dist')
if os.path.exists(dist):
    print(f"Dist folder exists: YES")
    for root, dirs, files in os.walk(dist):
        level = root.replace(dist, '').count(os.sep)
        indent = ' ' * 2 * level
        print(f"{indent}{os.path.basename(root)}/")
        subindent = ' ' * 2 * (level + 1)
        for f in files:
            size = os.path.getsize(os.path.join(root, f))
            print(f"{subindent}{f} ({size:,} bytes)")
else:
    print(f"Dist folder exists: NO")

# 2. Check tauri config
print("\n[2] TAURI CONFIGURATION")
print("-" * 70)
tauri_conf = os.path.join(base, 'src-tauri', 'tauri.conf.json')
if os.path.exists(tauri_conf):
    with open(tauri_conf, 'r') as f:
        config = json.load(f)
    build = config.get('build', {})
    print(f"frontendDist: {build.get('frontendDist')}")
    print(f"devUrl: {build.get('devUrl')}")
    
    expected_dist = os.path.normpath(os.path.join(base, build.get('frontendDist', '')))
    print(f"Expected dist path: {expected_dist}")
    print(f"Path exists: {os.path.exists(expected_dist)}")
    
    # Check what's in frontendDist
    if os.path.exists(expected_dist):
        print(f"Contents of frontendDist:")
        for f in os.listdir(expected_dist):
            print(f"  - {f}")

# 3. Check index.html content
print("\n[3] INDEX.HTML FILES CHECK")
print("-" * 70)

index_files = [
    os.path.join(base, 'index.html'),
    os.path.join(base, 'public', 'index.html'),
    os.path.join(dist, 'index.html') if os.path.exists(dist) else None
]

for idx_file in index_files:
    if idx_file and os.path.exists(idx_file):
        print(f"\nFile: {idx_file}")
        with open(idx_file, 'r', encoding='utf-8') as f:
            content = f.read()
        print(f"  Size: {len(content)} chars")
        has_app = 'id="app"' in content or "id='app'" in content
        print(f"  Has div#app: {has_app}")
        print(f"  Has script tag: {'<script' in content}")
        print(f"  Script src: ", end='')
        import re
        scripts = re.findall(r'src=["\'](.*?)["\']', content)
        for s in scripts:
            print(f"\n    - {s}")
        
        # Check for asset references
        js_refs = re.findall(r'assets/[a-z0-9-]+\.js', content)
        css_refs = re.findall(r'assets/[a-z0-9-]+\.css', content)
        print(f"  JS asset refs: {js_refs}")
        print(f"  CSS asset refs: {css_refs}")

# 4. Check for compiled JS
print("\n[4] COMPILED ASSETS CHECK")
print("-" * 70)
assets_dir = os.path.join(dist, 'assets') if os.path.exists(dist) else None
if assets_dir and os.path.exists(assets_dir):
    print(f"Assets directory exists: YES")
    js_files = [f for f in os.listdir(assets_dir) if f.endswith('.js')]
    print(f"JS files: {js_files}")
    for jf in js_files:
        path = os.path.join(assets_dir, jf)
        size = os.path.getsize(path)
        print(f"  {jf}: {size:,} bytes")
        if 'index' in jf or 'app' in jf:
            print(f"    Content preview:")
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                preview = f.read()[:500]
                print(f"    {preview[:200]}...")
else:
    print(f"Assets directory: NO")

# 5. Check source structure
print("\n[5] SOURCE STRUCTURE")
print("-" * 70)
src_app = os.path.join(base, 'src', 'App.svelte')
src_main = os.path.join(base, 'src', 'main.ts')
root_app = os.path.join(base, 'App.svelte')
root_main = os.path.join(base, 'main.ts')

print(f"src/App.svelte exists: {os.path.exists(src_app)}")
print(f"src/main.ts exists: {os.path.exists(src_main)}")
print(f"App.svelte at root: {os.path.exists(root_app)}")
print(f"main.ts at root: {os.path.exists(root_main)}")

if os.path.exists(src_main):
    with open(src_main, 'r', encoding='utf-8') as f:
        content = f.read()
    print(f"\nsrc/main.ts content:")
    for line in content.split('\n')[:10]:
        print(f"  {line}")

# 6. Check vite.config
print("\n[6] VITE CONFIGURATION")
print("-" * 70)
vite_conf = os.path.join(base, 'vite.config.ts')
if os.path.exists(vite_conf):
    with open(vite_conf, 'r', encoding='utf-8') as f:
        content = f.read()
    print("Plugins:", 'svelte' in content)
    print("Build outDir:", 'outDir' in content)
    if 'outDir' in content:
        import re
        match = re.search(r"outDir:\s*['\"]([^'\"]+)['\"]", content)
        if match:
            print(f"  outDir value: {match.group(1)}")

print("\n" + "=" * 70)
