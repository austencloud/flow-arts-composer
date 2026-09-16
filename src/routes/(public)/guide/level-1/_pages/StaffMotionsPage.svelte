<script lang="ts">
  /**
   * Staff Motions - body page 10 (manifest `staff-motions`), faithful to the
   * proof PDF / "1.0 - Layer 1 Staff Motions" artboard.
   *
   * Three teaching rows (Prospin / Antispin / Dash), each: start → [halfway] →
   * end = combined. Start/end/combined are REAL single-staff pictographs (red
   * hand only, prop pinned to STAFF):
   *   prospin  → static S thumb-in · static E thumb-in  · PRO  S→E ccw (arrow)
   *   antispin → static S thumb-in · static E thumb-out · ANTI S→E ccw (arrow)
   *   dash     → static S thumb-in · static N thumb-out · DASH S→N (arrow)
   * End orientations follow the orientation algebra (pro preserves, anti/dash
   * reverse at 0 turns) - they matched the artboard's "end thumb in/out"
   * captions before any tuning.
   *
   * The HALFWAY frame is a mid-motion pose the pictograph system deliberately
   * doesn't model, so it composes system pieces rather than hand-drawing: a real
   * bare-grid pictograph (both motions invisible placeholders) + the REAL staff
   * SVG path overlaid with the renderer's own placement recipe
   * (translate(point) rotate(θ) translate(-126.4,-38.9), crossbar = +x at 0°):
   *   prospin  → SE hand point (576.2,576.2) rotate(225°)  - crossbar at center
   *   antispin → SE hand point (576.2,576.2) rotate(-45°)  - crossbar NE
   *   dash     → grid center (475,475) rotate(-90°)        - crossbar up
   * Facelift deviation (flagged): the proof drew partial-progress arrows inside
   * halfway/end frames; here frames are clean POSES and the motion arrow lives
   * only in the combined pictograph - the "=" reads "these poses = this
   * pictograph".
   *
   * Geometry off the artboard border scan (20px/pt): 100pt boxes, cols
   * x 80.5/200.5/320.5/440.5, rows y 213.1/448.4/662.9; heavy rules y 55.4 and
   * 583.1; hairline y 356.3. Text at PROOF_TEXT coords.
   */
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import SelectionHit from "$lib/shared/selection/SelectionHit.svelte";
  import { getSequenceSelection } from "$lib/shared/selection/sequence-selection.svelte";
  import {
    createMotionData,
    createPlaceholderMotion,
  } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import {
    MotionType,
    HandSide,
    Orientation,
    RotationDirection,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import {
    GridMode,
    GridLocation,
  } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import {
    pt,
    ptDrag,
    editText,
    guideEdit,
    registerEditSource,
  } from "../_data/guide-edit.svelte";
  import { bakeReversals } from "../_data/guide-sequence-adapter";
  import { getGuideSequenceClick } from "../_data/guide-data-context";
  import { getGuideActiveStep } from "../_data/guide-active-step.svelte";
  import { overrideStepsFor } from "../_data/guide-overrides.svelte";

  const S = 816 / 612; // pt → px (4/3)
  const { NORTH: N, EAST: E, SOUTH: SO_ } = GridLocation;

  // Reader wiring (all null on /print,/book - pages stay pristine).
  const selection = getSequenceSelection();
  const activeStep = getGuideActiveStep();
  const emitSequence = getGuideSequenceClick();

  // ── Real single-staff pictographs (red hand only) ───────────────────────────
  const rightStaff = (
    id: string,
    type: MotionType,
    from: GridLocation,
    to: GridLocation,
    startOri: Orientation,
    endOri: Orientation,
    rot: RotationDirection
  ) => ({
    id: `sm-${id}`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    motions: {
      right: createMotionData({
        motionType: type,
        rotationDirection: rot,
        startLocation: from,
        endLocation: to,
        startOrientation: startOri,
        endOrientation: endOri,
        turns: 0,
        hand: HandSide.RIGHT,
        propType: PropType.STAFF,
        gridMode: GridMode.DIAMOND,
      }),
    },
  });

  // Bare grid for the halfway frames: both motions are invisible placeholders.
  const bareGrid = (id: string) => ({
    id: `sm-${id}`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    motions: {
      left: createPlaceholderMotion(HandSide.LEFT),
      right: createPlaceholderMotion(HandSide.RIGHT),
    },
  });

  const { IN, OUT } = Orientation;
  // TKA rotationDirection = the PROP's rotation (MCP: anti W→N, a CW handpath,
  // carries ccw). S→E is a CCW handpath → pro spins ccw, anti spins cw.
  const CCW = RotationDirection.COUNTER_CLOCKWISE;
  const CW = RotationDirection.CLOCKWISE;
  const NOROT = RotationDirection.NO_ROTATION;
  const stat = (id: string, loc: GridLocation, ori: Orientation) =>
    rightStaff(id, MotionType.STATIC, loc, loc, ori, ori, NOROT);

  // ── The staff SVG path (static/images/props/staff.svg), renderer's own asset.
  // Native 252.8×77.8, centerPoint (126.4, 38.9); crossbar at the +x end.
  const STAFF_D =
    "M251.4 67.7V10.1c0-4.8-4.1-8.7-9.1-8.7s-9.1 3.9-9.1 8.7v19.2H10.3c-4.9 0-8.9 3.8-8.9 8.5V41c0 4.6 4 8.5 8.9 8.5h222.9v18.2c0 4.8 4.1 8.7 9.1 8.7s9.1-3.9 9.1-8.7z";
  const RED = "#DC2626"; // the renderer's red prop fill

  // Halfway poses: the renderer's placement recipe in 950-space.
  // SE hand point = center + 143.1 · (sin45°, cos45°) = (576.2, 576.2).
  type Halfway = { x: number; y: number; deg: number };

  // ── Rows ────────────────────────────────────────────────────────────────────
  const COLS = [80.5, 200.5, 320.5, 440.5];
  const SIZE = 100;
  type RowDef = {
    y: number;
    start: ReturnType<typeof rightStaff>;
    halfway: Halfway;
    end: ReturnType<typeof rightStaff>;
    combined: ReturnType<typeof rightStaff>;
  };
  const ROWS: RowDef[] = [
    {
      // Prospin: isolation S→E, thumb stays in; halfway crossbar at the center.
      y: 213.1,
      start: stat("pro-start", SO_, IN),
      halfway: { x: 576.2, y: 576.2, deg: 225 },
      end: stat("pro-end", E, IN),
      combined: rightStaff("pro-full", MotionType.PRO, SO_, E, IN, IN, CCW),
    },
    {
      // Antispin: S→E, prop counter-rotates; thumb flips in → out.
      y: 448.4,
      start: stat("anti-start", SO_, IN),
      halfway: { x: 576.2, y: 576.2, deg: -45 },
      end: stat("anti-end", E, OUT),
      combined: rightStaff("anti-full", MotionType.ANTI, SO_, E, IN, OUT, CW),
    },
    {
      // Dash: S→N through the center; thumb flips in → out.
      y: 662.9,
      start: stat("dash-start", SO_, IN),
      halfway: { x: 475, y: 475, deg: -90 },
      end: stat("dash-end", N, OUT),
      combined: rightStaff(
        "dash-full",
        MotionType.DASH,
        SO_,
        N,
        IN,
        OUT,
        NOROT
      ),
    },
  ];

  const bareGrids = ["pro-half", "anti-half", "dash-half"].map(bareGrid);

  // ── Reader click-to-animate: the combined pictograph plays Start → motion ────
  // with the real staff from the in orientation (the same seam as the Negative
  // Space strips; blue is an invisible placeholder - both-hands step contract).
  const ROW_KEYS = ["sm-pro", "sm-anti", "sm-dash"];
  const ROW_WORDS = ["Prospin", "Antispin", "Dash"];
  const animStep = (
    data: ReturnType<typeof rightStaff>,
    stepNumber: number
  ): StepData =>
    ({
      ...data,
      id: `${data.id}-anim-${stepNumber}`,
      stepNumber,
      motions: {
        left: createPlaceholderMotion(HandSide.LEFT, {
          location: SO_,
          orientation: IN,
        }),
        right: data.motions.right,
      },
    }) as unknown as StepData;
  const authoredRowSteps = (row: RowDef): StepData[] => [
    animStep(row.start, 0),
    animStep(row.combined, 1),
  ];

  // Admin override (guide-overrides.svelte) replaces the WHOLE strip when
  // present, resolved before baking - reversal dots stay derived either way.
  // Reactive ($derived) so a save/revert/reset re-renders without a refresh.
  const resolvedRowStrip = (row: RowDef, key: string): StepData[] => {
    const authored = authoredRowSteps(row);
    const override = overrideStepsFor(key);
    const full = override && override.length > 0 ? override : authored;
    const [start, ...steps] = full;
    return [start!, ...bakeReversals(steps)];
  };
  const RESOLVED: Record<string, StepData[]> = $derived(
    Object.fromEntries(
      ROWS.map((row, ri) => [
        ROW_KEYS[ri]!,
        resolvedRowStrip(row, ROW_KEYS[ri]!),
      ])
    )
  );
  const rowSteps = (row: RowDef, key: string): StepData[] => RESOLVED[key]!;

  // ── Flow arrows (prospin row only, per the proof) + "=" on every row ────────
  const rowMid = (y: number) => y + SIZE / 2;
  const FLOW_ARROWS = [
    { x: 183, y: rowMid(213.1) }, // between start and halfway
    { x: 303, y: rowMid(213.1) }, // between halfway and end
  ];
  const ARROW_W = 14.5; // shaft length pt
  const EQUALS = ROWS.map((r) => ({ x: 430.5, y: rowMid(r.y) }));

  // ── Rules ───────────────────────────────────────────────────────────────────
  // Proof rule y 55.4 clipped the facelift title's Tangerine descenders → 60.
  const HEAVY_RULES = [60, 583.1]; // full-width, 2pt
  const HAIRLINE = 356.3;

  // ── Section headings (script face, smaller than the page title) ─────────────
  const HEADS = [
    { t: "Shift", y: 58 },
    { t: "Dash", y: 586 },
  ];

  // ── Text at proof coords ────────────────────────────────────────────────────
  type Para = {
    x: number;
    y: number;
    fs: number;
    lh: number;
    left?: boolean;
    html: string;
  };
  let PARAS: Para[] = $state([
    {
      x: 0,
      y: 101.1,
      fs: 16,
      lh: 19,
      html: "During a shift, a prop can rotate in one of two directions - Prospin or Antispin",
    },
    {
      x: 95.2,
      y: 141.9,
      fs: 15,
      lh: 18,
      left: true,
      html: "• <strong>Prospin</strong> - The prop rotates the same direction as the handpath<br>A 90 degree isolation is our base unit of a prospin.",
    },
    {
      x: 0,
      y: 326.7,
      fs: 16,
      lh: 19,
      html: "In a base isolation, the thumb orientation remains the same for the entire motion.",
    },
    {
      x: 95.2,
      y: 372.4,
      fs: 16,
      lh: 19.2,
      left: true,
      html: "• <strong>Antispin</strong> - The prop rotates in the opposite direction of the handpath<br>A 90 degree antispin is our base unit of antispin.",
    },
    {
      x: 0,
      y: 555,
      fs: 16,
      lh: 19,
      html: "In an antispin, the ends swap orientation. Here, it moves from thumb in to thumb out.",
    },
    {
      x: 0,
      y: 622.2,
      fs: 16,
      lh: 19,
      html: "In a base dash, the thumb ends also swap orientation.",
    },
    {
      x: 0,
      y: 766.7,
      fs: 16,
      lh: 19,
      html: "Halfway through the motion, the center of the staff is at the grid’s center point.",
    },
  ]);

  // Positioned single runs: side mode labels, frame labels, thumb captions.
  type Run = {
    x: number;
    y: number;
    w: number;
    fs: number;
    style: "mode" | "frame" | "cap";
    t: string;
  };
  let RUNS: Run[] = $state([
    { x: 11.9, y: 139.8, w: 63.5, fs: 20, style: "mode", t: "Prospin" },
    { x: 11.9, y: 371.9, w: 68.9, fs: 20, style: "mode", t: "Antispin" },

    { x: 114.5, y: 190.8, w: 32, fs: 16, style: "frame", t: "start" },
    { x: 223.4, y: 190.8, w: 53.4, fs: 16, style: "frame", t: "halfway" },
    { x: 357.6, y: 190.8, w: 24.3, fs: 16, style: "frame", t: "end" },
    { x: 114.5, y: 426.2, w: 32, fs: 16, style: "frame", t: "start" },
    { x: 223.4, y: 426.2, w: 53.4, fs: 16, style: "frame", t: "halfway" },
    { x: 357.6, y: 426.2, w: 24.3, fs: 16, style: "frame", t: "end" },
    { x: 114.5, y: 642.6, w: 32, fs: 16, style: "frame", t: "start" },
    { x: 223.4, y: 642.6, w: 53.4, fs: 16, style: "frame", t: "halfway" },
    { x: 357.6, y: 642.6, w: 24.3, fs: 16, style: "frame", t: "end" },

    { x: 38.9, y: 245, w: 24, fs: 12, style: "cap", t: "start" },
    { x: 28.3, y: 259.4, w: 45.1, fs: 12, style: "cap", t: "thumb in" },
    { x: 561.1, y: 244.3, w: 18.2, fs: 12, style: "cap", t: "end" },
    { x: 547.6, y: 258.7, w: 45.1, fs: 12, style: "cap", t: "thumb in" },
    { x: 38.9, y: 480.4, w: 24, fs: 12, style: "cap", t: "start" },
    { x: 28.3, y: 494.8, w: 45.1, fs: 12, style: "cap", t: "thumb in" },
    { x: 561.1, y: 480.4, w: 18.2, fs: 12, style: "cap", t: "end" },
    { x: 544.1, y: 494.8, w: 52, fs: 12, style: "cap", t: "thumb out" },
    { x: 38.9, y: 695, w: 24, fs: 12, style: "cap", t: "start" },
    { x: 28.3, y: 709.4, w: 45.1, fs: 12, style: "cap", t: "thumb in" },
    { x: 561.1, y: 695, w: 18.2, fs: 12, style: "cap", t: "end" },
    { x: 544.1, y: 709.4, w: 52, fs: 12, style: "cap", t: "thumb out" },
  ]);

  const PICTO_FLAGS = {
    showGrid: true,
    showTKA: false,
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

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource(
      "Staff Motions (p10)",
      () =>
        PARAS.map((p, i) => `  para[${i}]: x: ${r1(p.x)}, y: ${r1(p.y)}`).join(
          "\n"
        ) +
        "\n" +
        RUNS.map(
          (r, i) => `  ${JSON.stringify(r.t)}: x: ${r1(r.x)}, y: ${r1(r.y)}`
        ).join("\n")
    )
  );
</script>

<div class="staff-motions">
  <!-- Section headings in the shared script face, sized below the page title. -->
  {#each HEADS as h (h.t)}
    <div class="guide-title section-head" style="top:{h.y * S}px">{h.t}</div>
  {/each}

  <!-- Heavy rules + hairline. -->
  {#each HEAVY_RULES as ry (ry)}
    <div
      class="rule heavy"
      style="left:0; top:{ry * S}px; width:{612 * S}px"
    ></div>
  {/each}
  <div
    class="rule hair"
    style="left:{20 * S}px; top:{HAIRLINE * S}px; width:{572 * S}px"
  ></div>

  <!-- The three motion rows. -->
  {#each ROWS as row, ri (ri)}
    <!-- start -->
    <div
      class="mini"
      style="left:{COLS[0]! * S}px; top:{row.y * S}px; width:{SIZE *
        S}px; height:{SIZE * S}px"
    >
      <PictographContainer
        pictographData={row.start}
        gridMode={GridMode.DIAMOND}
        rightPropTypeOverride={PropType.STAFF}
        {...PICTO_FLAGS}
      />
    </div>
    <!-- halfway: bare grid + the real staff asset at the mid-motion pose -->
    <div
      class="mini"
      style="left:{COLS[1]! * S}px; top:{row.y * S}px; width:{SIZE *
        S}px; height:{SIZE * S}px"
    >
      <PictographContainer
        pictographData={bareGrids[ri]}
        gridMode={GridMode.DIAMOND}
        {...PICTO_FLAGS}
      />
      <svg class="halfway-staff" viewBox="0 0 950 950" aria-hidden="true">
        <g
          transform="translate({row.halfway.x}, {row.halfway.y}) rotate({row
            .halfway.deg}) translate(-126.4, -38.9)"
        >
          <path d={STAFF_D} fill={RED} />
        </g>
      </svg>
    </div>
    <!-- end -->
    <div
      class="mini"
      style="left:{COLS[2]! * S}px; top:{row.y * S}px; width:{SIZE *
        S}px; height:{SIZE * S}px"
    >
      <PictographContainer
        pictographData={row.end}
        gridMode={GridMode.DIAMOND}
        rightPropTypeOverride={PropType.STAFF}
        {...PICTO_FLAGS}
      />
    </div>
    <!-- combined: the real motion pictograph (system arrow); in the reader it's
         clickable and plays Start → motion with the staff in the companion. -->
    {@const key = ROW_KEYS[ri]!}
    <div
      class="mini tka-seq-cell"
      class:is-hovered={selection?.isHovered(key)}
      class:is-selected={selection?.isSelected(key)}
      class:guide-step-active={activeStep?.key === key}
      style="left:{COLS[3]! * S}px; top:{row.y * S}px; width:{SIZE *
        S}px; height:{SIZE * S}px"
    >
      <PictographContainer
        pictographData={{
          ...RESOLVED[key]![1],
          stepNumber: undefined,
        } as unknown as StepData}
        gridMode={GridMode.DIAMOND}
        rightPropTypeOverride={PropType.STAFF}
        {...PICTO_FLAGS}
      />
      <SelectionHit
        groupId={key}
        isGroupStart
        label={`Animate the ${ROW_WORDS[ri]} motion`}
        onselect={() =>
          emitSequence?.({
            strip: rowSteps(row, key),
            word: ROW_WORDS[ri]!,
            key,
            propType: "staff",
          })}
      />
    </div>
  {/each}

  <!-- Frame-flow arrows (prospin row, per the proof) drawn as line + solid head. -->
  {#each FLOW_ARROWS as a (a.x)}
    <svg
      class="flow-arrow"
      style="left:{a.x * S}px; top:{(a.y - 5) * S}px; width:{ARROW_W *
        S}px; height:{10 * S}px"
      viewBox="0 0 {ARROW_W} 10"
      aria-hidden="true"
    >
      <line
        x1="0"
        y1="5"
        x2={ARROW_W - 7}
        y2="5"
        stroke="#141414"
        stroke-width="2"
      />
      <polygon
        points="{ARROW_W - 8},1.3 {ARROW_W},5 {ARROW_W - 8},8.7"
        fill="#141414"
      />
    </svg>
  {/each}

  <!-- "poses = pictograph" on every row. -->
  {#each EQUALS as eq, i (i)}
    <span class="equals" style="left:{eq.x * S}px; top:{eq.y * S}px">=</span>
  {/each}

  <!-- Centred / left-anchored paragraphs (proof coords). -->
  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:left={p.left}
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `sm-para-${i}`}
      style="top:{p.y * S}px; font-size:{p.fs * S}px; line-height:{p.lh *
        S}px; {p.left ? `left:${p.x * S}px; right:auto; text-align:left;` : ''}"
      use:ptDrag={pt(`sm-para-${i}`, "para", p)}
      use:editText={{
        id: `sm-para-${i}`,
        label: "para",
        get: () => p.html,
        set: (h) => (p.html = h),
      }}
    >
      {@html p.html}
    </p>
  {/each}

  <!-- Mode labels, frame labels, thumb captions. -->
  {#each RUNS as r, i (i)}
    <span
      class="run {r.style}"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `sm-run-${i}`}
      style="left:{r.x * S}px; top:{r.y * S}px; width:{r.w *
        S}px; font-size:{r.fs * S}px"
      use:ptDrag={pt(`sm-run-${i}`, r.t, r)}
      use:editText={{
        id: `sm-run-${i}`,
        label: r.t,
        get: () => r.t,
        set: (v) => (r.t = v),
        plain: true,
      }}>{r.t}</span
    >
  {/each}
</div>

<style>
  /* Absolute layer over the whole GuidePage sheet; coords map straight to pt×S. */
  .staff-motions {
    position: absolute;
    inset: 0;
    color: #141414;
  }

  /* Section heads reuse the shared script face at a sub-title size. */
  .section-head {
    font-size: 48px;
  }

  .mini {
    position: absolute;
    border: 1px solid #c4c4cc;
    box-sizing: border-box;
  }

  /* Mid-motion staff overlay: same 950-space as the pictograph beneath. */
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
    font-size: 36px;
    font-weight: 700;
    line-height: 1;
  }

  .rule {
    position: absolute;
    background: #141414;
  }
  .rule.heavy {
    height: 2.5px;
  }
  .rule.hair {
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

  .run {
    position: absolute;
    line-height: 1;
    white-space: nowrap;
    text-align: center;
  }
  /* Prospin/Antispin side labels - display serif italic (mode-name style). */
  .run.mode {
    font-family: var(--guide-display);
    font-style: italic;
    font-weight: 600;
  }
  .run.frame {
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
  }
  .run.cap {
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
    color: #3c3c46;
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
