import type {
  HttpsLinkParams,
  ObsidianLinkParams,
  UnicornLinkParams,
} from './types';

// ---------------------------------------------------------------------------
// Allowed-list regexes
// ---------------------------------------------------------------------------

/** Obsidian vault names must be non-empty and contain only safe characters. */
const SAFE_VAULT_REGEX = /^[\w .-]+$/;

/** File paths must not contain path-traversal sequences. */
const SAFE_FILE_REGEX = /^(?!.*\.\.)[\w/. -]+$/;

/** UNICORN resource types that are explicitly allowed. */
const ALLOWED_UNICORN_RESOURCES = new Set(['case', 'note', 'task', 'report']);

/** Resource IDs must be alphanumeric (UUIDs, slugs, numbers). */
const SAFE_ID_REGEX = /^[\w\-]+$/;

/** Only allow HTTPS with recognised Supabase / app hostnames. */
const ALLOWED_HTTPS_HOSTNAMES = new Set([
  'supabase.co',
  'supabase.io',
  'app.supabase.com',
]);

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

/**
 * Validates Obsidian link parameters and returns the safe `obsidian://` URI.
 *
 * @throws {Error} when any parameter fails validation.
 */
export function buildObsidianUri(params: ObsidianLinkParams): string {
  const { vault, file } = params;

  if (!vault || !SAFE_VAULT_REGEX.test(vault)) {
    throw new Error(
      `Invalid vault name "${vault}". Only word characters, hyphens, spaces, and dots are allowed.`
    );
  }
  if (!file || !SAFE_FILE_REGEX.test(file)) {
    throw new Error(
      `Invalid file path "${file}". Path traversal sequences and special characters are not allowed.`
    );
  }

  const encoded =
    `obsidian://open` +
    `?vault=${encodeURIComponent(vault)}` +
    `&file=${encodeURIComponent(file)}`;

  return encoded;
}

/**
 * Validates UNICORN deep-link parameters and returns the safe `unicorn://` URI.
 *
 * @throws {Error} when any parameter fails validation.
 */
export function buildUnicornUri(params: UnicornLinkParams): string {
  const { resource, id } = params;

  if (!ALLOWED_UNICORN_RESOURCES.has(resource)) {
    throw new Error(
      `Unknown UNICORN resource type "${resource}". Allowed: ${[...ALLOWED_UNICORN_RESOURCES].join(', ')}.`
    );
  }
  if (!id || !SAFE_ID_REGEX.test(id)) {
    throw new Error(
      `Invalid resource ID "${id}". Only alphanumeric characters, hyphens, and underscores are allowed.`
    );
  }

  return `unicorn://${resource}/${encodeURIComponent(id)}`;
}

/**
 * Validates an HTTPS URL and returns the safe URL string.
 * Only URLs with hostnames in the allow-list are accepted.
 *
 * @throws {Error} when the URL is invalid or the hostname is not allowed.
 */
export function buildHttpsUri(params: HttpsLinkParams): string {
  const { url } = params;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Malformed URL: "${url}".`);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`Only HTTPS URLs are allowed; received "${parsed.protocol}".`);
  }

  // Strip port from hostname for comparison
  const hostname = parsed.hostname.toLowerCase();
  const isAllowed = [...ALLOWED_HTTPS_HOSTNAMES].some(
    (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`)
  );

  if (!isAllowed) {
    throw new Error(
      `Hostname "${hostname}" is not in the allow-list. Allowed: ${[...ALLOWED_HTTPS_HOSTNAMES].join(', ')}.`
    );
  }

  return parsed.toString();
}
