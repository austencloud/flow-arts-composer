# Hand Relationship in Generate: Adversarial Review Handoff (2026-09-13)

## Mission

Attack the Hand Relationship feature that shipped to `main` on 2026-09-12 and
2026-09-13, then fix what you break. It adds a per-step constraint on how the
left hand relates to the right in Generate (Free, Mirrored, Flipped, Unison,
Opposite, each optionally Inverted), a Match turns toggle, LOOP coercion for
the combinations that cannot close, and a redesigned Customize drill screen.
Design and decisions: `docs/superpowers/specs/2026-09-12-mirrored-hands-generate-design.md`
(read its two addenda). Plan that was executed:
`docs/superpowers/plans/2026-09-12-hand-relationship-generate.md`.

Feedback item: `f2SKgV5rqEMJoHhTGggD` (in review, submitter ssnss). Do not
change its status; add a heartbeat only if you claim it.

You are the second pair of eyes. Assume every claim below is wrong until the
listed evidence reproduces on your machine. Where you find a defect, fix it in
a worktree, add the test that would have caught it, and finish through
`npm run wt:finish`.

## Done, verified

All on `main`. Merge commits, in order: `733d98ae2f` (feature),
`8f6eeaf099` (Match turns), `6cc096fc01` (drill screen and T&D rows),
`50e48632f6` (merge of `origin/main`, unrelated).

Reproduce every check from a task worktree, never the primary checkout (see
Gotchas). Commands assume the worktree root unless stated.

1. **Engine constraint** (`48c3194b6e`, `561b4ec7c3`):
   `packages/sequence-engine/src/generation/constraints/style/hand-relationship-constraint.ts`,
   composed by `build-constraint-set.ts` from `ConstraintOptions.handRelationship`.
   Evidence: `cd packages/sequence-engine && npx vitest run tests/generation/constraints/style/hand-relationship-constraint.test.ts`
   passes 26 tests, including a census that pins the exact rows each
   relationship selects in both dataframes (24 rows per relationship, plain
   and inverted; letters D E J K Φ- Ψ- α β for diamond mirrored, M N P Q Λ- γ
   for box mirrored, and so on).
2. **Builder-level proof** (`04362ee6ed`):
   `packages/sequence-engine/tests/generation/hand-relationship-build.test.ts`
   builds against the real dataframes: every step of every relationship
   holds, starts land on eligible positions, L3 full intensity holds,
   Mirrored plus rotated halved closes, Unison plus rotated quartered closes,
   Mirrored plus rotated quartered throws "No valid 2-step path exists".
   Evidence: `npx vitest run tests/generation/hand-relationship-build.test.ts`
   in the engine package, 14 tests pass. Whole engine suite: 52 files, 449
   tests pass (`npx vitest run` in `packages/sequence-engine`).
3. **Match turns in the engine** (`1fc9cc8b77`): `BuildOptions.matchHandTurns`
   makes `allocateTurns({ matchHands })` copy one lane to both hands, and a
   left dash or static that gains turns takes the spin
   `relatedRotationDirection` implies from the right hand, both inside
   `BeamSearch.enrichWithTurns` and in `SequenceBuilder.postProcess`.
   Evidence: `tests/generation/turns/turn-allocator-constraints.test.ts`,
   `tests/generation/turns/turn-materializer-forced-direction.test.ts`, and
   the four `matchHandTurns` cases in `hand-relationship-build.test.ts`.
4. **App plumbing** (`192f36372c`, `227aca297b`, `36124d78bb`, `cac47f9aeb`):
   `src/lib/shared/create/domain/hand-relationship.ts` is the vocabulary;
   `UIGenerationConfig.{handRelationship, handRelationshipInverted, matchHandTurns}`
   flow through `config-mapper.ts` to `GenerationOptions`, then
   `GenerationOrchestrator.mapConstraints` and both `builder.build` calls.
   Persisted in `tka-generate-config`; `generator-persistence-normalizer.ts`
   drops malformed values. Evidence:
   `npx vitest run --config tests/config/vitest.config.ts src/lib/features/create/generate src/lib/shared/create tests/unit/services`
   passes (50 files, 341 tests on 2026-09-12; 22 files, 148 tests for the
   `src/lib/shared/create/domain` and `src/lib/features/create/generate`
   subset on 2026-09-13).
5. **LOOP coercion** (`227aca297b`, `b59c149dcb`): `resolveLoopConfig` in
   `src/lib/shared/create/services/loop-type-utils.ts` turns quartered into
   halved and a diagonal `reflectionAxis` into the relationship's own axis
   when the relationship is Mirrored or Flipped. The LOOP card reads the
   resolved value (`loop-card-display.ts`). Evidence:
   `src/lib/shared/create/services/loop-type-utils.hand-relationship.test.ts`
   and the two coercion cases in
   `src/lib/features/create/generate/components/cards/__tests__/loop-card-display.test.ts`.
6. **Drill screen** (`4b2087e871`, `cac47f9aeb`, `ee606fbace`):
   `HandRelationshipPanel.svelte` renders five radio rows (element glyph,
   title, T&D quadrant and element, description) plus Inverted and Match
   turns toggles; `CustomizeExpandedOverlay.svelte` adds the row only when a
   change handler is passed, so the public Composer demo shows nothing new.
   Evidence: browser runs on 2026-09-13 from a worktree server at 1440x900
   and 375x812: rows render with all four element webp files loaded, the
   phone sheet fits within 1px of its scroller, selection persists to
   `localStorage`. `svelte-check found 0 errors and 0 warnings` inside each
   of the three `wt:finish` gates.
7. **T&D correspondence** (`ee606fbace`):
   `src/lib/shared/create/domain/hand-relationship-tnd.test.ts` reads both
   dataframes and proves Mirrored is together-opposite, Flipped
   split-opposite, Unison together-same, Opposite split-same, 16 of 16 shift
   rows per cell including inverted. Evidence:
   `npx vitest run --config tests/config/vitest.config.ts src/lib/shared/create/domain`.
8. **Real generated output** (browser, 2026-09-12 and 2026-09-13, read from
   `localStorage["tka-generate-sequence-state-v1"]`): Mirrored plus Inverted
   in diamond produced `LFLFLFLF` with every left motion the N-S reflection
   of the right; Mirrored in box produced `Λ-Λ-MPΛ-Λ-MP` on γ2/γ6/γ12/γ16;
   Unison plus quartered rotation produced `GΨ-GΨ-GΨ-GΨ-`; Match turns at L3
   produced `EΦ-KΨ-EΦ-KΨ-` with equal turns per step, floats together, and
   every dash step spinning cw left against ccw right; Match turns off
   produced `JDJDJDJD` with differing turns. Not saved as files; reproduce
   with the snippet under Gotchas.

## Believed done, unverified

- The public Composer demo (`src/routes/(public)/composer/_sections/GenerateSection.svelte`)
  still shows only Style, Start Position and End Position in its Customize
  drawer. Reasoned from the optional props; never opened in a browser.
- `Reset all` in the Customize drawer restores Free, not inverted, Match
  turns off. Covered by `generate-config-hand-relationship.test.ts` at the
  state level; the overlay's local mirrors were not clicked through.
- Saved Setups round-trip the three new fields. Reasoned from
  `captureSetupSnapshot` (whole-config JSON) and `updateConfig(setup.config)`;
  no Firestore write was exercised.
- Keyboard navigation of the radio rows. Synthetic ArrowUp/ArrowDown events
  moved selection and persisted it; a real key press closes the whole drawer
  (see Loose ends #6), so it could not be confirmed end to end.

## In flight

Nothing uncommitted from this work. All three task worktrees were removed and
their branches deleted after merging.

Running elsewhere: Austen started a separate session on task
"Stop arrow keys closing the Customize drawer" (spawned 2026-09-13). It works
in its own worktree on the keyboard shortcut path
(`src/lib/shared/keyboard/registration/register-create-shortcuts.ts` and
panel coordination). Do not fix Loose end #6 yourself unless that session has
finished; check `git branch --list` and `git worktree list` first.

## Loose ends, ranked (your attack surface)

1. **Mirrored or Flipped plus a reflecting LOOP in box mode.** My
   commutation argument treats the LOOP's mirror as a pure N-S reflection,
   but `tests/generation/loop-spec-build.test.ts` documents that in box mode
   `FusedExecutor` transports the reflection along the hand path and lands
   on an emergent diagonal axis. If that is what runs, the extended half of a
   Mirrored plus `mirrored` (or `mirrored_swapped`, `mirrored_inverted`) LOOP
   in box would not be mirrored. Only diamond plus rotated halved and unison
   plus rotated quartered were proven. Build every LOOP type in both grids
   with each relationship through `SequenceBuilder` and assert
   `handRelationshipHolds` on all steps after extension. Where it fails,
   decide with the spec's commutation table whether to coerce or accept.
2. **Spell mode plus a relationship.** `buildByWord` receives the same
   constraint set. A word whose letters are not in the relationship's
   vocabulary (for example `AAAA` with Mirrored) should fail cleanly or
   bridge; I never ran it. Check what the user sees.
3. **Applying an older Saved Setup keeps the live relationship.**
   `GeneratePanel.svelte` applies a setup with `updateConfig(setup.config)`,
   a merge. A setup saved before 2026-09-12 has no `handRelationship` key,
   so a user with Mirrored on who applies it stays Mirrored. Same shape as
   every earlier config field, but the relationship is a stronger constraint
   than a style axis. Decide whether setup application should fill missing
   keys from `GENERATE_DEFAULT_CONFIG`; if so, do it in one place and test it.
4. **Independent turns leave dash spin independent.** With Match turns off
   (the default), a Mirrored sequence can have both dashes spinning cw.
   That is Austen's call (2026-09-12: turns independent) and the toggle
   exists for the strict case, but confirm the hint copy makes it clear
   enough that a user who wants a true mirror finds the toggle.
5. **Start orientation is not linked.** At L3 a user can set left In and
   right Clock, then pick Mirrored; the paths mirror, the orientations do
   not. Decide whether that needs a hint, a lock, or nothing.
6. **ArrowDown closes the Customize drawer** while focus is inside it, on
   the old Inverted chip as much as on the new rows. Repro: open Customize,
   open Hand Relationship, focus any control, press ArrowDown. A separate
   session owns this (see In flight). If it is still open when you get here,
   coordinate before touching it.
7. **`npm run wt:finish` cannot delete a worktree that had
   `pnpm install --offline`.** It removes root `node_modules`, then
   `git worktree remove --force` fails on the per-package `node_modules`
   symlinks (`packages/*/node_modules/*` point into the worktree's
   `.pnpm` store). All three finishes this week merged correctly and stopped
   at the delete; I removed the directories by hand after checking every
   link target stayed inside the worktree. Worth a fix in
   `scripts/worktree-automerge.mjs` (unlink reparse points recursively before
   the remove). Not part of the feature.
8. **Row accessible names are long.** Each radio row's name is title plus
   quadrant plus description. Consider `aria-label` on the row with the
   title only and `aria-describedby` for the rest.
9. **`checkLoopViability` knows nothing about relationships.** Coercion
   happens upstream in `resolveLoopConfig`, so the pre-flight check never
   sees a bad combination. If anything bypasses `uiConfigToGenerationOptions`
   (decks, store previews, explorer all call `resolveLoopConfig` directly
   and do not pass a relationship), a Mirrored config could reach the engine
   quartered. Trace those callers.

## Decisions already made

Austen, 2026-09-12, on the first draft: mirror means across the body's
vertical axis; turns stay independent per hand; the inverted variant ships;
freeform is the target and LOOP combinations that cannot close are coerced,
never blocked; both grids matter; the row is called Hand Relationship (not
Hands, which is the hand-path continuity axis inside Style); the full picker
ships (Free, Mirrored, Flipped, Unison, Opposite plus Inverted).

Austen, 2026-09-12, after the first ship: "we should have the option to match
left-right turns versus allow them to be different, implement in full." Match
turns is a second toggle, off by default.

Austen, 2026-09-13: the four relationships map to the four timing and
direction quadrants (verified, see Done #7), and the drill screen had too much
empty space. The screen was rebuilt as descriptive rows carrying the quadrant
and element.

Copy rules that apply to anything you touch: no em dashes in user-visible
text, never the word "hybrid" in UI copy (it is load-bearing elsewhere in TKA),
the row label is never shortened to Hands.

## Gotchas

- **Never run `check`, `check:fast`, `build` or vitest in the primary
  checkout `C:/tka-platform`.** Every one starts with `svelte-kit sync`,
  which rewrites `.svelte-kit/types`; Austen's `:5173` server then 500s on
  `proxy+layout.server.ts` and the pm2 wrapper restart-loops. Work in a
  worktree.
- **A worktree needs its own dependencies.** The root `node_modules/@tka/*`
  links point at the primary checkout's packages, so a junctioned
  `node_modules` type-checks and tests the wrong engine. Do
  `pnpm install --offline --ignore-scripts --frozen-lockfile` (about a
  minute, hardlinked from the store) and
  `npx tsc --build packages/tsconfig.build.json` (`@tka/tka-types` has no
  `development` export condition and resolves to `dist/`). Copy
  `C:/tka-platform/.cert/` into the worktree if you want HTTPS from a
  task-owned Vite on a free port; never touch port 5173.
- **`check:fast` reports 582 pre-existing errors** (826 on some caches).
  Grep its output for the files you touched; the real gate is the full
  `svelte-check` inside `wt:finish`, which was clean.
- **`PictographData` motion strings are lowercase wire values** (`"n"`,
  `"pro"`, `"noRotation"`). The constraint lowercases everything it reads.
- **A dash's spin is decided twice.** `BeamSearch.enrichWithTurns` resolves
  it during search so continuity scoring sees it, and
  `SequenceBuilder.postProcess` resolves it again. Any spin rule has to live
  in both places or the shipped direction differs from the scored one. That
  is why `relatedRotationDirection` is applied in both.
- **`enrichMotionDirection` treats `"fl"` as no turns**, so a floating right
  hand gives the left nothing to derive from. Harmless under Match turns
  (both float) but keep it in mind if you change the float rules.
- **`ConstraintOptions.motionFamily.include: ["dash"]` does not exclude
  shifts.** `MotionTypeConstraint` compares against the literal `"shift"`,
  and dataset rows say `"pro"` or `"anti"`. I hit this writing tests; do not
  rely on it to build a dash-only sequence.
- **The Inverted census is 24 rows, not 16.** Inverted keeps the dash and
  static rows (nothing to invert), and the spec was corrected to say so.
- **Reading generated output in the browser:**
  `JSON.parse(localStorage.getItem("tka-generate-sequence-state-v1")).currentSequence.steps[i].motions.{left,right}`
  has `motionType`, `startLocation`, `endLocation`, `rotationDirection`,
  `turns`, and `prefloatMotionType` when a hand floated. The live config is
  `localStorage["tka-generate-config"]`.
- **`hand-relationship-tnd.test.ts` reads CSVs relative to `process.cwd()`.**
  Run vitest from the worktree root.
- The Flow Arts MCP server is registered for Claude at user scope
  (`claude mcp get flow-arts`). For Codex it is in `~/.codex/config.toml`
  as `flow-arts`. `get_domain_topic` with `elemental-model`,
  `symmetry-invariance` and `vtg-deep` is the fastest way to check any TKA
  claim in this doc.
