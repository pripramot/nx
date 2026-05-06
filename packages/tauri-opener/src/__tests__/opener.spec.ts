import {
  buildHttpsUri,
  buildObsidianUri,
  buildUnicornUri,
} from '../validation';
import { openLink } from '../opener';

// ---------------------------------------------------------------------------
// buildObsidianUri
// ---------------------------------------------------------------------------

describe('buildObsidianUri', () => {
  it('returns a correctly encoded obsidian:// URI', () => {
    const uri = buildObsidianUri({ vault: 'My Vault', file: 'cases/abc-123' });
    expect(uri).toBe('obsidian://open?vault=My%20Vault&file=cases%2Fabc-123');
  });

  it('throws for an empty vault name', () => {
    expect(() => buildObsidianUri({ vault: '', file: 'note.md' })).toThrow(
      /vault name/i
    );
  });

  it('throws for a vault name with special characters', () => {
    expect(() =>
      buildObsidianUri({ vault: '<script>', file: 'note.md' })
    ).toThrow(/vault name/i);
  });

  it('throws for a vault name containing a path separator', () => {
    expect(() =>
      buildObsidianUri({ vault: 'vault/sub', file: 'note.md' })
    ).toThrow(/vault name/i);
  });

  it('throws for an empty file path', () => {
    expect(() => buildObsidianUri({ vault: 'My Vault', file: '' })).toThrow(
      /file path/i
    );
  });

  it('throws for a file path with path traversal', () => {
    expect(() =>
      buildObsidianUri({ vault: 'My Vault', file: '../etc/passwd' })
    ).toThrow(/file path/i);
  });
});

// ---------------------------------------------------------------------------
// buildUnicornUri
// ---------------------------------------------------------------------------

describe('buildUnicornUri', () => {
  it('returns a correctly encoded unicorn:// URI', () => {
    const uri = buildUnicornUri({ resource: 'case', id: 'abc-123' });
    expect(uri).toBe('unicorn://case/abc-123');
  });

  it('throws for an unknown resource type', () => {
    expect(() =>
      buildUnicornUri({ resource: 'admin', id: 'abc-123' })
    ).toThrow(/resource type/i);
  });

  it('throws for an empty resource type', () => {
    expect(() => buildUnicornUri({ resource: '', id: 'abc-123' })).toThrow(
      /resource type/i
    );
  });

  it('throws for an empty ID', () => {
    expect(() => buildUnicornUri({ resource: 'case', id: '' })).toThrow(
      /resource id/i
    );
  });

  it('throws for an ID with spaces', () => {
    expect(() =>
      buildUnicornUri({ resource: 'case', id: 'abc 123' })
    ).toThrow(/resource id/i);
  });

  it('encodes special characters in ID', () => {
    const uri = buildUnicornUri({ resource: 'case', id: 'ABC_123-xyz' });
    expect(uri).toBe('unicorn://case/ABC_123-xyz');
  });
});

// ---------------------------------------------------------------------------
// buildHttpsUri
// ---------------------------------------------------------------------------

describe('buildHttpsUri', () => {
  it('accepts a valid Supabase URL', () => {
    const url = 'https://app.supabase.com/project/my-project';
    expect(buildHttpsUri({ url })).toBe(url);
  });

  it('accepts subdomain URLs for supabase.co', () => {
    const url = 'https://my-project.supabase.co/rest/v1/cases';
    expect(buildHttpsUri({ url })).toBe(url);
  });

  it('throws for an HTTP URL', () => {
    expect(() =>
      buildHttpsUri({ url: 'http://app.supabase.com/project/x' })
    ).toThrow(/https/i);
  });

  it('throws for a non-allow-listed hostname', () => {
    expect(() => buildHttpsUri({ url: 'https://evil.com/steal' })).toThrow(
      /allow-list/i
    );
  });

  it('throws for a malformed URL', () => {
    expect(() => buildHttpsUri({ url: 'not-a-url' })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// openLink (integration – mocked dispatchUri)
// ---------------------------------------------------------------------------

// We mock dispatchUri so no real OS calls are made.
jest.mock('../opener', () => {
  const original = jest.requireActual('../opener');
  return {
    ...original,
    dispatchUri: jest.fn().mockResolvedValue(undefined),
  };
});

describe('openLink', () => {
  it('returns success and a URI for a valid obsidian link', async () => {
    const result = await openLink('obsidian', {
      vault: 'My Vault',
      file: 'cases/abc-123',
    });
    expect(result.success).toBe(true);
    expect(result.uri).toContain('obsidian://open');
  });

  it('returns success and a URI for a valid unicorn link', async () => {
    const result = await openLink('unicorn', { resource: 'case', id: 'abc-123' });
    expect(result.success).toBe(true);
    expect(result.uri).toBe('unicorn://case/abc-123');
  });

  it('returns success and a URI for a valid https link', async () => {
    const url = 'https://app.supabase.com/project/my-project';
    const result = await openLink('https', { url });
    expect(result.success).toBe(true);
    expect(result.uri).toBe(url);
  });

  it('returns failure for an invalid obsidian link', async () => {
    const result = await openLink('obsidian', {
      vault: '',
      file: 'note.md',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/vault/i);
  });

  it('returns failure when params shape does not match scheme', async () => {
    // Passing HttpsLinkParams to the obsidian scheme
    const result = await openLink('obsidian', { url: 'https://evil.com' } as any);
    expect(result.success).toBe(false);
  });
});
