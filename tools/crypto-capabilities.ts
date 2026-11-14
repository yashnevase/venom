import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Review-only native API measurements. This tool creates no protocol messages.
export interface CapabilityMeasurement {
  algorithm: string;
  supported: boolean;
  elapsed_ms: number;
  checks: string[];
  error?: string;
}

async function measure(
  algorithm: string, exercise: () => Promise<string[]>,
): Promise<CapabilityMeasurement> {
  const started = performance.now();
  try {
    const checks = await exercise();
    return { algorithm, supported: true, elapsed_ms: performance.now() - started, checks };
  } catch (error) {
    return {
      algorithm, supported: false, elapsed_ms: performance.now() - started,
      checks: [], error: error instanceof Error ? error.name : 'UnknownError',
    };
  }
}

export async function probeCryptoCapabilities(): Promise<CapabilityMeasurement[]> {
  const rows: CapabilityMeasurement[] = [];
  rows.push(await measure('Ed25519', async () => {
    const pair = await globalThis.crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify']);
    assert('privateKey' in pair);
    const message = new Uint8Array([1, 2, 3]);
    const signature = await globalThis.crypto.subtle.sign('Ed25519', pair.privateKey, message);
    assert.equal(signature.byteLength, 64);
    assert.equal(await globalThis.crypto.subtle.verify('Ed25519', pair.publicKey, signature, message), true);
    assert.equal(await globalThis.crypto.subtle.verify('Ed25519', pair.publicKey, signature, new Uint8Array([1, 2, 4])), false);
    await assert.rejects(globalThis.crypto.subtle.exportKey('pkcs8', pair.privateKey));
    return ['sign/verify', 'changed message rejected', 'private export rejected'];
  }));
  rows.push(await measure('X25519', async () => {
    const first = await globalThis.crypto.subtle.generateKey('X25519', false, ['deriveBits']);
    const second = await globalThis.crypto.subtle.generateKey('X25519', false, ['deriveBits']);
    assert('privateKey' in first);
    assert('privateKey' in second);
    const firstSecret = await globalThis.crypto.subtle.deriveBits(
      { name: 'X25519', public: second.publicKey }, first.privateKey, 256,
    );
    const secondSecret = await globalThis.crypto.subtle.deriveBits(
      { name: 'X25519', public: first.publicKey }, second.privateKey, 256,
    );
    assert.equal(firstSecret.byteLength, 32);
    assert.deepEqual(new Uint8Array(firstSecret), new Uint8Array(secondSecret));
    assert.equal(first.privateKey.extractable, false);
    assert.equal(second.privateKey.extractable, false);
    return ['32-byte agreement symmetry', 'non-extractable private keys'];
  }));
  rows.push(await measure('HKDF-SHA256', async () => {
    // RFC 5869 Appendix A.1. Fixed public test material, independent of OpenMesh.
    const key = await globalThis.crypto.subtle.importKey(
      'raw', new Uint8Array(22).fill(0x0b), 'HKDF', false, ['deriveBits'],
    );
    const derived = await globalThis.crypto.subtle.deriveBits({
      name: 'HKDF', hash: 'SHA-256',
      salt: Buffer.from('000102030405060708090a0b0c', 'hex'),
      info: Buffer.from('f0f1f2f3f4f5f6f7f8f9', 'hex'),
    }, key, 42 * 8);
    assert.equal(Buffer.from(derived).toString('hex'),
      '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865');
    return ['RFC 5869 A.1 output match'];
  }));
  rows.push(await measure('AES-256-GCM', async () => {
    const key = await globalThis.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
    );
    const parameters = { name: 'AES-GCM', iv: globalThis.crypto.getRandomValues(new Uint8Array(12)), tagLength: 128 };
    const plaintext = new Uint8Array([1, 2, 3]);
    const encrypted = await globalThis.crypto.subtle.encrypt(parameters, key, plaintext);
    assert.equal(encrypted.byteLength, plaintext.byteLength + 16);
    const decrypted = await globalThis.crypto.subtle.decrypt(parameters, key, encrypted);
    assert.deepEqual(new Uint8Array(decrypted), plaintext);
    const corrupted = encrypted.slice(0);
    const view = new DataView(corrupted);
    view.setUint8(0, view.getUint8(0) ^ 1);
    await assert.rejects(globalThis.crypto.subtle.decrypt(parameters, key, corrupted));
    return ['single native AEAD round trip', '16-byte authentication tag', 'changed ciphertext rejected'];
  }));
  rows.push(await measure('HMAC-SHA256', async () => {
    const bytes = new Uint8Array(32).fill(0x0b);
    const message = new TextEncoder().encode('OpenMesh capability probe');
    const key = await globalThis.crypto.subtle.importKey(
      'raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const mac = await globalThis.crypto.subtle.sign('HMAC', key, message);
    assert.deepEqual(Buffer.from(mac), createHmac('sha256', bytes).update(message).digest());
    return ['Node HMAC API output match'];
  }));
  rows.push(await measure('SHA-256', async () => {
    const message = new TextEncoder().encode('abc');
    const hash = await globalThis.crypto.subtle.digest('SHA-256', message);
    assert.deepEqual(Buffer.from(hash), createHash('sha256').update(message).digest());
    return ['Node hash API output match'];
  }));
  return rows;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const algorithms = await probeCryptoCapabilities();
  console.log(JSON.stringify({
    measured_at: new Date().toISOString(), node: process.version,
    platform: process.platform, arch: process.arch, algorithms,
  }, null, 2));
  if (algorithms.some((row) => !row.supported)) process.exitCode = 1;
}
