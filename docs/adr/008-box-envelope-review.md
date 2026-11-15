# 008 — Box envelope review before integration

## Status

Proposed for human protocol review. D-8's external cryptographer review remains
required. The owner approved the implementation direction and delegated choices
within the architecture, and confirmed that external review is unavailable.

The findings below affect signed meaning and envelope construction. AGENTS.md's
working rule requires an ADR and a stop before changing architecture. This
packet records the integration questions while preserving docs/04 and the
implemented component APIs.

## Problem and measured evidence

The current modules cover the specified native primitives and component formats.
The remaining Box, Receipt and Manifest integration needs a complete, acyclic
wire specification. docs/04 is a draft and uses a schematic signed transcript.

The reproducible command below exercises a literal reading with the public
identity test fixture. It writes phase-1-box-draft-review.json under docs/spikes.
It performs no network or storage operation on user identities.

```sh
pnpm build
node tools/spikes/box-transcript-review.mjs
```

### Signed semantic fields

Under CBOR(header) || SHA-256(CBOR(body)), changing kind from msg to receipt
changes the encoded payload while preserving the signed transcript. Adding a
changed attachments fixture has the same result. Native Ed25519 verification
accepts both changed draft-shaped payloads under that literal transcript.

The measurement establishes a signature-coverage gap in this interpretation.
Full Box parsing, AEAD integration, contact policy and an end-to-end attack are
outside this measurement. The freeze must state which payload fields are bound
to the sender signature, including kind, attachments, certificate context and
intended recipient semantics.

### Signing, compression and size dependency

For the deterministic 701-byte body fixture, the encoded payload is 1014 bytes
with either a zero signature placeholder or the actual 64-byte signature.
Deflate output changes from 987 to 1025 bytes. The placeholder fits a 1024-byte
bucket while the actual signed payload exceeds it.

An implementation that estimates compressed size using a placeholder cannot
derive the final bucket from that estimate. If signed header.size depends on
that bucket or final ciphertext, the specification must define an acyclic
construction order. Bounded candidate evaluation or an independently chosen
size field could be reviewed as options. This packet adopts neither option.

### Complete envelope accounting

A 16384-byte padded plaintext produces 16400 GCM ciphertext bytes. With a
12-byte payload nonce, one 80-byte HPKE content-key wrap and the 91-byte fixture
header, the component minimum is 16583 bytes. Envelope framing is still excluded.
The 16384-byte frame target therefore needs selection by complete encoded size.
This refines ADR 002's existing size-accounting question.

### Manifest and receipt dependencies

docs/04 signs header fields and also puts manifest_hash in the header for the
chunked profile. A manifest of encrypted chunks depends on those ciphertexts.
If those ciphertexts or an encrypted sender signature depend on the same final
header, the dependency order needs an explicit excluded-field or separate-stage
rule. D-8 review must cover that integration.

Receipt bodies include manifest_hash in docs/04, while small headers can omit
it and docs/11 sketches an optional manifest reference. The wire freeze must
define the receipt value for each profile, bind it to the expected recipient
device and original box, and specify replay handling. Filling an absent value
with a placeholder would assign new protocol meaning.

## Options

1. Freeze the complete Box, Receipt and Manifest specification, including signed
   transcripts and construction order, then implement the integrated acceptance
   tests and both profiles.
2. Adopt an existing fully specified container compatible with the decided
   suite, after the required architecture/dependency review.
3. Implement a literal schematic draft and silently fill the gaps. This conflicts
   with AGENTS.md's message-format and architecture rules.

## Recommendation and review deliverable

Use option 1, following ADR 002's approved review direction. The deliverable
should identify the exact reviewed revision and include the following details.

- Canonical outer framing, version dispatch and field names from docs/04.
- Header.size meaning, byte units and integer time units for coarse timestamps.
- Complete sender-signature transcript, domain separation and recipient binding.
- HPKE application info, recipient-envelope encoding/count caps and payload AAD.
- Padding framing, decompression bounds and complete-envelope size selection.
- An acyclic signing, compression, encryption and manifest-hashing order.
- Receipt references, expected signer checks, revocation and replay outcomes.
- D-8's construction, parameters, finality, limits and OpenMesh integration review.
- D-7's recovery phrase encoding and root-key mapping, with supported primitives.
- Independent positive and negative vectors for complete boxes and receipts.

D-2's complete Xiaomi comparison is recorded in
`docs/spikes/phase-1-compression-xiaomi-note-13.json`, and ADR 006 selects
bounded deflate for v1. This resolves the codec choice while leaving the final
Box compression field, authentication rules and D-8 review requirements above
outstanding.

## Verification and scope

The raw Node observation records two changed-payload signature verifications,
the compression-boundary counterexample and the component-size minimum.
The script uses public RFC test material and standard native algorithms. Its
assumptions and limits are part of the output and this ADR. It adds zero package
dependencies and zero production protocol APIs.

After review, write the full seal/open and receipt acceptance tests first.
Required cases include the doc/10 properties, changed kind/attachments and
recipient context, every-bit corruption, wrong keys, revocation, complete size
boundaries, malformed records, manifest dependency order and chunk finality.
Gate E additionally needs the independent security review and its specified
tests. Phase 1 and subsequent phase gates remain pending.

## Current Phase 1 gate audit

| Requirement | Current evidence | Status |
|---|---|---|
| Identity and device certification | identity.ts, identity.json, component tests | Implemented component, Node coverage |
| Tags and counter window | tag.ts, tags.json, component tests | Implemented component |
| Small Box seal/open and receipts | No Box or Receipt API in core index and no complete Box/Receipt vector suite | Incomplete, wire integration review required |
| Chunked profile and authenticated manifest | chunk.ts covers sizing/hash checks. Complete stream and manifest suites absent. | Incomplete, D-8 review required |
| Whole-Box and manifest parser fuzzing | Component parsers have fuzz coverage. Integrated parsers absent. | Incomplete |
| Recovery phrase format | D-7's word encoding and root mapping remain pending in ADR 002 | Incomplete |
| Node portability | Existing components compile and pass on Node 24.11.0 | Verified for implemented components |
| Real-device coverage | Xiaomi deflate verified. Comparison requested. Identity/HPKE and complete Boxes unverified on phones. | Partial |
| Required external review | Owner confirmed no external review. ADR 002 and D-8 remain pending. | Missing |
| Subsequent phases | docs/05 requires phase acceptance in order | Awaiting Phase 1 gate |

## Review task report

Task is Box envelope audit, Phase 1, based on 6ff854f. The implementation commit
is provided in the handoff. Existing checks pass 1 foundation test, 52 Vitest
tests, 7 browser tests and 79 independent vector checks. Typed builds, lint and
138 installed package-license checks pass. The latest advisory audit reports
zero findings across 168 locked dependencies. This task adds zero dependencies.

Measurements are the two signature-coverage cases, the 987/1025-byte compression
boundary and the 16583-byte component minimum above. The review probe ran on
Node 24.11.0, Mac arm64, without networking. Integrated Boxes, receipts, chunked
encryption and these review cases remain unverified on real phones. Claims
ledger entries use BOX-DRAFT-REVIEW and retain the three failed assumptions.
Known problems are the missing freeze/review evidence and the incomplete gates
in the audit table.

Files changed are docs/adr/002-phase-1-envelope-decisions.md,
docs/adr/008-box-envelope-review.md, docs/claims-ledger.md,
docs/spikes/phase-1-box-draft-review.json, tools/spikes/README.md and
tools/spikes/box-transcript-review.mjs.
