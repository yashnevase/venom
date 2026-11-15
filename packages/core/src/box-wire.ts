import { decodeCbor, encodeCbor } from './cbor.js';
import type { CborValue } from './cbor.js';
import { decodeBoxHeader } from './box-header.js';
import type { BoxHeader } from './box-header.js';
import { chunkSizeForFile } from './chunk.js';
import { verifyDeviceCertificate } from './identity.js';
import type { DeviceCertificate } from './identity.js';
export type ProtocolResult<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    error: string;
};
export interface DeviceContact {
    root: Uint8Array;
    certificate: Uint8Array;
    revocation?: Uint8Array;
}
export interface DeviceReference {
    reference: Uint8Array;
    deviceId: Uint8Array;
    certificate: DeviceCertificate;
}
export interface ParsedBox {
    header: BoxHeader;
    headerMap: Map<CborValue, CborValue>;
    recipients: [
        Uint8Array,
        Uint8Array,
        Uint8Array
    ][];
    nonce: Uint8Array;
    ciphertext: Uint8Array;
}
export class ProtocolFailure extends Error {
    constructor(readonly code: string) { super(code); }
}
export function requireValue<T>(result: ProtocolResult<T>): T {
    if (!result.ok)
        throw new ProtocolFailure(result.error);
    return result.value;
}
export function failure(error: unknown): ProtocolResult<never> {
    return { ok: false, error: error instanceof ProtocolFailure ? error.code : 'operation-failed' };
}
export function demand(condition: unknown, error = 'invalid-record'): asserts condition {
    if (!condition)
        throw new ProtocolFailure(error);
}
export const CONTROL_MAX = 2097152;
export const BODY_MAX = 1048576;
export const MANIFEST_MAX = 16777216;
export const codecLimits = (maxBytes = CONTROL_MAX, maxItems = 4096) => ({ maxBytes, maxDepth: 12, maxItems });
export const domain = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);
export function join(...pieces: Uint8Array[]): Uint8Array<ArrayBuffer> {
    const result = new Uint8Array(pieces.reduce((sum, piece) => sum + piece.length, 0));
    let offset = 0;
    for (const piece of pieces) {
        result.set(piece, offset);
        offset += piece.length;
    }
    return result;
}
export function fixed(value: unknown, size?: number): Uint8Array<ArrayBuffer> {
    demand(value instanceof Uint8Array && (size === undefined || value.length === size));
    return new Uint8Array(value);
}
export function present<T>(value: T | undefined): T {
    demand(value !== undefined);
    return value;
}
export function bounded(value: unknown, maximum: number): Uint8Array<ArrayBuffer> {
    demand(value instanceof Uint8Array);
    demand(value.byteLength <= maximum, 'limit-exceeded');
    return fixed(value);
}
export function equal(left: Uint8Array, right: Uint8Array): boolean {
    return left.length === right.length && left.every((byte, index) => byte === right[index]);
}
export function uint(value: unknown): bigint {
    const integer = typeof value === 'number' && Number.isSafeInteger(value) ? BigInt(value) : value;
    demand(typeof integer === 'bigint' && integer >= 0n && integer < (1n << 64n));
    return integer;
}
export function map(value: unknown, required: string[], optional: string[] = []): Map<CborValue, CborValue> {
    demand(value instanceof Map);
    demand(required.every(key => value.has(key)));
    demand([...value.keys()].every(key => typeof key === 'string' && [...required, ...optional].includes(key)));
    return value as Map<CborValue, CborValue>;
}
export function encoded(value: unknown, maxBytes = CONTROL_MAX, maxItems = 4096, maxArrayLength?: number): Uint8Array {
    return requireValue(encodeCbor(value, { ...codecLimits(maxBytes, maxItems),
        ...(maxArrayLength === undefined ? {} : { maxArrayLength }) }));
}
export function decoded(bytes: Uint8Array, maxBytes = CONTROL_MAX, maxItems = 4096, maxArrayLength?: number): CborValue {
    return requireValue(decodeCbor(bytes, { ...codecLimits(maxBytes, maxItems),
        ...(maxArrayLength === undefined ? {} : { maxArrayLength }) }));
}
export async function hash(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
    return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes)));
}
export function snapshotContact(contact: DeviceContact): DeviceContact {
    const copy: DeviceContact = { root: fixed(contact.root, 32), certificate: bounded(contact.certificate, 1024) };
    demand(copy.certificate.length <= 1024, 'limit-exceeded');
    if (contact.revocation !== undefined)
        copy.revocation = bounded(contact.revocation, 1024);
    return copy;
}
export async function referenceDevice(contact: DeviceContact, now: number | bigint): Promise<ProtocolResult<DeviceReference>> {
    try {
        const copy = snapshotContact(contact);
        const certificate = requireValue(await verifyDeviceCertificate(copy.certificate, copy.root, { now: uint(now), limits: codecLimits(1024), ...(copy.revocation ? { revocation: copy.revocation } : {}) }));
        const reference = encoded([copy.root, copy.certificate], 1024);
        const deviceId = (await hash(reference)).slice(0, 16);
        return { ok: true, value: { reference, deviceId, certificate } };
    }
    catch (error) {
        return failure(error);
    }
}
export function parseBox(input: unknown, limits: {
    maxBytes?: number;
} = {}): ProtocolResult<ParsedBox> {
    try {
        demand(input instanceof Uint8Array && input.length > 0);
        demand(input[0] === 1, 'unsupported-version');
        const maxBytes = limits.maxBytes ?? CONTROL_MAX;
        demand(Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= CONTROL_MAX, 'invalid-limits');
        demand(input.length <= maxBytes, 'limit-exceeded');
        const outer = decoded(input.subarray(1), maxBytes, 4096, 20);
        demand(Array.isArray(outer) && outer.length === 4);
        const headerMap = map(outer[0], ['v', 'box_id', 'profile', 'tag', 'size', 'created_coarse'], ['chunk_size', 'manifest_hash']);
        const header = requireValue(decodeBoxHeader(encoded(headerMap, 1024), codecLimits(1024)));
        demand(header.created_coarse % 86400n === 0n);
        demand(header.size <= BigInt(CONTROL_MAX) && header.size >= 64n, 'limit-exceeded');
        if (header.profile === 'chunked')
            demand(header.chunk_size !== undefined && header.manifest_hash !== undefined);
        else
            demand(header.chunk_size === undefined && header.manifest_hash === undefined);
        demand(header.profile !== 'small' || input.length <= 16384, 'limit-exceeded');
        demand(Array.isArray(outer[1]) && outer[1].length >= 1 && outer[1].length <= 20);
        const recipients: ParsedBox['recipients'] = [];
        let previous: Uint8Array | undefined;
        for (const entry of outer[1]) {
            demand(Array.isArray(entry) && entry.length === 3);
            const id = fixed(entry[0], 16);
            if (previous)
                demand(compareIds(previous, id) < 0);
            recipients.push([id, fixed(entry[1], 32), fixed(entry[2], 48)]);
            previous = id;
        }
        const nonce = fixed(outer[2], 12);
        const ciphertext = fixed(outer[3]);
        demand(ciphertext.length === Number(header.size) + 16);
        return { ok: true, value: { header, headerMap, recipients, nonce, ciphertext } };
    }
    catch (error) {
        return failure(error);
    }
}
export function compareIds(left: Uint8Array, right: Uint8Array): number {
    for (let i = 0; i < left.length; i++) {
        const difference = present(left[i]) - present(right[i]);
        if (difference !== 0)
            return difference;
    }
    return 0;
}
export function manifestMap(input: unknown, maximumChunks = 262144): Map<CborValue, CborValue> {
    const record = map(input, ['v', 'stream_id', 'size', 'chunk_size', 'count', 'final_index', 'chunk_ids', 'chunk_sizes', 'aead', 'sender', 'sig']);
    demand(uint(record.get('v')) === 1n, 'unsupported-version');
    fixed(record.get('stream_id'), 32);
    fixed(record.get('sender'), 16);
    fixed(record.get('sig'), 64);
    demand(record.get('aead') === 'stream-aes256gcm-v1');
    for (const key of ['v', 'size', 'chunk_size', 'count', 'final_index'])
        record.set(key, uint(record.get(key)));
    const size = uint(record.get('size'));
    const chunkSize = uint(record.get('chunk_size'));
    demand(chunkSize === BigInt(requireValue(chunkSizeForFile(size))));
    const count = uint(record.get('count'));
    demand(count >= 1n && count <= BigInt(maximumChunks) && uint(record.get('final_index')) === count - 1n, 'limit-exceeded');
    const ids = record.get('chunk_ids');
    const sizes = record.get('chunk_sizes');
    demand(Array.isArray(ids) && Array.isArray(sizes) && ids.length === Number(count) && sizes.length === Number(count));
    let total = 0n;
    let blocks = 0n;
    const lengths: bigint[] = [];
    for (let i = 0; i < ids.length; i++) {
        fixed(ids[i], 32);
        const length = uint(sizes[i]);
        demand(length >= 16n && length <= chunkSize);
        if (i < ids.length - 1)
            demand(length === chunkSize);
        else
            demand(length > 16n || (size === 0n && count === 1n));
        total += length - 16n;
        blocks += (length - 16n + 15n) / 16n + 4n;
        lengths.push(length);
    }
    demand(total === size && blocks <= (1n << 32n), 'limit-exceeded');
    record.set('chunk_sizes', lengths);
    return record;
}
export function parseManifest(input: unknown, limits: { maxBytes?: number; maxChunks?: number } = {}): ProtocolResult<Map<CborValue, CborValue>> {
    try {
        demand(input instanceof Uint8Array && input.length > 0);
        demand(input[0] === 1, 'unsupported-version');
        const maxBytes = limits.maxBytes ?? MANIFEST_MAX;
        const maxChunks = limits.maxChunks ?? 262144;
        demand(Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= MANIFEST_MAX, 'invalid-limits');
        demand(Number.isSafeInteger(maxChunks) && maxChunks > 0 && maxChunks <= 262144, 'invalid-limits');
        demand(input.length - 1 <= maxBytes, 'limit-exceeded');
        return { ok: true, value: manifestMap(decoded(input.subarray(1), maxBytes, maxChunks * 2 + 64, maxChunks), maxChunks) };
    }
    catch (error) {
        return failure(error);
    }
}
export function paddedLength(header: Map<CborValue, CborValue>, recipientCount: number, minimum: number): number {
    const profile = header.get('profile');
    const increment = profile === 'chunked' ? Number(uint(header.get('chunk_size'))) : 65536;
    const buckets = [1024, 4096, 16384];
    if (profile !== 'small')
        for (let size = increment; size <= CONTROL_MAX; size += increment)
            buckets.push(size);
    for (const bucket of buckets) {
        // Header.size and the ciphertext bstr head have finitely many width states.
        for (const headerWidth of [1, 2, 3, 5])
            for (const cipherWidth of [1, 2, 3, 5]) {
                const candidate = bucket - (encoded(new Map([...header, ['size', 0]]), 1024).length - 1 + headerWidth)
                    - 102 * recipientCount - cipherWidth - 32;
                if (candidate < minimum || candidate > CONTROL_MAX)
                    continue;
                const proposed = new Map(header);
                proposed.set('size', candidate);
                const headLength = candidate + 16 < 24 ? 1 : candidate + 16 < 256 ? 2 : candidate + 16 < 65536 ? 3 : 5;
                const actual = encoded(proposed, 1024).length + 102 * recipientCount + headLength + candidate + 32;
                if (actual === bucket)
                    return candidate;
            }
    }
    throw new ProtocolFailure('limit-exceeded');
}
export function nonceForChunk(index: number, final: boolean): Uint8Array<ArrayBuffer> {
    const result = new Uint8Array(12);
    new DataView(result.buffer).setBigUint64(3, BigInt(index));
    result[11] = final ? 1 : 0;
    return result;
}
export function chunkAad(streamId: Uint8Array, index: number, final: boolean): Uint8Array<ArrayBuffer> {
    const suffix = new Uint8Array(9);
    new DataView(suffix.buffer).setBigUint64(0, BigInt(index));
    suffix[8] = final ? 1 : 0;
    return join(streamId, suffix);
}
