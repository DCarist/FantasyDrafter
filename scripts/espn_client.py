#!/usr/bin/env python3
"""Resilient ESPN API and Remote HTTP Client for Fantasy Drafter.

Handles network requests to ESPN's API gateway (site.api.espn.com) and other data sources.
Bypasses Akamai Edge 403 Forbidden blocks on wireless/public networks by:
1. Preferring the system's native `curl` binary (Windows Schannel / macOS / Linux native TLS)
   which matches manual browser/CLI connections and avoids OpenSSL TLS fingerprint mismatch.
2. Providing a multi-profile Python `urllib` fallback using legitimate mobile client signatures
   (ESPN iOS App, curl, OkHttp) that Akamai accepts over OpenSSL without triggering bot blocks.
3. Automatically handling gzip and deflate decompression.
4. Implementing exponential backoff retries and pacing to avoid burst rate limits.
"""

import gzip
import json
import os
import shutil
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
import zlib

# Ensure UTF-8 console output on Windows
if sys.platform == "win32":
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Fallback client profiles accepted by ESPN / Akamai gateway
CLIENT_PROFILES = [
    {
        "name": "espn_ios",
        "headers": {
            "User-Agent": "ESPN/7.20.0 (iPhone; iOS 17.5.1; Scale/3.00)",
            "Accept": "application/json, text/plain, */*",
            "Accept-Encoding": "gzip, deflate",
            "Connection": "keep-alive",
        },
    },
    {
        "name": "curl_client",
        "headers": {
            "User-Agent": "curl/8.4.0",
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate",
        },
    },
    {
        "name": "okhttp_android",
        "headers": {
            "User-Agent": "okhttp/4.12.0",
            "Accept": "application/json, text/plain, */*",
            "Accept-Encoding": "gzip, deflate",
        },
    },
]


def find_curl():
    """Locate system curl binary."""
    c = shutil.which("curl") or shutil.which("curl.exe")
    if c:
        return c
    # Check default Windows location
    if sys.platform == "win32":
        default_win_curl = os.path.join(
            os.environ.get("SystemRoot", r"C:\Windows"), "System32", "curl.exe"
        )
        if os.path.exists(default_win_curl):
            return default_win_curl
    return None


def fetch_with_curl(url, timeout=15):
    """Fetch URL using system curl binary."""
    curl_path = find_curl()
    if not curl_path:
        return None, "curl not available"

    cmd = [
        curl_path,
        "-s",
        "-f",
        "-L",
        "--compressed",
        "--max-time",
        str(timeout),
        "-H",
        "Accept: application/json, text/plain, */*",
        url,
    ]

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if proc.returncode == 0 and proc.stdout:
            return proc.stdout, None
        err_detail = proc.stderr.strip() or f"exit code {proc.returncode}"
        return None, f"curl failed: {err_detail}"
    except Exception as e:
        return None, f"curl exception: {e}"


def _decompress_response(raw_bytes, encoding_header):
    """Decompress gzip or deflate raw response bytes."""
    enc = (encoding_header or "").lower().strip()
    if "gzip" in enc:
        try:
            return gzip.decompress(raw_bytes)
        except Exception:
            pass
    elif "deflate" in enc:
        try:
            return zlib.decompress(raw_bytes)
        except Exception:
            try:
                return zlib.decompress(raw_bytes, -zlib.MAX_WBITS)
            except Exception:
                pass
    return raw_bytes


def fetch_with_urllib(url, timeout=15, profile=None):
    """Fetch URL using Python urllib with an explicit client profile."""
    headers = profile["headers"] if profile else CLIENT_PROFILES[0]["headers"]
    req = urllib.request.Request(url, headers=headers)

    # Standard TLS context with fallback if corporate captive portal issues self-signed cert
    try:
        ctx = ssl.create_default_context()
    except Exception:
        ctx = None

    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as res:
            raw = res.read()
            encoding = res.info().get("Content-Encoding", "")
            data_bytes = _decompress_response(raw, encoding)
            return data_bytes.decode("utf-8", errors="replace"), None
    except urllib.error.HTTPError as e:
        return None, f"HTTP Error {e.code}: {e.reason}"
    except urllib.error.URLError as e:
        # If certificate verification failed, attempt with unverified context as last resort
        if "CERTIFICATE_VERIFY_FAILED" in str(e):
            try:
                unverified_ctx = ssl._create_unverified_context()
                with urllib.request.urlopen(
                    req, timeout=timeout, context=unverified_ctx
                ) as res:
                    raw = res.read()
                    encoding = res.info().get("Content-Encoding", "")
                    data_bytes = _decompress_response(raw, encoding)
                    return data_bytes.decode("utf-8", errors="replace"), None
            except Exception as retry_err:
                return None, f"URLError (TLS fallback): {retry_err}"
        return None, f"URLError: {e.reason}"
    except Exception as e:
        return None, f"Exception: {e}"


def fetch_espn_text(
    url, timeout=15, retries=2, backoff=0.6, delay_before=0.0, verbose=False
):
    """Fetch text from ESPN API using curl with urllib fallback and retry logic."""
    if delay_before > 0:
        time.sleep(delay_before)

    last_error = None

    # Strategy 1: System curl (highest success rate against Akamai Bot Manager)
    text, err = fetch_with_curl(url, timeout=timeout)
    if text is not None:
        return text
    last_error = err
    if verbose:
        print(f"curl transport failed ({err}), falling back to urllib...")

    # Strategy 2: Python urllib trying client profiles in sequence
    for attempt in range(retries + 1):
        for profile in CLIENT_PROFILES:
            text, err = fetch_with_urllib(url, timeout=timeout, profile=profile)
            if text is not None:
                return text
            last_error = err

        if attempt < retries:
            sleep_time = backoff * (attempt + 1)
            time.sleep(sleep_time)

    raise RuntimeError(f"Failed to fetch {url}: {last_error}")


def fetch_espn_json(
    url, timeout=15, retries=2, backoff=0.6, delay_before=0.0, verbose=False
):
    """Fetch and parse JSON from ESPN API with complete resilience."""
    text = fetch_espn_text(
        url,
        timeout=timeout,
        retries=retries,
        backoff=backoff,
        delay_before=delay_before,
        verbose=verbose,
    )
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        snippet = text[:200] if text else "<empty>"
        raise ValueError(f"Invalid JSON received from {url}: {e} (body: {snippet})")


if __name__ == "__main__":
    test_url = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries"
    print("Testing ESPN Client on:", test_url)
    try:
        data = fetch_espn_json(test_url, verbose=True)
        injuries = data.get("injuries", [])
        print(f"✅ Success! Received {len(injuries)} team injury reports.")
    except Exception as ex:
        print(f"❌ Error: {ex}")
        sys.exit(1)
