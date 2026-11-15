# Protocol vectors

`tags.json` contains 8 tag vectors generated independently with Python's HMAC
implementation. TypeScript verifies them with WebCrypto. The standalone
`tools/verify-vectors.py` rechecks them independently in CI. The runner rejects
unknown vector suites until their verifier exists. Receipt, sealed Box,
manifest, chunked and fountain suites remain pending their implementation phases.

`cbor.json` contains 26 deterministic encoding vectors checked against an
independent Python implementation of the RFC 8949 integer/value subset. JSON
fixture markers `$int`, `$bytes` and `$map` represent bigint, byte strings and
ordered input pairs. The markers belong to debug fixtures. Wire bytes use CBOR.
TypeScript verifies encoding, decoding and canonical round trips. The map-order
fixture distinguishes bytewise RFC 8949 ordering from length-first ordering.

`box-headers.json` contains canonical CBOR vectors for the small, chunked and
fountain Box header profiles described in docs/04. Python independently checks
each encoded map byte string. TypeScript checks the same fixtures through the
strict header codec, including unknown-version handling and malformed fields.
These vectors cover the separately delimited header item only. The draft's
`Header || SealedPayload` boundary framing, signed transcript and payload
encoding remain unresolved for the reviewed Box integration.

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

`hpke.json` selects the Base 32/1/2 suite and sequence-zero encryption from the
exact vector revision referenced by RFC 9180. It records the original source URL
and full-download SHA-256. Test private keys are public fixtures. TypeScript
reproduces the ciphertext with mocked native ephemeral generation. Python uses
OpenSSL 3 for X25519 and standard hmac/hashlib for eight key/context comparisons.
It then decrypts and authenticates the fixture with the independently derived
key and nonce through Node's classic cipher API, adding a ninth comparison.
The verifier uses the existing pinned Node toolchain. Native providers have
OpenSSL lineage in common. These checks establish component conformance, with
security review and OpenMesh envelope integration still pending.

`deflate.json` contains four independently generated Python/zlib byte fixtures
and eight rejection fixtures. The decoder must reject incomplete streams,
checksum changes, trailing data, concatenated streams, raw deflate, gzip and
dictionary-dependent input. Python uses a decompression object, checks stream
end and remaining input, and enforces an output limit. TypeScript checks the
same fixtures through the component API. Encoder bytes can vary between valid
implementations. The test compares decoded content. These candidate-component
vectors use the D-2 deflate selection. Full Box integration remains pending.
