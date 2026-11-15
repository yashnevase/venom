import { expect, it, vi } from 'vitest';
import { createIdentityKeys, issueDeviceCertificate } from './src/identity.js';
import type { IdentityKeys } from './src/identity.js';
import { parseBox, referenceDevice, sealBox, verifyReceipt } from './src/box.js';
import type { DeviceContact } from './src/box.js';
import type { CborValue } from './src/cbor.js';
import { encoded, equal, hash, join } from './src/box-wire.js';

function value<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

it('keeps receipt signer and body device bound to one expected-contact snapshot across awaits', async () => {
  const now = 1794700800;
  const limits = { maxBytes: 4096, maxDepth: 12, maxItems: 4096 };
  async function contact(keys: IdentityKeys): Promise<DeviceContact> {
    return { root: keys.root.publicBytes, certificate: value(await issueDeviceCertificate(keys,
      { created: now - 100, expiry: now + 1000, limits })) };
  }
  const alice = value(await createIdentityKeys());
  const bob = value(await createIdentityKeys());
  const carol = value(await createIdentityKeys());
  const aliceContact = await contact(alice);
  const bobContact = await contact(bob);
  const carolContact = await contact(carol);
  const sender = { keys: alice, contact: aliceContact };
  const original = value(await sealBox({ sender, recipients: [bobContact],
    tag: new Uint8Array(16), now, profile: 'small', kind: 0,
    body: new Map<CborValue, CborValue>([['text', 'hello']]) }));
  const parsed = value(parseBox(original));
  const reference = await hash(join(encoded(parsed.headerMap, 1024), parsed.ciphertext));
  const bobReference = value(await referenceDevice(bobContact, now));
  const forgedReceipt = value(await sealBox({ sender: { keys: carol, contact: carolContact },
    recipients: [aliceContact], tag: new Uint8Array(16), now, profile: 'small', kind: 2,
    body: new Map<CborValue, CborValue>([['box_id', reference], ['device', bobReference.deviceId],
      ['status', 0], ['received_coarse', Math.floor(now / 60) * 60]]) }));
  const options = { original, sender, expectedRecipient: bobContact, now };
  expect(await verifyReceipt(forgedReceipt, options)).toEqual({ ok: false, error: 'invalid-sender' });

  const digest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle);
  let changedContact = false;
  vi.spyOn(globalThis.crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
    const result = await digest(algorithm, data);
    if (equal(new Uint8Array(data as Uint8Array), bobReference.reference)) {
      options.expectedRecipient = carolContact;
      changedContact = true;
    }
    return result;
  });
  try {
    const result = await verifyReceipt(forgedReceipt, options);
    expect(changedContact).toBe(true);
    expect(result).toEqual({ ok: false, error: 'invalid-sender' });
  } finally {
    vi.restoreAllMocks();
  }
});
