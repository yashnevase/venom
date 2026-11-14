# Claims ledger

| Claim | Test ID | Result | Conditions | Date | Status |
|---|---|---|---|---|---|
| Foundation tooling passes its local checks | P0-ACCEPTANCE, P0-SMOKE, L0 | 2 tests pass, strict types and lint pass, 135 installed package licenses checked, 0 advisory findings in 165 locked dependencies | Mac arm64, Node 24.11.0, pnpm 11.25.0, registry access for audit | 2026-11-14 | WORKS locally |
| GitHub CI passes the foundation gate | P0-CI | Pending first remote run | Ubuntu GitHub Actions | 2026-11-14 | UNPROVEN |
| Offline WebRTC connects in under 30 seconds | S-2, DEV-2 | Pending phone test | Xiaomi Note 13 and Mac, hotspot with mobile data disabled | 2026-11-14 | UNPROVEN |
| Phase 1 seal/open and chunked conformance pass | T-UNIT-1..6, VEC-1..3 | Pending protocol decisions and implementation | Node, independent vector verifier, fuzz inputs | 2026-11-14 | UNPROVEN |
