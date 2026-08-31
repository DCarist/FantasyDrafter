#!/usr/bin/env python3
"""
Fantasy Drafter — Local Server & Cross-Origin Live Sync Relay
Serves the web application and provides a real-time CORS-enabled relay bridge
between the ESPN Live Draft Room bookmarklet / extension and Fantasy Drafter.
Supports HTTP Fetch, Private Network Access (PNA), Image Beacons, SSE, and REST Polling.
"""

import http.server
import socket
import socketserver
import json
import time
import threading
import urllib.parse
import os
import sys
import argparse
import webbrowser
import datetime
import subprocess

# Force UTF-8 encoding on Windows console so emojis and special characters render cleanly
if sys.platform == "win32":
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def safe_print(msg):
    try:
        print(msg)
    except Exception:
        try:
            print(str(msg).encode("ascii", errors="replace").decode("ascii"))
        except Exception:
            pass


PORT = 8517

# Logging configuration: Persist all server and sync events to logs/last-run.log
LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
LAST_RUN_LOG = os.path.join(LOG_DIR, "last-run.log")
log_file_lock = threading.Lock()


def init_logging():
    try:
        if not os.path.exists(LOG_DIR):
            os.makedirs(LOG_DIR, exist_ok=True)
        with log_file_lock:
            with open(LAST_RUN_LOG, "w", encoding="utf-8") as f:
                now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                f.write("=" * 80 + "\n")
                f.write("Fantasy Drafter — Server & Sync Event Log\n")
                f.write(f"Session Started: {now_str} (Port {PORT})\n")
                f.write("=" * 80 + "\n\n")
    except Exception as e:
        safe_print(f"Warning: Could not initialize log file: {e}")


def log_event(msg, write_to_terminal=True):
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    formatted = f"[{now_str}] {msg}"
    try:
        if not os.path.exists(LOG_DIR):
            os.makedirs(LOG_DIR, exist_ok=True)
        with log_file_lock:
            with open(LAST_RUN_LOG, "a", encoding="utf-8") as f:
                f.write(formatted + "\n")
                f.flush()
    except Exception:
        pass

    if write_to_terminal:
        safe_print(msg)


# 1x1 Transparent GIF for Image Beacon transport
GIF_1X1 = b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"

# SVG Football Favicon
FAVICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🏈</text></svg>'.encode(
    "utf-8"
)

# In-memory sync state
sync_lock = threading.Lock()
last_espn_ping = 0
sync_events = []
latest_snapshot = []
latest_league_info = {}
sse_clients = []


class SyncRelayHandler(http.server.SimpleHTTPRequestHandler):
    def handle(self):
        try:
            super().handle()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            pass
        except socket.error as e:
            if getattr(e, "winerror", None) in (10053, 10054):
                pass
            else:
                raise
        except Exception:
            pass

    def finish(self):
        try:
            super().finish()
        except (
            ConnectionResetError,
            ConnectionAbortedError,
            BrokenPipeError,
            socket.error,
            Exception,
        ):
            pass

    def log_message(self, format, *args):
        # Suppress high-frequency polling, heartbeat, SSE stream, pick relay, snapshot, and log messages from raw HTTP terminal output
        req_line = str(args[0]) if args else ""
        if any(
            k in req_line
            for k in (
                "/api/sync/poll",
                "/api/sync/ping",
                "/api/sync/events",
                "/api/sync/pick",
                "/api/sync/snapshot",
                "/api/sync/log",
                "/favicon.ico",
            )
        ):
            return
        super().log_message(format, *args)

    def end_headers(self):
        # Allow cross-origin requests from any origin (e.g. fantasy.espn.com)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, X-Requested-With, Access-Control-Request-Private-Network",
        )
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        global last_espn_ping, latest_snapshot
        if self.path.startswith("/api/sync/log"):
            content_length = int(self.headers.get("Content-Length", 0))
            body = (
                self.rfile.read(content_length).decode("utf-8")
                if content_length > 0
                else "{}"
            )
            try:
                log_data = json.loads(body)
            except Exception:
                log_data = {}
            msg = log_data.get("message", "")
            if msg:
                log_event(f"📝 {msg}")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True}).encode("utf-8"))
            return

        if self.path.startswith("/api/sync/ping"):
            with sync_lock:
                last_espn_ping = time.time()
                broadcast_sse(
                    {
                        "type": "PONG",
                        "source": "espn",
                        "timestamp": int(last_espn_ping * 1000),
                    }
                )
            log_event(
                "🔌 Ping received from ESPN Live Sync extension",
                write_to_terminal=False,
            )
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                json.dumps(
                    {"ok": True, "pong": True, "timestamp": int(last_espn_ping * 1000)}
                ).encode("utf-8")
            )
            return

        if self.path.startswith("/api/sync/snapshot"):
            content_length = int(self.headers.get("Content-Length", 0))
            body = (
                self.rfile.read(content_length).decode("utf-8")
                if content_length > 0
                else "{}"
            )
            try:
                snap_data = json.loads(body)
            except Exception:
                snap_data = {}

            source = snap_data.get("source", "espn")
            picks = snap_data.get("picks", [])
            league_info = snap_data.get("leagueInfo") or snap_data.get("league_info") or {}
            with sync_lock:
                if source == "espn":
                    last_espn_ping = time.time()
                latest_snapshot = list(picks)
                if league_info:
                    latest_league_info = dict(league_info)
                snap_event = {
                    "type": "DRAFT_SNAPSHOT",
                    "source": source,
                    "picks": latest_snapshot,
                    "leagueInfo": latest_league_info,
                    "timestamp": int(time.time() * 1000),
                }
                broadcast_sse(snap_event)

            latest_desc = (
                f"#{picks[-1].get('overall', '?')} {picks[-1].get('name', '?')}"
                if picks
                else "empty"
            )
            teams_desc = f" ({latest_league_info['teams']} Teams)" if latest_league_info.get("teams") else ""
            log_event(
                f"📋 Draft Snapshot: {len(picks)} picks synced{teams_desc} (Latest: {latest_desc}) [{source.upper()}]"
            )

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                json.dumps({"ok": True, "count": len(picks)}).encode("utf-8")
            )
            return

        if self.path.startswith("/api/sync/pick"):
            content_length = int(self.headers.get("Content-Length", 0))
            body = (
                self.rfile.read(content_length).decode("utf-8")
                if content_length > 0
                else "{}"
            )
            try:
                pick_data = json.loads(body)
            except Exception:
                pick_data = {}

            # Handle snapshot embedded in /api/sync/pick
            if pick_data.get("type") == "DRAFT_SNAPSHOT" or "picks" in pick_data:
                source = pick_data.get("source", "espn")
                picks = pick_data.get("picks", [])
                league_info = pick_data.get("leagueInfo") or pick_data.get("league_info") or {}
                with sync_lock:
                    if source == "espn":
                        last_espn_ping = time.time()
                    latest_snapshot = list(picks)
                    if league_info:
                        latest_league_info = dict(league_info)
                    snap_event = {
                        "type": "DRAFT_SNAPSHOT",
                        "source": source,
                        "picks": latest_snapshot,
                        "leagueInfo": latest_league_info,
                        "timestamp": int(time.time() * 1000),
                    }
                    broadcast_sse(snap_event)
                latest_desc = (
                    f"#{picks[-1].get('overall', '?')} {picks[-1].get('name', '?')}"
                    if picks
                    else "empty"
                )
                teams_desc = f" ({latest_league_info['teams']} Teams)" if latest_league_info.get("teams") else ""
                log_event(
                    f"📋 Draft Snapshot: {len(picks)} picks synced{teams_desc} (Latest: {latest_desc}) [{source.upper()}]"
                )
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(
                    json.dumps({"ok": True, "count": len(picks)}).encode("utf-8")
                )
                return

            source = pick_data.get("source", "espn")
            with sync_lock:
                if source == "espn":
                    last_espn_ping = time.time()
                pick_event = {
                    "type": "PICK_MADE",
                    "source": source,
                    "name": pick_data.get("name", ""),
                    "overall": pick_data.get("overall", None),
                    "pos": pick_data.get("pos", ""),
                    "team": pick_data.get("team", ""),
                    "by": pick_data.get("by", ""),
                    "timestamp": int(time.time() * 1000),
                }
                sync_events.append(pick_event)
                if len(sync_events) > 100:
                    sync_events.pop(0)
                # Only broadcast to browser clients if pick originated externally (e.g. ESPN extension)
                if source == "espn":
                    broadcast_sse(pick_event)

            pick_num = (
                f"#{pick_event.get('overall')}" if pick_event.get("overall") else "Pick"
            )
            details = []
            if pick_event.get("pos"):
                details.append(pick_event["pos"])
            if pick_event.get("team"):
                details.append(pick_event["team"])
            detail_str = f" ({' - '.join(details)})" if details else ""
            by_str = f" · {pick_event['by']}" if pick_event.get("by") else ""
            source_tag = f" [{source.upper()}]" if source and source != "manual" else ""
            log_event(
                f"🏈 Pick {pick_num}: {pick_event.get('name')}{detail_str}{by_str}{source_tag}"
            )

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True}).encode("utf-8"))
            return

        self.send_error(404, "Endpoint not found")

    def do_GET(self):
        global last_espn_ping, latest_snapshot
        # Redirect root to draft-board.html
        if self.path == "/" or self.path == "":
            self.send_response(302)
            self.send_header("Location", "/draft-board.html")
            self.end_headers()
            return

        # Football Favicon handler
        if self.path == "/favicon.ico":
            self.send_response(200)
            self.send_header("Content-Type", "image/svg+xml")
            self.send_header("Cache-Control", "public, max-age=86400")
            self.end_headers()
            self.wfile.write(FAVICON_SVG)
            return

        # Handle Image Beacon / GET Ping, Snapshot & Pick (bypasses CORS & mixed-content preflights)
        if self.path.startswith("/api/sync/ping"):
            with sync_lock:
                last_espn_ping = time.time()
                broadcast_sse(
                    {
                        "type": "PONG",
                        "source": "espn",
                        "timestamp": int(last_espn_ping * 1000),
                    }
                )
            log_event(
                "🔌 Ping beacon received from ESPN Live Sync extension",
                write_to_terminal=False,
            )
            self.send_response(200)
            self.send_header("Content-Type", "image/gif")
            self.end_headers()
            self.wfile.write(GIF_1X1)
            return

        if self.path.startswith("/api/sync/snapshot"):
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            d_raw = params.get("d", ["{}"])[0]
            try:
                snap_data = json.loads(d_raw)
            except Exception:
                snap_data = {}

            source = snap_data.get("source", "espn")
            picks = snap_data.get("picks", [])
            with sync_lock:
                if source == "espn":
                    last_espn_ping = time.time()
                latest_snapshot = list(picks)
                snap_event = {
                    "type": "DRAFT_SNAPSHOT",
                    "source": source,
                    "picks": latest_snapshot,
                    "timestamp": int(time.time() * 1000),
                }
                broadcast_sse(snap_event)

            latest_desc = (
                f"#{picks[-1].get('overall', '?')} {picks[-1].get('name', '?')}"
                if picks
                else "empty"
            )
            log_event(
                f"📋 Draft Snapshot Beacon: {len(picks)} picks synced (Latest: {latest_desc}) [{source.upper()}]"
            )

            self.send_response(200)
            self.send_header("Content-Type", "image/gif")
            self.end_headers()
            self.wfile.write(GIF_1X1)
            return

        if self.path.startswith("/api/sync/pick"):
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            d_raw = params.get("d", ["{}"])[0]
            try:
                pick_data = json.loads(d_raw)
            except Exception:
                pick_data = {}

            if pick_data.get("type") == "DRAFT_SNAPSHOT" or "picks" in pick_data:
                source = pick_data.get("source", "espn")
                picks = pick_data.get("picks", [])
                with sync_lock:
                    if source == "espn":
                        last_espn_ping = time.time()
                    latest_snapshot = list(picks)
                    snap_event = {
                        "type": "DRAFT_SNAPSHOT",
                        "source": source,
                        "picks": latest_snapshot,
                        "timestamp": int(time.time() * 1000),
                    }
                    broadcast_sse(snap_event)
                latest_desc = (
                    f"#{picks[-1].get('overall', '?')} {picks[-1].get('name', '?')}"
                    if picks
                    else "empty"
                )
                log_event(
                    f"📋 Draft Snapshot Beacon: {len(picks)} picks synced (Latest: {latest_desc}) [{source.upper()}]"
                )
                self.send_response(200)
                self.send_header("Content-Type", "image/gif")
                self.end_headers()
                self.wfile.write(GIF_1X1)
                return

            source = pick_data.get("source", "espn")
            with sync_lock:
                if source == "espn":
                    last_espn_ping = time.time()
                pick_event = {
                    "type": "PICK_MADE",
                    "source": source,
                    "name": pick_data.get("name", ""),
                    "overall": pick_data.get("overall", None),
                    "pos": pick_data.get("pos", ""),
                    "team": pick_data.get("team", ""),
                    "by": pick_data.get("by", ""),
                    "timestamp": int(time.time() * 1000),
                }
                sync_events.append(pick_event)
                if len(sync_events) > 100:
                    sync_events.pop(0)
                if source == "espn":
                    broadcast_sse(pick_event)

            pick_num = (
                f"#{pick_event.get('overall')}" if pick_event.get("overall") else "Pick"
            )
            details = []
            if pick_event.get("pos"):
                details.append(pick_event["pos"])
            if pick_event.get("team"):
                details.append(pick_event["team"])
            detail_str = f" ({' - '.join(details)})" if details else ""
            by_str = f" · {pick_event['by']}" if pick_event.get("by") else ""
            source_tag = f" [{source.upper()}]" if source and source != "manual" else ""
            log_event(
                f"🏈 Pick {pick_num}: {pick_event.get('name')}{detail_str}{by_str}{source_tag}"
            )

            self.send_response(200)
            self.send_header("Content-Type", "image/gif")
            self.end_headers()
            self.wfile.write(GIF_1X1)
            return

        if self.path.startswith("/api/sync/status") or self.path.startswith(
            "/api/sync/poll"
        ):
            since = 0
            if "since=" in self.path:
                try:
                    since = int(self.path.split("since=")[1].split("&")[0])
                except Exception:
                    since = 0

            with sync_lock:
                is_connected = (
                    (time.time() - last_espn_ping) < 25 if last_espn_ping > 0 else False
                )
                new_picks = [e for e in sync_events if e.get("timestamp", 0) > since]
                status_payload = {
                    "espnConnected": is_connected,
                    "lastSeen": int(last_espn_ping * 1000)
                    if last_espn_ping > 0
                    else None,
                    "picks": new_picks,
                    "snapshot": latest_snapshot,
                    "leagueInfo": latest_league_info,
                    "serverTime": int(time.time() * 1000),
                }

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(status_payload).encode("utf-8"))
            return

        # Server-Sent Events (SSE) Stream
        if self.path.startswith("/api/sync/events"):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.end_headers()

            with sync_lock:
                sse_clients.append(self.wfile)
                is_connected = (
                    (time.time() - last_espn_ping) < 25 if last_espn_ping > 0 else False
                )
                init_msg = json.dumps(
                    {
                        "type": "SYNC_STATUS",
                        "espnConnected": is_connected,
                        "lastSeen": int(last_espn_ping * 1000)
                        if last_espn_ping > 0
                        else None,
                    }
                )

            try:
                self.wfile.write(f"data: {init_msg}\n\n".encode("utf-8"))
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


DIRECTORY = os.path.dirname(os.path.abspath(__file__))
if DIRECTORY:
    os.chdir(DIRECTORY)


def get_player_data_age():
    """Returns the age of player data in days (float) and the generated date string."""
    json_path = "players-data.json"
    js_path = "players-data.js"

    gen_date_str = None
    age_days = None

    # 1. Try reading the generated field from players-data.json
    if os.path.exists(json_path):
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                gen_date_str = data.get("generated")
                if gen_date_str:
                    gen_d = datetime.date.fromisoformat(gen_date_str)
                    age_days = (datetime.date.today() - gen_d).days
        except Exception:
            pass

    # 2. If no generated date found in JSON, check file modification time
    if age_days is None:
        target_file = (
            json_path
            if os.path.exists(json_path)
            else (js_path if os.path.exists(js_path) else None)
        )
        if target_file:
            mtime = os.path.getmtime(target_file)
            age_days = (time.time() - mtime) / 86400.0
            gen_date_str = datetime.date.fromtimestamp(mtime).isoformat()
        else:
            return float("inf"), None

    return age_days, gen_date_str


def ensure_player_data_fresh(max_days=2, force=False, skip=False):
    """Checks the age of player rankings and auto-updates them if older than max_days."""
    if skip:
        safe_print("⏭️  Skipping player data update check (--skip-update).\n")
        return

    age_days, gen_date = get_player_data_age()

    if force or age_days is None or age_days > max_days or age_days == float("inf"):
        reason = (
            "forced"
            if force
            else (
                "missing"
                if age_days == float("inf")
                else f"{age_days:.1f} days old (> {max_days} days)"
            )
        )
        safe_print(
            f"🔄 Player rankings data is {reason}. Running consensus update pipeline..."
        )

        try:
            cmd = [sys.executable, "update-rankings.py"]
            res = subprocess.run(cmd)
            if res.returncode == 0:
                safe_print("✅ Player rankings successfully updated!\n")
            else:
                safe_print(
                    f"⚠️  Rankings updater exited with code {res.returncode}. Continuing with existing data.\n"
                )
        except Exception as e:
            safe_print(
                f"⚠️  Could not update player data ({e}). Continuing with existing data.\n"
            )
    else:
        day_label = (
            "today"
            if age_days == 0
            else f"{int(age_days)} day{'s' if int(age_days) > 1 else ''} old"
        )
        safe_print(
            f"📊 Player data is up to date (generated: {gen_date}, {day_label}).\n"
        )


def broadcast_sse(event_data):
    msg = f"data: {json.dumps(event_data)}\n\n".encode("utf-8")
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

    def handle_error(self, request, client_address):
        # Suppress normal client socket teardown noise (e.g. browser page reloads, cancelled image beacons, closed tabs)
        exc_type, exc_val, _ = sys.exc_info()
        if exc_type in (
            ConnectionResetError,
            ConnectionAbortedError,
            BrokenPipeError,
        ) or (
            isinstance(exc_val, (ConnectionError, socket.error))
            and getattr(exc_val, "winerror", None) in (10053, 10054)
        ):
            return
        super().handle_error(request, client_address)


def main():
    parser = argparse.ArgumentParser(
        description="Fantasy Drafter — Local Server & Live Sync Relay"
    )
    parser.add_argument(
        "port_pos",
        nargs="?",
        type=int,
        default=None,
        help="Port to listen on (default: 8517)",
    )
    parser.add_argument(
        "-p", "--port", type=int, default=PORT, help="Port to listen on (default: 8517)"
    )
    parser.add_argument(
        "-n",
        "--no-browser",
        "--headless",
        action="store_true",
        help="Do not automatically open web browser on startup",
    )
    parser.add_argument(
        "-u",
        "--update",
        action="store_true",
        help="Force update player rankings data on startup",
    )
    parser.add_argument(
        "--skip-update",
        "--no-update",
        action="store_true",
        help="Skip automatic player data age check on startup",
    )
    parser.add_argument(
        "--max-age",
        type=int,
        default=2,
        help="Maximum allowed age of player data in days before auto-updating (default: 2)",
    )

    args = parser.parse_args()
    port = args.port_pos if args.port_pos is not None else args.port
    open_browser = not args.no_browser

    # Initialize persistent event log
    init_logging()

    # Check and update player rankings data if older than max_age days
    ensure_player_data_fresh(
        max_days=args.max_age, force=args.update, skip=args.skip_update
    )

    server_url = f"http://127.0.0.1:{port}/draft-board.html"
    relay_url = f"http://127.0.0.1:{port}/api/sync/"

    server = ThreadedHTTPServer(("0.0.0.0", port), SyncRelayHandler)
    log_event(f"==================================================================")
    log_event(f"🏈 Fantasy Drafter Server running at: {server_url}")
    log_event(f"⚡ Live Sync Relay active at: {relay_url}")
    log_event(f"📝 Event log persistent output saved to: {LAST_RUN_LOG}")
    if open_browser:
        log_event(f"🌐 Opening Fantasy Drafter in your default web browser...")
    log_event(f"⌨️  Press Ctrl+C to stop the server.")
    log_event(f"==================================================================")

    if open_browser:

        def _launch():
            time.sleep(0.5)
            try:
                webbrowser.open(server_url)
            except Exception as e:
                log_event(f"⚠️ Could not auto-launch browser: {e}")

        threading.Thread(target=_launch, daemon=True).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log_event("\nStopping server.")
        server.server_close()


if __name__ == "__main__":
    main()
