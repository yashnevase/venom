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
