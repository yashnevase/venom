# Protocol vectors

`tags.json` contains 8 tag vectors generated independently with Python's HMAC
implementation. TypeScript verifies them with WebCrypto. The standalone
`tools/verify-vectors.py` rechecks them independently in CI. The runner rejects
unknown vector suites until their verifier exists. Box, certificate, receipt,
chunked and fountain suites remain pending their implementation phases.

`cbor.json` contains 26 deterministic encoding vectors checked against an
independent Python implementation of the RFC 8949 integer/value subset. JSON
fixture markers `$int`, `$bytes` and `$map` represent bigint, byte strings and
ordered input pairs. The markers belong to debug fixtures. Wire bytes use CBOR.
TypeScript verifies encoding, decoding and canonical round trips. The map-order
fixture distinguishes bytewise RFC 8949 ordering from length-first ordering.
