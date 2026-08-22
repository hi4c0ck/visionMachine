# -*- coding: utf-8 -*-
"""Check the app render output"""
import urllib.request
import re

print("=== Checking App Render ===\n")

# Fetch the main page
resp = urllib.request.urlopen('http://localhost:1420/', timeout=5)
html = resp.read().decode('utf-8', errors='ignore')

print("HTML Content:")
print("-" * 50)
print(html)
print("-" * 50)

# Check for critical elements
issues = []

if 'data-theme' not in html:
    issues.append("Missing data-theme attribute")

if 'id="app"' not in html:
    issues.append("Missing app mount point")

if '<script' not in html:
    issues.append("No scripts found")

if '</head>' not in html:
    issues.append("Missing closing head tag")

if '<body>' not in html:
    issues.append("Missing body tag")

# Check CSS file
css_resp = urllib.request.urlopen('http://localhost:1420/css/design-system.css', timeout=5)
css = css_resp.read().decode('utf-8', errors='ignore')

print("\nCSS Content (first 500 chars):")
print(css[:500])

# Verify theme variables exist
theme_checks = [
    ('--bg-primary', 'Background primary'),
    ('--text-primary', 'Text primary'),
    ('--accent-primary', 'Accent primary'),
    (':root', ':root selector'),
    ('jetbrains-dark', 'JetBrains theme'),
]

print("\nTheme Variable Checks:")
for var, name in theme_checks:
    if var in css:
        print(f"[OK] {name} ({var})")
    else:
        print(f"[MISSING] {name} ({var})")

if issues:
    print("\n=== ISSUES FOUND ===")
    for issue in issues:
        print(f"- {issue}")
else:
    print("\n=== No critical issues found ===")

print("\n=== Done ===")
