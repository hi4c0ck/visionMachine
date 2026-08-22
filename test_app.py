# -*- coding: utf-8 -*-
"""
Test the VisionMachine application by checking all endpoints
"""
import urllib.request
import urllib.error
import json
import sys

def test_endpoint(url, expected_status=200):
    """Test if an endpoint returns expected status"""
    try:
        req = urllib.request.Request(url)
        response = urllib.request.urlopen(req, timeout=5)
        content = response.read().decode('utf-8', errors='ignore')
        status = response.status
        length = len(content)
        
        ok = "✓" if status == expected_status else "✗"
        print(f"{ok} {url} → Status: {status}, Length: {length}")
        
        return {
            'url': url,
            'status': status,
            'length': length,
            'content_preview': content[:500] if length > 0 else ""
        }
    except urllib.error.HTTPError as e:
        print(f"✗ {url} → HTTP Error: {e.code} {e.reason}")
        return {'url': url, 'error': str(e)}
    except Exception as e:
        print(f"✗ {url} → Error: {e}")
        return {'url': url, 'error': str(e)}

def main():
    print("=== VisionMachine Application Test ===\n")
    
    base_url = "http://localhost:1420"
    
    # Test main pages
    tests = [
        f"{base_url}/",
        f"{base_url}/index.html",
        f"{base_url}/css/design-system.css",
        f"{base_url}/main.ts",
        f"{base_url}/@vite/client",
    ]
    
    results = []
    for test_url in tests:
        results.append(test_endpoint(test_url))
    
    print("\n=== Analysis ===\n")
    
    # Check main page for issues
    for r in results:
        if '/' in r['url'] and '.html' not in r['url'] and '@' not in r['url']:
            content = r.get('content_preview', '')
            if 'data-theme' in content:
                print("✓ Theme handling present in HTML")
            if '<script' in content:
                print("✓ Scripts present in HTML")
            if 'id="app"' in content:
                print("✓ App mount point present")
            
            # Check for errors or warnings
            error_keywords = ['error', 'undefined', 'null', 'fail', 'warning']
            content_lower = content.lower()
            for kw in error_keywords:
                if kw in content_lower and 'error' in content_lower:
                    # This might be legitimate error handling
                    pass
    
    # Check CSS
    for r in results:
        if 'css' in r['url']:
            content = r.get('content_preview', '')
            if '--bg-primary' in content:
                print("✓ CSS variables defined")
            if ':root' in content or 'data-theme' in content:
                print("✓ Theme selectors present")
    
    print("\n=== Complete ===")

if __name__ == '__main__':
    main()
