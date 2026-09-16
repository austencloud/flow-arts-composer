<script lang="ts">
  /**
   * Type 2 - Shift (letters) - body page (manifest `lt2-wxyz`), faithful to
   * proof p27 / "1.1 - Type 2 - Shifts" artboard.
   *
   * A Shift = one shift + one static (MCP: all eight letters blue-static +
   * red-shift; W/Y/Σ/Θ red pro, X/Z/Δ/Ω red anti). All real staff pictographs:
   *   Four 2-cell boxes by end position + opening/closing:
   *     γ→α OPEN  (W X: blue static W, red s→e) · γ→β CLOSE (Y Z: blue static
   *     S, red w→s) · α→γ CLOSE (Σ Δ: blue static W, red e→s) · β→γ OPEN
   *     (Θ Ω: blue static S, red s→e).
   *   Word rows - WΣYΘ (pro) and XΔZΩ (anti) from the shared γ Start
   *   (blue S / red E): red cycles the CCW loop e→n→w→s→e while blue rests.
   * Anti letters flip the thumb (in→out); the anti word alternates.
   *
   * selfTitled: the page paints "Type 2 - Shift" with the canonical Type-2
   * purple. Facelift: lowercase γ in prose. Reader: every box cell and word
   * row click-animates with staffs.
   *
   * Geometry off the artboard border scan (20px/pt): letter boxes 90pt cells
   * at x 97/334.9, rows y 193.6/325.5; word rows 99.9pt cells at x 156.1,
   * y 494.3/594.2, shared Start (56.1, 544.2). Text at PROOF_TEXT coords.
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
  import {
    GridMode,
    GridLocation,
    GridPlacement,
  } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { Letter } from "$lib/shared/foundation/domain/models/letter";
  import { LETTER_TYPE_COLORS } from "$lib/shared/pictograph/shared/domain/constants/pictograph-constants";
  import { LetterType } from "$lib/shared/foundation/domain/models/letter-type";
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
  const { NORTH: N, EAST: E, SOUTH: SO_, WEST: W } = GridLocation;
  const { IN, OUT } = Orientation;
  const CW = RotationDirection.CLOCKWISE;
  const CCW = RotationDirection.COUNTER_CLOCKWISE;
  const T2_PURPLE = LETTER_TYPE_COLORS[LetterType.TYPE2][0];

  // Reader wiring (all null on /print,/book - pages stay pristine).
  const selection = getSequenceSelection();
  const activeStep = getGuideActiveStep();
  const emitSequence = getGuideSequenceClick();

  const HP_CW = new Set(["s-w", "w-n", "n-e", "e-s"]);
  const hpDir = (from: GridLocation, to: GridLocation) =>
    HP_CW.has(`${from}-${to}`) ? CW : CCW;
  const rightShift = (
    from: GridLocation,
    to: GridLocation,
    anti: boolean,
    so: Orientation
  ) => {
    const dir = hpDir(from, to);
    return createMotionData({
      motionType: anti ? MotionType.ANTI : MotionType.PRO,
      rotationDirection: anti ? (dir === CW ? CCW : CW) : dir,
      startLocation: from,
      endLocation: to,
      startOrientation: so,
      endOrientation: anti ? (so === IN ? OUT : IN) : so,
      turns: 0,
      hand: HandSide.RIGHT,
      propType: PropType.STAFF,
      gridMode: GridMode.DIAMOND,
    });
  };
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

  type CellDef = {
    letter: Letter;
    name: string;
    leftLoc: GridLocation;
    from: GridLocation;
    to: GridLocation;
    anti: boolean;
    so?: Orientation;
  };
  const step = (c: CellDef, id: string, stepNumber: number | null): StepData =>
    ({
      id,
      letter: c.letter,
      gridMode: GridMode.DIAMOND,
      startPlacement: getGridPlacementFromLocations(c.leftLoc, c.from),
      endPlacement: getGridPlacementFromLocations(c.leftLoc, c.to),
      stepNumber,
      motions: {
        left: staticHand(HandSide.LEFT, c.leftLoc),
        right: rightShift(c.from, c.to, c.anti, c.so ?? IN),
      },
    }) as unknown as StepData;

  const startFor = (
    leftLoc,
    rightLoc,
    id: string,
    letter: Letter | null = null
  ): StepData =>
    ({
      id,
      letter,
      gridMode: GridMode.DIAMOND,
      stepNumber: 0,
      startPlacement: getGridPlacementFromLocations(leftLoc, rightLoc),
      endPlacement: getGridPlacementFromLocations(leftLoc, rightLoc),
      motions: {
        left: staticHand(HandSide.LEFT, leftLoc),
        right: staticHand(HandSide.RIGHT, rightLoc),
      },
    }) as unknown as StepData;

  // ── The four letter boxes ───────────────────────────────────────────────────
  type BoxDef = {
    x: number;
    y: number;
    label: { start: GridPlacement; end: GridPlacement; t: string };
    tag: "OPEN" | "CLOSE";
    cells: CellDef[];
  };
  const BOXES: BoxDef[] = [
    {
      x: 97,
      y: 193.6,
      label: { start: GridPlacement.GAMMA1, end: GridPlacement.ALPHA1, t: "γ→α" },
      tag: "OPEN",
      cells: [
        {
          letter: Letter.W,
          name: "W",
          leftLoc: W,
          from: SO_,
          to: E,
          anti: false,
        },
        {
          letter: Letter.X,
          name: "X",
          leftLoc: W,
          from: SO_,
          to: E,
          anti: true,
        },
      ],
    },
    {
      x: 334.9,
      y: 193.6,
      label: { start: GridPlacement.GAMMA1, end: GridPlacement.BETA1, t: "γ→β" },
      tag: "CLOSE",
      cells: [
        {
          letter: Letter.Y,
          name: "Y",
          leftLoc: SO_,
          from: W,
          to: SO_,
          anti: false,
        },
        {
          letter: Letter.Z,
          name: "Z",
          leftLoc: SO_,
          from: W,
          to: SO_,
          anti: true,
        },
      ],
    },
    {
      x: 97,
      y: 325.5,
      label: { start: GridPlacement.ALPHA1, end: GridPlacement.GAMMA1, t: "α→γ" },
      tag: "CLOSE",
      cells: [
        {
          letter: Letter.SIGMA,
          name: "Σ",
          leftLoc: W,
          from: E,
          to: SO_,
          anti: false,
        },
        {
          letter: Letter.DELTA,
          name: "Δ",
          leftLoc: W,
          from: E,
          to: SO_,
          anti: true,
        },
      ],
    },
    {
      x: 334.9,
      y: 325.5,
      label: { start: GridPlacement.BETA1, end: GridPlacement.GAMMA1, t: "β→γ" },
      tag: "OPEN",
      cells: [
        {
          letter: Letter.THETA,
          name: "Θ",
          leftLoc: SO_,
          from: SO_,
          to: E,
          anti: false,
        },
        {
          letter: Letter.OMEGA,
          name: "Ω",
          leftLoc: SO_,
          from: SO_,
          to: E,
          anti: true,
        },
      ],
    },
  ];
  const NAMES = [
    { t: "Sigma", cx: 142 },
    { t: "Delta", cx: 232 },
    { t: "Theta", cx: 379.9 },
    { t: "Omega", cx: 469.9 },
  ];

  // ── Word rows: red cycles CCW e→n→w→s→e from the shared γ Start ─────────────
  const RED_CCW: [GridLocation, GridLocation][] = [
    [E, N],
    [N, W],
    [W, SO_],
    [SO_, E],
  ];
  type RowDef = {
    key: string;
    word: string;
    letters: Letter[];
    names: string[];
    y: number;
    anti: boolean;
  };
  const ROWS: RowDef[] = [
    {
      key: "t2w-pro",
      word: "WΣYΘ",
      letters: [Letter.W, Letter.SIGMA, Letter.Y, Letter.THETA],
      names: ["W", "Σ", "Y", "Θ"],
      y: 494.3,
      anti: false,
    },
    {
      key: "t2w-anti",
      word: "XΔZΩ",
      letters: [Letter.X, Letter.DELTA, Letter.Z, Letter.OMEGA],
      names: ["X", "Δ", "Z", "Ω"],
      y: 594.2,
      anti: true,
    },
  ];
  const rowCell = (r: RowDef, i: number): CellDef => ({
    letter: r.letters[i]!,
    name: r.names[i]!,
    leftLoc: SO_,
    from: RED_CCW[i]![0],
    to: RED_CCW[i]![1],
    anti: r.anti,
    so: r.anti && i % 2 === 1 ? OUT : IN,
  });
  const rowSteps = (r: RowDef): StepData[] => [
    startFor(SO_, E, `t2w-start`),
    ...[0, 1, 2, 3].map((i) =>
      step(rowCell(r, i), `${r.key}-s-${i + 1}`, i + 1)
    ),
  ];
  const boxCellSteps = (c: CellDef, key: string): StepData[] => [
    startFor(c.leftLoc, c.from, `${key}-start`),
    step(c, `${key}-s-1`, 1),
  ];

  // Override-aware resolution: an admin override (guide-overrides.svelte)
  // replaces the WHOLE strip when present; reversal dots are always DERIVED
  // via bakeReversals, never hand-authored. Reactive ($derived) so a
  // save/revert/reset while the reader is open re-renders these cells without
  // a refresh.
  const resolvedBoxCellSteps = (c: CellDef, key: string): StepData[] => {
    const authored = boxCellSteps(c, key);
    const override = overrideStepsFor(key);
    const full = override && override.length > 0 ? override : authored;
    const [start, ...steps] = full;
    return [start!, ...bakeReversals(steps)];
  };
  const resolvedRowSteps = (r: RowDef): StepData[] => {
    const authored = rowSteps(r);
    const override = overrideStepsFor(r.key);
    const full = override && override.length > 0 ? override : authored;
    const [start, ...steps] = full;
    return [start!, ...bakeReversals(steps)];
  };
  const RESOLVED_BOX: Record<string, StepData[]> = $derived(
    Object.fromEntries(
      BOXES.flatMap((box) =>
        box.cells.map((c) => [
          `t2-${c.name}`,
          resolvedBoxCellSteps(c, `t2-${c.name}`),
        ])
      )
    )
  );
  const RESOLVED_ROWS: Record<string, StepData[]> = $derived(
    Object.fromEntries(ROWS.map((r) => [r.key, resolvedRowSteps(r)]))
  );

  // ── Geometry ────────────────────────────────────────────────────────────────
  const BCELL = 90;
  const WCELL = 99.9;
  const WORD_X = 156.1;
  const START_BOX = { x: 56.1, y: 544.2 };
  const ROW_KEYS = ["t2w-pro", "t2w-anti"];

  // ── Text at proof coords (Γ→γ facelift) ─────────────────────────────────────
  type Para = {
    x: number;
    y: number;
    fs: number;
    lh: number;
    bold?: boolean;
    html: string;
  };
  let PARAS: Para[] = $state([
    {
      x: 0,
      y: 52.5,
      fs: 15,
      lh: 18,
      html:
        "So far we’ve learned how to move between α↔β and between γ↔γ.<br>" +
        `In order to travel between these two modes, we can use a Type 2 Motion called a <strong style="color:${T2_PURPLE}">Shift</strong>.`,
    },
    {
      x: 0,
      y: 106.5,
      fs: 15,
      lh: 18,
      html:
        `<strong>A <span style="color:${T2_PURPLE}">Shift</span> (or single shift) is the combination of one shift and one static motion.</strong><br>` +
        "Their letters are organized by end position: α, β, then γ.<br>" +
        "These can also be categorized by opening or closing.",
    },
    {
      x: 0,
      y: 449.9,
      fs: 16,
      lh: 19.2,
      html: "When we arrange them in continuous motions, we get the words WΣYΘ and XΔZΩ.",
    },
    {
      x: 0,
      y: 720.8,
      fs: 16,
      lh: 19.2,
      html:
        "Though simple at this stage, these motions become more complex<br>" +
        "as we dive deeper into the Alphabet and add rotations to static motions.",
    },
  ]);

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("Type 2 Shift letters (lt2-wxyz)", () =>
      PARAS.map((p, i) => `  para[${i}]: x: ${r1(p.x)}, y: ${r1(p.y)}`).join(
        "\n"
      )
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
</script>

<div class="t2-letters">
  <!-- selfTitled: the calligraphic title with the canonical Type-2 purple. -->
  <div class="guide-title">
    Type 2 - <span style="color:{T2_PURPLE}">Shift</span>
  </div>

  <!-- The four letter boxes with position labels + OPEN/CLOSE tags. -->
  {#each BOXES as box, bi (bi)}
    <span
      class="box-label glyph"
      style="left:{box.x * S}px; top:{(box.y - 18) * S}px"
    >
      <svg
        class="pos-glyph"
        viewBox="360 50 230 75"
        role="img"
        aria-label={box.label.t}
        style="height:{15 * S}px"
      >
        <PlacementGlyph
          startPlacement={box.label.start}
          endPlacement={box.label.end}
        />
      </svg>
    </span>
    <span
      class="box-tag"
      style="left:{(box.x + BCELL * 2 - 60) * S}px; top:{(box.y - 16) *
        S}px; width:{60 * S}px; font-size:{12 * S}px">{box.tag}</span
    >
    {#each box.cells as c, ci (ci)}
      {@const key = `t2-${c.name}`}
      <div
        class="mini tka-seq-cell"
        class:is-hovered={selection?.isHovered(key)}
        class:is-selected={selection?.isSelected(key)}
        class:guide-step-active={activeStep?.key === key}
        style="left:{(box.x + ci * BCELL) * S}px; top:{box.y *
          S}px; width:{BCELL * S}px; height:{BCELL * S}px"
      >
        <PictographContainer
          pictographData={RESOLVED_BOX[key]![1]}
          gridMode={GridMode.DIAMOND}
          leftPropTypeOverride={PropType.STAFF}
          rightPropTypeOverride={PropType.STAFF}
          {...PICTO_FLAGS}
        />
        <SelectionHit
          groupId={key}
          isGroupStart
          label={`Animate letter ${c.name}`}
          onselect={() =>
            emitSequence?.({
              strip: RESOLVED_BOX[key]!,
              word: `Letter ${c.name}`,
              key,
              propType: "staff",
            })}
        />
      </div>
    {/each}
  {/each}

  <!-- Greek letter names under the second box row. -->
  {#each NAMES as nm (nm.t)}
    <span
      class="name"
      style="left:{(nm.cx - 40) * S}px; top:{416 * S}px; width:{80 *
        S}px; font-size:{13 * S}px">{nm.t}</span
    >
  {/each}

  <!-- Shared γ Start box (rings while either word plays). -->
  <div
    class="mini"
    class:guide-step-active={activeStep?.key != null &&
      ROW_KEYS.includes(activeStep.key) &&
      activeStep.ringStep === 0}
    style="left:{START_BOX.x * S}px; top:{START_BOX.y * S}px; width:{WCELL *
      S}px; height:{WCELL * S}px"
  >
    <PictographContainer
      pictographData={startFor(SO_, E, "t2w-startbox", Letter.GAMMA)}
      gridMode={GridMode.DIAMOND}
      leftPropTypeOverride={PropType.STAFF}
      rightPropTypeOverride={PropType.STAFF}
      stepNumberOverride={true}
      {...PICTO_FLAGS}
    />
  </div>

  <!-- The two word rows (numbered steps, clickable strips). -->
  {#each ROWS as r (r.key)}
    <div
      class="strip-wrap tka-seq-cell"
      class:is-hovered={selection?.isHovered(r.key)}
      class:is-selected={selection?.isSelected(r.key)}
      style="left:{WORD_X * S}px; top:{r.y * S}px; width:{WCELL *
        4 *
        S}px; height:{WCELL * S}px"
    >
      {#each RESOLVED_ROWS[r.key]!.slice(1) as sd, i (i)}
        <div
          class="mini cell"
          class:guide-step-active={activeStep?.key === r.key &&
            activeStep.ringStep === i + 1}
          style="left:{i * WCELL * S}px; top:0; width:{WCELL *
            S}px; height:{WCELL * S}px"
        >
          <PictographContainer
            pictographData={sd}
            gridMode={GridMode.DIAMOND}
            leftPropTypeOverride={PropType.STAFF}
            rightPropTypeOverride={PropType.STAFF}
            stepNumberOverride={true}
            {...PICTO_FLAGS}
          />
        </div>
      {/each}
      <SelectionHit
        groupId={r.key}
        isGroupStart
        label={`Animate the word ${r.word}`}
        onselect={() =>
          emitSequence?.({
            strip: RESOLVED_ROWS[r.key]!,
            word: r.word,
            key: r.key,
            propType: "staff",
          })}
      />
    </div>
  {/each}

  <!-- Paragraphs (proof coords). -->
  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `t2w-para-${i}`}
      style="top:{p.y * S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px"
      use:ptDrag={pt(`t2w-para-${i}`, "para", p)}
      use:editText={{
        id: `t2w-para-${i}`,
        label: "para",
        get: () => p.html,
        set: (h) => (p.html = h),
      }}
    >
      {@html p.html}
    </p>
  {/each}
</div>

<style>
  /* Absolute layer over the whole GuidePage sheet; coords map straight to pt×S. */
  .t2-letters {
    position: absolute;
    inset: 0;
    color: #141414;
  }

  .strip-wrap {
    position: absolute;
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
  .box-tag {
    position: absolute;
    font-family: "Cambria", Georgia, "Times New Roman", serif;
    font-style: italic;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-align: right;
    line-height: 1;
  }

  .name {
    position: absolute;
    font-family: "Cambria", Georgia, "Times New Roman", serif;
    font-style: italic;
    text-align: center;
    line-height: 1;
    white-space: nowrap;
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
