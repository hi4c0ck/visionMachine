# -*- coding: utf-8 -*-
import os
import urllib.request

base = "http://localhost:1420"

endpoints = [
    "/",
    "/index.html",
    "/css/design-system.css",
    "/main.ts",
    "/@vite/client",
]

for ep in endpoints:
    url = base + ep
    try:
        resp = urllib.request.urlopen(url, timeout=5)
        data = resp.read().decode('utf-8', errors='ignore')
        status = resp.status
        print(f"[{status}] {ep} ({len(data)} bytes)")
        if ep == "/" and "data-theme" not in data:
            print("  WARNING: No data-theme attribute found!")
        if ep == "/" and "<script" not in data:
            print("  WARNING: No script tags found!")
    except Exception as e:
        print(f"[ERROR] {ep}: {e}")

# Check for running WebView process
import subprocess
try:
    result = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq msedgewebview2.exe'], 
                           capture_output=True, text=True, encoding='utf-8')
    if result.returncode == 0 and 'msedgewebview2.exe' in result.stdout:
        print("\nWebView2 process is running")
    else:
        print("\nWARNING: No WebView2 process running!")
except Exception as e:
    print(f"Could not check processes: {e}")
