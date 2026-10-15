# Placement glyph pulse port — 2026-10-14

## Evidence and scope

Observation: worktree branch `codex/swarm-option-raf` started at `503fbf5d32` with an empty `git status --short`. Read `git show codex/option-raf-wip`; its sole commit is `36a6f53cd5054ebd656a12f7599078a6eb9ba968`. Read the placement-pulse analysis in `docs/reports/swarm-2026-10-14/wip-relevance.md`. No merge, cherry-pick, checkout, primary-checkout access, server, install, push, or full check was used.

Observation: `git log main --since=2026-09-07 -- src/lib/shared/pictograph/shared/components/PlacementGlyph.svelte` returned four commits. Their component diffs were read:

- `48050b501058ccc26cc7db3545eac53711156399`: rename position to placement; retains the callback/timer pulse.
- `453be00df63d3e56dca95acea546b36a769cd9d6`: translations and formatting; pulse triggers unchanged.
- `a97b743f05609148905e69f5ae7500c153ba7692`: SvelteKit import migration to `#lib`.
- `7d1dfff78592f23c79fa218a172e2ad32192484b`: shared CSS motion duration/easing replace raw 400 ms/ease-out.

Observation: inspecting `vendor/austencloud-motion-0.2.1.tgz` in memory established that `--duration-dramatic` and `DURATION.dramatic` both equal 350 ms, and `--ease-standard-out` and `EASE_STANDARD_OUT` both equal `cubic-bezier(0, 0, 0.2, 1)`. The old `PULSE_MS = 400` controlled only timer removal after the shared-clock migration; it was no longer the visible animation duration. The port retains today's visible timing rather than restoring WIP timing.

## Changes

Observation: `PlacementGlyph.svelte` retains its props, click callback, accessibility attributes, rendering/visibility logic, translations, placement/key comparison and initial-render suppression. On a qualifying change it calls a colocated pulse helper with the bound inner SVG group and the canonical `reducedMotion()` result. Previous-value tracking still advances even when motion is skipped; there was no other non-motion state change in the replaced path.

Observation: `placement-pulse.ts` owns one animation per component instance. Each play cancels the previous handle before a single `animate()` call with scale 1 → 0.91 → 1, `DURATION.dramatic`, and `EASE_STANDARD_OUT`. Reduced motion, missing targets and absent Web Animations support start no animation. Component effect teardown calls `destroy()`, which cancels and clears the current handle. The inner group's `transform-box: fill-box` and `transform-origin: center` remain, preserving the outer centering translate. The frame callback, timer, reactive animation flag, CSS animation and pulse media rule were removed.

Inference: a completely pure helper cannot own cancellation across plays and teardown. The small instance factory makes that lifecycle directly testable without a global singleton that would cause glyphs to cancel each other. It follows the existing per-element lifecycle pattern in `src/lib/shared/transitions/motion.ts` (`createDestinationFade` / `createIntrinsicHeightMotion`). Capability searches used `pulse` and `motion` in `docs/architecture/canonical-capabilities.md`; decision: extend PlacementGlyph's existing pulse owner and reuse package motion tokens/preference detection.

## Callers checked

Observation: `rg -l '<PlacementGlyph' src` returned 12 direct callers. Their invocation blocks were inspected; none supplies `pulseKey`, so current callers use placement-pair changes. The public key-change behavior remains available and unchanged (including null versus undefined handling).

- `src/lib/shared/pictograph/shared/components/PictographRenderer.svelte:1053`: passes pictograph placements/letter, validity, visibility, preview/visibility animation, toggle callback and expanded horizontal center.
- `src/lib/shared/animation-engine/components/layers/GlyphOverlay.svelte:371`: passes current playback step placements/letter and overlay center, under its existing visibility/start-placement guard. It stays mounted between valid steps.
- Under `src/routes/(public)/guide/level-1/_pages/`: `AlphaBetaWordsPage.svelte:446`, `BaseLettersPage.svelte:323`, `CompoundLettersPage.svelte:378`, `GammaLettersPage.svelte:514`, `GammaPage.svelte:431`, `GammaWordsPage.svelte:410`, `Type1AlphaBetaPage.svelte:390`, `Type2ShiftLettersPage.svelte:444`, `Type3CrossShiftLettersPage.svelte:367`, `Type456LettersPage.svelte:274`. These supply row-label placement pairs; no new initial pulse was introduced.

## Verification

Observation: `rg --files tests/unit` filtered for placement-glyph/PlacementGlyph names found no pre-existing matching test. A whole-tree filename search after creation found only `tests/unit/placement-glyph-pulse.test.ts`.

Observation: the new fake-element tests cover cancel-before-retrigger ordering, the current animation being cancelled on repeated destroy, reduced motion on first play and retrigger, independent glyph instances, and target disappearance. They assert the animation keyframes and shared timing tokens.

Observation: final focused test command (exit 0):

```text
npx vitest run --config tests/config/vitest.config.ts tests/unit/placement-glyph-pulse.test.ts
Test Files  1 passed (1)
     Tests  5 passed (5)
  Duration  5.72s (transform 2.98s, setup 417ms, import 3.42s, tests 10ms, environment 1.36s)
```

Observation: lint command (exit 0):

```text
npx eslint src/lib/shared/pictograph/shared/components/PlacementGlyph.svelte src/lib/shared/pictograph/shared/components/placement-pulse.ts tests/unit/placement-glyph-pulse.test.ts
PlacementGlyph.svelte: warning File ignored because of a matching ignore pattern.
placement-glyph-pulse.test.ts: warning File ignored because of a matching ignore pattern.
2 problems (0 errors, 2 warnings)
```

Observation: `eslint.config.js` globally ignores Svelte files and `tests/`; the helper was checked. An exit-zero lint command is not lint evidence for the ignored component/test. No lint configuration was changed. The initial formatting check reported the two new TypeScript files; `npx prettier --write` formatted only those files. Formatting the ledger also succeeded.

Observation: formatting command (exit 0):

```text
npx prettier --check src/lib/shared/pictograph/shared/components/PlacementGlyph.svelte src/lib/shared/pictograph/shared/components/placement-pulse.ts tests/unit/placement-glyph-pulse.test.ts docs/reports/swarm-2026-10-14/option-raf.md
Checking formatting...
All matched files use Prettier code style!
```

Observation: `git diff --check` exited 0 with no output. No full build, full type check, broad test suite, browser inspection or performance measurement was run. Two exploratory PowerShell reads failed (Bash-style brace/glob syntax and a nonexistent tokens path); corrected reads inspected the actual files and vendored package without extracting files.

## LOOK CHECK

Proposal: on the sequence viewer's 2D animation screen, enable the Placement glyph overlay and load a sequence with at least three non-static-letter steps whose start/end placement pairs differ between consecutive steps. With normal motion, advance twice within 350 ms (or play fast enough) while watching the α/β/γ → α/β/γ label at the top. Each changed pair should restart the centered shrink/return immediately; a repeated identical pair should not pulse. Revisit with reduced motion enabled: the letters still update with each step and remain stationary. Leave the viewer mid-pulse to exercise teardown. The guide's static labels are not a useful retrigger screen.

Observation: no browser look check or live preview was performed. The swarm brief forbids a dev server and access to other worktrees, including the primary server checkout. The fake-element tests establish lifecycle behavior; visual centering and runtime interaction remain for coordinator verification after integration. No measured performance improvement is claimed.
