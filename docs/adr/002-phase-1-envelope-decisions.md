# 002 — Phase 1 envelope decisions

## Status

Proposed on 2026-11-14. The owner explicitly chose to keep encryption gated for
review in this session. Encryption implementation is awaiting owner decisions
and the review required by docs/04 D-8. The independent tag module can proceed.

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
