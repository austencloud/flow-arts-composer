# Unified Sequence Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two hand-rolled whole-sequence selection/hover treatments (guide `.seq-hit`, choreo `.cell-select`/`.cell.selected::after`) with one centralized, token-driven, accessible primitive shared by both surfaces.

**Architecture:** A `SequenceSelection` reactive-state class + Svelte context (mirrors the existing `GuideActiveStep` pattern) tracks hover + single-select keyed by an opaque `groupId`. The host puts a `.tka-seq-cell` class + reactive `is-hovered`/`is-selected` on its OWN element (the guide `.strip`, the choreo `.cell`) — exactly like today's `class:guide-step-active` — and drops a tiny `SelectionHit` child inside for the transparent hit button + ARIA. One `selection.css` token layer (`--theme-accent`) owns the look; the outward ring is a `box-shadow`/`outline` on the element itself so choreo's `overflow:hidden` can't clip it. A `test/sequence-selection` route renders both layouts with live tuning knobs so the exact visual is landed by interaction.

**Tech Stack:** Svelte 5 runes (`$state`, `$derived`, `$props`, `$effect`, `getContext`/`setContext`), vitest + vitest-browser-svelte, existing `PictographContainer`, design tokens (`--theme-accent`, `--theme-accent-strong`, `--min-touch-target`).

**Spec:** `docs/superpowers/specs/2026-07-08-unified-sequence-selection-design.md`

---

## Design decisions locked (from the spec)

- Scope: Guide + Choreo only. Not gallery cards, not `/sequence/[id]`.
- Behavior unifies: guide sequences become persistently selectable (single-select).
- Look: `--theme-accent` token-driven. Exact ring width/offset/tint/glow are STARTING
  VALUES tuned on the test page before final — do not treat the CSS numbers as frozen.
- `groupId` for the guide = the existing strip `key` in the `emitSequence` payload
  (`t1-0`, etc.). For choreo = `cell.sequenceId`.
- **Class + child hit, not a wrapper component.** The host applies `.tka-seq-cell` +
  `is-*` to its own element and drops `<SelectionHit>` inside. A wrapper would lose the
  host's scoped `.cell`/`.strip` styles (Svelte scope hash doesn't cross the `class`
  prop) and an `::after` ring nested inside choreo's `overflow:hidden` `.cell` would be
  clipped. The ring is a `box-shadow`/`outline` on the element itself (like
  `.guide-step-active`), so it is never clipped.
- One tab stop per sequence (the group-start unit); other units pointer-only.
- Scope absent (null context) ⇒ no `SelectionHit`, `is-*` bound to a null scope is
  falsy ⇒ no ring. `/print` and `/book` set no scope and stay pristine.

---

## Task 1: SequenceSelection state factory

**Files:**
- Create: `src/lib/shared/selection/sequence-selection.svelte.ts`
- Test: `src/lib/shared/selection/sequence-selection.svelte.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/shared/selection/sequence-selection.svelte.test.ts
import { describe, it, expect } from "vitest";
import { SequenceSelection } from "./sequence-selection.svelte";

describe("SequenceSelection", () => {
  it("starts with nothing hovered or selected", () => {
    const s = new SequenceSelection();
    expect(s.hoveredId).toBeNull();
    expect(s.selectedId).toBeNull();
    expect(s.isHovered("a")).toBe(false);
    expect(s.isSelected("a")).toBe(false);
  });

  it("hover(id) sets the hovered group; hover(null) clears it", () => {
    const s = new SequenceSelection();
    s.hover("a");
    expect(s.isHovered("a")).toBe(true);
    expect(s.isHovered("b")).toBe(false);
    s.hover(null);
    expect(s.hoveredId).toBeNull();
  });

  it("select(id) is single-select: selecting b replaces a", () => {
    const s = new SequenceSelection();
    s.select("a");
    expect(s.isSelected("a")).toBe(true);
    s.select("b");
    expect(s.isSelected("a")).toBe(false);
    expect(s.isSelected("b")).toBe(true);
  });

  it("toggle(id) selects when unselected and clears when re-toggled", () => {
    const s = new SequenceSelection();
    s.toggle("a");
    expect(s.isSelected("a")).toBe(true);
    s.toggle("a");
    expect(s.selectedId).toBeNull();
  });

  it("clear() deselects but leaves hover untouched", () => {
    const s = new SequenceSelection();
    s.select("a");
    s.hover("a");
    s.clear();
    expect(s.selectedId).toBeNull();
    expect(s.isHovered("a")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/shared/selection/sequence-selection.svelte.test.ts`
Expected: FAIL — cannot resolve `./sequence-selection.svelte` (module does not exist).

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/shared/selection/sequence-selection.svelte.ts
import { getContext, setContext } from "svelte";

const SEQUENCE_SELECTION_KEY = Symbol("sequence-selection");

/**
 * Whole-sequence hover + single-select state, shared by any surface that lets the
 * user select a sequence (guide strips, choreo sheet). Keyed by an opaque group id —
 * every unit sharing a group id reacts together, so hovering or selecting any one
 * unit lights the whole sequence.
 *
 * Mirrors the shape of GuideActiveStep (_data/guide-active-step.svelte.ts): a $state
 * class provided via Symbol-keyed context. Null context = no scope = nothing
 * selectable (e.g. /print, /book).
 */
export class SequenceSelection {
  hoveredId = $state<string | null>(null);
  selectedId = $state<string | null>(null);

  isHovered(id: string): boolean {
    return this.hoveredId === id;
  }
  isSelected(id: string): boolean {
    return this.selectedId === id;
  }

  hover(id: string | null): void {
    this.hoveredId = id;
  }

  /** Single-select. Selecting a new id replaces the old one. */
  select(id: string): void {
    this.selectedId = id;
  }

  /** Click-to-toggle: select when unselected, clear when re-selected. */
  toggle(id: string): void {
    this.selectedId = this.selectedId === id ? null : id;
  }

  clear(): void {
    this.selectedId = null;
  }
}

export function setSequenceSelection(state: SequenceSelection): void {
  setContext(SEQUENCE_SELECTION_KEY, state);
}

export function getSequenceSelection(): SequenceSelection | null {
  return getContext<SequenceSelection | null>(SEQUENCE_SELECTION_KEY) ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/shared/selection/sequence-selection.svelte.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/selection/sequence-selection.svelte.ts src/lib/shared/selection/sequence-selection.svelte.test.ts
git commit -m "feat(selection): SequenceSelection hover+single-select state factory" -- src/lib/shared/selection/sequence-selection.svelte.ts src/lib/shared/selection/sequence-selection.svelte.test.ts
```

Commit trailers (append to every commit body in this plan):
```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01S6BoLsBTjgvHjnY5ma15py
```

---

## Task 2: Shared visual layer (selection.css)

**Files:**
- Create: `src/lib/shared/selection/selection.css`

Values are the tunable starting point (spec §"Visual states"). The outward ring is a
`box-shadow`/`outline` on the `.tka-seq-cell` element itself — NOT a nested pseudo —
so choreo's `overflow:hidden` on `.cell` cannot clip it (same reason
`.guide-step-active` uses a `box-shadow` on `.cell`). A pseudo is used only for the
inner tint, where clipping is harmless. `z-index` lifts the active element so the ring
shows on every edge over neighbours. Every geometric knob is a `--tka-seq-*` custom
property so the look can be tuned live on `/test/sequence-selection` and pasted back.

- [ ] **Step 1: Write the stylesheet**

```css
/* src/lib/shared/selection/selection.css
 * Canonical hover/selected/focus visual for whole-sequence selection.
 * Consumed by the guide sequence strips and the choreo sheet: a host applies
 * `.tka-seq-cell` + `is-hovered`/`is-selected` to its own element and drops a
 * <SelectionHit> inside. All colour from --theme-accent so it re-themes with the app.
 * The outward ring is a box-shadow/outline on the ELEMENT (never a nested pseudo) so
 * an ancestor overflow:hidden can't clip it. NOTE: values below are STARTING POINTS
 * pending Austen's interactive tuning on /test/sequence-selection. */

:root {
  --tka-seq-radius: 6px;
  --tka-seq-hover-width: 2px;
  --tka-seq-hover-offset: 3px;
  --tka-seq-hover-tint: 6%;
  --tka-seq-sel-width: 2px;
  --tka-seq-sel-tint: 12%;
  --tka-seq-sel-glow: 10px;
}

.tka-seq-cell {
  position: relative;
}

/* Transparent hit target laid over the unit. */
.tka-seq-hit {
  position: absolute;
  inset: 0;
  z-index: 3;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  border-radius: var(--tka-seq-radius);
  min-height: var(--min-touch-target, 44px);
  min-width: var(--min-touch-target, 44px);
}
.tka-seq-hit:focus-visible {
  outline: 2px solid var(--theme-accent-strong, #4f46e5);
  outline-offset: 4px;
}

/* Hover — outline on the element itself (unclipped), lifted above neighbours. */
.tka-seq-cell.is-hovered {
  z-index: 4;
  border-radius: var(--tka-seq-radius);
  outline: var(--tka-seq-hover-width) solid
    color-mix(in srgb, var(--theme-accent, #6366f1) 45%, transparent);
  outline-offset: var(--tka-seq-hover-offset);
}
.tka-seq-cell.is-hovered::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background: color-mix(in srgb, var(--theme-accent, #6366f1) var(--tka-seq-hover-tint), transparent);
}

/* Selected — solid accent ring + glow as box-shadow ON the element (unclipped). */
.tka-seq-cell.is-selected {
  z-index: 10;
  border-radius: var(--tka-seq-radius);
  box-shadow:
    0 0 0 var(--tka-seq-sel-width)
      color-mix(in srgb, var(--theme-accent, #6366f1) 90%, transparent),
    0 0 var(--tka-seq-sel-glow)
      color-mix(in srgb, var(--theme-accent, #6366f1) 45%, transparent);
}
.tka-seq-cell.is-selected::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  background: color-mix(in srgb, var(--theme-accent, #6366f1) var(--tka-seq-sel-tint), transparent);
}

/* Selected wins over hover when both are true (hovering the selected unit). */
.tka-seq-cell.is-selected.is-hovered {
  outline: none;
}

@media (prefers-reduced-motion: reduce) {
  .tka-seq-cell.is-selected {
    box-shadow: 0 0 0 var(--tka-seq-sel-width) var(--theme-accent, #6366f1);
  }
}
```

- [ ] **Step 2: Validate**

The file is validated by the vite build in Task 4 when the test page imports it (no
standalone test here). If stylelint is configured (`npx stylelint --version` succeeds),
run `npx stylelint src/lib/shared/selection/selection.css` and expect no errors;
otherwise defer to Task 4's build.

- [ ] **Step 3: Commit**

```bash
git add src/lib/shared/selection/selection.css
git commit -m "feat(selection): token-driven selection.css visual layer" -- src/lib/shared/selection/selection.css
```

---

## Task 3: SelectionHit component

**Files:**
- Create: `src/lib/shared/selection/SelectionHit.svelte`
- Create: `src/lib/shared/selection/SelectionHit.test-harness.svelte`
- Test: `src/lib/shared/selection/SelectionHit.svelte.test.ts`

The hit button + ARIA. Reads the scope from context; renders nothing when the scope is
null (print/book). The host owns the `.tka-seq-cell` element and its `is-*` classes.

- [ ] **Step 1: Write the failing component test**

```ts
// src/lib/shared/selection/SelectionHit.svelte.test.ts
import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, it, expect, vi } from "vitest";
import Harness from "./SelectionHit.test-harness.svelte";
import { expectNoA11yViolations } from "$test-helpers/component-a11y";

describe("SelectionHit", () => {
  it("renders a labelled, tab-focusable button for a group-start unit", async () => {
    render(Harness, { withScope: true, groupId: "seq-1", isGroupStart: true, label: "Select the CAKE sequence" });
    const btn = page.getByRole("button", { name: "Select the CAKE sequence" });
    await expect.element(btn).toBeVisible();
    await expect.element(btn).toHaveAttribute("aria-pressed", "false");
    await expect.element(btn).not.toHaveAttribute("tabindex", "-1");
  });

  it("fires onselect with the groupId when clicked", async () => {
    const onselect = vi.fn();
    render(Harness, { withScope: true, groupId: "seq-1", isGroupStart: true, label: "Select the CAKE sequence", onselect });
    await page.getByRole("button", { name: "Select the CAKE sequence" }).click();
    expect(onselect).toHaveBeenCalledWith("seq-1");
  });

  it("marks non-start units pointer-only (not a tab stop, aria-hidden)", async () => {
    const { container } = render(Harness, { withScope: true, groupId: "seq-1", isGroupStart: false, label: "" });
    const hit = container.querySelector(".tka-seq-hit") as HTMLButtonElement;
    expect(hit).not.toBeNull();
    expect(hit.getAttribute("tabindex")).toBe("-1");
    expect(hit.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders nothing when no scope is provided", async () => {
    const { container } = render(Harness, { withScope: false, groupId: "seq-1", isGroupStart: true, label: "x" });
    expect(container.querySelector(".tka-seq-hit")).toBeNull();
  });

  it("has no AAA a11y violations", async () => {
    render(Harness, { withScope: true, groupId: "seq-1", isGroupStart: true, label: "Select the CAKE sequence" });
    await expectNoA11yViolations();
  });
});
```

- [ ] **Step 2: Write the test harness** (SelectionHit reads context; the harness sets a scope so both the scoped and null-scope branches can be exercised)

```svelte
<!-- src/lib/shared/selection/SelectionHit.test-harness.svelte -->
<script lang="ts">
  import SelectionHit from "./SelectionHit.svelte";
  import { SequenceSelection, setSequenceSelection } from "./sequence-selection.svelte";

  let {
    withScope = true,
    groupId,
    isGroupStart = false,
    label = "",
    onselect,
  }: {
    withScope?: boolean;
    groupId: string;
    isGroupStart?: boolean;
    label?: string;
    onselect?: (id: string) => void;
  } = $props();

  if (withScope) setSequenceSelection(new SequenceSelection());
</script>

<div class="tka-seq-cell" style="width:80px;height:80px">
  <SelectionHit {groupId} {isGroupStart} {label} {onselect} />
</div>
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/shared/selection/SelectionHit.svelte.test.ts`
Expected: FAIL — cannot resolve `./SelectionHit.svelte`.

- [ ] **Step 4: Write the component**

```svelte
<!-- src/lib/shared/selection/SelectionHit.svelte -->
<script lang="ts">
  import { getSequenceSelection } from "./sequence-selection.svelte";

  let {
    groupId,
    isGroupStart = false,
    label = "",
    onselect,
  }: {
    /** Sequence identity; units sharing it hover/select together. */
    groupId: string;
    /** The single focusable/labelled unit per group (one per sequence). */
    isGroupStart?: boolean;
    /** aria-label for the focusable unit. */
    label?: string;
    /** Surface consequence — guide: emit+animate; choreo: toggle+reveal Remove. */
    onselect?: (groupId: string) => void;
  } = $props();

  // The host provides the scope (GuideReader / ChoreoSheetView). Null on /print,
  // /book, or any surface that opts out → this component renders nothing.
  const scope = getSequenceSelection();
</script>

{#if scope}
  <button
    type="button"
    class="tka-seq-hit"
    aria-label={isGroupStart ? label : undefined}
    aria-hidden={isGroupStart ? undefined : "true"}
    aria-pressed={isGroupStart ? scope.isSelected(groupId) : undefined}
    tabindex={isGroupStart ? undefined : -1}
    onpointerenter={() => scope.hover(groupId)}
    onpointerleave={() => scope.hover(null)}
    onclick={() => onselect?.(groupId)}
  ></button>
{/if}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/shared/selection/SelectionHit.svelte.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/shared/selection/SelectionHit.svelte src/lib/shared/selection/SelectionHit.svelte.test.ts src/lib/shared/selection/SelectionHit.test-harness.svelte
git commit -m "feat(selection): SelectionHit button + a11y tests" -- src/lib/shared/selection/SelectionHit.svelte src/lib/shared/selection/SelectionHit.svelte.test.ts src/lib/shared/selection/SelectionHit.test-harness.svelte
```

---

## Task 4: Interactive tuning test page

**Files:**
- Create: `src/routes/test/sequence-selection/+page.svelte`

The surface Austen interacts with to land the visual. Real `PictographContainer`
cells, per `visualization-routing.md` (test page with real primitives — never a
hand-rolled mockup). Renders a contiguous strip (guide-style, one `.tka-seq-cell` →
single ring) and a wrapping group (choreo-style, N `.tka-seq-cell`s → per-cell rings)
under one scope, plus range-slider knobs that write the `--tka-seq-*` custom properties
so the look tunes in real time.

- [ ] **Step 1: Confirm the real import paths** for the pictograph factory + enums by
grepping what `Type456Page.svelte` uses (do not guess — reuse its imports verbatim):

Run: `grep -nE "createMotionData|MotionType|MotionColor|GridLocation|GridMode|getGridPositionFromLocations|PropType|StepData" "src/routes/(public)/guide/level-1/_pages/Type456Page.svelte" | head -20`

Use exactly those import specifiers in the page below (the paths in the snippet are the
expected ones but MUST be reconciled against that grep before finalizing).

- [ ] **Step 2: Write the test page**

```svelte
<!-- src/routes/test/sequence-selection/+page.svelte -->
<script lang="ts">
  import "$lib/shared/selection/selection.css";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import SelectionHit from "$lib/shared/selection/SelectionHit.svelte";
  import { SequenceSelection, setSequenceSelection } from "$lib/shared/selection/sequence-selection.svelte";
  // NOTE: reconcile these four imports with the Step-1 grep of Type456Page.svelte.
  import { createMotionData } from "$lib/shared/foundation/domain/factories/motion-data-factory";
  import { MotionType, MotionColor } from "$lib/shared/foundation/domain/enums/motion-enums";
  import { GridMode, GridLocation } from "$lib/shared/pictograph/grid/domain/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/prop-type";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

  const scope = new SequenceSelection();
  setSequenceSelection(scope);

  function staticStep(step: number): StepData {
    const blue = createMotionData({ color: MotionColor.BLUE, motionType: MotionType.STATIC, startLoc: GridLocation.SOUTH, endLoc: GridLocation.SOUTH });
    const red = createMotionData({ color: MotionColor.RED, motionType: MotionType.STATIC, startLoc: GridLocation.NORTH, endLoc: GridLocation.NORTH });
    return { blueMotionData: blue, redMotionData: red, stepNumber: step } as unknown as StepData;
  }

  const CELLS = [0, 1, 2, 3, 4];

  let radius = $state(6);
  let selWidth = $state(2);
  let selTint = $state(12);
  let selGlow = $state(10);
  let hoverOffset = $state(3);
  let hoverTint = $state(6);

  const stageVars = $derived(
    `--tka-seq-radius:${radius}px;--tka-seq-sel-width:${selWidth}px;` +
    `--tka-seq-sel-tint:${selTint}%;--tka-seq-sel-glow:${selGlow}px;` +
    `--tka-seq-hover-offset:${hoverOffset}px;--tka-seq-hover-tint:${hoverTint}%;`
  );

  const STRIP_KEY = "strip-1";
  const GROUP_KEY = "group-2";
</script>

<div class="page">
  <h1>Sequence selection — tuning</h1>
  <p>Hover / click the strip and the wrapping group. Tune the knobs; paste the values
     into <code>selection.css</code> once it feels right. Selected: {scope.selectedId ?? "none"}</p>

  <div class="knobs">
    <label>radius <input type="range" min="0" max="16" bind:value={radius} /> {radius}px</label>
    <label>sel width <input type="range" min="1" max="5" bind:value={selWidth} /> {selWidth}px</label>
    <label>sel tint <input type="range" min="0" max="40" bind:value={selTint} /> {selTint}%</label>
    <label>sel glow <input type="range" min="0" max="30" bind:value={selGlow} /> {selGlow}px</label>
    <label>hover offset <input type="range" min="0" max="10" bind:value={hoverOffset} /> {hoverOffset}px</label>
    <label>hover tint <input type="range" min="0" max="30" bind:value={hoverTint} /> {hoverTint}%</label>
  </div>

  <div class="stage" style={stageVars}>
    <section>
      <h2>Contiguous strip (guide-style — 1 unit → single ring)</h2>
      <div
        class="demo-strip tka-seq-cell"
        class:is-hovered={scope.isHovered(STRIP_KEY)}
        class:is-selected={scope.isSelected(STRIP_KEY)}
      >
        {#each CELLS as c (c)}
          <div class="demo-cell">
            <PictographContainer pictographData={staticStep(c)} gridMode={GridMode.DIAMOND}
              bluePropTypeOverride={PropType.HAND} redPropTypeOverride={PropType.HAND}
              showGrid={true} showTKA={false} showPositions={c > 0} showHandPoints={true}
              darkMode={false} printMode={true} disableTransitions={true} />
          </div>
        {/each}
        <SelectionHit groupId={STRIP_KEY} isGroupStart label="Select the demo strip"
          onselect={(id) => scope.select(id)} />
      </div>
    </section>

    <section>
      <h2>Wrapping group (choreo-style — N units → per-cell rings)</h2>
      <div class="demo-grid">
        {#each CELLS as c (c)}
          <div
            class="demo-gridcell tka-seq-cell"
            class:is-hovered={scope.isHovered(GROUP_KEY)}
            class:is-selected={scope.isSelected(GROUP_KEY)}
          >
            <div class="demo-cell">
              <PictographContainer pictographData={staticStep(c)} gridMode={GridMode.DIAMOND}
                bluePropTypeOverride={PropType.HAND} redPropTypeOverride={PropType.HAND}
                showGrid={true} showTKA={false} showPositions={c > 0} showHandPoints={true}
                darkMode={false} printMode={true} disableTransitions={true} />
            </div>
            <SelectionHit groupId={GROUP_KEY} isGroupStart={c === 0}
              label={c === 0 ? "Select the demo group" : ""}
              onselect={(id) => scope.toggle(id)} />
          </div>
        {/each}
      </div>
    </section>
  </div>
</div>

<style>
  .page { padding: 24px; color: var(--theme-text, #eee); }
  .knobs { display: flex; flex-wrap: wrap; gap: 16px; margin: 16px 0; }
  .knobs label { display: flex; align-items: center; gap: 6px; font-size: 13px; }
  .stage { display: flex; flex-direction: column; gap: 40px; margin-top: 24px; background: #fff; padding: 32px; border-radius: 8px; }
  h2 { color: #333; font-size: 14px; margin: 0 0 8px; }
  .demo-strip {
    display: grid; grid-template-columns: repeat(5, 80px);
    border: 1px solid #c4c4cc; background: #fff; width: max-content;
  }
  .demo-cell { position: relative; width: 80px; height: 80px; overflow: hidden; }
  .demo-grid { display: grid; grid-template-columns: repeat(3, 84px); gap: 6px; width: max-content; }
  .demo-gridcell { border: 1px solid rgba(0,0,0,0.18); border-radius: 3px; overflow: hidden; }
</style>
```

- [ ] **Step 3: Build to confirm the page + CSS import compile**

Run: `npm run build:fast`
Expected: build succeeds. If any of the four reconciled imports resolve wrong, fix them
against the Step-1 grep and rebuild.

- [ ] **Step 4: Verify the route serves**

Run: `curl -sk https://localhost:5173/test/sequence-selection -o /dev/null -w "%{http_code}\n"`
Expected: `200`.

- [ ] **Step 5: Commit**

```bash
git add src/routes/test/sequence-selection/+page.svelte
git commit -m "feat(selection): interactive tuning test page for the selection primitive" -- src/routes/test/sequence-selection/+page.svelte
```

- [ ] **Step 6: Hand off for interactive tuning**

Give Austen the clickable link
`[localhost:5173/test/sequence-selection](https://localhost:5173/test/sequence-selection)`.
When he lands the values, paste them into the `:root` block of `selection.css` and
commit that as a follow-up (`style(selection): land tuned visual values`). Do NOT
consider the visual "done" before he confirms.

---

## Task 5: Wire the guide (reader scope + 5 pages)

**Files:**
- Modify: `src/routes/(public)/guide/level-1/_components/GuideReader.svelte` (~line 56 and 111-119, plus the companion-close handler)
- Modify: `src/routes/(public)/guide/level-1/_pages/Type1AlphaBetaPage.svelte`
- Modify: `src/routes/(public)/guide/level-1/_pages/Type2ShiftsPage.svelte`
- Modify: `src/routes/(public)/guide/level-1/_pages/Type3CrossShiftsPage.svelte`
- Modify: `src/routes/(public)/guide/level-1/_pages/GammaPage.svelte`
- Modify: `src/routes/(public)/guide/level-1/_pages/Type456Page.svelte`

### 5a — GuideReader provides the scope and selects on click

- [ ] **Step 1: Import the factory + selection.css** — in `GuideReader.svelte`
`<script>`, alongside `import { GuideActiveStep, setGuideActiveStep } from "../_data/guide-active-step.svelte";`:

```ts
import { SequenceSelection, setSequenceSelection } from "$lib/shared/selection/sequence-selection.svelte";
import "$lib/shared/selection/selection.css";
```

- [ ] **Step 2: Create + provide the scope** (next to the existing activeStep, ~line 56-57):

```ts
  const activeStep = new GuideActiveStep();
  setGuideActiveStep(activeStep);

  // Whole-sequence selection: the accent ring marks WHICH strip is active while the
  // amber step ring (activeStep) hops through its steps. Only the reader sets a
  // scope — /print and /book don't, so their strips stay pristine.
  const selection = new SequenceSelection();
  setSequenceSelection(selection);
```

- [ ] **Step 3: Select the clicked strip in `handleSequenceClick`** (~line 111-118) — add `selection.select(...)` right after `activeStep.begin(...)`:

```ts
  async function handleSequenceClick(payload: GuideSequenceClick) {
    activeStep.begin(payload.key ?? "");
    selection.select(payload.key ?? ""); // persist the accent ring on the active strip
    const seq = stripToSequence(payload.strip, { word: payload.word });
    clicked = (await ensureMotionData(seq)) ?? seq;
    companionOpen = true;
  }
```

- [ ] **Step 4: Clear selection when the companion closes** — locate the close site:

Run: `grep -n "companionOpen = false\|activeStep.clear" "src/routes/(public)/guide/level-1/_components/GuideReader.svelte"`

At each place `activeStep.clear()` is called on companion close, add `selection.clear();`
adjacent. If `activeStep.clear()` is not called on close, add both
`activeStep.clear(); selection.clear();` where `companionOpen = false`.

- [ ] **Step 5: Verify type-check**

Run: `npm run check > /tmp/check.log 2>&1; grep -niE "GuideReader|error" /tmp/check.log | head`
Expected: no new errors referencing GuideReader.

- [ ] **Step 6: Commit**

```bash
git add "src/routes/(public)/guide/level-1/_components/GuideReader.svelte"
git commit -m "feat(guide): provide SequenceSelection scope + select active strip" -- "src/routes/(public)/guide/level-1/_components/GuideReader.svelte"
```

### 5b — Migrate each page from `.seq-hit` to `.tka-seq-cell` + `SelectionHit`

Reference worked example: `Type1AlphaBetaPage.svelte`. Apply the SAME transform to the
other four pages. The `groupId` is the exact `key` string already used in that page's
`emitSequence({ ..., key })` call — read it from the existing hit block; do not invent
it.

- [ ] **Step 1: Import + read the scope** in each page `<script>`:

```ts
import SelectionHit from "$lib/shared/selection/SelectionHit.svelte";
import { getSequenceSelection } from "$lib/shared/selection/sequence-selection.svelte";
```
and, near the other context reads (e.g. where `emitSequence`/`activeStep` are obtained):
```ts
const selection = getSequenceSelection();
```

- [ ] **Step 2: Add the classes + hit to the strip render.** In `Type1AlphaBetaPage.svelte`
the strip render (~lines 238-266) is:

```svelte
  {#each STRIPS as strip, si (si)}
    <div
      class="strip"
      style="left:{strip.x * S}px; top:{strip.y * S}px; width:{BOX * 5 * S}px; height:{BOX * S}px"
    >
      {#each strip.moves as m, bi (bi)}
        <div class="cell" class:guide-step-active={activeStep?.key === `t1-${si}` && activeStep.ringStep === bi}>
          <PictographContainer ... />
        </div>
      {/each}
    </div>
  {/each}
```

Change it to add `tka-seq-cell` + the two reactive classes to `.strip`, and drop a
`SelectionHit` inside (reusing the exact key + emit payload the old `.seq-hit` used):

```svelte
  {#each STRIPS as strip, si (si)}
    <div
      class="strip tka-seq-cell"
      class:is-hovered={selection?.isHovered(`t1-${si}`)}
      class:is-selected={selection?.isSelected(`t1-${si}`)}
      style="left:{strip.x * S}px; top:{strip.y * S}px; width:{BOX * 5 * S}px; height:{BOX * S}px"
    >
      {#each strip.moves as m, bi (bi)}
        <div class="cell" class:guide-step-active={activeStep?.key === `t1-${si}` && activeStep.ringStep === bi}>
          <PictographContainer ... />
        </div>
      {/each}
      <SelectionHit
        groupId={`t1-${si}`}
        isGroupStart
        label={`Select the ${SEQ_WORDS[si]} sequence`}
        onselect={() => emitSequence?.({ strip: stripSteps(strip), word: SEQ_WORDS[si], key: `t1-${si}` })}
      />
    </div>
  {/each}
```

Keep the `<PictographContainer ... />` props exactly as they are.

- [ ] **Step 3: Delete the old `.seq-hit` overlay block** (~lines 268-279):

```svelte
  {#if emitSequence}
    {#each STRIPS as strip, si (si)}
      <button class="seq-hit" ...></button>
    {/each}
  {/if}
```

Remove the whole `{#if emitSequence} ... {/if}` hit block.

- [ ] **Step 4: Delete the `.seq-hit` CSS** from that page's `<style>` (the `.seq-hit`,
`.seq-hit:hover`, `.seq-hit:focus-visible` rules). The `.strip` rule stays and keeps
its `position: absolute` (its scoped selector out-specifies the global
`.tka-seq-cell { position: relative }`).

- [ ] **Step 5: Repeat Steps 1-4 for the other four pages.** For each:
  - `Type2ShiftsPage.svelte`, `Type3CrossShiftsPage.svelte`, `GammaPage.svelte`: same
    single-`STRIPS` shape as Type1. Use each page's own strip container class name, its
    `key` value from the existing emit call for `groupId` + the `is-*` bindings, and its
    word source for `label`.
  - `Type456Page.svelte`: multiple strip arrays and 8 strips with keys like
    `t4a-`/`t4b-`/`t5…`. Add `tka-seq-cell` + `is-*` (keyed by that strip's existing
    emit key) and a `SelectionHit` to EACH strip that currently has a `.seq-hit`. Type 6
    display-only strips (`animate:false`, no `emitSequence`) have no `.seq-hit` today —
    leave them untouched (no classes, no hit). Read the file to confirm which strips
    have a hit and migrate exactly those.

  Rule for every page: a strip that had a `.seq-hit` gets `tka-seq-cell` + `is-*`
  (its existing `key`→`groupId`) and a `SelectionHit` with the identical
  `emitSequence(...)` payload in `onselect`; a strip that never had a hit stays
  untouched.

- [ ] **Step 6: Verify type-check + pristine print**

```bash
npm run check > /tmp/check.log 2>&1; grep -niE "error" /tmp/check.log | head
curl -sk https://localhost:5173/guide/level-1/print | grep -c "tka-seq-hit"
```
Expected: no new check errors; the print grep prints `0` (no hit buttons on /print —
scope is null there, so `SelectionHit` renders nothing).

- [ ] **Step 7: Commit** (scoped to exactly the 5 page files)

```bash
git add "src/routes/(public)/guide/level-1/_pages/Type1AlphaBetaPage.svelte" "src/routes/(public)/guide/level-1/_pages/Type2ShiftsPage.svelte" "src/routes/(public)/guide/level-1/_pages/Type3CrossShiftsPage.svelte" "src/routes/(public)/guide/level-1/_pages/GammaPage.svelte" "src/routes/(public)/guide/level-1/_pages/Type456Page.svelte"
git commit -m "feat(guide): migrate sequence strips to the shared selection primitive" -- "src/routes/(public)/guide/level-1/_pages/Type1AlphaBetaPage.svelte" "src/routes/(public)/guide/level-1/_pages/Type2ShiftsPage.svelte" "src/routes/(public)/guide/level-1/_pages/Type3CrossShiftsPage.svelte" "src/routes/(public)/guide/level-1/_pages/GammaPage.svelte" "src/routes/(public)/guide/level-1/_pages/Type456Page.svelte"
```

---

## Task 6: Wire the choreo sheet

**Files:**
- Modify: `src/lib/features/write/components/sheet/ChoreoSheetView.svelte` (provide scope)
- Modify: `src/lib/features/write/components/sheet/SheetPreviewPages.svelte` (cell render ~401-452; CSS ~523-546)

### 6a — ChoreoSheetView provides a scope mirroring the builder

- [ ] **Step 1: Import + provide + mirror.** In `ChoreoSheetView.svelte` `<script>`:

```ts
import { SequenceSelection, setSequenceSelection } from "$lib/shared/selection/sequence-selection.svelte";
import "$lib/shared/selection/selection.css";
```

Then, at top level of the script (after `builder` is available):

```ts
  // Shared selection primitive. The builder stays the behavioural owner
  // (Remove/persistence/Escape); this scope mirrors its selectedId so the shared
  // ring + a11y match the guide by construction.
  const selection = new SequenceSelection();
  setSequenceSelection(selection);
  $effect(() => {
    selection.selectedId = builder.selectedSequenceId;
  });
```

- [ ] **Step 2: Verify type-check**

Run: `npm run check > /tmp/check.log 2>&1; grep -niE "ChoreoSheetView|error" /tmp/check.log | head`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "src/lib/features/write/components/sheet/ChoreoSheetView.svelte"
git commit -m "feat(choreo): provide SequenceSelection scope mirroring the builder" -- "src/lib/features/write/components/sheet/ChoreoSheetView.svelte"
```

### 6b — SheetPreviewPages renders cells through the primitive

- [ ] **Step 1: Import + read the scope** in `SheetPreviewPages.svelte` `<script>`:

```ts
import SelectionHit from "$lib/shared/selection/SelectionHit.svelte";
import { getSequenceSelection } from "$lib/shared/selection/sequence-selection.svelte";
```
and near the other derived/context reads:
```ts
const selection = getSequenceSelection();
```

- [ ] **Step 2: Rework the cell render.** The current cell (~lines 402-452) is a
`<div class="cell" class:selected={isSelected(cell.sequenceId)}>` containing a
`.cell-select` button, the break label, remove button, and pictograph. Replace the
`.cell-select` button with a `SelectionHit`, add `tka-seq-cell` + the `is-*` classes to
the `.cell`, and drop the `class:selected` (the ring is now the shared `is-selected`).
Keep the Remove button gated on the existing `isSelected()` helper. Result:

```svelte
                <div
                  class="cell tka-seq-cell"
                  class:blank={cell.isBlank}
                  class:break={isCellBreak(cell)}
                  class:separator={isCellSeparator(cell, pi === 0 && ri === 0 && ci === 0)}
                  class:is-hovered={cell.sequenceId ? selection?.isHovered(cell.sequenceId) : false}
                  class:is-selected={cell.sequenceId ? selection?.isSelected(cell.sequenceId) : false}
                >
                  {#if !cell.isBlank && cell.sequenceId && onSelectSequence}
                    <SelectionHit
                      groupId={cell.sequenceId}
                      isGroupStart={cell.isSequenceStart}
                      label="Select this sequence"
                      onselect={(id) => onSelectSequence?.(id)}
                    />
                  {/if}
                  {#if isCellBreak(cell)}
                    <span class="cell-break-label">
                      <i class="fa-solid fa-link-slash" aria-hidden="true"></i> break
                    </span>
                  {/if}
                  {#if cell.isSequenceStart && isSelected(cell.sequenceId) && onRemoveSequence}
                    <button
                      type="button"
                      class="block-remove"
                      onclick={(e) => { e.stopPropagation(); onRemoveSequence?.(cell.sequenceId!); }}
                    >
                      <i class="fa-solid fa-trash" aria-hidden="true"></i> Remove
                    </button>
                  {/if}
                  {#if cell.step && visiblePages.has(pi)}
                    <PictographContainer
                      pictographData={cell.step}
                      disableTransitions={true}
                      printMode={true}
                      darkMode={false}
                      showGrid={SHEET_CELL_VISIBILITY.showGrid}
                      showTKA={SHEET_CELL_VISIBILITY.showTKA}
                      showReversals={SHEET_CELL_VISIBILITY.showReversals}
                      showNonRadialPoints={SHEET_CELL_VISIBILITY.showNonRadialPoints}
                      showTnD={SHEET_CELL_VISIBILITY.showTnD}
                      showElemental={SHEET_CELL_VISIBILITY.showElemental}
                      showPositions={SHEET_CELL_VISIBILITY.showPositions}
                      stepNumberOverride={layout.showStepNumbers}
                      {showHandPoints}
                    />
                  {/if}
                </div>
```

- [ ] **Step 3: Remove the dead CSS.** Delete `.cell-select` (~526-535) and
`.cell.selected::after` (~537-546) from the `<style>` block. KEEP `.cell`, `.cell.blank`,
`.cell.break`, `.cell.separator`, `.block-remove`, `.cell-break-label`. The ring now
comes from the global `.tka-seq-cell.is-selected`.

- [ ] **Step 4: Keep `isSelected` + `selectedSequenceId`.** The `isSelected()` helper
still gates the Remove button, so leave it and the `selectedSequenceId` prop in place.

- [ ] **Step 5: Verify build + type-check**

```bash
npm run build:fast
npm run check > /tmp/check.log 2>&1; grep -niE "SheetPreview|error" /tmp/check.log | head
```
Expected: build ok; no new check errors. Confirm the `.cell` border/aspect-ratio still
render (they are unchanged scoped rules on the same element).

- [ ] **Step 6: Commit**

```bash
git add "src/lib/features/write/components/sheet/SheetPreviewPages.svelte"
git commit -m "feat(choreo): render sheet-cell selection through the shared primitive" -- "src/lib/features/write/components/sheet/SheetPreviewPages.svelte"
```

---

## Task 7: Contract test + final verification

**Files:**
- Create: `tests/unit/sequence-selection-contract.test.ts`

Mirrors `tests/unit/sequence-viewer-shell-contract.test.ts`: a static source-level
assert that both hosts use the shared primitive and neither reintroduces a raw hit/
ring, so the drift this consolidation fixes cannot silently return.

- [ ] **Step 1: Write the contract test**

```ts
// tests/unit/sequence-selection-contract.test.ts
/**
 * Static contract for the unified sequence-selection primitive.
 *
 * The guide sequence strips and the choreo sheet render whole-sequence hover/select
 * through the SAME SelectionHit + `.tka-seq-cell` classes + SequenceSelection scope,
 * so the two surfaces cannot drift back into hand-rolled selection markup (see
 * docs/superpowers/specs/2026-07-08-unified-sequence-selection-design.md).
 *
 * If this fails, fix the host to use the primitive — do not loosen the assertions.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

const GUIDE_PAGES = [
  "src/routes/(public)/guide/level-1/_pages/Type1AlphaBetaPage.svelte",
  "src/routes/(public)/guide/level-1/_pages/Type2ShiftsPage.svelte",
  "src/routes/(public)/guide/level-1/_pages/Type3CrossShiftsPage.svelte",
  "src/routes/(public)/guide/level-1/_pages/GammaPage.svelte",
  "src/routes/(public)/guide/level-1/_pages/Type456Page.svelte",
];
const CHOREO_CELL = "src/lib/features/write/components/sheet/SheetPreviewPages.svelte";

describe("unified sequence-selection contract", () => {
  it("every guide page that emits a sequence uses SelectionHit + .tka-seq-cell", () => {
    for (const rel of GUIDE_PAGES) {
      const src = read(rel);
      if (!src.includes("emitSequence")) continue; // page has no interactive strips
      expect(src, `${rel} must import SelectionHit`).toContain("SelectionHit");
      expect(src, `${rel} must apply tka-seq-cell`).toContain("tka-seq-cell");
    }
  });

  it("no guide page reintroduces the hand-rolled .seq-hit button", () => {
    for (const rel of GUIDE_PAGES) {
      expect(read(rel), `${rel} must not contain a raw seq-hit`).not.toContain('class="seq-hit"');
    }
  });

  it("the choreo sheet uses the primitive and dropped .cell-select", () => {
    const src = read(CHOREO_CELL);
    expect(src).toContain("SelectionHit");
    expect(src).toContain("tka-seq-cell");
    expect(src, "cell-select hit must be gone").not.toContain('class="cell-select"');
    expect(src, "hand-rolled selected ::after must be gone").not.toContain(".cell.selected::after");
  });
});
```

- [ ] **Step 2: Run it to verify it passes** (against the migrated code from Tasks 5-6)

Run: `npx vitest run tests/unit/sequence-selection-contract.test.ts`
Expected: PASS (3 tests). If a guide page fails "must import", it was missed in Task 5
— fix the page, not the test.

- [ ] **Step 3: Full verification gate**

```bash
npm run check > /tmp/check.log 2>&1; grep -niE "error|warning" /tmp/check.log | head -40
npx vitest run src/lib/shared/selection tests/unit/sequence-selection-contract.test.ts
curl -sk https://localhost:5173/guide/level-1/print | grep -c "tka-seq-hit"   # expect 0
```
Expected: `found 0 errors and 0 warnings`; all selection unit/contract tests pass;
print grep prints `0`.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/sequence-selection-contract.test.ts
git commit -m "test(selection): contract locking both hosts to the shared primitive" -- tests/unit/sequence-selection-contract.test.ts
```

- [ ] **Step 5: Hand off for the visual sign-off** — surface clickable links for
Austen's interaction: the tuning page
`[localhost:5173/test/sequence-selection](https://localhost:5173/test/sequence-selection)`,
the reader `[localhost:5173/learn/guide](https://localhost:5173/learn/guide)`, and the
choreo sheet in Write → Choreo. He confirms hover/select/focus/wrap feel right and
lands the final `--tka-seq-*` values, which then get pasted into `selection.css` and
committed (`style(selection): land tuned visual values`).

---

## Self-review notes (for the executor)

- **Do not freeze the visual.** The CSS numbers are starting values; Task 4 exists so
  Austen tunes them by interaction before they are final (spec is explicit).
- **Class + child hit, never a wrapper.** The `.tka-seq-cell` + `is-*` classes go on
  the host's OWN element (guide `.strip`, choreo `.cell`); `SelectionHit` goes inside.
  A wrapper would drop the host's scoped styles and clip the ring under `overflow:hidden`.
- **The ring is a `box-shadow`/`outline` on the element**, not a nested pseudo — that is
  why it survives choreo's `overflow:hidden` (same trick as `.guide-step-active`).
- **Scope-null safety is load-bearing.** `SelectionHit` renders nothing and `is-*` bind
  to `selection?.…` (falsy) when the scope is null. `/print` and `/book` set no scope.
  The Task 5/7 grep for `tka-seq-hit` on `/print` returning `0` proves it.
- **`groupId` = the existing strip `key`.** Never invent a guide groupId; reuse the
  page's existing `emitSequence({ ..., key })` value so the selection ring and the
  golden step ring (keyed on the same value) stay in lockstep.
- **Commit only your own paths.** Every commit uses an explicit `-- <paths>` pathspec
  (options before `--`). The tree may hold other agents' work; never bare-commit.
- **One cold `npm run check` per turn.** Capture to `/tmp/check.log`, grep the log;
  use `check:watch` for iteration (fast-iteration-loop rule).
```
