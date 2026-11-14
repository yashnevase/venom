# Protocol vectors

`tags.json` contains 8 tag vectors generated independently with Python's HMAC
implementation. TypeScript verifies them with WebCrypto. The standalone
`tools/verify-vectors.py` rechecks them independently in CI. The runner rejects
unknown vector suites until their verifier exists. Box, receipt,
chunked and fountain suites remain pending their implementation phases.

`cbor.json` contains 26 deterministic encoding vectors checked against an
independent Python implementation of the RFC 8949 integer/value subset. JSON
fixture markers `$int`, `$bytes` and `$map` represent bigint, byte strings and
ordered input pairs. The markers belong to debug fixtures. Wire bytes use CBOR.
TypeScript verifies encoding, decoding and canonical round trips. The map-order
fixture distinguishes bytewise RFC 8949 ordering from length-first ordering.

`chunks.json` contains 10 SHA-256 fixtures and 9 file-size selection cases from
docs/11. Byte fixtures use literal hex or the bounded index-mod-251 debug pattern.
Python hashlib verifies their IDs independently. TypeScript checks identification,
verification and size selection through the core APIs. These fixtures exercise
the hashing and sizing components of T1. Signed manifests and streaming AEAD
need their reviewed profile and vectors.

`identity.json` contains public RFC 8032 and RFC 7748 test seeds, three derived
public keys, and the deterministic certificate and revocation bytes from ADR 004.
These are public fixtures. The independent Python encoder signs its own record
bytes using the OpenSSL 3 CLI, then compares all five outputs. macOS needs an
OpenSSL 3 installation. The verifier checks PATH and Homebrew's standard arm64
OpenSSL 3 location. Ubuntu CI uses its preinstalled OpenSSL 3. Version 3 is
required explicitly. The module's runtime uses WebCrypto.
