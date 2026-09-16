<script lang="ts">
  /**
   * Letters intro / Type 1 Dual-Shift - body page 12 (manifest `base-letters`),
   * faithful to the proof PDF (level-1-v05.pdf) / "1.1 - Letters - Type 1"
   * artboard: the first REAL letters (A B C at α, G H I at β), each triplet in
   * the Pro - Anti - Hybrid pattern.
   *
   * 6 real letter pictographs rendered in the system's own letter language
   * (grid + motion arrows + STAFF props + bottom-left TKA glyph - the same form
   * the codex and the app workspace use; the old artboard drew bare arrows only):
   *   A/B/C → α→α Split-Same (blue s→w, red n→e)
   *   G/H/I → β→β Tog-Same  (both e→s; the beta offset separates the pair)
   * Pro = prop rotates with the handpath (CW here, thumb stays in); Anti = prop
   * counter-rotates (CCW, thumb flips in→out); Hybrid = blue anti + red pro,
   * matching the proof's "right is in pro and left in anti". All six confirmed
   * against MCP pictograph data (A/B/C var alpha1→alpha3, G/H/I e→s variant).
   *
   * In the reader every cell is clickable and animates Start→letter in the
   * companion with staff props from the in orientation.
   *
   * Geometry off the artboard border scan (20px/pt): both boxes x 154.5,
   * 3 × 120pt cells; ABC at y 231.8, GHI at y 563.4; heavy rule y 123.5.
   * Faithful-with-corrections: "A,B, and C" reads "A, B, and C"; Tog-Same
   * italicized to match Split-Same; the β→β margin label (dropped by the text
   * extraction) is restored symmetric to α→α.
   */
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import SelectionHit from "$lib/shared/selection/SelectionHit.svelte";
  import { getSequenceSelection } from "$lib/shared/selection/sequence-selection.svelte";
  import PlacementGlyph from "$lib/shared/pictograph/shared/components/PlacementGlyph.svelte";
  import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import {
    MotionType,
    HandSide,
    Orientation,
    RotationDirection,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { GridMode, GridLocation, GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { Letter } from "$lib/shared/foundation/domain/models/letter";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import { pt, ptDrag, editText, guideEdit, registerEditSource } from "../_data/guide-edit.svelte";
  import { bakeReversals } from "../_data/guide-sequence-adapter";
  import { getGuideSequenceClick } from "../_data/guide-data-context";
  import { getGuideActiveStep } from "../_data/guide-active-step.svelte";
  import { overrideStepsFor } from "../_data/guide-overrides.svelte";

  const S = 816 / 612; // pt → px (4/3)
  const { NORTH: N, EAST: E, SOUTH: SO_, WEST: W } = GridLocation;
  const { IN, OUT } = Orientation;
  const CW = RotationDirection.CLOCKWISE;
  const CCW = RotationDirection.COUNTER_CLOCKWISE;

  // Reader wiring (all null on /print,/book - pages stay pristine).
  const selection = getSequenceSelection();
  const activeStep = getGuideActiveStep();
  const emitSequence = getGuideSequenceClick();

  // ── The six letters, straight from MCP pictograph data ─────────────────────
  // Pro keeps the prop with the handpath (CW, in→in); anti counter-rotates
  // (CCW, in→out). Hybrid = blue anti + red pro (proof: right pro, left anti).
  type Hand = { type: MotionType; rot: RotationDirection; from: GridLocation; to: GridLocation; eo: Orientation };
  type Cell = { letter: Letter; name: string; left: Hand; right: Hand };
  const pro = (from: GridLocation, to: GridLocation): Hand => ({ type: MotionType.PRO, rot: CW, from, to, eo: IN });
  const anti = (from: GridLocation, to: GridLocation): Hand => ({ type: MotionType.ANTI, rot: CCW, from, to, eo: OUT });

  type Box = { key: string; x: number; y: number; cells: Cell[] };
  const BOXES: Box[] = [
    // A/B/C - α→α Split-Same: blue s→w, red n→e.
    {
      key: "abc",
      x: 154.5,
      y: 231.8,
      cells: [
        { letter: Letter.A, name: "A", left: pro(SO_, W), right: pro(N, E) },
        { letter: Letter.B, name: "B", left: anti(SO_, W), right: anti(N, E) },
        { letter: Letter.C, name: "C", left: anti(SO_, W), right: pro(N, E) },
      ],
    },
    // G/H/I - β→β Tog-Same: both hands e→s.
    {
      key: "ghi",
      x: 154.5,
      y: 563.4,
      cells: [
        { letter: Letter.G, name: "G", left: pro(E, SO_), right: pro(E, SO_) },
        { letter: Letter.H, name: "H", left: anti(E, SO_), right: anti(E, SO_) },
        { letter: Letter.I, name: "I", left: anti(E, SO_), right: pro(E, SO_) },
      ],
    },
  ];
  const CELL = 120;

  const hand = (color: HandSide, h: Hand) =>
    createMotionData({
      motionType: h.type,
      rotationDirection: h.rot,
      startLocation: h.from,
      endLocation: h.to,
      startOrientation: IN,
      endOrientation: h.eo,
      turns: 0,
      color,
      propType: PropType.STAFF,
      gridMode: GridMode.DIAMOND,
    });

  const staticHand = (color: HandSide, loc: GridLocation) =>
    createMotionData({
      motionType: MotionType.STATIC,
      startLocation: loc,
      endLocation: loc,
      startOrientation: IN,
      endOrientation: IN,
      color,
      propType: PropType.STAFF,
      gridMode: GridMode.DIAMOND,
    });

  const letterStep = (c: Cell, stepNumber: number | null = null): StepData =>
    ({
      id: `bl-${c.name}${stepNumber === null ? "" : `-${stepNumber}`}`,
      letter: c.letter,
      gridMode: GridMode.DIAMOND,
      startPlacement: getGridPlacementFromLocations(c.left.from, c.right.from),
      endPlacement: getGridPlacementFromLocations(c.left.to, c.right.to),
      motions: {
        left: hand(HandSide.LEFT, c.left),
        right: hand(HandSide.RIGHT, c.right),
      },
      stepNumber,
      duration: 1,
      leftReversal: false,
      rightReversal: false,
      isBlank: false,
    }) as unknown as StepData;

  // Companion strip: a static Start at the letter's start position, then the
  // letter itself - so playback opens from the in orientation like the page says.
  const authoredCellSteps = (c: Cell): StepData[] => [
    {
      id: `bl-${c.name}-start`,
      letter: null,
      gridMode: GridMode.DIAMOND,
      stepNumber: 0,
      startPlacement: getGridPlacementFromLocations(c.left.from, c.right.from),
      endPlacement: getGridPlacementFromLocations(c.left.from, c.right.from),
      motions: {
        left: staticHand(HandSide.LEFT, c.left.from),
        right: staticHand(HandSide.RIGHT, c.right.from),
      },
    } as unknown as StepData,
    letterStep(c, 1),
  ];

  // Admin override (guide-overrides.svelte) replaces the WHOLE strip when
  // present, resolved before baking - reversal dots stay derived either way.
  // Reactive ($derived) so a save/revert/reset re-renders without a refresh.
  const resolvedCellStrip = (c: Cell): StepData[] => {
    const authored = authoredCellSteps(c);
    const key = `bl-${c.name}`;
    const override = overrideStepsFor(key);
    const full = override && override.length > 0 ? override : authored;
    const [start, ...steps] = full;
    return [start!, ...bakeReversals(steps)];
  };
  const RESOLVED: Record<string, StepData[]> = $derived(
    Object.fromEntries(
      BOXES.flatMap((bx) => bx.cells.map((c) => [`bl-${c.name}`, resolvedCellStrip(c)]))
    )
  );
  const cellSteps = (c: Cell): StepData[] => RESOLVED[`bl-${c.name}`]!;

  // ── Rules + section head ────────────────────────────────────────────────────
  const HEAVY_RULE = 123.5;
  const HEAD_Y = 126;

  // ── Column labels (Pro / Anti / Hybrid over each cell) ──────────────────────
  const COL_CENTERS = [214.5, 334.5, 454.5];
  const COL_LABELS = ["Pro", "Anti", "Hybrid"];
  const COL_Y = { abc: 207, ghi: 536 };

  // ── Margin labels: real TKA PlacementGlyph over the italic mode name ─────────
  const MARGIN_CX = 106;
  type Margin = { pos: { start: GridPlacement; end: GridPlacement }; t: string; mode: string; glyphY: number; modeY: number };
  const MARGINS: Margin[] = [
    { pos: { start: GridPlacement.ALPHA1, end: GridPlacement.ALPHA1 }, t: "α→α", mode: "Split-Same", glyphY: 258.1, modeY: 279.3 },
    { pos: { start: GridPlacement.BETA1, end: GridPlacement.BETA1 }, t: "β→β", mode: "Tog-Same", glyphY: 589.6, modeY: 610.8 },
  ];

  // ── Text at proof coords, grouped into paragraphs ───────────────────────────
  type Para = { x: number; y: number; fs: number; lh: number; bold?: boolean; html: string };
  let PARAS: Para[] = $state([
    {
      x: 0,
      y: 56,
      fs: 16,
      lh: 19.2,
      html:
        "Just like positions, each motion pictograph can be rotated, reflected, or color swapped.<br>" +
        "Letters are organized on the page by end position, Alpha, Beta, then Gamma.<br>" +
        "Let’s look at each type individually.",
    },
    {
      x: 0,
      y: 181.8,
      fs: 16,
      lh: 19.2,
      html: "First we’ll look at A, B, and C. Their handpath is <em>Split-Same</em> and they move from α→α:",
    },
    {
      x: 0,
      y: 368.5,
      fs: 16,
      lh: 19.2,
      html:
        "Notice the pattern: <strong>Pro - Anti - Hybrid</strong><br>" +
        "This pattern helps you navigate/memorize the letters.",
    },
    {
      x: 0,
      y: 426.1,
      fs: 16,
      lh: 19.2,
      html:
        "If you only remember that A has prospins, you can infer that B has antispins.<br>" +
        "If you only remember that B has antispins, you can infer that C is a hybrid.<br>" +
        "<strong><em>If you memorize only one letter in each group, you know all of them.</em></strong>",
    },
    {
      x: 0,
      y: 502.9,
      fs: 16,
      lh: 19.2,
      html: "Next let’s look at G, H, and I. Their handpaths are <em>Tog-Same</em> and they move from β→β:",
    },
    {
      x: 0,
      y: 706.5,
      fs: 16,
      lh: 19.2,
      bold: true,
      html: "In hybrids like C and I, either hand can execute a prospin or antispin.",
    },
    {
      x: 0,
      y: 744.9,
      fs: 16,
      lh: 19.2,
      html:
        "Here, the <strong class=\"cR\">right</strong> is in pro and <strong class=\"cB\">left</strong> in anti, " +
        "but it’s equally valid to swap this.",
    },
  ]);

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("Base Letters (p12)", () =>
      PARAS.map((p, i) => `  para[${i}]: x: ${r1(p.x)}, y: ${r1(p.y)}`).join("\n")
    )
  );
</script>

<div class="base-letters">
  <!-- Heavy rule + the Type 1 section head (two-tone Dual-Shift, Type-1 colors). -->
  <div class="rule" style="left:{20 * S}px; top:{HEAVY_RULE * S}px; width:{572 * S}px"></div>
  <div class="guide-title section-head" style="top:{HEAD_Y * S}px">
    Type 1 - <span class="cy">Dual</span><span class="pu">-Shift</span>
  </div>

  <!-- Two 3-cell letter boxes; each cell is a real letter pictograph and (in the
       reader) a click target that animates Start→letter with staff props. -->
  {#each BOXES as bx (bx.key)}
    {#each bx.cells as c, ci (c.name)}
      {@const key = `bl-${c.name}`}
      <div
        class="mini tka-seq-cell"
        class:is-hovered={selection?.isHovered(key)}
        class:is-selected={selection?.isSelected(key)}
        class:guide-step-active={activeStep?.key === key}
        style="left:{(bx.x + ci * CELL) * S}px; top:{bx.y * S}px; width:{CELL * S}px; height:{CELL * S}px"
      >
        <PictographContainer
          pictographData={{ ...RESOLVED[key]![1], stepNumber: undefined } as unknown as StepData}
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
        <SelectionHit
          groupId={key}
          isGroupStart
          label={`Animate letter ${c.name}`}
          onselect={() => emitSequence?.({ strip: RESOLVED[key]!, word: `Letter ${c.name}`, key, propType: "staff" })}
        />
      </div>
    {/each}
  {/each}

  <!-- Pro / Anti / Hybrid column labels over each box. -->
  {#each ["abc", "ghi"] as bk (bk)}
    {#each COL_LABELS as t, i (t)}
      <span class="col-label" style="left:{(COL_CENTERS[i]! - 40) * S}px; top:{COL_Y[bk as "abc" | "ghi"] * S}px; width:{80 * S}px; font-size:{15.6 * S}px">{t}</span>
    {/each}
  {/each}

  <!-- Margin labels: real TKA PlacementGlyph over the italic handpath mode. -->
  {#each MARGINS as m (m.t)}
    <span class="margin glyph" style="left:{(MARGIN_CX - 40) * S}px; top:{m.glyphY * S}px; width:{80 * S}px">
      <svg class="pos-glyph" viewBox="360 50 230 75" role="img" aria-label={m.t} style="height:{20 * S}px">
        <PlacementGlyph startPlacement={m.pos.start} endPlacement={m.pos.end} />
      </svg>
    </span>
    <span class="margin i" style="left:{(MARGIN_CX - 50) * S}px; top:{m.modeY * S}px; width:{100 * S}px; font-size:{16.8 * S}px">{m.mode}</span>
  {/each}

  <!-- Centred paragraphs (proof coords). -->
  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:bold={p.bold}
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `bl-para-${i}`}
      style="top:{p.y * S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px"
      use:ptDrag={pt(`bl-para-${i}`, "para", p)}
      use:editText={{ id: `bl-para-${i}`, label: "para", get: () => p.html, set: (h) => (p.html = h) }}
    >
      {@html p.html}
    </p>
  {/each}
</div>

<style>
  /* Absolute layer over the whole GuidePage sheet; coords map straight to pt×S. */
  .base-letters {
    position: absolute;
    inset: 0;
    color: #141414;
  }

  .rule {
    position: absolute;
    height: 2px;
    background: #141414;
  }

  .section-head {
    font-size: 48px;
  }
  /* Two-tone Type-1 colour code for "Dual-Shift" (same tokens as the Type 1
     α/β page): Dual = cyan, -Shift = purple. */
  .section-head .cy {
    color: #36c3ff;
  }
  .section-head .pu {
    color: #6f2da8;
  }

  /* Abutting absolute cells - shared edges coincide, so borders read as one
     divider line, matching the artboard's single-box-three-cells look. */
  .mini {
    position: absolute;
    border: 1px solid #c4c4cc;
    box-sizing: border-box;
  }

  .col-label,
  .margin {
    position: absolute;
    font-family: "Cambria", Georgia, "Times New Roman", serif;
    line-height: 1;
    white-space: nowrap;
    text-align: center;
  }
  .col-label,
  .margin.i {
    font-style: italic;
  }
  .margin.glyph {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .pos-glyph {
    width: auto;
    display: block;
    overflow: visible;
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
  .para :global(.cR) {
    color: #cc2127;
  }
  .para :global(.cB) {
    color: #2e3192;
  }

  .para.edit {
    outline: 1px dashed rgba(55, 48, 163, 0.4);
    cursor: move;
  }
  .para.selected {
    outline: 1.5px solid #3730a3;
    outline-offset: 1px;
  }
</style>
