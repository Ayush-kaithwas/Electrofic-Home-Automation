#!/usr/bin/env python3
"""
AuraHome Local Web Server — PWA Edition
Hosts the React Smart Home Dashboard as a PWA on your local network.
Accessible on Mobile (iPhone/Android) and Laptops over Wi-Fi!
Service Worker requires HTTPS or localhost — use localhost on PC, or IP on phone.
"""

import http.server
import socketserver
import socket
import os
import sys

PORT = 8000

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

class PWAHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    # Additional MIME types for PWA
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.json': 'application/json',
        '.js':   'application/javascript',
        '.css':  'text/css',
        '.png':  'image/png',
        '.jpg':  'image/jpeg',
        '.webp': 'image/webp',
        '.svg':  'image/svg+xml',
        '.ico':  'image/x-icon',
        '':      'application/octet-stream',
    }

    def end_headers(self):
        # Enable CORS
        self.send_header("Access-Control-Allow-Origin", "*")

        # Service Worker must NOT be cached by HTTP
        if self.path.endswith("sw.js"):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Service-Worker-Allowed", "/")
        elif self.path.endswith("manifest.json"):
            self.send_header("Cache-Control", "no-cache")
        else:
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")

        super().end_headers()

    def log_message(self, format, *args):
        # Suppress favicon 404 spam
        if '404' in args[1] and 'favicon' in args[0]:
            return
        super().log_message(format, *args)

if __name__ == "__main__":
    web_dir = os.path.dirname(os.path.realpath(__file__))
    os.chdir(web_dir)

    local_ip = get_local_ip()

    print("=" * 64)
    print(" AuraHome PWA Smart Home Dashboard is LIVE!")
    print("=" * 64)
    print(f" On this PC/Laptop  : http://localhost:{PORT}")
    print(f" On your Mobile     : http://{local_ip}:{PORT}")
    print("=" * 64)
    print(" NOTE: PWA Service Worker works on localhost (PC).")
    print("       On mobile over Wi-Fi, SW requires HTTPS to register.")
    print("       App will still work without SW on mobile (no offline).")
    print(" Press Ctrl+C to stop the server.")
    print("=" * 64)

    sys.stdout.flush()

    with socketserver.TCPServer(("0.0.0.0", PORT), PWAHTTPRequestHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped gracefully.")

