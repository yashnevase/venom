import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { createIdentityKeys, createReceipt, verifyReceipt } from '@openmesh/core';
import { sourceFromBlob, FileCarrier, createBlobWriter } from '../carriers/file/src/index.js';
import { encodeBundle, createBundleSource } from './src/bundle.js';
import { importBundle } from './src/import.js';

it('opens an independent message fixture and commits only after complete bundle validation', async () => {
  const fixture = JSON.parse(await readFile(new URL('../test-vectors/envelopes.json', import.meta.url), 'utf8')) as {
    now: number; actors: { name: string; seeds_hex: [string, string, string]; root_hex: string; certificate_hex: string }[];
    vectors: { id: string; wire_hex: string }[];
  };
  const hex = (value: string) => new Uint8Array(Buffer.from(value, 'hex'));
  const alice = fixture.actors.find(actor => actor.name === 'alice');
  const bob = fixture.actors.find(actor => actor.name === 'bob');
  const vector = fixture.vectors.find(vector => vector.id === 'small');
  if (!alice || !bob || !vector) throw new Error('Missing fixture');
  const keys = await createIdentityKeys({ root: hex(bob.seeds_hex[0]), deviceSigning: hex(bob.seeds_hex[1]), deviceEncryption: hex(bob.seeds_hex[2]) });
  if (!keys.ok) throw new Error(keys.error);
  let artifact: Blob | undefined;
  const exportSource = createBundleSource(hex(vector.wire_hex), null,
    { sizes: [], async *open() {} }, 64, 10000);
  const carrier = new FileCarrier({ maxBoxBytes: 10000, maxReadBytes: 64, maxPollRecords: 1,
    available: () => Promise.resolve(true),
    beginExport: size => Promise.resolve(createBlobWriter(size, 10000, blob => {
      artifact = blob; return Promise.resolve();
    })), async *readImports() {} });
  expect((await carrier.put(exportSource)).ok).toBe(true);
  if (!artifact) throw new Error('Missing artifact');
  const bytes = new Uint8Array(await artifact.arrayBuffer());
  for (const extra of [false, true]) {
    let committed = false; let aborted = false;
    const wire = extra ? new Uint8Array([...bytes, 0]) : bytes;
    const result = await importBundle(sourceFromBlob(new Blob([wire]), 64), {
      maxBytes: 10000, maxReadBytes: 64, maxRecordBytes: 4096, maxChunks: 4,
    }, { recipient: { keys: keys.value, contact: { root: hex(bob.root_hex), certificate: hex(bob.certificate_hex) } },
      expectedSender: { root: hex(alice.root_hex), certificate: hex(alice.certificate_hex) }, now: fixture.now }, {
      stageChunk: () => Promise.resolve(),
      async *readChunks() {},
      writePlaintext: () => Promise.resolve(),
      commit: () => { committed = true; return Promise.resolve(); },
      abort: () => { aborted = true; return Promise.resolve(); },
    });
    expect(result.ok).toBe(!extra);
    expect(committed).toBe(!extra);
    expect(aborted).toBe(extra);
  }
});

it('imports a complete independent file and rolls back changed ciphertext', async () => {
  const data = JSON.parse(await readFile(new URL('../test-vectors/envelopes.json', import.meta.url), 'utf8')) as {
    now: number; actors: { name: string; seeds_hex: [string, string, string]; root_hex: string; certificate_hex: string }[];
    vectors: { id: string; wire_hex: string; manifest_hex?: string; chunks_hex?: string[]; file_hex?: string }[];
  };
  const hex = (text: string) => new Uint8Array(Buffer.from(text, 'hex'));
  const alice = data.actors.find(actor => actor.name === 'alice');
  const bob = data.actors.find(actor => actor.name === 'bob');
  for (const fixtureId of ['chunked-0', 'chunked-65521']) {
  const vector = data.vectors.find(vector => vector.id === fixtureId);
  if (!alice || !bob || !vector?.manifest_hex || !vector.chunks_hex) throw new Error('Missing fixture');
  const keys = await createIdentityKeys({ root: hex(bob.seeds_hex[0]), deviceSigning: hex(bob.seeds_hex[1]), deviceEncryption: hex(bob.seeds_hex[2]) });
  if (!keys.ok) throw new Error(keys.error);
  for (const mode of ['valid', 'corrupt', 'stage-fail', 'write-fail', 'commit-fail', 'wrong-recipient']) {
    const corrupt = mode === 'corrupt';
    const chunks = vector.chunks_hex.map(hex);
    if (corrupt) { const first = chunks[0]; if (!first) throw new Error('Missing chunk'); first[0] = 255; }
    const parts: Uint8Array[] = [];
    for await (const part of encodeBundle(hex(vector.wire_hex), hex(vector.manifest_hex), chunks, 16384)) parts.push(part);
    const staged: { index: number; bytes: Uint8Array }[] = [];
    let stagedCalls = 0;
    const plaintext: Uint8Array[] = [];
    let committed = false; let aborted = false;
    const result = await importBundle(sourceFromBlob(new Blob(parts), 16384), {
      maxBytes: 200000, maxReadBytes: 16384, maxRecordBytes: 70000, maxChunks: 4,
    }, { recipient: { keys: keys.value, contact: mode === 'wrong-recipient' ? { root: hex(alice.root_hex), certificate: hex(alice.certificate_hex) } : { root: hex(bob.root_hex), certificate: hex(bob.certificate_hex) } },
      expectedSender: { root: hex(alice.root_hex), certificate: hex(alice.certificate_hex) }, now: data.now }, {
      stageChunk: (index, bytes) => { stagedCalls++; if (mode === 'stage-fail') return Promise.reject(new Error('stage failed')); staged.push({ index, bytes }); return Promise.resolve(); },
      async *readChunks() { for (const item of staged) yield await Promise.resolve(item); },
      writePlaintext: (_index, bytes) => { if (mode === 'write-fail') return Promise.reject(new Error('write failed')); plaintext.push(bytes); return Promise.resolve(); },
      commit: () => { if (mode === 'commit-fail') return Promise.reject(new Error('commit failed')); committed = true; return Promise.resolve(); },
      abort: () => { aborted = true; staged.length = 0; plaintext.length = 0; return Promise.resolve(); },
    });
    if (corrupt) expect(stagedCalls).toBe(0);
    expect(result.ok).toBe(mode === 'valid');
    expect(committed).toBe(mode === 'valid');
    expect(aborted).toBe(mode !== 'valid');
    if (mode === 'valid') {
      expect(Buffer.concat(plaintext).toString('hex')).toBe(vector.file_hex);
      if (!result.ok) throw new Error(result.error);
      const aliceKeys = await createIdentityKeys({ root: hex(alice.seeds_hex[0]),
        deviceSigning: hex(alice.seeds_hex[1]), deviceEncryption: hex(alice.seeds_hex[2]) });
      if (!aliceKeys.ok) throw new Error(aliceKeys.error);
      const aliceContact = { root: hex(alice.root_hex), certificate: hex(alice.certificate_hex) };
      const bobContact = { root: hex(bob.root_hex), certificate: hex(bob.certificate_hex) };
      const receipt = await createReceipt(result.value, { sender: { keys: keys.value, contact: bobContact },
        recipient: aliceContact, now: data.now, tag: new Uint8Array(16) });
      if (!receipt.ok) throw new Error(receipt.error);
      expect((await verifyReceipt(receipt.value, { original: hex(vector.wire_hex),
        sender: { keys: aliceKeys.value, contact: aliceContact }, expectedRecipient: bobContact, now: data.now })).ok).toBe(true);
    }
    else expect(plaintext).toEqual([]);
  }
  }
});
