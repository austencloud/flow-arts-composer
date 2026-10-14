# Guide Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Learn-module Guide tab's ad-hoc animated view with a 3-pane reader that shows the faithful printable pages (manifest nav + one-page-fit sheet + slide-open live-animation companion), keeping `/print` + `/book` untouched.

**Architecture:** A durable `GuideReader` shell renders the shared `GuideDocument` (all manifest pages, SSOT) but shows only the active page, scaled to fit — the center is a *swappable frame snippet* so a future reflow frame drops in without touching nav/companion. A manifest-driven `GuidePageNav` navigates; a `GuideCompanion` (wrapping `InlineAnimationPlayer`) slides open and live-animates the sequence a page hands up via a `setGuideSequenceClick` context. Two pure functions (nav-row builder, StepData→SequenceData adapter) are TDD'd; Svelte wiring is runtime-verified on a dev test route (per `component-test-discipline`: no coverage chasing).

**Tech Stack:** Svelte 5 (`$state`/`$derived`/`$props`/snippets), the existing guide `GuideDocument`/`BUILT`/`guide-manifest`, the shared animation engine via `InlineAnimationPlayer`, vitest for the two pure functions.

**Verification note (this codebase):** Do NOT run full `npm run check`/`build` in the inner loop (`.claude/rules/fast-iteration-loop.md`). Use `npx vitest run <file>` for unit steps; verify Svelte wiring on the dev test route `/test/guide-reader`; run ONE `npm run check` at the end. The user's `:5173` dev server is theirs — if it's down, verify with `vite --port 5174` or `npm run build`.

**Commit note:** Every commit uses an explicit pathspec (`git commit -m "..." -- <paths>`) per `.claude/rules/commit-only-your-own-changes.md`. The working tree has unrelated in-flight work — never `git add -A`/`.`.

---

## File Structure

**Create:**
- `src/routes/(public)/guide/level-1/_data/guide-reader-nav.ts` — pure: manifest + `BUILT` → ordered nav rows (front matter + grouped body + built flag + reader page index).
- `src/routes/(public)/guide/level-1/_data/guide-reader-nav.test.ts` — co-located unit test.
- `src/routes/(public)/guide/level-1/_data/guide-sequence-adapter.ts` — pure: `StepData[]` strip → `SequenceData` (start box → `startPosition`, steps renumbered).
- `src/routes/(public)/guide/level-1/_data/guide-sequence-adapter.test.ts` — co-located unit test.
- `src/routes/(public)/guide/level-1/_components/GuidePageNav.svelte` — manifest-driven nav (view over `guide-reader-nav`).
- `src/routes/(public)/guide/level-1/_components/GuideCompanion.svelte` — slide-open panel wrapping `InlineAnimationPlayer`.
- `src/routes/(public)/guide/level-1/_components/GuideReader.svelte` — the 3-pane shell (owns active index, fit scaling, swappable center frame, sequence-click context).
- `src/routes/test/guide-reader/+page.svelte` — dev-only verification route.

**Modify:**
- `src/routes/(public)/guide/level-1/_data/guide-data-context.ts` — add `setGuideSequenceClick`/`getGuideSequenceClick` context.
- `src/lib/features/learn/guide/GuideTab.svelte` — become a thin host that renders `<GuideReader />`.
- `src/routes/(public)/guide/level-1/_pages/Type3CrossShiftsPage.svelte` — make the two sequence strips clickable → call the sequence-click context (first built page wired for the companion).

**Untouched:** `/print`, `/book`, `GuideDocument`, `GuideDdocument`'s manifest, `GuidePictograph`, `_sections/*`.

---

## Task 1: Nav-row builder (pure, TDD)

**Files:**
- Create: `src/routes/(public)/guide/level-1/_data/guide-reader-nav.ts`
- Test: `src/routes/(public)/guide/level-1/_data/guide-reader-nav.test.ts`

Background: `GuideDocument` renders 5 front-matter pages (cover=0, drink=1, support=2, readme=3, toc=4), then body page `i` at reader index `5 + i`. The nav surfaces 3 front-matter jumps (Cover→0, Read Me→3, Contents→4) plus every body page grouped by `GROUP_TITLES` via `bodyPagesByGroup()`.

- [ ] **Step 1: Write the failing test**

```ts
// guide-reader-nav.test.ts
import { describe, it, expect } from "vitest";
import { buildReaderNav, FRONT_MATTER_COUNT } from "./guide-reader-nav";
import { GUIDE_BODY_PAGES } from "./guide-manifest";
import { BUILT } from "./built-pages";

describe("buildReaderNav", () => {
  const rows = buildReaderNav(BUILT);

  it("front matter offset is 5", () => {
    expect(FRONT_MATTER_COUNT).toBe(5);
  });

  it("has the three front-matter jump rows at indices 0, 3, 4", () => {
    const front = rows.filter((r) => r.kind === "front");
    expect(front.map((r) => r.index)).toEqual([0, 3, 4]);
    expect(front.map((r) => r.title)).toEqual(["Cover", "Read Me", "Contents"]);
  });

  it("has one page row per manifest body entry", () => {
    const pages = rows.filter((r) => r.kind === "page");
    expect(pages).toHaveLength(GUIDE_BODY_PAGES.length);
  });

  it("maps the first body page (The Grid) to reader index 5 and marks it built", () => {
    const grid = rows.find((r) => r.kind === "page" && r.id === "the-grid");
    expect(grid).toMatchObject({ index: 5, built: true, title: "The Grid" });
  });

  it("marks an unbuilt entry (base-letters) as not built", () => {
    const bl = rows.find((r) => r.kind === "page" && r.id === "base-letters");
    expect(bl?.built).toBe(false);
  });

  it("emits a group header before each group's pages", () => {
    const groups = rows.filter((r) => r.kind === "group").map((r) => r.group);
    expect(groups).toEqual(["1.0", "1.1", "1.2"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/routes/(public)/guide/level-1/_data/guide-reader-nav.test.ts"`
Expected: FAIL — `buildReaderNav` not defined.

- [ ] **Step 3: Implement**

```ts
// guide-reader-nav.ts
import type { Component } from "svelte";
import {
  GUIDE_BODY_PAGES,
  GROUP_TITLES,
  bodyPagesByGroup,
  type GuideGroup,
} from "./guide-manifest";

/** GuideDocument renders 5 unnumbered front-matter pages before body page 0. */
export const FRONT_MATTER_COUNT = 5;

export type ReaderNavRow =
  | { kind: "front"; index: number; title: string }
  | { kind: "group"; group: GuideGroup; title: string }
  | {
      kind: "page";
      index: number;
      id: string;
      title: string;
      group: GuideGroup;
      level: 0 | 1;
      built: boolean;
    };

/** Front-matter jumps surfaced in the nav (drink/support remain reachable via paging). */
const FRONT_ROWS: { index: number; title: string }[] = [
  { index: 0, title: "Cover" },
  { index: 3, title: "Read Me" },
  { index: 4, title: "Contents" },
];

export function buildReaderNav(built: Record<string, Component>): ReaderNavRow[] {
  const rows: ReaderNavRow[] = FRONT_ROWS.map((f) => ({ kind: "front", ...f }));
  for (const bucket of bodyPagesByGroup()) {
    rows.push({ kind: "group", group: bucket.group, title: GROUP_TITLES[bucket.group] });
    for (const { entry, page } of bucket.entries) {
      rows.push({
        kind: "page",
        index: FRONT_MATTER_COUNT + (page - 1), // page is 1-based manifest position
        id: entry.id,
        title: entry.title,
        group: entry.group,
        level: entry.level,
        built: !!built[entry.id],
      });
    }
  }
  return rows;
}

/** Total reader page count = front matter + all body pages. */
export const READER_PAGE_COUNT = FRONT_MATTER_COUNT + GUIDE_BODY_PAGES.length;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/routes/(public)/guide/level-1/_data/guide-reader-nav.test.ts"`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(public)/guide/level-1/_data/guide-reader-nav.ts" "src/routes/(public)/guide/level-1/_data/guide-reader-nav.test.ts"
git commit -m "feat(guide): reader nav-row builder from manifest + built registry" -- "src/routes/(public)/guide/level-1/_data/guide-reader-nav.ts" "src/routes/(public)/guide/level-1/_data/guide-reader-nav.test.ts"
```

---

## Task 2: StepData→SequenceData adapter (pure, TDD)

**Files:**
- Create: `src/routes/(public)/guide/level-1/_data/guide-sequence-adapter.ts`
- Test: `src/routes/(public)/guide/level-1/_data/guide-sequence-adapter.test.ts`

Background: a page's sequence strip is a flat `StepData[]` where the first box is the start pose (`stepNumber === 0` or `null`) and the rest are steps. The animation engine wants `SequenceData` with `startPosition` (a `StartPositionData` = `PictographData` + `isStartPosition: true`) and 1-based `steps`. The page's StepData already carry `motions.blue`/`motions.red`, so no gallery load is needed.

- [ ] **Step 1: Write the failing test**

```ts
// guide-sequence-adapter.test.ts
import { describe, it, expect } from "vitest";
import { stripToSequence } from "./guide-sequence-adapter";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { MotionType, MotionColor } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridMode, GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

const mk = (step: number | null): StepData =>
  ({
    id: `b${step}`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    startPosition: null,
    endPosition: null,
    motions: {
      blue: createMotionData({ motionType: MotionType.PRO, startLocation: GridLocation.SOUTH, endLocation: GridLocation.NORTH, color: MotionColor.BLUE }),
      red: createMotionData({ motionType: MotionType.PRO, startLocation: GridLocation.NORTH, endLocation: GridLocation.EAST, color: MotionColor.RED }),
    },
    stepNumber: step,
    duration: 1,
    blueReversal: false,
    redReversal: false,
    isBlank: false,
  }) as unknown as StepData;

describe("stripToSequence", () => {
  it("splits the start box out of steps and renumbers steps 1..N", () => {
    const seq = stripToSequence([mk(0), mk(1), mk(2)], { word: "α→γ" });
    expect(seq.steps).toHaveLength(2);
    expect(seq.steps.map((s) => s.stepNumber)).toEqual([1, 2]);
    expect(seq.startPosition).toBeTruthy();
    expect((seq.startPosition as { isStartPosition?: boolean }).isStartPosition).toBe(true);
    expect(seq.word).toBe("α→γ");
    expect(seq.gridMode).toBe(GridMode.DIAMOND);
  });

  it("handles a strip with no explicit start box (all steps)", () => {
    const seq = stripToSequence([mk(1), mk(2)]);
    expect(seq.steps).toHaveLength(2);
    expect(seq.startPosition).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/routes/(public)/guide/level-1/_data/guide-sequence-adapter.test.ts"`
Expected: FAIL — `stripToSequence` not defined.

- [ ] **Step 3: Implement**

```ts
// guide-sequence-adapter.ts
import { createSequenceData, type SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPositionData } from "$lib/shared/foundation/domain/models/start-position-data";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

/** A box is the start pose when it has no beat number (0 or null). */
const isStartBox = (b: StepData): boolean =>
  b.stepNumber === 0 || b.stepNumber === null || b.stepNumber === undefined;

/**
 * Build a playable SequenceData from a guide page's sequence strip. The strip's
 * first box (stepNumber 0/null) becomes the startPosition; the rest become 1-based
 * steps. The strip's StepData already carry motions, so the animation engine plays
 * it directly (ensureMotionData short-circuits).
 */
export function stripToSequence(
  strip: StepData[],
  opts: { word?: string; name?: string } = {}
): SequenceData {
  const startBox = strip.find(isStartBox);
  const stepBoxes = strip.filter((b) => !isStartBox(b));

  const steps = stepBoxes.map((b, i) => ({ ...b, stepNumber: i + 1 })) as unknown as StepData[];

  const startPosition = startBox
    ? ({ ...(startBox as object), isStartPosition: true, id: startBox.id ?? "start" } as unknown as StartPositionData)
    : undefined;

  const gridMode = (strip[0]?.gridMode as GridMode | undefined) ?? GridMode.DIAMOND;

  return createSequenceData({
    steps,
    ...(startPosition ? { startPosition } : {}),
    gridMode,
    word: opts.word ?? "",
    name: opts.name ?? opts.word ?? "guide-sequence",
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/routes/(public)/guide/level-1/_data/guide-sequence-adapter.test.ts"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(public)/guide/level-1/_data/guide-sequence-adapter.ts" "src/routes/(public)/guide/level-1/_data/guide-sequence-adapter.test.ts"
git commit -m "feat(guide): StepData strip -> SequenceData adapter for reader companion" -- "src/routes/(public)/guide/level-1/_data/guide-sequence-adapter.ts" "src/routes/(public)/guide/level-1/_data/guide-sequence-adapter.test.ts"
```

---

## Task 3: Sequence-click context

**Files:**
- Modify: `src/routes/(public)/guide/level-1/_data/guide-data-context.ts`

- [ ] **Step 1: Add the context accessors**

Append to `guide-data-context.ts` (mirrors the existing `setActiveSectionContext` pattern):

```ts
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

const SEQUENCE_CLICK_KEY = Symbol("guide-sequence-click");

/** Payload a page hands up when the user clicks one of its sequences. */
export type GuideSequenceClick = { strip: StepData[]; word?: string };

/** The reader registers a handler; pages call it to open the animation companion. */
export function setGuideSequenceClick(handler: (payload: GuideSequenceClick) => void): void {
  setContext(SEQUENCE_CLICK_KEY, handler);
}

export function getGuideSequenceClick(): ((payload: GuideSequenceClick) => void) | null {
  return getContext<((payload: GuideSequenceClick) => void) | null>(SEQUENCE_CLICK_KEY) ?? null;
}
```

(Add the `StepData` import at the top alongside the existing imports; do not duplicate if already present.)

- [ ] **Step 2: Typecheck the file**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -i "guide-data-context" || echo "clean"`
Expected: `clean` (no errors referencing this file).

- [ ] **Step 3: Commit**

```bash
git add "src/routes/(public)/guide/level-1/_data/guide-data-context.ts"
git commit -m "feat(guide): sequence-click context for reader companion handoff" -- "src/routes/(public)/guide/level-1/_data/guide-data-context.ts"
```

---

## Task 4: GuidePageNav (view)

**Files:**
- Create: `src/routes/(public)/guide/level-1/_components/GuidePageNav.svelte`

- [ ] **Step 1: Implement the nav view**

```svelte
<script lang="ts">
  import type { Component } from "svelte";
  import { buildReaderNav } from "../_data/guide-reader-nav";

  let {
    built,
    activeIndex,
    onSelect,
  }: {
    built: Record<string, Component>;
    activeIndex: number;
    onSelect: (index: number) => void;
  } = $props();

  const rows = $derived(buildReaderNav(built));
</script>

<nav class="reader-nav" aria-label="Guide pages">
  {#each rows as row}
    {#if row.kind === "group"}
      <div class="grp">{row.title}</div>
    {:else if row.kind === "front"}
      <button class="row front" class:active={activeIndex === row.index} onclick={() => onSelect(row.index)}>
        {row.title}
      </button>
    {:else}
      <button
        class="row page"
        class:sub={row.level === 1}
        class:active={activeIndex === row.index}
        class:soon={!row.built}
        onclick={() => onSelect(row.index)}
      >
        <span class="t">{row.title}</span>
        {#if !row.built}<span class="tag">soon</span>{/if}
      </button>
    {/if}
  {/each}
</nav>

<style>
  .reader-nav { display: flex; flex-direction: column; padding: 0.75rem 0.5rem; gap: 2px; overflow-y: auto; height: 100%; box-sizing: border-box; }
  .grp { font: 700 0.72rem/1 system-ui; letter-spacing: 0.06em; text-transform: uppercase; color: #9a93ad; padding: 0.9rem 0.75rem 0.35rem; }
  .row { all: unset; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; min-height: 40px; padding: 0.35rem 0.75rem; border-radius: 6px; cursor: pointer; color: #2a2440; font: 500 0.9rem/1.2 system-ui; }
  .row:hover { background: rgba(120, 90, 200, 0.08); }
  .row.active { background: rgba(120, 90, 200, 0.16); color: #4a2f8a; font-weight: 700; }
  .row.front { font-style: italic; color: #4a4460; }
  .row.sub { padding-left: 1.35rem; font-size: 0.85rem; }
  .row.soon { color: #a49db4; }
  .tag { font: 600 0.62rem/1 system-ui; text-transform: uppercase; letter-spacing: 0.04em; color: #b06; background: rgba(200, 60, 120, 0.1); padding: 2px 6px; border-radius: 999px; }
</style>
```

- [ ] **Step 2: Verify it typechecks (deferred to Task 7's route mount).** No standalone test — this is a presentational view; `component-test-discipline` says do not add a component test without a fixed bug. It is exercised by the test route in Task 7.

- [ ] **Step 3: Commit**

```bash
git add "src/routes/(public)/guide/level-1/_components/GuidePageNav.svelte"
git commit -m "feat(guide): manifest-driven reader page nav" -- "src/routes/(public)/guide/level-1/_components/GuidePageNav.svelte"
```

---

## Task 5: GuideReader shell (nav + fit-to-pane sheet, swappable frame)

**Files:**
- Create: `src/routes/(public)/guide/level-1/_components/GuideReader.svelte`

Background: reuse `GuideDocument` (all pages mounted, SSOT) exactly as `/book` does — a `page` snippet wraps each page; the reader shows only the active one, scaled to fit via the `/book` `fit()` math. The center is rendered through a `frame` snippet prop (default = the sheet frame) so a reflow frame can be swapped later. This task does NOT wire the companion (Task 6) — it passes a no-op sequence-click handler so pages that already call the context don't error.

- [ ] **Step 1: Implement the shell**

```svelte
<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  import "../_styles/guide.css";
  import "../_styles/guide-print.css";
  import { setGuidePrintMode, setGuideSequenceClick, type GuideSequenceClick } from "../_data/guide-data-context";
  import GuidePage from "./GuidePage.svelte";
  import GuideDocument from "./GuideDocument.svelte";
  import GuidePageNav from "./GuidePageNav.svelte";
  import type { GuidePageMeta } from "../_data/guide-manifest";
  import { READER_PAGE_COUNT } from "../_data/guide-reader-nav";
  import { BUILT } from "../_data/built-pages";

  let {
    onSequenceClick,
    companion,
  }: {
    /** Task 6 wires this; default no-op so pages calling the context don't error. */
    onSequenceClick?: (payload: GuideSequenceClick) => void;
    /** Optional right-side companion snippet (Task 6). */
    companion?: Snippet;
  } = $props();

  // Faithful pages render in print STYLE (ink-on-white, static pictographs).
  setGuidePrintMode();
  setGuideSequenceClick((p) => onSequenceClick?.(p));

  const PAGE_W = 816; // 8.5in @96dpi
  const PAGE_H = 1056; // 11in

  let activeIndex = $state(5); // open on The Grid (first body page)
  let scale = $state(0.5);
  let stageEl = $state<HTMLDivElement>();
  let docWrap = $state<HTMLDivElement>();

  const go = (n: number) => (activeIndex = Math.max(0, Math.min(READER_PAGE_COUNT - 1, n)));

  function fit() {
    if (!stageEl) return;
    const w = stageEl.clientWidth - 32;
    const h = stageEl.clientHeight - 56; // minus transport row
    scale = Math.max(0.1, Math.min(w / PAGE_W, h / PAGE_H));
  }

  // Show only the active page (GuideDocument mounts them all, like /book).
  $effect(() => {
    const w = docWrap;
    if (!w) return;
    const i = activeIndex;
    w.querySelectorAll<HTMLElement>(".reader-page").forEach((p, k) => {
      p.style.display = k === i ? "block" : "none";
    });
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowRight") go(activeIndex + 1);
    else if (e.key === "ArrowLeft") go(activeIndex - 1);
  }

  onMount(() => {
    fit();
    const ro = new ResizeObserver(fit);
    if (stageEl) ro.observe(stageEl);
    window.addEventListener("keydown", onKey);
    return () => {
      ro.disconnect();
      window.removeEventListener("keydown", onKey);
    };
  });
</script>

{#snippet sheetFrame(meta: GuidePageMeta)}
  <div class="reader-page">
    <div class="page-fixed" style="transform: scale({scale})">
      <GuidePage title={meta.title} pageNumber={meta.pageNumber} fullBleed={meta.fullBleed}>
        {@render meta.content()}
      </GuidePage>
    </div>
  </div>
{/snippet}

<div class="reader">
  <aside class="reader-aside">
    <GuidePageNav built={BUILT} {activeIndex} onSelect={go} />
  </aside>

  <div class="reader-stage" bind:this={stageEl}>
    <div class="reader-doc" bind:this={docWrap} style="--w:{PAGE_W * scale}px; --h:{PAGE_H * scale}px">
      <GuideDocument built={BUILT} page={sheetFrame} />
    </div>
    <div class="transport">
      <button onclick={() => go(activeIndex - 1)} disabled={activeIndex <= 0} aria-label="Previous page">‹ Prev</button>
      <span class="pos">{activeIndex + 1} / {READER_PAGE_COUNT}</span>
      <button onclick={() => go(activeIndex + 1)} disabled={activeIndex >= READER_PAGE_COUNT - 1} aria-label="Next page">Next ›</button>
    </div>
  </div>

  {#if companion}
    <aside class="reader-companion">{@render companion()}</aside>
  {/if}
</div>

<style>
  .reader { display: flex; height: 100%; width: 100%; overflow: hidden; background: #efeaf4; color: #1a1a1a; }
  .reader-aside { width: 240px; min-width: 240px; height: 100%; background: #fff; border-right: 1px solid #e2dcec; }
  .reader-stage { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .reader-doc { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  /* Each page shows scaled; the fixed 816x1056 sheet scaled into a footprint box
     so it centres cleanly (transform alone doesn't shrink layout size). */
  .reader-doc :global(.reader-page) { display: none; width: var(--w); height: var(--h); overflow: hidden; box-shadow: 0 6px 28px rgba(40, 30, 70, 0.28); border-radius: 2px; }
  .reader-doc :global(.reader-page .page-fixed) { width: 816px; height: 1056px; transform-origin: top left; background: #fff; }
  .reader-doc :global(.reader-page .guide-page) { margin: 0; box-shadow: none; }
  .transport { flex: 0 0 auto; display: flex; align-items: center; justify-content: center; gap: 1rem; padding: 0.75rem; }
  .transport button { font: 500 0.85rem system-ui; padding: 0.5rem 1rem; border-radius: 999px; border: 1px solid #cfc6df; background: #fff; color: #4a2f8a; cursor: pointer; }
  .transport button:disabled { opacity: 0.4; cursor: default; }
  .transport .pos { font: 500 0.8rem system-ui; color: #6b6386; font-variant-numeric: tabular-nums; min-width: 64px; text-align: center; }
  .reader-companion { width: 340px; min-width: 340px; height: 100%; border-left: 1px solid #e2dcec; background: #fff; }

  /* Mobile: nav collapses under the stage; companion overlays. Refined in Task 8. */
  @container (max-width: 720px) {
    .reader-aside { display: none; }
  }
</style>
```

- [ ] **Step 2: Note the `.reader-page` scaling wrapper.** `GuideDocument`'s `page` snippet is rendered once per manifest page; here each becomes a `.reader-page` shown/hidden by index. The `--w`/`--h` footprint + `transform: scale` mirror `/book`'s proven approach.

- [ ] **Step 3: Commit**

```bash
git add "src/routes/(public)/guide/level-1/_components/GuideReader.svelte"
git commit -m "feat(guide): GuideReader shell - manifest nav + one-page-fit sheet frame" -- "src/routes/(public)/guide/level-1/_components/GuideReader.svelte"
```

---

## Task 6: GuideCompanion + wire click-to-animate

**Files:**
- Create: `src/routes/(public)/guide/level-1/_components/GuideCompanion.svelte`
- Modify: `src/routes/(public)/guide/level-1/_components/GuideReader.svelte`
- Modify: `src/routes/(public)/guide/level-1/_pages/Type3CrossShiftsPage.svelte`

- [ ] **Step 1: Implement the companion panel**

```svelte
<!-- GuideCompanion.svelte -->
<script lang="ts">
  import InlineAnimationPlayer from "$lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

  let {
    sequence,
    onClose,
  }: {
    sequence: SequenceData | null;
    onClose: () => void;
  } = $props();
</script>

<div class="companion">
  <div class="head">
    <span class="ttl">Animation</span>
    <button class="close" onclick={onClose} aria-label="Close animation">✕</button>
  </div>
  <div class="body">
    {#if sequence}
      {#key sequence.id}
        <InlineAnimationPlayer {sequence} autoPlay={true} />
      {/key}
    {:else}
      <p class="hint">Click a sequence on the page to animate it.</p>
    {/if}
  </div>
</div>

<style>
  .companion { display: flex; flex-direction: column; height: 100%; }
  .head { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; border-bottom: 1px solid #eee; }
  .ttl { font: 700 0.9rem system-ui; color: #4a2f8a; }
  .close { all: unset; cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 6px; color: #6b6386; }
  .close:hover { background: rgba(120, 90, 200, 0.1); }
  .body { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 0.75rem; }
  .hint { color: #9a93ad; font: italic 0.9rem/1.4 "Cormorant Garamond", Georgia, serif; text-align: center; }
</style>
```

- [ ] **Step 2: Wire the companion into GuideReader**

In `GuideReader.svelte`: import the adapter + companion, hold clicked-sequence state, pass `onSequenceClick` into the context setter, and render the companion slot. Replace the earlier no-op wiring.

```svelte
// add imports
import GuideCompanion from "./GuideCompanion.svelte";
import { stripToSequence } from "../_data/guide-sequence-adapter";
import { ensureMotionData } from "$lib/shared/sequence-viewer/services/sequence-motion-loader";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { GuideSequenceClick } from "../_data/guide-data-context";

// state
let clicked = $state<SequenceData | null>(null);
let companionOpen = $state(false);

async function handleSequenceClick(payload: GuideSequenceClick) {
  const seq = stripToSequence(payload.strip, { word: payload.word });
  clicked = (await ensureMotionData(seq)) ?? seq;
  companionOpen = true;
}

// close companion when navigating pages
$effect(() => {
  activeIndex;
  companionOpen = false;
});
```

Change `setGuideSequenceClick((p) => onSequenceClick?.(p));` to `setGuideSequenceClick(handleSequenceClick);` and drop the `onSequenceClick` prop (self-contained now). Render the companion as a sliding aside (replace the `{#if companion}` block):

```svelte
<aside class="reader-companion" class:open={companionOpen} aria-hidden={!companionOpen}>
  {#if companionOpen}
    <GuideCompanion sequence={clicked} onClose={() => (companionOpen = false)} />
  {/if}
</aside>
```

Update the companion CSS for slide-open (reduced-motion aware):

```css
.reader-companion { width: 0; min-width: 0; overflow: hidden; transition: width 240ms ease, min-width 240ms ease; border-left: 0 solid #e2dcec; background: #fff; }
.reader-companion.open { width: 340px; min-width: 340px; border-left-width: 1px; }
@media (prefers-reduced-motion: reduce) { .reader-companion { transition: none; } }
```

Remove the now-unused `companion?: Snippet` prop and `Snippet` import.

- [ ] **Step 3: Make Type 3's sequence strips clickable**

In `Type3CrossShiftsPage.svelte`, import the context + flatten each strip's cells to `StepData[]`, and wrap each rendered sequence strip in a click affordance.

```svelte
// script: add
import { getGuideSequenceClick } from "../_data/guide-data-context";
const emitSequence = getGuideSequenceClick();

// Flatten a Strip's rows (row-major, skipping null cells) into ordered StepData.
function stripSteps(strip: { rows: Cell[][] }): StepData[] {
  return strip.rows.flat().filter((cell): cell is { m: Move; step: number } => cell !== null)
    .map((cell) => box(cell.m, cell.step, `seq-${cell.step}`));
}
```

Wrap each sequence strip's container element with a button role that calls `emitSequence`:

```svelte
<div
  class="seq-clickable"
  role="button"
  tabindex="0"
  onclick={() => emitSequence?.({ strip: stripSteps(SEQ1), word: "α → γ" })}
  onkeydown={(e) => (e.key === "Enter" || e.key === " ") && emitSequence?.({ strip: stripSteps(SEQ1), word: "α → γ" })}
>
  <!-- existing SEQ1 strip markup unchanged -->
</div>
```

Repeat for `SEQ2` with `word: "β → γ"`. Add minimal affordance CSS (do NOT alter the fixed geometry — the wrapper is position:static and wraps the already-absolutely-positioned strip):

```css
.seq-clickable { cursor: pointer; }
.seq-clickable:hover { outline: 2px solid rgba(120, 90, 200, 0.35); outline-offset: 4px; border-radius: 4px; }
```

If the strips are absolutely positioned (they are — proof coords), the wrapper must not disturb layout: keep the wrapper as a pass-through around the existing positioned block, or apply `role`/handlers directly to the existing strip container instead of adding a new element. Prefer adding the attributes to the EXISTING strip wrapper element to avoid any geometry shift.

- [ ] **Step 4: Verify on the test route (Task 7 must exist first — reorder if needed).** Runtime check: open `/test/guide-reader`, navigate to Type 3, click a sequence → companion slides open and animates. See Task 7 Step 2.

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(public)/guide/level-1/_components/GuideCompanion.svelte" "src/routes/(public)/guide/level-1/_components/GuideReader.svelte" "src/routes/(public)/guide/level-1/_pages/Type3CrossShiftsPage.svelte"
git commit -m "feat(guide): slide-open animation companion + Type 3 click-to-animate" -- "src/routes/(public)/guide/level-1/_components/GuideCompanion.svelte" "src/routes/(public)/guide/level-1/_components/GuideReader.svelte" "src/routes/(public)/guide/level-1/_pages/Type3CrossShiftsPage.svelte"
```

---

## Task 7: Dev test route

**Files:**
- Create: `src/routes/test/guide-reader/+page.svelte`

- [ ] **Step 1: Implement**

```svelte
<script lang="ts">
  import GuideReader from "../../(public)/guide/level-1/_components/GuideReader.svelte";
</script>

<div class="host">
  <GuideReader />
</div>

<style>
  .host { position: fixed; inset: 0; }
</style>
```

- [ ] **Step 2: Runtime verification**

If the user's `:5173` is up: open [localhost:5173/test/guide-reader](https://localhost:5173/test/guide-reader). Else start `vite --port 5174` and open [localhost:5174/test/guide-reader](https://localhost:5174/test/guide-reader).

Verify:
- Nav lists Cover / Read Me / Contents, then grouped body pages; built pages plain, unbuilt dimmed with "soon".
- Clicking a nav row swaps the shown page; Prev/Next + ←/→ step through; page scales to fit.
- On Type 3, clicking a sequence slides the companion open and it animates.

- [ ] **Step 3: Commit**

```bash
git add "src/routes/test/guide-reader/+page.svelte"
git commit -m "test(guide): dev route mounting GuideReader standalone" -- "src/routes/test/guide-reader/+page.svelte"
```

---

## Task 8: Host GuideReader in the Learn Guide tab

**Files:**
- Modify: `src/lib/features/learn/guide/GuideTab.svelte`

- [ ] **Step 1: Replace GuideTab body with the reader**

Replace the entire file contents with a thin host:

```svelte
<script lang="ts">
  import GuideReader from "../../../../routes/(public)/guide/level-1/_components/GuideReader.svelte";
</script>

<div class="guide-tab">
  <GuideReader />
</div>

<style>
  .guide-tab { height: 100%; width: 100%; overflow: hidden; container-type: inline-size; }
</style>
```

(The old `_sections` imports, landing markup, and chapter switch are removed — that taxonomy stays with the legacy `/guide/level-1/*` routes, untouched.)

- [ ] **Step 2: Runtime verification in the app**

Open the Learn module → Guide tab. Confirm the reader renders (nav + page + companion) exactly as the test route, inside the app shell. The `container-type: inline-size` makes the mobile `@container` rule in GuideReader fire on narrow panes.

- [ ] **Step 3: Commit**

```bash
git add "src/lib/features/learn/guide/GuideTab.svelte"
git commit -m "feat(learn): Guide tab hosts the faithful GuideReader (replaces animated sections)" -- "src/lib/features/learn/guide/GuideTab.svelte"
```

---

## Task 9: Final typecheck gate + docs

- [ ] **Step 1: One full typecheck**

Run: `npm run check > /tmp/guide-reader-check.log 2>&1; grep -niE "error" /tmp/guide-reader-check.log | grep -iE "guide|reader|companion" || echo "no guide-reader errors"`
Expected: `no guide-reader errors`. Fix any that reference the new files; re-run once.

- [ ] **Step 2: Run the two unit suites together**

Run: `npx vitest run "src/routes/(public)/guide/level-1/_data/guide-reader-nav.test.ts" "src/routes/(public)/guide/level-1/_data/guide-sequence-adapter.test.ts"`
Expected: PASS (8 tests).

- [ ] **Step 3: Update the ADR + memory pointer**

Add a line to `docs/architecture/guide-single-source.md` under Phase 1 noting the reader shipped as the app-facing surface (the durable shell), and that the public route converges in Phase 2. Update memory `project_guide_single_source.md` accordingly.

```bash
git add docs/architecture/guide-single-source.md "C:/Users/Austen/.claude/projects/E--tka-platform/memory/project_guide_single_source.md"
git commit -m "docs(guide): record GuideReader as the app-facing guide shell" -- docs/architecture/guide-single-source.md
```

(Memory file is outside the repo — write it separately, not via git.)

---

## Deferred (NOT built now — YAGNI)

- **printMode/eager context split** (keep hidden pages lazy as the manifest grows to 34). Only helps `GuidePictograph`-based content; the faithful pages use `PictographContainer`. Revisit if the tab is slow with many built pages — verify `PictographContainer`'s render trigger first.
- **Flow frame** (reflowable content model). The swappable `frame`/`sheetFrame` seam is in place; build only if mobile reflow earns it (spec "Endgame").
- **Wiring click-to-animate on the other built pages** (Grid, Hand Positions/Motions, Type 1, Gamma, Type 2). Type 3 proves the pattern; extend page-by-page as each is revisited, per `component-test-discipline` (grow on demonstrated need).

---

## Self-Review

- **Spec coverage:** nav (Task 4/1) ✓, one-page-fit sheet + swappable frame (Task 5) ✓, companion slide-open + click-to-animate (Task 6) ✓, adapter (Task 2) ✓, context (Task 3) ✓, GuideTab host (Task 8) ✓, coming-soon placeholder (existing `PagePlaceholder`, surfaced via `built:false` nav + GuideDocument's placeholder branch) ✓, printability untouched (reader is a third frame; `/print` `/book` unmodified) ✓, test route (Task 7) ✓, testing discipline (2 pure-fn suites only) ✓. The printMode/eager split from the spec is explicitly deferred with rationale.
- **Type consistency:** `buildReaderNav`/`FRONT_MATTER_COUNT`/`READER_PAGE_COUNT` (Task 1) used in Tasks 4/5. `stripToSequence` (Task 2) used in Task 6. `GuideSequenceClick`/`setGuideSequenceClick`/`getGuideSequenceClick` (Task 3) used in Tasks 5/6/6. `ensureMotionData` returns `SequenceData | null` — Task 6 coalesces with `?? seq`. Consistent.
- **Ordering caveat:** Task 6 Step 4 references the test route (Task 7). Execute Task 7 before Task 6's runtime check, or run Task 6's check after Task 7. Noted inline.
