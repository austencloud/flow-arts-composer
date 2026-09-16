<script lang="ts">
  /**
   * Dashes / Static turns - Level 2 body page 3 (manifest `turns-dash-static`),
   * faithful to old p4. Self-titled (two script heads).
   *
   *   Dash strip   - static S(in) → halfway (staff horizontal at the grid
   *                  center, T west) → static N(in) = DASH s→n turns=1.
   *                  Base dash flips in→out; +180° turn returns to in.
   *   Static strip - static E(in) → halfway (staff vertical at the E hand
   *                  point, T up) → static E(out) = STATIC at E turns=1 cw.
   *
   * Bottom note compares the static-turn arrow (half circle WITH the position)
   * to the shift-turn arrow (half circle around the empty start position) -
   * both drawn by the real renderer from motion data.
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
  import { bakeReversals } from "../../level-1/_data/guide-sequence-adapter";
  import { getGuideSequenceClick } from "../../level-1/_data/guide-data-context";
  import { getGuideActiveStep } from "../../level-1/_data/guide-active-step.svelte";

  const S = 816 / 612;
  const { NORTH: N, EAST: E, SOUTH: SO_ } = GridLocation;
  const { IN, OUT } = Orientation;
  const CW = RotationDirection.CLOCKWISE;
  const CCW = RotationDirection.COUNTER_CLOCKWISE;
  const NOROT = RotationDirection.NO_ROTATION;

  const selection = getSequenceSelection();
  const activeStep = getGuideActiveStep();
  const emitSequence = getGuideSequenceClick();

  const rightStaff = (
    id: string,
    type: MotionType,
    from: GridLocation,
    to: GridLocation,
    startOri: Orientation,
    endOri: Orientation,
    rot: RotationDirection,
    turns = 0
  ) => ({
    id: `l2ds-${id}`,
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
        turns,
        hand: HandSide.RIGHT,
        propType: PropType.STAFF,
        gridMode: GridMode.DIAMOND,
      }),
    },
  });
  const stat = (id: string, loc: GridLocation, ori: Orientation) =>
    rightStaff(id, MotionType.STATIC, loc, loc, ori, ori, NOROT);
  const bareGrid = (id: string) => ({
    id: `l2ds-${id}`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    motions: {
      left: createPlaceholderMotion(HandSide.LEFT),
      right: createPlaceholderMotion(HandSide.RIGHT),
    },
  });

  const STAFF_D =
    "M251.4 67.7V10.1c0-4.8-4.1-8.7-9.1-8.7s-9.1 3.9-9.1 8.7v19.2H10.3c-4.9 0-8.9 3.8-8.9 8.5V41c0 4.6 4 8.5 8.9 8.5h222.9v18.2c0 4.8 4.1 8.7 9.1 8.7s9.1-3.9 9.1-8.7z";
  const RED = "#DC2626";

  type Halfway = { x: number; y: number; deg: number };
  type RowDef = {
    y: number;
    start: ReturnType<typeof rightStaff>;
    halfway: Halfway;
    end: ReturnType<typeof rightStaff>;
    combined: ReturnType<typeof rightStaff>;
  };
  // E hand point = (475 + 143.1, 475).
  const ROWS: RowDef[] = [
    {
      // Dash + 1 turn: s→n straight handpath; staff horizontal (perpendicular
      // to the start) at the grid center, T west.
      y: 130,
      start: stat("dash-start", SO_, IN),
      halfway: { x: 475, y: 475, deg: 180 },
      end: stat("dash-end", N, IN),
      combined: rightStaff(
        "dash-full",
        MotionType.DASH,
        SO_,
        N,
        IN,
        IN,
        CCW,
        1
      ),
    },
    {
      // Static + 1 turn at E: prop pivots in place; halfway T up. CCW here draws
      // the over-the-staff arrow matching the proof strip.
      y: 465,
      start: stat("static-start", E, IN),
      halfway: { x: 618.1, y: 475, deg: -90 },
      end: stat("static-end", E, OUT),
      combined: rightStaff(
        "static-full",
        MotionType.STATIC,
        E,
        E,
        IN,
        OUT,
        CCW,
        1
      ),
    },
  ];
  const bareGrids = ["dash-half", "static-half"].map(bareGrid);

  const ROW_KEYS = ["l2ds-dash", "l2ds-static"];
  const ROW_WORDS = ["Dash with a turn", "Static turn"];
  const ROW_START_LOC = [SO_, E];
  const animStep = (
    data: ReturnType<typeof rightStaff>,
    stepNumber: number,
    leftLoc: GridLocation
  ): StepData =>
    ({
      ...data,
      id: `${data.id}-anim-${stepNumber}`,
      stepNumber,
      motions: {
        left: createPlaceholderMotion(HandSide.LEFT, {
          location: leftLoc,
          orientation: IN,
        }),
        right: data.motions.right,
      },
    }) as unknown as StepData;
  const rowSteps = (row: RowDef, ri: number): StepData[] => {
    const loc = ROW_START_LOC[ri]!;
    const [start, ...steps] = [
      animStep(row.start, 0, loc),
      animStep(row.combined, 1, loc),
    ];
    return [start!, ...bakeReversals(steps)];
  };

  // ── Layout (pt) ─────────────────────────────────────────────────────────────
  const COLS = [95, 215, 335, 455];
  const SIZE = 100;
  const rowMid = (y: number) => y + SIZE / 2;
  const FLOW_ARROWS = ROWS.flatMap((r) => [
    { x: 198, y: rowMid(r.y) },
    { x: 318, y: rowMid(r.y) },
  ]);
  const ARROW_W = 14.5;
  const EQUALS = ROWS.map((r) => ({ x: 445, y: rowMid(r.y) }));

  const HEAVY_RULE = 388;
  const HAIRLINE = 628;

  // Bottom compare boxes: static turn vs shift turn (real pictographs).
  const NOTE_STATIC = ROWS[1]!.combined;
  const NOTE_SHIFT = rightStaff(
    "note-shift",
    MotionType.PRO,
    E,
    SO_,
    IN,
    OUT,
    CW,
    1
  );
  const NOTE_Y = 682;
  const NOTE_SIZE = 92;

  type Para = { y: number; fs: number; lh: number; html: string };
  const PARAS: Para[] = [
    {
      y: 36,
      fs: 15.5,
      lh: 19,
      html: "You can also add a turn to a dash.<br>During the prop rotation, move the hand directly in a straight line.<br><strong><em>Pause at the halfway point while learning to ensure that your hand is in<br>the center point and the staff is perpendicular to your starting position.</em></strong>",
    },
    {
      y: 246,
      fs: 16,
      lh: 20,
      html: "A base dash has 1 thumb switch (in → out), therefore:<br><strong>A dash with a turn has 2 thumb switches (in → in)</strong>",
    },
    {
      y: 295,
      fs: 15.5,
      lh: 19,
      html: "Executing this move on repeat is commonly called a <strong><em>linear extension</em></strong>.<br>It feels peculiar to execute with staves because one end is in pro and the other end is in anti.",
    },
    {
      y: 345,
      fs: 15.5,
      lh: 19,
      html: "It helps to focus on the half that’s in antispin.<br>This will ensure that you pass your hand directly through the center point.",
    },
    {
      y: 408,
      fs: 15.5,
      lh: 19,
      html: "Finally, we’ll look at static turns.<br>Here is a breakdown of a static turn starting from thumb in:",
    },
    {
      y: 585,
      fs: 16,
      lh: 19,
      html: "This can be executed at any hand point, starting from either<br>thumb orientation, turning in either direction.",
    },
    {
      y: 645,
      fs: 15.5,
      lh: 19,
      html: "Note the differences between the arrow for static turns and the arrow for prospin turns:",
    },
  ];

  type Run = {
    x: number;
    y: number;
    fs: number;
    style: "mode" | "frame" | "cap" | "vtg";
    t: string;
  };
  const RUNS: Run[] = [
    { x: 24, y: 22, fs: 30, style: "mode", t: "Dashes" },
    { x: 516, y: 30, fs: 20, style: "vtg", t: "VTG: 1:1" },
    { x: 16, y: 402, fs: 30, style: "mode", t: "Static" },

    // Dash strip captions
    { x: 122, y: 118, fs: 14, style: "frame", t: "start" },
    { x: 238, y: 118, fs: 14, style: "frame", t: "halfway" },
    { x: 368, y: 118, fs: 14, style: "frame", t: "end" },
    { x: 62, y: 132, fs: 13, style: "cap", t: "thumbs:" },
    { x: 128, y: 132, fs: 13, style: "cap", t: "in" },
    { x: 372, y: 132, fs: 13, style: "cap", t: "in" },

    // Static strip captions
    { x: 122, y: 453, fs: 14, style: "frame", t: "start" },
    { x: 238, y: 453, fs: 14, style: "frame", t: "halfway" },
    { x: 368, y: 453, fs: 14, style: "frame", t: "end" },
    { x: 28, y: 505, fs: 14, style: "frame", t: "start" },
    { x: 20, y: 522, fs: 14, style: "frame", t: "thumb in" },
    { x: 552, y: 505, fs: 14, style: "frame", t: "end" },
    { x: 538, y: 522, fs: 14, style: "frame", t: "thumb out" },

    // Note boxes
    { x: 66, y: 668, fs: 24, style: "mode", t: "Static" },
    { x: 388, y: 668, fs: 24, style: "mode", t: "Shift" },
  ];

  const NOTE_TEXT = [
    {
      x: 162,
      y: 690,
      w: 130,
      html: "Prop remains at its start position. The arrow forms a half circle with that position.",
    },
    {
      x: 452,
      y: 690,
      w: 140,
      html: "Prop ends at an adjacent position. The arrow forms a half-circle around the empty start position.",
    },
  ];

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
</script>

<div class="ds-page">
  <div
    class="rule heavy"
    style="left:0; top:{HEAVY_RULE * S}px; width:{612 * S}px"
  ></div>
  <div
    class="rule hair"
    style="left:{40 * S}px; top:{HAIRLINE * S}px; width:{532 * S}px"
  ></div>

  {#each ROWS as row, ri (ri)}
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
        pictographData={row.combined}
        gridMode={GridMode.DIAMOND}
        rightPropTypeOverride={PropType.STAFF}
        {...PICTO_FLAGS}
      />
      <SelectionHit
        groupId={key}
        isGroupStart
        label={`Animate: ${ROW_WORDS[ri]}`}
        onselect={() =>
          emitSequence?.({
            strip: rowSteps(row, ri),
            word: ROW_WORDS[ri]!,
            key,
            propType: "staff",
          })}
      />
    </div>
  {/each}

  {#each FLOW_ARROWS as a (a.x + "-" + a.y)}
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
  {#each EQUALS as eq, i (i)}
    <span class="equals" style="left:{eq.x * S}px; top:{eq.y * S}px">=</span>
  {/each}

  <!-- Bottom compare: static-turn arrow vs shift-turn arrow. -->
  <div
    class="note-divider"
    style="left:{306 * S}px; top:{660 * S}px; height:{116 * S}px"
  ></div>
  <div
    class="mini"
    style="left:{60 * S}px; top:{NOTE_Y * S}px; width:{NOTE_SIZE *
      S}px; height:{NOTE_SIZE * S}px"
  >
    <PictographContainer
      pictographData={NOTE_STATIC}
      gridMode={GridMode.DIAMOND}
      rightPropTypeOverride={PropType.STAFF}
      {...PICTO_FLAGS}
    />
  </div>
  <div
    class="mini"
    style="left:{344 * S}px; top:{NOTE_Y * S}px; width:{NOTE_SIZE *
      S}px; height:{NOTE_SIZE * S}px"
  >
    <PictographContainer
      pictographData={NOTE_SHIFT}
      gridMode={GridMode.DIAMOND}
      rightPropTypeOverride={PropType.STAFF}
      {...PICTO_FLAGS}
    />
  </div>
  {#each NOTE_TEXT as n (n.x)}
    <p
      class="note-text"
      style="left:{n.x * S}px; top:{n.y * S}px; width:{n.w * S}px"
    >
      {@html n.html}
    </p>
  {/each}

  {#each PARAS as p, i (i)}
    <p
      class="para"
      style="top:{p.y * S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px"
    >
      {@html p.html}
    </p>
  {/each}
  {#each RUNS as r, i (i)}
    <span
      class="run {r.style}"
      style="left:{r.x * S}px; top:{r.y * S}px; font-size:{r.fs * S}px"
      >{r.t}</span
    >
  {/each}
</div>

<style>
  .ds-page {
    position: absolute;
    inset: 0;
    color: #141414;
  }
  .mini {
    position: absolute;
    border: 1px solid #c4c4cc;
    box-sizing: border-box;
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
  .note-divider {
    position: absolute;
    width: 2px;
    background: #141414;
  }
  .note-text {
    position: absolute;
    margin: 0;
    font-family: "Cambria", Georgia, serif;
    font-size: 17px;
    line-height: 1.35;
    text-align: left;
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
  }
  .run.mode {
    font-family: var(--guide-display);
    font-style: italic;
    font-weight: 600;
  }
  .run.vtg {
    font-family: var(--guide-display);
    font-style: italic;
  }
  .run.frame,
  .run.cap {
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
  }
  .run.cap {
    color: #3c3c46;
  }
</style>
