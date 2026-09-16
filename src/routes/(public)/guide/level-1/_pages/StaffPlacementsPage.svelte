<script lang="ts">
  /**
   * Staff Placements - body page 9 (manifest `staff-placements`), faithful to the
   * proof PDF (level-1-v05.pdf) / "1.0 - Layer 1 Staff Positions" artboard.
   *
   * 12 REAL staff pictographs: α (blue W / red E), β (both S - the system's beta
   * offset separates them side-by-side), γ (blue S / red E), each in the four
   * thumb-orientation columns. The thumb end is the staff SVG's crossbar; the
   * renderer rotates it from the motion's orientation (MCP: IN = toward center,
   * OUT = away). Column order is blue/red - "(out/in)" = blue out, red in -
   * matching the artboard's blue/red colored header.
   *
   * Text runs sit at the proof's own coordinates (PROOF_TEXT staff-placements).
   * Faithful-with-corrections: the proof's "Many of pictographs … when
   * categorizating" typos read "Many of the pictographs … when categorizing";
   * facelift lowercase γ replaces the proof's uppercase Γ row glyph.
   *
   * Geometry measured off the artboard border lines (20px/pt): 99.8pt boxes,
   * columns x 107.5/228.1/348.6/469.2, rows y 271.8/405.8/535.6, rules at
   * y 257.4/389.7/521.3 spanning x 33→570.
   */
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import { MotionType, HandSide, Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { GridMode, GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { Letter } from "$lib/shared/foundation/domain/models/letter";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import { pt, ptDrag, editText, guideEdit, registerEditSource } from "../_data/guide-edit.svelte";

  const S = 816 / 612; // pt → px (4/3)
  const { EAST: E, SOUTH: SO_, WEST: W } = GridLocation;

  // ── 12 staff pictographs: 3 placements × 4 thumb-orientation columns ────────
  const staticMotion = (color: HandSide, loc: GridLocation, ori: Orientation) =>
    createMotionData({
      motionType: MotionType.STATIC,
      startLocation: loc,
      endLocation: loc,
      startOrientation: ori,
      endOrientation: ori,
      color,
      propType: PropType.STAFF,
      gridMode: GridMode.DIAMOND,
    });

  type Row = { letter: Letter; left: GridLocation; right: GridLocation; y: number };
  const ROWS: Row[] = [
    { letter: Letter.ALPHA, left: W, right: E, y: 271.8 },
    { letter: Letter.BETA, left: SO_, right: SO_, y: 405.8 },
    { letter: Letter.GAMMA, left: SO_, right: E, y: 535.6 },
  ];

  // Column thumb orientations, blue/red order (matches the colored header).
  const COL_ORI: [Orientation, Orientation][] = [
    [Orientation.IN, Orientation.IN],
    [Orientation.OUT, Orientation.OUT],
    [Orientation.OUT, Orientation.IN],
    [Orientation.IN, Orientation.OUT],
  ];

  const COLS = [107.5, 228.1, 348.6, 469.2];
  const SIZE = 99.8;

  const cell = (row: Row, col: number): StepData =>
    ({
      id: `sp-${row.letter}-${col}`,
      letter: row.letter,
      gridMode: GridMode.DIAMOND,
      startPlacement: getGridPlacementFromLocations(row.left, row.right),
      endPlacement: getGridPlacementFromLocations(row.left, row.right),
      motions: {
        left: staticMotion(HandSide.LEFT, row.left, COL_ORI[col]![0]),
        right: staticMotion(HandSide.RIGHT, row.right, COL_ORI[col]![1]),
      },
      stepNumber: null,
      duration: 1,
      leftReversal: false,
      rightReversal: false,
      isBlank: false,
    }) as unknown as StepData;

  // ── Row glyph (Type6 letter SVG) + name, centred on the label column ────────
  const LABEL_CX = 65.7; // all three proof labels centre on this x
  const GLYPH_H = 26;
  const GLYPHS = [
    { src: "/images/letters_trimmed/Type6/α.svg", ar: 92.22 / 100, name: "Alpha (α)", labelY: 341.9, label: "Alpha", lw: 42.3 },
    { src: "/images/letters_trimmed/Type6/β.svg", ar: 66.05 / 100, name: "Beta (β)", labelY: 477.8, label: "Beta", lw: 32.7 },
    { src: "/images/letters_trimmed/Type6/γ.svg", ar: 79 / 100.11, name: "Gamma (γ)", labelY: 608.7, label: "Gamma", lw: 55.3 },
  ];

  // ── Rules (heavier black, per the artboard - not the hairline style) ────────
  const RULES = [257.4, 389.7, 521.3];

  // ── Centred paragraphs at proof coords ──────────────────────────────────────
  type Para = { x: number; y: number; fs: number; lh: number; bold?: boolean; html: string };
  let PARAS: Para[] = $state([
    {
      x: 0,
      y: 74,
      fs: 15,
      lh: 18,
      html:
        "When writing sequences with staves, it helps to mark the thumb end with a line.<br>" +
        "The performer can use it to keep track of rotations and check their position on every step.<br>" +
        "It also encourages negative space/body turns instead of finger spinning.",
    },
    { x: 0, y: 146, fs: 15, lh: 18, html: "In the following examples, an end is always at the center point." },
    { x: 0, y: 182, fs: 15, lh: 18, bold: true, html: "Practice each placement below, paying attention to the thumb orientation." },
    {
      x: 0,
      y: 660.4,
      fs: 16,
      lh: 19.2,
      html:
        "Many of the pictographs in this guide are depicted with no thumb ends<br>" +
        "when categorizing. It is usually noted only during sequences.",
    },
    {
      x: 0,
      y: 718,
      fs: 16,
      lh: 19.2,
      html:
        "Most sequences in this guide start with thumbs in for consistency.<br>" +
        "It’s equally valid to start any sequence from a different thumb orientation.",
    },
  ]);

  // ── Header runs (fs17), centred over their columns at the proof coords ─────
  type Run = { x: number; y: number; w: number; fs: number; html: string };
  let RUNS: Run[] = $state([
    { x: 36.1, y: 231.4, w: 64.1, fs: 17, html: "Thumbs:" },
    { x: 150, y: 231.4, w: 14.2, fs: 17, html: "in" },
    { x: 265.1, y: 231.4, w: 24.2, fs: 17, html: "out" },
    { x: 368.7, y: 231.4, w: 59.7, fs: 17, html: '<span class="cB">(out</span>/<span class="cR">in)</span>' },
    { x: 489.3, y: 231.4, w: 59.7, fs: 17, html: '<span class="cB">(in</span>/<span class="cR">out)</span>' },
  ]);

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("Staff Placements (p9)", () =>
      PARAS.map((p, i) => `  para[${i}]: x: ${r1(p.x)}, y: ${r1(p.y)}`).join("\n") +
      "\n" +
      RUNS.map((r, i) => `  run[${i}]: x: ${r1(r.x)}, y: ${r1(r.y)}`).join("\n")
    )
  );
</script>

<div class="staff-placements">
  <!-- 12 real staff pictographs at the measured artboard boxes. -->
  {#each ROWS as row (row.letter)}
    {#each COLS as cx, ci (ci)}
      <div class="mini" style="left:{cx * S}px; top:{row.y * S}px; width:{SIZE * S}px; height:{SIZE * S}px">
        <PictographContainer
          pictographData={cell(row, ci)}
          gridMode={GridMode.DIAMOND}
          leftPropTypeOverride={PropType.STAFF}
          rightPropTypeOverride={PropType.STAFF}
          showGrid={true}
          showTKA={true}
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
      </div>
    {/each}
  {/each}

  <!-- Row glyph (canonical Type6 SVG, facelift lowercase γ) above its name. -->
  {#each GLYPHS as g (g.name)}
    <img
      class="glyph"
      src={g.src}
      alt={g.name}
      style="left:{(LABEL_CX - (GLYPH_H * g.ar) / 2) * S}px; top:{(g.labelY - GLYPH_H - 8) * S}px; height:{GLYPH_H * S}px"
    />
    <span class="label" style="left:{(LABEL_CX - g.lw / 2) * S}px; top:{g.labelY * S}px; width:{g.lw * S}px; font-size:{17 * S}px">{g.label}</span>
  {/each}

  <!-- Header rule + section dividers (heavier black, per the artboard). -->
  {#each RULES as ry (ry)}
    <div class="rule" style="left:{33 * S}px; top:{ry * S}px; width:{537 * S}px"></div>
  {/each}

  <!-- Centred paragraphs (proof coords). -->
  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:bold={p.bold}
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `sp-para-${i}`}
      style="top:{p.y * S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px"
      use:ptDrag={pt(`sp-para-${i}`, "para", p)}
      use:editText={{ id: `sp-para-${i}`, label: "para", get: () => p.html, set: (h) => (p.html = h) }}
    >
      {@html p.html}
    </p>
  {/each}

  <!-- Thumbs header row (colored blue/red on the mixed columns). -->
  {#each RUNS as r, i (i)}
    <span
      class="run"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `sp-run-${i}`}
      style="left:{r.x * S}px; top:{r.y * S}px; width:{r.w * S}px; font-size:{r.fs * S}px"
      use:ptDrag={pt(`sp-run-${i}`, "header", r)}
      use:editText={{ id: `sp-run-${i}`, label: "header", get: () => r.html, set: (h) => (r.html = h) }}
    >
      {@html r.html}
    </span>
  {/each}
</div>

<style>
  /* Absolute layer over the whole GuidePage sheet; coords map straight to pt×S. */
  .staff-placements {
    position: absolute;
    inset: 0;
    color: #141414;
  }

  .mini {
    position: absolute;
    border: 1px solid #c4c4cc;
    box-sizing: border-box;
  }

  .glyph {
    position: absolute;
    width: auto; /* height drives size; intrinsic ratio sets width */
  }

  .label,
  .run {
    position: absolute;
    font-family: "Cambria", Georgia, "Times New Roman", serif;
    line-height: 1;
    white-space: nowrap;
    text-align: center;
  }

  .rule {
    position: absolute;
    height: 2px;
    background: #141414;
  }

  .para {
    position: absolute;
    left: 0;
    right: 0;
    margin: 0;
    text-align: center;
    font-family: "Cambria", Georgia, "Times New Roman", serif;
    color: #141414;
  }
  .para.bold {
    font-weight: 700;
  }

  .para :global(.cR),
  .run :global(.cR) {
    color: #cc2127;
  }
  .para :global(.cB),
  .run :global(.cB) {
    color: #2e3192;
  }

  .para.edit,
  .run.edit {
    outline: 1px dashed rgba(55, 48, 163, 0.4);
    cursor: move;
  }
  .para.selected,
  .run.selected {
    outline: 1.5px solid #3730a3;
    outline-offset: 1px;
  }
</style>
