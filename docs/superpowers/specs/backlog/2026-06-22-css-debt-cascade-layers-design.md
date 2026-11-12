---
status: backlog
value: 3
effort: L
remaining: 'Next slice: Phase 2 remnant in the Create LOOP picker (LOOPDrawer.svelte, 25 forced declarations re-pinning drawer geometry below 768px) onto the --sheet-* API with specificity; then the two popover shells (TabOverflowSelector, TikaModelSwitcher) whose forced declarations only fight the UA popover sheet. Phase 1 third-party layering is moot (98.css is scoped under .retro-shell, 4 reduced-motion survivors); fix the stale app.css comment with the next app.css touch. Phase 4: 18 static inline colors remain.'
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-11-01'
work_state: in-progress
---

# CSS Debt Elimination — Cascade Layers + Drawer Consolidation

**Evidence (2026-11-01, Train practice sheets slice):** Phase 2 remnant: `ModePickerSheet.svelte` and `GridSettingsSheet.svelte` each re-skinned the drawer with 7 `!important` declarations (backdrop color, bottom-sheet height cap, side-drawer width). Replaced with the Drawer.css API already in place (`--sheet-backdrop-bg`, `--sheet-max-height`, `--sheet-width`) and a three-selector rule for the side-drawer width cap; the side drawer's height/max-height now come from the base right-placement rule (100dvh) instead of a forced 100%, which resolves to the same pixels. The drawer package only writes inline `height` for height snap points and inline `transform` during drag, neither of which these sheets use, so no survivor was needed. Verified with a temporary, uncommitted harness route that mounted both real sheets open: 375x667 (bottom placement) and 1440x900 (right placement) screenshots before/after are pixel-identical (0 differing pixels in all four), and computed geometry (x, y, width, height, max-height, backdrop color) is unchanged. Landing, Create, Browse and Settings at both viewports were captured as a regression control: Browse 0.000%, Create 0.004%, Settings 0.040%, Landing 0.287% (the rotating demo card); a same-code control pass taken under test-runner load differed by up to 2.3% on those routes, so that band is capture noise. The boot screen must be gone before a shot is taken; a 6 s fixed wait captured the splash instead. `npm run lint:css` warnings for the two files went from 14 to 0 (repo-wide 560 to 546; the 7 errors are pre-existing postcss-html parser false positives named in `stylelint.config.js`). Recount after this slice: 475 `!important` tokens in `src/**/*.svelte` (577 including `.css`), 18 static inline colors in `style=""` attributes (53 more are dynamic `--x:` injection, not debt). Phase 1 note: `src/app.css` claims 98.css is imported into `layer(thirdparty)`; it is not. It is scoped under `.retro-shell` by `scripts/scope-98css.cjs` and the retro feature has 4 reduced-motion `!important` survivors, so layering it would only let the global `button { font: inherit }` reset beat the retro font. Treat that Phase 1 step as superseded.

**Triage evidence (2026-10-07):** `src/app.css` now declares `@layer thirdparty, base, components, overrides`, contradicting the original zero-layer baseline. The remaining override and Drawer-consolidation scope still needs source and visual review.

**Date:** 2026-06-22
**Status:** In progress; cascade layer foundation landed, Drawer skin API in place, per-consumer drawer overrides being retired one family at a time.
**Goal:** Remove the antiquated CSS layer (559 `!important`, ~71 hardcoded inline colors) sitting inside an otherwise-modern Svelte 5 runes codebase, and prevent regression. Modern shell, 2019 override habits inside — close the gap.

## Problem (grounded, measured 2026-06-22)

The JS/architecture is state-of-the-art (Svelte 5 runes, zero Svelte-4 legacy). The CSS layer did not keep up.

Measured signals (`src/**/*.svelte`):

| Signal | Count | Files | Verdict |
|---|---|---|---|
| `!important` | 559 | 172 | **Real debt** — the beast |
| `style="--x: …"` (CSS-var injection) | 305 | 220 | **Correct pattern, NOT debt** — leave |
| `style="…rgba()/#hex…"` (hardcoded color) | 71 | 36 | Real debt — tokenize |
| `@layer` (cascade layers) | **0** | 0 | The missing 2026 tool |

### Root-cause breakdown of the 559 `!important`

| Cluster | Est. count | Cause |
|---|---|---|
| Drawer-skin overrides | ~250–350 | One bits-ui drawer-skin block (`:global(.…drawer-content[data-placement])`) copy-pasted across ~27 drawer consumers, each forced with `!important` to win the cascade. Example: `GalleryTab.svelte` repeats the identical skin 4× (39 `!important`); `SequenceDrawer.svelte` 34; `CreatePanelDrawer.svelte` 11. |
| Own-component cascade fights | ~150 | Component overriding its own/nested selectors at equal specificity; `!important` used instead of raising specificity. |
| Third-party overrides (98.css retro, embla, threlte, animation-timeline-js) | ~60 | Legit library overrides — removal not the goal; layering is. |

**Key insight:** This is not 559 independent hacks. The largest cluster is *one duplicated drawer skin*. A shared `Drawer.svelte` already exists at `src/lib/shared/foundation/ui/Drawer.svelte` but consumers re-skin it instead of the skin living there once — a `never-hand-roll` violation expressed in CSS.

## Approach (chosen: full architectural fix)

Cascade layers as the engine, Drawer consolidation as the structural fix, stylelint as the guardrail, token migration for the color debt.

`@layer` is the correct 2026 answer to specificity wars: register third-party + base styles in lower layers so app/component styles win **without `!important`**. Shipped in all browsers since 2022 — zero compat risk.

### The one genuine risk (must verify at runtime)

`@layer` does **not** beat inline styles. bits-ui/vaul animates the drawer via inline `transform` during open/drag. Therefore:

- `transform` / `transition` `!important` on drawer selectors **may be load-bearing** (beating the library's inline transform) → verify before removing.
- `background` / `border` / `border-radius` / `box-shadow` / `height` / `top` are class-based → safely layer-removable.

Verification path (user granted browser later): after Phase 2, drive each drawer family via Chrome DevTools MCP, confirm open/close/drag animation and final resting layout are unchanged before claiming done. Per `verification-protocol.md`, no "should work" without evidence.

## Phased design

### Phase 1 — Cascade-layer foundation (keystone)

- Define a single global layer order in the root stylesheet (locate the global `app.css`/`:global` root; introduce `@layer reset, thirdparty, base, components, overrides;` ordering).
- Wrap third-party CSS (bits-ui, 98.css, embla, threlte-postprocessing UI, animation-timeline-js) under `@layer thirdparty` at import sites.
- No behavior change expected; this only re-orders precedence so later phases can drop `!important`.
- **Verify:** full `npm run check` + visual smoke on a layered page (drawer + retro + timeline) before proceeding.

### Phase 2 — Drawer-skin consolidation

- Move the duplicated `:global(.…drawer-content[data-placement])` skin into `Drawer.svelte` as placement variants (`right` desktop side-panel, `bottom` mobile sheet), parameterized by the few values that vary (max-height, radius, backdrop blur on/off, nav-offset).
- Delete the per-consumer duplicated skin blocks across the ~27 consumers (enumerated from the drawer-class grep: `GalleryTab`, `SequenceDrawer`, `CreatePanelDrawer`, `CustomizeDrawer`, `LOOPDrawer`, `PresetDrawer`, `CompositionViewerDrawer`, `InboxDrawer`, `TikaHistoryDrawer`, `FeedbackEditDrawer`, `SequenceBrowserDrawer`, `ModuleSwitcher`, sheets, etc.).
- With Phase 1 layers in place, the skin no longer needs `!important` for class-based props. Retain `!important` **only** on properties verified to beat the library's inline styles.
- **Verify:** runtime drive of every drawer family (DevTools) — open/close/drag/resting layout unchanged.

### Phase 3 — Residual `!important` cleanup

- Remaining own-component cascade-fight `!important` (~150): per-file, raise selector specificity or restructure rather than `!important`.
- Parallel subagents, one batch of files each (172 files total → not one context). Each subagent commits **only its own files** with an explicit pathspec (`git commit -- <files>`) per `commit-only-your-own-changes.md`.
- Third-party-override `!important` that genuinely beats inline styles stays — documented inline with a one-line reason comment.
- **Verify:** `npm run check` green per batch; spot visual check on touched components.

### Phase 4 — Tokenize hardcoded inline colors

- 71 `style="…rgba()/#hex…"` across 36 files → map to existing semantic tokens (`--semantic-warning`, `--semantic-success`, slate/neutral scale). Some files already half-migrated (e.g. `SchedulerStatsGrid.svelte` line 44 uses `var(--semantic-warning)`; 32/56 don't).
- Where a token is missing, add it to the token layer rather than inlining.
- Distinguish: dynamic per-instance values stay as `style="--x: {value}"` injection (correct); only static hardcoded colors get tokenized.

### Phase 5 — Regression guard (stylelint)

- Add stylelint with rules: `declaration-no-important` (error, with an allowlist mechanism for the documented inline-style-beating cases), and a rule banning raw hex/rgba inside `style=` attributes / scoped blocks where a token exists.
- Wire into `npm run lint` and the check gate so new `!important`/hardcoded color fails CI.
- Document the allowlist convention (the only legit `!important` survivors: verified inline-style overrides, each with a reason comment).

## Success criteria

- `!important` count drops from 559 to a documented residual (target < 80, all justified inline-comment survivors beating inline styles or 3rd-party).
- Drawer skin defined once in `Drawer.svelte`; zero duplicated `:global()` drawer skins in consumers.
- `@layer` ordering established; third-party CSS layered below app CSS.
- Hardcoded inline colors → 0 (excluding dynamic `--x` injection).
- Stylelint gate active in `npm run lint`; new violations fail.
- Every phase verified: `npm run check` green + runtime/visual evidence for layout-affecting changes. No regression in drawer animation, retro theme, or timeline.

## Out of scope

- `style="--x: {value}"` dynamic CSS-var injection (305 uses) — this is the endorsed pattern, untouched.
- God-file splitting (`web-gl-fire-renderer.ts`, `DeckReleaserTab.svelte`, `ChoreoCard.svelte`) — separate concern, not CSS debt.
- Visual redesign — this is debt removal with zero intended visual change.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Removing a load-bearing `!important` breaks drawer animation | Per-property verify; keep `!important` on inline-style-beating props; runtime DevTools check before done |
| Layer reorder changes precedence unexpectedly on a 3rd-party widget | Phase 1 isolated + smoke-tested before any removal |
| 172-file blast radius, multi-agent index collisions | Scoped pathspec commits per subagent; phased, not big-bang |
| Stylelint false-positives on legit cases | Allowlist + reason-comment convention |
