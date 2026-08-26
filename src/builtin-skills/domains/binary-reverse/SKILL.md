# Binary Reverse Engineering（二进制逆向领域知识）

Use this skill when reverse-engineering proprietary binary formats (e.g. 金昌 EX9000 .jch files). Lessons from the jch project (159 commits, 100% format verification achieved).

## Methodology (proven order)

1. **Structural reconnaissance**: hexdump / entropy analysis / signature scanning to locate file partitions (scripts/jch-recon.js pattern).
2. **Differential analysis is the most reliable field-location method**: have the user generate "known content" samples (different layer counts/sizes/colors/names), binary-diff them. Naming convention: `t1-empty.jch`, `w100x100.jch`.
3. **Verification loop with the original tool**: automate open → merge → export BMP → pixel-level compare (EX9000 via automation API). Every claim is verified pixel-perfect or marked DIFF.
4. **Write every conclusion to docs/** — reproducible, checkable. Track remaining unknowns in a TODO list in the format doc.

## Safety rules (hard, from a real pollution incident 2026-08-07)

- **Sample files are user's real assets — read-only, never modify**. Tests must use `make_test_copy` into a unique filename.
- **NEVER save over source files when closing the original app**: close_all_docs must click "否" (No) on unsaved documents. A real pollution incident happened when automation saved over source material.
- **OOM protection**: EX9000 is 32-bit; ensure_memory before operations; files >30M pixels use the viewer, not EX9000.
- Restart the external app periodically (every N files) — long automation sessions destabilize it.

## Format knowledge patterns (JCH case)

- Extension ≠ format: dual families GTAP (GTAPP+0x1450) / CT (CT+0x112), detected by signature not filename.
- Layer headers may be encrypted (XOR with constants); RLE streams may be plaintext or encrypted per-layer — detect per-layer by row-table consumption matching, not by bpp.
- Random-threshold halftone: P(ink)=(255-mask)/255.
- 1-bit masks per layer + color + name is the common structure.
