import type { CborValue } from './cbor.js';
import { decodeCborPrefix } from './cbor.js';
import type { BoxHeader, BoxProfile } from './box-header.js';
import type { IdentityKeys } from './identity.js';
import { sealHpkeBase, openHpkeBase } from './hpke.js';
import { compressDeflate, decompressDeflate } from './compression.js';
import { chunkSizeForFile } from './chunk.js';
import { BODY_MAX, MANIFEST_MAX, codecLimits, requireValue, demand, failure, fixed, bounded, present, equal, uint, map, encoded, decoded, hash, domain, join, snapshotContact, referenceDevice, parseBox, parseManifest, compareIds, paddedLength, nonceForChunk, chunkAad } from './box-wire.js';
import type { ProtocolResult, DeviceContact, DeviceReference, ParsedBox } from './box-wire.js';
export { parseBox, parseManifest, referenceDevice } from './box-wire.js';
export type { ProtocolResult, DeviceContact } from './box-wire.js';
export interface BoxSender {
    keys: IdentityKeys;
    contact: DeviceContact;
}
export interface SealBoxOptions {
    sender: BoxSender;
    recipients: DeviceContact[];
    tag: Uint8Array;
    now: number | bigint;
    profile: BoxProfile;
    kind: 0 | 1 | 2 | 3;
    body: Map<CborValue, CborValue>;
    manifest?: Uint8Array;
}
export interface OpenBoxOptions {
    recipient: BoxSender;
    expectedSender: DeviceContact;
    now: number | bigint;
}
export interface OpenedBox {
    header: BoxHeader;
    kind: number;
    body: Map<CborValue, CborValue>;
}
interface Verification {
    parsed: ParsedBox;
    body: Map<CborValue, CborValue>;
    sender: DeviceReference;
    recipientId: Uint8Array;
    reference: Uint8Array;
    complete: boolean;
    fileBusy: boolean;
}
const verified = new WeakMap<OpenedBox, Verification>();
function checkKeys(sender: BoxSender, reference: DeviceReference): void {
    demand(equal(sender.keys.deviceSigning.publicBytes, reference.certificate.device_pub_sign), 'invalid-key');
    demand(equal(sender.keys.deviceEncryption.publicBytes, reference.certificate.device_pub_dh), 'invalid-key');
}
function text(value: unknown, maxBytes: number): void {
    demand(typeof value === 'string');
    demand(value.length <= maxBytes && domain(value).length <= maxBytes, 'limit-exceeded');
}
function descriptor(body: Map<CborValue, CborValue>): Map<CborValue, CborValue> {
    const attachments = body.get('attachments');
    demand(Array.isArray(attachments) && attachments.length === 1);
    const file = map(attachments[0], ['file_id', 'file_key', 'name', 'media_type']);
    fixed(file.get('file_id'), 32);
    fixed(file.get('file_key'), 32);
    text(file.get('name'), 1024);
    text(file.get('media_type'), 255);
    return file;
}
function validateBody(body: Map<CborValue, CborValue>, kind: number, profile: BoxProfile): void {
    demand(Number.isInteger(kind) && kind >= 0 && kind <= 3);
    if (kind === 0) {
        map(body, ['text'], ['attachments']);
        text(body.get('text'), BODY_MAX);
    }
    if (kind === 1)
        map(body, ['attachments']);
    if (kind === 2) {
        map(body, ['box_id', 'device', 'status', 'received_coarse'], ['manifest_hash']);
        fixed(body.get('box_id'), 32);
        fixed(body.get('device'), 16);
        demand(uint(body.get('status')) === 0n && uint(body.get('received_coarse')) % 60n === 0n);
        if (body.has('manifest_hash'))
            fixed(body.get('manifest_hash'), 32);
    }
    if (kind === 3) {
        map(body, ['root', 'certificate', 'secret']);
        fixed(body.get('root'), 32);
        bounded(body.get('certificate'), 1024);
        fixed(body.get('secret'), 32);
    }
    if (profile === 'chunked') {
        demand(kind === 0 || kind === 1);
        descriptor(body);
    }
    else {
        demand(kind !== 1 && !body.has('attachments'));
    }
}
async function transcript(header: Map<CborValue, CborValue>, recipients: ParsedBox['recipients'], kind: number, body: Uint8Array, reference: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
    return join(domain('openmesh-box-v1'), await hash(encoded(header, 1024)), await hash(join(...recipients.map(entry => entry[0]))), new Uint8Array([kind]), await hash(body), await hash(reference));
}
async function payloadAad(parsed: Pick<ParsedBox, 'headerMap' | 'recipients'>): Promise<Uint8Array<ArrayBuffer>> {
    return join(domain('openmesh-payload-v1'), encoded(parsed.headerMap, 1024), await hash(encoded(parsed.recipients)));
}
async function checkManifest(manifest: Uint8Array, file: Map<CborValue, CborValue>, sender: DeviceReference): Promise<Map<CborValue, CborValue>> {
    const record = requireValue(parseManifest(manifest));
    demand(equal(fixed(record.get('sender'), 16), sender.deviceId), 'invalid-sender');
    demand(equal(await hash(encoded(record, MANIFEST_MAX, 1048640)), fixed(file.get('file_id'), 32)), 'hash-mismatch');
    const unsigned = new Map(record);
    unsigned.delete('sig');
    const key = await globalThis.crypto.subtle.importKey('raw', fixed(sender.certificate.device_pub_sign, 32), 'Ed25519', false, ['verify']);
    demand(await globalThis.crypto.subtle.verify('Ed25519', key, fixed(record.get('sig'), 64), join(domain('openmesh-manifest-v1'), await hash(encoded(unsigned, MANIFEST_MAX, 1048640)))), 'invalid-signature');
    return record;
}
export async function sealBox(options: SealBoxOptions): Promise<ProtocolResult<Uint8Array>> {
    try {
        const raw = encoded(options.body, BODY_MAX, 4096, 1);
        const body = decoded(raw, BODY_MAX, 4096, 1) as Map<CborValue, CborValue>;
        const tag = fixed(options.tag, 16);
        const now = uint(options.now);
        const kind = options.kind;
        const profile: unknown = options.profile;
        demand(profile === 'small' || profile === 'chunked' || profile === 'fountain');
        validateBody(body, kind, profile);
        demand(Array.isArray(options.recipients) && options.recipients.length >= 1 && options.recipients.length <= 20);
        const contacts = options.recipients.map(snapshotContact);
        const senderContact = snapshotContact(options.sender.contact);
        const keys = options.sender.keys;
        const manifestBytes = options.manifest === undefined ? undefined : bounded(options.manifest, MANIFEST_MAX + 1);
        const sender = requireValue(await referenceDevice(senderContact, now));
        checkKeys({ keys, contact: senderContact }, sender);
        const recipientRefs = await Promise.all(contacts.map(async (contact) => requireValue(await referenceDevice(contact, now))));
        recipientRefs.sort((a, b) => compareIds(a.deviceId, b.deviceId));
        for (let index = 1; index < recipientRefs.length; index++)
            demand(!equal(present(recipientRefs[index - 1]).deviceId, present(recipientRefs[index]).deviceId));
        if (kind === 3)
            demand(equal(encoded([body.get('root'), body.get('certificate')], 1024), sender.reference), 'invalid-sender');
        const header = new Map<CborValue, CborValue>([['v', 1], ['box_id', globalThis.crypto.getRandomValues(new Uint8Array(16))],
            ['profile', profile], ['tag', tag], ['size', 0], ['created_coarse', now / 86400n * 86400n]]);
        if (profile === 'chunked') {
            demand(manifestBytes !== undefined);
            const file = descriptor(body);
            const manifest = await checkManifest(manifestBytes, file, sender);
            header.set('chunk_size', present(manifest.get('chunk_size')));
            header.set('manifest_hash', present(file.get('file_id')));
        }
        else
            demand(manifestBytes === undefined);
        const compressed = requireValue(await compressDeflate(raw, { maxInputBytes: BODY_MAX, maxOutputBytes: BODY_MAX + 1024 }));
        const q = encoded([kind, sender.reference, raw.length, compressed]);
        const p = paddedLength(header, recipientRefs.length, q.length + 64);
        header.set('size', p);
        const recipients: ParsedBox['recipients'] = recipientRefs.map(reference => [reference.deviceId, new Uint8Array(32), new Uint8Array(48)]);
        const signature = new Uint8Array(await globalThis.crypto.subtle.sign('Ed25519', keys.deviceSigning.privateKey, await transcript(header, recipients, kind, raw, sender.reference)));
        const plaintext = new Uint8Array(p);
        plaintext.set(q);
        plaintext.set(signature, q.length);
        const contentKey = globalThis.crypto.getRandomValues(new Uint8Array(32));
        for (let index = 0; index < recipientRefs.length; index++) {
            const reference = present(recipientRefs[index]);
            const wrapped = requireValue(await sealHpkeBase(reference.certificate.device_pub_dh, contentKey, {
                info: join(domain('openmesh-box-v1'), fixed(header.get('box_id'), 16), reference.deviceId),
                aad: new Uint8Array(), limits: { maxPlaintextBytes: 32, maxContextBytes: 128 }
            }));
            recipients[index] = [reference.deviceId, wrapped.enc, wrapped.ciphertext];
        }
        const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
        const key = await globalThis.crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt']);
        contentKey.fill(0);
        const ciphertext = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce,
            additionalData: await payloadAad({ headerMap: header, recipients }), tagLength: 128 }, key, plaintext));
        const wire = join(new Uint8Array([1]), encoded([header, recipients, nonce, ciphertext]));
        requireValue(parseBox(wire));
        return { ok: true, value: wire };
    }
    catch (error) {
        return failure(error);
    }
}
export async function openBox(input: unknown, options: OpenBoxOptions): Promise<ProtocolResult<OpenedBox>> {
    try {
        const parsed = requireValue(parseBox(input));
        const expectedSender = snapshotContact(options.expectedSender);
        const contact = snapshotContact(options.recipient.contact);
        const keys = options.recipient.keys;
        const now = uint(options.now);
        const recipient = requireValue(await referenceDevice(contact, now));
        checkKeys({ keys, contact }, recipient);
        const entry = parsed.recipients.find(item => equal(item[0], recipient.deviceId));
        demand(entry, 'wrong-recipient');
        const contentKey = requireValue(await openHpkeBase(keys.deviceEncryption, entry[1], entry[2], {
            info: join(domain('openmesh-box-v1'), parsed.header.box_id, recipient.deviceId), aad: new Uint8Array(),
            limits: { maxPlaintextBytes: 32, maxContextBytes: 128 }
        }));
        demand(contentKey.length === 32);
        const key = await globalThis.crypto.subtle.importKey('raw', fixed(contentKey), 'AES-GCM', false, ['decrypt']);
        contentKey.fill(0);
        const plaintext = new Uint8Array(await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: fixed(parsed.nonce),
            additionalData: await payloadAad(parsed), tagLength: 128 }, key, fixed(parsed.ciphertext)));
        const prefix = requireValue(decodeCborPrefix(plaintext, codecLimits()));
        const q = prefix.value;
        demand(Array.isArray(q) && q.length === 4);
        const kind = Number(uint(q[0]));
        demand(kind >= 0 && kind <= 3);
        const reference = bounded(q[1], 1024);
        const rawSize = uint(q[2]);
        demand(rawSize <= BigInt(BODY_MAX), 'limit-exceeded');
        const signatureOffset = prefix.consumedBytes;
        demand(signatureOffset + 64 <= plaintext.length);
        const signature = plaintext.slice(signatureOffset, signatureOffset + 64);
        demand(plaintext.subarray(signatureOffset + 64).every(byte => byte === 0), 'invalid-padding');
        demand(paddedLength(parsed.headerMap, parsed.recipients.length, signatureOffset + 64) === plaintext.length, 'invalid-padding');
        const sender = requireValue(await referenceDevice(expectedSender, now));
        demand(equal(reference, sender.reference), 'invalid-sender');
        const raw = requireValue(await decompressDeflate(q[3], { maxInputBytes: plaintext.length, maxOutputBytes: Number(rawSize) }));
        demand(raw.length === Number(rawSize));
        const bodyValue = decoded(raw, BODY_MAX, 4096, 1);
        demand(bodyValue instanceof Map);
        const body = bodyValue;
        // Body field sets depend on kind and are validated after its signed bytes.
        const publicKey = await globalThis.crypto.subtle.importKey('raw', fixed(sender.certificate.device_pub_sign, 32), 'Ed25519', false, ['verify']);
        demand(await globalThis.crypto.subtle.verify('Ed25519', publicKey, signature, await transcript(parsed.headerMap, parsed.recipients, kind, raw, reference)), 'invalid-signature');
        validateBody(body, kind, parsed.header.profile);
        if (kind === 3)
            demand(equal(encoded([body.get('root'), body.get('certificate')], 1024), reference), 'invalid-sender');
        if (parsed.header.profile === 'chunked')
            demand(equal(fixed(descriptor(body).get('file_id'), 32), present(parsed.header.manifest_hash)), 'hash-mismatch');
        const exposedBody = decoded(raw, BODY_MAX, 4096, 1) as Map<CborValue, CborValue>;
        if (kind === 2) {
            exposedBody.set('received_coarse', uint(exposedBody.get('received_coarse')));
            exposedBody.set('status', uint(exposedBody.get('status')));
        }
        const exposedHeader = { ...parsed.header, box_id: parsed.header.box_id.slice(), tag: parsed.header.tag.slice(),
            ...(parsed.header.manifest_hash ? { manifest_hash: parsed.header.manifest_hash.slice() } : {}) };
        const opened: OpenedBox = Object.freeze({ header: exposedHeader, kind, body: exposedBody });
        verified.set(opened, { parsed, body, sender,
            recipientId: recipient.deviceId.slice(), reference: await hash(join(encoded(parsed.headerMap, 1024), parsed.ciphertext)),
            complete: parsed.header.profile !== 'chunked', fileBusy: false });
        return { ok: true, value: opened };
    }
    catch (error) {
        return failure(error);
    }
}
export interface SealFileOptions {
    sender: BoxSender;
    source: AsyncIterable<Uint8Array>;
    size: number | bigint;
    name: string;
    mediaType: string;
    now: number | bigint;
    emit: (index: number, bytes: Uint8Array) => Promise<void>;
}
export interface SealedFile {
    manifest: Uint8Array;
    descriptor: Map<CborValue, CborValue>;
}
export async function sealFile(options: SealFileOptions): Promise<ProtocolResult<SealedFile>> {
    try {
        const source = options.source;
        const emit = options.emit;
        const size = uint(options.size);
        const chunkSize = requireValue(chunkSizeForFile(size));
        const capacity = chunkSize - 16;
        const count = size === 0n ? 1n : (size + BigInt(capacity) - 1n) / BigInt(capacity);
        demand(count <= 262144n && (size + 15n) / 16n + count * 4n <= (1n << 32n), 'limit-exceeded');
        text(options.name, 1024);
        text(options.mediaType, 255);
        const name = options.name;
        const mediaType = options.mediaType;
        const keys = options.sender.keys;
        const contact = snapshotContact(options.sender.contact);
        const reference = requireValue(await referenceDevice(contact, uint(options.now)));
        checkKeys({ keys, contact }, reference);
        const fileKey = globalThis.crypto.getRandomValues(new Uint8Array(32));
        const streamId = globalThis.crypto.getRandomValues(new Uint8Array(32));
        const key = await globalThis.crypto.subtle.importKey('raw', fileKey, 'AES-GCM', false, ['encrypt']);
        const ids: Uint8Array[] = [];
        const lengths: bigint[] = [];
        let pending = new Uint8Array(capacity);
        let used = 0;
        let received = 0n;
        let index = 0;
        async function flush(final: boolean) {
            const ciphertext = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM',
                iv: nonceForChunk(index, final), additionalData: chunkAad(streamId, index, final), tagLength: 128 }, key, pending.subarray(0, used)));
            ids.push(await hash(ciphertext));
            lengths.push(BigInt(ciphertext.length));
            await emit(index, ciphertext);
            index++;
            used = 0;
            pending = new Uint8Array(capacity);
        }
        for await (const input of source) {
            demand(input instanceof Uint8Array);
            demand(BigInt(input.length) <= size - received, 'size-mismatch');
            let offset = 0;
            while (offset < input.length) {
                const copied = Math.min(capacity - used, input.length - offset);
                pending.set(input.subarray(offset, offset + copied), used);
                used += copied;
                offset += copied;
                received += BigInt(copied);
                if (used === capacity && received < size)
                    await flush(false);
            }
        }
        demand(received === size, 'size-mismatch');
        await flush(true);
        const unsigned = new Map<CborValue, CborValue>([['v', 1], ['stream_id', streamId], ['size', size],
            ['chunk_size', chunkSize], ['count', count], ['final_index', count - 1n], ['chunk_ids', ids], ['chunk_sizes', lengths],
            ['aead', 'stream-aes256gcm-v1'], ['sender', reference.deviceId]]);
        const signature = new Uint8Array(await globalThis.crypto.subtle.sign('Ed25519', keys.deviceSigning.privateKey, join(domain('openmesh-manifest-v1'), await hash(encoded(unsigned, MANIFEST_MAX, 1048640)))));
        unsigned.set('sig', signature);
        const manifestBytes = encoded(unsigned, MANIFEST_MAX, 1048640);
        const manifest = join(new Uint8Array([1]), manifestBytes);
        requireValue(parseManifest(manifest));
        const file = new Map<CborValue, CborValue>([['file_id', await hash(manifestBytes)], ['file_key', fileKey], ['name', name], ['media_type', mediaType]]);
        return { ok: true, value: { manifest, descriptor: file } };
    }
    catch (error) {
        return failure(error);
    }
}
export interface OpenFileOptions {
    manifest: Uint8Array;
    source: AsyncIterable<{
        index: number;
        bytes: Uint8Array;
    }>;
    emit: (index: number, bytes: Uint8Array) => Promise<void>;
}
export async function openFile(opened: OpenedBox, options: OpenFileOptions): Promise<ProtocolResult<void>> {
    const proof = verified.get(opened);
    if (!proof || proof.parsed.header.profile !== 'chunked' || proof.fileBusy)
        return { ok: false, error: 'invalid-state' };
    proof.fileBusy = true;
    try {
        const source = options.source;
        const emit = options.emit;
        const file = descriptor(proof.body);
        const manifest = await checkManifest(bounded(options.manifest, MANIFEST_MAX + 1), file, proof.sender);
        demand(uint(manifest.get('chunk_size')) === proof.parsed.header.chunk_size);
        const ids = manifest.get('chunk_ids') as Uint8Array[];
        const sizes = manifest.get('chunk_sizes') as bigint[];
        const streamId = fixed(manifest.get('stream_id'), 32);
        const key = await globalThis.crypto.subtle.importKey('raw', fixed(file.get('file_key'), 32), 'AES-GCM', false, ['decrypt']);
        const held = new Uint8Array(ids.length);
        let count = 0;
        for await (const item of source) {
            demand(Number.isSafeInteger(item.index) && item.index >= 0 && item.index < ids.length);
            const index = item.index;
            demand(item.bytes instanceof Uint8Array && BigInt(item.bytes.length) === sizes[index]);
            const ciphertext = fixed(item.bytes);
            demand(equal(await hash(ciphertext), present(ids[index])), 'hash-mismatch');
            if (held[index])
                continue;
            const final = index === ids.length - 1;
            const plaintext = new Uint8Array(await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM',
                iv: nonceForChunk(index, final), additionalData: chunkAad(streamId, index, final), tagLength: 128 }, key, ciphertext));
            await emit(index, plaintext);
            held[index] = 1;
            count++;
        }
        demand(count === ids.length, 'incomplete');
        proof.complete = true;
        return { ok: true, value: undefined };
    }
    catch (error) {
        return failure(error);
    }
    finally {
        proof.fileBusy = false;
    }
}
export interface ReceiptOptions {
    sender: BoxSender;
    recipient: DeviceContact;
    now: number | bigint;
    tag: Uint8Array;
}
export async function createReceipt(opened: OpenedBox, options: ReceiptOptions): Promise<ProtocolResult<Uint8Array>> {
    try {
        const proof = verified.get(opened);
        demand(proof?.complete, 'incomplete');
        const now = uint(options.now);
        const tag = fixed(options.tag, 16);
        const sender = { keys: options.sender.keys, contact: snapshotContact(options.sender.contact) };
        const recipientContact = snapshotContact(options.recipient);
        const recipient = requireValue(await referenceDevice(sender.contact, now));
        demand(equal(recipient.deviceId, proof.recipientId), 'wrong-recipient');
        const destination = requireValue(await referenceDevice(recipientContact, now));
        demand(equal(destination.deviceId, proof.sender.deviceId), 'wrong-recipient');
        const body = new Map<CborValue, CborValue>([
            ['box_id', proof.reference], ['device', proof.recipientId],
            ['status', 0], ['received_coarse', now / 60n * 60n],
        ]);
        if (proof.parsed.header.profile === 'chunked') {
            body.set('manifest_hash', present(proof.parsed.header.manifest_hash));
        }
        return await sealBox({ sender, recipients: [recipientContact], tag, now,
            profile: 'small', kind: 2, body });
    }
    catch (error) {
        return failure(error);
    }
}
export interface VerifyReceiptOptions {
    /** Exact sent bytes from the trusted local outbox, not a network-supplied original. */
    original: Uint8Array;
    sender: BoxSender;
    expectedRecipient: DeviceContact;
    now: number | bigint;
}
export async function verifyReceipt(input: unknown, options: VerifyReceiptOptions): Promise<ProtocolResult<{
    body: Map<CborValue, CborValue>;
    idempotencyKey: string;
}>> {
    try {
        const original = requireValue(parseBox(options.original));
        const receiptBytes = bounded(input, 2097152);
        const now = uint(options.now);
        const expectedContact = snapshotContact(options.expectedRecipient);
        const sender = { keys: options.sender.keys, contact: snapshotContact(options.sender.contact) };
        const expectedReference = await hash(join(encoded(original.headerMap, 1024), original.ciphertext));
        const expectedRecipient = requireValue(await referenceDevice(expectedContact, now));
        demand(original.recipients.some(entry => equal(entry[0], expectedRecipient.deviceId)), 'wrong-recipient');
        const receipt = requireValue(await openBox(receiptBytes, { recipient: sender, expectedSender: expectedContact, now }));
        demand(receipt.kind === 2, 'invalid-receipt');
        const body = receipt.body;
        demand(equal(fixed(body.get('box_id'), 32), expectedReference), 'unknown-box');
        demand(equal(fixed(body.get('device'), 16), expectedRecipient.deviceId), 'wrong-recipient');
        if (original.header.profile === 'chunked')
            demand(equal(fixed(body.get('manifest_hash'), 32), present(original.header.manifest_hash)), 'hash-mismatch');
        else
            demand(!body.has('manifest_hash'));
        const keyBytes = join(expectedReference, expectedRecipient.deviceId, new Uint8Array([0]));
        const idempotencyKey = Array.from(keyBytes, byte => byte.toString(16).padStart(2, '0')).join('');
        return { ok: true, value: { body, idempotencyKey } };
    }
    catch (error) {
        return failure(error);
    }
}
