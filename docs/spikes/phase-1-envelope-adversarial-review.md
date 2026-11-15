# Phase 1 envelope implementation review

Experimental, not independently reviewed.

## Scope and reviewers

Owner requested a fresh adversarial implementation pass as an interim development
gate. Agent /root/envelope_adversarial_review started with no parent history and
read the specification, implementation and tests. It reported the first three
findings below and wrote the receipt regression, which failed against the first
implementation. Its final report and follow-up were interrupted by an automatic
content-filter error. Its reported findings and regression are preserved here.

Agent /root/wire_dependency_review initially reviewed only the specification. It
had seen no implementation when asked to perform the follow-up implementation
pass. It independently read the new source and tests, checked the first three
corrections, and reported additional resource/interoperability findings. The
primary agent implemented corrections. This is an interim code review. It does
not replace a cryptographer or satisfy the external release-review gate.

## Findings and disposition

| Finding | Correction and evidence |
|---|---|
| Receipt expected-recipient mutation across awaits mixed signer and device checks | Snapshot original, receipt bytes, expected contact, sender and time before awaits. Reuse the same expected-contact snapshot throughout. receipt-race.test.ts failed before correction and passes afterwards. |
| Certificate, revocation, Manifest and inner reference copies preceded field caps | bounded() checks byteLength before copying. Both receiving and sending paths use it at the reported sites. Follow-up reviewer confirmed the order. |
| Stream block-budget preflight overcounted one block per chunk | Use ceil(size/16)+4*count. Plaintext capacities are multiples of 16, making this equal to the Manifest sum. Exact-boundary regression reads its intentionally rejected source, while one byte above the boundary is rejected before reading. |
| Receipt original-set trust boundary was implicit | Document exact original bytes and expected recipient as trusted local sent-outbox context, established during sealing and checked on durable restore. The verifier cannot establish this context from network-supplied original bytes. |
| Receiver rejected valid large DEFLATE streams allowed by the envelope cap | Bound compressed input by padded plaintext length, retaining declared-size/1 MiB output cap. The independent large legal-DEFLATE fixture failed before this correction and passes afterwards. |
| Generic item budgets preceded per-array field ceilings | Add optional maxArrayLength to CBOR tokenizer/encoder limits. Apply 20 to outer envelope arrays, maxChunks to Manifest arrays and 1 to body attachment arrays. CBOR-ARRAY-CAP failed before correction and passes afterwards. |

## Verification scope

The follow-up reviewer statically checked the corrected snapshots, allocation
order, exact block arithmetic, trust contract, stream finality and output-staging
contract. Independent Python vectors exercise full wire representations. Tests
remain bounded fixtures and fuzz samples. The review supplies no real-phone,
performance-capacity or external cryptographer evidence. The final whole-phase
acceptance audit and recovery module remain pending.

## Final follow-up disposition

The follow-up reviewer reported no unresolved defect within the reviewed scope
and confirmed all recorded corrections. Its focused run passed 56 tests across
five files in 5.03 seconds on Node 24.11.0. It did not independently audit the
Python vector-generator provenance. Parent full checks subsequently passed.
The original review interruption remains recorded above, and the separate
follow-up supplies the final implementation conformance disposition.
