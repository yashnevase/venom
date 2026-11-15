# 005 — Native RFC 9180 Base key wrapping

## Status

Adopted for the Phase 1 HPKE component under the owner's 2026-11-15 approval of
ADR 002's RFC 9180 direction and delegation to continue. D-8's external review
remains outstanding. OpenMesh envelope binding and full profile acceptance remain
separate integration requirements.

## Problem

docs/04 requires content-key wrapping with X25519, HKDF and AES-GCM. D-4 permits
direct RFC 9180 adoption. AGENTS.md permits those native primitives and restricts
third-party crypto libraries to vetted feature-detect fallbacks. Native support
passed P1-CAP on the pinned Node runtime.

## Options and decision

Implement the standard's single-shot Base operation with native WebCrypto,
using DHKEM(X25519, HKDF-SHA256), HKDF-SHA256 and AES-256-GCM. Their suite IDs
are 0x0020, 0x0001 and 0x0002. Each seal generates a fresh ephemeral key pair and
uses sequence zero. The context stays within that operation. The public API
returns enc and ciphertext, as in RFC 9180 section 6.1. These component outputs
need the versioned OpenMesh envelope before carriage.

The alternative of adding a crypto package would need the feature-detect
failure, vetted fallback evidence and dependency ADR required by AGENTS.md.
The current component uses zero third-party crypto packages. This implements
RFC 9180's defined construction with the permitted primitives. It introduces
zero new cryptographic algorithms or OpenMesh wire records.
[RFC 9180](https://www.rfc-editor.org/rfc/rfc9180.html).

Each adjacent LabeledExtract/LabeledExpand pair maps to one native HKDF call.
The two standalone empty-salt Extract operations use native HMAC-SHA256 with a
32-byte zero salt, following RFC 5869. Suite IDs, labels, context ordering, key
lengths and the 96-bit nonce match the standard. X25519 inputs pass through the
native provider and all-zero agreement results are rejected explicitly.
[RFC 5869](https://www.rfc-editor.org/rfc/rfc5869.html).

The component retains the explicit info and aad inputs in RFC 9180 section 6.1's
template for vector interoperability. Section 8.1 recommends exposing a single
auxiliary-information path for application-facing single-shot APIs. The eventual
OpenMesh wrapping API must centralize its binding in info with empty aad, and
freeze its application context before integration. The low-level adapter's
separate inputs are an intentional interface choice for RFC conformance testing.
[RFC 9180 section 8.1](https://www.rfc-editor.org/rfc/rfc9180.html#section-8.1).

Callers supply maximum plaintext bytes and a combined info+aad byte budget.
There are zero implicit size defaults. Checks precede copying those byte inputs
and starting crypto. Encapsulation keys are exactly 32 bytes, and ciphertext
includes the standard 16-byte GCM tag. A 32-byte content key therefore yields
32 encapsulation bytes and 48 ciphertext bytes, before envelope metadata.
Local recipient key pairs come from the existing identity API. Key and buffer
references are captured before the first asynchronous operation.

Native failures, invalid keys, short or over-budget ciphertexts and authentication
failures return typed results. The core imports zero Node modules and performs
zero I/O. Native availability and interoperability on phones need measurements.

## Verification and dependencies

Acceptance tests were written before source and failed for the missing module.
The selected public vector is the Base suite 32/1/2, sequence zero, from the exact
JSON revision linked by RFC 9180. The fixture records its source URL and source
SHA-256. Tests mock native ephemeral generation to reproduce that public test key.
Production callers cannot supply an ephemeral private key or a reusable context.
[RFC-linked vectors](https://github.com/cfrg/draft-irtf-cfrg-hpke/blob/5f503c564da00b0687b3de75f1dfbdfc4079ad31/test-vectors.json).

Python independently derives the X25519 agreement through the existing OpenSSL 3
CLI, then implements the RFC's HKDF transcript with standard hashlib/hmac. It
checks eight public/context/key outputs. The existing Node toolchain's classic
cipher API authenticates and decrypts the fixture using those independently
derived key/nonce values, adding a ninth comparison. The reference uses separate
application code and API paths. Its native providers share OpenSSL lineage with
the Node production runtime, so these checks are conformance evidence. External
security review remains a separate requirement.

This adds zero package dependencies. OpenSSL 3's test-tool requirement, license
and local executable size are recorded in ADR 004. Node is the existing pinned
toolchain. No independent audit of this new adapter has been performed.

## Remaining gates

Application info encoding, complete recipient envelopes, content encryption,
padding, compression and full small/chunked profile vectors remain pending.
The HPKE component result alone cannot pass the full Phase 1 acceptance gate.
The streaming construction requires D-8's external review. The owner's explicit
confirmation that no external review exists remains recorded in ADR 002.
