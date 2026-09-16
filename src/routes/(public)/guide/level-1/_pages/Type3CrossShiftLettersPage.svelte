<script lang="ts">
  /**
   * Type 3 - Cross-Shift (letters) - body page (manifest `lt3-dash-letters`),
   * faithful to proof p28 / "1.1 - Type 3 - Cross-Shifts" artboard.
   *
   * Cross-Shifts = the Type 2 letters with the other hand DASHING into its end
   * position. Four 2-cell boxes (all real staff pictographs; MCP-verified via
   * `get_pictograph_data` on the dash letters):
   *   γ→α (W- X-: blue dash e→w, red s→e) · γ→β (Y- Z-: blue dash n→s, red
   *   w→s) · β→γ (Σ- Δ-: blue dash e→w, red e→s) · α→γ (Θ- Ω-: blue dash
   *   n→s, red s→e).
   * CORRECTION vs the artboard (flagged): the old guide labeled the Σ-/Δ- box
   * "α→Γ" and the Θ-/Ω- box "β→Γ" - the dataset says Σ-/Δ- START at beta and
   * Θ-/Ω- at alpha (dashing means the start position family flips); labels
   * here follow the data.
   *
   * Bottom: two step-by-step breakdown rows (start → halfway → end = combined)
   * in the Staff Motions recipe - halfway frames compose a bare grid + the
   * real staff SVG at the renderer's own placement pose:
   *   W- : blue mid-dash at the center (horizontal, crossbar W) + red
   *        mid-prospin at the SE hand point rotate(225°);
   *   Δ- : blue mid-dash at the center rotate(-90°) + red mid-antispin at the
   *        SE hand point rotate(-45°).
   * Dash flips the thumb (in→out), per the orientation algebra.
   *
   * Reader: box cells + the two combined pictographs click-animate with staffs.
   *
   * Geometry off the artboard border scan (20px/pt): letter boxes 90pt cells at
   * x 110.8/330.8, rows y 195.3/315.6; breakdown rows 85pt frames at
   * x 123.5/233.5/343.5/453.4, rows y 542.6/662.6. Text at PROOF_TEXT coords.
   */
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import SelectionHit from "$lib/shared/selection/SelectionHit.svelte";
  import { getSequenceSelection } from "$lib/shared/selection/sequence-selection.svelte";
  import PlacementGlyph from "$lib/shared/pictograph/shared/components/PlacementGlyph.svelte";
  import { createMotionData, createPlaceholderMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
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
  import { LETTER_TYPE_COLORS } from "$lib/shared/pictograph/shared/domain/constants/pictograph-constants";
  import { LetterType } from "$lib/shared/foundation/domain/models/letter-type";
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
  const NOROT = RotationDirection.NO_ROTATION;
  const [T3_GREEN, T3_PURPLE] = LETTER_TYPE_COLORS[LetterType.TYPE3];
  const T2_PURPLE = LETTER_TYPE_COLORS[LetterType.TYPE2][0];

  // Reader wiring (all null on /print,/book - pages stay pristine).
  const selection = getSequenceSelection();
  const activeStep = getGuideActiveStep();
  const emitSequence = getGuideSequenceClick();

  const HP_CW = new Set(["s-w", "w-n", "n-e", "e-s"]);
  const hpDir = (from: GridLocation, to: GridLocation) => (HP_CW.has(`${from}-${to}`) ? CW : CCW);
  const shift = (color: HandSide, from: GridLocation, to: GridLocation, anti: boolean, so: Orientation = IN) => {
    const dir = hpDir(from, to);
    return createMotionData({
      motionType: anti ? MotionType.ANTI : MotionType.PRO,
      rotationDirection: anti ? (dir === CW ? CCW : CW) : dir,
      startLocation: from,
      endLocation: to,
      startOrientation: so,
      endOrientation: anti ? (so === IN ? OUT : IN) : so,
      turns: 0,
      color,
      propType: PropType.STAFF,
      gridMode: GridMode.DIAMOND,
    });
  };
  const dash = (color: HandSide, from: GridLocation, to: GridLocation) =>
    createMotionData({
      motionType: MotionType.DASH,
      rotationDirection: NOROT,
      startLocation: from,
      endLocation: to,
      startOrientation: IN,
      endOrientation: OUT,
      turns: 0,
      color,
      propType: PropType.STAFF,
      gridMode: GridMode.DIAMOND,
    });
  const stat = (color: HandSide, loc: GridLocation, ori: Orientation = IN) =>
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

  // ── The four letter boxes (blue dashes, red shifts) ─────────────────────────
  type CellDef = { letter: Letter; name: string; bFrom: GridLocation; bTo: GridLocation; rFrom: GridLocation; rTo: GridLocation; anti: boolean };
  type BoxDef = { x: number; y: number; label: { start: GridPlacement; end: GridPlacement; t: string }; cells: CellDef[] };
  const BOXES: BoxDef[] = [
    {
      x: 110.8, y: 195.3,
      label: { start: GridPlacement.GAMMA1, end: GridPlacement.ALPHA1, t: "γ→α" },
      cells: [
        { letter: Letter.W_DASH, name: "W-", bFrom: E, bTo: W, rFrom: SO_, rTo: E, anti: false },
        { letter: Letter.X_DASH, name: "X-", bFrom: E, bTo: W, rFrom: SO_, rTo: E, anti: true },
      ],
    },
    {
      x: 330.8, y: 195.3,
      label: { start: GridPlacement.GAMMA1, end: GridPlacement.BETA1, t: "γ→β" },
      cells: [
        { letter: Letter.Y_DASH, name: "Y-", bFrom: N, bTo: SO_, rFrom: W, rTo: SO_, anti: false },
        { letter: Letter.Z_DASH, name: "Z-", bFrom: N, bTo: SO_, rFrom: W, rTo: SO_, anti: true },
      ],
    },
    {
      x: 110.8, y: 315.6,
      label: { start: GridPlacement.BETA1, end: GridPlacement.GAMMA1, t: "β→γ" },
      cells: [
        { letter: Letter.SIGMA_DASH, name: "Σ-", bFrom: E, bTo: W, rFrom: E, rTo: SO_, anti: false },
        { letter: Letter.DELTA_DASH, name: "Δ-", bFrom: E, bTo: W, rFrom: E, rTo: SO_, anti: true },
      ],
    },
    {
      x: 330.8, y: 315.6,
      label: { start: GridPlacement.ALPHA1, end: GridPlacement.GAMMA1, t: "α→γ" },
      cells: [
        { letter: Letter.THETA_DASH, name: "Θ-", bFrom: N, bTo: SO_, rFrom: SO_, rTo: E, anti: false },
        { letter: Letter.OMEGA_DASH, name: "Ω-", bFrom: N, bTo: SO_, rFrom: SO_, rTo: E, anti: true },
      ],
    },
  ];
  const NAMES = [
    { t: "Sig Dash", cx: 155.8 },
    { t: "Del Dash", cx: 245.8 },
    { t: "The Dash", cx: 375.8 },
    { t: "Om Dash", cx: 465.8 },
  ];

  const cellStep = (c: CellDef, id: string, stepNumber: number | null): StepData =>
    ({
      id,
      letter: c.letter,
      gridMode: GridMode.DIAMOND,
      startPlacement: getGridPlacementFromLocations(c.bFrom, c.rFrom),
      endPlacement: getGridPlacementFromLocations(c.bTo, c.rTo),
      stepNumber,
      motions: {
        left: dash(HandSide.LEFT, c.bFrom, c.bTo),
        right: shift(HandSide.RIGHT, c.rFrom, c.rTo, c.anti),
      },
    }) as unknown as StepData;

  const startFor = (c: CellDef, id: string): StepData =>
    ({
      id,
      letter: null,
      gridMode: GridMode.DIAMOND,
      stepNumber: 0,
      startPlacement: getGridPlacementFromLocations(c.bFrom, c.rFrom),
      endPlacement: getGridPlacementFromLocations(c.bFrom, c.rFrom),
      motions: {
        left: stat(HandSide.LEFT, c.bFrom),
        right: stat(HandSide.RIGHT, c.rFrom),
      },
    }) as unknown as StepData;

  const cellSteps = (c: CellDef, key: string): StepData[] => [startFor(c, `${key}-0`), cellStep(c, `${key}-1`, 1)];

  // Override-aware resolution for the four letter boxes (8 cells). An admin
  // override (guide-overrides.svelte) replaces the WHOLE strip when present;
  // reversal dots are always DERIVED via bakeReversals, never hand-authored.
  const resolvedCellSteps = (c: CellDef, key: string): StepData[] => {
    const authored = cellSteps(c, key);
    const override = overrideStepsFor(key);
    const full = override && override.length > 0 ? override : authored;
    const [start, ...steps] = full;
    return [start!, ...bakeReversals(steps)];
  };
  const RESOLVED_CELLS: Record<string, StepData[]> = $derived(
    Object.fromEntries(
      BOXES.flatMap((box) => box.cells.map((c) => [`t3-${c.name}`, resolvedCellSteps(c, `t3-${c.name}`)]))
    )
  );

  // ── Breakdown rows (start → halfway → end = combined) ───────────────────────
  const STAFF_D =
    "M251.4 67.7V10.1c0-4.8-4.1-8.7-9.1-8.7s-9.1 3.9-9.1 8.7v19.2H10.3c-4.9 0-8.9 3.8-8.9 8.5V41c0 4.6 4 8.5 8.9 8.5h222.9v18.2c0 4.8 4.1 8.7 9.1 8.7s9.1-3.9 9.1-8.7z";
  const RED = "#DC2626"; // the renderer's red prop fill
  const BLUE = "#2e3192"; // staff.svg's native blue fill
  type Pose = { x: number; y: number; deg: number };
  type Breakdown = {
    key: string;
    name: string;
    glyph: string;
    y: number;
    cell: CellDef;
    startOris: [Orientation, Orientation];
    endOris: [Orientation, Orientation];
    leftPose: Pose;
    rightPose: Pose;
  };
  const BREAKDOWNS: Breakdown[] = [
    {
      // W-: blue dash e→w (mid at center, crossbar W), red prospin s→e (SE, 225°).
      key: "t3-bd-w",
      name: "W-",
      glyph: "/images/letters_trimmed/Type3/W-.svg",
      y: 542.6,
      cell: { letter: Letter.W_DASH, name: "W-", bFrom: E, bTo: W, rFrom: SO_, rTo: E, anti: false },
      startOris: [IN, IN],
      endOris: [OUT, IN],
      leftPose: { x: 475, y: 475, deg: 180 },
      rightPose: { x: 576.2, y: 576.2, deg: 225 },
    },
    {
      // Δ-: blue dash s→n (mid at center, crossbar N), red antispin s→e (SE, -45°).
      key: "t3-bd-d",
      name: "Δ-",
      glyph: "/images/letters_trimmed/Type3/Δ-.svg",
      y: 662.6,
      cell: { letter: Letter.DELTA_DASH, name: "Δ-", bFrom: SO_, bTo: N, rFrom: SO_, rTo: E, anti: true },
      startOris: [IN, IN],
      endOris: [OUT, OUT],
      leftPose: { x: 475, y: 475, deg: -90 },
      rightPose: { x: 576.2, y: 576.2, deg: -45 },
    },
  ];

  const bdFrame = (b: Breakdown, which: "start" | "end"): StepData =>
    ({
      id: `${b.key}-${which}`,
      letter: null,
      gridMode: GridMode.DIAMOND,
      stepNumber: null,
      motions: {
        left: stat(HandSide.LEFT, which === "start" ? b.cell.bFrom : b.cell.bTo, which === "start" ? b.startOris[0] : b.endOris[0]),
        right: stat(HandSide.RIGHT, which === "start" ? b.cell.rFrom : b.cell.rTo, which === "start" ? b.startOris[1] : b.endOris[1]),
      },
    }) as unknown as StepData;

  const bareGrid = (id: string) =>
    ({
      id,
      letter: null,
      gridMode: GridMode.DIAMOND,
      motions: {
        left: createPlaceholderMotion(HandSide.LEFT),
        right: createPlaceholderMotion(HandSide.RIGHT),
      },
    }) as unknown as StepData;

  const bdSteps = (b: Breakdown): StepData[] => [bdFrame(b, "start"), cellStep(b.cell, `${b.key}-s1`, 1)];

  // Override-aware resolution for the two breakdown rows' combined pictograph.
  const resolvedBdSteps = (b: Breakdown, key: string): StepData[] => {
    const authored = bdSteps(b);
    const override = overrideStepsFor(key);
    const full = override && override.length > 0 ? override : authored;
    const [start, ...steps] = full;
    return [start!, ...bakeReversals(steps)];
  };
  const RESOLVED_BD: Record<string, StepData[]> = $derived(
    Object.fromEntries(BREAKDOWNS.map((b) => [`${b.key}-full`, resolvedBdSteps(b, `${b.key}-full`)]))
  );

  // ── Geometry ────────────────────────────────────────────────────────────────
  const BCELL = 90;
  const FRAME = 85;
  const BD_XS = [123.5, 233.5, 343.5, 453.4];
  const FLOW_X = [213.5, 323.5]; // → between frames
  const EQ_X = 441; // = before combined
  const HAIR_Y = 649; // hairline between the two breakdown rows

  // ── Text at proof coords ────────────────────────────────────────────────────
  const cg = (t: string) => `<strong style="color:${T3_GREEN}">${t}</strong>`;
  const cp = (t: string) => `<strong style="color:${T3_PURPLE}">${t}</strong>`;
  type Para = { x: number; y: number; fs: number; lh: number; html: string };
  let PARAS: Para[] = $state([
    {
      x: 0,
      y: 61.6,
      fs: 15,
      lh: 18,
      html:
        `${cg("Cross")}${cp("-Shifts")} use the same letters as <strong style="color:${T2_PURPLE}">Shifts</strong>, but each letter is followed by a<br>` +
        "dash to indicate that the other hand is dashing into its end position.<br>" +
        "They are spoken as “W Dash” or “Sigma Dash”.<br>" +
        "<em>A dash symbol in the glyph equals a dash arrow on the graph.</em><br>" +
        "<strong><em>The end position for each Type 2/3 letter remains the same.</em></strong>",
    },
    {
      x: 0,
      y: 445.5,
      fs: 15,
      lh: 18,
      html:
        `${cg("Cross")}${cp("-Shifts")} can be tricky to remember. It helps to first picture the corresponding<br>` +
        "Type 2 pictograph, then add the dash arrow without changing any other variables.",
    },
    {
      x: 0,
      y: 499.5,
      fs: 15,
      lh: 18,
      html: `Just like we did with hands, let’s break down some ${cg("Cross")}${cp("-Shifts")} step-by-step.`,
    },
    {
      x: 0,
      y: 761.1,
      fs: 15,
      lh: 18,
      html: "<strong><em>When initially learning, it’s useful to pause at the halfway point to ensure proper timing.</em></strong>",
    },
  ]);

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("Type 3 letters (lt3-dash-letters)", () =>
      PARAS.map((p, i) => `  para[${i}]: x: ${r1(p.x)}, y: ${r1(p.y)}`).join("\n")
    )
  );

  const PICTO_FLAGS = {
    showGrid: true,
    showTKA: true,
    showPlacements: false,
    showReversals: false,
    showTnD: false,
    showElemental: false,
    showNonRadialPoints: false,
    showHandPoints: true,
    darkMode: false,
    printMode: true,
    disableTransitions: true,
  } as const;
  const FRAME_LABELS = ["start", "halfway", "end"];
</script>

<div class="t3-letters">
  <!-- selfTitled: the calligraphic title with the canonical Type-3 colors. -->
  <div class="guide-title">
    Type 3 - <span style="color:{T3_GREEN}">Cross</span><span style="color:{T3_PURPLE}">-Shift</span>
  </div>

  <!-- The four letter boxes (labels corrected to the dataset's start positions). -->
  {#each BOXES as box, bi (bi)}
    <span class="box-label glyph" style="left:{box.x * S}px; top:{(box.y - 18) * S}px">
      <svg class="pos-glyph" viewBox="360 50 230 75" role="img" aria-label={box.label.t} style="height:{15 * S}px">
        <PlacementGlyph startPlacement={box.label.start} endPlacement={box.label.end} />
      </svg>
    </span>
    {#each box.cells as c, ci (ci)}
      {@const key = `t3-${c.name}`}
      <div
        class="mini tka-seq-cell"
        class:is-hovered={selection?.isHovered(key)}
        class:is-selected={selection?.isSelected(key)}
        class:guide-step-active={activeStep?.key === key}
        style="left:{(box.x + ci * BCELL) * S}px; top:{box.y * S}px; width:{BCELL * S}px; height:{BCELL * S}px"
      >
        <PictographContainer
          pictographData={RESOLVED_CELLS[key]![1]}
          gridMode={GridMode.DIAMOND}
          leftPropTypeOverride={PropType.STAFF}
          rightPropTypeOverride={PropType.STAFF}
          {...PICTO_FLAGS}
        />
        <SelectionHit
          groupId={key}
          isGroupStart
          label={`Animate letter ${c.name}`}
          onselect={() => emitSequence?.({ strip: RESOLVED_CELLS[key]!, word: `Letter ${c.name}`, key, propType: "staff" })}
        />
      </div>
    {/each}
  {/each}

  <!-- Letter names under the second box row. -->
  {#each NAMES as nm (nm.t)}
    <span class="name" style="left:{(nm.cx - 45) * S}px; top:{410 * S}px; width:{90 * S}px; font-size:{13 * S}px">{nm.t}</span>
  {/each}

  <!-- Breakdown rows: start → halfway → end = combined. -->
  {#each BREAKDOWNS as b (b.key)}
    <img class="bd-glyph" src={b.glyph} alt={b.name} style="left:{48 * S}px; top:{(b.y + 22) * S}px; height:{40 * S}px" />

    <!-- start -->
    <div class="mini" style="left:{BD_XS[0]! * S}px; top:{b.y * S}px; width:{FRAME * S}px; height:{FRAME * S}px">
      <PictographContainer pictographData={bdFrame(b, "start")} gridMode={GridMode.DIAMOND} leftPropTypeOverride={PropType.STAFF} rightPropTypeOverride={PropType.STAFF} {...PICTO_FLAGS} showTKA={false} />
    </div>
    <!-- halfway: bare grid + both staffs at their mid-motion poses -->
    <div class="mini" style="left:{BD_XS[1]! * S}px; top:{b.y * S}px; width:{FRAME * S}px; height:{FRAME * S}px">
      <PictographContainer pictographData={bareGrid(`${b.key}-half`)} gridMode={GridMode.DIAMOND} {...PICTO_FLAGS} showTKA={false} />
      <svg class="halfway-staff" viewBox="0 0 950 950" aria-hidden="true">
        <g transform="translate({b.leftPose.x}, {b.leftPose.y}) rotate({b.leftPose.deg}) translate(-126.4, -38.9)">
          <path d={STAFF_D} fill={BLUE} />
        </g>
        <g transform="translate({b.rightPose.x}, {b.rightPose.y}) rotate({b.rightPose.deg}) translate(-126.4, -38.9)">
          <path d={STAFF_D} fill={RED} />
        </g>
      </svg>
    </div>
    <!-- end -->
    <div class="mini" style="left:{BD_XS[2]! * S}px; top:{b.y * S}px; width:{FRAME * S}px; height:{FRAME * S}px">
      <PictographContainer pictographData={bdFrame(b, "end")} gridMode={GridMode.DIAMOND} leftPropTypeOverride={PropType.STAFF} rightPropTypeOverride={PropType.STAFF} {...PICTO_FLAGS} showTKA={false} />
    </div>
    <!-- combined: the real pictograph, clickable -->
    {@const key = `${b.key}-full`}
    <div
      class="mini tka-seq-cell"
      class:is-hovered={selection?.isHovered(key)}
      class:is-selected={selection?.isSelected(key)}
      class:guide-step-active={activeStep?.key === key}
      style="left:{BD_XS[3]! * S}px; top:{b.y * S}px; width:{FRAME * S}px; height:{FRAME * S}px"
    >
      <PictographContainer
        pictographData={RESOLVED_BD[key]![1]}
        gridMode={GridMode.DIAMOND}
        leftPropTypeOverride={PropType.STAFF}
        rightPropTypeOverride={PropType.STAFF}
        {...PICTO_FLAGS}
      />
      <SelectionHit
        groupId={key}
        isGroupStart
        label={`Animate ${b.name} step by step`}
        onselect={() => emitSequence?.({ strip: RESOLVED_BD[key]!, word: b.name, key, propType: "staff" })}
      />
    </div>

    <!-- flow arrows + equals -->
    {#each FLOW_X as fx (fx)}
      <svg class="flow-arrow" style="left:{fx * S}px; top:{(b.y + FRAME / 2 - 5) * S}px; width:{14.5 * S}px; height:{10 * S}px" viewBox="0 0 14.5 10" aria-hidden="true">
        <line x1="0" y1="5" x2="7.5" y2="5" stroke="#141414" stroke-width="2" />
        <polygon points="6.5,1.3 14.5,5 6.5,8.7" fill="#141414" />
      </svg>
    {/each}
    <span class="equals" style="left:{EQ_X * S}px; top:{(b.y + FRAME / 2) * S}px">=</span>
  {/each}

  <!-- Frame labels over the first breakdown row. -->
  {#each FRAME_LABELS as fl, i (fl)}
    <span class="frame-label" style="left:{(BD_XS[i]! + FRAME / 2 - 40) * S}px; top:{526 * S}px; width:{80 * S}px; font-size:{14 * S}px">{fl}</span>
  {/each}

  <!-- Hairline between the two breakdown rows. -->
  <div class="rule hair" style="left:{100 * S}px; top:{HAIR_Y * S}px; width:{440 * S}px"></div>

  <!-- Paragraphs (proof coords). -->
  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `t3l-para-${i}`}
      style="top:{p.y * S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px"
      use:ptDrag={pt(`t3l-para-${i}`, "para", p)}
      use:editText={{ id: `t3l-para-${i}`, label: "para", get: () => p.html, set: (h) => (p.html = h) }}
    >
      {@html p.html}
    </p>
  {/each}
</div>

<style>
  /* Absolute layer over the whole GuidePage sheet; coords map straight to pt×S. */
  .t3-letters {
    position: absolute;
    inset: 0;
    color: #141414;
  }

  .mini {
    position: absolute;
    border: 1px solid #c4c4cc;
    box-sizing: border-box;
  }

  .box-label {
    position: absolute;
  }
  .box-label.glyph {
    display: flex;
    align-items: center;
  }
  .pos-glyph {
    width: auto;
    display: block;
    overflow: visible;
  }

  .name,
  .frame-label {
    position: absolute;
    font-family: "Cambria", Georgia, "Times New Roman", serif;
    font-style: italic;
    text-align: center;
    line-height: 1;
    white-space: nowrap;
  }

  .bd-glyph {
    position: absolute;
    width: auto;
  }

  .halfway-staff {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .flow-arrow {
    position: absolute;
  }

  .equals {
    position: absolute;
    transform: translate(-50%, -50%);
    font-family: "Cambria", Georgia, serif;
    font-size: 32px;
    font-weight: 700;
    line-height: 1;
  }

  .rule.hair {
    position: absolute;
    height: 1px;
    background: #9a9aa4;
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

  .para.edit {
    outline: 1px dashed rgba(55, 48, 163, 0.4);
    cursor: move;
  }
  .para.selected {
    outline: 1.5px solid #3730a3;
    outline-offset: 1px;
  }
</style>
