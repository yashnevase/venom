# 004 — Local identity and device certificates

## Status

Adopted for Phase 1 under the owner's 2026-11-15 approval of the recommendations
and delegation to proceed through the build plan. This records the serialization
details needed for the identity operations described in docs/04 section 2.
Streaming encryption still requires the separate D-8 review.

## Problem

The core needs independently verifiable root-to-device certification before
message signatures can be trusted. Signing and key-agreement keys have separate
material. The root trust anchor comes from the contact/invite, and each verifier
receives that expected root explicitly.

## Options and decision

Use native Ed25519 and X25519 with standard 32-byte seeds and RFC 8410 PKCS#8
imports. Returned private CryptoKeys are non-extractable. A transient native
JWK export supplies the public component where needed, followed by a
non-extractable private import. The factory retains seeds in memory and exposes
copies through exportSeeds for the later encrypted backup path. Public-byte
access also returns copies. The API performs zero disk writes.
[RFC 8410](https://www.rfc-editor.org/rfc/rfc8410.html).

Root, device-signing and device-encryption seeds are independent 32-byte values.
The factory accepts exact supplied seeds for recovery/vector verification or
generates them with crypto.getRandomValues. Reusing seed bytes across roles is
rejected. Seed imports use the native algorithms' standard private-key encoding.
Recovery-word encoding is a separate D-7 step.

The signed records use the existing deterministic codec. Integer timestamps are
Unix seconds in the uint64 range. Callers supply the codec budgets and current
time. Certificates are valid from created inclusive to expiry exclusive.

Unsigned device certificate fields are v=1, device_pub_sign (32 bytes),
device_pub_dh (32 bytes), created (uint), and optional expiry (uint greater than
created). The root signs the deterministic CBOR map containing exactly these
fields. The final record adds sig (64 bytes). This freezes the fields named by
docs/04 into a deterministic representation, with the required version value.

A certificate-revocation policy record contains v=1, certificate_hash (the
32-byte SHA-256 of the complete encoded certificate), revoked (uint), and sig
(64 bytes). The root signs the map omitting sig. Revocation targets that exact
credential. Verification checks its root signature and effective time. A verifier
can supply the encoded revocation alongside the certificate for an integrated
revoked-credential check. Device-wide revocation across renewed credentials is
a later multi-device policy decision.

Strict field sets and disjoint unsigned record shapes separate certificate and
revocation transcripts. Unknown versions return an explicit ignore outcome.
Malformed input, incorrect roots, invalid signatures, future issuance, expiry,
and effective matching revocations return typed failures. Byte fields are copied
before asynchronous crypto operations.

## Verification

Acceptance tests precede source. Fixed public test seeds verify native key
derivation, certificate bytes and signatures against an independent OpenSSL
verifier driven by Python. Tests include wrong roots, tampering, expiry edges,
revocation timing and mutation isolation. The module introduces zero third-party
runtime dependencies. The independent test verifier uses the already installed
OpenSSL 3 CLI, Apache-2.0, through Python's standard subprocess module. Locally
it is OpenSSL 3.6.4, with an 880512-byte executable. Ubuntu CI uses its preinstalled
OpenSSL 3. The version check fails clearly if unavailable. This adds a test-tool
requirement, with zero bundled app bytes. A separate audit of this CLI deployment
has not been performed. Real-device and independent security reviews are recorded separately
from Node conformance results.
