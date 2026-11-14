# Protocol vectors

`tags.json` contains 8 tag vectors generated independently with Python's HMAC
implementation. TypeScript verifies them with WebCrypto. The standalone
`tools/verify-vectors.py` rechecks them independently in CI. The runner rejects
unknown vector suites until their verifier exists. Box, certificate, receipt,
chunked and fountain suites remain pending their implementation phases.
