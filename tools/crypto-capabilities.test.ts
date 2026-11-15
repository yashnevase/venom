import { describe, expect, it, vi } from 'vitest';
import { probeCryptoCapabilities } from './crypto-capabilities.js';

describe('P1-CAP native WebCrypto review measurements', () => {
  it('exercises all six specified algorithms without exporting secret keys', async () => {
    const rows = await probeCryptoCapabilities();
    expect(rows.map((row) => row.algorithm)).toEqual([
      'Ed25519', 'X25519', 'HKDF-SHA256', 'AES-256-GCM', 'HMAC-SHA256', 'SHA-256',
    ]);
    for (const row of rows) {
      expect(row.supported).toBe(true);
      expect(row.elapsed_ms).toBeGreaterThanOrEqual(0);
      expect(row.checks.length).toBeGreaterThan(0);
      expect(Object.keys(row).sort()).toEqual(['algorithm', 'checks', 'elapsed_ms', 'supported']);
    }
  });

  it('reports each unavailable algorithm without aborting the capability probe', async () => {
    vi.stubGlobal('crypto', undefined);
    try {
      const rows = await probeCryptoCapabilities();
      expect(rows).toHaveLength(6);
      for (const row of rows) {
        expect(row.supported).toBe(false);
        expect(row.checks).toEqual([]);
        expect(row.error).toBe('TypeError');
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
