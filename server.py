#!/usr/bin/env python3
"""
Fantasy Drafter — Local Server & Cross-Origin Live Sync Relay
Serves the web application and provides a real-time CORS-enabled relay bridge
between the ESPN Live Draft Room bookmarklet / extension and Fantasy Drafter.
Supports HTTP Fetch, Private Network Access (PNA), Image Beacons, SSE, and REST Polling.
"""

import http.server
import socketserver
import json
import time
import threading
import urllib.parse
import os
import sys

PORT = 8517

# 1x1 Transparent GIF for Image Beacon transport
GIF_1X1 = b'GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;'

# SVG Football Favicon
FAVICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🏈</text></svg>'.encode('utf-8')

# In-memory sync state
sync_lock = threading.Lock()
last_espn_ping = 0
sync_events = []
sse_clients = []

class SyncRelayHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress high-frequency polling, heartbeat, SSE stream, and favicon logs from terminal
        req_line = str(args[0]) if args else ''
        if any(k in req_line for k in ('/api/sync/poll', '/api/sync/ping', '/api/sync/events', '/favicon.ico')):
            return
        super().log_message(format, *args)

    def end_headers(self):
        # Allow cross-origin requests from any origin (e.g. fantasy.espn.com)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, Access-Control-Request-Private-Network')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        global last_espn_ping
        if self.path.startswith('/api/sync/ping'):
            with sync_lock:
                last_espn_ping = time.time()
                broadcast_sse({'type': 'PONG', 'source': 'espn', 'timestamp': int(last_espn_ping * 1000)})
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True, 'pong': True, 'timestamp': int(last_espn_ping * 1000)}).encode('utf-8'))
            return

        if self.path.startswith('/api/sync/pick'):
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
            try:
                pick_data = json.loads(body)
            except Exception:
                pick_data = {}

            with sync_lock:
                last_espn_ping = time.time()
                pick_event = {
                    'type': 'PICK_MADE',
                    'source': 'espn',
                    'name': pick_data.get('name', ''),
                    'overall': pick_data.get('overall', None),
                    'pos': pick_data.get('pos', ''),
                    'team': pick_data.get('team', ''),
                    'timestamp': int(time.time() * 1000)
                }
                sync_events.append(pick_event)
                if len(sync_events) > 100:
                    sync_events.pop(0)
                broadcast_sse(pick_event)

            pick_desc = f"#{pick_event.get('overall') or '?'} {pick_event.get('name')} ({pick_event.get('pos') or ''} - {pick_event.get('team') or ''})".strip()
            print(f"⚡ Live Pick Received: {pick_desc}")

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True}).encode('utf-8'))
            return

        self.send_error(404, 'Endpoint not found')

    def do_GET(self):
        global last_espn_ping
        # Redirect root to draft-board.html
        if self.path == '/' or self.path == '':
            self.send_response(302)
            self.send_header('Location', '/draft-board.html')
            self.end_headers()
            return

        # Football Favicon handler
        if self.path == '/favicon.ico':
            self.send_response(200)
            self.send_header('Content-Type', 'image/svg+xml')
            self.send_header('Cache-Control', 'public, max-age=86400')
            self.end_headers()
            self.wfile.write(FAVICON_SVG)
            return

        # Handle Image Beacon / GET Ping & Pick (bypasses CORS & mixed-content preflights)
        if self.path.startswith('/api/sync/ping'):
            with sync_lock:
                last_espn_ping = time.time()
                broadcast_sse({'type': 'PONG', 'source': 'espn', 'timestamp': int(last_espn_ping * 1000)})
            self.send_response(200)
            self.send_header('Content-Type', 'image/gif')
            self.end_headers()
            self.wfile.write(GIF_1X1)
            return

        if self.path.startswith('/api/sync/pick'):
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            d_raw = params.get('d', ['{}'])[0]
            try:
                pick_data = json.loads(d_raw)
            except Exception:
                pick_data = {}

            with sync_lock:
                last_espn_ping = time.time()
                pick_event = {
                    'type': 'PICK_MADE',
                    'source': 'espn',
                    'name': pick_data.get('name', ''),
                    'overall': pick_data.get('overall', None),
                    'pos': pick_data.get('pos', ''),
                    'team': pick_data.get('team', ''),
                    'timestamp': int(time.time() * 1000)
                }
                sync_events.append(pick_event)
                if len(sync_events) > 100:
                    sync_events.pop(0)
                broadcast_sse(pick_event)

            pick_desc = f"#{pick_event.get('overall') or '?'} {pick_event.get('name')} ({pick_event.get('pos') or ''} - {pick_event.get('team') or ''})".strip()
            print(f"⚡ Live Pick Received: {pick_desc}")

            self.send_response(200)
            self.send_header('Content-Type', 'image/gif')
            self.end_headers()
            self.wfile.write(GIF_1X1)
            return

        if self.path.startswith('/api/sync/status') or self.path.startswith('/api/sync/poll'):
            since = 0
            if 'since=' in self.path:
                try:
                    since = int(self.path.split('since=')[1].split('&')[0])
                except Exception:
                    since = 0

            with sync_lock:
                is_connected = (time.time() - last_espn_ping) < 25 if last_espn_ping > 0 else False
                new_picks = [e for e in sync_events if e.get('timestamp', 0) > since]
                status_payload = {
                    'espnConnected': is_connected,
                    'lastSeen': int(last_espn_ping * 1000) if last_espn_ping > 0 else None,
                    'picks': new_picks,
                    'serverTime': int(time.time() * 1000)
                }

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(status_payload).encode('utf-8'))
            return

        # Server-Sent Events (SSE) Stream
        if self.path.startswith('/api/sync/events'):
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.end_headers()

            with sync_lock:
                sse_clients.append(self.wfile)
                is_connected = (time.time() - last_espn_ping) < 25 if last_espn_ping > 0 else False
                init_msg = json.dumps({'type': 'SYNC_STATUS', 'espnConnected': is_connected, 'lastSeen': int(last_espn_ping * 1000) if last_espn_ping > 0 else None})
            
            try:
                self.wfile.write(f"data: {init_msg}\n\n".encode('utf-8'))
                self.wfile.flush()
                while True:
                    time.sleep(15)
                    self.wfile.write(b": keepalive\n\n")
                    self.wfile.flush()
            except Exception:
                with sync_lock:
                    if self.wfile in sse_clients:
                        sse_clients.remove(self.wfile)
            return

        # Serve regular static files
        super().do_GET()

import argparse
import webbrowser

DIRECTORY = os.path.dirname(os.path.abspath(__file__))
if DIRECTORY:
    os.chdir(DIRECTORY)

def broadcast_sse(event_data):
    msg = f"data: {json.dumps(event_data)}\n\n".encode('utf-8')
    dead_clients = []
    for client in sse_clients:
        try:
            client.write(msg)
            client.flush()
        except Exception:
            dead_clients.append(client)
    for d in dead_clients:
        if d in sse_clients:
            sse_clients.remove(d)

class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

def main():
    parser = argparse.ArgumentParser(description="Fantasy Drafter — Local Server & Live Sync Relay")
    parser.add_argument("port_pos", nargs="?", type=int, default=None, help="Port to listen on (default: 8517)")
    parser.add_argument("-p", "--port", type=int, default=PORT, help="Port to listen on (default: 8517)")
    parser.add_argument("-n", "--no-browser", "--headless", action="store_true", help="Do not automatically open web browser on startup")
    
    args = parser.parse_args()
    port = args.port_pos if args.port_pos is not None else args.port
    open_browser = not args.no_browser

    server_url = f"http://127.0.0.1:{port}/draft-board.html"
    relay_url = f"http://127.0.0.1:{port}/api/sync/"

    server = ThreadedHTTPServer(('0.0.0.0', port), SyncRelayHandler)
    print(f"==================================================================")
    print(f"🏈 Fantasy Drafter Server running at: {server_url}")
    print(f"⚡ Live Sync Relay active at: {relay_url}")
    if open_browser:
        print(f"🌐 Opening Fantasy Drafter in your default web browser...")
    print(f"⌨️  Press Ctrl+C to stop the server.")
    print(f"==================================================================")

    if open_browser:
        def _launch():
            time.sleep(0.5)
            try:
                webbrowser.open(server_url)
            except Exception as e:
                print(f"⚠️ Could not auto-launch browser: {e}")
        threading.Thread(target=_launch, daemon=True).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.")
        server.server_close()

if __name__ == '__main__':
    main()
