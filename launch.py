"""
VisionMachine - Simple Launcher
Opens web app in browser or embedded WebView window
Usage: python launch.py
"""
import os
import sys
import webbrowser
import threading
from pathlib import Path

# Try to import pywebview for native window
try:
    import webview
    HAS_WEBVIEW = True
except ImportError:
    HAS_WEBVIEW = False

def get_frontend_path():
    """Get path to frontend dist"""
    frontend_dist = Path(__file__).parent / 'src' / 'frontend' / 'dist'
    if frontend_dist.exists():
        return frontend_dist
    # Fallback to source
    return Path(__file__).parent / 'src' / 'frontend'

def start_webserver(port=9876):
    """Start simple HTTP server for frontend"""
    import http.server
    import socketserver
    
    frontend_path = get_frontend_path()
    os.chdir(frontend_path)
    
    Handler = http.server.SimpleHTTPRequestHandler
    with socketserver.TCPServer(("", port), Handler) as httpd:
        print(f"Server running at http://localhost:{port}")
        httpd.serve_forever()

def open_in_browser(port=8080):
    """Open app in default browser"""
    url = f"http://localhost:{port}"
    webbrowser.open(url)
    return url

def open_in_webview(port=8080):
    """Open app in native WebView window"""
    if not HAS_WEBVIEW:
        print("PyWebView not installed. Install with: pip install pywebview")
        return None
    
    url = f"http://localhost:{port}"
    window = webview.create_window('VisionMachine', url, width=1280, height=800)
    webview.start()
    return window

def main():
    """Main entry point"""
    print("=" * 60)
    print("VISIONMACHINE - AI Video Generator")
    print("=" * 60)
    print()
    
    # Check if frontend exists
    frontend_path = get_frontend_path()
    if not frontend_path.exists():
        print("❌ Frontend not found. Run: npm install && npm run build")
        return 1
    
    # Determine mode
    mode = os.environ.get('VM_MODE', 'browser')
    port = int(os.environ.get('VM_PORT', '9876'))
    
    print(f"Mode: {mode}")
    print(f"Port: {port}")
    print()
    
    # Start server in background
    server_thread = threading.Thread(
        target=start_webserver,
        args=(port,),
        daemon=True
    )
    server_thread.start()
    
    # Small delay to let server start
    import time
    time.sleep(1)
    
    # Open app
    if mode == 'webview' and HAS_WEBVIEW:
        print("🌐 Opening in native window...")
        open_in_webview(port)
    else:
        print("🌐 Opening in browser...")
        url = open_in_browser(port)
        print(f"\n✅ App running at: {url}")
        print("Press Ctrl+C to stop")
        
        try:
            # Keep running
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n👋 Stopping...")
            return 0
    
    return 0

if __name__ == '__main__':
    sys.exit(main())
