# 003 — Deterministic CBOR codec

## Status

Adopted for the Phase 1 codec on 2026-11-15 under docs/03 section 6 and docs/04
section 1. The agent selected RFC 8949 section 4.2.1 from the recommendation in
ADR 002 as the codec's encoding dialect following the owner's continuation
request. Exact protocol records and encryption have their separate review gate.

## Problem

The core requires deterministic CBOR and hostile-input bounds. Its current
implementation contains tags. The protocol draft explicitly identifies cborg
as an encoding candidate. Its normal strict decode mode leaves map-order checks
to the application. [Upstream documentation](https://github.com/rvagg/cborg).

## Options

Use cborg with explicit deterministic options and bounded tokenization, or write
a CBOR implementation. The library provides the existing serializer, tokenizer,
strict integer handling, UTF-8 checks and length calculation needed here.

## Recommendation

Adopt cborg 7.0.0 and its RFC 8949 section 4.2.1 encoding options. Enforce canonical
bytes on decode by re-encoding the bounded decoded value and comparing bytes.
Use Maps for decoded CBOR maps. Accept integers within CBOR's 64-bit major types,
text, bytes, arrays, maps, booleans and null. These cover the draft record values.
Floats and semantic tags require a future schema decision. [RFC 8949](https://www.rfc-editor.org/rfc/rfc8949.html#section-4.2.1).

Both APIs require explicit maxBytes, maxDepth and maxItems. The caller supplies
limits for its record/profile. The test fixture uses 16384 bytes, 16 container
levels and 4096 tokens. Those are test conditions. Protocol parser defaults
await the wire-schema review. Encoding snapshots supported values under the
same structural budget, checks encoded length before final serialization and
rejects cycles and accessor properties. Tokenization checks depth and item counts
before recursive object construction. Errors are typed results.

## Dependency review

cborg 7.0.0 is Apache-2.0, 202342 compressed bytes and 838511 unpacked bytes in
the downloaded npm package. It declares zero runtime dependencies. It is the
first external core runtime dependency. Package sizes include upstream tests,
types and CLI files. Application bundle size will be measured when an app exists.
An independent security audit of this exact release has not been established.
The implementation audit reported 0 advisories across 166 locked dependencies
on 2026-11-15. The local license check inspected 136 installed package versions.

Only the base encoder/decoder, tokenizer and encoded-length calculator are used.
Independent JSON vectors, malformed inputs, depth/size limits, graph expansion,
round trips and seeded parser fuzzing form the acceptance gate. Phone results
remain required before browser/device support claims.
