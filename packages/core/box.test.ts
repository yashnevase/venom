import { beforeAll, describe, expect, it } from 'vitest';
import { createIdentityKeys, issueDeviceCertificate, revokeDeviceCertificate } from './src/identity.js';
import type { IdentityKeys } from './src/identity.js';
import { decodeCbor, encodeCbor } from './src/cbor.js';
import type { CborValue } from './src/cbor.js';
import { sealBox, openBox, createReceipt, verifyReceipt, sealFile, openFile, parseBox, parseManifest, referenceDevice } from './src/box.js';
import type { DeviceContact, OpenedBox } from './src/box.js';
const bounds = { maxBytes: 2 * 1024 * 1024, maxDepth: 12, maxItems: 4096 };
const now = 1794700800;
let alice: IdentityKeys;
let bob: IdentityKeys;
let carol: IdentityKeys;
let aliceContact: DeviceContact;
let bobContact: DeviceContact;
let carolContact: DeviceContact;
function present<T>(item: T | undefined): T {
    if (item === undefined)
        throw new Error('Missing fixture item');
    return item;
}
function value<T>(result: {
    ok: true;
    value: T;
} | {
    ok: false;
    error: string;
}): T {
    if (!result.ok)
        throw new Error(result.error);
    return result.value;
}
const bytes = (length: number) => Uint8Array.from({ length }, (_, i) => i % 251);
async function* source(input: Uint8Array) {
    for (let i = 0; i < input.length; i += 7777)
        yield await Promise.resolve(input.subarray(i, i + 7777));
}
const message = (text = 'hello') => new Map<string, CborValue>([['text', text]]);
const sender = () => ({ keys: alice, contact: aliceContact });
const sendOptions = () => ({ sender: sender(), recipients: [bobContact], now,
    tag: new Uint8Array(16).fill(3), profile: 'small' as const, kind: 0 as const, body: message() });
const receiveOptions = () => ({ recipient: { keys: bob, contact: bobContact },
    expectedSender: aliceContact, now });
beforeAll(async () => {
    alice = value(await createIdentityKeys());
    bob = value(await createIdentityKeys());
    carol = value(await createIdentityKeys());
    const contact = async (keys: IdentityKeys) => ({ root: keys.root.publicBytes,
        certificate: value(await issueDeviceCertificate(keys, { created: now - 100,
            expiry: now + 1000, limits: bounds })) });
    aliceContact = await contact(alice);
    bobContact = await contact(bob);
    carolContact = await contact(carol);
});
describe('Phase 1 complete envelope acceptance', () => {
    it('seals and opens a small Box using the first-byte version and complete-envelope bucket', async () => {
        const wire = value(await sealBox(sendOptions()));
        expect(wire[0]).toBe(1);
        expect(wire.length).toBe(1024);
        const opened = value(await openBox(wire, receiveOptions()));
        expect(opened.kind).toBe(0);
        expect(opened.body).toEqual(message());
        expect(opened.header.created_coarse).toBe(BigInt(now));
    });
    it('supports every intended recipient and rejects wrong keys, roots, revoked and expired senders', async () => {
        const wire = value(await sealBox({ ...sendOptions(), recipients: [carolContact, bobContact] }));
        expect((await openBox(wire, receiveOptions())).ok).toBe(true);
        expect((await openBox(wire, { ...receiveOptions(), recipient: { keys: carol, contact: carolContact } })).ok).toBe(true);
        expect((await openBox(wire, { ...receiveOptions(), recipient: { keys: alice, contact: bobContact } })).ok).toBe(false);
        expect((await openBox(wire, { ...receiveOptions(), expectedSender: { ...aliceContact, root: bobContact.root } })).ok).toBe(false);
        expect((await openBox(wire, { ...receiveOptions(), now: now + 1000 })).ok).toBe(false);
        const revocation = value(await revokeDeviceCertificate(alice, aliceContact.certificate, now, bounds));
        expect((await openBox(wire, { ...receiveOptions(), expectedSender: { ...aliceContact, revocation } })).ok).toBe(false);
    });
    it('rejects every single bit change including other-recipient wraps and ignores unknown versions', async () => {
        const wire = value(await sealBox({ ...sendOptions(), recipients: [bobContact, carolContact] }));
        for (let bit = 0; bit < wire.length * 8; bit++) {
            const changed = wire.slice();
            changed[bit >> 3] = present(changed[bit >> 3]) ^ (1 << (bit & 7));
            expect((await openBox(changed, receiveOptions())).ok, `bit ${String(bit)}`).toBe(false);
        }
        expect(parseBox(new Uint8Array([2, 0xff]))).toEqual({ ok: false, error: 'unsupported-version' });
    }, 120000);
    it('rejects every truncation, extra bytes, duplicate recipient and malformed length before crypto', async () => {
        const wire = value(await sealBox(sendOptions()));
        for (let length = 0; length < wire.length; length++)
            expect(parseBox(wire.subarray(0, length)).ok).toBe(false);
        const extra = new Uint8Array(wire.length + 1);
        extra.set(wire);
        expect(parseBox(extra).ok).toBe(false);
        const outer = value(decodeCbor(wire.subarray(1), bounds)) as CborValue[];
        const recipients = outer[1] as CborValue[];
        recipients.push(present(recipients[0]));
        const duplicate = value(encodeCbor(outer, bounds));
        expect(parseBox(Uint8Array.from([1, ...duplicate])).ok).toBe(false);
        expect(parseBox(new Uint8Array([1, 0x84, 0x5b, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])).ok).toBe(false);
    });
    it('caps recipient count, body expansion, small envelope size and requested memory', async () => {
        expect((await sealBox({ ...sendOptions(), recipients: Array.from({ length: 21 }, () => bobContact) })).ok).toBe(false);
        expect((await sealBox({ ...sendOptions(), body: message('a'.repeat(1048577)) })).ok).toBe(false);
        const random = globalThis.crypto.getRandomValues(new Uint8Array(20000));
        const text = Buffer.from(random).toString('base64');
        expect((await sealBox({ ...sendOptions(), body: message(text) })).ok).toBe(false);
        const wire = value(await sealBox(sendOptions()));
        expect(parseBox(wire, { maxBytes: wire.length - 1 }).ok).toBe(false);
    });
    it('uses fountain only as an explicitly selected envelope profile', async () => {
        const wire = value(await sealBox({ ...sendOptions(), profile: 'fountain' }));
        expect(value(await openBox(wire, receiveOptions())).header.profile).toBe('fountain');
    });
    it('makes receipts only from verified inputs and validates expected signer, references and revocation', async () => {
        const original = value(await sealBox(sendOptions()));
        const opened = value(await openBox(original, receiveOptions()));
        expect((await createReceipt({} as OpenedBox, { sender: { keys: bob, contact: bobContact },
            recipient: aliceContact, now, tag: new Uint8Array(16) })).ok).toBe(false);
        const receipt = value(await createReceipt(opened, { sender: { keys: bob, contact: bobContact },
            recipient: aliceContact, now: now + 61, tag: new Uint8Array(16) }));
        const sent = { original, sender: { keys: alice, contact: aliceContact },
            expectedRecipient: bobContact, now: now + 61 };
        const accepted = value(await verifyReceipt(receipt, sent));
        expect(accepted.body.get('received_coarse')).toBe(BigInt(now + 60));
        expect(accepted.body.has('manifest_hash')).toBe(false);
        expect((await verifyReceipt(receipt, { ...sent, original: value(await sealBox(sendOptions())) })).ok).toBe(false);
        expect((await verifyReceipt(receipt, { ...sent, expectedRecipient: carolContact })).ok).toBe(false);
        const revocation = value(await revokeDeviceCertificate(bob, bobContact.certificate, now, bounds));
        expect((await verifyReceipt(receipt, { ...sent, expectedRecipient: { ...bobContact, revocation } })).ok).toBe(false);
        expect(value(await verifyReceipt(receipt, sent)).idempotencyKey).toEqual(accepted.idempotencyKey);
    });
    it('never throws on bounded whole-Box and Manifest fuzz input', () => {
        let seed = 0x4f4d0002;
        for (let trial = 0; trial < 5000; trial++) {
            const input = new Uint8Array(trial % 257);
            for (let i = 0; i < input.length; i++) {
                seed ^= seed << 13;
                seed ^= seed >>> 17;
                seed ^= seed << 5;
                input[i] = seed & 255;
            }
            expect(() => parseBox(input)).not.toThrow();
            expect(() => parseManifest(input)).not.toThrow();
        }
    });
});
describe('Phase 1 chunked files and manifests', () => {
    for (const length of [0, 65520, 200000, 5 * 1024 * 1024]) {
        it(`round trips ${String(length)} bytes in bounded chunks, with a separate signed manifest and completed Receipt`, async () => {
            const input = bytes(length);
            const chunks: {
                index: number;
                bytes: Uint8Array;
            }[] = [];
            const file = value(await sealFile({ sender: sender(), source: source(input), size: length,
                name: 'file.bin', mediaType: 'application/octet-stream', now,
                emit: (index, chunk) => { chunks.push({ index, bytes: chunk }); return Promise.resolve(); } }));
            expect(file.descriptor.get('file_id')).toHaveLength(32);
            const wire = value(await sealBox({ ...sendOptions(), profile: 'chunked', kind: 1,
                body: new Map([['attachments', [file.descriptor]]]), manifest: file.manifest }));
            const opened = value(await openBox(wire, receiveOptions()));
            const receiptOptions = { sender: { keys: bob, contact: bobContact }, recipient: aliceContact,
                now, tag: new Uint8Array(16) };
            expect((await createReceipt(opened, receiptOptions)).ok).toBe(false);
            const output: {
                index: number;
                bytes: Uint8Array;
            }[] = [];
            async function* shuffled() { for (const item of [...chunks].reverse()) {
                yield await Promise.resolve(item);
                yield await Promise.resolve(item);
            } }
            const complete = await openFile(opened, { manifest: file.manifest, source: shuffled(),
                emit: (index, chunk) => { output.push({ index, bytes: chunk }); return Promise.resolve(); } });
            expect(complete.ok).toBe(true);
            expect(Buffer.concat(output.sort((a, b) => a.index - b.index).map(item => item.bytes))).toEqual(Buffer.from(input));
            expect((await createReceipt(opened, receiptOptions)).ok).toBe(true);
            const receipt = value(await createReceipt(opened, receiptOptions));
            const verified = value(await verifyReceipt(receipt, { original: wire,
                sender: sender(), expectedRecipient: bobContact, now }));
            expect(verified.body.get('manifest_hash')).toEqual(file.descriptor.get('file_id'));
            const manifest = value(parseManifest(file.manifest));
            expect(manifest.get('final_index')).toBe(BigInt(chunks.length - 1));
        }, 30000);
    }
    it('rejects manifest corruption and missing, conflicting, incorrect or truncated chunks', async () => {
        const chunks: {
            index: number;
            bytes: Uint8Array;
        }[] = [];
        const file = value(await sealFile({ sender: sender(), source: source(bytes(200000)), size: 200000,
            name: 'file.bin', mediaType: '', now, emit: (index, chunk) => { chunks.push({ index, bytes: chunk }); return Promise.resolve(); } }));
        const wire = value(await sealBox({ ...sendOptions(), profile: 'chunked', kind: 1,
            body: new Map([['attachments', [file.descriptor]]]), manifest: file.manifest }));
        for (let bit = 0; bit < file.manifest.length * 8; bit++) {
            const changed = file.manifest.slice();
            changed[bit >> 3] = present(changed[bit >> 3]) ^ (1 << (bit & 7));
            const opened = value(await openBox(wire, receiveOptions()));
            async function* all() { for (const item of chunks)
                yield await Promise.resolve(item); }
            expect((await openFile(opened, { manifest: changed, source: all(), emit: () => Promise.resolve() })).ok).toBe(false);
        }
        for (const variant of [chunks.slice(1), [...chunks.slice(1), { index: 0, bytes: new Uint8Array(20) }],
            [...chunks, { index: chunks.length, bytes: present(chunks[0]).bytes }]]) {
            const opened = value(await openBox(wire, receiveOptions()));
            async function* all() { for (const item of variant)
                yield await Promise.resolve(item); }
            expect((await openFile(opened, { manifest: file.manifest, source: all(), emit: () => Promise.resolve() })).ok).toBe(false);
        }
    }, 120000);
    it('rejects source length disagreement and failed output operations as typed outcomes', async () => {
        const options = { sender: sender(), source: source(bytes(10)), size: 11,
            name: 'file', mediaType: '', now, emit: () => Promise.resolve() };
        expect((await sealFile(options)).ok).toBe(false);
        expect((await sealFile({ ...options, source: source(bytes(11)), emit: () => Promise.reject(new Error('disk full')) })).ok).toBe(false);
    });
    it('derives recipient identifiers from the rooted certificate reference', async () => {
        const reference = value(await referenceDevice(bobContact, now));
        expect(reference.deviceId).toHaveLength(16);
        expect(reference.certificate.device_pub_dh).toEqual(bob.deviceEncryption.publicBytes);
    });
});

it('uses the complete 1 KiB, 4 KiB and 16 KiB buckets for bounded deterministic inputs', async () => {
    let seed = 0x4f4d0003;
    for (const [length, expected] of [[100, 1024], [2000, 4096], [10000, 16384]]) {
        if (length === undefined || expected === undefined) throw new Error('Missing case');
        const data = Uint8Array.from({ length }, () => {
            seed ^= seed << 13;
            seed ^= seed >>> 17;
            seed ^= seed << 5;
            return seed & 255;
        });
        const wire = value(await sealBox({ ...sendOptions(), body: message(Buffer.from(data).toString('base64')) }));
        expect(wire.length).toBe(expected);
        expect((await openBox(wire, receiveOptions())).ok).toBe(true);
    }
});

it('checks the exact aggregate GCM boundary before reading a file source', async () => {
    let read = false;
    async function* rejectedSource() {
        read = true;
        yield await Promise.reject<Uint8Array>(new Error('source stopped'));
    }
    const options = { sender: sender(), size: 68715282560n, source: rejectedSource(),
        name: 'boundary', mediaType: '', now, emit: () => Promise.resolve() };
    const exact = await sealFile(options);
    expect(exact).toEqual({ ok: false, error: 'operation-failed' });
    expect(read).toBe(true);
    read = false;
    expect(await sealFile({ ...options, size: 68715282561n, source: rejectedSource() }))
        .toEqual({ ok: false, error: 'limit-exceeded' });
    expect(read).toBe(false);
});

it('round trips a rooted invite and rejects a different embedded root', async () => {
    const body = new Map<string, CborValue>([['root', aliceContact.root],
        ['certificate', aliceContact.certificate], ['secret', new Uint8Array(32).fill(99)]]);
    const wire = value(await sealBox({ ...sendOptions(), kind: 3, body }));
    expect(value(await openBox(wire, receiveOptions())).kind).toBe(3);
    body.set('root', bobContact.root);
    expect((await sealBox({ ...sendOptions(), kind: 3, body })).ok).toBe(false);
});

it('keeps file completion false after output failure and allows an explicit retry', async () => {
    const chunks: { index: number; bytes: Uint8Array }[] = [];
    const file = value(await sealFile({ sender: sender(), source: source(bytes(100)), size: 100,
        name: 'retry', mediaType: '', now, emit: (index, chunk) => {
            chunks.push({ index, bytes: chunk });
            return Promise.resolve();
        } }));
    const wire = value(await sealBox({ ...sendOptions(), kind: 1, profile: 'chunked',
        body: new Map([['attachments', [file.descriptor]]]), manifest: file.manifest }));
    const opened = value(await openBox(wire, receiveOptions()));
    async function* all() {
        for (const item of chunks) yield await Promise.resolve(item);
    }
    const receipt = { sender: { keys: bob, contact: bobContact }, recipient: aliceContact,
        now, tag: new Uint8Array(16) };
    const attempt = openFile(opened, { manifest: file.manifest, source: all(),
        emit: () => Promise.reject(new Error('output unavailable')) });
    expect(await openFile(opened, { manifest: file.manifest, source: all(), emit: () => Promise.resolve() }))
        .toEqual({ ok: false, error: 'invalid-state' });
    expect((await attempt).ok).toBe(false);
    expect((await createReceipt(opened, receipt)).ok).toBe(false);
    expect((await openFile(opened, { manifest: file.manifest, source: all(), emit: () => Promise.resolve() })).ok)
        .toBe(true);
    expect((await createReceipt(opened, receipt)).ok).toBe(true);
});
