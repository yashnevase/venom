# 04 — OpenMesh wire specification v1, development revision 2

Experimental, not independently reviewed.

Owner decisions on 2026-11-15 approve ADR 008 option 1 and ADR 011 option 1.
This revision freezes development wire bytes. External review gates public
release, security promises and Gate E under AGENTS.md. Independent vectors,
self-review and adversarial review do not replace a cryptographer.

## 1. Encoding, notation and dispatch

`C(x)` means RFC 8949 core deterministic CBOR. `H(x)` means SHA-256 of bytes.
`D(s)` means UTF-8 bytes of the literal ASCII string s, without a terminator.
`||` concatenates bytes. `u8`, `u64be` and `u88be` are fixed-width unsigned
big-endian integers. Byte-string lengths refer to bytes, never characters.
Integers on the wire are unsigned uint64 unless a smaller range is specified.
Maps have exactly their specified text keys, with optional keys omitted when
absent. Reject duplicate keys, unknown keys, indefinite encodings, tags, floats,
non-minimal integers, non-deterministic ordering and trailing bytes.

Every complete Box starts with one literal version byte `0x01`. Return an
`unsupported-version` ignore outcome for any other first byte before decoding
its remainder. Empty input is malformed. The enclosing Carrier supplies the
record boundary. Nested records carry `v=1` and produce the same ignore outcome
for unsupported versions. Standalone Manifest transfer uses `0x01 || C(M)`.
Existing ADR 004 certificate bytes retain their nested `v=1` map representation.

Wire types below use `bytesN` for a byte string of exactly N bytes. Every
fallible parser returns a typed outcome for hostile input. Limits are checked
before allocation, including declared CBOR collection and string lengths.
Callers may impose smaller resource limits and report `limit-exceeded`.

## 2. Algorithms and identity

Use native WebCrypto Ed25519, X25519, HKDF-SHA256, AES-256-GCM with a 128-bit tag,
HMAC-SHA256 and SHA-256. Signing keys and agreement keys are independent.
Feature-detect fallbacks require their own dependency ADR.

The root Ed25519 public key is a 32-byte trust anchor supplied by the contact,
not adopted from incoming data. Device certificates and revocation records use
ADR 004 exactly. Their timestamps are Unix seconds. Validate the root signature,
issuance, exclusive expiry boundary and known effective matching revocations at
caller-supplied verification time. The protocol cannot detect an unavailable
revocation record.

A sender certificate reference is `R = C([root_public_bytes32, certificate_bytes])`,
where certificate_bytes is the complete deterministic signed certificate map
encoded as a byte string. `device_id = H(R)[0:16]`. A contact supplies the expected
root and certificate for each recipient device. Device id collisions between
different references are rejected. The sender carries R in the payload. The
sender reference limit is 1024 bytes.

Recovery uses the English BIP-39 24-word entropy/checksum encoding with 256-bit
entropy and 8 checksum bits. Accept normalized lowercase English words with
ASCII spaces after NFKD normalization and whitespace normalization. Reject other
word counts, unknown words and checksum failure. No BIP-39 mnemonic-to-seed
PBKDF2 step or mnemonic passphrase is used in this OpenMesh mapping.

```text
root_seed = HKDF-SHA256(ikm=entropy32,
  salt=D("openmesh-root-v1"), info=D("ed25519-root"), L=32)
```

Import root_seed as the Ed25519 seed using ADR 004. Generate independent random
device signing and agreement seeds. The phrase recovers the root, while the
signed backup restores contacts, device material and counters in Phase 2.
Ship the English wordlist only after its provenance/license dependency ADR and
independent vectors are recorded.

## 3. Box envelope and Header

```text
Box = 0x01 || C([Header, Recipients, payload_nonce, payload_ciphertext])
Header = { v:1, box_id:bytes16, profile:"small"|"chunked"|"fountain",
           tag:bytes16, size:uint, created_coarse:uint,
           chunk_size?:uint, manifest_hash?:bytes32 }
Recipients = [[device_id:bytes16, hpke_enc:bytes32, wrapped_key:bytes48], ...]
payload_nonce = bytes12
```

header.box_id is a fresh random identifier. `created_coarse` is Unix seconds
rounded down to a multiple of 86400. `size` is padded control-plaintext length.
Ciphertext length must equal size + 16. Recipients contain 1 through 20 entries,
sorted lexicographically by raw device_id bytes, with no duplicates. Recipient
ordering is checked, never silently repaired during verification.

For small and fountain headers omit chunk_size and manifest_hash. For chunked,
require both and require chunk_size in 65536, 262144, 1048576. The manifest must
match these values. Header fields have no extra profile-specific variants.

The standalone Header codec remains a component API. Its previously accepted
optional-field combinations are draft component behavior. Complete Box parsing
applies the stricter profile checks above. Legacy unprefixed draft Boxes produce
an unsupported-version outcome and require explicit conversion outside v1.

## 4. Body, signature and padded control payload

Kinds are `msg=0`, `file=1`, `receipt=2`, `invite=3`. Other codes are rejected.
The uncompressed body is deterministic CBOR with the following exact shapes.

```text
msg     = {text:tstr, attachments?:[FileDescriptor, ...]}
file    = {attachments:[FileDescriptor, ...]}
invite  = {root:bytes32, certificate:bstr, secret:bytes32}
receipt = the map in section 9
FileDescriptor = {file_id:bytes32, file_key:bytes32, name:tstr,
                  media_type:tstr}
```

Attachments are limited to one per Box in v1. Require a file attachment for the
chunked profile. A message can accompany that attachment. Small/fountain bodies
omit attachments. `file` kind requires chunked. Filename and media_type limits
are 1024 and 255 UTF-8 bytes. Text and the entire canonical body are capped at
1048576 bytes. Receipts and invites use small, or fountain for a QR carrier.
Require an invite's root/certificate to match its signing sender reference.

The recipient-set hash is `H(id_0 || ... || id_(n-1))` using the exact sorted
outer recipient ids. The sender signs the following bytes.

```text
T = D("openmesh-box-v1") || H(C(Header)) || H(concatenated recipient ids)
      || u8(kind) || H(C(body)) || H(R)
sender_sig = Ed25519.Sign(sender_device_signing_key, T)
```

Compressed bytes must be the sole RFC 1950 zlib stream for C(body). Reject
trailing compressed bytes, concatenated streams and incomplete streams. The
control plaintext is the following self-delimited CBOR item, signature and zeros.

```text
Q = C([kind, R, raw_size, compressed_body])
P = Q || sender_sig64 || zero_padding
raw_size = length(C(body))
```

R and compressed_body are CBOR byte strings, not embedded unframed CBOR items.
The decoder locates Q with a bounded prefix parser, reads exactly 64 signature
bytes, and requires every remaining padding byte to be zero. raw_size must be
at most 1048576. Bound decompression by raw_size and 1048576 while producing
output and require the final output length to equal raw_size. This declared
uncompressed size is distinct from Header.size. Decoded body type and profile
must match kind. Cert reference, kind, recipients and attachments are all bound
by T. No body or file is marked verified until the signature and certificate
policy checks succeed.

## 5. Acyclic assembly and padding buckets

Choose body and recipient set first. Compute C(body), its hash and compressed
body bytes. Construct Q with the sender reference and raw_size. Reserve 64 bytes
for the signature. Determine padded length p from the complete-envelope bucket
calculation below. Finalize Header.size=p, then compute T and sender_sig over
the original uncompressed body. Append that signature to Q and zero-pad to p.
Generate a fresh 32-byte content key CK and fresh 12-byte payload nonce.

Wrap CK separately to each recipient according to section 6 before payload
encryption. Payload AAD is `D("openmesh-payload-v1") || C(Header) || H(C(Recipients))`.
Encrypt P with AES-256-GCM under CK, that nonce and AAD. Assemble the outer
envelope. This binds every recipient wrap, including entries for other devices,
to the payload authentication check without including payload bytes in HPKE info. Generate
new CK, nonce, box_id and HPKE encapsulations for every new sealing operation.
Retrying a send reuses exactly the original Box bytes.

Let `b(n)` be the deterministic CBOR byte-string head width for n payload bytes
(1, 2, 3, 5 or 9). Let `h(p,t,profile)` be the actual encoded Header length with
size=p and created_coarse=t. Let r be recipient count. The complete Box length is

```text
E(p) = 1 + 1 + h(p,t,profile) + 1 + 102*r + 13 + b(p+16) + p+16
     = h(p,t,profile) + 102*r + b(p+16) + p + 32
```

Each recipient tuple costs 102 bytes, including its three-item array head and
byte-string heads. The first two ones are version byte and four-item outer
array head. The next one is the recipient array head (r<=20). The 13 bytes
encode the 12-byte nonce. The AEAD tag occurs only inside p+16.

Candidate complete-envelope buckets are 1024, 4096, 16384 bytes, followed by
integer multiples of Header.chunk_size for chunked, or 65536 bytes for fountain. Choose
the smallest candidate B for which an integer p exists satisfying E(p)=B and
p>=length(Q)+64. CBOR head-width jumps can make a candidate unavailable. Skip
such a candidate. Calculate h using real fields, never a fixed header estimate.
A receiver recomputes this minimum using its exact Q and header fields.

For a small header and a timestamp in [65536, 4294967295], h=91 for the rows below.
These numbers are exact encoding calculations with no body or cert assumption.

| Recipients | Envelope bucket bytes | Padded plaintext bytes | Total overhead bytes |
|---|---|---|---|
| 1 | 1024 | 796 | 228 |
| 1 | 4096 | 3868 | 228 |
| 1 | 16384 | 16156 | 228 |
| 20 | 1024 | unavailable | wraps alone exceed bucket |
| 20 | 4096 | 1930 | 2166 |
| 20 | 16384 | 14218 | 2166 |

Small eligibility uses complete envelope size, with a hard 16384-byte cap.
If no small bucket fits, return `limit-exceeded` for a small request. The caller
may explicitly choose fountain for QR or create a chunked file attachment for
file/WebRTC. This decision creates a new Box with a new signature. A receiver
never silently switches the declared profile.

## 6. Recipient key wrapping

Use RFC 9180 single-shot Base mode with DHKEM(X25519, HKDF-SHA256) 0x0020,
HKDF-SHA256 0x0001 and AES-256-GCM 0x0002. Each recipient uses a separate fresh
encapsulation and its certified device agreement key.

```text
info = D("openmesh-box-v1") || Header.box_id || recipient_device_id
HPKE plaintext = CK32
HPKE AAD = empty bytes
```

The encapsulated key is 32 bytes and wrapped CK is 48 bytes. The payload AAD and
sender signature bind the header and recipient set. Match the recipient id to
an expected root/certificate before attempting the matching wrap. Reject invalid
X25519 keys and all-zero DH outputs as required by RFC 9180. Return typed
unwrap/authentication failure for wrong keys. Bound work to the matching entry,
not all twenty entries. The key wrap has no independent nonce field.

## 7. Chunked stream and Manifest

File data is an independent stream. Its bytes exclude the final Box header,
Box signature and control payload. v1 file-stream compression is none. The
control body alone uses deflate. This supplies bounded per-chunk processing
without decompressing a complete file into memory.

Generate independent random file_key32 and stream_id32 before chunking. Never
reuse that key for changed file data, another stream_id or control CK. Transport
retries reuse saved ciphertext bytes. FileDescriptor carries file_key inside
the sealed control body. Compute a signed manifest independently of that Box.

Select chunk_size from docs/11 using raw file length. Size up to 67108864 uses
65536 bytes, size above 67108864 and up to 17179869184 uses 262144 bytes, and
larger size uses 1048576 bytes. chunk_size is the maximum
ciphertext chunk size including the 16-byte tag. Plaintext capacity per chunk is
chunk_size-16. Use consecutive zero-based indices. The final chunk is nonempty
unless the entire file is empty. An empty file has one final chunk containing
an empty plaintext and a 16-byte tag. Exact-capacity input ends with a full final
chunk, without an extra empty chunk.

```text
nonce_i = u88be(i) || u8(final)          # final is 0 or 1
AAD_i = stream_id32 || u64be(i) || u8(final)
chunk_i = AES-256-GCM(file_key, nonce_i, plaintext_i, AAD_i)
chunk_id_i = H(chunk_i)
```

The counter is restricted to uint64 despite the 11-byte nonce field. Enforce the
manifest count and aggregate GCM budget before starting a stream. The sum
of ceil(plaintext_chunk_bytes/16)+4 across all chunks must be at most 2^32.
The four extra GHASH blocks account for the 41-byte AAD and length block.
Check this budget from the declared size/count before encryption and again
from the validated manifest before decryption. A fresh key is required for every encryption of changed
content. This is the owner's AES-GCM STREAM parameter selection, with the counter
and final-byte arrangement described by age. It is a distinct OpenMesh format
and requires its own independent vectors and external review.

```text
M_unsigned = {v:1, stream_id:bytes32, size:uint, chunk_size:uint,
              count:uint, final_index:uint, chunk_ids:[bytes32,...],
              chunk_sizes:[uint,...], aead:"stream-aes256gcm-v1",
              sender:bytes16}
manifest_sig = Ed25519.Sign(sender_device_signing_key,
  D("openmesh-manifest-v1") || H(C(M_unsigned)))
M = M_unsigned plus {sig:bytes64}
manifest_hash = file_id = H(C(M))
```

The manifest omits file_id. Its standalone version prefix is excluded from its
hash and signature. Sender matches the Box sender device id. Its signature is
separate from the Box signature. Header.manifest_hash and FileDescriptor.file_id
must both match H(C(M)). Require equal lengths of both chunk arrays and count,
count>=1, final_index=count-1, correct chunk size choice for size, and every
nonfinal chunk_sizes entry equal to chunk_size. Final chunk ciphertext is
between 17 and chunk_size bytes, except the empty-file case is 16. The sum of
chunk_sizes minus 16*count equals raw size. All arithmetic uses checked uint64.

Verify manifest signature and every chunk hash before marking a chunk held.
Supply the fixed index and final flag from the validated manifest to AEAD.
Require every listed chunk, including the final one, before emitting a Receipt.
Missing/truncated streams remain incomplete. Repeated identical chunks at the
same index are idempotent. Conflicting bytes, wrong indices, hash mismatch,
AEAD failure and metadata changes are rejected. A transfer may arrive in any
order, but the reconstructed plaintext follows manifest order.

## 8. Resource limits

These are development parser ceilings, not hardware support claims. Callers must
supply lower memory/storage budgets when needed. Reject a limit before reading
or reserving its declared payload. Frame size stays 16384 bytes under docs/11.

| Item | Ceiling |
|---|---|
| Small complete Box | 16384 bytes |
| Canonical uncompressed control body | 1048576 bytes |
| Complete chunked/fountain control envelope | 2097152 bytes |
| Header encoding | 1024 bytes |
| Sender certificate reference | 1024 bytes |
| Recipient entries | 20 |
| Attachments per Box | 1 |
| Manifest encoding | 16777216 bytes |
| Chunk count | 262144 |
| Ciphertext chunk | 1048576 bytes |
| CBOR nesting depth | 12 |
| Control CBOR items | 4096 |
| Manifest CBOR items | 1048640 |

Enforce count from encoded collection headers before allocation. Reject a file
exceeding the manifest count/byte ceilings. A two-level manifest is a future
wire revision. Large files use chunk reads and writes, never a whole-file array.
The chunk-count ceiling alone permits less than 256 GiB of raw data. The
aggregate GCM budget in section 7 imposes a lower ceiling of less than 64 GiB.
This development ceiling is an engineering bound awaiting external review.
Check both ceilings and any lower caller budget before processing excess data.

## 9. Receipts

A Receipt is a Box with kind=2. Its signing sender is the original expected
recipient device. The exact body map is

```text
{box_id:bytes32, device:bytes16, status:0, received_coarse:uint,
 manifest_hash?:bytes32}
```

status=0 means the recipient device completed verification and decoding of the
Box, and, for a file, every listed file chunk. It records device processing.
`received_coarse` is Unix seconds rounded down to a multiple of 60.
`receipt.body.box_id = H(C(original Header) || original payload_ciphertext)`.
This content reference is 32 bytes. It is distinct from random16 Header.box_id.
The original canonical header and ciphertext bytes include the AEAD tag and
exclude outer version, wrappers and nonce. Header integrity and the signed body
are still verified when processing the original Box.

Require manifest_hash for an original chunked Box and match its header and
manifest. Omit it for original small/fountain Boxes. A receipt itself uses a
small or QR fountain envelope, so its receipt-body manifest reference is distinct
from its own Header's optional manifest field.

The original sender supplies the expected content reference, original signed
recipient set, certificate trust anchors and current revocation policy. Require
receipt signer id = body.device = one expected original recipient. Validate its
certificate, expiry and revocation before applying the receipt. Drop an unknown
content reference. Reject mismatched manifest, status, signer or revoked device.
Idempotency key is (body.box_id, body.device, status). The engine atomically
records one accepted receipt per key and ignores subsequent valid duplicates.
The core returns validation outcomes and leaves storage transactions to Phase 2.
Receipt generation takes explicit verified-input results. Parsing alone cannot
issue a Receipt. Receipt arrival does not establish that a person read a message.

## 10. Tags, carriers and later features

Tag derivation stays `HMAC-SHA256(K_tag, D("om-tag-v1") || u64be(i))[0:16]`.
K_tag is 32 bytes, counters never wrap, receiver window is 64. Clock-independent
tag vectors remain required. First-contact key derivation and resync beacons
remain D-6 and need explicit specifications before those flows are implemented.
The single-use invite secret is never a replacement for the root trust policy.

Fountain carries the same control envelope after RaptorQ decode. Fountain is
reserved for QR/one-way carriers. Its final Box verification follows the rules
above. RaptorQ codec/frame selection and real-phone scanning remain Phase 5.
File, WebRTC and swarm use chunked for file transfers. Frame fragmentation,
resume bitmaps and carrier delivery state remain the corresponding phase tasks.

Mailbox packing remains D-5, requiring the Nostr spike and current relay/NIP
verification in Phase 4. Carriers treat Box bytes as opaque and use the decided
Carrier interface. Groups later use fan-out and the 20-recipient cap. Helper
storage remains opt-in and off by default. Tor and other later features retain
the existing roadmap and phase gates.

## 11. Acceptance and review requirements

Write full acceptance tests before seal/open implementation and show failures.
Cover 0 bytes through 5 MiB file round trips, independent positive/negative
vectors, wrong keys, all semantic-field changes, every-bit corruption of Box
and Manifest fixtures, truncated records/streams, nonce/finality/index changes,
certificate/revocation/time boundaries, exact buckets and the small cap, receipt
recipient/replay/reference checks, decompression limits and padding validation.
Fuzz bounded complete-Box and Manifest parsing. No malformed input may escape
as an unhandled exception or allocate beyond the caller's budgets. Verify the
same fixtures with a different implementation. Record self-review checklist,
fresh-session adversarial findings and real-device gaps. Phase 2 waits for the
complete Phase 1 development gate in docs/05.

## 12. Sources and scope of construction

The HPKE suite and its Base mode are defined by RFC 9180. OpenMesh application
info and envelope serialization above are the owner's development choices.
[RFC 9180](https://www.rfc-editor.org/rfc/rfc9180.html)

The age specification describes the counter/final-byte STREAM arrangement with
ChaCha20-Poly1305. OpenMesh uses the owner's selected AES-256-GCM and AAD instead.
This specification requires independent vectors for the OpenMesh combination.
[age payload specification](https://c2sp.org/age@v1.1.0#payload)

BIP-39 defines the entropy/checksum word encoding. The root HKDF mapping above
is the owner's OpenMesh mapping and must be covered by independent vectors.
[BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki)
