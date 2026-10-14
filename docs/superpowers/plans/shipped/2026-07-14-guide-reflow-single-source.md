# Guide Reflow — Single Source, Two Frames, Crawlable Route — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the real Level-1 guide a single layout-agnostic content model rendered by two frames — a print-faithful `SheetFrame` and a mobile-first crawlable `FlowFrame` — toggled in the reader, with a prerendered `/guide/level-1/<slug>` route so Google can rank Austen's prose. Prove it end-to-end on the `hand-positions` page.

**Architecture:** Each migrated page gets `content: GuideBlock[]` (its single source: verbatim prose + pictograph descriptors + pt-position hints). `SheetFrame` absolute-positions blocks at their pt hints to reproduce the current 8.5×11 sheet pixel-for-pixel; `FlowFrame` stacks the same blocks down a mobile editorial column. The reader's `sheetFrame` snippet seam gains a flow sibling behind a `SegmentedControl` toggle. A prerendered route renders `FlowFrame` + `GuideSeo` — one content model, two hosts (the `SequenceViewerShell` anti-drift pattern). Spec: `docs/superpowers/specs/2026-07-14-guide-reflow-single-source-design.md`.

**Tech Stack:** Svelte 5 (runes), SvelteKit (prerender), vitest (unit + static contract tests), existing guide primitives (`GuidePictograph`, `GuideSeo`, `PictographContainer`, `startPositionManager`, `SegmentedControl`).

**Scope of this plan:** The machine (block model + both frames + toggle + one crawl route + contract tests) **plus the `hand-positions` page fully migrated + verified**. The remaining 1.0 pages (`the-grid`, `hm-type1`, `hm-gamma`, `hm-type2`, `hm-type34`, `hm-type56`, `staff-positions`, `staff-motions`, `negative-space`, `hand-motions`) and clusters 1.1/1.2 are follow-on rolls through the same machine (Task 11 gives the repeatable template). Not in this plan.

---

## File Structure

**Create:**
- `src/routes/(public)/guide/level-1/_data/guide-content-blocks.ts` — the `GuideBlock` union + `PtHint` + the `blockProseText()` helper (drift-guard input).
- `src/routes/(public)/guide/level-1/_data/content/hand-positions.content.ts` — `handPositionsContent: GuideBlock[]`, the single source for the page (verbatim prose lifted from `HandPositionsPage.svelte`).
- `src/routes/(public)/guide/level-1/_data/guide-content.ts` — `GUIDE_CONTENT: Record<string, GuideBlock[]>` slug→blocks registry (mirrors `built-pages.ts`).
- `src/routes/(public)/guide/level-1/_data/guide-frame-prefs.svelte.ts` — persisted `guideFramePrefs` reactive singleton (`{ frame: "sheet" | "flow" }`).
- `src/routes/(public)/guide/level-1/_components/SheetFrame.svelte` — renders blocks at pt hints (the print-faithful frame).
- `src/routes/(public)/guide/level-1/_components/FlowFrame.svelte` — stacks blocks (the reflow frame).
- `src/routes/(public)/guide/level-1/hand-positions/+page.svelte` — the prerendered crawl host.
- `src/routes/(public)/guide/level-1/hand-positions/+page.ts` — `prerender = true`.
- `tests/unit/guide-reflow-contract.test.ts` — static contract + drift guard.
- `src/routes/(public)/guide/level-1/_data/content/hand-positions.content.test.ts` — verbatim-prose assertions.

**Modify:**
- `src/routes/(public)/guide/level-1/_pages/HandPositionsPage.svelte` — body becomes `<SheetFrame content={handPositionsContent} />`.
- `src/routes/(public)/guide/level-1/_components/GuideDocument.svelte` — add `frame` prop; route body content to `FlowFrame` when `frame==="flow"` and content exists.
- `src/routes/(public)/guide/level-1/_components/GuideReader.svelte` — add the sheet/flow toggle + pass `frame` to `GuideDocument`.
- `src/routes/sitemap.xml/+server.ts` — add `guide/level-1/hand-positions`.
- `src/routes/(public)/guide/+page.svelte` — link the crawl route from the hub "Available now" section.

---

## Task 1: The block model + prose helper

**Files:**
- Create: `src/routes/(public)/guide/level-1/_data/guide-content-blocks.ts`
- Test: `tests/unit/guide-reflow-contract.test.ts` (created here, extended later)

- [ ] **Step 1: Write the block model + helper**

Create `src/routes/(public)/guide/level-1/_data/guide-content-blocks.ts`:

```ts
/**
 * The single-source content model for a Level-1 guide page. ONE `GuideBlock[]`
 * per migrated page is rendered by BOTH frames: SheetFrame positions each block
 * at its `sheet` pt hint (print-faithful), FlowFrame ignores the hint and stacks
 * blocks in reading order (mobile, crawlable). Spec:
 * docs/superpowers/specs/2026-07-14-guide-reflow-single-source-design.md.
 *
 * pt = the proof PDF's own points; the sheet is 612pt × 792pt (8.5×11in), and
 * SheetFrame multiplies by S = 816/612 to reach the 816×1056px on-screen sheet.
 */
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

/** A block's position on the print sheet, in PDF points. Only SheetFrame reads it. */
export type PtHint = {
  x: number;
  y: number;
  /** Width in pt (text wrap / element width). Optional — full-width prose omits it. */
  w?: number;
  /** Height in pt (drives font-size for text runs on the sheet). */
  h?: number;
  /** Font size in pt for prose/heading runs (sheet only; flow uses editorial sizing). */
  fontSize?: number;
  /** Line height in pt for multi-line prose runs (sheet only). */
  lineHeight?: number;
  /** Horizontal alignment on the sheet; defaults to "center". */
  align?: "left" | "center" | "right";
};

/** Grid geometry for a pictograph group on the sheet (e.g. the 16 positions). */
export type SheetGrid = {
  /** Left x of each column, in pt. */
  cols: number[];
  /** Top y of each row, in pt. */
  rows: number[];
  /** Square cell size in pt. */
  cell: number;
  /** Row index per item, parallel to `items`. */
  rowFor: number[];
};

export type GuideBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string; sheet?: PtHint }
  | { kind: "prose"; html: string; sheet?: PtHint }
  | { kind: "glyphImage"; src: string; alt: string; heightPt: number; sheet?: PtHint }
  | { kind: "rule"; sheet: PtHint }
  | { kind: "pictograph"; data: PictographData; caption?: string; sheet?: PtHint }
  | {
      kind: "pictographGroup";
      /** Real pictographs, in reading order. */
      items: PictographData[];
      /** Optional per-item glyph/caption for the flow list. */
      caption?: string;
      /** Sheet grid geometry (SheetFrame lays the items out with this). */
      grid?: SheetGrid;
      /** Flow layout: responsive column count for FlowFrame. */
      flowCols?: number;
      sheet?: PtHint;
    }
  | {
      /** Bespoke print artifact (flattened raster / measured vector). Sheet renders
       *  `sheetHtml`; flow renders the semantic `flow` fallback. */
      kind: "printOnly";
      sheetHtml: string;
      flow: GuideBlock[];
      sheet: PtHint;
    };

/** Concatenated human-readable text of a page's prose + headings — the drift-guard
 *  input. Strips HTML tags so `<strong>`/`<span>` markup doesn't affect equality. */
export function blockProseText(blocks: GuideBlock[]): string {
  const strip = (html: string) => html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  const out: string[] = [];
  for (const b of blocks) {
    if (b.kind === "heading") out.push(strip(b.text));
    else if (b.kind === "prose") out.push(strip(b.html));
    else if (b.kind === "printOnly") out.push(blockProseText(b.flow));
  }
  return out.filter(Boolean).join(" ");
}
```

- [ ] **Step 2: Write the failing helper test**

Create `tests/unit/guide-reflow-contract.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { blockProseText, type GuideBlock } from "../../src/routes/(public)/guide/level-1/_data/guide-content-blocks";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

describe("blockProseText", () => {
  it("concatenates heading + prose text, stripping HTML", () => {
    const blocks: GuideBlock[] = [
      { kind: "heading", level: 2, text: "Alpha" },
      { kind: "prose", html: "In <strong>Alpha</strong>, the hands occupy the points across from each other." },
      { kind: "rule", sheet: { x: 0, y: 0 } },
    ];
    expect(blockProseText(blocks)).toBe(
      "Alpha In Alpha, the hands occupy the points across from each other."
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `npx vitest run tests/unit/guide-reflow-contract.test.ts -t "blockProseText"`
Expected: PASS (1 test).

- [ ] **Step 4: Commit**

```bash
git add "src/routes/(public)/guide/level-1/_data/guide-content-blocks.ts" tests/unit/guide-reflow-contract.test.ts
git commit -m "feat(guide): GuideBlock content model + blockProseText drift-guard helper" -- "src/routes/(public)/guide/level-1/_data/guide-content-blocks.ts" tests/unit/guide-reflow-contract.test.ts
```

---

## Task 2: The `hand-positions` content source (verbatim prose)

**Files:**
- Create: `src/routes/(public)/guide/level-1/_data/content/hand-positions.content.ts`
- Test: `src/routes/(public)/guide/level-1/_data/content/hand-positions.content.test.ts`

Prose is lifted VERBATIM from `HandPositionsPage.svelte` (`intro.html` at lines 124–128; `RUNS` at lines 133–140). Pt coordinates are copied from the same file's constants so `SheetFrame` reproduces the sheet. Do NOT paraphrase — the strings must match character-for-character (the drift-guard test enforces it).

- [ ] **Step 1: Write the failing verbatim-prose test**

Create `src/routes/(public)/guide/level-1/_data/content/hand-positions.content.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { handPositionsContent } from "./hand-positions.content";
import { blockProseText } from "../guide-content-blocks";

describe("hand-positions content", () => {
  it("carries Austen's verbatim position definitions", () => {
    const text = blockProseText(handPositionsContent);
    expect(text).toContain("In Alpha, the hands occupy the points across from each other.");
    expect(text).toContain("In Beta, the hands occupy the same point.");
    expect(text).toContain("In Gamma, the hands form a right angle.");
    expect(text).toContain(
      "There are multiple ways to combine two hand points to form a hand position."
    );
    expect(text).toContain(
      "In The Kinetic Alphabet, our first three positions are called Alpha, Beta, and Gamma."
    );
  });

  it("includes the 16 canonical positions as one pictograph group", () => {
    const group = handPositionsContent.find((b) => b.kind === "pictographGroup");
    expect(group).toBeDefined();
    if (group?.kind === "pictographGroup") {
      expect(group.items.length).toBe(16);
    }
  });

  it("leads each section with a position glyph", () => {
    const glyphs = handPositionsContent.filter((b) => b.kind === "glyphImage");
    expect(glyphs.map((g) => g.kind === "glyphImage" && g.alt)).toEqual([
      "Alpha (α)",
      "Beta (β)",
      "Gamma (γ)",
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "src/routes/(public)/guide/level-1/_data/content/hand-positions.content.test.ts"`
Expected: FAIL — `Cannot find module './hand-positions.content'`.

- [ ] **Step 3: Write the content source**

Create `src/routes/(public)/guide/level-1/_data/content/hand-positions.content.ts`. The geometry constants and prose are copied verbatim from `HandPositionsPage.svelte`:

```ts
/**
 * Single source for the Hand Positions page (manifest id "hand-positions").
 * Prose is lifted VERBATIM from the original HandPositionsPage.svelte (Austen's
 * words — never AI-written). Geometry constants are copied from that same file so
 * SheetFrame reproduces the proof sheet pixel-for-pixel; FlowFrame ignores the
 * pt hints and stacks the blocks. See the reflow spec + no-ghostwriting rule.
 */
import type { GuideBlock, SheetGrid } from "../guide-content-blocks";
import { startPositionManager } from "$lib/shared/create/services/start-position-manager";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

// The 16 diamond-mode positions (α/β/γ, 4/4/8), prop forced to HAND — identical
// to the original page's derivation (HandPositionsPage.svelte lines 31–39).
const positions = startPositionManager
  .getAllStartPositionVariations(GridMode.DIAMOND)
  .map((p) => ({
    ...p,
    motions: {
      blue: p.motions?.blue ? { ...p.motions.blue, propType: PropType.HAND } : undefined,
      red: p.motions?.red ? { ...p.motions.red, propType: PropType.HAND } : undefined,
    },
  }));

// ── Geometry, copied verbatim from HandPositionsPage.svelte (lines 42–102) ──
const COLS = [75, 195, 315, 435];
const SIZE = 99.5;
const TITLE_Y = 22, TITLE_H = 40, GAP = 12, G_IN = 6, ROW_GAP = 5, LINE = 18;
const GLYPH_H = 22, GH_GAP = 1, WORD_H = 18, DESC_H = 18;

const introY = TITLE_Y + TITLE_H + GAP;
const introBottom = introY + 2 * LINE + 14;
const aGlyphY = introBottom + GAP;
const aHeadY = aGlyphY + GLYPH_H + GH_GAP;
const ROW_A = aHeadY + WORD_H + G_IN;
const aDescY = ROW_A + SIZE + G_IN;
const bGlyphY = aDescY + DESC_H + GAP;
const bHeadY = bGlyphY + GLYPH_H + GH_GAP;
const ROW_B = bHeadY + WORD_H + G_IN;
const bDescY = ROW_B + SIZE + G_IN;
const gGlyphY = bDescY + DESC_H + GAP;
const gHeadY = gGlyphY + GLYPH_H + GH_GAP;
const ROW_G1 = gHeadY + WORD_H + G_IN;
const ROW_G2 = ROW_G1 + SIZE + ROW_GAP;
const gDescY = ROW_G2 + SIZE + G_IN;
const DIVIDERS = [aDescY + DESC_H + GAP / 2, bDescY + DESC_H + GAP / 2];

const grid: SheetGrid = {
  cols: COLS,
  rows: [ROW_A, ROW_B, ROW_G1, ROW_G2],
  cell: SIZE,
  rowFor: positions.map((_, i) => (i < 4 ? 0 : i < 8 ? 1 : i < 12 ? 2 : 3)),
};

// Verbatim intro HTML (HandPositionsPage.svelte lines 125–128).
const INTRO_HTML =
  "There are multiple ways to combine two hand points to form a hand position.<br>" +
  'Positions can be rotated or mirrored.<span class="lg"></span>' +
  '<strong><span class="cR">Red = Right</span> and <span class="cB">Blue = Left.</span></strong><br>' +
  "In The Kinetic Alphabet, our first three positions are called Alpha, Beta, and Gamma.";

export const handPositionsContent: GuideBlock[] = [
  { kind: "heading", level: 1, text: "Hand Positions", sheet: { x: 0, y: TITLE_Y } },
  { kind: "prose", html: INTRO_HTML, sheet: { x: 0, y: introY, fontSize: 15, lineHeight: LINE, align: "center" } },

  { kind: "glyphImage", src: "/images/letters_trimmed/Type6/α.svg", alt: "Alpha (α)", heightPt: GLYPH_H, sheet: { x: 304, y: aGlyphY } },
  { kind: "heading", level: 2, text: "Alpha", sheet: { x: 275.0, y: aHeadY, w: 54.8, h: 22, align: "center" } },
  { kind: "prose", html: "In Alpha, the hands occupy the points across from each other.", sheet: { x: 75.9, y: aDescY, w: 454.5, h: 18, align: "center" } },

  { kind: "glyphImage", src: "/images/letters_trimmed/Type6/β.svg", alt: "Beta (β)", heightPt: GLYPH_H, sheet: { x: 304, y: bGlyphY } },
  { kind: "heading", level: 2, text: "Beta", sheet: { x: 283.9, y: bHeadY, w: 42.4, h: 22, align: "center" } },
  { kind: "prose", html: "In Beta, the hands occupy the same point.", sheet: { x: 150.1, y: bDescY, w: 308.2, h: 18, align: "center" } },

  { kind: "glyphImage", src: "/images/letters_trimmed/Type6/γ.svg", alt: "Gamma (γ)", heightPt: GLYPH_H, sheet: { x: 304, y: gGlyphY } },
  { kind: "heading", level: 2, text: "Gamma", sheet: { x: 269.3, y: gHeadY, w: 71.5, h: 22, align: "center" } },
  { kind: "prose", html: "In Gamma, the hands form a right angle.", sheet: { x: 154.1, y: gDescY, w: 301.9, h: 18, align: "center" } },

  { kind: "pictographGroup", items: positions, grid, flowCols: 4, caption: "The sixteen canonical hand positions." },

  { kind: "rule", sheet: { x: 64.4, y: DIVIDERS[0]!, w: 491.6 } },
  { kind: "rule", sheet: { x: 64.4, y: DIVIDERS[1]!, w: 491.6 } },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "src/routes/(public)/guide/level-1/_data/content/hand-positions.content.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(public)/guide/level-1/_data/content/hand-positions.content.ts" "src/routes/(public)/guide/level-1/_data/content/hand-positions.content.test.ts"
git commit -m "feat(guide): hand-positions single-source content (verbatim prose + geometry)" -- "src/routes/(public)/guide/level-1/_data/content/hand-positions.content.ts" "src/routes/(public)/guide/level-1/_data/content/hand-positions.content.test.ts"
```

---

## Task 3: SheetFrame (print-faithful frame)

**Files:**
- Create: `src/routes/(public)/guide/level-1/_components/SheetFrame.svelte`

`SheetFrame` reproduces the sheet by absolute-positioning each block at `block.sheet` × S (S = 816/612). It reads the SAME constants the original page used, so output matches. Prose runs mirror `.para`/`.run` styling from `HandPositionsPage.svelte` (Times serif, centered, the `.cR`/`.cB`/`.lg` span colors). The pictograph group renders `PictographContainer` in HAND/print mode, identical to the original.

- [ ] **Step 1: Write SheetFrame**

Create `src/routes/(public)/guide/level-1/_components/SheetFrame.svelte`:

```svelte
<script lang="ts">
  /**
   * The print-faithful frame. Absolute-positions each GuideBlock at its `sheet`
   * pt hint (× S) over the 816×1056 GuidePage sheet — reproducing the original
   * hand-authored page. The single-source counterpart to FlowFrame; both render
   * the same GuideBlock[]. See the reflow spec.
   */
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { GuideBlock } from "../_data/guide-content-blocks";

  let { content }: { content: GuideBlock[] } = $props();

  const S = 816 / 612; // pt → px (4/3), identical to the original pages
</script>

<div class="sheet-frame">
  {#each content as block, i (i)}
    {#if block.kind === "heading"}
      <div
        class="run sub"
        style:left="{(block.sheet?.x ?? 0) * S}px"
        style:top="{(block.sheet?.y ?? 0) * S}px"
        style:width={block.sheet?.w ? `${block.sheet.w * S}px` : undefined}
        style:font-size="{(block.sheet?.h ?? 22) * S}px"
        style:text-align={block.sheet?.align ?? "center"}
      >{block.text}</div>
    {:else if block.kind === "prose"}
      <p
        class="para"
        style:top="{(block.sheet?.y ?? 0) * S}px"
        style:font-size="{(block.sheet?.fontSize ?? block.sheet?.h ?? 15) * S}px"
        style:line-height="{(block.sheet?.lineHeight ?? block.sheet?.h ?? 18) * S}px"
        style:text-align={block.sheet?.align ?? "center"}
      >{@html block.html}</p>
    {:else if block.kind === "glyphImage"}
      <img
        class="glyph"
        src={block.src}
        alt={block.alt}
        style:left="{((block.sheet?.x ?? 304) - (block.heightPt / 2)) * S}px"
        style:top="{(block.sheet?.y ?? 0) * S}px"
        style:height="{block.heightPt * S}px"
      />
    {:else if block.kind === "rule"}
      <div
        class="rule"
        style:left="{block.sheet.x * S}px"
        style:top="{block.sheet.y * S}px"
        style:width="{(block.sheet.w ?? 0) * S}px"
      ></div>
    {:else if block.kind === "pictographGroup" && block.grid}
      {#each block.items as pos, n (pos.id ?? n)}
        <div
          class="mini"
          style:left="{(block.grid.cols[n % block.grid.cols.length] ?? 0) * S}px"
          style:top="{(block.grid.rows[block.grid.rowFor[n] ?? 0] ?? 0) * S}px"
          style:width="{block.grid.cell * S}px"
          style:height="{block.grid.cell * S}px"
        >
          <PictographContainer
            pictographData={pos}
            gridMode={GridMode.DIAMOND}
            bluePropTypeOverride={PropType.HAND}
            redPropTypeOverride={PropType.HAND}
            showGrid={true}
            showTKA={true}
            showPositions={false}
            showReversals={false}
            showTnD={false}
            showElemental={false}
            showNonRadialPoints={false}
            showHandPoints={true}
            darkMode={false}
            printMode={true}
            disableTransitions={true}
          />
        </div>
      {/each}
    {:else if block.kind === "printOnly"}
      <div
        class="print-only"
        style:left="{block.sheet.x * S}px"
        style:top="{block.sheet.y * S}px"
      >{@html block.sheetHtml}</div>
    {/if}
  {/each}
</div>

<style>
  /* Absolute layer over the whole GuidePage sheet — coords map straight to pt×S.
     Mirrors HandPositionsPage.svelte's .hand-positions/.run/.para/.mini/.glyph/.rule. */
  .sheet-frame {
    position: absolute;
    inset: 0;
    color: #141414;
  }
  .run {
    position: absolute;
    font-family: var(--guide-display);
    line-height: 1;
    white-space: nowrap;
    text-align: center;
  }
  .run.sub {
    font-weight: 600;
  }
  .para {
    position: absolute;
    left: 0;
    right: 0;
    margin: 0;
    text-align: center;
    color: #141414;
    font-family: "Times New Roman", Times, Georgia, serif;
  }
  .para :global(.cR) { color: #cc2127; }
  .para :global(.cB) { color: #2e3192; }
  .para :global(.lg) { display: inline-block; width: 1.6em; }
  .mini {
    position: absolute;
    border: 1px solid #c4c4cc;
    box-sizing: border-box;
  }
  .glyph {
    position: absolute;
    width: auto;
  }
  .rule {
    position: absolute;
    height: 1px;
    background: #bcbcc6;
  }
  .print-only {
    position: absolute;
  }
</style>
```

- [ ] **Step 2: Add a SheetFrame contract line to the reflow test**

In `tests/unit/guide-reflow-contract.test.ts`, add this `describe` block (static source assertion — SheetFrame must keep the pt→px scale + positioned layout):

```ts
describe("SheetFrame", () => {
  const src = read("src/routes/(public)/guide/level-1/_components/SheetFrame.svelte");
  it("keeps the 816/612 pt→px scale and absolute positioning", () => {
    expect(src).toContain("816 / 612");
    expect(src).toContain("position: absolute");
  });
});
```

- [ ] **Step 3: Run the reflow test**

Run: `npx vitest run tests/unit/guide-reflow-contract.test.ts`
Expected: PASS (blockProseText + SheetFrame describes).

- [ ] **Step 4: Commit**

```bash
git add "src/routes/(public)/guide/level-1/_components/SheetFrame.svelte" tests/unit/guide-reflow-contract.test.ts
git commit -m "feat(guide): SheetFrame — print-faithful block renderer" -- "src/routes/(public)/guide/level-1/_components/SheetFrame.svelte" tests/unit/guide-reflow-contract.test.ts
```

---

## Task 4: Rewire HandPositionsPage to render from content (single source)

**Files:**
- Modify: `src/routes/(public)/guide/level-1/_pages/HandPositionsPage.svelte`

The page becomes a thin host over `SheetFrame(handPositionsContent)`. Its BUILT entry (`built-pages.ts`) is unchanged — the component still renders the same sheet, now from the single source. This is the pixel-match gate.

- [ ] **Step 1: Replace the page body**

Replace the ENTIRE contents of `src/routes/(public)/guide/level-1/_pages/HandPositionsPage.svelte` with:

```svelte
<script lang="ts">
  /**
   * Hand Positions — body page 2. Now a thin host: the layout + prose live in the
   * single-source content model (hand-positions.content.ts), rendered here by
   * SheetFrame (print-faithful) and by FlowFrame on the crawlable route. Migrated
   * to single-source per docs/superpowers/specs/2026-07-14-guide-reflow-single-source-design.md
   * (was a bespoke absolute-positioned sheet; the geometry moved into the content).
   */
  import SheetFrame from "../_components/SheetFrame.svelte";
  import { handPositionsContent } from "../_data/content/hand-positions.content";
</script>

<SheetFrame content={handPositionsContent} />
```

- [ ] **Step 2: Verify the sheet still renders (dev server)**

The dev server on :5173 has HMR. Open the reader deep link and confirm the Hand Positions sheet is visually unchanged (16 positions, α/β/γ glyphs, intro, descriptions, 2 hairlines):

Run: `curl -sk https://localhost:5173/learn/guide/hand-positions -o /dev/null -w "%{http_code}\n"`
Expected: `200`.

Visual pixel-match gate (needs Austen's go-ahead for browser use): compare [localhost:5173/learn/guide/hand-positions](https://localhost:5173/learn/guide/hand-positions) against git-stash of the old page, or screenshot-diff. If any block is off, adjust the pt hints in `hand-positions.content.ts` (they are the same constants the original computed, so a mismatch means a copy error).

- [ ] **Step 3: Run the content + reflow tests**

Run: `npx vitest run "src/routes/(public)/guide/level-1/_data/content/hand-positions.content.test.ts" tests/unit/guide-reflow-contract.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/routes/(public)/guide/level-1/_pages/HandPositionsPage.svelte"
git commit -m "refactor(guide): HandPositionsPage renders from single-source content via SheetFrame" -- "src/routes/(public)/guide/level-1/_pages/HandPositionsPage.svelte"
```

---

## Task 5: FlowFrame (mobile-first, crawlable frame)

**Files:**
- Create: `src/routes/(public)/guide/level-1/_components/FlowFrame.svelte`

`FlowFrame` stacks blocks down a theme-aware editorial column. Pictographs render via `GuidePictograph` (`eager` so prerender/hydration draws them; its synchronous `describePictograph` label lands in SSR HTML → crawlable). Reserved `aspect-ratio:1` box (already in `GuidePictograph`) = no layout shift.

- [ ] **Step 1: Write FlowFrame**

Create `src/routes/(public)/guide/level-1/_components/FlowFrame.svelte`:

```svelte
<script lang="ts">
  /**
   * The reflow frame: stacks GuideBlocks in reading order down a mobile-first,
   * theme-aware editorial column. Ignores the `sheet` pt hints. Rendered inside
   * the reader (flow toggle) AND on the prerendered /guide/level-1/<slug> route
   * (crawlable). Pictographs render eagerly via GuidePictograph, whose synchronous
   * describePictograph aria-label lands in SSR HTML. One source with SheetFrame.
   */
  import GuidePictograph from "./GuidePictograph.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { GuideBlock } from "../_data/guide-content-blocks";

  let { content }: { content: GuideBlock[] } = $props();
</script>

<div class="flow-frame">
  {#each content as block, i (i)}
    {#if block.kind === "heading"}
      {#if block.level === 1}
        <h2 class="flow-h2">{block.text}</h2>
      {:else}
        <h3 class="flow-h3">{block.text}</h3>
      {/if}
    {:else if block.kind === "prose"}
      <p class="flow-p">{@html block.html}</p>
    {:else if block.kind === "glyphImage"}
      <img class="flow-glyph" src={block.src} alt={block.alt} height={block.heightPt * 2} />
    {:else if block.kind === "pictograph"}
      <figure class="flow-figure">
        <GuidePictograph data={block.data} size="md" eager propType={PropType.HAND} />
        {#if block.caption}<figcaption>{block.caption}</figcaption>{/if}
      </figure>
    {:else if block.kind === "pictographGroup"}
      <div class="flow-grid" style:--cols={block.flowCols ?? 4}>
        {#each block.items as pos, n (pos.id ?? n)}
          <GuidePictograph data={pos} size="sm" eager propType={PropType.HAND} />
        {/each}
      </div>
      {#if block.caption}<p class="flow-caption">{block.caption}</p>{/if}
    {:else if block.kind === "printOnly"}
      {#each block.flow as fb, m (m)}
        {#if fb.kind === "prose"}<p class="flow-p">{@html fb.html}</p>{/if}
        {#if fb.kind === "heading"}<h3 class="flow-h3">{fb.text}</h3>{/if}
      {/each}
    {/if}
    <!-- rule blocks are print-only chrome; the flow column uses spacing, not hairlines -->
  {/each}
</div>

<style>
  .flow-frame {
    max-width: 46rem;
    margin: 0 auto;
    padding: 1.5rem 1.25rem 4rem;
    color: var(--theme-text, #1a1a1a);
    font-family: var(--font-body, system-ui, sans-serif);
    line-height: 1.6;
  }
  .flow-h2 {
    font-size: clamp(1.6rem, 4vw, 2.2rem);
    margin: 2rem 0 0.75rem;
    font-weight: 700;
  }
  .flow-h3 {
    font-size: clamp(1.25rem, 3vw, 1.5rem);
    margin: 1.75rem 0 0.5rem;
    font-weight: 650;
  }
  .flow-p {
    margin: 0 0 1rem;
    font-size: 1.05rem;
  }
  .flow-p :global(.cR) { color: #cc2127; font-weight: 700; }
  .flow-p :global(.cB) { color: #2e3192; font-weight: 700; }
  .flow-glyph {
    display: block;
    margin: 1.5rem auto 0.25rem;
    height: auto;
    width: auto;
  }
  .flow-grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    gap: 0.75rem;
    margin: 1rem 0;
  }
  @media (max-width: 520px) {
    .flow-grid { grid-template-columns: repeat(2, 1fr); }
  }
  .flow-figure {
    margin: 1.25rem 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
  .flow-figure figcaption,
  .flow-caption {
    font-size: 0.9rem;
    color: var(--theme-text-dim, #555);
    text-align: center;
  }
</style>
```

- [ ] **Step 2: Add a FlowFrame contract line**

In `tests/unit/guide-reflow-contract.test.ts`, add:

```ts
describe("FlowFrame", () => {
  const src = read("src/routes/(public)/guide/level-1/_components/FlowFrame.svelte");
  it("renders semantic headings + prose and uses GuidePictograph for figures", () => {
    expect(src).toContain("GuidePictograph");
    expect(src).toMatch(/<h2|<h3/);
    expect(src).not.toContain("position: absolute");
  });
});
```

- [ ] **Step 3: Run the reflow test**

Run: `npx vitest run tests/unit/guide-reflow-contract.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/routes/(public)/guide/level-1/_components/FlowFrame.svelte" tests/unit/guide-reflow-contract.test.ts
git commit -m "feat(guide): FlowFrame — mobile-first crawlable block renderer" -- "src/routes/(public)/guide/level-1/_components/FlowFrame.svelte" tests/unit/guide-reflow-contract.test.ts
```

---

## Task 6: The content registry

**Files:**
- Create: `src/routes/(public)/guide/level-1/_data/guide-content.ts`

- [ ] **Step 1: Write the registry**

Create `src/routes/(public)/guide/level-1/_data/guide-content.ts`:

```ts
/**
 * Single-source content per migrated guide page, keyed by manifest id (mirrors
 * built-pages.ts). FlowFrame + the crawlable routes look up a page's GuideBlock[]
 * here; the reader's flow toggle only reflows slugs present in this map. Add an
 * entry as each page is migrated to the single-source model.
 */
import type { GuideBlock } from "./guide-content-blocks";
import { handPositionsContent } from "./content/hand-positions.content";

export const GUIDE_CONTENT: Record<string, GuideBlock[]> = {
  "hand-positions": handPositionsContent,
};

/** Whether a manifest id has a reflowable single-source content array. */
export function hasReflowContent(id: string): boolean {
  return id in GUIDE_CONTENT;
}
```

- [ ] **Step 2: Add a registry contract line**

In `tests/unit/guide-reflow-contract.test.ts`, add:

```ts
describe("GUIDE_CONTENT registry", () => {
  it("registers hand-positions", async () => {
    const { GUIDE_CONTENT, hasReflowContent } = await import(
      "../../src/routes/(public)/guide/level-1/_data/guide-content"
    );
    expect(hasReflowContent("hand-positions")).toBe(true);
    expect(GUIDE_CONTENT["hand-positions"]!.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run tests/unit/guide-reflow-contract.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/routes/(public)/guide/level-1/_data/guide-content.ts" tests/unit/guide-reflow-contract.test.ts
git commit -m "feat(guide): GUIDE_CONTENT slug→blocks registry" -- "src/routes/(public)/guide/level-1/_data/guide-content.ts" tests/unit/guide-reflow-contract.test.ts
```

---

## Task 7: Frame pref store + reader toggle

**Files:**
- Create: `src/routes/(public)/guide/level-1/_data/guide-frame-prefs.svelte.ts`
- Modify: `src/routes/(public)/guide/level-1/_components/GuideDocument.svelte`
- Modify: `src/routes/(public)/guide/level-1/_components/GuideReader.svelte`

- [ ] **Step 1: Write the persisted pref store**

Create `src/routes/(public)/guide/level-1/_data/guide-frame-prefs.svelte.ts`:

```ts
/**
 * Reactive singleton for the guide reader's frame mode (sheet vs flow), persisted
 * per-user. Mirrors page-number-prefs.svelte.ts, plus localStorage round-trip.
 * Default: sheet (print-faithful) on first load; the reader nudges to flow on
 * mobile. SSR-safe (guards window/localStorage).
 */
export type GuideFrame = "sheet" | "flow";

const KEY = "guide-frame-mode";

function initial(): GuideFrame {
  if (typeof window === "undefined") return "sheet";
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "flow" || v === "sheet" ? v : "sheet";
  } catch {
    return "sheet";
  }
}

export const guideFramePrefs = $state<{ frame: GuideFrame }>({ frame: initial() });

export function setGuideFrame(frame: GuideFrame): void {
  guideFramePrefs.frame = frame;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, frame);
  } catch {
    // private mode / disabled — the choice just won't persist
  }
}
```

- [ ] **Step 2: Route GuideDocument body content through the active frame**

In `src/routes/(public)/guide/level-1/_components/GuideDocument.svelte`:

Add to the imports (after line 20, the `guide-edit` import):

```ts
  import FlowFrame from "./FlowFrame.svelte";
  import { GUIDE_CONTENT } from "../_data/guide-content";
```

Add a `frame` prop. Change the `$props()` block (lines 22–31) to:

```ts
  let {
    page,
    coverTheme = "navy",
    built = {},
    frame = "sheet",
  }: {
    page: Snippet<[GuidePageMeta]>;
    coverTheme?: "navy" | "light";
    /** Built per-page components keyed by manifest id; rest render a placeholder. */
    built?: Record<string, Component>;
    /** Which frame the body pages render in. Flow only affects slugs in GUIDE_CONTENT. */
    frame?: "sheet" | "flow";
  } = $props();
```

Change the `bodyContent` snippet (lines 192–197) to prefer the flow frame when active and available:

```svelte
  {#snippet bodyContent()}
    {@const Built = built[entry.id]}
    {@const reflow = GUIDE_CONTENT[entry.id]}
    {#if frame === "flow" && reflow}<FlowFrame content={reflow} />
    {:else if Built}<Built />
    {:else if PROOF_TEXT[entry.id]}<ProofTextPage id={entry.id} />
    {:else}<PagePlaceholder />{/if}
  {/snippet}
```

- [ ] **Step 3: Add the toggle to GuideReader**

In `src/routes/(public)/guide/level-1/_components/GuideReader.svelte`:

Add imports (after the `built-pages` import, line 48):

```ts
  import SegmentedControl from "$lib/shared/3d/components/controls/SegmentedControl.svelte";
  import { guideFramePrefs, setGuideFrame, type GuideFrame } from "../_data/guide-frame-prefs.svelte";
  import { hasReflowContent } from "../_data/guide-content";
```

Nudge to flow on mobile the first time (add after the `isMobile` onMount block, around line 491). Only auto-switch if the user hasn't explicitly chosen — track with a flag:

```ts
  // First mobile load defaults to the reflow frame (print sheets are mobile-
  // hostile); once the user toggles, respect their choice. Desktop stays sheet.
  let userPickedFrame = $state(false);
  $effect(() => {
    if (!userPickedFrame && isMobile && guideFramePrefs.frame === "sheet") {
      setGuideFrame("flow");
    }
  });
```

Pass `frame` to `GuideDocument` — change line 529:

```svelte
      <GuideDocument built={BUILT} page={sheetFrame} frame={guideFramePrefs.frame} />
```

Add the toggle control into the stage, just inside `.reader-stage` before `.reader-doc` (line 520–521). Only show it when the active page actually has a reflow view:

```svelte
  <div class="reader-stage" bind:this={stageEl}>
    {#if hasReflowContent(GUIDE_BODY_PAGES[activeIndex - FRONT_MATTER_COUNT]?.id ?? "")}
      <div class="frame-toggle">
        <SegmentedControl
          options={[
            { value: "sheet", label: "Page" },
            { value: "flow", label: "Reflow" },
          ]}
          value={guideFramePrefs.frame}
          onchange={(v: GuideFrame) => { userPickedFrame = true; setGuideFrame(v); }}
          size="sm"
          color="accent"
        />
      </div>
    {/if}
    <div
      class="reader-doc"
```

Add the toggle's styling to the `<style>` block (after `.reader-stage`, line 583):

```css
  .frame-toggle {
    display: flex;
    justify-content: center;
    padding: 8px 0 0;
  }
```

- [ ] **Step 4: Add pref-store + wiring contract lines**

In `tests/unit/guide-reflow-contract.test.ts`, add:

```ts
describe("frame toggle wiring", () => {
  it("GuideDocument routes flow frame via GUIDE_CONTENT", () => {
    const src = read("src/routes/(public)/guide/level-1/_components/GuideDocument.svelte");
    expect(src).toContain("FlowFrame");
    expect(src).toContain('frame === "flow"');
  });
  it("GuideReader renders the sheet/flow SegmentedControl", () => {
    const src = read("src/routes/(public)/guide/level-1/_components/GuideReader.svelte");
    expect(src).toContain("SegmentedControl");
    expect(src).toContain("guideFramePrefs.frame");
  });
});
```

- [ ] **Step 5: Run tests + typecheck the touched files**

Run: `npx vitest run tests/unit/guide-reflow-contract.test.ts`
Expected: PASS.
Run: `npm run check:fast`
Expected: no new errors in the guide files.

- [ ] **Step 6: Commit**

```bash
git add "src/routes/(public)/guide/level-1/_data/guide-frame-prefs.svelte.ts" "src/routes/(public)/guide/level-1/_components/GuideDocument.svelte" "src/routes/(public)/guide/level-1/_components/GuideReader.svelte" tests/unit/guide-reflow-contract.test.ts
git commit -m "feat(guide): reader sheet/flow toggle + persisted frame pref" -- "src/routes/(public)/guide/level-1/_data/guide-frame-prefs.svelte.ts" "src/routes/(public)/guide/level-1/_components/GuideDocument.svelte" "src/routes/(public)/guide/level-1/_components/GuideReader.svelte" tests/unit/guide-reflow-contract.test.ts
```

---

## Task 8: The prerendered crawl route

**Files:**
- Create: `src/routes/(public)/guide/level-1/hand-positions/+page.svelte`
- Create: `src/routes/(public)/guide/level-1/hand-positions/+page.ts`

Clones the `guide/level-2/turns` pattern: `GuideSeo` + `<h1>` + `FlowFrame(content)`. `setGuidePrintMode()` is NOT called — this route is ink-on-theme editorial, not print. First guard against a route collision.

- [ ] **Step 1: Confirm no catch-all collision under guide/level-1**

Run: `ls "src/routes/(public)/guide/level-1/"` and confirm there is no `[...` or `[slug]` directory (only named subroutes like `print`, `book`). A static `hand-positions/` dir is collision-safe.
Expected: no dynamic param directory listed.

- [ ] **Step 2: Write the prerender flag**

Create `src/routes/(public)/guide/level-1/hand-positions/+page.ts`:

```ts
export const prerender = true;
```

- [ ] **Step 3: Write the crawl host**

Create `src/routes/(public)/guide/level-1/hand-positions/+page.svelte`:

```svelte
<script lang="ts">
  /**
   * Crawlable reflow host for the Hand Positions guide page. Prerendered static
   * HTML: GuideSeo (canonical → tkaflowarts.com, LearningResource + Breadcrumb
   * JSON-LD) + <h1> + FlowFrame over the SAME single-source content the reader's
   * flow toggle uses (guide-content.ts). Austen's prose ranks; pictographs hydrate
   * into their reserved boxes. One content model, two hosts — the reader is the
   * app, this is the SEO surface. Spec: 2026-07-14-guide-reflow-single-source-design.md.
   */
  import GuideSeo from "../_components/GuideSeo.svelte";
  import FlowFrame from "../_components/FlowFrame.svelte";
  import { GUIDE_CONTENT } from "../_data/guide-content";
  import "../_styles/guide.css";

  const content = GUIDE_CONTENT["hand-positions"]!;
</script>

<GuideSeo
  title="Flow Arts Positions: Alpha, Beta, Gamma · The Kinetic Alphabet"
  description="The three starting hand positions in The Kinetic Alphabet notation. In Alpha the hands occupy the points across from each other; in Beta the same point; in Gamma they form a right angle."
  path="/guide/level-1/hand-positions"
  kind="LearningResource"
  partOf={{ name: "Level 1 Guide", path: "/guide" }}
  breadcrumbs={[
    { name: "Home", path: "/" },
    { name: "Guide", path: "/guide" },
    { name: "Hand Positions", path: "/guide/level-1/hand-positions" },
  ]}
/>

<main class="guide-flow-route">
  <h1>Flow Arts Positions: Alpha, Beta, Gamma</h1>
  <FlowFrame {content} />
</main>

<style>
  .guide-flow-route {
    min-height: 100vh;
    background: var(--theme-bg, #fff);
    color: var(--theme-text, #1a1a1a);
  }
  .guide-flow-route h1 {
    max-width: 46rem;
    margin: 0 auto;
    padding: 2rem 1.25rem 0;
    font-size: clamp(1.9rem, 5vw, 2.8rem);
    font-weight: 750;
    line-height: 1.1;
  }
</style>
```

- [ ] **Step 4: Verify it prerenders with h1 + prose**

Run: `npm run build:fast 2>&1 | grep -iE "hand-positions|prerender" | head`
Expected: the build lists `/guide/level-1/hand-positions` among prerendered pages (no prerender error).

Then confirm the emitted HTML carries the crawlable text:

Run: `grep -io "In Alpha, the hands occupy the points across from each other" .svelte-kit/output/prerendered/pages/guide/level-1/hand-positions.html | head -1`
Expected: the sentence prints (Austen's prose is in the static HTML).

- [ ] **Step 5: Commit**

```bash
git add "src/routes/(public)/guide/level-1/hand-positions/+page.svelte" "src/routes/(public)/guide/level-1/hand-positions/+page.ts"
git commit -m "feat(guide): prerendered /guide/level-1/hand-positions crawl route" -- "src/routes/(public)/guide/level-1/hand-positions/+page.svelte" "src/routes/(public)/guide/level-1/hand-positions/+page.ts"
```

---

## Task 9: Sitemap + hub link

**Files:**
- Modify: `src/routes/sitemap.xml/+server.ts`
- Modify: `src/routes/(public)/guide/+page.svelte`

- [ ] **Step 1: Add the route to the sitemap**

In `src/routes/sitemap.xml/+server.ts`, replace the comment block at lines 24–26 (the "Level 1 lives in the in-app reader…" note) and add the entry after the `{ url: "guide", … }` line:

```ts
  { url: "guide", priority: "0.7", changefreq: "monthly" },
  // Level-1 crawlable reflow routes (the reader at /learn/guide is ssr=false;
  // these prerendered /guide/level-1/<slug> pages are the SEO canonical — one
  // content model, FlowFrame host. See 2026-07-14-guide-reflow-single-source-design.md).
  { url: "guide/level-1/hand-positions", priority: "0.7", changefreq: "monthly" },
```

- [ ] **Step 2: Add a sitemap contract line**

In `tests/unit/guide-reflow-contract.test.ts`, add:

```ts
describe("sitemap", () => {
  it("lists the crawlable hand-positions route", () => {
    const src = read("src/routes/sitemap.xml/+server.ts");
    expect(src).toContain("guide/level-1/hand-positions");
  });
});
```

- [ ] **Step 3: Link the route from the guide hub**

In `src/routes/(public)/guide/+page.svelte`, find the "Available now" section (grep for `Available now` in that file) and add a link to the new route alongside the existing entries, using the existing card/link markup pattern in that section. Match the surrounding markup exactly — read the file first and mirror an existing "Available now" entry, changing the href to `/guide/level-1/hand-positions` and the label to "Flow Arts Positions: Alpha, Beta, Gamma".

- [ ] **Step 4: Run the reflow test**

Run: `npx vitest run tests/unit/guide-reflow-contract.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/sitemap.xml/+server.ts "src/routes/(public)/guide/+page.svelte" tests/unit/guide-reflow-contract.test.ts
git commit -m "feat(guide): sitemap + hub link for the hand-positions reflow route" -- src/routes/sitemap.xml/+server.ts "src/routes/(public)/guide/+page.svelte" tests/unit/guide-reflow-contract.test.ts
```

---

## Task 10: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Run the full guide-reflow + content test suite**

Run: `npx vitest run tests/unit/guide-reflow-contract.test.ts "src/routes/(public)/guide/level-1/_data/content/hand-positions.content.test.ts"`
Expected: ALL PASS.

- [ ] **Step 2: Full typecheck (capture once, grep)**

Run: `npm run check > /tmp/check.log 2>&1; grep -niE "error" /tmp/check.log | head -40`
Expected: no errors referencing the new/edited guide files. Fix any, re-run once.

- [ ] **Step 3: Full build**

Run: `npm run build 2>&1 | tail -20`
Expected: build succeeds; `/guide/level-1/hand-positions` prerendered.

- [ ] **Step 4: Confirm the reader still works both frames (dev server)**

Run: `curl -sk https://localhost:5173/learn/guide/hand-positions -o /dev/null -w "%{http_code}\n"`
Expected: `200`. Ask Austen to flip the Page/Reflow toggle on [localhost:5173/learn/guide/hand-positions](https://localhost:5173/learn/guide/hand-positions) and confirm the sheet is pixel-unchanged and the reflow reads top-to-bottom.

- [ ] **Step 5: Final commit (if any check fixes were needed)**

```bash
git add <only the files you fixed>
git commit -m "fix(guide): typecheck/build fixes for the reflow machine" -- <files>
```

---

## Task 11: Follow-on rollout template (documentation only — no code this plan)

**Files:**
- Modify: `docs/superpowers/plans/2026-07-14-guide-reflow-single-source.md` (this file) — append the checklist below.

For each remaining Level-1 page, the migration is the SAME machine:

- [ ] Append this repeatable per-page checklist to the plan and mark `hand-positions` done:

```markdown
### Per-page migration checklist (repeat for each slug)

- [x] hand-positions
- [ ] the-grid
- [ ] hand-motions
- [ ] hm-type1
- [ ] hm-gamma
- [ ] hm-type2
- [ ] hm-type34   (bespoke: flattened raster + measured vector row → use `printOnly` blocks)
- [ ] hm-type56   (bespoke, self-titled)
- [ ] staff-positions
- [ ] staff-motions
- [ ] negative-space
- [ ] (then clusters 1.1 + 1.2)

For each: (1) create `_data/content/<slug>.content.ts` lifting the page's verbatim
`editText`/`RUNS` prose + pictograph data + pt hints; (2) register it in
`guide-content.ts`; (3) rewire the `_pages/<Page>.svelte` to `<SheetFrame content=…/>`;
(4) pixel-verify the sheet; (5) add a `_data/content/<slug>.content.test.ts` verbatim
check; (6) create `guide/level-1/<slug>/+page.{svelte,ts}` (clone hand-positions);
(7) add the slug to the sitemap + hub link; (8) run the reflow + content tests.
```

- [ ] **Commit**

```bash
git add docs/superpowers/plans/2026-07-14-guide-reflow-single-source.md
git commit -m "docs(guide): reflow rollout template + hand-positions marked done" -- docs/superpowers/plans/2026-07-14-guide-reflow-single-source.md
```

---

## Self-Review

**Spec coverage:**
- §4.1 content model → Task 1 (`GuideBlock`), Task 2 (`hand-positions` content). ✔
- §4.2 two frames → Task 3 (SheetFrame), Task 5 (FlowFrame). ✔
- §4.3 frame seam → Task 7 (GuideDocument `frame` prop at the `sheetFrame` seam path). ✔
- §4.4 toggle → Task 7 (SegmentedControl + `guide-frame-prefs`, mobile nudge, reduced-motion inherited from SegmentedControl/reader). ✔
- §4.5 / §5 crawl route → Task 8 (prerendered route), Task 9 (sitemap + hub, canonical via GuideSeo). ✔
- §6 migration → Task 4 (hand-positions rewired + pixel gate), Task 11 (rollout template). ✔
- §7 guardrails → Task 1 (`blockProseText` drift-guard), `guide-reflow-contract.test.ts` (Tasks 3/5/6/7/9), Task 2 (verbatim prose test), Task 8 (crawl HTML assertion). ✔
- §8 scope = machine + hand-positions → Tasks 1–10; remainder → Task 11. ✔

**Placeholder scan:** No TBD/TODO; every code step shows full code; edit steps cite exact insertion points against the read line numbers.

**Type consistency:** `GuideBlock`/`PtHint`/`SheetGrid` defined in Task 1 and used verbatim in Tasks 2/3/5/6. `GUIDE_CONTENT` + `hasReflowContent` defined in Task 6, used in Tasks 7/8. `guideFramePrefs`/`setGuideFrame`/`GuideFrame` defined in Task 7, used in the same task's GuideReader edits. `handPositionsContent` defined Task 2, consumed Tasks 4/6. Frame prop values `"sheet"|"flow"` consistent across Tasks 7 (GuideDocument, pref store) and the reader.

**Note (§9.4 open question):** `hand-positions` migrates without any `printOnly` block — it decomposes cleanly into prose/heading/glyphImage/rule/pictographGroup. The `printOnly` escape hatch is defined now (Task 1) and first exercised by `hm-type34` in the Task 11 rollout.

---

## Rollout Tracker (per-page migration through the same machine)

The machine (Tasks 1–10) is shipped. Each remaining page is: (1) create
`_data/content/<slug>.content.ts` lifting the page's verbatim `editText`/`RUNS`
prose + pictograph data + pt hints; (2) register in `guide-content.ts`; (3) rewire
`_pages/<Page>.svelte` to `<SheetFrame content=…/>`; (4) pixel-verify the sheet;
(5) add `_data/content/<slug>.content.test.ts`; (6) create
`guide/level-1/<slug>/+page.{svelte,ts}` (clone `hand-positions`); (7) add the slug
to the sitemap + hub; (8) run the reflow + content tests.

- [x] hand-positions — SHIPPED 2026-07-14 (machine proof; build exit 0, prerender verified)
- [ ] the-grid
- [ ] hand-motions
- [ ] hm-type1
- [ ] hm-gamma
- [ ] hm-type2
- [ ] hm-type34   (bespoke: flattened raster + measured vector row → `printOnly` blocks)
- [ ] hm-type56   (bespoke, self-titled)
- [ ] staff-positions
- [ ] staff-motions
- [ ] negative-space
- [ ] (then clusters 1.1 + 1.2)
