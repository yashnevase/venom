# 002 — Phase 1 envelope decisions

## Status

Proposed on 2026-11-14. On 2026-11-15 the owner approved the recommendations and
requested sustained work through subsequent phases. This supersedes their earlier
hold on owner decisions and authorizes implementation choices within the agreed
architecture. They confirmed that external cryptographer review is outstanding.
The D-8 review and phase acceptance gates still apply. Exact choices and their
evidence are recorded in implementation ADRs as work proceeds.
ADR 008 records measured Box signature/size integration findings and the
complete-envelope review deliverable before sealing integration.

## Problem

docs/04 section 10 explicitly reserves decisions for the human owner. Phase 1
requires interoperable small and chunked boxes. Implementing the missing fields
silently would create a protocol format that has not been approved.

The following details affect conformance and safety.

| Decision | Missing agreement |
|---|---|
| D-2 | Compression format and bounded decompression rules |
| D-4 | HPKE adoption or precise content-key wrapping suite, HKDF salt/info, authenticated fields and per-device envelope encoding |
| D-7 | Recovery word list, seed derivation, and encrypted identity backup format |
| D-8 | Reviewed streaming AEAD construction, nonce layout, final-chunk binding, authenticated metadata and stream limits |
| Wire records | docs/04 uses created_coarse and manifest_hash while docs/11 uses created_day and manifest. Root AGENTS.md gives docs/03 and docs/04 precedence. Exact CBOR framing, certificate, revocation and signed transcript fields still need freezing. |
| Size accounting | A 16 KiB plaintext plus certificate, signature, padding and encryption overhead exceeds a 16 KiB frame. The small profile's size budget needs explicit envelope accounting. |

## Options

1. Freeze an exact, reviewed Phase 1 wire specification before sealing code.
2. Supply an existing reviewed standard format or library, with a dependency
   ADR documenting size, license, audit status and WebCrypto compatibility.
3. Guess missing fields while implementing. Rejected by AGENTS.md's architecture
   and custom-cryptography restrictions.

## Recommendation

Use option 1, considering RFC 9180 HPKE for D-4, and have a cryptographer review
D-8 before adopting a streaming construction. Keep the draft documents intact.
Resolve recovery and compression as part of the same wire-format review.

The tag-only implementation interprets docs/04's `u64(i)` as unsigned 64-bit
big-endian, the usual network-byte-order representation. That interpretation is
explicit in both independent vector implementations and can be revised before
the protocol freezes. Counter wrap is rejected. The 64-tag window comes from
docs/11. Resync beacon design remains D-6 and is outside this tag module.
The API accepts a 256-bit K_tag, interpreting the HKDF output as 32 bytes.

## Verification

After decisions are accepted, write the seal/open acceptance test first, show
it failing, then implement. Required gates include 0 B to 5 MiB round trips,
wrong keys, every-bit tampering, certificate/revocation checks, chunk loss,
reordering and truncation, padding, JSON golden vectors, an independent verifier,
and bounded parser fuzzing. Tag checks alone do not pass the Phase 1 gate.

## Review packet — 2026-11-15

Status remains proposed. Owner choices and D-8 cryptographer review are separate
requirements in docs/04 section 10. The recommendations below prepare those
decisions. The measured capability tool is under tools, outside the protocol core.

### D-1 native implementation availability

Recommend WebCrypto as the first implementation path. On this Mac with Node
24.11.0, the native API passed the six algorithm exercises in P1-CAP. The raw
observation is docs/spikes/crypto-capabilities-2026-11-15.json. Browser and phone
algorithm availability still require measurements. A fallback dependency needs
the feature-detect failure and dependency ADR specified by AGENTS.md.

### D-4 content-key wrapping

Recommend evaluating RFC 9180 Base mode with DHKEM(X25519, HKDF-SHA256),
HKDF-SHA256 and AES-256-GCM, using identifiers 0x0020, 0x0001 and 0x0002. Keep the
draft's Ed25519 sender signature inside the sealed payload. Owner approval must
also specify application info/AAD and recipient-device encoding. A WebCrypto-backed
implementation requires a dependency review and an explicit resolution of
AGENTS.md's crypto-library restriction before adoption. [RFC 9180](https://www.rfc-editor.org/rfc/rfc9180.html).

The selected KEM carries 32 encapsulation bytes. Encrypting a 32-byte content key
with the selected AEAD adds a 16-byte tag, giving 80 bytes for those two pieces
per recipient before CBOR, identifiers and application metadata. The exact
outer envelope budget needs a vector before its threshold can be frozen.
[RFC 9180 algorithm registries](https://www.rfc-editor.org/rfc/rfc9180.html#section-7).

### D-8 streaming candidate

Recommend sending Tink's documented AES-GCM-HKDF streaming function to the
cryptographer for assessment against the OpenMesh manifest and resume model.
Its documented parameters allow a 32-byte derived key and SHA-256. Its IV has
a random 7-byte prefix, a 4-byte big-endian segment index and a final-segment
byte. Its header includes salt and prefix, and associated data enters HKDF.
The specification caps the segment count at 2^32. Review must cover parameter
selection, empty input, finality, header authentication and the mapping between
plaintext segments and hashed ciphertext chunks. [Tink streaming specification](https://developers.google.com/tink/streaming-aead/aes_gcm_hkdf_streaming).

The age v1 payload uses ChaCha20-Poly1305. Adopting that file format would require
a change to the project's decided AES-256-GCM suite. Tink provides an AES-GCM
candidate for the current review. Porting any candidate still requires the D-8
review and cross-implementation vectors. [age specification](https://c2sp.org/age).

### D-2 compression and D-3 size accounting

Recommend measuring zstd against zlib-wrapped deflate on the target phones
before choosing compression. The web CompressionStream format named deflate
uses the RFC 1950 zlib wrapper. The decoder's output bound must be part of the
approved schema and checked while decompressing. [Compression Standard](https://compression.spec.whatwg.org/#deflate).

Retain docs/11's frame and chunk targets during review. Resolve small-profile
eligibility using total encoded box bytes for each carrier. A 16384-byte padded
plaintext plus the native GCM tag already occupies 16400 bytes before header,
nonce, certificate or recipient wrappers. Review the automatic profile choice
at that boundary and specify the meaning of header size before implementing
compression and padding. D-3's final threshold depends on the complete envelope
measurement and the pending phone spikes.

### D-7 recovery

The 24-word requirement needs an exact word list, checksum, normalization,
passphrase treatment and root-key mapping. BIP-39's complete mnemonic-to-seed
process uses PBKDF2-HMAC-SHA512 and produces 64 bytes. Those operations extend
the project's listed suite, and the Ed25519 root mapping still needs a decision.
Recommend an explicit recovery-format review before selecting BIP-39 or another
standard. [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki).

### Wire-format review checklist

Recommend RFC 8949 section 4.2.1 core deterministic encoding, with a named map-key
ordering and schema-specific accepted types. Duplicate keys, indefinite lengths,
trailing data and resource limits need explicit parser outcomes and vectors.
The RFC distinguishes this ordering from the older length-first variant.
[RFC 8949](https://www.rfc-editor.org/rfc/rfc8949.html#section-4.2.1).

The generic deterministic codec and explicit caller limits are implemented under
ADR 003. Exact record schemas, signed transcripts and version-dispatch outcomes
still require the protocol review described here.

Use AGENTS.md's precedence when reconciling docs/04 and docs/11. The approval
packet needs these concrete answers before sealing code can start.

- Choose docs/04's created_coarse, manifest_hash and received_coarse field names
  wherever the later pseudo-schemas conflict. Define exact integer time units.
- Specify certificate and revocation records, trust anchors and validation time.
- Name every signed field, including kind and attachments, and every AEAD-bound
  field. Define which records omit their own signature during signing.
- Resolve manifest_hash and file_id dependency order. A manifest containing its
  own hash needs an explicit excluded-field rule or an external identifier.
- Define per-device envelope limits, parser byte/count/depth bounds, padding
  length representation and decompression limits.
- Bind receipts to the original box, its manifest and the expected recipient
  device. State duplicate, revoked-device and unknown-version outcomes.
- Record approved wire bytes and independent verifier expectations as vectors.

### Approval record to complete

| Item | Owner decision | Review evidence |
|---|---|---|
| D-1 native-first and fallback policy | Owner approved direction | Node observation recorded, phone pending |
| D-2 compression | Owner approved measurement-first direction | ADR 006 deflate candidate verified on Xiaomi, raw report recorded. Browser/WASM zstd comparison and final choice pending |
| D-3 total-envelope sizing | Owner approved retaining published targets during measurement | Complete-envelope vectors pending |
| D-4 exact wrapping suite and implementation | Owner approved RFC 9180 Base direction | Native component and RFC vectors in ADR 005. OpenMesh application binding and envelope pending |
| D-7 recovery format and root mapping | Owner approved standard-format review direction | Exact phrase encoding and interoperability pending |
| D-8 streaming construction | Owner approved Tink candidate for review | External cryptographer review outstanding, confirmed by owner |
| Exact CBOR schemas and signed transcripts | Implementation delegated within recommendations | Identity records in ADR 004. Box/receipt integration findings and proposed freeze in ADR 008 |
