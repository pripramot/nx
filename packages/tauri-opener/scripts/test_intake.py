"""Tests for intake.py sidecar validation and request handling."""

import sys
import os

# Allow importing intake.py from the scripts directory.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import pytest
import intake  # noqa: E402


# ---------------------------------------------------------------------------
# _build_obsidian_uri
# ---------------------------------------------------------------------------


class TestBuildObsidianUri:
    def test_valid_vault_and_file(self):
        uri = intake._build_obsidian_uri("My Vault", "cases/abc-123")
        assert uri == "obsidian://open?vault=My%20Vault&file=cases%2Fabc-123"

    def test_empty_vault_raises(self):
        with pytest.raises(ValueError, match="vault"):
            intake._build_obsidian_uri("", "note.md")

    def test_vault_with_script_raises(self):
        with pytest.raises(ValueError, match="vault"):
            intake._build_obsidian_uri("<script>", "note.md")

    def test_empty_file_raises(self):
        with pytest.raises(ValueError, match="file"):
            intake._build_obsidian_uri("My Vault", "")

    def test_path_traversal_raises(self):
        with pytest.raises(ValueError, match="file"):
            intake._build_obsidian_uri("My Vault", "../etc/passwd")


# ---------------------------------------------------------------------------
# _build_unicorn_uri
# ---------------------------------------------------------------------------


class TestBuildUnicornUri:
    def test_valid_case(self):
        uri = intake._build_unicorn_uri("case", "abc-123")
        assert uri == "unicorn://case/abc-123"

    def test_unknown_resource_raises(self):
        with pytest.raises(ValueError, match="resource"):
            intake._build_unicorn_uri("admin", "abc-123")

    def test_empty_id_raises(self):
        with pytest.raises(ValueError, match="ID"):
            intake._build_unicorn_uri("case", "")

    def test_id_with_spaces_raises(self):
        with pytest.raises(ValueError, match="ID"):
            intake._build_unicorn_uri("case", "abc 123")


# ---------------------------------------------------------------------------
# _build_https_uri
# ---------------------------------------------------------------------------


class TestBuildHttpsUri:
    def test_valid_supabase_url(self):
        url = "https://app.supabase.com/project/my-project"
        assert intake._build_https_uri(url) == url

    def test_subdomain_supabase_url(self):
        url = "https://my-project.supabase.co/rest/v1/cases"
        assert intake._build_https_uri(url) == url

    def test_http_raises(self):
        with pytest.raises(ValueError, match="HTTPS"):
            intake._build_https_uri("http://app.supabase.com/project/x")

    def test_non_allowlisted_hostname_raises(self):
        with pytest.raises(ValueError, match="allow-list"):
            intake._build_https_uri("https://evil.com/steal")


# ---------------------------------------------------------------------------
# handle_request
# ---------------------------------------------------------------------------


class TestHandleRequest:
    def test_obsidian_request(self):
        resp = intake.handle_request(
            {"scheme": "obsidian", "vault": "My Vault", "file": "cases/abc-123"}
        )
        assert resp["success"] is True
        assert resp["uri"].startswith("obsidian://open")

    def test_unicorn_request(self):
        resp = intake.handle_request(
            {"scheme": "unicorn", "resource": "case", "id": "abc-123"}
        )
        assert resp["success"] is True
        assert resp["uri"] == "unicorn://case/abc-123"

    def test_https_request(self):
        url = "https://app.supabase.com/project/my-project"
        resp = intake.handle_request({"scheme": "https", "url": url})
        assert resp["success"] is True
        assert resp["uri"] == url

    def test_unknown_scheme(self):
        resp = intake.handle_request({"scheme": "ftp", "url": "ftp://example.com"})
        assert resp["success"] is False
        assert "scheme" in resp["error"].lower()

    def test_invalid_vault_returns_error(self):
        resp = intake.handle_request(
            {"scheme": "obsidian", "vault": "", "file": "note.md"}
        )
        assert resp["success"] is False
        assert resp.get("error")
