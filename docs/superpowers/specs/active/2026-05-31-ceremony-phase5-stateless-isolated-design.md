---
status: active
value: 2
effort: M
remaining: "Verify Ceremony Phase 5 + 3 + C — Stateless Conversion, Isolated-Clone Execution against scripts/ceremony-inventory.mjs before resuming implementation. Prior recorded remainder: 'Phase C rename ~complete (173→13 files); Phase 5 + Phase 3 show no measurable progress'"
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Ceremony Phase 5 + 3 + C — Stateless Conversion, Isolated-Clone Execution

> **DRIFT WARNING — 2026-08-02.** Phase C rename ~complete (173→13 files); Phase 5 + Phase 3 show no measurable progress
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state. Source: `docs/superpowers/handoffs/2026-07-25-spec-triage-ledger.md`.


**Date:** 2026-05-31
**Status:** Design — approved direction (rebase-often, tiny batches)
**Branch:** `ceremony/stateless-phase5` in sibling clone `E:\tka-platform-ceremony`
**Resumes:** `docs/specs/enterprise-ceremony-retirement.md` (Phases 1–4 done), `docs/superpowers/specs/2026-05-06-ceremony-flattening-kebab-rename-design.md`

## Why this exists

Phases 1–4 of the enterprise-ceremony retirement are done on `main`: `contracts/`
dirs = 0, `implementations/` = 2 (deliberate), the May 28–29 sprint flattened +
kebab-renamed 40+ feature modules, interfaces went 757 → 20 (hard tail only).

What was **never executed** is the stateless-class sub-effort (Phase 5) plus two
smaller tails (Phase 3 type-only interfaces, Phase C residual kebab renames).
This spec covers executing those in an **isolated clone** so the broad file churn
never storms the user's `:5173` Vite HMR on `E:\tka-platform`, while the user and
other agents keep committing to `main`.

## Live baseline (clone, 2026-05-31)

| Metric | Live | Phase-5 target |
|---|---|---|
| `implements I` declarations | 54 | ~25 |
| singleton getter files (`get-*.ts`) | 370 | ~280 |
| residual PascalCase `.ts` (non-test, non-`I*`, non-3d) | 173 | 0 |
| `contracts/` dirs | 0 | 0 (done) |
| `implementations/` dirs | 2 | 2 (deliberate) |

Manifest classification (May 28 snapshot — counts valid, paths stale post-flatten):
`stateless` 51, `stateless-deps` 52, `stateless-cache` 15 → **~118 conversion
candidates**; `stateful` 439 (KEEP).

## Scope

**In:** Phase 5 (stateless → function modules), Phase 3 (type-only `I*` → `types.ts`,
drop `I`), Phase C (residual PascalCase `.ts` → kebab via existing codemod).
**Out:** Phase 6 (getter return-type cosmetic simplification — ~0 value this round).

## Environment & isolation

- Work happens only in `E:\tka-platform-ceremony` (separate `.git` hardlinked to
  origin objects; separate `node_modules`, 96/96 deps copied). The user's
  `E:\tka-platform` working tree and Vite HMR are never touched.
- Clone `origin` = `E:\tka-platform`. **`git fetch origin` only** (read-only on the
  user's repo). **Never `git push` to origin**, never auto-merge.

## Step 0 — fresh inventory + green baseline

1. Re-run `node scripts/ceremony-inventory.mjs` in the clone → current manifest
   reflecting post-flatten paths (the committed manifest predates the May 28 sprint).
2. Record baseline: `npm run test:ci` (vitest) green, one cold `npm run check`
   captured to a log. Any later red is provably introduced by this work.
3. Start `npm run check:watch` once in the background for incremental type feedback
   (per `fast-iteration-loop.md`; no repeated cold `check`).

## Phase 5 — stateless class → function module

Per the prior classification, for each candidate:

- **`stateless`** (0 fields, 0 ctor params): convert class methods to exported
  module functions; delete the `get*` singleton getter; rewrite all imports from
  `getFoo().bar()` → `bar()`.
- **`stateless-deps`** (only fields are other service singletons): same conversion;
  inside each function, call the dependency's singleton getter instead of reading a
  ctor-assigned field.
- **`stateless-cache`** (only Map/Set cache fields): module-scoped cache variable +
  exported functions; delete getter.
- **`stateful`** / **polymorphic** (the 8 genuine `2+ impl` interfaces): **untouched.**

Verification per batch (one module or ~10 files): `check:watch` clean for touched
files + scoped `npm run test:ci -- <touched test glob>` → atomic commit with
**explicit pathspec** (`git commit -- <paths>`; shared-index hygiene per
`commit-only-your-own-changes.md`).

## Phase 3 — type-only interfaces

The ~10 `I*.ts` files with zero implementations → move the type into the consuming
module's `types.ts`, drop the `I` prefix, rewrite imports. Leave the 8 polymorphic
keepers (`ILOOPExecutor`, `ISubInterpreter`, `ILOOPDetector`, `IAsciiRenderer`,
`IDirectRenderer`, `IEndpointDetector`, `IInputProvider`, `ITrailOverlayCanvas`) and
the `IFeedbackTesterWorkflow` inversion boundary.

## Phase C — residual kebab rename (LAST, mechanical)

Run after 5+3 land green. Drive with the existing `scripts/ceremony-flatten-kebab.cjs`
codemod against the 173 residual PascalCase `.ts` files (exclude `.svelte`, keeper
`I*.ts`, `*.test.ts` triage separately). **Delivered as a re-runnable codemod, not
173 carried file-moves** — so at merge time the script re-runs on fresh `main` with
near-zero rename conflict.

## Merge safety (main moves under us)

- **Rebase often, tiny batches** (approved). After each batch: `git fetch origin` +
  `git rebase origin/main`, resolving early while conflicts are small.
- Atomic per-module commits with clear messages; explicit pathspec every commit.
- Phase C as codemod → re-runnable on final `main`.
- **Handoff:** the branch and
  `docs/superpowers/handoffs/2026-05-31-ceremony-phase5-merge-handoff.md`
  (recipe: re-run codemods on fresh `main`,
  then rebase/cherry-pick the semantic Phase-5 commits). The user merges when idle.
  This work never merges into `main` while the user is active.

## Success criteria

1. `implements I` ≈ 25, getter files ≈ 280, residual PascalCase `.ts` = 0.
2. `npm run check` clean and `npm run test:ci` green in the clone — same pass set as
   the Step-0 baseline, no new failures.
3. Branch rebases cleanly onto a recent `origin/main`.
4. `docs/superpowers/handoffs/2026-05-31-ceremony-phase5-merge-handoff.md`
   present with a reproducible landing recipe.

## Risks

- **Hidden statefulness:** a class classified `stateless` that actually relies on
  construction-time side effects. Mitigation: per-batch tests + `check`; if a
  conversion changes behavior, revert that file and reclassify `stateful`.
- **Consumer pattern variety:** `getFoo()` stored in a variable, passed as an arg,
  dynamically imported. Mitigation: the inventory edge-case pass flags these; handle
  by hand, don't blind-codemod.
- **Rebase churn:** if `main` heavily edits a candidate file mid-flight, prefer
  rebasing before continuing that module.
