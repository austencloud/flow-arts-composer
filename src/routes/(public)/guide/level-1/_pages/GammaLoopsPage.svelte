<script lang="ts">
  /**
   * Gamma LOOPs - body page (manifest `gamma-loops`), faithful to
   * "1.2 - Type 1 Gamma Permutations - SOTR, VPUQ, MVNU" artboard (old p38;
   * "Rotated CAPs" - CAP→LOOP facelift, lowercase γ).
   *
   * Three 8-step γ→γ LOOPs (Start + 2 rows of 4, real staff pictographs), each
   * word ending in gamma position on the opposite side, so one repetition
   * rotated 180° returns home - all three are Rotated LOOPs:
   *   SOTR - blue & red props ride CW the whole loop. Dataset variations
   *   S[8] O[14] T[15] R[13] / S[10] O[13] T[12] R[14].
   *   VPUQ - blue CCW / red CW throughout. V[15] P[3] U[11] Q[5] /
   *   V[12] P[1] U[8] Q[6].
   *   MVNU - blue CW / red CCW throughout. M[7] V[7] N[0] U[1] /
   *   M[5] V[5] N[2] U[3].
   * Every step MCP-verified against list_letter_variations this build; constant
   * per-hand prop rotation means bakeReversals derives NO reversal flags,
   * matching the artboard.
   *
   * Reader: each LOOP is one clickable strip playing Start + 8 steps.
   *
   * Geometry off the artboard scan (20px/pt): 89.5pt cells; Start x 111.3, step
   * rows x 203.1; SOTR y 130.1/221.2, VPUQ y 340.8/431.9, MVNU y 550.8/642;
   * heavy rules y 323.1/533.4.
   */
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import SelectionHit from "$lib/shared/selection/SelectionHit.svelte";
  import { getSequenceSelection } from "$lib/shared/selection/sequence-selection.svelte";
  import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import {
    MotionType,
    HandSide,
    Orientation,
    RotationDirection,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { GridMode, GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
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

  const HP_CW = new Set(["s-w", "w-n", "n-e", "e-s"]);
  const flip = (o: Orientation) => (o === IN ? OUT : IN);
  type HandStep = { anti: boolean; from: GridLocation; to: GridLocation; so: Orientation };
  const h = (anti: boolean, from: GridLocation, to: GridLocation, so: Orientation = IN): HandStep => ({ anti, from, to, so });
  const handMotion = (color: HandSide, x: HandStep) => {
    const dir = HP_CW.has(`${x.from}-${x.to}`) ? CW : CCW;
    return createMotionData({
      motionType: x.anti ? MotionType.ANTI : MotionType.PRO,
      rotationDirection: x.anti ? (dir === CW ? CCW : CW) : dir,
      startLocation: x.from,
      endLocation: x.to,
      startOrientation: x.so,
      endOrientation: x.anti ? flip(x.so) : x.so,
      turns: 0,
      color,
      propType: PropType.STAFF,
      gridMode: GridMode.DIAMOND,
    });
  };
  const stat = (color: HandSide, loc: GridLocation) =>
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

  type Step = { letter: Letter; left: HandStep; right: HandStep };
  const st = (letter: Letter, left, right): Step => ({ letter, left, right });
  const { M, V, P, U, Q, O, T, R } = Letter;
  const NL = Letter.N;
  const SL = Letter.S;

  type LoopDef = {
    key: string;
    word: string;
    rowYs: [number, number];
    steps: Step[];
  };
  const LOOPS: LoopDef[] = [
    {
      // SOTR ×2 - both props CW throughout; second half rotated 180°.
      key: "gl-sotr",
      word: "SOTR Rotated",
      rowYs: [130.1, 221.2],
      steps: [
        st(SL, h(false, SO_, W), h(false, E, SO_)),
        st(O, h(false, W, N), h(true, SO_, E)),
        st(T, h(true, N, W), h(true, E, N, OUT)),
        st(R, h(false, W, N, OUT), h(true, N, W)),
        st(SL, h(false, N, E, OUT), h(false, W, N, OUT)),
        st(O, h(false, E, SO_, OUT), h(true, N, W, OUT)),
        st(T, h(true, SO_, E, OUT), h(true, W, SO_)),
        st(R, h(false, E, SO_), h(true, SO_, E, OUT)),
      ],
    },
    {
      // VPUQ ×2 - blue CCW / red CW throughout; second half rotated 180°.
      key: "gl-vpuq",
      word: "VPUQ Rotated",
      rowYs: [340.8, 431.9],
      steps: [
        st(V, h(false, SO_, E), h(true, E, N)),
        st(P, h(false, E, N), h(false, N, E, OUT)),
        st(U, h(false, N, W), h(true, E, N, OUT)),
        st(Q, h(true, W, N), h(true, N, W)),
        st(V, h(false, N, W, OUT), h(true, W, SO_, OUT)),
        st(P, h(false, W, SO_, OUT), h(false, SO_, W)),
        st(U, h(false, SO_, E, OUT), h(true, W, SO_)),
        st(Q, h(true, E, SO_, OUT), h(true, SO_, E, OUT)),
      ],
    },
    {
      // MVNU ×2 - blue CW / red CCW throughout; second half rotated 180°.
      key: "gl-mvnu",
      word: "MVNU Rotated",
      rowYs: [550.8, 642],
      steps: [
        st(M, h(false, SO_, W), h(false, E, N)),
        st(V, h(false, W, N), h(true, N, E)),
        st(NL, h(true, N, W), h(true, E, SO_, OUT)),
        st(U, h(false, W, N, OUT), h(true, SO_, W)),
        st(M, h(false, N, E, OUT), h(false, W, SO_, OUT)),
        st(V, h(false, E, SO_, OUT), h(true, SO_, W, OUT)),
        st(NL, h(true, SO_, E, OUT), h(true, W, N)),
        st(U, h(false, E, SO_), h(true, N, E, OUT)),
      ],
    },
  ];

  const stepData = (l: LoopDef, i: number): StepData => {
    const s = l.steps[i]!;
    return {
      id: `${l.key}-${i + 1}`,
      letter: s.letter,
      gridMode: GridMode.DIAMOND,
      startPlacement: getGridPlacementFromLocations(s.left.from, s.right.from),
      endPlacement: getGridPlacementFromLocations(s.left.to, s.right.to),
      stepNumber: i + 1,
      motions: {
        left: handMotion(HandSide.LEFT, s.left),
        right: handMotion(HandSide.RIGHT, s.right),
      },
    } as unknown as StepData;
  };
  // Start box: Γ - blue S, red E, thumbs in.
  const startBox = (l: LoopDef): StepData =>
    ({
      id: `${l.key}-0`,
      letter: Letter.GAMMA,
      gridMode: GridMode.DIAMOND,
      stepNumber: 0,
      startPlacement: getGridPlacementFromLocations(SO_, E),
      endPlacement: getGridPlacementFromLocations(SO_, E),
      motions: {
        left: stat(HandSide.LEFT, SO_),
        right: stat(HandSide.RIGHT, E),
      },
    }) as unknown as StepData;

  const resolvedStrip = (l: LoopDef): StepData[] => {
    const authored = [startBox(l), ...l.steps.map((_, i) => stepData(l, i))];
    const override = overrideStepsFor(l.key);
    const full = override && override.length > 0 ? override : authored;
    const [start, ...steps] = full;
    return [start!, ...bakeReversals(steps)];
  };
  const RESOLVED: Record<string, StepData[]> = $derived(
    Object.fromEntries(LOOPS.map((l) => [l.key, resolvedStrip(l)]))
  );
  const loopSteps = (l: LoopDef): StepData[] => RESOLVED[l.key]!;

  // ── Geometry ────────────────────────────────────────────────────────────────
  const CELL = 89.5;
  const START_X = 111.3;
  const ROW_X = 203.1;
  const RULES = [323.1, 533.4];
  const MARGINS = [
    { t: "SOTR", y: 165 },
    { t: "VPUQ", y: 375 },
    { t: "MVNU", y: 585 },
  ];

  // ── Text (LOOP + lowercase-γ facelift) ──────────────────────────────────────
  type Para = { y: number; fs: number; lh: number; html: string };
  let PARAS: Para[] = $state([
    {
      y: 59,
      fs: 15,
      lh: 18,
      html:
        "<strong>The γ→γ letters can connect to any other γ→γ letter.</strong><br>" +
        "In these examples, each word ends in gamma position on the opposite side.<br>" +
        "By repeating the word from there, we return to home position.",
    },
    {
      y: 740,
      fs: 15,
      lh: 18,
      html:
        "Note that the pictographs in each second word repetition are rotated 180°.<br>" +
        "Because of this, these examples are classified as <em>Rotated LOOPs</em>.",
    },
  ]);

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("Gamma LOOPs (gamma-loops)", () =>
      PARAS.map((p, i) => `  para[${i}]: y: ${r1(p.y)}`).join("\n")
    )
  );

  const PICTO_FLAGS = {
    showGrid: true,
    showTKA: true,
    showPlacements: false,
    showReversals: true,
    showTnD: false,
    showElemental: false,
    showNonRadialPoints: false,
    showHandPoints: true,
    darkMode: false,
    printMode: true,
    disableTransitions: true,
  } as const;
</script>

<div class="gamma-loops">
  {#each RULES as ry (ry)}
    <div class="rule" style="left:{20 * S}px; top:{ry * S}px; width:{572 * S}px"></div>
  {/each}

  <!-- Margin word labels. -->
  {#each MARGINS as m (m.t)}
    <span class="margin-word" style="left:{8 * S}px; top:{m.y * S}px; width:{96 * S}px; font-size:{19 * S}px"
      ><span class="tka-font">{m.t}</span></span
    >
  {/each}

  <!-- The three LOOPs: Start + 2 rows of 4, each one clickable strip. -->
  {#each LOOPS as l (l.key)}
    <div
      class="loop tka-seq-cell"
      class:is-hovered={selection?.isHovered(l.key)}
      class:is-selected={selection?.isSelected(l.key)}
      style="left:{START_X * S}px; top:{l.rowYs[0] * S}px; width:{(ROW_X + CELL * 4 - START_X) * S}px; height:{(l.rowYs[1] - l.rowYs[0] + CELL) * S}px"
    >
      <div
        class="mini"
        class:guide-step-active={activeStep?.key === l.key && activeStep.ringStep === 0}
        style="left:0; top:0; width:{CELL * S}px; height:{CELL * S}px"
      >
        <PictographContainer
          pictographData={RESOLVED[l.key]![0]}
          gridMode={GridMode.DIAMOND}
          leftPropTypeOverride={PropType.STAFF}
          rightPropTypeOverride={PropType.STAFF}
          stepNumberOverride={true}
          {...PICTO_FLAGS}
        />
      </div>
      {#each RESOLVED[l.key]!.slice(1) as sd, i (i)}
        <div
          class="mini"
          class:guide-step-active={activeStep?.key === l.key && activeStep.ringStep === i + 1}
          style="left:{(ROW_X - START_X + (i % 4) * CELL) * S}px; top:{(Math.floor(i / 4) * (l.rowYs[1] - l.rowYs[0])) * S}px; width:{CELL * S}px; height:{CELL * S}px"
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
        groupId={l.key}
        isGroupStart
        label={`Animate the ${l.word} LOOP`}
        onselect={() => emitSequence?.({ strip: loopSteps(l), word: l.word, key: l.key, propType: "staff" })}
      />
    </div>
  {/each}

  <!-- Paragraphs (artboard coords). -->
  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `gl-para-${i}`}
      style="top:{p.y * S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px"
      use:ptDrag={pt(`gl-para-${i}`, "para", p)}
      use:editText={{ id: `gl-para-${i}`, label: "para", get: () => p.html, set: (h2) => (p.html = h2) }}
    >
      {@html p.html}
    </p>
  {/each}
</div>

<style>
  /* Absolute layer over the whole GuidePage sheet; coords map straight to pt×S. */
  .gamma-loops {
    position: absolute;
    inset: 0;
    color: #141414;
  }

  .rule {
    position: absolute;
    height: 2.5px;
    background: #141414;
  }

  .loop {
    position: absolute;
  }

  .mini {
    position: absolute;
    border: 1px solid #c4c4cc;
    box-sizing: border-box;
  }

  .margin-word {
    position: absolute;
    font-family: "Cambria", Georgia, "Times New Roman", serif;
    text-align: center;
    line-height: 1;
    white-space: nowrap;
  }
  .margin-word .tka-font {
    font-weight: normal;
    letter-spacing: 0.06em;
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
