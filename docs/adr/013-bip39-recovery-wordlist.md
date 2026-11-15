# 013 — BIP-39 English data and OpenMesh root recovery

## Status

Accepted for the owner-decided Phase 1 recovery mapping in docs/04 revision 2.
Experimental, not independently reviewed.

## Decision and dependency budget

Vendor only the English word data and MIT license from trezor/python-mnemonic
revision b57a5ad77a981e743f4167ab2f7927a55c1e82a8. The wordlist is 13116 bytes,
6246 gzip bytes, SHA-256
2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda.
Its 1084-byte license is preserved. A generated TypeScript data module makes
the same list available without filesystem/network access in Node and browser.
The TypeScript wrapper is 13277 bytes and emitted JavaScript is 13258 bytes. This adds static data and zero
npm or executable upstream dependencies. No independent security audit of this
integration is claimed. Verify word count, sorted order, unique words, exact
source hash and published entropy/phrase fixtures in CI.
[Wordlist](https://raw.githubusercontent.com/trezor/python-mnemonic/b57a5ad77a981e743f4167ab2f7927a55c1e82a8/src/mnemonic/wordlist/english.txt)
[MIT license](https://raw.githubusercontent.com/trezor/python-mnemonic/b57a5ad77a981e743f4167ab2f7927a55c1e82a8/LICENSE)

Use BIP-39's 256-bit entropy and eight checksum bits to obtain exactly 24 English
words. The owner selected HKDF-SHA256 directly from entropy with salt
openmesh-root-v1, info ed25519-root and 32 output bytes. The BIP-39 PBKDF2 seed
mapping is outside that selected mapping. Native WebCrypto provides SHA-256,
HKDF and random generation. Device seeds remain independently generated.
[BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki)

## Interface and bounds

Expose entropyToRecoveryPhrase, recoveryPhraseToEntropy,
deriveRootSeedFromEntropy, recoverRootSeed and createRecovery. Inputs are
unknown at the public parsing boundary. Snapshot exact 32-byte entropy before
awaits. Bound phrase input to 512 UTF-16 units before normalization and 512 units
after NFKD/lowercase/whitespace normalization. Require 24 known words and a valid
checksum. These are development parser limits, with no hardware-capacity claim.
Return typed failures for malformed input, checksum mismatch and unavailable
native algorithms. Returned byte arrays are owned copies.

## Independent fixtures and review

Published Trezor vectors supply English phrases for 256-bit entropy. The pinned
upstream fixture download is 152400 bytes, SHA-256
fa3b937b7cff9c9b8ecd3aa011faeb8d6dd67993174b72326e83f4de8fdb30f8.
Copy the relevant public entropy/phrase pairs with provenance. Python hashlib,
hmac and cryptography generate separate checksum/root-seed/public-key results.
The existing isolated tooling environment from ADR 012 suffices. Run acceptance
tests before implementation and request a fresh implementation review. These
checks do not replace a cryptographer. External review gates public release,
security promises and Gate E under AGENTS.md.

## Acceptance and fresh review disposition

Recovery acceptance failed with missing recovery.js before implementation. The
asset-distribution test then failed before the staging step was added. Eleven
recovery tests now pass, including published examples, 72 independent root/public
fixtures, native API failures, normalization expansion/boundaries, input ownership,
random device material and the public entry point. The fresh reviewer found the
missing entry exports, distribution notice and coverage gaps. These corrections
were re-read and the reviewer reported no remaining recovery correctness issue.
Review scope is recorded in docs/spikes/phase-1-recovery.md. Device execution and
external cryptographer review remain unverified/outstanding respectively.
