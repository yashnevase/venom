import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createIdentityKeys } from './src/identity.js';
import { openBox, openFile, verifyReceipt } from './src/box.js';
import { encodeCbor } from './src/cbor.js';
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
const hex = (text: string) => new Uint8Array(Buffer.from(text, 'hex'));
interface Vector {
    id: string;
    kind: number;
    sender: string;
    recipient: string;
    wire_hex: string;
    body_hex: string;
    original_id?: string;
    manifest_hex?: string;
    chunks_hex?: string[];
    file_hex?: string;
}
const data = JSON.parse(await readFile(new URL('../test-vectors/envelopes.json', import.meta.url), 'utf8')) as {
    now: number;
    actors: {
        name: string;
        root_hex: string;
        certificate_hex: string;
        seeds_hex: [
            string,
            string,
            string
        ];
    }[];
    vectors: Vector[];
    negative_file_vectors: { id: string; wire_hex: string; manifest_hex: string; chunks_hex: string[] }[];
    negative_vectors: {
        id: string;
        sender: string;
        recipient: string;
        wire_hex: string;
    }[];
};
const actors = await Promise.all(data.actors.map(async (actor) => ({ name: actor.name,
    keys: value(await createIdentityKeys({ root: hex(actor.seeds_hex[0]),
        deviceSigning: hex(actor.seeds_hex[1]), deviceEncryption: hex(actor.seeds_hex[2]) })),
    contact: { root: hex(actor.root_hex), certificate: hex(actor.certificate_hex) } })));
function actor(name: string) {
    const result = actors.find(item => item.name === name);
    if (!result)
        throw new Error('Unknown fixture actor');
    return result;
}
describe('independent Python complete-envelope vectors', () => {
    for (const vector of data.vectors) {
        it(vector.id, async () => {
            const sender = actor(vector.sender);
            const recipient = actor(vector.recipient);
            const opened = value(await openBox(hex(vector.wire_hex), { recipient,
                expectedSender: sender.contact, now: data.now }));
            expect(opened.kind).toBe(vector.kind);
            const body = value(encodeCbor(opened.body, { maxBytes: 1048576, maxDepth: 12, maxItems: 4096 }));
            expect(Buffer.from(body).toString('hex')).toBe(vector.body_hex);
            if (vector.manifest_hex && vector.chunks_hex) {
                const chunks = vector.chunks_hex.map(hex);
                async function* source() {
                    for (const [index, bytes] of chunks.entries())
                        yield await Promise.resolve({ index, bytes });
                }
                const output: Uint8Array[] = [];
                expect((await openFile(opened, { manifest: hex(vector.manifest_hex), source: source(),
                    emit: (_index, bytes) => { output.push(bytes); return Promise.resolve(); } })).ok).toBe(true);
                expect(Buffer.concat(output).toString('hex')).toBe(vector.file_hex);
            }
            if (vector.original_id) {
                const original = data.vectors.find(item => item.id === vector.original_id);
                if (!original)
                    throw new Error('Missing original vector');
                expect((await verifyReceipt(hex(vector.wire_hex), { original: hex(original.wire_hex), sender: recipient,
                    expectedRecipient: sender.contact, now: data.now })).ok).toBe(true);
            }
        });
    }
    for (const vector of data.negative_vectors) {
        it(`rejects independently generated ${vector.id}`, async () => {
            const result = await openBox(hex(vector.wire_hex), { recipient: actor(vector.recipient),
                expectedSender: actor(vector.sender).contact, now: data.now });
            expect(result.ok).toBe(false);
            if (!result.ok && ['kind', 'body', 'certificate', 'recipients', 'attachments'].includes(vector.id)) {
                expect(result.error).toBe('invalid-signature');
            }
        });
    }
    for (const vector of data.negative_file_vectors) {
        it(`rejects independently signed ${vector.id} file stream`, async () => {
            const opened = value(await openBox(hex(vector.wire_hex), {
                recipient: actor('bob'), expectedSender: actor('alice').contact, now: data.now,
            }));
            async function* source() {
                for (const [index, chunk] of vector.chunks_hex.entries()) {
                    yield await Promise.resolve({ index, bytes: hex(chunk) });
                }
            }
            expect((await openFile(opened, { manifest: hex(vector.manifest_hex), source: source(),
                emit: () => Promise.resolve() })).ok).toBe(false);
        });
    }
});
