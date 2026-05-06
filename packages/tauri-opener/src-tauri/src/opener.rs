//! # Tauri Opener – Rust Backend
//!
//! This module exposes Tauri commands that handle link opening between
//! **UNICORN**, **Obsidian**, and **Supabase**.  All inputs are validated in
//! Rust before the URI is handed off to the operating system, which gives
//! stronger security guarantees than doing validation exclusively in the
//! front-end JavaScript layer.
//!
//! ## Supported URI flows
//!
//! | Flow                         | URI format                                          |
//! |------------------------------|-----------------------------------------------------|
//! | UNICORN → Obsidian note      | `obsidian://open?vault=<vault>&file=<file>`         |
//! | UNICORN ← deep-link (from Obsidian) | `unicorn://<resource>/<id>`               |
//! | UNICORN → Supabase dashboard | `https://<supabase-host>/…`                         |
//! | Python sidecar → any        | via `intake.py` calling these commands over IPC     |
//!
//! ## Usage (Tauri v2)
//!
//! Register the commands in your `main.rs`:
//!
//! ```rust,ignore
//! use tauri_opener::{open_obsidian_note, open_unicorn_resource, open_supabase_url};
//!
//! fn main() {
//!     tauri::Builder::default()
//!         .plugin(tauri_plugin_opener::init())
//!         .invoke_handler(tauri::generate_handler![
//!             open_obsidian_note,
//!             open_unicorn_resource,
//!             open_supabase_url,
//!         ])
//!         .run(tauri::generate_context!())
//!         .expect("error while running tauri application");
//! }
//! ```
//!
//! ## Deep-link registration (Tauri v2 `tauri.conf.json`)
//!
//! ```json
//! {
//!   "plugins": {
//!     "deep-link": {
//!       "desktop": {
//!         "schemes": ["unicorn"]
//!       }
//!     }
//!   }
//! }
//! ```
//!
//! This registers `unicorn://` as a protocol handler on the operating system so
//! that clicking a `unicorn://case/abc-123` link from Obsidian (or any other
//! app) will launch / focus the UNICORN desktop app and emit a `deep-link://new-url`
//! event you can listen to in the front-end.

use std::collections::HashSet;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/// Characters allowed in vault names and file paths.
fn is_safe_path_char(c: char) -> bool {
    c.is_alphanumeric() || matches!(c, '-' | '_' | '.' | '/' | ' ')
}

/// Validate an Obsidian vault name.
fn validate_vault(vault: &str) -> Result<(), String> {
    if vault.is_empty() {
        return Err("Vault name must not be empty.".to_string());
    }
    if !vault.chars().all(|c| is_safe_path_char(c) && c != '/') {
        return Err(format!(
            "Vault name \"{vault}\" contains disallowed characters."
        ));
    }
    Ok(())
}

/// Validate an Obsidian file path (no path traversal).
fn validate_file(file: &str) -> Result<(), String> {
    if file.is_empty() {
        return Err("File path must not be empty.".to_string());
    }
    if file.contains("..") {
        return Err("File path must not contain path-traversal sequences.".to_string());
    }
    if !file.chars().all(is_safe_path_char) {
        return Err(format!(
            "File path \"{file}\" contains disallowed characters."
        ));
    }
    Ok(())
}

/// Allowed UNICORN resource types.
fn allowed_unicorn_resources() -> HashSet<&'static str> {
    ["case", "note", "task", "report"].iter().cloned().collect()
}

/// Validate a UNICORN resource type.
fn validate_unicorn_resource(resource: &str) -> Result<(), String> {
    let allowed = allowed_unicorn_resources();
    if !allowed.contains(resource) {
        return Err(format!(
            "Unknown UNICORN resource type \"{resource}\". Allowed: {}.",
            allowed
                .iter()
                .cloned()
                .collect::<Vec<_>>()
                .join(", ")
        ));
    }
    Ok(())
}

/// Validate a resource ID (alphanumeric + hyphens/underscores only).
fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty() {
        return Err("Resource ID must not be empty.".to_string());
    }
    if !id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
        return Err(format!(
            "Resource ID \"{id}\" contains disallowed characters."
        ));
    }
    Ok(())
}

/// Allowed Supabase/HTTPS hostnames.
fn allowed_https_hostnames() -> Vec<&'static str> {
    vec!["supabase.co", "supabase.io", "app.supabase.com"]
}

/// Validate an HTTPS URL (must be on the Supabase allow-list).
fn validate_https_url(url: &str) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err(format!(
            "Only HTTPS URLs are allowed; received \"{url}\"."
        ));
    }

    // Extract hostname (between "https://" and the first "/" or end).
    let after_scheme = &url["https://".len()..];
    let hostname = after_scheme
        .split('/')
        .next()
        .unwrap_or("")
        .split('?')
        .next()
        .unwrap_or("")
        .to_lowercase();

    let allowed = allowed_https_hostnames();
    let is_allowed = allowed
        .iter()
        .any(|&h| hostname == h || hostname.ends_with(&format!(".{h}")));

    if !is_allowed {
        return Err(format!(
            "Hostname \"{hostname}\" is not in the allow-list. Allowed: {}.",
            allowed.join(", ")
        ));
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Open an Obsidian note from inside UNICORN.
///
/// # Arguments
/// * `vault` – The Obsidian vault name.
/// * `file`  – The path of the note inside the vault.
///
/// # Errors
/// Returns a `String` error if validation fails or the OS refuses to open the URI.
#[tauri::command]
pub fn open_obsidian_note(
    vault: String,
    file: String,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    validate_vault(&vault)?;
    validate_file(&file)?;

    let uri = format!(
        "obsidian://open?vault={}&file={}",
        urlencoding::encode(&vault),
        urlencoding::encode(&file),
    );

    open_uri(&uri, &app_handle)?;

    Ok(uri)
}

/// Deep-link into a UNICORN resource (e.g. to handle an incoming `unicorn://` link).
///
/// # Arguments
/// * `resource` – Resource type (`"case"`, `"note"`, `"task"`, `"report"`).
/// * `id`       – Resource identifier.
///
/// # Errors
/// Returns a `String` error if validation fails or the OS refuses to open the URI.
#[tauri::command]
pub fn open_unicorn_resource(
    resource: String,
    id: String,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    validate_unicorn_resource(&resource)?;
    validate_id(&id)?;

    let uri = format!("unicorn://{}/{}", resource, urlencoding::encode(&id));

    open_uri(&uri, &app_handle)?;

    Ok(uri)
}

/// Open a Supabase dashboard URL from within UNICORN.
///
/// # Arguments
/// * `url` – Full `https://` URL on a recognised Supabase hostname.
///
/// # Errors
/// Returns a `String` error if validation fails or the OS refuses to open the URI.
#[tauri::command]
pub fn open_supabase_url(url: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    validate_https_url(&url)?;

    open_uri(&url, &app_handle)?;

    Ok(url)
}

// ---------------------------------------------------------------------------
// Internal open helper
// ---------------------------------------------------------------------------

/// Dispatch a pre-validated URI to the OS via the Tauri opener plugin.
fn open_uri(uri: &str, app_handle: &tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app_handle
        .opener()
        .open_url(uri, None::<&str>)
        .map_err(|e| format!("Failed to open \"{uri}\": {e}"))
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // --- vault validation ---

    #[test]
    fn valid_vault_name() {
        assert!(validate_vault("My Vault").is_ok());
        assert!(validate_vault("unicorn-vault_2024").is_ok());
    }

    #[test]
    fn empty_vault_is_rejected() {
        assert!(validate_vault("").is_err());
    }

    #[test]
    fn vault_with_path_separator_is_rejected() {
        assert!(validate_vault("vault/sub").is_err());
    }

    #[test]
    fn vault_with_script_injection_is_rejected() {
        assert!(validate_vault("<script>alert(1)</script>").is_err());
    }

    // --- file validation ---

    #[test]
    fn valid_file_path() {
        assert!(validate_file("cases/abc-123.md").is_ok());
        assert!(validate_file("notes/2024/daily.md").is_ok());
    }

    #[test]
    fn empty_file_is_rejected() {
        assert!(validate_file("").is_err());
    }

    #[test]
    fn path_traversal_is_rejected() {
        assert!(validate_file("../etc/passwd").is_err());
        assert!(validate_file("cases/../../secret").is_err());
    }

    // --- UNICORN resource validation ---

    #[test]
    fn valid_unicorn_resource() {
        for r in &["case", "note", "task", "report"] {
            assert!(validate_unicorn_resource(r).is_ok());
        }
    }

    #[test]
    fn unknown_unicorn_resource_is_rejected() {
        assert!(validate_unicorn_resource("admin").is_err());
        assert!(validate_unicorn_resource("").is_err());
    }

    // --- ID validation ---

    #[test]
    fn valid_ids() {
        assert!(validate_id("abc-123").is_ok());
        assert!(validate_id("UUID_456").is_ok());
    }

    #[test]
    fn empty_id_is_rejected() {
        assert!(validate_id("").is_err());
    }

    #[test]
    fn id_with_special_chars_is_rejected() {
        assert!(validate_id("abc 123").is_err());
        assert!(validate_id("id;drop").is_err());
    }

    // --- HTTPS URL validation ---

    #[test]
    fn valid_supabase_url() {
        assert!(validate_https_url("https://app.supabase.com/project/my-proj").is_ok());
        assert!(validate_https_url("https://supabase.co/dashboard").is_ok());
        assert!(validate_https_url("https://my-project.supabase.co/rest/v1/cases").is_ok());
    }

    #[test]
    fn http_url_is_rejected() {
        assert!(validate_https_url("http://app.supabase.com/project/x").is_err());
    }

    #[test]
    fn non_allowlisted_hostname_is_rejected() {
        assert!(validate_https_url("https://evil.com/steal").is_err());
        assert!(validate_https_url("https://not-supabase.co/path").is_err());
    }
}
