# Reconciling the 2026-09-13 audit branches, set 1

Date: 2026-11-01. Target branch: `claude/reconcile-audits-1`, based on
`origin/main` at `cadc83ce8134f577f9f1c201d90a6720b79d42d9`.

Four cloud sessions produced work on 2026-09-13 on branches that were never
merged. Public `main` was later rebuilt as a snapshot history, so these
branches share no merge base with `origin/main`. This report compares each
branch's own commits against `origin/main` by file content and records what
was already there, what was missing, and what no longer applies.

All four branches fork from `c4be16199e390e8bdab766051a0042c7827b8d30`
("Merge pull request #48 … hand-tunnel-toy", 2026-09-12). The session's own
commits are every commit after that point; all are authored "Claude" and dated
2026-09-13.

## Method

For each branch, `git log --format='%h %cs %s' --name-status c4be16199..<tip>`
gave the session's commits and files. For each file, `git diff <tip>
origin/main -- <path>` (also with `-w`) gave the remaining difference, and the
file's presence at `origin/main` and at the fork point gave its history. A file
counts as **landed** when `main` holds the branch's logic and the remaining
diff is later evolution (the `$lib` to `#lib` import-alias migration, Prettier
reflow, the `Position` to `Placement` rename, or sections added after the
branch). **Missing** means `main` lacks the change and the surrounding code
still exists. **Obsolete** means the code the change touched no longer exists
in `main`, or `main` solved it differently.

Summary: 46 touched paths across the four branches. 44 landed, 1 missing
(re-applied), 1 obsolete (dropped). No source code needed re-applying.

Evidence commands were run in this container after `pnpm install
--frozen-lockfile` and `npm run build:packages`. Vitest ran with
`npx vitest run --config tests/config/vitest.config.ts <path>` on
`claude/reconcile-audits-1`, which is `origin/main` plus this report and the
one re-applied document.

## `claude/accessibility-audit-shared-components-ma20hf`

Tip `12784c4653082f4ee1b0610cab9f8f98f694f875`. Eight commits, 34 paths.
Everything landed. `main`'s copies differ only by the import-alias migration,
Prettier reflow, and later extension: `Drawer.svelte` was later split so the
`title` prop now flows to `SharedDrawer`; `keyboard-event.ts` later narrowed
the in-drawer single-key guard with `isLayerOwnedKeyboardTarget`;
`Drawer.svelte.test.ts` gained three more `describe` blocks; the audit vitest
config gained the `$app/env/*` stubs; the report gained a pass-2 seven-tier
measurement section.

| Commit      | Subject                                                                                     | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Classification | Action | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `7ce96b422` | test(a11y-audit): isolated browser suite for shared-surface escape ownership                | `tests/opus-accessibility-audit/{drawer-single-key-shortcuts,escape-ownership}.audit.test.ts`, `harnesses/{DrawerUnderModal,DrawerWithInput,DrawerWithOptions,ModalOnly}Harness.svelte`, `stubs/app-environment.ts`, `vitest.audit.config.ts`                                                                                                                                                                                                               | landed         | none   | All 8 paths exist in `main`; `git diff -w` shows only `$lib`→`#lib` and formatting, plus added `$app/env/*` stubs in the config                                                                                                                                                                                                                                                                                                                               |
| `245f21a10` | test(a11y-audit): filter-chip Escape, dialog naming, focus-restore specs                    | `dialog-accessible-name`, `filter-chip-popover-dismissal`, `focus-restore` audit tests, `harnesses/{HeaderOnlyDrawer,TriggeredSurfaces}Harness.svelte`, `vitest.audit.config.ts`                                                                                                                                                                                                                                                                            | landed         | none   | `focus-restore.audit.test.ts` identical; others differ only by alias and reflow                                                                                                                                                                                                                                                                                                                                                                               |
| `9b5b0c6fd` | docs(a11y-audit): shared drawer/modal/popover accessibility audit report                    | `docs/reports/opus-batch-2026-09-12/accessibility-audit.md`, `axe-sweep`, `computed-styles` audit tests, `harnesses/{NestedDrawers,SubtitleDrawer}Harness.svelte`, `helpers/computed-a11y.ts`                                                                                                                                                                                                                                                               | landed         | none   | `helpers/computed-a11y.ts` identical; report in `main` is a later revision (`*`→`_` emphasis, pass-2 "Not verified" rewrite)                                                                                                                                                                                                                                                                                                                                  |
| `2a2034d08` | docs(a11y-audit): record the audit's commit SHAs in the report header                       | `accessibility-audit.md`                                                                                                                                                                                                                                                                                                                                                                                                                                    | landed         | none   | SHA header present in `main`'s copy                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `7b472ff21` | docs(a11y-audit): correct F2 reachability, F3 rationale, F4 fix, F5 census                  | `accessibility-audit.md`, `dialog-accessible-name.audit.test.ts`, `drawer-single-key-shortcuts.audit.test.ts`, `harnesses/DrawerUnderModalHarness.svelte`                                                                                                                                                                                                                                                                                                   | landed         | none   | diffs are alias and reflow only                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `b2b49a0cf` | fix(a11y): drawer escape deferral, drawer-scoped single keys, chip dismissal, drawer naming | `Drawer.svelte`, `Drawer.svelte.test.ts`, `DrawerKeyboardTestHarness.svelte`, `keyboard-event.ts`, `__tests__/keyboard-event-drawer-scope.test.ts`, `FilterChipBase.svelte`, `FilterChipBase.svelte.test.ts`, `FilterChipDropdownTestHarness.svelte`, `{LOOP,Length,Level,MaxTurnIntensity}FilterChip.svelte`, `GalleryFilterSheet.svelte`, `escape-ownership`, `dialog-accessible-name`, `touched-surface-viewports` audit tests, `accessibility-audit.md` | landed         | none   | `main` `Drawer.svelte` has `title` prop and `shouldDeferEscapeShortcut(document)` in `handleKeydown` (lines 18, 64-67); `keyboard-event.ts` has `isInsideOpenDrawer()` (line 211); `FilterChipBase.svelte` has `ondismiss`, `handleEscape`, `tabindex="-1"` (lines 67, 126, 358); all four chips pass `ondismiss`; `GalleryFilterSheet.svelte` passes `{title}` (line 92); `FilterChipDropdownTestHarness.svelte` identical. Vitest: see evidence block below |
| `bb9840e10` | docs(a11y-audit): note the chip spec extends the existing test file                         | `accessibility-audit.md`                                                                                                                                                                                                                                                                                                                                                                                                                                    | landed         | none   | text present in `main`'s copy                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `12784c465` | fix(a11y): make the chip listbox focusable instead of suppressing the warning               | `accessibility-audit.md`, `FilterChipBase.svelte`, `FilterChipBase.svelte.test.ts`, `tests/opus-accessibility-audit/check-compiler-warnings.mjs`                                                                                                                                                                                                                                                                                                            | landed         | none   | `check-compiler-warnings.mjs` identical; `tabindex="-1"` and its comment at `FilterChipBase.svelte:345-358` in `main`                                                                                                                                                                                                                                                                                                                                         |

## `claude/firebase-security-audit-03y1e7`

Tip `1c54307d5ccd5d71cc8803c49050a3f3d14c2256`. Seven commits, 7 paths. Six
landed; the handoff document was missing and has been re-applied.

| Commit      | Subject                                                                  | Files                                                                                                                          | Classification | Action                                                                                   | Evidence                                                                                                                                                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | -------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `5dc7dfc3a` | test(security-audit): isolated authorization probes for Firebase rules   | `tests/opus-security-audit/{firestore-authz,rules-source,storage-authz}.audit.test.ts`, `harness.ts`, `vitest.audit.config.ts` | landed         | none                                                                                     | `firestore-authz`, `rules-source`, `storage-authz`, `vitest.audit.config.ts` byte-identical to `main`; `harness.ts` differs only in a 4-line header comment `main` reworded to say the probes are unexecuted. Vitest: see evidence block below                                                    |
| `bd3694307` | docs(security-audit): ranked Firebase authorization audit report         | `docs/reports/opus-batch-2026-09-12/security-rules-audit.md`, the three `*-authz`/`rules-source` tests                         | landed         | none                                                                                     | report in `main` is the branch's final text plus a 22-line "Independent local integration verification, 2026-09-13" section appended later                                                                                                                                                        |
| `db61e6a41` | docs(security-audit): fill in exact commit SHAs in the audit report      | `security-rules-audit.md`                                                                                                      | landed         | none                                                                                     | SHAs present in `main`'s copy                                                                                                                                                                                                                                                                     |
| `357f95346` | docs(handoff): Firebase security audit — run the prepared probes locally | `docs/superpowers/specs/2026-09-13-firebase-security-audit-handoff.md`                                                         | **missing**    | re-applied at the same path with a reconciliation note prepended                         | file absent from `main` (`git cat-file -e` fails); no other `main` file references it; `main` keeps other `*-handoff.md` files in `docs/superpowers/specs/`. Every repository path the handoff cites exists in `main`. Commit `reapply(firebase-security-audit): docs(handoff): …` on this branch |
| `54e9b40fc` | docs(handoff): make the branch-tip reference self-consistent             | same handoff file                                                                                                              | **missing**    | folded into the re-applied file (branch-tip text taken as of the branch's final version) | same                                                                                                                                                                                                                                                                                              |
| `e5803aaf9` | docs(security-audit): correct five defects found by independent review   | `security-rules-audit.md`, `firestore-authz.audit.test.ts`, `rules-source.audit.test.ts`                                       | landed         | none                                                                                     | tests byte-identical to `main`                                                                                                                                                                                                                                                                    |
| `1c54307d5` | docs(security-audit): correct two corrections and one contradiction      | `security-rules-audit.md`, `rules-source.audit.test.ts`                                                                        | landed         | none                                                                                     | test byte-identical to `main`                                                                                                                                                                                                                                                                     |

The handoff's own SHAs are branch commits, which remain reachable on the
remote branch, so they were left as written. The prepended note records what
changed after the handoff was written: two later correction commits, 47
`rules-source` tests rather than 37, and 52 prepared runtime probes rather
than 50, and that `main`'s copy of the report still lists the runtime probes as
unexecuted.

## `claude/fix-export-lifecycle-issues-y7c45a`

Tip `f8440e39995f45eaed54f35ef75c4bda80600bab`. Four commits, 5 paths. Four
landed; the GIF test is obsolete.

| Commit      | Subject                                                       | Files                                                                                                            | Classification | Action  | Evidence                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `12bb216b0` | fix(export): key export lifecycle to the run that produced it | `src/lib/shared/export-panel/services/export-orchestrator.ts`, `__tests__/export-orchestrator.lifecycle.test.ts` | landed         | none    | `main` `export-orchestrator.ts` has `interface ExportRun`, `activeRun`, `canceled` handling (lines 43-149); remaining diff is alias migration, `includeStartPosition`→`includeStartPlacement`, the "TKA"→"Flow Arts Composer" share title, and a later `carousel` option. Test differs only by alias and the rename. Vitest: see evidence block below                                                                 |
| `08796d0be` | docs(export): report the export-lifecycle investigation       | `docs/reports/opus-batch-2026-09-12/export-reliability.md`, lifecycle test                                       | landed         | none    | report present in `main` minus the GIF section (see next row)                                                                                                                                                                                                                                                                                                                                                         |
| `5a4627feb` | fix(export): close the two cancel paths review found          | `export-reliability.md`, `SequenceDrawerHost.svelte`, `export-orchestrator.ts`, lifecycle test                   | landed         | none    | `main` `SequenceDrawerHost.svelte:625-633` routes the close-panel cancel through `exportOrchestrator.cancelExport()` with the branch's comment verbatim; queued-attempt cancel loop at `export-orchestrator.ts:93-100`                                                                                                                                                                                                |
| `f8440e399` | test(export): cover the GIF capture lifecycle                 | `src/lib/shared/animation-engine/services/live-canvas-gif-exporter.test.ts`, `export-reliability.md`             | **obsolete**   | dropped | `live-canvas-gif-exporter.ts` and its existing test are absent from `main`; `gifenc` is no longer in `package.json`; no `src/` file references `downloadAnimationGif`, `gifenc` or `live-canvas-gif`. `main`'s copy of the report deliberately removes the GIF section and the three GIF rows of the verification table. The GIF export path was removed from the product, so there is nothing for this test to cover |

## `claude/fuse-sequence-composition-fix-smdu2c`

Tip `b862a08dd8f7a1788086e91299d2effb5b212f5d`. Six commits, 5 paths.
Everything landed.

| Commit      | Subject                                                                          | Files                                                                                                          | Classification | Action | Evidence                                                                                                                                                                                                                                                              |
| ----------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `358d29746` | test(fuse): red repro for fused motion field loss                                | `src/lib/features/fuse/services/__tests__/fused-motion-fidelity.test.ts`                                       | landed         | none   | diff is alias migration and `startPosition`→`startPlacement` only. Vitest: see evidence block below                                                                                                                                                                   |
| `8b9daccaf` | fix(fuse): keep authored motion fields and resolve the fused frame symmetrically | `sequence-fuser.ts`, `src/lib/shared/foundation/services/step-deriver.ts`, `__tests__/fused-grid-mode.test.ts` | landed         | none   | `main` `sequence-fuser.ts` carries the branch's `rehydrateMotion` call and its "Rehydrate through the canonical owner" comment; `git diff -w` on both source files shows only alias migration and the Placement rename (`deriveStartPosition`→`deriveStartPlacement`) |
| `d05dc0e18` | docs(fuse): correctness audit report for the Opus batch                          | `docs/reports/opus-batch-2026-09-12/fuse-correctness.md`, both fuse tests                                      | landed         | none   | report in `main` is the branch's final text plus later "Independent local browser verification" and "Fresh main-versus-branch Chromium comparison" sections                                                                                                           |
| `7c9a6fee4` | docs(fuse): label the audit report's SHA as the final runtime commit             | `fuse-correctness.md`                                                                                          | landed         | none   | present in `main`'s copy                                                                                                                                                                                                                                              |
| `0c7ef21e8` | docs(fuse),test(fuse): correct the audit report and close the fidelity-test gaps | `fuse-correctness.md`, both fuse tests                                                                         | landed         | none   | tests differ only by alias and rename                                                                                                                                                                                                                                 |
| `b862a08dd` | docs(fuse): record the post-correction full-suite run                            | `fuse-correctness.md`                                                                                          | landed         | none   | the "15983 tests across 1974 files" line is in `main` as "15982 tests", a later correction                                                                                                                                                                            |

## Test evidence on `claude/reconcile-audits-1`

All runs are on `claude/reconcile-audits-1` after `pnpm install
--frozen-lockfile` and `npm run build:packages` (both exit 0).

| Check                                               | Command                                                                                                                                                                                               | Result                                                                 |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Fuse, export and keyboard suites the branches added | `npx vitest run --config tests/config/vitest.config.ts` on `fused-motion-fidelity.test.ts`, `fused-grid-mode.test.ts`, `export-orchestrator.lifecycle.test.ts`, `keyboard-event-drawer-scope.test.ts` | 4 files, 27 tests passed (3 + 5 + 12 + 7)                              |
| Security source probes                              | `npx vitest run --config tests/opus-security-audit/vitest.audit.config.ts rules-source`                                                                                                               | 47 tests: 45 passed, 2 failed (see observation 1)                      |
| Security runtime probes                             | static count of `it(`/`repro(`/`measured(` in `firestore-authz` and `storage-authz`                                                                                                                   | 33 + 19 = 52 prepared, matching the report; not executed (no emulator) |
| Accessibility audit suite (browser)                 | `AUDIT_CHROMIUM_PATH=/opt/pw-browsers/chromium npx vitest run --config tests/opus-accessibility-audit/vitest.audit.config.ts`                                                                         | 8 files, 18 tests: 15 passed, 3 failed (see observation 2)             |
| Tests touching this branch's diff                   | `npm run test:changed`                                                                                                                                                                                | "no tests touch these 2 changed files" (both are documents)            |
| Formatting                                          | `npx prettier --check` on the two documents                                                                                                                                                           | clean after one `--write` on the report                                |

### Observation 1: two `rules-source` probes are stale on `main`

`tests/opus-security-audit/rules-source.audit.test.ts` is byte-identical on
the branch and on `main`, yet two of its F2 "CORRECTION" probes fail on
`main`. Both read `src/lib/shared/library/services/public-index-syncer.ts`
and look for the literal one-line `{ merge: true }`. `main` later ran Prettier
over that file, so the same call now spans three lines:

```text
setDoc(doc(firestore, a.collectionPath, a.docId), a.data, {
  merge: true,
})
```

The behavior the probes observe is unchanged; only the text shape moved. This
failure predates the reconciliation and is not caused by it. The fix is to make
the two string and regex matches whitespace-tolerant. It was not applied here
because it is outside the re-application scope; it is recorded for whoever next
touches the security audit suite.

### Observation 2: the accessibility audit suite reports three open probes, not two

`main`'s copy of `accessibility-audit.md` states the audit suite ends at
`2 failed | 16 passed (18)`, the two being the unfixed narrowed F2 (a modal over
a drawer with focus on a plain button) and the F5 callsites other than Browse
Filters. On `main` today the same suite reports `3 failed | 15 passed (18)`:

- `escape-ownership` › "stacked modal is the layer dismissed — focus on a
  button in the modal": the documented open F2 case.
- `dialog-accessible-name` › "the remaining unnamed callsites still produce a
  nameless modal dialog": the documented open F5 case.
- `axe-sweep` › "Drawer + DrawerHeader, the Browse Filters sheet composition":
  axe reports `aria-dialog-name (serious)` on one node. The harness it mounts
  (`HeaderOnlyDrawerHarness.svelte`) deliberately passes no `labelledBy`,
  `ariaLabel` or `title`, mirroring the pre-fix Browse Filters sheet, and is
  the same on the branch and on `main`. The branch's `title` fallback itself is
  present: `main`'s `Drawer.svelte` forwards `title` to the vendored
  `@austencloud/drawer` 0.2.0, whose `Drawer.svelte:198` resolves
  `labelledBy ? undefined : (ariaLabel ?? title)` in both `src` and `dist`, and
  the production `GalleryFilterSheet.svelte` passes `{title}`. So this is axe
  now detecting the unnamed-dialog gap the harness was built to show, not a
  lost fix. Why the same probe passed on the branch was not established here;
  that is an inference gap, not a measured cause.

The audit suite is not wired into CI by the report's own decision, so neither
observation affects a gate.

## Not done

- No source change was re-applied, so there was nothing for
  `npm run test:changed` to find beyond the two documents; its run is recorded
  above for completeness.
- The 52 prepared Firebase runtime probes remain unexecuted. They need the
  Firestore emulator, which this container cannot download. That is the same
  limitation the original session hit and the reason the handoff exists.
- The old branches were left untouched.
