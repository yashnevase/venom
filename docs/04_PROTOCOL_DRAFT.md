# 04 — Protocol Draft v0.1 (OpenMesh Protocol)

STATUS: draft for human review. A cryptographer should review before real users depend on it for safety. No custom primitives: everything below uses standard algorithms.

## 1. Crypto suite (DECIDED)
| Need | Algorithm | Source |
|---|---|---|
| Signatures | Ed25519 | WebCrypto (native). Fallback only on feature-detect failure: a vetted library (e.g. noble-curves; check its audit status in its README before adopting) |
| Key agreement | X25519 | same |
| KDF | HKDF-SHA256 | WebCrypto |
| Encryption | AES-256-GCM | WebCrypto |
| Hash | SHA-256 | WebCrypto |
| Tag MAC | HMAC-SHA256 | WebCrypto |
| Compression | zlib-wrapped deflate (RFC 1950), with bounded decompression | ADR 006 and D-2 phone/Mac measurements |
| Encoding | deterministic CBOR | e.g. `cborg`; verify canonical mode |
Signing keys and encryption keys are **separate**. Never reuse.

## 2. Identity
- `root` Ed25519 key, created on device, stored encrypted. Used rarely: signs device certificates.
- `device` Ed25519 + X25519 keys. Certificate = root signs (device_pub_sign, device_pub_dh, created, optional expiry). Revocation = root-signed tombstone.
- Pseudonyms per community (LATER): separate root-derived or independent keys. Never link them by default.
- Recovery: 24-word phrase derived from a seed that regenerates the root key, plus an encrypted backup file. Losing both = losing the identity. Say so in the UI.
- **Known v1 limit**: no forward secrecy against theft of the recipient's long-term key (sender ephemeral key helps one direction only). A ratchet (Noise/Double Ratchet) or MLS is LATER.

## 3. Box
```
Box = Header || SealedPayload
Header (cleartext, CBOR): { v:1, box_id: 16B random, profile: 'small'|'chunked'|'fountain',
                            tag: 16B, size, chunk_size?, manifest_hash?, created_coarse }
```
`created_coarse` is rounded to a day, to leak less timing.
**Plaintext inside the seal** (CBOR): `{ sender_device_cert, sender_sig, kind: 'msg'|'file'|'receipt'|'invite', body, attachments? }`
`sender_sig` = Ed25519 over (header fields || hash(body)). Sign-then-encrypt means relays cannot see who sent it. Cost: the recipient can prove who sent it to a third party (no deniability). Accepted for v1.

### Sealing
1. Generate random 256-bit content key `CK`.
2. Encrypt plaintext (compressed, padded to a size bucket) with AES-256-GCM under `CK`.
3. Wrap `CK` to the recipient: ephemeral X25519 key + recipient device DH key -> HKDF -> AES-GCM wrap. (Same idea as HPKE, RFC 9180; may adopt it directly.)
4. Include the wrapped keys for every recipient device in the box.

### Padding
Bucket sizes (TARGET): 1 KB, 4 KB, 16 KB, then multiples of the chunk size. Padding hides exact sizes.

## 4. Profiles (this resolves Doc 1's fountain vs Merkle conflict)
| Profile | Used by | Integrity | Notes |
|---|---|---|---|
| **small** | messages, receipts, invites (<= 16 KB plaintext TARGET) | AEAD tag + signature | One piece. Fits one Nostr event, one DataChannel message. |
| **chunked** | WebRTC, file export, swarm/web seeds | Manifest lists SHA-256 of every chunk; manifest signed by sender; each chunk verified on arrival | Chunk size depends on file size (64 KiB / 256 KiB / 1 MiB, see `11` section 1); each chunk is sent as 16 KiB frames (safe DataChannel message size). Chunks are encrypted with a streaming AEAD construction (see `09` T1, open decision D-8). Resume by exchanging a bitmap of held chunks. Multi-source download works like BitTorrent. |
| **fountain** | animated QR, one-way broadcast | Frame CRC (QR) + final AEAD tag and signature after decode | RaptorQ (RFC 6330). Receiver may start mid-stream. Per-symbol hashes are NOT used (symbols are not known upfront). Pollution is not in the threat model for air-gapped QR. For untrusted broadcast, add per-symbol MAC/signature (LATER). |
Threshold for switching (SPIKE S-1 decides final numbers): <= 16 KB -> small. Larger -> chunked. QR with payload > ~1 KB -> fountain animated frames.

## 5. Tag
Purpose: let a recipient find their boxes on a shared carrier without the carrier learning the mapping.
- Each contact pair shares `K_tag` (derived by HKDF from the first-contact secret).
- `tag_i = HMAC-SHA256(K_tag, "om-tag-v1" || u64(i))[0:16]`, `i` = per-direction counter (like HOTP).
- Receiver watches tags `i in [next, next+W)`, W = 64 TARGET, and advances `next` when one arrives. No clocks needed. Works after long offline periods up to W missed messages; a resync beacon box handles larger gaps.
- **First contact**: an invite (QR / link / typed code) contains the inviter's public keys and a single-use secret. The first box uses a tag derived from that secret. After the first exchange the pair switches to the counter tags.
- **Known leak**: polling a carrier for tags reveals "someone is waiting" plus their IP. Mitigation (LATER): Tor mode, bucketed fetches. Never claim elimination.
- Clock skew and window edge cases need an explicit test list (see section 9).

## 6. Receipt
`receipt = Box(kind:'receipt', body:{ box_id, manifest_hash, received_coarse })` signed by the recipient device, sent back like any small box. Meaning: "the recipient device verified and decrypted this box." It does NOT prove a human read it.

## 7. Groups (v1)
Group = list of member device certs plus group id. A message is sealed separately to each member (fan-out). Cap ~20 members TARGET. Membership changes are signed events by an admin key. MLS (RFC 9420) replaces this later. No homegrown group ratchet.

## 8. Mailbox (Nostr carrier packing) — SPIKE S-3
- Wrap the small box in an event signed by a fresh throwaway key (not the user identity).
- Put the tag where relays can filter by a single-letter tag.
- Publish to >= 3 relays; poll with filters by tag. Check kind acceptance and size limits per relay; consider NIP-59 style gift wrapping. Confirm against current NIPs before building.
- Never trust relay ordering or retention.

## 9. Test vectors (required deliverable of Phase 1)
JSON files in `packages/test-vectors` that any implementation can run:
- seal/open for each profile, including wrong key, flipped bit, truncated box.
- signature chain verify/revoke.
- tag derivation incl. window edges and counter gaps.
- chunked manifest verify, missing chunk, duplicate chunk, wrong chunk.
- fountain decode starting mid-stream, with dropped frames.
- clock-skew independence (tags must not depend on time).
CI fails if any vector fails. Conformance vectors are the proof the protocol is real, not an SDK.

## 10. Open decisions (human decides, record as ADR)
D-1 Use WebCrypto only vs add a vetted fallback library. D-3 Exact bucket and chunk sizes (after S-1, S-2). D-4 HPKE adoption vs hand-assembled ECIES. D-5 Nostr event kind and gift-wrap use. D-6 Counter window size W and resync design. D-7 Recovery phrase format. D-8 Streaming AEAD construction for chunked files (nonce = random prefix || counter || last-chunk flag): needs ADR and cryptographer review. D-2 selects bounded zlib-wrapped deflate for v1 under ADR 006; the final Box schema must carry its compression indicator and limits.
