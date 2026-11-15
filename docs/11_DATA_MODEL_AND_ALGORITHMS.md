# 11 — Data Model and Algorithms (Doc 3, part 3 of 3)

All sizes are estimates (TARGET) to be replaced by measurements. Types are written in plain pseudo-CDDL; final schemas live in `packages/core` and are validated at every boundary.

## 1. Terms (fixes a naming clash with `04`)
- **Frame**: one network message, up to 16 KiB (safe for WebRTC data channels).
- **Chunk**: the unit that is hashed and verified. Larger than a frame.
- **Shard**: a piece placed on a helper (a whole encrypted copy, or one erasure-coded piece).
`04` said "chunk size 16 KiB"; read that as "frame size 16 KiB". Chunk size rule:
| File size | Chunk size |
|---|---|
| up to 64 MiB | 64 KiB |
| 64 MiB to 16 GiB | 256 KiB |
| over 16 GiB | 1 MiB |
Flat manifest cost: 1 GiB at 256 KiB = 4,096 chunk ids x 32 B = 128 KiB. 10 GiB = 1.3 MiB (acceptable). Beyond that use a two-level manifest (group roots first, then each group's list on demand).

## 2. Core record shapes (CBOR)

Box, Manifest and Receipt bytes are frozen by docs/04 development revision 2
and ADR 011. The shapes below follow that revision. File-stream chunk_size
includes the 16-byte tag. Its plaintext capacity is chunk_size-16.
```
BoxHeader   = { v: 1, box_id: bstr16, profile: "small"|"chunked"|"fountain",
                tag: bstr16, size: uint, created_coarse: uint,
                chunk_size?: uint, manifest_hash?: bstr32 }
Manifest    = { v: 1, stream_id: bstr32, size: uint, chunk_size: uint,
                count: uint, final_index: uint, chunk_ids: [bstr32...],
                chunk_sizes: [uint...], aead: "stream-aes256gcm-v1",
                sender: bstr16, sig: bstr64 }
ReceiptBody = { box_id: bstr32, device: bstr16, status: 0,
                received_coarse: uint, manifest_hash?: bstr32 }
// ReceiptBody is inside a signed Box. Its box_id is the original content
// reference, distinct from random16 BoxHeader.box_id. See docs/04 section 9.
// file_id = SHA-256(canonical signed Manifest), outside the Manifest itself.
LogRecord   = { author: bstr16, seq: uint, prev: bstr32, hlc: [uint, uint], deps: [bstr32...],
                body_hash: bstr32, sig: bstr64 }
HolderAttest= { file_id: bstr32, shard: uint, holder: bstr16, expires: uint, sig: bstr64 }
Challenge   = { file_id, shard, nonce: bstr16, offset: uint, length: uint }  // answer = SHA-256(nonce||bytes)
```

## 3. Storage layout
**Tables (SQLite on desktop; IndexedDB object stores on web, same fields):**
| Table | Key fields | Notes |
|---|---|---|
| identity | root_pub, device keys (encrypted), cert chain | never plain on disk |
| contacts | contact_id, pubkeys, K_tag (encrypted), send_counter, recv_next, last_seen | |
| boxes | box_id, direction, state, profile, size, created, attempts | state machine below |
| outbox | box_id, next_attempt_at, attempts, policy, ttl_at | written BEFORE any send |
| logs | author, seq (primary), hash, prev, hlc, body_ref | per conversation |
| files | file_id, manifest_cbor, size, key_wrapped, source | |
| chunks | chunk_id, file_id, index, blob_ref, verified | bytes live outside the table |
| shards_out | file_id, shard, holder, last_confirmed, challenges_left | my files held by helpers |
| shards_held | file_id, shard, blob_ref, expires_at, bytes | others' encrypted data I hold (opt-in) |
| relay_stats | relay_url, ok, fail, ewma_ms, retention_ok, last_seen | |
| carrier_stats | contact_id, carrier_id, alpha, beta, ewma_ms, updated | for Thompson sampling |
| quotas | class, cap_bytes, used_bytes | |

**Blobs (chunk bytes):** desktop: files under `data/chunks/<first 2 hex of chunk_id>/<chunk_id>`; web: the browser's origin private file system for large blobs and IndexedDB for metadata. Never hold a whole large file in memory; write chunks to disk as they arrive. Browser large-file ceiling is unknown until S-7; show a clear message above it and recommend the desktop app.

## 4. Size budget (estimates)
Short chat message (small box):
| Part | Bytes (approx) |
|---|---|
| header (CBOR) | 45 |
| ephemeral X25519 key | 32 |
| wrapped content key + nonce | 60 |
| payload nonce + AEAD tag | 28 |
| inside: cert hash 16 + signature 64 + framing ~10 | 90 |
| **overhead total** | **~255** |
Padded to the 1 KiB bucket, so a short message costs about 1 KiB. As a Nostr event (base64 adds a third, plus event fields) about 1.8 KiB. 100 messages per day is about 180 KB per day per direction on relays. Relays are other people's servers; stay small and let events expire.

## 5. Outbox state machine (T10)
```
draft -> sealed -> queued -> in_flight -> held -> delivered
                       ^          |         |
                       +-- retry--+         +-- (receipt never comes) -> stays held until TTL
any state -> expired (after TTL, TARGET 14 days) or failed_manual (needs the user)
```
Rules: persist at each transition inside one storage transaction; `box_id` makes every send idempotent; retry delay = min(2 s x 2^attempts, 15 min) plus random jitter up to 25%; `held` means at least one carrier confirmed custody (relay quorum W=2, helper confirmed, or peer acknowledged) and `delivered` means a valid receipt arrived. On app start, re-scan `outbox` and continue.

## 6. Algorithms in pseudocode

**Hybrid logical clock (T4)**
```
on local event:   pt = now_ms(); l' = max(l, pt); c = (l' == l) ? c+1 : 0; l = l'
on receive(lm,cm): pt = now_ms(); l' = max(l, lm, pt)
                   c = (l'==l && l'==lm) ? max(c,cm)+1 : (l'==l) ? c+1 : (l'==lm) ? cm+1 : 0; l = l'
order = sort by (l, c, author, seq)
```

**Gap detection**
```
for each author: expected = last_seq+1
on record r: if r.seq == expected and r.prev == hash(last): accept
             if r.seq > expected: store as pending; request [expected..r.seq-1]
             if r.seq < expected or hash mismatch: ignore/flag (replay or fork)
```

**Carrier choice by Thompson sampling (T8)**
```
for c in carriers_available(contact):  theta[c] = Beta(alpha[c], beta[c]).sample()
rank by theta descending; fast = top1; reach = top2 + one random other
on success: alpha += 1;  on failure: beta += 1;  daily: alpha *= 0.98; beta *= 0.98 (floor at 1)
```

**Rendezvous placement (T2)**
```
holders_for(group_id, helpers, n): sort helpers by SHA256(group_id || helper_id) desc; take first n
```

**Availability calculator (use in code and in the meter)**
```
avail(n, k, p) = sum_{i=k..n} C(n,i) * p^i * (1-p)^(n-i)
choose scheme: if holders <= 5 or p <= 0.6: copies = smallest m with 1-(1-p)^m >= 0.99 (cap 3)
               else: smallest n >= k with avail(n,k,p) >= 0.99, with k = max(4, holders/2)
```
(`p` comes from measured uptime per helper; until S-9 exists, use copies only.)

**Verified chunk receive (T1)**
```
on chunk(i, bytes): if SHA256(bytes) != manifest.chunk_ids[i]: reject, penalise sender
                    else write to disk, mark bit i; if all bits set: decrypt stream, verify final AEAD
resume: send my bitmap; peer sends only missing chunks
```

**Delay-based pacing (T6) — browser version**
```
every 250 ms:  rtt_min = min(rtt over last 60 s);  q = rtt_now - rtt_min
               off = (TARGET_Q - q) / TARGET_Q            // positive = room to grow, negative = back off
               rate = clamp(rate + GAIN * off * STEP, MIN_RATE, user_cap)
               if bufferedAmount > HIGH_WATER: pause sending until below LOW_WATER
Game mode: user_cap = small fixed rate; no new uploads to others
```
TARGET_Q, GAIN, STEP are tunable (start TARGET_Q about 60 ms); measure in S-9b. Real LEDBAT is only possible in native stacks with a custom congestion controller.

**Quorum mailbox write/read (T9)**
```
write(box): pick top 3 relays by score; publish in parallel; held when 2 ack; retry rest with backoff
read(tags): query 2 best relays + 1 rotating; merge; drop duplicates by box_id; update relay scores
```

## 7. Quotas and eviction (T19, defaults are TARGET)
| Class | Default cap | Eviction | Notes |
|---|---|---|---|
| Personal (my messages/files) | none, but warn at 80% of free space | never automatic | offer export + clean-up wizard |
| Subscribed content | 2 GB | oldest first | |
| Cache (others' public, temp) | 1 GB | LRU | |
| Helper-held (opt-in) | **off by default**; when on, 1 GB, adjustable | oldest first, with notice to owner | shows who/what/how much; one-tap clear |
The settings screen shows storage used per class with a single "Free space" button.

## 8. Defaults table (single `config` module)
`FRAME_SIZE=16384`, `CHUNK_SIZE` per section 1, `SMALL_BOX_MAX=16384`, `TAG_WINDOW=64`, `MAILBOX_N=3`, `MAILBOX_W=2`, `OUTBOX_TTL_DAYS=14`, `RETRY_CAP_S=900`, `HELPER_CAP_BYTES=1e9`, `HELPER_DEFAULT=off`, `MAX_GROUP_FANOUT=20`. Changing any default needs a note in `/docs/adr` with the measurement behind it.

## 9. What each phase builds from this file
| Phase | Items |
|---|---|
| 1 | section 2 shapes (Box, Manifest, Receipt), T1 streaming AEAD, tags, vectors |
| 2 | storage layer, blobs, quotas, outbox (T10), export/import |
| 3 | chunk receive/resume, T6 pacing, T7, compact SDP (T11) |
| 4 | logs + HLC (T4), mailbox quorum (T9), scorer (T8), reconciliation if needed (T5), cert by reference (T12) |
| 7 | helper placement (T2), proof-of-holding (T3), durability meter |
| 8+ | gossip, capabilities, courier, calls (see `09`) |
