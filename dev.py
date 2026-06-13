#!/usr/bin/env python3
"""
Designed to Thrive - one-command local test.

Run from the project root:
    python3 dev.py

Starts:
  - the chart API on http://127.0.0.1:8080
  - the static site on http://127.0.0.1:8000

Then open http://127.0.0.1:8000/chart.html in your browser.
Ctrl+C stops both cleanly.

First run installs Python deps automatically.
"""

import os
import sys
import subprocess
import signal
import time
import socket
import threading
import http.server
import socketserver
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
API_DIR = ROOT / "api"
SITE_DIR = ROOT
API_PORT = 8080
WEB_PORT = 8000


def port_free(p):
    s = socket.socket()
    try:
        s.bind(("127.0.0.1", p))
        return True
    except OSError:
        return False
    finally:
        s.close()


def ensure_python_deps():
    """Install api/requirements.txt if anything is missing."""
    print("[1/3] Checking Python dependencies...")
    try:
        import fastapi, uvicorn, swisseph, geopy, timezonefinder  # noqa: F401
        print("      already installed.")
        return
    except ImportError:
        pass
    print("      installing from api/requirements.txt (one-time setup)...")
    req = API_DIR / "requirements.txt"
    cmd = [sys.executable, "-m", "pip", "install", "-r", str(req)]
    # Try without --break-system-packages first, fall back if PEP 668 blocks us.
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0 and "externally-managed-environment" in (res.stderr or ""):
        print("      retrying with --break-system-packages (Python 3.12 PEP 668)")
        res = subprocess.run(cmd + ["--break-system-packages"], capture_output=True, text=True)
    if res.returncode != 0:
        print("      pip install failed. Run manually:")
        print(f"        {' '.join(cmd)}")
        print(res.stderr[-800:] if res.stderr else "")
        sys.exit(1)
    print("      done.")


def start_api(stop_event):
    """Run the FastAPI chart calculator in this process."""
    sys.path.insert(0, str(API_DIR))
    import uvicorn
    from main import app
    config = uvicorn.Config(app, host="127.0.0.1", port=API_PORT, log_level="warning")
    server = uvicorn.Server(config)

    def run():
        try:
            server.run()
        except Exception as e:
            print(f"[API] crashed: {e}")

    t = threading.Thread(target=run, daemon=True)
    t.start()

    # Wait for server to be ready
    for _ in range(40):
        if not port_free(API_PORT):
            return server, t
        time.sleep(0.1)
    return server, t


def start_web():
    """Serve the static site on WEB_PORT."""
    os.chdir(SITE_DIR)

    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a, **k):
            pass  # quiet

    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", WEB_PORT), Q)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd


def main():
    if not port_free(API_PORT):
        print(f"ERROR: port {API_PORT} is already in use. Free it or change API_PORT in dev.py.")
        sys.exit(1)
    if not port_free(WEB_PORT):
        print(f"ERROR: port {WEB_PORT} is already in use. Free it or change WEB_PORT in dev.py.")
        sys.exit(1)

    ensure_python_deps()

    print(f"[2/3] Starting chart API on http://127.0.0.1:{API_PORT} ...")
    stop = threading.Event()
    api_server, api_thread = start_api(stop)

    print(f"[3/3] Starting static site on http://127.0.0.1:{WEB_PORT} ...")
    httpd = start_web()

    print()
    print("=" * 56)
    print("  Local site running:")
    print(f"    http://127.0.0.1:{WEB_PORT}/chart.html")
    print()
    print("  Try filling the form. The page will auto-detect")
    print("  the local API. Ctrl+C here to stop everything.")
    print("=" * 56)
    print()

    def shutdown(signum, frame):
        print("\nShutting down...")
        try:
            api_server.should_exit = True
        except Exception:
            pass
        try:
            httpd.shutdown()
        except Exception:
            pass
        time.sleep(0.5)
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)
    while True:
        time.sleep(1)


if __name__ == "__main__":
    main()
