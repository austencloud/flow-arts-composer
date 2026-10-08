---
status: active
value: null
effort: null
remaining: "Verify Repository Root Cleanup against scripts/sync-shortcodes-to-kv.ts before resuming implementation. Prior recorded remainder: Verify phase 1-3 root cleanup and measured size against the current tree; then assess the Later Work section separately."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Repository Root Cleanup

**Queue evidence (2026-10-07):** The phase 1–3 implementation claim is historical. Current-tree targets and measured reclaimed size still need checking before closeout.

**Date:** 2026-08-05

**Original status (historical):** Implemented for phases 1 through 3

## Goal

Make the repository root readable without disturbing active development. The
cleanup removes expired generated output, gives retained research and handoffs
stable homes, and removes tracked session debris from the root.

Large source archives and credential-path changes are outside this pass. They
need separate verification because they contain unique assets or affect many
scripts.

## Survey Snapshot

The read-only survey found 151 visible root entries: 63 directories and 88
files. Sixty files were tracked directly at the root. The approved generated
targets held 8.14 GiB.

The checkout was active during the survey. Multiple Vite processes were using
the primary checkout, other sessions owned untracked artifacts, and commits
landed on `main` while the inventory ran. Every mutation in this cleanup is
therefore limited to an explicit path.

## Protected State

These paths and systems are not part of the cleanup:

- `.svelte-kit/` and `node_modules/`, because active Vite processes use them;
- `.codex-qft-review.md`, `.codex/visualizations/`, `artifacts/`,
  `tka-share-test.png`, and current temporary research scripts, because an
  active handoff identifies them as other sessions' work;
- `.env`, `.cert/`, `.mcp.json`, `serviceAccountKey.json`, and
  `firebase-service-account.json`, because local tooling consumes them;
- `.git/`, `.reference-repos/`, `.tools/`, and
  `.claude-artifacts/generator-conformance/`;
- `blender/`, `assets/source-models/`, local-only source models under
  `static/`, and `.ios-builds/`. Their external archive is a later phase.

No branch, worktree, commit, process termination, dependency reinstall, or
browser action is authorized by this cleanup.

## Phase 1: Record the Contract

This file is the path ledger. The before and after inventories belong in the
session report, not in another generated root file.

## Phase 2: Remove Generated Output

All entries below are ignored, reproducible, and unused by running processes at
the execution gate.

| Path | Survey size |
|---|---:|
| `src-tauri/target/` | 3026.8 MiB |
| `.claude-tmp/` | 1730.7 MiB |
| `android/app/build/` | 1345.5 MiB |
| `.wrangler/tmp/` | 1079.0 MiB |
| `.perf-traces/` | 353.0 MiB |
| `android/app/src/main/assets/` | 346.6 MiB |
| `.tmp/` | 256.0 MiB |
| `.fast-check/` | 74.5 MiB |
| `.screenshots/` | 57.4 MiB |
| `android/.gradle/` | 33.9 MiB |
| `build/` | 20.4 MiB |
| `.cache/` | 4.1 MiB |
| `test-results/` | 1.8 MiB |
| `.audit-evidence/` | 1.1 MiB |
| `android/build/` | 0.1 MiB |

Deletion must resolve every path beneath `E:\tka-platform`, reject reparse
points, and verify absence afterward.

Small ignored root outputs may also be removed when their ignore rule and lack
of consumers are confirmed in the same execution pass. Credentials and active
handoff files remain protected even though they are ignored or untracked.

## Phase 3: Reduce Tracked Root Litter

### Remove from the current tree

| Path | Evidence |
|---|---|
| `.kv-bulk-shortcodes.json` | `scripts/sync-shortcodes-to-kv.ts` generates this temporary upload file and deletes it in `finally`. |
| `snap.json` | It is an older shortcode export than `static/data/snapshots/shortcodes.json`; Git history retains the old corpus. |
| `fire.pdf` | It renders as one flame mark on an otherwise blank page and has no repository consumer. |
| `donation-card-front.png`, `donation-card-back.png` | The current generation scripts write `static/donation/front.png` and `static/donation/back.png`. |
| `qr-paypal.png`, `qr-venmo.png` | They are byte-identical to the copies under `static/donation/`. |
| `vite.debug5175.config.mts`, `vite.debug5176.config.mts` | Their own headers call them uncommitted, session-local worktree configs. The named worktrees are gone. |

`.kv-bulk-shortcodes.json` and `vite.debug*.config.mts` receive explicit ignore
rules so the same files do not return.

### Move to stable homes

| Root path | Destination |
|---|---|
| `donation-cards-4up-duplex.pdf` | `docs/reference/printables/donation-cards-4up-duplex.pdf` |
| Eight root HTML playgrounds and prototypes | `docs/research/interactive-prototypes/` |
| `build-playground.cjs` | `scripts/research/build-prop-variant-playground.cjs` |
| `CODEX_AUDIT_BRIEF.md` | `docs/superpowers/specs/audits/2026-07-18-notation-roots-audit-brief.md` |
| `CODEX_AUDIT_FINDINGS.md` | `docs/superpowers/specs/audits/2026-07-18-notation-roots-audit-findings.md` |
| `REMEDIATION_LEDGER.md` | `docs/superpowers/specs/audits/2026-07-18-notation-roots-remediation-ledger.md` |
| `MERGE.md` | `docs/superpowers/handoffs/2026-05-31-ceremony-phase5-merge-handoff.md` |
| `poi-recon/` | `docs/research/poi-recon/` |

References must follow the new paths. The moved playground builder must write
to the moved `prop-variant-playground.html` regardless of the caller's working
directory.

## Verification

The pass is complete only when all of these checks agree:

1. Every phase 2 target is absent and the measured reclaimed size is reported.
2. Every removed tracked root file is absent from disk and appears in
   `git ls-files --deleted` until the cleanup is committed.
3. Every moved file exists at its destination with the same SHA-256 hash,
   except the playground builder whose output path changes intentionally.
4. Repository searches find no stale live references to the old paths.
5. `git diff --check` passes on cleanup-owned text files.
6. Git status shows only the approved cleanup paths plus unrelated work that
   was already present.

No full build is required. This pass changes documentation, ignored output,
research artifacts, and unused root files. Running a build would recreate part
of the output being removed and would contend with active Vite sessions.

## Later Work

The next cleanup should move non-shipping source assets out of `static/` before
purging `.svelte-kit/`. Git ignore rules do not stop SvelteKit from copying
those files into both client output and Cloudflare output.

Credential consolidation is separate. The two root service-account filenames
appear across 180 files, so moving them requires one shared credential loader
and focused tests for administrative scripts.
