import type {
  HttpsLinkParams,
  LinkParams,
  ObsidianLinkParams,
  OpenResult,
  OpenerScheme,
  UnicornLinkParams,
} from './types';
import {
  buildHttpsUri,
  buildObsidianUri,
  buildUnicornUri,
} from './validation';

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isObsidianParams(params: LinkParams): params is ObsidianLinkParams {
  return 'vault' in params && 'file' in params;
}

function isUnicornParams(params: LinkParams): params is UnicornLinkParams {
  return 'resource' in params && 'id' in params;
}

function isHttpsParams(params: LinkParams): params is HttpsLinkParams {
  return 'url' in params;
}

// ---------------------------------------------------------------------------
// OS-level open primitive
// ---------------------------------------------------------------------------

/**
 * Platform-level function that dispatches a fully-validated URI to the OS.
 *
 * In a real Tauri v2 app this would call `@tauri-apps/plugin-opener` (or the
 * legacy `tauri.shell.open`).  In a Node.js / test environment we fall back to
 * a no-op so that the rest of the logic can be unit-tested without a Tauri
 * runtime.
 *
 * @internal – use {@link openLink} instead.
 */
export async function dispatchUri(uri: string): Promise<void> {
  if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
    // Tauri v2 runtime is present – use the official plugin.
    const { open } = await import('@tauri-apps/plugin-opener');
    await open(uri);
  } else if (typeof process !== 'undefined') {
    // Node.js / test environment – delegate to the `open` npm package if
    // available, otherwise just log.  This path is only hit during local dev
    // or CI testing; never in a production Tauri binary.
    try {
      const openModule = await import('open');
      const openFn =
        typeof openModule.default === 'function'
          ? openModule.default
          : (openModule as any).open;
      await openFn(uri);
    } catch {
      console.log(`[tauri-opener] would open: ${uri}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Opens a link from UNICORN to Obsidian, back to UNICORN itself, or to a
 * Supabase dashboard URL – in a type-safe, validated way.
 *
 * ## Supported schemes
 *
 * | Scheme     | Parameter shape     | Example URI produced                          |
 * |------------|---------------------|-----------------------------------------------|
 * | `obsidian` | `ObsidianLinkParams`| `obsidian://open?vault=My%20Vault&file=Note`  |
 * | `unicorn`  | `UnicornLinkParams` | `unicorn://case/abc-123`                      |
 * | `https`    | `HttpsLinkParams`   | `https://app.supabase.com/...`                |
 *
 * @param scheme  - The URI scheme to open.
 * @param params  - Validated link parameters matching the chosen scheme.
 * @returns An {@link OpenResult} describing success or failure.
 *
 * @example Opening an Obsidian note from UNICORN
 * ```ts
 * const result = await openLink('obsidian', { vault: 'UNICORN', file: 'cases/abc-123' });
 * ```
 *
 * @example Deep-linking back into UNICORN (e.g. from Obsidian or a sidecar)
 * ```ts
 * const result = await openLink('unicorn', { resource: 'case', id: 'abc-123' });
 * ```
 *
 * @example Opening a Supabase dashboard URL
 * ```ts
 * const result = await openLink('https', { url: 'https://app.supabase.com/project/my-project' });
 * ```
 */
export async function openLink(
  scheme: OpenerScheme,
  params: LinkParams
): Promise<OpenResult> {
  try {
    let uri: string;

    switch (scheme) {
      case 'obsidian': {
        if (!isObsidianParams(params)) {
          return { success: false, error: 'Expected ObsidianLinkParams for scheme "obsidian".' };
        }
        uri = buildObsidianUri(params);
        break;
      }
      case 'unicorn': {
        if (!isUnicornParams(params)) {
          return { success: false, error: 'Expected UnicornLinkParams for scheme "unicorn".' };
        }
        uri = buildUnicornUri(params);
        break;
      }
      case 'https': {
        if (!isHttpsParams(params)) {
          return { success: false, error: 'Expected HttpsLinkParams for scheme "https".' };
        }
        uri = buildHttpsUri(params);
        break;
      }
      default: {
        const exhaustive: never = scheme;
        return { success: false, error: `Unknown scheme "${exhaustive}".` };
      }
    }

    await dispatchUri(uri);
    return { success: true, uri };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Convenience wrapper – opens an Obsidian note from within UNICORN.
 *
 * @param vault - Obsidian vault name.
 * @param file  - Path of the note inside the vault.
 */
export async function openObsidianNote(
  vault: string,
  file: string
): Promise<OpenResult> {
  return openLink('obsidian', { vault, file });
}

/**
 * Convenience wrapper – deep-links back into the UNICORN app.
 *
 * @param resource - Resource type (e.g. `"case"`, `"note"`).
 * @param id       - Resource ID.
 */
export async function openUnicornResource(
  resource: string,
  id: string
): Promise<OpenResult> {
  return openLink('unicorn', { resource, id });
}

/**
 * Convenience wrapper – opens a Supabase dashboard URL.
 *
 * @param url - Full `https://` URL on a recognised Supabase hostname.
 */
export async function openSupabaseUrl(url: string): Promise<OpenResult> {
  return openLink('https', { url });
}
