# `@nx/tauri-opener`

Centralized, validated URI opener that manages link flows between **UNICORN**,
**Obsidian**, and **Supabase** in a Tauri v2 desktop application.

---

## Overview

```
┌─────────────┐    unicorn://case/123    ┌──────────────────────┐
│  Obsidian   │ ────────────────────────▶│                      │
│  (deep link)│                          │  UNICORN (Tauri v2)  │
└─────────────┘                          │                      │
                                         │  tauri-opener        │
┌─────────────┐    obsidian://open?…     │  ──────────────────  │
│  intake.py  │ ◀───────────────────────│  • validate URI      │
│  (sidecar)  │                          │  • open via OS       │
└─────────────┘                          │                      │
                                         │                      │
┌─────────────┐    https://…supabase…   │                      │
│  Supabase   │ ◀───────────────────────│                      │
│  Dashboard  │                          └──────────────────────┘
└─────────────┘
```

**Key features**

| Feature | Description |
|---|---|
| **Deep-link handling** | Register `unicorn://` as a protocol handler so Obsidian can link back into the UNICORN app |
| **Secure outbound links** | All URIs are validated in Rust (backend) *and* TypeScript (frontend) before being handed off to the OS |
| **Supabase integration** | Opens Supabase dashboard URLs restricted to an allowlist of trusted hostnames |
| **Python sidecar** | `intake.py` can trigger any opener command over stdin/stdout when running as a Tauri sidecar |

---

## Supported URI formats

### Obsidian

```
obsidian://open?vault=<vault-name>&file=<note-path>
```

Opens a note inside Obsidian.  Both `vault` and `file` are URL-encoded and
validated before dispatch.

**Rules**
- `vault` – must be non-empty; only word characters, hyphens, spaces, and dots.
- `file`  – must not be empty or contain path-traversal sequences (`..`).

### UNICORN (deep-link)

```
unicorn://<resource>/<id>
```

Deep-links into a resource inside the UNICORN app.

**Rules**
- `resource` – must be one of: `case`, `note`, `task`, `report`.
- `id`       – must be non-empty; only alphanumeric characters, hyphens, and underscores.

### HTTPS (Supabase)

```
https://<supabase-hostname>/…
```

Opens a Supabase dashboard URL.

**Rules**
- Scheme must be `https`.
- Hostname must be on the allowlist: `supabase.co`, `supabase.io`, `app.supabase.com`
  (or any subdomain thereof, e.g. `my-project.supabase.co`).

---

## Where validation occurs

Validation is enforced in **three layers** to provide defence-in-depth:

1. **TypeScript** (`src/validation.ts`) – called by the front-end before
   invoking the Tauri command.  Fast, synchronous, co-located with UI code.

2. **Rust** (`src-tauri/src/opener.rs`) – called inside every `#[tauri::command]`
   handler.  Cannot be bypassed from the front-end.  Uses the same allow-lists.

3. **Python sidecar** (`scripts/intake.py`) – validates inputs before emitting
   the URI back to the Tauri host process.  Mirrors the same rules so that a
   compromised sidecar cannot forge a malicious URI.

---

## Installation

### TypeScript (front-end)

```ts
import { openObsidianNote, openUnicornResource, openSupabaseUrl } from '@nx/tauri-opener';

// Open a note in Obsidian
const result = await openObsidianNote('My Vault', 'cases/abc-123');

// Deep-link back into UNICORN
const result = await openUnicornResource('case', 'abc-123');

// Open a Supabase dashboard page
const result = await openSupabaseUrl('https://app.supabase.com/project/my-project');
```

### Rust (backend)

Register the commands in your `src-tauri/src/main.rs`:

```rust
mod opener; // or use the crate directly

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            opener::open_obsidian_note,
            opener::open_unicorn_resource,
            opener::open_supabase_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Add `urlencoding` to your `src-tauri/Cargo.toml`:

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
urlencoding = "2"
```

---

## Protocol registration (Tauri v2)

To register `unicorn://` as a system-wide protocol handler, add the following
to `src-tauri/tauri.conf.json`:

```json
{
  "plugins": {
    "deep-link": {
      "desktop": {
        "schemes": ["unicorn"]
      }
    }
  }
}
```

Add the plugin dependency:

```toml
# src-tauri/Cargo.toml
tauri-plugin-deep-link = "2"
```

Register the plugin and listen for incoming deep-links in Rust:

```rust
use tauri_plugin_deep_link::DeepLinkExt;

tauri::Builder::default()
    .plugin(tauri_plugin_deep_link::init())
    .setup(|app| {
        app.deep_link().on_open_url(|event| {
            // event.urls() contains the incoming unicorn:// URLs
            for url in event.urls() {
                println!("Received deep link: {url}");
                // Route to the appropriate screen in the front-end
            }
        });
        Ok(())
    })
    // …
```

---

## Python sidecar (`intake.py`)

`scripts/intake.py` is designed to run as a Tauri
[sidecar](https://v2.tauri.app/develop/sidecar/).

### Register in `tauri.conf.json`

```json
{
  "bundle": {
    "externalBin": ["binaries/intake"]
  }
}
```

### Invoke from Rust / front-end

```ts
import { Command } from '@tauri-apps/plugin-shell';

const sidecar = await Command.sidecar('binaries/intake');
const child  = await sidecar.spawn();

// Send a request
child.stdin.write(
  JSON.stringify({ scheme: 'obsidian', vault: 'My Vault', file: 'cases/abc-123' }) + '\n'
);

// Read the response
child.stdout.on('data', (line) => {
  const response = JSON.parse(line);
  console.log(response); // { success: true, uri: "obsidian://open?…" }
});
```

### Request format (newline-delimited JSON)

```json
{ "scheme": "obsidian", "vault": "My Vault", "file": "cases/abc-123" }
{ "scheme": "unicorn",  "resource": "case",  "id":   "abc-123"       }
{ "scheme": "https",    "url": "https://app.supabase.com/project/my-project" }
```

### Response format

```json
{ "success": true,  "uri": "obsidian://open?vault=My%20Vault&file=cases%2Fabc-123" }
{ "success": false, "error": "Invalid vault name …" }
```

---

## UNICORN ↔ Obsidian ↔ Supabase flow

```
[UNICORN UI]
    │
    │  openObsidianNote('My Vault', 'cases/abc-123')
    │
    ▼
[TypeScript validation]  ← buildObsidianUri()
    │  obsidian://open?vault=My%20Vault&file=cases%2Fabc-123
    │
    ▼
[Tauri command: open_obsidian_note]  ← Rust validation
    │  shell::open(uri)
    ▼
[OS / Obsidian]  opens the note

─────────────────────────────────────────────────

[Obsidian]  user clicks unicorn://case/abc-123
    │
    ▼
[OS] launches UNICORN via registered protocol handler
    │
    ▼
[UNICORN]  deep-link://new-url event received
    │  route to case detail screen
    ▼
[UNICORN UI]  fetch case from Supabase using case ID

─────────────────────────────────────────────────

[UNICORN UI]
    │
    │  openSupabaseUrl('https://app.supabase.com/project/my-project')
    │
    ▼
[TypeScript + Rust validation]
    │
    ▼
[OS / browser]  opens Supabase dashboard
```

---

## Running the tests

### TypeScript

```bash
pnpm nx test tauri-opener
```

### Python sidecar

```bash
cd packages/tauri-opener
python -m pytest scripts/test_intake.py -v
```

### Rust

```bash
cd packages/tauri-opener/src-tauri
cargo test
```

---

## Security notes

- **No `javascript:` or `data:` URIs are accepted.** Only the three schemes
  documented above are handled.
- **HTTPS hostname allow-list** prevents the opener from being used to navigate
  to attacker-controlled domains.
- **Path traversal** in Obsidian file paths is blocked at the validation layer.
- **Rust validation** runs server-side (inside the Tauri backend) and cannot be
  bypassed by a compromised front-end.

---

## License

MIT
