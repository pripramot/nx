/**
 * Supported URI schemes for the Tauri Opener.
 *
 * - `obsidian` – Opens a note inside Obsidian via the obsidian:// URI scheme.
 * - `unicorn`  – Deep-link into the UNICORN app (unicorn://…).
 * - `https`    – Generic HTTPS link (e.g. Supabase dashboard URLs).
 */
export type OpenerScheme = 'obsidian' | 'unicorn' | 'https';

/** Parameters required to open an Obsidian note. */
export interface ObsidianLinkParams {
  /** Name of the Obsidian vault to open. */
  vault: string;
  /** Path of the note file inside the vault (without leading slash). */
  file: string;
}

/** Parameters for a UNICORN deep-link. */
export interface UnicornLinkParams {
  /** Resource type, e.g. "case", "note", "task". */
  resource: string;
  /** Unique identifier of the resource. */
  id: string;
}

/** Parameters for a generic HTTPS link (used for Supabase, etc.). */
export interface HttpsLinkParams {
  /** Full HTTPS URL to open. */
  url: string;
}

/** Union type covering all supported link parameter shapes. */
export type LinkParams = ObsidianLinkParams | UnicornLinkParams | HttpsLinkParams;

/** Result returned by the opener after attempting to open a URI. */
export interface OpenResult {
  /** Whether the URI was opened successfully. */
  success: boolean;
  /** The final URI that was dispatched to the OS (populated on success). */
  uri?: string;
  /** Error message (populated on failure). */
  error?: string;
}
