# 016 — Phase 2 durable backup implementation requirements

## Status

Implementation design for the authorized Phase 2 signed backup. Experimental,
not independently reviewed. Exact backup vectors and acceptance tests must
precede implementation. External review still gates public release and Gate E.

## Required behavior

The root phrase restores the root seed under docs/04. A durable backup must also
restore previous device material, contacts, per-direction tag secrets/counters,
trusted outgoing originals and delivery/idempotency state. A root-only restore
cannot reconstruct independently random device keys or contact secrets. Treat
IndexedDB as the working set and the signed export as the durable copy.

Snapshot the complete backup inside a consistent store read transaction. Preserve
counter and outbox consistency. Restore into isolated staging, authenticate and
validate every record before replacing active state, then atomically switch the
active identity/working-set reference. Wrong phrase, tampering, truncation,
unknown version, limits, interrupted writes and a failed final commit must leave
the existing identity usable. Never merge a stale send counter into an active
contact session. A restored old snapshot requires contact resynchronization
before sending from that session.

## Serialization work

Use version-prefixed deterministic CBOR and native decided algorithms only.
Keep root signing and device agreement roles separate. The backup signing key
must match the root reconstructed from the supplied recovery entropy. Bind the
version, root public key, snapshot identifier and all snapshot records to the
signature. Bound all record lengths/counts before allocation. The engine must
exclude raw plaintext secrets from ordinary cache records and diagnostics.

A phrase-derived backup wrapping key needs its own HKDF domain, separate from
ed25519-root and every protocol key. Record the exact salt, info, key length,
AEAD nonce, AAD, signature transcript and byte order in the final backup schema.
Fresh salt/nonce material is required for a new export. Adopt no mnemonic
passphrase/PBKDF2 behavior beyond the owner's docs/04 mapping. Do not substitute
phrase-derived device keys for the separately random device seeds.

## Options and recommendation

1. Use the already selected native HKDF-SHA256 and AES-256-GCM to protect a
   root-signed canonical snapshot, with separate domains and independent Python
   vectors. Keep the snapshot format explicit and bounded.
2. Add an external archive/key-vault dependency. This requires the dependency
   ADR, size/license/audit evidence and consistency with the decided suite.

Proceed with option 1 within the approved standard primitives. Freeze its exact
application encoding and vectors before adding implementation APIs. Place native
cryptographic operations in core and orchestration/storage transactions above
it. The core change must be an explicitly scoped backup task as required by
AGENTS.md. FileCarrier remains an opaque export/import pipe.

## Acceptance first

- Round trip a new identity, previous device keys, contacts and both counters.
- Independently generated positive and negative snapshot fixtures agree.
- Wrong phrase, altered root/snapshot/record, every-bit corruption and truncation
  fail without replacing active state.
- Restore never exports plaintext keys into logs or ordinary metadata records.
- Interrupted export and failed restore commit retain the previous durable copy
  and active working set.
- New-device phrase-only recovery and phrase-plus-backup recovery are separately
  tested, with exact limitations surfaced by the UI.
- Stale snapshot restoration cannot resume an older contact send counter as if
  it were current. Specify and test the resynchronization path first.

No new dependency or protocol primitive is introduced by this design record.
No implementation, device result, benchmark or security claim is established.
The minimal app and complete Phase 2 gate remain pending.

## Initial envelope implementation draft

A backup-only native core module and acceptance test are now in the working
tree. The first run failed with the module absent, then its initial round trip,
wrong entropy, changed ciphertext and missing version cases passed.

Draft bytes are 0x01 followed by canonical CBOR [header, salt32, nonce12,
ciphertext]. Header is {v:1, root:bytes32, snapshot_id:bytes16, created:uint}.
Plaintext is canonical CBOR [snapshot_bytes, signature64]. The root signs
UTF8(openmesh-backup-sign-v1) || SHA256(C(header)) || SHA256(snapshot_bytes).
The wrapping key is HKDF-SHA256 from entropy32, fresh salt32, info
openmesh-backup-key-v1 and32 output bytes. AES-256-GCM uses nonce12 and AAD
UTF8(openmesh-backup-aad-v1) || C(header) || salt32. A new salt, nonce and snapshot
identifier are generated per export. Signature is inside the outer protection.

This remains an unexported, uncommitted draft. Independent Python vectors,
review, exact parser-limit propagation, full corruption/fuzz tests and the engine
snapshot/restore schema remain pending. The initial helper reuses the existing
identity factory to import the root seed, creating unused independent temporary
device roles. That overhead should be removed or justified before completion.
No real-device or security claim is established by this initial test.

The parser-limit regression was shown failing because the draft used the generic
Box codec helpers, whose depth limit is fixed. Backup serialization now calls
the existing CBOR API with the complete supplied limits for each operation.
The regression passes for depth/item limits. A root-only signing-key factory
now reuses the existing validated native seed importer without creating unused
device keys. Twelve backup/identity tests, strict types and targeted lint pass.
The draft remains uncommitted and unexported pending independent vectors,
review, corruption/fuzz coverage and engine restore integration. The temporary
unused-device-role overhead described above has been removed.

Independent backup fixtures are now generated by tools/vectors/backup_vectors.py
using the already pinned Python cryptography environment, independent CBOR,
SHA/HMAC, Ed25519 and AES-GCM code. Three positive fixtures and three altered
signature cases pass through the TypeScript opener. The generator is wired into
the independent vector runner. Backup tests also reject every single-bit change
and every truncation of the tested complete fixture. All test seeds/material
are public, including deliberately invalid variants. They are not application
identities or live encryption inputs. A fresh read-only review was started in
agent /root/backup_review. Its findings are pending before exposing the API.
No phone result or final engine-restore acceptance is established.

## Fresh review disposition and envelope API

Agent /root/backup_review reviewed the draft without parent implementation
history. It found the malformed-limit pre-copy issue for Infinity/non-integer
maxBytes, confirmed the early complete codec-limit validation correction, and
reported no other concrete primitive/transcript defect in its static scope.
It performed no tests or device measurements. The remaining test gaps for
snapshot mutation, fresh exports, malformed limit fields and native RNG failure
are now covered. Public exports sealBackup/openBackup are added. The root-only
importer remains an internal identity-module helper.

The review cannot establish full snapshot schema correctness, consistent capture,
atomic replacement or stale-counter recovery. Those remain engine tasks. The
API is an experimental backup envelope, with application restore still pending.
No external cryptographer review or public-release approval is implied.
