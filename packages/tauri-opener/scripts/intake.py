#!/usr/bin/env python3
"""
intake.py — Tauri Opener sidecar script
========================================

This script acts as a Tauri *sidecar* that receives URI-open requests over
stdin (one JSON object per line) and forwards them to the host Tauri process
via stdout.

Tauri v2 sidecar docs:
  https://v2.tauri.app/develop/sidecar/

Expected stdin format (newline-delimited JSON)
-----------------------------------------------
  {"scheme": "obsidian", "vault": "My Vault", "file": "cases/abc-123"}
  {"scheme": "unicorn",  "resource": "case",   "id":   "abc-123"}
  {"scheme": "https",    "url": "https://app.supabase.com/project/my-proj"}

Each request is validated here in Python, then emitted on stdout as a JSON
response that the Tauri front-end / Rust backend can consume.

Exit codes
----------
  0 – ran successfully (processing loop exited normally via EOF)
  1 – fatal startup error
"""

from __future__ import annotations

import json
import re
import sys
from typing import Any

# ---------------------------------------------------------------------------
# Allow-lists (must mirror the Rust/TypeScript validation)
# ---------------------------------------------------------------------------

ALLOWED_UNICORN_RESOURCES = {"case", "note", "task", "report"}

ALLOWED_HTTPS_HOSTNAMES = {
    "supabase.co",
    "supabase.io",
    "app.supabase.com",
}

SAFE_VAULT_RE = re.compile(r"^[\w .-]+$")
SAFE_FILE_RE = re.compile(r"^(?!.*\.\.)[\w/. -]+$")
SAFE_ID_RE = re.compile(r"^[\w-]+$")


# ---------------------------------------------------------------------------
# Validators
# ---------------------------------------------------------------------------


def _validate_vault(vault: str) -> None:
    if not vault or not SAFE_VAULT_RE.match(vault):
        raise ValueError(
            f'Invalid vault name "{vault}". '
            "Only word characters, hyphens, spaces, and dots are allowed."
        )


def _validate_file(file: str) -> None:
    if not file or not SAFE_FILE_RE.match(file):
        raise ValueError(
            f'Invalid file path "{file}". '
            "Path traversal sequences and special characters are not allowed."
        )


def _validate_unicorn_resource(resource: str) -> None:
    if resource not in ALLOWED_UNICORN_RESOURCES:
        allowed = ", ".join(sorted(ALLOWED_UNICORN_RESOURCES))
        raise ValueError(
            f'Unknown UNICORN resource type "{resource}". Allowed: {allowed}.'
        )


def _validate_id(id_: str) -> None:
    if not id_ or not SAFE_ID_RE.match(id_):
        raise ValueError(
            f'Invalid resource ID "{id_}". '
            "Only alphanumeric characters, hyphens, and underscores are allowed."
        )


def _validate_https_url(url: str) -> None:
    from urllib.parse import urlparse

    if not url.startswith("https://"):
        raise ValueError(f'Only HTTPS URLs are allowed; received "{url}".')

    parsed = urlparse(url)
    hostname = (parsed.hostname or "").lower()
    is_allowed = any(
        hostname == h or hostname.endswith(f".{h}") for h in ALLOWED_HTTPS_HOSTNAMES
    )
    if not is_allowed:
        allowed = ", ".join(sorted(ALLOWED_HTTPS_HOSTNAMES))
        raise ValueError(
            f'Hostname "{hostname}" is not in the allow-list. Allowed: {allowed}.'
        )


# ---------------------------------------------------------------------------
# URI builders
# ---------------------------------------------------------------------------


def _build_obsidian_uri(vault: str, file: str) -> str:
    from urllib.parse import quote

    _validate_vault(vault)
    _validate_file(file)
    # Use safe='' to encode '/' as '%2F', matching encodeURIComponent behaviour.
    return f"obsidian://open?vault={quote(vault, safe='')}&file={quote(file, safe='')}"


def _build_unicorn_uri(resource: str, id_: str) -> str:
    from urllib.parse import quote

    _validate_unicorn_resource(resource)
    _validate_id(id_)
    return f"unicorn://{resource}/{quote(id_)}"


def _build_https_uri(url: str) -> str:
    _validate_https_url(url)
    return url


# ---------------------------------------------------------------------------
# Request handler
# ---------------------------------------------------------------------------


def handle_request(req: dict[str, Any]) -> dict[str, Any]:
    """
    Process a single request dictionary.

    Returns a response dict with keys ``success``, ``uri`` (on success), or
    ``error`` (on failure).
    """
    scheme = req.get("scheme", "")

    try:
        if scheme == "obsidian":
            vault = req.get("vault", "")
            file_ = req.get("file", "")
            uri = _build_obsidian_uri(vault, file_)
        elif scheme == "unicorn":
            resource = req.get("resource", "")
            id_ = req.get("id", "")
            uri = _build_unicorn_uri(resource, id_)
        elif scheme == "https":
            url = req.get("url", "")
            uri = _build_https_uri(url)
        else:
            return {"success": False, "error": f'Unknown scheme "{scheme}".'}

        return {"success": True, "uri": uri}

    except ValueError as exc:
        return {"success": False, "error": str(exc)}


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------


def main() -> int:
    """
    Read newline-delimited JSON from stdin; write responses to stdout.

    This is the entry point when running as a Tauri sidecar.  The Tauri
    process communicates via stdin/stdout using the ``sidecar`` API.
    """
    for raw_line in sys.stdin:
        raw_line = raw_line.strip()
        if not raw_line:
            continue

        try:
            request = json.loads(raw_line)
        except json.JSONDecodeError as exc:
            response = {"success": False, "error": f"JSON parse error: {exc}"}
        else:
            response = handle_request(request)

        # Emit the response as a single JSON line so the Tauri host can parse it.
        print(json.dumps(response), flush=True)

    return 0


if __name__ == "__main__":
    sys.exit(main())
