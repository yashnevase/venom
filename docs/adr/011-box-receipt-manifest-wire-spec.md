# 011 — Box, Receipt and Manifest wire specification

## Status

Owner approved ADR 008 option 1 on 2026-11-15. The development-gate amendment is
recorded in AGENTS.md and docs/05 by commit 9273220. External review gates public
release, security promises and Gate E. Phase development uses the interim checks.

Experimental, not independently reviewed.

Wire freeze is pending the identifier dependency correction below. This ADR
records the owner's requested construction and a concrete correction for review.
The existing docs/04 revision continues to describe the draft until the freeze.

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

Approve option 1. The resulting order is executable.

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

Freeze neither replacement identifier convention until the owner decides the
conflict. After that decision, publish exact schemas, byte concatenations,
profile limits and overhead tables in docs/04, then write acceptance tests.

## Dependencies

This ADR adds zero runtime or tool dependencies. BIP-39 wordlist provenance,
size and license evidence remain a separate dependency task before adoption.

## Self-review checklist

- [ ] Resolve stream identity and manifest self-reference with the owner.
- [ ] Freeze exact schemas, identifiers, integer widths, transcript domains and
      version framing. Validate all lengths before allocation.
- [ ] Prove header sizing and manifest construction have executable orders.
- [ ] Publish complete-envelope overhead for each bucket and recipient count.
- [ ] Bind semantic body fields, certificate reference and recipient set.
- [ ] Specify unique key/nonce lifetimes, counter caps, finality and empty streams.
- [ ] Specify manifest signature coverage and chunk-count/size/hash consistency.
- [ ] Specify HPKE context and wrapping limits, padding and decompression bounds.
- [ ] Specify Receipt signer/reference/status matching and replay behavior.
- [ ] Verify recovery using independently generated vectors.
- [ ] Generate full profile vectors with a different implementation.
- [ ] Show full acceptance tests failing before implementing seal/open and receipts.
- [ ] Pass every-bit corruption and bounded whole-Box/Manifest parser fuzzing.
- [ ] Record fresh-session adversarial findings and their disposition.
- [ ] Display the experimental notice and audit security claims before builds.

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
| P1 file_id needed before the manifest that defines it | Option 1 awaits owner clarification. |
| P1 optional manifest.file_id self-reference and signature dependency | Propose omitting file_id from manifest bytes, signing an unsigned manifest transcript separately, then hashing the final signed manifest. |
| P1 16384-byte plaintext bucket exceeds the small-envelope cap | Select by complete encoded size and actual recipient count. Exact accounting remains pending. |
| P1 32-byte Receipt reference differs from random 16-byte header.box_id | Specify both explicitly, HPKE uses header.box_id. Freeze exact reference bytes and expected-recipient checks. |
| P1 file stream must precede header-bound signature | Specify a separate stream and control envelope, including file-key delivery, finality and key lifetime. |
| P2 schema widths, sorting, domains and resource bounds remain schematic | Complete exact values and independent vectors before implementation. |

The pass produced six findings, five P1 and one P2. It ran zero tests and made
zero implementation observations. Their disposition requires the owner decision,
the resulting spec, acceptance tests and a later implementation adversarial pass.

This is a specification dependency audit. No protocol implementation, benchmark
or real-device run is added. Full profile vectors, acceptance tests, implementation
review and phone verification remain pending. The fresh adversarial pass for this
ADR reviews only the specification and must be distinguished from the later
implementation review.
