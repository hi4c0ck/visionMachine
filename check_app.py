# -*- coding: utf-8 -*-
import os
import json
import sys

# Check if dev server is running
import urllib.request

def check_port():
    import socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(('127.0.0.1', 1420))
    sock.close()
    return result == 0

print(f"Port 1420 listening: {check_port()}")

# Read and analyze main files
files_to_check = [
    'index.html',
    'App.svelte',
    'main.ts',
    'src-tauri/src/lib.rs',
    'src-tauri/Cargo.toml',
    'css/design-system.css'
]

for f in files_to_check:
    path = os.path.join(os.getcwd(), f)
    if os.path.exists(path):
        print(f"\n=== {f} ===")
        with open(path, 'r', encoding='utf-8') as file:
            content = file.read()
            # Look for potential issues
            lines = content.split('\n')
            for i, line in enumerate(lines[:50], 1):  # First 50 lines
                # Check for obvious errors
                if any(keyword in line.lower() for keyword in ['error', 'undefined', 'null', 'fail']):
                    print(f"Line {i}: {line.strip()}")
    else:
        print(f"\n=== {f} === MISSING")

# Check if app can be fetched
print("\n=== HTTP Check ===")
try:
    response = urllib.request.urlopen('http://localhost:1420/')
    html = response.read().decode('utf-8')
    print(f"HTTP Status: {response.status}")
    print(f"HTML length: {len(html)}")
    
    # Check for theme attribute
    if 'data-theme' in html:
        print("Theme attribute found in HTML")
    else:
        print("WARNING: No data-theme attribute in HTML!")
        
    # Check for scripts
    if '<script' in html:
        print("Scripts found")
    else:
        print("WARNING: No scripts found!")
        
except Exception as e:
    print(f"Error fetching app: {e}")
