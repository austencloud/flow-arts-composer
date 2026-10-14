# CSS Debt Elimination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove 559 `!important` and ~71 hardcoded inline colors from a modern Svelte 5 codebase using CSS cascade layers + drawer-skin consolidation, and prevent regression with stylelint.

**Architecture:** Introduce `@layer` ordering in `src/app.css` so third-party + base styles sit below app/component styles — making `!important` unnecessary for the bulk. Consolidate the duplicated bits-ui drawer skin into the existing `Drawer.svelte`. Clean residual cascade-fight `!important` by specificity. Tokenize hardcoded colors. Gate with stylelint.

**Tech Stack:** Svelte 5, SvelteKit 2, CSS `@layer` (Baseline 2022), stylelint, bits-ui (headless drawer), 98.css (scoped retro).

**Verification note:** CSS has no unit-test surface. Per phase the gate is: `npm run check` green + `!important`/color grep count drop + runtime DevTools evidence for any layout-affecting change (drawers especially). `npm run check` is the heavy gate — run once per phase, not per file (`fast-iteration-loop.md`).

---

## Known facts (measured 2026-06-22)

- Global root: `src/app.css`, imported first at `src/routes/+layout.svelte:7`. Imports `./styles/panel-utilities.css`, `./lib/shared/transitions/keyframes.css`.
- `@layer` usage today: **0**.
- 98.css already scoped: `src/lib/features/retro/win95/styles/98-scoped.css` + `retro-overrides.css`, all under `.retro-shell`.
- bits-ui = headless, ships no CSS. Drawer `!important` are the app's own `:global(.…drawer-content[data-placement])` overrides.
- Shared drawer primitive: `src/lib/shared/foundation/ui/Drawer.svelte` (+ `DrawerHeader.svelte`).
- Drawer consumers (29, from grep): `GalleryTab`, `SequenceDrawer`, `CreatePanelDrawer`, `CustomizeDrawer`, `LOOPDrawer`, `PresetDrawer`, `CompositionViewerDrawer`, `InboxDrawer`, `TikaHistoryDrawer`, `FeedbackEditDrawer`, `SequenceBrowserDrawer`, `ModuleSwitcher`, `PropSelectionSheet`, `TrailSettingsSheet`, `AnimationSettingsSheet`, `SnapControls`, `LocationSharingConsentSheet`, `SaveToLibraryDialog`, `MyFeedbackDetail`, `FilterDesktopDrawers`, `LOOPSelectionPanel`, `StepEditorPanel`, `BrowserTab`, `StickerLab`, `ProfilePhotoPicker`, `SequenceViewerDrawerHost`, `q/[code]/+page`, plus `Drawer.svelte`/`DrawerHeader.svelte` themselves.
- `!important` top clusters: GalleryTab 39, SequenceDrawer 34, PictographTimelineLab 26, CellCanvas 21, ModuleSwitcher 18, CompositionAnimatedPreview 14, TikaModelSwitcher 13, CreatePanelDrawer 11, ModuleList 11.

---

## Phase 1 — Cascade-layer foundation (keystone, single-threaded)

**Files:**
- Modify: `src/app.css` (top of file)
- Modify: import sites of scoped third-party CSS (retro 98.css)

- [ ] **Step 1: Baseline the counts.**

Run: `rg -c "!important" --glob "src/**/*.svelte" | wc -l` and `rg "!important" --glob "src/**/*.svelte" | wc -l`
Record current totals (expect ~559 across ~172 files) in the commit message.

- [ ] **Step 2: Declare the layer order at the very top of `src/app.css`** (before all `@import` and rules — order is set by first appearance):

```css
/* Cascade layer order — earlier = lower priority.
   Unlayered styles always beat layered ones, so app component <style> blocks
   (unlayered) win over everything here without needing !important. */
@layer thirdparty, base, components, overrides;
```

- [ ] **Step 3: Move the two app-base imports into the `base` layer** so component styles outrank them:

```css
@import "./styles/panel-utilities.css" layer(base);
@import "./lib/shared/transitions/keyframes.css" layer(base);
```

- [ ] **Step 4: Layer the scoped 98.css under `thirdparty`.** In its import site (find via `rg "98-scoped.css" src`), change to `@import "...98-scoped.css" layer(thirdparty);`. Leave `retro-overrides.css` unlayered or in `components` (it is the app's intentional retro identity override).

- [ ] **Step 5: Verify no visual regression from layering.**

Run: `npm run check > /tmp/check.log 2>&1; rg -c "error" /tmp/check.log` — expect 0 new errors.
Runtime: load app + retro shell + a page with a drawer; confirm unchanged (DevTools when browser granted). This phase changes precedence only; expect zero visual diff.

- [ ] **Step 6: Commit.**

```bash
git add src/app.css <retro-import-site>
git commit -m "feat(css): introduce @layer cascade ordering (thirdparty/base/components/overrides)" -- src/app.css <retro-import-site>
```

---

## Phase 2 — Drawer-skin consolidation

**Root cause:** `Drawer.svelte` defines base `:global(.drawer-content)` styles; each consumer re-declares the same placement skin with `!important` to win. With Phase 1, base lives in `layer(base)`; the consolidated skin in `Drawer.svelte` is unlayered → wins without `!important`.

**Files:**
- Modify: `src/lib/shared/foundation/ui/Drawer.svelte` (own the skin)
- Modify: the 27 consumers (delete duplicated `:global()` skin blocks)

- [ ] **Step 1: Read `Drawer.svelte` fully.** Map its props (placement, class passthrough) and its existing `:global(.drawer-content)` base rules. Identify the varying knobs across consumer skins: `max-height` (80/85/90/100vh), border-radius (0 desktop / 16px sheet), backdrop blur on/off, `with-nav-offset` bottom inset.

- [ ] **Step 2: Add placement-variant skin to `Drawer.svelte`** parameterized by props (CSS custom props for the variable knobs):

```css
/* in Drawer.svelte <style> — unlayered, beats layer(base), no !important */
:global(.drawer-content[data-placement="right"]) {
  top: 0;
  height: 100dvh;
  background: var(--drawer-bg, var(--theme-panel-bg));
  border: none;
  border-left: 1px solid var(--theme-stroke);
  border-radius: 0;
  box-shadow: -4px 0 24px var(--theme-shadow);
  transition:
    transform 350ms cubic-bezier(0.32, 0.72, 0, 1),
    opacity 350ms cubic-bezier(0.32, 0.72, 0, 1);
}
:global(.drawer-content[data-placement="bottom"]) {
  max-height: var(--drawer-max-height, 85dvh);
  border-top-left-radius: var(--drawer-sheet-radius, 16px);
  border-top-right-radius: var(--drawer-sheet-radius, 16px);
  background: var(--drawer-bg, var(--theme-panel-bg));
}
:global(.drawer-content.with-nav-offset[data-placement="bottom"]) {
  bottom: var(--primary-nav-height, 64px);
  max-height: calc(100dvh - var(--primary-nav-height, 64px));
}
```

Add `--drawer-bg` / `--drawer-max-height` / backdrop-blur as optional props on `Drawer.svelte` so the few consumers that differ (blur-backdrop sequence panel, taller invite sheet) set a prop instead of an `!important` block.

- [ ] **Step 3: Delete the duplicated skin from ONE consumer first** (`GalleryTab.svelte`, the worst at 39). Remove its `:global(.…drawer-content[data-placement])` blocks; pass any divergent knob via prop.

- [ ] **Step 4: Runtime-verify that one drawer** (browser granted): open/close, drag-dismiss animation, desktop right-panel resting layout, mobile bottom-sheet height. Must match pre-change. If the drag transform breaks, the `transition` line was beating an inline style → restore just that property with a `/* beats bits-ui inline transform */` comment.

- [ ] **Step 5: Once the pattern is proven on GalleryTab, propagate to remaining 26 consumers.** Parallel subagents, ~6-7 files each. Each subagent: delete duplicated skin blocks, pass divergent knobs via the new props, commit ONLY its files with explicit pathspec. Subagent prompt must cite `commit-only-your-own-changes.md`.

- [ ] **Step 6: Verify.**

Run: `npm run check > /tmp/check.log 2>&1; rg -c "error" /tmp/check.log` → 0.
Run: `rg "!important" --glob "src/**/*.svelte" | wc -l` → expect drop of ~250-350.
Runtime: drive each drawer family once (DevTools).

---

## Phase 3 — Residual `!important` cleanup (parallel)

**Files:** the ~140 remaining `!important` across non-drawer components. Largest: `PictographTimelineLab.svelte` 26, `CellCanvas.svelte` 21, `ModuleSwitcher.svelte` 18, `CompositionAnimatedPreview.svelte` 14, `TikaModelSwitcher.svelte` 13, `ModuleList.svelte` 11.

- [ ] **Step 1: Re-grep the current `!important` set** after Phase 2: `rg -n "!important" --glob "src/**/*.svelte" > /tmp/important.txt`. Partition into batches by feature area.

- [ ] **Step 2: For each batch, dispatch a subagent** with this rubric:
  - Remove `!important` where the rule already wins or can win by raising specificity (add a parent selector, use `:where()` carefully, or nest).
  - **Keep** `!important` only when it beats a genuine inline style (JS-set) or a `.retro-shell`/3rd-party rule — and add a `/* beats <source> */` reason comment.
  - Do NOT change visual output. If unsure a removal is safe, leave it + comment why.
  - Commit only own files with explicit pathspec.
  - Model: omit `model` param (inherit Opus 4.8) or `sonnet` for mechanical batches. NEVER opus 4.7 (`never-opus-47.md`).

- [ ] **Step 3: Verify per batch.** `npm run check` green; spot visual check on the heaviest-touched components (timeline lab, cell canvas, module switcher).

- [ ] **Step 4: Final count.** `rg "!important" --glob "src/**/*.svelte" | wc -l` → target < 80, every survivor carrying a reason comment.

---

## Phase 4 — Tokenize hardcoded inline colors (parallel)

**Files:** 36 files, 71 `style="…rgba()/#hex…"`. Sample (`SchedulerStatsGrid.svelte`): `rgba(74,222,128,0.2)`→success tint, `#4ade80`→success, `#94a3b8`→slate/neutral. File already partially uses `var(--semantic-warning)`.

- [ ] **Step 1: List all hits.** `rg -n 'style="[^"]*(rgba?\(|#[0-9a-fA-F]{3,6})' --glob "src/**/*.svelte" > /tmp/colors.txt`.

- [ ] **Step 2: Map each color to a semantic token.** Check existing tokens first (`rg "--semantic-" src/app.css src/styles`). Greens→`--semantic-success`, ambers→`--semantic-warning`, reds→`--semantic-error`, slates→neutral scale. If a needed token is missing, add it to the token layer (do not inline).

- [ ] **Step 3: Replace.** Static color → `var(--token)`. Keep dynamic per-instance values as `style="--x: {value}"` injection (correct pattern — do not touch). Parallel subagents by file batch, scoped-pathspec commits.

- [ ] **Step 4: Verify.** `npm run check` green. `rg 'style="[^"]*(rgba?\(|#[0-9a-fA-F]{3,6})' --glob "src/**/*.svelte" | wc -l` → 0 (excluding any documented dynamic exception).

---

## Phase 5 — Regression guard (stylelint)

**Files:**
- Create: `stylelint.config.js`
- Modify: `package.json` (devDep + `lint` script)

- [ ] **Step 1: Install stylelint + svelte support.**

Run: `pnpm add -D stylelint stylelint-config-standard postcss-html`
Expected: added to devDependencies.

- [ ] **Step 2: Create `stylelint.config.js`:**

```js
export default {
  extends: ["stylelint-config-standard"],
  customSyntax: "postcss-html",
  rules: {
    "declaration-no-important": true,
    // raw hex/rgb in declarations — push toward tokens
    "color-no-hex": true,
    "function-disallowed-list": ["rgb", "rgba"],
  },
  overrides: [
    { files: ["src/lib/features/retro/**"], rules: { "declaration-no-important": null } },
  ],
};
```

- [ ] **Step 3: Add an allowlist convention** for the legit `!important` survivors: stylelint-disable line comment with the reason, e.g. `/* stylelint-disable-next-line declaration-no-important -- beats bits-ui inline transform */`. Apply to the Phase 2/3 survivors.

- [ ] **Step 4: Wire into lint.** In `package.json`, change `"lint"` to also run stylelint:

```json
"lint": "prettier --check . && eslint . && stylelint \"src/**/*.svelte\" \"src/**/*.css\"",
```

- [ ] **Step 5: Run it.**

Run: `pnpm stylelint "src/**/*.{svelte,css}" > /tmp/sl.log 2>&1; tail -20 /tmp/sl.log`
Expected: only the documented allowlisted survivors remain; everything else clean.

- [ ] **Step 6: Commit.**

```bash
git add stylelint.config.js package.json pnpm-lock.yaml
git commit -m "feat(css): stylelint guard — ban new !important and raw hex/rgb colors" -- stylelint.config.js package.json pnpm-lock.yaml
```

---

## Self-review

- **Spec coverage:** Phase 1↔layers, Phase 2↔drawer consolidation, Phase 3↔residual !important, Phase 4↔color tokens, Phase 5↔stylelint guard. All spec success criteria mapped.
- **Risk:** drawer inline-transform handled in P2 step 4 (per-property restore + comment). Layer-precedence isolated in P1 before any removal.
- **Counts:** baseline → verify drop per phase; final targets `!important` < 80 (all commented), inline hardcoded color = 0.
- **Commit hygiene:** every multi-file/subagent commit uses explicit pathspec (`commit-only-your-own-changes.md`).
