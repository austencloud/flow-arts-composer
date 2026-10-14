# LOOP Selector Thin Vertical Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Generate-tab LOOP type selector as a thin, full-height right-side panel (matching the Customize drawer) with a vertical list of LOOP types and a compact "Quick Combos" preset chip row.

**Architecture:** Configure the existing `Drawer` primitive exactly like `CustomizeDrawer` (content fills height, thin width, spanning backdrop). Add a `layout: "grid" | "list"` prop to `LOOPExpandedOverlay` + `LOOPComponentGrid` (default `"grid"` keeps other consumers unchanged); the drawer passes `"list"`. Reuse `LOOPComponentButton`'s existing description layout for rows, `SegmentedControl` for the mode toggle, and `LOOP_PRESETS` + `loop-favorites-manager` for the new chip strip. Delete four orphaned files.

**Tech Stack:** Svelte 5 (runes), vitest, existing shared primitives (`Drawer`, `SegmentedControl`, `FontAwesomeIcon`).

**Reference spec:** `docs/superpowers/specs/2026-07-08-loop-selector-vertical-panel-design.md`

**Global rules in force:** commit each task with an explicit pathspec (`git commit -- <files>`); never `git add -A`/`.`; work on `main` (no worktree). Do NOT run full `npm run check` between micro-steps — one full pass at the end (Task 6).

---

## File Structure

- `src/lib/features/create/generate/shared/services/loop-quick-combos.ts` — **new**, pure ordering helper for the strip.
- `src/lib/features/create/generate/shared/services/__tests__/loop-quick-combos.test.ts` — **new**, unit test.
- `src/lib/features/create/generate/components/modals/LOOPQuickCombosStrip.svelte` — **new**, preset chip row.
- `src/lib/features/create/generate/components/modals/LOOPComponentGrid.svelte` — **modify**, add `layout` prop.
- `src/lib/features/create/generate/components/cards/LOOPExpandedOverlay.svelte` — **modify**, `layout` prop + SegmentedControl + strip.
- `src/lib/features/create/generate/components/modals/LOOPDrawer.svelte` — **modify**, drawer config + `layout="list"`.
- Delete: `LOOPSelectionPanel.svelte`, `LOOPPresetsSection.svelte`, `LOOPModeSelector.svelte`, `LOOPPresetCard.svelte`.

---

## Task 1: Quick Combos ordering helper (pure logic, TDD)

**Files:**
- Create: `src/lib/features/create/generate/shared/services/loop-quick-combos.ts`
- Test: `src/lib/features/create/generate/shared/services/__tests__/loop-quick-combos.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/features/create/generate/shared/services/__tests__/loop-quick-combos.test.ts
import { describe, it, expect } from "vitest";
import { orderQuickCombos } from "../loop-quick-combos";
import type { LOOPPreset } from "../../domain/constants/loop-presets";

const preset = (id: string, featured = false): LOOPPreset => ({
  id,
  name: id,
  description: "",
  useCase: "",
  components: [],
  difficulty: 1,
  icon: "rotate",
  featured,
});

describe("orderQuickCombos", () => {
  it("returns only featured presets when there are no favorites", () => {
    const presets = [preset("a", true), preset("b", false), preset("c", true)];
    expect(orderQuickCombos(presets, []).map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("sorts starred presets first, preserving featured order after", () => {
    const presets = [preset("a", true), preset("b", true), preset("c", true)];
    expect(orderQuickCombos(presets, ["b"]).map((p) => p.id)).toEqual(["b", "a", "c"]);
  });

  it("includes a starred preset even when it is not featured", () => {
    const presets = [preset("a", true), preset("b", false)];
    expect(orderQuickCombos(presets, ["b"]).map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("does not duplicate a preset that is both starred and featured", () => {
    const presets = [preset("a", true), preset("b", true)];
    expect(orderQuickCombos(presets, ["a"]).map((p) => p.id)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/features/create/generate/shared/services/__tests__/loop-quick-combos.test.ts`
Expected: FAIL — `Failed to resolve import "../loop-quick-combos"` / `orderQuickCombos is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/features/create/generate/shared/services/loop-quick-combos.ts
/**
 * Ordering for the LOOP "Quick Combos" strip: pinned (starred) presets first,
 * then featured presets, de-duplicated. A starred non-featured preset is
 * surfaced; a starred featured preset appears once, in the starred position.
 */
import type { LOOPPreset } from "../domain/constants/loop-presets";

export function orderQuickCombos(
  presets: readonly LOOPPreset[],
  favoriteIds: readonly string[]
): LOOPPreset[] {
  const starred = presets.filter((p) => favoriteIds.includes(p.id));
  const featured = presets.filter((p) => p.featured);

  const seen = new Set<string>();
  const result: LOOPPreset[] = [];
  for (const p of [...starred, ...featured]) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      result.push(p);
    }
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/features/create/generate/shared/services/__tests__/loop-quick-combos.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/create/generate/shared/services/loop-quick-combos.ts src/lib/features/create/generate/shared/services/__tests__/loop-quick-combos.test.ts
git commit -m "feat(generate): LOOP quick-combos ordering helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DN4L2V4umyCnFUUUDuT7Vq" -- src/lib/features/create/generate/shared/services/loop-quick-combos.ts src/lib/features/create/generate/shared/services/__tests__/loop-quick-combos.test.ts
```

---

## Task 2: LOOPQuickCombosStrip component

**Files:**
- Create: `src/lib/features/create/generate/components/modals/LOOPQuickCombosStrip.svelte`

- [ ] **Step 1: Write the component**

```svelte
<!--
LOOPQuickCombosStrip.svelte - Compact preset chip row for the LOOP selector.
Tap a chip to apply the preset's LOOP combo; star to pin it (localStorage).
Renders the FontAwesome icon via FontAwesomeIcon (NOT raw {preset.icon} text,
which was the LOOPPresetCard bug this component supersedes).
-->
<script lang="ts">
  import { onMount } from "svelte";
  import FontAwesomeIcon from "$lib/shared/foundation/ui/FontAwesomeIcon.svelte";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { LOOP_PRESETS } from "../../shared/domain/constants/loop-presets";
  import type { LOOPPreset } from "../../shared/domain/constants/loop-presets";
  import { loopFavoritesManager } from "../../shared/services/loop-favorites-manager";
  import { orderQuickCombos } from "../../shared/services/loop-quick-combos";

  let { onApply } = $props<{ onApply: (preset: LOOPPreset) => void }>();

  let hapticService: HapticFeedback | null = null;
  let favorites = $state<string[]>([]);

  onMount(() => {
    hapticService = getHapticFeedback();
    favorites = loopFavoritesManager.getFavorites();
  });

  const combos = $derived(orderQuickCombos(LOOP_PRESETS, favorites));

  function handleApply(preset: LOOPPreset) {
    hapticService?.trigger("selection");
    onApply(preset);
  }

  function handleStar(event: MouseEvent, presetId: string) {
    event.stopPropagation();
    hapticService?.trigger("selection");
    loopFavoritesManager.toggleFavorite(presetId);
    favorites = loopFavoritesManager.getFavorites();
  }
</script>

<div class="quick-combos">
  <span class="quick-combos-label">Quick Combos</span>
  <div class="quick-combos-row">
    {#each combos as preset (preset.id)}
      <div class="combo-chip-wrap">
        <button
          class="combo-chip"
          onclick={() => handleApply(preset)}
          aria-label={`Apply ${preset.name}`}
        >
          <FontAwesomeIcon icon={preset.icon} size="0.9em" />
          <span class="combo-name">{preset.name}</span>
        </button>
        <button
          class="combo-star"
          class:active={favorites.includes(preset.id)}
          onclick={(e) => handleStar(e, preset.id)}
          aria-pressed={favorites.includes(preset.id)}
          aria-label={favorites.includes(preset.id)
            ? `Unpin ${preset.name}`
            : `Pin ${preset.name}`}
        >
          <svg
            viewBox="0 0 24 24"
            fill={favorites.includes(preset.id) ? "currentColor" : "none"}
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
            />
          </svg>
        </button>
      </div>
    {/each}
  </div>
</div>

<style>
  .quick-combos {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
  }

  .quick-combos-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .quick-combos-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .combo-chip-wrap {
    display: inline-flex;
    align-items: stretch;
    border-radius: 999px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }

  .combo-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 4px 6px 12px;
    background: transparent;
    border: none;
    border-radius: 999px 0 0 999px;
    color: var(--theme-text, white);
    font-family: inherit;
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    transition: background var(--duration-fast, 120ms) ease;
    min-height: var(--min-touch-target, 44px);
  }

  .combo-chip:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.09));
  }

  .combo-name {
    white-space: nowrap;
  }

  .combo-star {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 10px 0 4px;
    background: transparent;
    border: none;
    border-radius: 0 999px 999px 0;
    color: rgba(255, 255, 255, 0.4);
    cursor: pointer;
    transition: color var(--duration-fast, 120ms) ease;
  }

  .combo-star:hover,
  .combo-star.active {
    color: var(--semantic-warning, #f59e0b);
  }

  .combo-star svg {
    width: 15px;
    height: 15px;
  }

  @media (prefers-reduced-motion: reduce) {
    .combo-chip,
    .combo-star {
      transition: none;
    }
  }
</style>
```

- [ ] **Step 2: Type-check just this file's imports resolve**

Run: `npx svelte-check --threshold error --tsconfig ./tsconfig.json 2>&1 | grep -i "LOOPQuickCombosStrip"`
Expected: no output (no errors referencing the new file). (Full check deferred to Task 6.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/features/create/generate/components/modals/LOOPQuickCombosStrip.svelte
git commit -m "feat(generate): LOOP quick-combos chip strip

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DN4L2V4umyCnFUUUDuT7Vq" -- src/lib/features/create/generate/components/modals/LOOPQuickCombosStrip.svelte
```

---

## Task 3: LOOPComponentGrid list layout

**Files:**
- Modify: `src/lib/features/create/generate/components/modals/LOOPComponentGrid.svelte`

- [ ] **Step 1: Add the `layout` prop and single-column mode**

Replace the entire `<script>` + markup + `<style>` grid rule. Full file after edit:

```svelte
<!--
LOOPComponentGrid.svelte - Layout for LOOP component selection buttons
- layout="grid" (default): compact 3x2 grid (icon + label), unchanged behavior.
- layout="list": single vertical column with descriptions (used by the drawer).
-->
<script lang="ts">
  import {
    LOOP_COMPONENTS,
    LOOPComponent,
  } from "$lib/features/create/generate/shared/domain/constants/loop-components";
  import LOOPComponentButton from "./LOOPComponentButton.svelte";

  let {
    selectedComponents,
    isMultiSelectMode = false,
    layout = "grid",
    onToggleComponent,
  } = $props<{
    selectedComponents: Set<LOOPComponent>;
    isMultiSelectMode?: boolean;
    layout?: "grid" | "list";
    onToggleComponent: (component: LOOPComponent) => void;
  }>();

  // List layout shows descriptions per row; grid stays compact (icon + label).
  const showDescriptions = $derived(layout === "list");
</script>

<div
  class="loop-component-grid"
  class:list={layout === "list"}
  class:with-descriptions={showDescriptions}
>
  {#each LOOP_COMPONENTS as componentInfo}
    <LOOPComponentButton
      {componentInfo}
      {isMultiSelectMode}
      isSelected={selectedComponents.has(componentInfo.component)}
      showDescription={showDescriptions}
      onClick={() => onToggleComponent(componentInfo.component)}
    />
  {/each}
</div>

<style>
  .loop-component-grid {
    display: grid;
    width: 100%;
    margin: 0 auto;
    gap: 8px;
    flex-shrink: 0;
    /* 3 columns x 2 rows - fits all 6 items on small mobile screens */
    grid-template-columns: repeat(3, 1fr);
    grid-auto-rows: minmax(64px, auto);
  }

  /* List layout: single vertical column, rows size to their content */
  .loop-component-grid.list {
    grid-template-columns: 1fr;
    grid-auto-rows: auto;
  }
</style>
```

- [ ] **Step 2: Verify existing grid consumers are untouched at runtime**

The two non-drawer consumers (`LoopBentoBoard.svelte:319`, `routes/test/unified-generation/+page.svelte:314`) render `LOOPExpandedOverlay` without a `layout` prop, so `LOOPComponentGrid` still receives `layout="grid"`. No behavior change expected. Confirm visually in Task 6.

- [ ] **Step 3: Commit**

```bash
git add src/lib/features/create/generate/components/modals/LOOPComponentGrid.svelte
git commit -m "feat(generate): LOOPComponentGrid single-column list layout

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DN4L2V4umyCnFUUUDuT7Vq" -- src/lib/features/create/generate/components/modals/LOOPComponentGrid.svelte
```

---

## Task 4: LOOPExpandedOverlay — layout prop, SegmentedControl, strip

**Files:**
- Modify: `src/lib/features/create/generate/components/cards/LOOPExpandedOverlay.svelte`

- [ ] **Step 1: Update the `<script>` — imports, `layout` prop, preset apply**

Change the imports block: remove `LOOPModeSelector`, add `SegmentedControl`, `LOOPQuickCombosStrip`, and the `LOOPPreset` type.

Replace:
```svelte
  import LOOPComponentGrid from "../modals/LOOPComponentGrid.svelte";
  import LOOPModeSelector from "../modals/LOOPModeSelector.svelte";
```
with:
```svelte
  import LOOPComponentGrid from "../modals/LOOPComponentGrid.svelte";
  import LOOPQuickCombosStrip from "../modals/LOOPQuickCombosStrip.svelte";
  import SegmentedControl from "$lib/shared/3d/components/controls/SegmentedControl.svelte";
  import type { LOOPPreset } from "../../shared/domain/constants/loop-presets";
```

Replace the `$props` destructure:
```svelte
  let {
    currentType,
    selectedComponents,
    onChange,
    onClose,
    onLoopDisable,
  } = $props<{
    currentType: LOOPType;
    selectedComponents: Set<LOOPComponent>;
    onChange: (loopType: LOOPType) => void;
    onClose: () => void;
    onLoopDisable?: () => void;
  }>();
```
with (adds `layout`):
```svelte
  let {
    currentType,
    selectedComponents,
    onChange,
    onClose,
    onLoopDisable,
    layout = "grid",
  } = $props<{
    currentType: LOOPType;
    selectedComponents: Set<LOOPComponent>;
    onChange: (loopType: LOOPType) => void;
    onClose: () => void;
    onLoopDisable?: () => void;
    layout?: "grid" | "list";
  }>();
```

Add a preset-apply handler next to `applyAndClose` (which already imports `generateLOOPType`):
```svelte
  function applyPreset(preset: LOOPPreset) {
    hapticService?.trigger("selection");
    const newLoopType = generateLOOPType(new Set(preset.components));
    onChange(newLoopType);
    onClose();
  }
```

- [ ] **Step 2: Update the markup — SegmentedControl + strip**

Replace the mode-selector block:
```svelte
  <!-- Mode selector -->
  <LOOPModeSelector
    {isMultiSelectMode}
    onModeChange={handleModeChange}
  />
```
with:
```svelte
  <!-- Mode selector (shared SegmentedControl per chip-primitives rule) -->
  <SegmentedControl
    options={[
      { value: "single", label: "Single" },
      { value: "combo", label: "Combo" },
    ]}
    value={isMultiSelectMode ? "combo" : "single"}
    onchange={(v) => handleModeChange(v === "combo")}
    size="sm"
    color="accent"
  />

  {#if layout === "list"}
    <LOOPQuickCombosStrip onApply={applyPreset} />
  {/if}
```

Pass `layout` into the grid. Replace:
```svelte
    <LOOPComponentGrid
      selectedComponents={localSelectedComponents}
      {isMultiSelectMode}
      onToggleComponent={handleToggle}
    />
```
with:
```svelte
    <LOOPComponentGrid
      selectedComponents={localSelectedComponents}
      {isMultiSelectMode}
      {layout}
      onToggleComponent={handleToggle}
    />
```

- [ ] **Step 3: Type-check the touched file**

Run: `npx svelte-check --threshold error --tsconfig ./tsconfig.json 2>&1 | grep -iE "LOOPExpandedOverlay|LOOPQuickCombosStrip|SegmentedControl"`
Expected: no output. If `handleModeChange` is flagged unused-import for `LOOPModeSelector`, confirm the old import line was removed.

- [ ] **Step 4: Commit**

```bash
git add src/lib/features/create/generate/components/cards/LOOPExpandedOverlay.svelte
git commit -m "feat(generate): LOOP overlay list layout, SegmentedControl toggle, combos strip

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DN4L2V4umyCnFUUUDuT7Vq" -- src/lib/features/create/generate/components/cards/LOOPExpandedOverlay.svelte
```

---

## Task 5: LOOPDrawer — fill height, thin width, spanning backdrop, list layout

**Files:**
- Modify: `src/lib/features/create/generate/components/modals/LOOPDrawer.svelte`

- [ ] **Step 1: Pass `layout="list"` and the backdrop class**

In the `<Drawer>` markup, add `backdropClass="loop-backdrop"`, and pass `layout="list"` to the overlay.

Replace:
```svelte
  <Drawer
    isOpen={isOpen}
    placement="right"
    respectLayoutMode={true}
    closeOnBackdrop={true}
    ariaLabel="Select LOOP Type"
    class="loop-drawer-sheet"
    onclose={onClose}
  >
    <div class="loop-drawer-content">
      {#if selectedComponents && onChange && currentType}
        <LOOPExpandedOverlay
          {currentType}
          {selectedComponents}
          {onChange}
          {onClose}
          {onLoopDisable}
        />
      {/if}
    </div>
  </Drawer>
```
with:
```svelte
  <Drawer
    isOpen={isOpen}
    placement="right"
    respectLayoutMode={true}
    closeOnBackdrop={true}
    ariaLabel="Select LOOP Type"
    class="loop-drawer-sheet"
    backdropClass="loop-backdrop"
    onclose={onClose}
  >
    <div class="loop-drawer-content">
      {#if selectedComponents && onChange && currentType}
        <LOOPExpandedOverlay
          {currentType}
          {selectedComponents}
          {onChange}
          {onClose}
          {onLoopDisable}
          layout="list"
        />
      {/if}
    </div>
  </Drawer>
```

- [ ] **Step 2: Update the `<style>` — fill height, thin width, spanning backdrop**

Add the backdrop-span + thin-width + fill-height rules, and change the grid override from natural height to fill. Apply these edits inside `<style>`:

(a) After the existing `:global(.drawer-content.loop-drawer-sheet[data-placement="right"])` block, add:
```css
  /* Outside-click-to-close: span backdrop from sidebar edge to the right so a
     workspace click dismisses (mirrors customize-backdrop). */
  :global(.drawer-overlay.loop-backdrop.side-by-side-layout) {
    left: var(--desktop-sidebar-width, 0);
    right: 0;
    top: var(--create-panel-top, 0);
    bottom: 0;
  }

  /* Thin right column (single-column list needs ~400px, not half the viewport) */
  :global(
    .drawer-content.loop-drawer-sheet.side-by-side-layout[data-placement="right"]
  ) {
    width: min(var(--create-panel-width, 400px), 400px);
    max-width: 100%;
  }
```

(b) Change `.loop-drawer-content` to fill the dialog height. Replace:
```css
  .loop-drawer-content {
    display: flex;
    flex-direction: column;
    padding-bottom: calc(var(--nav-min-height, 64px) + env(safe-area-inset-bottom, 0px));
    background: linear-gradient(
```
with:
```css
  .loop-drawer-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding-bottom: calc(var(--nav-min-height, 64px) + env(safe-area-inset-bottom, 0px));
    background: linear-gradient(
```

(c) Make the overlay fill the content. Replace:
```css
  /* Override LOOPExpandedOverlay's absolute positioning when inside drawer */
  .loop-drawer-content > :global(.loop-expanded-overlay) {
    position: static;
    border-radius: 0;
    border: none;
    box-shadow: none;
    background: transparent;
  }
```
with:
```css
  /* Override LOOPExpandedOverlay's absolute positioning when inside drawer;
     fill the full drawer height like CustomizeDrawer does. */
  .loop-drawer-content > :global(.loop-expanded-overlay) {
    position: static;
    flex: 1;
    min-height: 0;
    border-radius: 0;
    border: none;
    box-shadow: none;
    background: transparent;
  }
```

(d) Let the grid fill + scroll instead of hugging. Replace:
```css
  /* Grid takes natural height inside drawer (flex: 1 1 0% collapses
     to 0px in an auto-height flex parent) */
  .loop-drawer-content :global(.grid-container) {
    flex: 0 0 auto;
  }
```
with:
```css
  /* Grid fills remaining height and scrolls (overlay now fills the drawer) */
  .loop-drawer-content :global(.grid-container) {
    flex: 1 1 auto;
    min-height: 0;
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/features/create/generate/components/modals/LOOPDrawer.svelte
git commit -m "fix(generate): LOOP drawer fills height, thin column, spanning backdrop

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DN4L2V4umyCnFUUUDuT7Vq" -- src/lib/features/create/generate/components/modals/LOOPDrawer.svelte
```

---

## Task 6: Delete orphaned files + full verification

**Files:**
- Delete: `LOOPSelectionPanel.svelte`, `LOOPPresetsSection.svelte`, `LOOPModeSelector.svelte`, `LOOPPresetCard.svelte` (all under `components/modals/`).

- [ ] **Step 1: Confirm no live importers remain**

Run:
```bash
grep -rn "LOOPSelectionPanel\|LOOPPresetsSection\|LOOPModeSelector\|LOOPPresetCard" src --include=*.svelte --include=*.ts
```
Expected: matches ONLY inside the four files about to be deleted (self-references / mutual imports). If any OTHER file references them, STOP — do not delete; investigate that consumer first.

- [ ] **Step 2: Delete the four orphaned files**

```bash
git rm src/lib/features/create/generate/components/modals/LOOPSelectionPanel.svelte \
       src/lib/features/create/generate/components/modals/LOOPPresetsSection.svelte \
       src/lib/features/create/generate/components/modals/LOOPModeSelector.svelte \
       src/lib/features/create/generate/components/modals/LOOPPresetCard.svelte
```

- [ ] **Step 3: Full type-check (single cold pass)**

Run: `npm run check > /tmp/loop-check.log 2>&1; grep -niE "error" /tmp/loop-check.log | head -50`
Expected: no errors introduced by this work. If errors reference the deleted files, a consumer was missed in Step 1 — restore and fix. Re-grep the log (do NOT re-run check to re-filter).

- [ ] **Step 4: Run the unit test again (regression)**

Run: `npx vitest run src/lib/features/create/generate/shared/services/__tests__/loop-quick-combos.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 5: Diff hygiene grep**

Run:
```bash
git diff --cached --stat
grep -rn "type=\"checkbox\"\|class=\"chip\"\|class=\"pill\"" src/lib/features/create/generate/components/modals/LOOPQuickCombosStrip.svelte
```
Expected: strip diff shows the intended files; the second grep prints nothing (no banned checkbox / raw filter-chip patterns).

- [ ] **Step 6: Commit the deletions**

```bash
git commit -m "chore(generate): remove orphaned LOOP selection panel + presets UI

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DN4L2V4umyCnFUUUDuT7Vq" -- src/lib/features/create/generate/components/modals/LOOPSelectionPanel.svelte src/lib/features/create/generate/components/modals/LOOPPresetsSection.svelte src/lib/features/create/generate/components/modals/LOOPModeSelector.svelte src/lib/features/create/generate/components/modals/LOOPPresetCard.svelte
```

- [ ] **Step 7: Runtime verification (user or dev server on :5174)**

Serve if needed: `vite --port 5174` (never touch :5173). Open Generate, tap the LOOP card. Verify against the spec's plan:
1. Panel fills the full-height thin right column — **no settings cards bleeding through below**, no floating detached handle.
2. Six LOOP rows show icon + label + description in a single column.
3. "Single" tap on a row applies + closes; "Combo" multi-selects with check badges + Apply button pinned at bottom.
4. Quick Combos chips appear under the toggle; tapping one applies that preset; the star pins it (persists across reload).
5. `LoopBentoBoard` (deck releaser LOOP cell) still renders the compact 3×2 grid — unchanged.

Capture a screenshot or get the user's confirmation per verification-protocol before claiming done.

---

## Self-Review

**Spec coverage:**
- Drawer fill/backdrop/width (spec §A) → Task 5. ✅
- Vertical list layout (spec §B) → Tasks 3 + 4. ✅
- Quick Combos strip / favorites (spec §C) → Tasks 1 + 2 + 4. ✅
- SegmentedControl mode toggle (spec §D) → Task 4. ✅
- Delete four orphaned files → Task 6. ✅
- Deferred (arbitrary-combo save) — correctly NOT implemented. ✅

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✅

**Type consistency:** `orderQuickCombos(presets, favoriteIds)` signature identical in Task 1 (def), Task 2 (call), Task 1 test. `applyPreset(preset: LOOPPreset)` in Task 4 matches `onApply` prop type in Task 2. `layout?: "grid" | "list"` identical across Tasks 3, 4, 5. `SegmentedControl` value union `"single" | "combo"` consistent with its `onchange`/`value` usage. `loopFavoritesManager.getFavorites()` / `.toggleFavorite()` match the manager's exports. ✅
