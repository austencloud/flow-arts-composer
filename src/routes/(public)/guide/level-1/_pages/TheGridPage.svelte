<script lang="ts">
  /**
   * The Grid - body page 1, a faithful reproduction of the original proof PDF
   * (level-1-v05.pdf, page 7). Layout is DATA-DRIVEN from the PDF's own text-box
   * coordinates: every text run was extracted with its (x, y, w) in PDF points
   * (612×792pt page) and placed here at the exact same spot.
   *
   * The sheet is 816×1056px (8.5×11in @96dpi), so 1pt = 4/3px. The root is an
   * absolute layer over the whole GuidePage, so coordinates map straight to the
   * sheet - text lands where Austen intentionally placed it. The page renders
   * fullBleed (no GuidePage header), so the title is just another positioned run.
   *
   * Grids reuse the canonical renderer (GridSvg) forced to light mode
   * (darkMode={false}) so points print black on white; the two hands reuse the
   * canonical prop hand path, placed on the diamond's W/E hand points.
   */
  import GridSvg from "$lib/shared/pictograph/grid/components/GridSvg.svelte";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { THE_GRID_ALPHA3 } from "../_data/the-grid-pictograph";
  import {
    guideEdit,
    ptDrag,
    pt,
    editText,
    registerEditSource,
  } from "../_data/guide-edit.svelte";

  const S = 816 / 612; // pt → px (4/3)

  // The labelled diagram's two hands ARE a real pictograph: ALPHA3 (left hand at
  // West, red hand at East) rendered with the prop forced to HAND, so the hand
  // size and the red right-hand mirror come from the canonical renderer instead
  // of a hand-rolled SVG path.
  type Run = {
    x: number;
    y: number;
    w: number;
    h: number;
    t: string;
    b?: boolean;
    s?: boolean;
    title?: boolean;
    op?: boolean;
  };

  // Intro: the four proof lines merged into ONE centred block that moves as a
  // unit. Double <br> reproduces the proof's blank-line gaps; the diamond/box
  // line stays bold.
  let intro = $state({
    x: 0,
    y: 78.2,
    fs: 16,
    lh: 19.2,
    html:
      "The Kinetic Alphabet is based on a 4-point grid.<br><br>" +
      "There are two 4-point grids: box mode and diamond mode.<br>" +
      "<strong>This guide is written in diamond, but everything translates to box.</strong><br><br>" +
      "On this grid, there are three types of points:",
  });

  // RUNS = diagram callout labels, section headings, operators, footer. The intro
  // block lives in `intro`; the left point descriptions in PARAS.
  // b = bold, s = script heading, title = page title.
  let RUNS: Run[] = $state([
    // Diagram callout labels
    { x: 432.4, y: 279.9, w: 28.1, h: 13, t: "hand" },
    { x: 428.9, y: 295.5, w: 35.1, h: 13, t: "points" },
    { x: 386.3, y: 390.8, w: 35.4, h: 13, t: "center" },
    { x: 389.3, y: 406.5, w: 29.5, h: 13, t: "point" },
    { x: 512.1, y: 421.8, w: 30.2, h: 13, t: "outer" },
    { x: 509.6, y: 437.4, w: 35.1, h: 13, t: "points" },

    // Centered transition line
    {
      x: 130.2,
      y: 524.0,
      w: 351.5,
      h: 17,
      t: "Together, diamond and box form an 8-point grid:",
    },

    // Grid section headings (script font)
    { x: 82.7, y: 556.8, w: 65.6, h: 20, s: true, t: "Diamond" },
    { x: 287.7, y: 556.8, w: 28.4, h: 20, s: true, t: "Box" },
    { x: 452.8, y: 556.8, w: 83.6, h: 20, s: true, t: "8-point grid" },

    // Operators between the bottom minis: Diamond + Box = 8-point grid.
    // Centred in the gaps (minis at x 35.5 / 225 / 414.5) on the mini mid-line.
    { x: 190, y: 650, w: 40, h: 34, op: true, t: "+" },
    { x: 379.5, y: 650, w: 40, h: 34, op: true, t: "=" },

    // Footer line
    {
      x: 116.5,
      y: 760.9,
      w: 379.0,
      h: 19,
      t: "We’ll use diamond mode to learn each concept.",
    },
  ]);

  // The three point descriptions as SINGLE selectable text blocks (bold term
  // inline, explicit line breaks) - not per-word runs that fragment + gap when
  // selected. Positioned at the proof's first-line origin; lh = proof line pitch.
  // The three point descriptions as ONE selectable block (was three separate
  // blocks) - a blank line separates each, bold term inline.
  let PARAS = $state([
    {
      x: 30.7,
      y: 239.1,
      w: 255,
      lh: 20.4,
      html:
        "The <strong>center point</strong> is the hub that<br>everything revolves around.<br><br>" +
        "The four <strong>hand points</strong> are halfway<br>between the center point and the<br>outer points.<br><br>" +
        "The <strong>outer points</strong> depict the outer<br>edges of the grid.",
    },
  ]);

  // Callout arrows as data (tail x1,y1 → head x2,y2, pt). Rendered as paths;
  // editable via drag handles in ?edit mode. Replaces the hardcoded path d=.
  let ARROWS = $state([
    { id: "hand-L", x1: 444, y1: 310, x2: 410.4, y2: 337.2 },
    { id: "hand-R", x1: 449, y1: 310, x2: 479.6, y2: 337.3 },
    { id: "center", x1: 415, y1: 390, x2: 439, y2: 368 },
    { id: "outer-E", x1: 518, y1: 420, x2: 532, y2: 377 },
    { id: "outer-S", x1: 505, y1: 443, x2: 462, y2: 450 },
  ]);

  // Edit mode: dump current coords for CoordsPanel's Copy button.
  const r1 = (n: number) => Math.round(n * 10) / 10;
  function dumpCoords(): string {
    const A = ARROWS.map(
      (a) =>
        `  { id: "${a.id}", x1: ${r1(a.x1)}, y1: ${r1(a.y1)}, x2: ${r1(a.x2)}, y2: ${r1(a.y2)} },`
    ).join("\n");
    const P = PARAS.map(
      (p, i) => `  para[${i}]: x: ${r1(p.x)}, y: ${r1(p.y)}`
    ).join("\n");
    const R = RUNS.map(
      (r) =>
        `  ${JSON.stringify(r.t).slice(0, 30)}: x: ${r1(r.x)}, y: ${r1(r.y)}`
    ).join("\n");
    const I = `  intro: x: ${r1(intro.x)}, y: ${r1(intro.y)}`;
    return `INTRO\n${I}\n\nARROWS\n${A}\n\nPARAS\n${P}\n\nRUNS\n${R}`;
  }
  $effect(() => registerEditSource("The Grid (p1)", dumpCoords));

  // Central diagram box (pt, square so the grid stays round) + bottom grid boxes.
  // Measured off the proof: the figure's center lands at (444.3, 360.8)pt with an
  // outer-point radius of 94.75pt, i.e. a 300pt-square 950-viewBox fit at this
  // origin. Matching it puts every grid dot exactly where the proof's are, so the
  // straight callout arrows below line up with the real pictograph's points.
  const DIAG = { x: 294.3, y: 210.8, w: 300, h: 300 };
  // Bottom minis measured off the proof: 159.5pt squares at x 35.5 / 225 / 414.5,
  // top y589 (bottom 748.5, ~12pt above the footer - the proof's tight, even gap).
  const MINI = { y: 589, w: 159.5, h: 159.5 };
  const minis: { x: number; type: "diamond" | "box" | "merged" }[] = [
    { x: 35.5, type: "diamond" },
    { x: 225, type: "box" },
    { x: 414.5, type: "merged" },
  ];
</script>

<!-- A square grid figure: white sheet + canonical GridSvg forced to ink (light
     mode). `hands` overlays the two prop hands on the diamond's W/E hand points. -->
{#snippet figure(type: "diamond" | "box" | "merged")}
  {@const gridLabel =
    type === "diamond"
      ? "Diamond grid: four points at north, east, south, and west"
      : type === "box"
        ? "Box grid: four points on the diagonals"
        : "8-point grid: diamond and box combined"}
  <svg class="fig" viewBox="0 0 950 950" role="img" aria-label={gridLabel}>
    <desc>{gridLabel}</desc>
    <rect width="950" height="950" fill="#ffffff" />
    {#if type === "merged"}
      <GridSvg gridMode={GridMode.DIAMOND} darkMode={false} />
      <GridSvg gridMode={GridMode.BOX} darkMode={false} />
    {:else}
      <GridSvg
        gridMode={type === "box" ? GridMode.BOX : GridMode.DIAMOND}
        darkMode={false}
      />
    {/if}
  </svg>
{/snippet}

<div class="grid-page">
  <!-- Figures first so their white sheets sit BENEATH the text + arrows. -->
  <div
    class="diagram"
    style="left:{DIAG.x * S}px; top:{DIAG.y * S}px; width:{DIAG.w *
      S}px; height:{DIAG.h * S}px"
  >
    {#if THE_GRID_ALPHA3}
      <PictographContainer
        pictographData={THE_GRID_ALPHA3}
        gridMode={GridMode.DIAMOND}
        leftPropTypeOverride={PropType.HAND}
        rightPropTypeOverride={PropType.HAND}
        showGrid={true}
        showTKA={false}
        showPlacements={false}
        showReversals={false}
        showTnD={false}
        showElemental={false}
        showNonRadialPoints={false}
        showHandPoints={true}
        darkMode={false}
        printMode={true}
        disableTransitions={true}
      />
    {/if}
  </div>

  {#each minis as m}
    <div
      class="mini"
      style="left:{m.x * S}px; top:{MINI.y * S}px; width:{MINI.w *
        S}px; height:{MINI.h * S}px"
    >
      {@render figure(m.type)}
    </div>
  {/each}

  <!-- Intro: one centred, movable block (was four separate runs). -->
  <p
    class="intro"
    class:edit={guideEdit.on}
    class:selected={guideEdit.selectedId === `grid-intro`}
    style="top:{intro.y * S}px; font-size:{intro.fs *
      S}px; line-height:{intro.lh * S}px"
    use:ptDrag={pt(`grid-intro`, "intro", intro)}
  >
    {@html intro.html}
  </p>

  {#each RUNS as r, i (i)}
    <span
      class="run"
      class:b={r.b}
      class:s={r.s}
      class:t={r.title}
      class:op={r.op}
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `grid-run-${i}`}
      style="left:{r.x * S}px; top:{r.y * S}px; width:{r.w *
        S}px; font-size:{r.h * S}px"
      use:ptDrag={pt(`grid-run-${i}`, r.t, r)}>{r.t}</span
    >
  {/each}

  <!-- Point descriptions as single selectable blocks (bold term + line breaks). -->
  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `grid-para-${i}`}
      style="left:{p.x * S}px; top:{p.y * S}px; width:{p.w *
        S}px; font-size:{17 * S}px; line-height:{p.lh * S}px"
      use:ptDrag={pt(`grid-para-${i}`, "paragraph", p)}
      use:editText={{
        id: `grid-para-${i}`,
        label: "paragraph",
        get: () => p.html,
        set: (h) => (p.html = h),
      }}
    >
      {@html p.html}
    </p>
  {/each}

  <!-- Callout arrows, drawn directly in PDF coordinate space (612×792), on top. -->
  <svg
    class="arrows"
    viewBox="0 0 612 792"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <defs>
      <marker
        id="ah"
        markerWidth="7"
        markerHeight="7"
        refX="5.5"
        refY="3"
        orient="auto"
      >
        <path d="M0,0 L6,3 L0,6 Z" fill="#222" />
      </marker>
    </defs>
    <!-- Arrows from data (tail → head). hand-L/R fork from under the "hand points"
         label around the N dot; center → center dot; outer-E/S → outer points. -->
    {#each ARROWS as a}
      <path d="M{a.x1},{a.y1} L{a.x2},{a.y2}" />
    {/each}
    {#if guideEdit.on}
      <!-- Drag handles: shaft moves both ends; hollow rings move each endpoint
           (rings, so they don't hide the arrow/arrowhead being adjusted). -->
      {#each ARROWS as a (a.id)}
        <line
          class="edit-shaft"
          x1={a.x1}
          y1={a.y1}
          x2={a.x2}
          y2={a.y2}
          use:ptDrag={{
            id: `grid-arrow-${a.id}-shaft`,
            label: a.id,
            apply: (dx, dy) => {
              a.x1 += dx;
              a.y1 += dy;
              a.x2 += dx;
              a.y2 += dy;
            },
            snapshot: () => [a.x1, a.y1, a.x2, a.y2],
            restore: (s) => {
              a.x1 = s[0] ?? a.x1;
              a.y1 = s[1] ?? a.y1;
              a.x2 = s[2] ?? a.x2;
              a.y2 = s[3] ?? a.y2;
            },
          }}
        />
        <circle
          class="edit-handle"
          class:selected={guideEdit.selectedId === `grid-arrow-${a.id}-tail`}
          cx={a.x1}
          cy={a.y1}
          r="4"
          use:ptDrag={pt(
            `grid-arrow-${a.id}-tail`,
            `${a.id} tail`,
            a,
            "x1",
            "y1"
          )}
        />
        <circle
          class="edit-handle head"
          class:selected={guideEdit.selectedId === `grid-arrow-${a.id}-head`}
          cx={a.x2}
          cy={a.y2}
          r="4"
          use:ptDrag={pt(
            `grid-arrow-${a.id}-head`,
            `${a.id} head`,
            a,
            "x2",
            "y2"
          )}
        />
      {/each}
    {/if}
  </svg>
</div>

<style>
  /* Absolute layer over the whole GuidePage sheet; coords map straight to pt×S. */
  .grid-page {
    position: absolute;
    inset: 0;
    color: #141414;
  }

  .run {
    position: absolute;
    /* Times metrics sit close to the proof's serif, so runs placed at the PDF's
       x-coordinates keep their original spacing without overlapping. */
    font-family: "Times New Roman", Times, Georgia, serif;
    line-height: 1;
    white-space: nowrap;
  }
  .run.b {
    font-weight: 700;
  }
  /* Point descriptions: one flowing block (selectable as a unit), same serif as
     the runs; bold term inline, line breaks explicit. */
  .para {
    position: absolute;
    margin: 0;
    font-family: "Times New Roman", Times, Georgia, serif;
    color: #141414;
    text-align: left;
  }
  /* Intro: one centred, full-width movable block (was four separate runs). */
  .intro {
    position: absolute;
    left: 0;
    right: 0;
    margin: 0;
    text-align: center;
    font-family: "Times New Roman", Times, Georgia, serif;
    color: #141414;
  }
  .intro :global(strong),
  .para :global(strong) {
    color: #141414;
    font-weight: 700;
  }
  .intro.edit {
    outline: 1px dashed rgba(55, 48, 163, 0.4);
    cursor: move;
  }
  .intro.selected {
    outline: 1.5px solid #3730a3;
    outline-offset: 1px;
  }
  /* The + / = operators between the bottom minis - heavy, centred in their box. */
  .run.op {
    text-align: center;
    font-weight: 700;
    color: #1a1a1a;
  }
  /* Section headings (Diamond / Box / 8-point grid) - display serif (unchanged). */
  .run.s {
    font-family: var(--guide-display);
    font-style: italic;
    font-weight: 600;
  }
  /* Page title is the shared .guide-title (guide.css) - no per-page title rule. */

  .diagram,
  .mini {
    position: absolute;
    border: 1px solid #c4c4cc;
  }
  .fig {
    display: block;
    width: 100%;
    height: 100%;
  }
  /* GridSvg fades in via its own .visible state; force it on for a static print. */
  .fig :global(.grid-container) {
    opacity: 1;
  }
  /* The proof shows points only - drop the connecting grid lines. */
  .fig :global(line) {
    display: none;
  }

  /* Callout arrows overlay - full sheet, drawn in PDF (612×792) space. */
  .arrows {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
  }
  /* Only the arrow lines (direct children) - NOT the marker's triangle path. */
  .arrows > path {
    fill: none;
    stroke: #222;
    stroke-width: 1.1;
    marker-end: url(#ah);
  }

  /* ── Edit mode (?edit) affordances ───────────────────────────────────────── */
  .run.edit,
  .para.edit {
    outline: 1px dashed rgba(55, 48, 163, 0.4);
    cursor: move;
  }
  .run.selected,
  .para.selected {
    outline: 1.5px solid #3730a3;
    outline-offset: 1px;
  }
  /* Fat invisible shaft to grab the whole arrow; handles for each endpoint. The
     parent .arrows is pointer-events:none, so re-enable on these. */
  .arrows .edit-shaft {
    stroke: transparent;
    stroke-width: 10;
    pointer-events: stroke;
    cursor: move;
  }
  /* Hollow rings: translucent fill keeps them grabbable but see-through, so the
     arrow + arrowhead under a handle stay visible while adjusting. */
  .arrows .edit-handle {
    fill: rgba(55, 48, 163, 0.12);
    stroke: #3730a3;
    stroke-width: 1.4;
    pointer-events: all;
    cursor: grab;
  }
  .arrows .edit-handle.head {
    fill: rgba(192, 38, 211, 0.12);
    stroke: #c026d3;
  }
  .arrows .edit-handle.selected {
    fill: #3730a3;
    stroke: #fff;
  }
  .arrows .edit-handle.head.selected {
    fill: #c026d3;
  }
</style>
