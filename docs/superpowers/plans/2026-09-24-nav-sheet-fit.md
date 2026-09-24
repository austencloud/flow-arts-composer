# Navigation Sheet Fits Its Contents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The module navigation sheet sizes to its contents, caps at 720px wide, and lays tiles out in balanced rows for any module count.

**Architecture:** A pure function (`module-grid-layout.ts`) picks columns and centers a short last row on half-column grid tracks. `ModuleList` measures its width and applies that layout with one fixed tile size. `ModuleSwitcher` drops its fixed sheet height, switches its `Crossfade` from `fill` to `animateHeight`, and moves scrolling to the list region. `Drawer.css` gains two opt-in custom properties so the sheet can be content-sized and width-capped.

**Tech Stack:** SvelteKit, Svelte 5 runes, TypeScript, Vitest (jsdom config).

**Spec:** `docs/superpowers/specs/active/2026-09-24-nav-sheet-fit-design.md`

**Worktree:** `E:/worktrees/tka-platform/nav-sheet-fit`, branch `codex/nav-sheet-fit`. All commands run from the worktree root. `node_modules` is a junction into the primary checkout: never run `npm install`/`pnpm install`. Never touch port 5173. Commit only the paths each task names, with explicit pathspecs.

---

## File Map

| File                                                                | Responsibility                                            |
| ------------------------------------------------------------------- | --------------------------------------------------------- |
| Create `src/lib/shared/navigation/domain/module-grid-layout.ts`     | Column count and last-row centering for the module grid   |
| Create `tests/unit/navigation/module-grid-layout.test.ts`           | Balanced-row guarantees for counts 1–16 at real widths    |
| Modify `src/lib/shared/foundation/ui/drawer/Drawer.css`             | `--sheet-max-width`, `--sheet-min-height`, centered sheet |
| Replace `src/lib/shared/navigation/components/ModuleList.svelte`    | Tile grid driven by the layout function, one tile size    |
| Modify `src/lib/shared/navigation/components/ModuleSwitcher.svelte` | Content-sized sheet, animated drill-in height, footer     |
| Create `src/routes/test/module-switcher/+page.svelte`               | Dev harness: real sheet with 3, 5, 7, or 13 modules       |

---

### Task 1: Grid layout function

**Files:**

- Create: `src/lib/shared/navigation/domain/module-grid-layout.ts`
- Test: `tests/unit/navigation/module-grid-layout.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/navigation/module-grid-layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  getModuleGridLayout,
  getModuleGridMaxColumns,
  MODULE_GRID_MAX_COLUMNS,
} from "$lib/shared/navigation/domain/module-grid-layout";

// Content widths the sheet gives the grid once gutters and the reserved
// scrollbar gutter are removed: a 375px phone, the 280px landscape side
// drawer, and the 720px sheet cap.
const PHONE = 327;
const SIDE_DRAWER = 232;
const SHEET = 664;

function rowLengths(count: number, width: number): number[] {
  const { columns, rows } = getModuleGridLayout(count, width);
  return Array.from({ length: rows }, (_, row) =>
    Math.min(columns, count - row * columns)
  );
}

describe("getModuleGridLayout", () => {
  it.each([
    [3, SHEET, [3]],
    [5, SHEET, [5]],
    [7, SHEET, [4, 3]],
    [13, SHEET, [5, 5, 3]],
    [3, PHONE, [3]],
    [5, PHONE, [3, 2]],
    [7, PHONE, [3, 3, 1]],
    [13, PHONE, [3, 3, 3, 3, 1]],
    [13, SIDE_DRAWER, [2, 2, 2, 2, 2, 2, 1]],
  ])("lays out %i tiles at %ipx as %j", (count, width, expected) => {
    expect(rowLengths(count, width)).toEqual(expected);
  });

  it("uses the fewest rows and never leaves a short row above the last", () => {
    for (const width of [PHONE, SIDE_DRAWER, SHEET, 2000]) {
      const max = getModuleGridMaxColumns(width);
      for (let count = 1; count <= 16; count++) {
        const layout = getModuleGridLayout(count, width);
        const rows = rowLengths(count, width);
        expect(layout.columns).toBeLessThanOrEqual(max);
        expect(rows).toHaveLength(Math.ceil(count / max));
        expect(rows.slice(0, -1).every((n) => n === layout.columns)).toBe(true);
        expect(rows.at(-1)).toBeGreaterThan(0);
      }
    }
  });

  it("indents a short last row by the half-columns it leaves empty", () => {
    expect(getModuleGridLayout(13, SHEET)).toMatchObject({
      lastRowStart: 10,
      lastRowIndent: 2,
    });
    expect(getModuleGridLayout(7, SHEET)).toMatchObject({
      lastRowStart: 4,
      lastRowIndent: 1,
    });
    expect(getModuleGridLayout(10, SHEET)).toMatchObject({
      lastRowStart: 5,
      lastRowIndent: 0,
    });
  });

  it("caps wide sheets at the maximum column count", () => {
    expect(getModuleGridMaxColumns(3840)).toBe(MODULE_GRID_MAX_COLUMNS);
  });

  it("falls back to one column before the grid has been measured", () => {
    expect(getModuleGridLayout(5, 0).columns).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/navigation/module-grid-layout.test.ts`
Expected: FAIL, cannot resolve `module-grid-layout`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/shared/navigation/domain/module-grid-layout.ts`:

```ts
/**
 * Module Grid Layout
 *
 * Column count and last-row placement for the module navigation grid. The
 * tile count depends on who is signed in (3 for a guest, 13 or more for an
 * admin), so a fixed column count leaves orphan rows: 13 tiles at 4 columns
 * land as 4+4+4+1. This takes the fewest rows the width allows, then the
 * fewest columns that still hold every tile in those rows, so only the last
 * row can be short. The grid runs on half-column tracks (each tile spans
 * two), which lets a short last row sit exactly centered.
 */

/** Narrowest tile the grid lays out; decides how many columns fit. */
export const MODULE_TILE_MIN_WIDTH = 96;

/** Row and column gap between tiles, in CSS pixels. */
export const MODULE_GRID_GAP = 10;

/** Widest row the navigation sheet shows, even when more would fit. */
export const MODULE_GRID_MAX_COLUMNS = 5;

export interface ModuleGridLayout {
  /** Tiles in each full row. */
  columns: number;
  rows: number;
  /** Index of the first tile in the last row. */
  lastRowStart: number;
  /** Half-column tracks left empty before the last row; 0 when it is full. */
  lastRowIndent: number;
}

export function getModuleGridMaxColumns(width: number): number {
  const fit = Math.floor(
    (width + MODULE_GRID_GAP) / (MODULE_TILE_MIN_WIDTH + MODULE_GRID_GAP)
  );
  return Math.min(MODULE_GRID_MAX_COLUMNS, Math.max(1, fit));
}

export function getModuleGridLayout(
  count: number,
  width: number
): ModuleGridLayout {
  if (count <= 0) {
    return { columns: 1, rows: 0, lastRowStart: 0, lastRowIndent: 0 };
  }
  const rows = Math.ceil(count / getModuleGridMaxColumns(width));
  const columns = Math.ceil(count / rows);
  const lastRowStart = (rows - 1) * columns;
  return {
    columns,
    rows,
    lastRowStart,
    lastRowIndent: columns - (count - lastRowStart),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/navigation/module-grid-layout.test.ts`
Expected: PASS, 13 tests (9 table rows + 4 cases).

- [ ] **Step 5: Commit**

```bash
git add -- src/lib/shared/navigation/domain/module-grid-layout.ts tests/unit/navigation/module-grid-layout.test.ts
git commit -m "feat(navigation): balanced column layout for the module grid" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/shared/navigation/domain/module-grid-layout.ts tests/unit/navigation/module-grid-layout.test.ts
```

---

### Task 2: Drawer opt-in width cap and minimum height

**Files:**

- Modify: `src/lib/shared/foundation/ui/drawer/Drawer.css` (the `.drawer-content[data-placement="bottom"]:not(.side-by-side-layout)` block, about line 194)

- [ ] **Step 1: Edit the bottom placement block**

Replace this part of the block:

```css
width: 100%;
max-width: 100%;
/* Consumers can cap sheet height via --sheet-max-height (replaces
     per-consumer `max-height: …vh !important` skins). */
max-height: var(--sheet-max-height, 100vh);
max-height: var(--sheet-max-height, 100dvh); /* Modern: iPhone browser chrome */
/* Prevent bottom sheets from appearing as tiny slivers on mobile.
     Components can override with their own height/max-height if they
     intentionally want a shorter sheet (e.g. animation settings). */
min-height: 50vh;
min-height: 50dvh;

margin: 0;
```

with:

```css
width: 100%;
/* Consumers can cap sheet width via --sheet-max-width. Both edges are
     pinned and the side margins are auto, so a capped sheet centers. */
max-width: var(--sheet-max-width, 100%);
/* Consumers can cap sheet height via --sheet-max-height (replaces
     per-consumer `max-height: …vh !important` skins). */
max-height: var(--sheet-max-height, 100vh);
max-height: var(--sheet-max-height, 100dvh); /* Modern: iPhone browser chrome */
/* Prevent bottom sheets from appearing as tiny slivers on mobile.
     A sheet that sizes to its own content sets --sheet-min-height. */
min-height: var(--sheet-min-height, 50vh);
min-height: var(--sheet-min-height, 50dvh);

margin: 0 auto;
```

Defaults equal the old values, so every other bottom sheet renders as before.

- [ ] **Step 2: Lint the file**

Run: `npx stylelint src/lib/shared/foundation/ui/drawer/Drawer.css && npx prettier --check src/lib/shared/foundation/ui/drawer/Drawer.css`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -- src/lib/shared/foundation/ui/drawer/Drawer.css
git commit -m "feat(drawer): opt-in max width and min height for bottom sheets" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/shared/foundation/ui/drawer/Drawer.css
```

---

### Task 3: ModuleList on the balanced grid

**Files:**

- Replace: `src/lib/shared/navigation/components/ModuleList.svelte`

- [ ] **Step 1: Replace the file with this content**

```svelte
<!--
  ModuleList - Module grid for the navigation sheet

  One tile size on every screen. getModuleGridLayout() picks the column count:
  the fewest rows the width allows, where only the last row may be short. The
  grid runs on half-column tracks (each tile spans two), so a short last row
  sits centered instead of hanging off the left edge.

  Keeps module-colored tiles, the active glow, the staggered entrance,
  link-out entries, and the drag-vs-tap guard for swipes that start on a tile.
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { ModuleDefinition, ModuleId } from "../domain/types";
  import type { HapticFeedback } from "../../application/services/haptic-feedback";
  import { onMount } from "svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import { getReactiveLocale } from "$lib/shared/i18n/locale-state.svelte";
  import {
    getModuleGridLayout,
    MODULE_GRID_GAP,
    type ModuleGridLayout,
  } from "../domain/module-grid-layout";

  // Reactive locale for re-rendering translations
  const locale = $derived(getReactiveLocale());

  let {
    currentModule,
    modules = [],
    onModuleSelect,
  } = $props<{
    currentModule: ModuleId;
    modules: ModuleDefinition[];
    onModuleSelect?: (moduleId: ModuleId) => void;
  }>();

  let hapticService: HapticFeedback;

  // Track drag state to prevent clicks during swipe gestures
  let dragState = $state<{
    isDragging: boolean;
    startY: number;
    startTime: number;
  }>({
    isDragging: false,
    startY: 0,
    startTime: 0,
  });

  onMount(() => {
    hapticService = getHapticFeedback();
  });

  // Static order from module-definitions.ts. Settings lives in the account
  // footer, not the module grid.
  const mainModules = $derived(
    modules.filter((m: ModuleDefinition) => m.isMain)
  );
  const devModules = $derived(
    modules.filter((m: ModuleDefinition) => !m.isMain && m.id !== "settings")
  );

  // Each grid measures its own width; the layout follows width and count.
  let mainGridWidth = $state(0);
  let devGridWidth = $state(0);
  const mainLayout = $derived(
    getModuleGridLayout(mainModules.length, mainGridWidth)
  );
  const devLayout = $derived(
    getModuleGridLayout(devModules.length, devGridWidth)
  );

  /** Start track for the first tile of a short last row, which centers it. */
  function columnStart(
    layout: ModuleGridLayout,
    index: number
  ): string | undefined {
    return index === layout.lastRowStart && layout.lastRowIndent > 0
      ? String(layout.lastRowIndent + 1)
      : undefined;
  }

  /**
   * Extract primary color from module icon HTML
   * Parses gradient/color values from icon SVG or inline styles
   * Falls back to purple if no color found
   */
  function extractModuleColor(iconHtml: string): string {
    // Try to find gradient color in SVG or inline styles
    const gradientMatch = iconHtml.match(/stop-color[:\s=]\s*["']?([#\w]+)/);
    if (gradientMatch?.[1]) return gradientMatch[1];

    // Match inline style color (e.g., style="color: var(--semantic-warning);")
    const colorMatch = iconHtml.match(/color[:\s=]\s*["']?([#\w]+)/);
    if (colorMatch?.[1]) return colorMatch[1];

    // Default fallback color
    return "#667eea";
  }

  function handlePointerDown(event: PointerEvent | MouseEvent) {
    dragState.isDragging = false;
    dragState.startY = event.clientY;
    dragState.startTime = Date.now();
  }

  function handlePointerMove(event: PointerEvent | MouseEvent) {
    const deltaY = Math.abs(event.clientY - dragState.startY);
    // If moved more than 10px vertically, consider it a drag
    if (deltaY > 10) {
      dragState.isDragging = true;
    }
  }

  function handleModuleClick(
    moduleId: ModuleId,
    event: PointerEvent | MouseEvent,
    isDisabled: boolean = false
  ) {
    // Don't trigger click for disabled modules
    if (isDisabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // If user was dragging, don't trigger the click
    if (dragState.isDragging) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // If the pointer was down for more than 300ms and moved, likely a drag
    const duration = Date.now() - dragState.startTime;
    const deltaY = Math.abs(event.clientY - dragState.startY);
    if (duration > 300 && deltaY > 5) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    hapticService?.trigger("selection");
    onModuleSelect?.(moduleId);
  }

  /**
   * Get badge count for a module
   * Currently unused - notifications are shown in inbox drawer
   */
  function getModuleBadgeCount(_moduleId: ModuleId): number {
    return 0;
  }

  /**
   * Format badge count for display
   */
  function formatBadgeCount(count: number): string {
    if (count > 99) return "99+";
    return count.toString();
  }
</script>

<!-- Main Modules Section -->
<section class="module-section">
  <h3 class="section-title">Modules</h3>
  {#key locale}
    <div
      class="module-grid"
      bind:clientWidth={mainGridWidth}
      style:--module-grid-tracks={mainLayout.columns * 2}
      style:--module-grid-gap="{MODULE_GRID_GAP}px"
    >
      {#each mainModules as module, index}
        {@const moduleColor = module.color || extractModuleColor(module.icon)}
        {@const isActive = currentModule === module.id}
        {@const isDisabled = module.disabled ?? false}
        {@const badgeCount = getModuleBadgeCount(module.id)}

        {#if module.linkHref}
          <!-- Link-out entry (e.g. Shop): plain navigation, never activates the
               module renderer. Same cell markup/classes as a module button so it
               looks and sizes identically. -->
          <a
            class="module-cell"
            href={module.linkHref}
            style="--module-color: {moduleColor}; --stagger-index: {index};"
            style:grid-column-start={columnStart(mainLayout, index)}
          >
            <div class="cell-background"></div>
            <div class="cell-glow"></div>

            <div class="cell-content">
              <span class="cell-icon">{@html module.icon}</span>
              <span class="cell-label">{t(module.labelKey)}</span>
            </div>
          </a>
        {:else}
          <button
            class="module-cell"
            class:active={isActive}
            class:disabled={isDisabled}
            class:has-badge={badgeCount > 0}
            onpointerdown={handlePointerDown}
            onpointermove={handlePointerMove}
            onclick={(e) => handleModuleClick(module.id, e, isDisabled)}
            style="--module-color: {moduleColor}; --stagger-index: {index};"
            style:grid-column-start={columnStart(mainLayout, index)}
            aria-disabled={isDisabled}
            disabled={isDisabled}
          >
            <div class="cell-background"></div>
            <div class="cell-glow"></div>

            <div class="cell-content">
              <span class="cell-icon">{@html module.icon}</span>
              <span class="cell-label">{t(module.labelKey)}</span>

              {#if badgeCount > 0}
                <span class="unread-badge" aria-label="{badgeCount} unread">
                  {formatBadgeCount(badgeCount)}
                </span>
              {/if}

              {#if isDisabled && module.disabledMessage}
                <div class="cell-badge">{module.disabledMessage}</div>
              {/if}
            </div>
          </button>
        {/if}
      {/each}
    </div>
  {/key}
</section>

<!-- Developer/Admin Modules Section -->
{#if devModules.length > 0}
  <section class="module-section dev-section">
    <h3 class="section-title">Developer</h3>
    {#key locale}
      <div
        class="module-grid"
        bind:clientWidth={devGridWidth}
        style:--module-grid-tracks={devLayout.columns * 2}
        style:--module-grid-gap="{MODULE_GRID_GAP}px"
      >
        {#each devModules as module, index}
          {@const moduleColor = module.color || extractModuleColor(module.icon)}
          {@const isActive = currentModule === module.id}
          {@const isDisabled = module.disabled ?? false}

          <button
            class="module-cell"
            class:active={isActive}
            class:disabled={isDisabled}
            onpointerdown={handlePointerDown}
            onpointermove={handlePointerMove}
            onclick={(e) => handleModuleClick(module.id, e, isDisabled)}
            style="--module-color: {moduleColor};"
            style:grid-column-start={columnStart(devLayout, index)}
            aria-disabled={isDisabled}
            disabled={isDisabled}
          >
            <div class="cell-background"></div>
            <div class="cell-glow"></div>

            <div class="cell-content">
              <span class="cell-icon">{@html module.icon}</span>
              <span class="cell-label">{t(module.labelKey)}</span>

              {#if isDisabled && module.disabledMessage}
                <div class="cell-badge">{module.disabledMessage}</div>
              {/if}
            </div>
          </button>
        {/each}
      </div>
    {/key}
  </section>
{/if}

<style>
  .module-section {
    display: flex;
    flex-direction: column;
    margin-bottom: 16px;
  }

  .module-section:last-child {
    margin-bottom: 0;
  }

  .dev-section {
    padding-top: 16px;
    border-top: 1px solid var(--theme-stroke);
  }

  .section-title {
    margin: 0 0 10px 4px;
    font-size: var(--font-size-compact);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    color: var(--theme-text-dim);
  }

  /* Half-column tracks: every tile spans two, so a short last row can start
     on an odd track and sit centered. ModuleList writes the track count and
     the gap from module-grid-layout.ts. */
  .module-grid {
    display: grid;
    grid-template-columns: repeat(var(--module-grid-tracks, 4), minmax(0, 1fr));
    gap: var(--module-grid-gap, 10px);
  }

  .module-grid > .module-cell {
    grid-column: auto / span 2;
  }

  /* One logical tile size everywhere. A translated label that wraps may
     make its row taller; nothing scales with the viewport. */
  .module-cell {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 84px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 14px;
    text-decoration: none; /* anchors (linkHref entries) shouldn't underline */
    color: var(--theme-text);
    cursor: pointer;
    text-align: center;
    overflow: hidden;
    isolation: isolate;

    /* Staggered entrance animation */
    opacity: 0;
    transform: translateY(20px) scale(0.95);
    animation: cellEntrance 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    animation-delay: calc(var(--stagger-index, 0) * 50ms + 100ms);

    transition:
      transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
      box-shadow 0.2s ease;
  }

  @keyframes cellEntrance {
    from {
      opacity: 0;
      transform: translateY(20px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .cell-background {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--module-color) 18%, rgba(255, 255, 255, 0.06)) 0%,
      color-mix(in srgb, var(--module-color) 8%, rgba(255, 255, 255, 0.02)) 100%
    );
    border: 1px solid
      color-mix(in srgb, var(--module-color) 25%, var(--theme-stroke));
    border-radius: 16px;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 0;
  }

  .cell-glow {
    position: absolute;
    inset: 0;
    background: radial-gradient(
      circle at 50% 25%,
      var(--module-color, #667eea) 0%,
      transparent 60%
    );
    opacity: 0.1;
    transition: opacity var(--duration-emphasis) cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 1;
    mix-blend-mode: screen;
  }

  .cell-content {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 12px 8px;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    z-index: 2;
  }

  .module-cell:hover .cell-background {
    background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--module-color) 20%, var(--theme-card-bg)) 0%,
      color-mix(in srgb, var(--module-color) 10%, rgba(255, 255, 255, 0.03))
        100%
    );
    border-color: color-mix(
      in srgb,
      var(--module-color) 35%,
      rgba(255, 255, 255, 0.12)
    );
    box-shadow: 0 6px 20px
      color-mix(in srgb, var(--module-color) 18%, transparent);
  }

  .module-cell:hover .cell-glow {
    opacity: 0.12;
  }

  .module-cell:hover {
    transform: scale(1.02);
  }

  /* Current module: brighter border, soft glow, gentle pulse */
  .module-cell.active {
    transform: scale(1.05);
    z-index: 2;
  }

  .module-cell.active .cell-background {
    background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--module-color) 25%, rgba(255, 255, 255, 0.08)) 0%,
      color-mix(in srgb, var(--module-color) 15%, rgba(255, 255, 255, 0.03))
        100%
    );
    border-color: color-mix(
      in srgb,
      var(--module-color) 50%,
      rgba(255, 255, 255, 0.2)
    );
    border-width: 2px;
    box-shadow:
      0 0 20px color-mix(in srgb, var(--module-color) 25%, transparent),
      0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .module-cell.active .cell-glow {
    opacity: 0.18;
    animation: activeGlowPulse 3s ease-in-out infinite;
  }

  @keyframes activeGlowPulse {
    0%,
    100% {
      opacity: 0.15;
    }
    50% {
      opacity: 0.22;
    }
  }

  .module-cell.active .cell-icon {
    transform: scale(1.1);
  }

  .module-cell.active .cell-label {
    font-weight: 700;
  }

  .cell-icon {
    font-size: 1.75rem;
    width: 2.25rem;
    height: 2.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
  }

  .module-cell:hover .cell-icon {
    transform: scale(1.1);
  }

  .cell-icon :global(svg),
  .cell-icon :global(i) {
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
  }

  .module-cell.active .cell-icon :global(svg),
  .module-cell.active .cell-icon :global(i) {
    filter: drop-shadow(
      0 0 6px color-mix(in srgb, var(--module-color) 35%, transparent)
    );
  }

  .cell-label {
    max-width: 100%;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--theme-text);
    letter-spacing: 0.01em;
    line-height: 1.2;
    overflow-wrap: break-word;
    transition: color var(--duration-normal) ease;
  }

  .cell-badge {
    position: absolute;
    top: 6px;
    right: 6px;
    font-size: var(--font-size-compact);
    font-weight: 700;
    text-transform: uppercase;
    padding: 2px 5px;
    border-radius: 4px;
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    border: 1px solid var(--theme-stroke-strong);
    letter-spacing: 0.4px;
    z-index: 3;
  }

  .unread-badge {
    position: absolute;
    top: 6px;
    right: 6px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    background: var(--semantic-error);
    border-radius: 9px;
    color: white;
    font-size: var(--font-size-compact);
    font-weight: 600;
    line-height: 18px;
    text-align: center;
    box-shadow: 0 2px 4px var(--theme-shadow);
    animation: badgePop var(--duration-emphasis) ease;
    z-index: 3;
  }

  @keyframes badgePop {
    0% {
      transform: scale(0);
    }
    50% {
      transform: scale(1.2);
    }
    100% {
      transform: scale(1);
    }
  }

  .module-cell:active {
    transform: scale(0.96);
  }

  .module-cell.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .module-cell.disabled:hover {
    transform: none;
  }

  .module-cell.disabled:hover .cell-background {
    background: linear-gradient(
      145deg,
      var(--theme-card-hover-bg) 0%,
      var(--theme-card-bg) 100%
    );
    border-color: var(--theme-stroke);
  }

  .module-cell.disabled:hover .cell-glow {
    opacity: 0;
  }

  .module-cell.disabled:hover .cell-icon {
    transform: none;
  }

  /* Landscape phones: same type and icon size, less padding, so more rows
     fit in the side drawer before it scrolls. */
  @media (max-height: 500px) and (orientation: landscape) {
    .module-cell {
      min-height: 68px;
    }

    .cell-content {
      gap: 4px;
      padding: 8px;
    }
  }

  .module-cell:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--theme-accent) 60%, transparent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .module-cell {
      animation: none !important;
      opacity: 1 !important;
      transform: none !important;
    }

    .module-cell,
    .cell-background,
    .cell-glow,
    .cell-icon {
      transition: none !important;
    }

    .module-cell:hover,
    .module-cell:active,
    .module-cell.active {
      transform: none !important;
    }

    .module-cell.active .cell-glow,
    .unread-badge {
      animation: none !important;
    }
  }

  @media (prefers-contrast: high) {
    .cell-background {
      background: var(
        --theme-card-hover-bg,
        rgba(255, 255, 255, 0.15)
      ) !important;
      border: 2px solid var(--theme-stroke-strong) !important;
    }

    .module-cell.active .cell-background {
      background: var(
        --theme-card-hover-bg,
        rgba(255, 255, 255, 0.25)
      ) !important;
      border: 2px solid white !important;
    }
  }
</style>
```

- [ ] **Step 2: Format and lint**

Run: `npx prettier --write src/lib/shared/navigation/components/ModuleList.svelte && npx eslint src/lib/shared/navigation/components/ModuleList.svelte && npx stylelint src/lib/shared/navigation/components/ModuleList.svelte`
Expected: no errors. If the existing file already had lint findings that this rewrite did not introduce, note them and continue.

- [ ] **Step 3: Commit**

```bash
git add -- src/lib/shared/navigation/components/ModuleList.svelte
git commit -m "feat(navigation): module grid uses balanced rows and one tile size" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/shared/navigation/components/ModuleList.svelte
```

---

### Task 4: ModuleSwitcher sized by its contents

**Files:**

- Modify: `src/lib/shared/navigation/components/ModuleSwitcher.svelte`

- [ ] **Step 1: Add the list scroller and its reset**

After `let selectedModuleId = $state<ModuleId | null>(null);` add:

```ts
// The list region is the only part of the sheet that scrolls, and only when
// the sheet reaches its height cap. Each view starts at the top.
let listScroller = $state<HTMLElement | null>(null);

function resetListScroll() {
  listScroller?.scrollTo({ top: 0 });
}
```

In `openDrawer()`, after `selectedModuleId = null;` add `resetListScroll();`.

In `handleModuleSelect`, inside `if (module.home || sections.length > 1) {`, before `selectedModuleId = moduleId;` add `resetListScroll();`.

In `handleDrillBack()`, before `selectedModuleId = null;` add `resetListScroll();`.

- [ ] **Step 2: Replace the content markup**

Replace:

```svelte
    <!-- Content -->
    <div class="module-switcher-content">
      <Crossfade
        key={selectedModuleId ?? "__modules__"}
        mode="swap"
        motion="step"
        direction={drillDirection}
        duration={DURATION.normal}
        fill={true}
      >
        <div class="navigator-scroll themed-scrollbar">
```

with:

```svelte
    <!-- Content: sized by the list; scrolls only at the sheet's height cap -->
    <div
      class="module-switcher-content themed-scrollbar"
      bind:this={listScroller}
    >
      <Crossfade
        key={selectedModuleId ?? "__modules__"}
        mode="swap"
        motion="step"
        direction={drillDirection}
        duration={DURATION.normal}
        animateHeight={true}
      >
        <div class="navigator-body">
```

The closing tags stay as they are (`</div>`, `</Crossfade>`, `</div>`).

- [ ] **Step 3: Replace the bottom-sheet sizing rules**

Replace:

```css
/* Bottom placement: Full width, content-adaptive height.
     left/right/width match the Drawer bottom defaults, so they're dropped.
     A fixed height is needed (Drawer bottom only sets min/max-height); Drawer
     doesn't set `height`, so it wins on its own. max-height routes through
     --sheet-max-height. */
:global(.module-switcher-drawer[data-placement="bottom"]) {
  --sheet-max-height: 100dvh;
  /* Default: full height on narrow mobile */
  height: 100vh;
  height: 100dvh;
}

/* The animated list has no intrinsic height. Keep a definite sheet height
     on unfolded phones too, or the footer squeezes the modules out of view. */
@media (min-width: 700px) and (min-height: 500px) {
  :global(.module-switcher-drawer[data-placement="bottom"]) {
    --sheet-max-height: 85dvh;
    height: 85dvh;
    border-radius: var(--sheet-radius-large, 20px)
      var(--sheet-radius-large, 20px) 0 0;
  }
}
```

with:

```css
/* Bottom placement: the sheet is as tall as its header, list, and footer,
     up to the height cap, and no wider than 720px (centered past that, like
     iPad and Material bottom sheets). The list region scrolls at the cap. */
:global(.module-switcher-drawer[data-placement="bottom"]) {
  --sheet-max-height: 100dvh;
  --sheet-max-width: 720px;
  --sheet-min-height: 0px;
}

@media (min-width: 700px) and (min-height: 500px) {
  :global(.module-switcher-drawer[data-placement="bottom"]) {
    --sheet-max-height: 85dvh;
    border-radius: var(--sheet-radius-large, 20px)
      var(--sheet-radius-large, 20px) 0 0;
  }
}
```

- [ ] **Step 4: Replace the content and list padding rules**

Replace:

```css
.module-switcher-content {
  position: relative;
  overflow: hidden;
  flex: 1;
  min-height: 0;
}

/* Keep both animation layers inside the space between header and footer. */
.module-switcher-content :global(.crossfade.fill) {
  position: absolute;
  inset: 0;
  width: auto;
  height: auto;
}

.navigator-scroll {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 20px 20px 40px;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior-y: contain;
  container-type: inline-size;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
}
```

with:

```css
/* Shrinks below its content only when the sheet hits its height cap; the
     header and footer never shrink. The gutter is reserved on both edges so
     the grid width (and so its column count) never flips when a scrollbar
     appears. */
.module-switcher-content {
  flex: 0 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  scrollbar-gutter: stable both-edges;
  -webkit-overflow-scrolling: touch;
}

.navigator-body {
  box-sizing: border-box;
  padding: 12px 20px 16px;
}
```

In the `@media (max-height: 600px) and (orientation: landscape)` block, replace

```css
.navigator-scroll {
  padding: 14px 16px 24px;
}
```

with

```css
.navigator-body {
  padding: 10px 16px 12px;
}
```

In the `@media (max-width: 500px) and (orientation: portrait)` block, replace

```css
.navigator-scroll {
  padding: 16px 16px 32px; /* Maintain generous padding on mobile */
}
```

with

```css
.navigator-body {
  padding: 12px 16px 16px;
}

.account-footer {
  padding-inline: 16px;
}
```

In the `/* Widescreen bottom drawer: tighten padding so content is compact */` block, delete the `.navigator-scroll { padding: 12px 20px 16px; }` rule and keep the `.module-switcher-header` rule.

- [ ] **Step 5: Tighten the footer**

Replace:

```css
.account-footer {
  flex-shrink: 0;
  padding: 12px 20px max(20px, env(safe-area-inset-bottom));
  border-top: 1px solid var(--theme-stroke);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
```

with:

```css
.account-footer {
  flex-shrink: 0;
  padding: 10px 20px max(12px, env(safe-area-inset-bottom));
  border-top: 1px solid var(--theme-stroke);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
```

In the `.drawer-action` rule, change `padding: 8px 4px;` to `padding: 6px 4px;`.

The landscape `.account-footer { padding: 6px; gap: 0; }` rule stays and still wins in landscape because it comes later in the file.

- [ ] **Step 6: Format, lint, and type-check the changed files**

Run: `npx prettier --write src/lib/shared/navigation/components/ModuleSwitcher.svelte && npx eslint src/lib/shared/navigation/components/ModuleSwitcher.svelte && npx stylelint src/lib/shared/navigation/components/ModuleSwitcher.svelte`
Expected: no new errors.

Run: `npm run check:fast`
Expected: no errors in `ModuleSwitcher.svelte`, `ModuleList.svelte`, or `module-grid-layout.ts`. Report any errors elsewhere without fixing them.

- [ ] **Step 7: Commit**

```bash
git add -- src/lib/shared/navigation/components/ModuleSwitcher.svelte
git commit -m "feat(navigation): navigation sheet sizes to its contents" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/shared/navigation/components/ModuleSwitcher.svelte
```

---

### Task 5: Dev harness

**Files:**

- Create: `src/routes/test/module-switcher/+page.svelte`

- [ ] **Step 1: Create the harness**

```svelte
<script lang="ts">
  // Dev harness for the module navigation sheet. Renders the real
  // ModuleSwitcher with a chosen number of modules, so the admin-sized list
  // can be checked while signed out. ?count=3|5|7|13 sets the starting size.
  import { page } from "$app/state";
  import ModuleSwitcher from "$lib/shared/navigation/components/ModuleSwitcher.svelte";
  import { MODULE_DEFINITIONS } from "$lib/shared/navigation/config/module-definitions";
  import type { ModuleId } from "$lib/shared/navigation/domain/types";

  const COUNTS = [3, 5, 7, 13];
  const candidates = MODULE_DEFINITIONS.filter(
    (module) => module.isMain && !module.linkHref
  );
  const requested = Number(page.url.searchParams.get("count"));

  let count = $state(COUNTS.includes(requested) ? requested : 13);
  let currentModule = $state<ModuleId>("create");
  const modules = $derived(candidates.slice(0, count));
  const currentModuleName = $derived(
    modules.find((module) => module.id === currentModule)?.label ?? "Create"
  );

  function toggleSheet() {
    window.dispatchEvent(new Event("module-switcher-toggle"));
  }
</script>

<main class="harness">
  <h1>Module switcher</h1>
  <div class="counts" role="group" aria-label="Module count">
    {#each COUNTS as option}
      <button
        type="button"
        aria-pressed={count === option}
        onclick={() => (count = option)}>{option}</button
      >
    {/each}
  </div>
  <button type="button" class="open" onclick={toggleSheet}
    >Open navigation</button
  >
</main>

<ModuleSwitcher
  {currentModule}
  {currentModuleName}
  {modules}
  onModuleChange={(moduleId) => {
    currentModule = moduleId;
  }}
/>

<style>
  .harness {
    min-height: 100dvh;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    align-items: flex-start;
    background: var(--theme-bg, #0b0d14);
    color: var(--theme-text);
  }

  .counts {
    display: flex;
    gap: 8px;
  }

  button {
    min-height: var(--min-touch-target);
    padding: 0 16px;
    border-radius: 12px;
    border: 1px solid var(--theme-stroke);
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
    cursor: pointer;
  }

  button[aria-pressed="true"] {
    border-color: var(--theme-accent);
    background: color-mix(in srgb, var(--theme-accent) 18%, transparent);
  }
</style>
```

- [ ] **Step 2: Format and lint**

Run: `npx prettier --write src/routes/test/module-switcher/+page.svelte && npx eslint src/routes/test/module-switcher/+page.svelte`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add -- src/routes/test/module-switcher/+page.svelte
git commit -m "test(navigation): dev harness for the module switcher sheet" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/routes/test/module-switcher/+page.svelte
```

---

### Task 6: Browser verification and integration (controller)

- [ ] Start a task-owned Vite server from the worktree on a free non-5173 port (follow `.claude/rules/resource-budget.md` and the worktree dev-server notes), open `/test/module-switcher?count=13` and `?count=3`.
- [ ] At 375×667, 960×412, 820×1180, 1440×900, 1920×1080, 2560×1440, 3840×2160: record sheet width and height, column count, row lengths, whether the list scrolls, and computed root font size. Confirm 3 modules produce a short sheet and 13 produce 5+5+3 at the 720px cap.
- [ ] 200% zoom at 1440×900: sheet reachable, footer visible, list scrolls.
- [ ] Drill into Create and back: height eases, no snap; repeat with reduced motion (instant).
- [ ] Run `npx vitest run --config tests/config/vitest.config.ts tests/unit/navigation/module-grid-layout.test.ts`.
- [ ] Stop the task server, then from `E:/tka-platform`: `npm run wt:finish -- codex/nav-sheet-fit --route /create`.
- [ ] Open `https://localhost:5173/create` in the in-app browser, open the navigation sheet, and confirm the new layout.
