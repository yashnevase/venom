import type { CborLimits, CborValue } from './cbor.js';
import { encodeCbor, decodeCbor } from './cbor.js';
import { createRootSigningKey } from './identity.js';
import { deriveRootSeedFromEntropy } from './recovery.js';
import { requireValue, demand, failure, fixed, bounded, uint, map,
  hash, domain, join, equal } from './box-wire.js';
import type { ProtocolResult } from './box-wire.js';

async function rootKeys(entropy: Uint8Array) {
  const root = requireValue(await deriveRootSeedFromEntropy(entropy));
  return requireValue(await createRootSigningKey(root));
}
async function wrappingKey(entropy: Uint8Array, salt: Uint8Array<ArrayBuffer>) {
  const material = await globalThis.crypto.subtle.importKey('raw', fixed(entropy, 32), 'HKDF', false, ['deriveKey']);
  return globalThis.crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt,
    info: domain('openmesh-backup-key-v1') }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function transcript(header: Map<CborValue, CborValue>, snapshot: Uint8Array, limits: CborLimits) {
  return join(domain('openmesh-backup-sign-v1'), await hash(requireValue(encodeCbor(header, limits))), await hash(snapshot));
}
export async function sealBackup(snapshot: unknown, entropy: unknown, created: number | bigint,
  limits: CborLimits): Promise<ProtocolResult<Uint8Array>> {
  try {
    const bounds = { ...limits };
    requireValue(encodeCbor(null, bounds));
    const bytes = bounded(snapshot, bounds.maxBytes);
    const recovery = fixed(entropy, 32);
    const timestamp = uint(created);
    const root = await rootKeys(recovery);
    const header = new Map<CborValue, CborValue>([['v', 1], ['root', root.publicBytes],
      ['snapshot_id', globalThis.crypto.getRandomValues(new Uint8Array(16))], ['created', timestamp]]);
    const signature = new Uint8Array(await globalThis.crypto.subtle.sign('Ed25519', root.privateKey,
      await transcript(header, bytes, bounds)));
    const plaintext = requireValue(encodeCbor([bytes, signature], bounds));
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const key = await wrappingKey(recovery, salt);
    const ciphertext = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce,
      additionalData: join(domain('openmesh-backup-aad-v1'), requireValue(encodeCbor(header, bounds)), salt), tagLength: 128 }, key, fixed(plaintext)));
    const output = join(new Uint8Array([1]), requireValue(encodeCbor([header, salt, nonce, ciphertext], { ...bounds, maxBytes: bounds.maxBytes - 1 })));
    return { ok: true, value: output };
  } catch (error) { return failure(error); }
}
export async function openBackup(input: unknown, entropy: unknown, limits: CborLimits): Promise<ProtocolResult<Uint8Array>> {
  try {
    const bounds = { ...limits };
    requireValue(encodeCbor(null, bounds));
    const wire = bounded(input, bounds.maxBytes);
    demand(wire.length > 0 && wire[0] === 1, 'unsupported-version');
    const recovery = fixed(entropy, 32);
    const outer = requireValue(decodeCbor(wire.subarray(1), bounds));
    demand(Array.isArray(outer) && outer.length === 4);
    const header = map(outer[0], ['v', 'root', 'snapshot_id', 'created']);
    demand(uint(header.get('v')) === 1n, 'unsupported-version');
    fixed(header.get('snapshot_id'), 16); uint(header.get('created'));
    const rootPublic = fixed(header.get('root'), 32);
    const salt = fixed(outer[1], 32); const nonce = fixed(outer[2], 12);
    const ciphertext = fixed(outer[3]);
    const root = await rootKeys(recovery);
    demand(equal(root.publicBytes, rootPublic), 'wrong-root');
    const key = await wrappingKey(recovery, salt);
    const plaintext = new Uint8Array(await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce,
      additionalData: join(domain('openmesh-backup-aad-v1'), requireValue(encodeCbor(header, bounds)), salt), tagLength: 128 }, key, ciphertext));
    const payload = requireValue(decodeCbor(plaintext, bounds));
    demand(Array.isArray(payload) && payload.length === 2);
    const snapshot = fixed(payload[0]); const signature = fixed(payload[1], 64);
    demand(await globalThis.crypto.subtle.verify('Ed25519', root.publicKey, signature,
      await transcript(header, snapshot, bounds)), 'invalid-signature');
    return { ok: true, value: snapshot };
  } catch (error) { return failure(error); }
}
