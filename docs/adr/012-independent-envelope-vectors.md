# 012 — Independent envelope vector generator

## Status

Accepted as Phase 1 test tooling under the owner's requirement for a different
implementation. Experimental, not independently reviewed.

## Problem and decision

Full OpenMesh profile fixtures need independent Ed25519, X25519, HKDF and
AES-GCM operations. Use Python cryptography 50.0.2 in an isolated tooling
virtual environment with a standard-library deterministic CBOR subset, hmac,
hashlib and zlib. Generate public test fixtures with fixed disclosed seeds.
This adds zero application or npm runtime bytes.

cryptography is Apache-2.0 OR BSD-3-Clause. The CPython 3.9 macOS arm64 wheel is
3943588 bytes, SHA-256
0ec5f09541743261e66e291b4a0cbf0fb2997aeaab6d9e9c740b9dba1b58d1c2.
The isolated installation totals 13708436 file bytes across cryptography
50.0.2, cffi 2.0.0 (MIT), pycparser 2.23 (BSD-3-Clause), and typing-extensions
4.16.0 (PSF-2.0). Each exact version returned zero OSV records. Per-package sizes
and observations are in docs/spikes/phase-1-envelope-vector-environment.json.
All four versions are pinned in tools/vectors/requirements.txt. Native providers
share OpenSSL lineage with Node, while CBOR, HPKE composition, transcript,
framing, compression and stream fixture generation use separate Python code.
The exact-version OSV query on 2026-11-15 returned zero vulnerability records.
This observation provides no independent security audit of this deployment.
[Release metadata](https://pypi.org/pypi/cryptography/50.0.2/json)

## Verification

Compare independently produced complete Boxes, Manifests, file chunks and
Receipt fixtures with the TypeScript opener and verifier. Preserve the generator
and pinned tooling versions for reproduction. Record vector hashes and the
public test seeds. Keep the fresh adversarial implementation review separate.
No phone verification is provided by these offline tooling fixtures.
