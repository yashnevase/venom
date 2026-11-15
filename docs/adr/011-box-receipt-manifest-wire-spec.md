# 011 — Box, Receipt and Manifest wire specification

## Status

Owner approved ADR 008 option 1 on 2026-11-15. The development-gate amendment is
recorded in AGENTS.md and docs/05 by commit 9273220. External review gates public
release, security promises and Gate E. Phase development uses the interim checks.

Experimental, not independently reviewed.

The owner explicitly approved option 1, random stream_id for chunk AAD while
retaining file_id as the final signed-manifest hash, on 2026-11-15. docs/04
development revision 2 freezes the resulting wire specification. Its acceptance
implementation tests and independent vectors are recorded in the acceptance
sections below. The whole Phase 1 gate audit is in docs/spikes/phase-1-gate-audit.md.

## Problem

The owner requested a complete acyclic Box, Receipt and Manifest specification.
AGENTS.md requires an ADR and an owner decision when a proposed construction
conflicts with another architecture rule. The owner's final instruction also
requires stopping and reporting such conflicts before choosing a replacement.

docs/09 T1 defines `file_id = SHA-256(manifest)`. The owner's part B.4 requires
chunk AAD to contain `file_id`, followed by hashing those ciphertext chunks,
building the manifest, and then computing its hash. These dependencies form
the following cycle.

```text
file_id -> chunk AAD -> ciphertext chunks -> chunk hashes -> manifest -> file_id
```

A fresh random content key does not break this identifier dependency. The
optional file_id field sketched inside the manifest in docs/11 would also need
an excluded-field rule if interpreted as the hash of that same manifest.

## Owner-approved requirements to carry into the freeze

1. Sign with the sender device Ed25519 key over the concatenation below. Hashes
   are SHA-256. Header and body use deterministic CBOR. The body includes
   attachments. Define recipient-id widths, sorting, kind values and certificate
   reference encoding in the final schemas. Test changing every semantic field.

   ```text
   "openmesh-box-v1" || H(header) || H(sorted recipient device ids)
     || u8(kind) || H(uncompressed body including attachments)
     || H(sender certificate reference)
   ```

2. Compress the body only with the selected bounded zlib-wrapped deflate codec.
   Append the fixed 64-byte signature after compression, then pad and apply
   AES-256-GCM. Header.size records padded plaintext bytes. Ciphertext length is
   that size plus the 16-byte authentication tag.
3. Bucket selection counts the complete encoded envelope, including version,
   framing, header, nonce, all recipient wraps, ciphertext and tag. Publish exact
   overhead and bucket calculations. Reject a small box above 16384 bytes total.
4. Chunking uses a fresh random per-file key. The requested nonce consists of an
   11-byte counter and a final byte. The requested AAD is file_id, chunk index and
   final flag. Chunks are computed before their hashes and manifest. The manifest
   records count, sizes and final index. Its hash precedes the signed header.
   Chunks take no header input. The identifier correction below is required.
5. A Receipt is signed by the recipient device. Its body references the SHA-256
   hash of the original header and ciphertext, the recipient device, status and
   integer seconds rounded to minutes. Include manifest_hash for chunked boxes
   and omit it for small boxes. Match the expected device, validate its
   certificate and reject revocation. Ignore duplicates by reference/device/status
   and drop unknown references. Distinguish this 32-byte content reference from
   the existing 16-byte random header box_id in the final schemas.
6. Use RFC 9180 Base mode with the decided suite. Application info is
   "openmesh-box-v1", header box_id and recipient device id. Cap wraps at 20.
   Decompression output is bounded by its declared size and by 1 MiB. Define the
   declared uncompressed length separately from padded header.size.
7. Recovery uses the BIP-39 English 24-word encoding of 256-bit entropy with its
   checksum. Derive root_seed with HKDF-SHA256 from entropy, salt
   "openmesh-root-v1" and info "ed25519-root". Record the wordlist's MIT license
   and size in a dependency ADR. Include independent entropy/mnemonic/root vectors.
8. The first byte dispatches the version. Ignore unsupported versions through a
   typed outcome. Validate every length and resource limit before allocation.

## Options

1. Add a fresh 32-byte stream_id before chunking. Chunk AAD becomes
   stream_id || u64be(chunk_index) || u8(final). Include stream_id and the stream
   parameters in the signed manifest. Keep file_id as SHA-256 of the final
   canonical signed manifest, computed externally and omitted from the manifest
   itself. This preserves docs/09's content-addressed file identifier while
   changing the identifier used by the owner's proposed AAD.
2. Redefine file_id as a fresh random value available before chunking. Keep
   manifest_hash as the content reference. This preserves the owner's AAD field
   name while changing docs/09's file_id definition and downstream terminology.
3. Retain both current definitions. The resulting cyclic construction provides
   no prescribed executable order.

## Recommendation

Option 1 is accepted by the owner. The resulting order is executable.

```text
random stream_id + random per-file key
  -> chunk encryption -> chunk hashes -> signed manifest
  -> manifest_hash / file_id -> final Box header -> Box signature and envelope
```

For the Box signature, compute compressed body bytes and encoded lengths before
signing. Reserve exactly 64 bytes for the appended signature. Choose the complete
envelope bucket and padded length from lengths alone, finalize header.size, then
sign the uncompressed body with that header. Append the resulting signature to
the already computed compressed body. This supplies the header hash before
signing without compressing a signature or estimating its contents.

The accepted convention, exact schemas, byte concatenations, profile limits
and overhead tables are recorded in docs/04 revision 2. Full acceptance tests
are the next implementation task and must fail before seal/open is implemented.

## Frozen serialization and resource choices

The owner delegated completion of the wire freeze. docs/04 revision 2 records
these additional serialization choices explicitly for implementation review.

- Version byte plus one deterministic CBOR four-item outer array. Header stays a
  map. Recipient entries are three-item arrays with 16/32/48-byte fields.
- Device id is the first 16 bytes of SHA-256 of the rooted certificate reference.
  Certificate/revocation maps and verification rules reuse ADR 004.
- The control plaintext uses a CBOR prefix, fixed 64-byte signature and zero
  padding. File metadata/key lives in a descriptor. File chunks contain raw
  file bytes, independently of that control payload. v1 has one file per Box.
- Recipient wraps are created before payload encryption. Payload AAD binds
  SHA-256 of the complete canonical recipient list, including every wrap.
- Manifest signatures have their own domain and exclude sig from their input.
  file_id is outside the signed manifest. Header/descriptor hashes must agree.
- Header.box_id remains random16. Receipt.body.box_id is the owner's requested
  digest32 with its exact concatenation specified separately. HPKE uses random16.
- Fountain bucket increments after 16384 bytes are 65536. Chunked increments
  use the selected header chunk size. Empty streams have one empty final chunk.
- Separate parser ceilings bound metadata and streams. Existing docs/11 chunk
  and frame defaults remain the basis for selection. The aggregate per-file GCM
  budget is sum(ceil(plaintext_chunk_bytes/16)+4)<=2^32. The extra four GHASH
  blocks cover the 41-byte AAD and length block with a 96-bit nonce. This is a
  development engineering ceiling requiring external review, with no measured
  phone-capacity or security claim.

The complete-envelope formula was independently checked with a standalone Python
standard-library CBOR subset, without cborg. WIRE-SIZE-1 exercised 1920 cases
across recipient counts 1 through 20 and CBOR length-width boundaries. All matched
the specified formula. Five bucket rows matched exactly. The twenty-recipient
1024-byte bucket cannot fit the wrappers. Raw results are recorded in
`docs/spikes/phase-1-wire-size-calculations.json`. This is encoding arithmetic,
with zero cryptographic-vector or runtime-performance evidence.

## Dependencies

This ADR adds zero runtime or tool dependencies. BIP-39 wordlist provenance,
size and license evidence remain a separate dependency task before adoption.

## Self-review checklist

- [x] Resolve stream identity and manifest self-reference with the owner.
- [x] Freeze exact schemas, identifiers, integer widths, transcript domains and
      version framing. Validate all lengths before allocation.
- [x] Specify executable header-sizing and manifest-construction orders.
- [x] Publish an exact envelope-size formula for every recipient count and bucket.
- [x] Specify semantic body, certificate-reference and recipient-set binding.
- [x] Specify unique key/nonce lifetimes, counter caps, finality and empty streams.
- [x] Specify manifest signature coverage and chunk-count/size/hash consistency.
- [x] Specify HPKE context and wrapping limits, padding and decompression bounds.
- [x] Specify Receipt signer/reference/status matching and replay behavior.
- [x] Verify recovery using independently generated vectors.
- [x] Generate full profile and Receipt vectors with a different implementation.
- [x] Show acceptance suite failing before implementing seal/open and receipts.
- [x] Pass every-bit fixture corruption and bounded whole-Box/Manifest parser fuzzing.
- [x] Record fresh-session adversarial findings and their disposition.
- [x] Display the experimental notice in current build outputs, READMEs and diagnostic screens.

These checks do not replace a cryptographer. External review remains required
before public release, security promises and Gate E.

## Verification and device coverage

### Fresh specification adversarial pass

On 2026-11-15 agent session `/root/wire_dependency_review` reviewed AGENTS.md,
docs/04, docs/09 T1, docs/11 section 2 and ADR 008 with the owner's new wire
requirements. The session received no parent history and read no implementation
or test code. It independently identified the stream-identifier cycle.

| Finding | Disposition for the freeze |
|---|---|
| P1 file_id needed before the manifest that defines it | Owner approved option 1. Section 7 uses stream_id, with external file_id. |
| P1 optional manifest.file_id self-reference and signature dependency | docs/04 section 7 omits file_id from manifest bytes, signs the unsigned manifest separately, then hashes the signed manifest. |
| P1 16384-byte plaintext bucket exceeds the small-envelope cap | docs/04 section 5 freezes the exact encoded-size formula and recipient-count examples. |
| P1 32-byte Receipt reference differs from random 16-byte header.box_id | docs/04 sections 6 and 9 distinguish the identifiers, specify exact reference bytes and require expected-recipient checks. |
| P1 file stream must precede header-bound signature | docs/04 sections 4 and 7 separate stream and control, define key delivery and require finality/key lifetime checks. |
| P2 schema widths, sorting, domains and resource bounds remain schematic | Exact values are in docs/04. ADR 012/013 and the acceptance audit record the independent vectors. |

The pass produced six findings, five P1 and one P2. It ran zero tests and made
zero implementation observations. The spec dispositions above require acceptance tests and a later implementation
adversarial pass before their implementation can be accepted.

This is a specification dependency audit. No protocol implementation, benchmark
or real-device run is added. Full profile vectors, acceptance tests, implementation
review and phone verification remain pending. The fresh adversarial pass for this
ADR reviews only the specification and must be distinguished from the later
implementation review.

### Revision 2 specification follow-up

The same fresh specification-review session re-read the frozen revision, still
without reading implementation or test code. It confirmed the envelope formula,
acyclic wrap/payload ordering, complete-wrap AAD binding and GHASH block-count
arithmetic. It found no further blocking specification omission in that pass.
The accounting review does not establish adequacy of the chosen GCM ceiling.
Its two documentation follow-ups were addressed by stating exact inclusive
chunk thresholds in docs/04 and aligning T1 and the record sketches in docs/09
and docs/11. Implementation acceptance, independent cryptographic vectors and
implementation adversarial review remain outstanding.

## Envelope implementation acceptance

The initial full-envelope acceptance suite failed because box.js was absent.
Implementation is in box.ts and box-wire.ts, reusing the existing identity,
HPKE, CBOR, chunk-size and deflate modules. The independent generator in ADR 012
provides nine positive and ten rejection fixtures. The native tests cover 0 B,
65520 B, 200000 B and 5 MiB files, complete-envelope bucket selection, corruption,
truncation, wrong keys/roots, revocation, file-output retry and Receipt policy.
The experimental-notice acceptance checks failed before label integration.

Fresh implementation-review findings and corrections are recorded in
`docs/spikes/phase-1-envelope-adversarial-review.md`. The final Phase 1 gate still
is audited in docs/spikes/phase-1-gate-audit.md, including the recovery module
and independent fixtures.
All envelope operations remain unverified on real phones. External review
continues to gate public release, security promises and Gate E.
