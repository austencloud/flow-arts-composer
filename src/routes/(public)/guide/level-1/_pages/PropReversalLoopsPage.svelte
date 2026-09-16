<script lang="ts">
  /**
   * Prop-Reversal LOOPs - body page (manifest `prop-reversal-loops`), faithful
   * to "1.2 - Prop-Reversal Permutations, EΣQY, TWKΘ, BΔMX" artboard (old p42;
   * "Prop-reversal CAPs" - CAP→LOOP facelift).
   *
   * Three 8-step Rotated LOOPs that each REQUIRE prop-reversals (Start + 2
   * rows of 4, real staff pictographs). Reversal dots are DERIVED via
   * bakeReversals and land exactly where the artboard drew its R marks:
   *   EΣQY - red R on 2, 3, 6, 7 (the pro Σ/Q corners flip red's rotation);
   *   blue rides CCW with statics between. E[6] Σ[7] Q[5] Y[2] / E[5] Σ[4]
   *   Q[6] Y[0].
   *   TWKΘ - blue R on 2 and 8, red R on 4 and 6, both on 5. T[8] W[10] K[1]
   *   Θ[2] / T[3] W[0] K[6] Θ[8].
   *   BΔMX - red R on 3, 5, 7; red stops (static) on 2, 4, 6, 8 and still
   *   reverses across the stop, which is the page's teaching point. B Δ[10]
   *   M[0] X[10] / B Δ[8] M[2] X[8].
   * Every step MCP-verified against list_letter_variations this build.
   *
   * Reader: each LOOP is one clickable strip playing Start + 8 steps.
   *
   * Geometry off the artboard scan (20px/pt): 91.8pt cells; Start x 114.8, step
   * rows x 206.6; strips y 118.2/210, 316.5/408.3, 511.2/603; heavy rules
   * y 104.6/309/505.8.
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

  // ── Step authoring (shift + per-step static, both orientation-tracked) ─────
  const HP_CW = new Set(["s-w", "w-n", "n-e", "e-s"]);
  const flip = (o: Orientation) => (o === IN ? OUT : IN);
  type HandStep = { anti?: boolean; still?: boolean; from: GridLocation; to: GridLocation; so: Orientation };
  const h = (anti: boolean, from: GridLocation, to: GridLocation, so: Orientation = IN): HandStep => ({ anti, from, to, so });
  const sh = (loc: GridLocation, so: Orientation = IN): HandStep => ({ still: true, from: loc, to: loc, so });
  const handMotion = (color: HandSide, x: HandStep) => {
    if (x.still) {
      return createMotionData({
        motionType: MotionType.STATIC,
        startLocation: x.from,
        endLocation: x.to,
        startOrientation: x.so,
        endOrientation: x.so,
        color,
        propType: PropType.STAFF,
        gridMode: GridMode.DIAMOND,
      });
    }
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

  type Step = { letter: Letter; left: HandStep; right: HandStep };
  const st = (letter: Letter, left, right): Step => ({ letter, left, right });
  const { B, K, M, Q, T, W: WL, X, Y } = Letter;
  const EL = Letter.E;
  const SIG = Letter.SIGMA;
  const DEL = Letter.DELTA;
  const THE = Letter.THETA;

  type LoopDef = {
    key: string;
    word: string;
    startLetter: Letter;
    startLeft: GridLocation;
    startRight: GridLocation;
    rowYs: [number, number];
    steps: Step[];
  };
  const LOOPS: LoopDef[] = [
    {
      // EΣQY ×2 - red R derives on 2, 3, 6, 7; blue CCW throughout.
      key: "prl-esqy",
      word: "EΣQY Rotated",
      startLetter: Letter.BETA,
      startLeft: SO_,
      startRight: SO_,
      rowYs: [118.2, 210],
      steps: [
        st(EL, h(true, SO_, W), h(true, SO_, E)),
        st(SIG, sh(W, OUT), h(false, E, N, OUT)),
        st(Q, h(true, W, N, OUT), h(true, N, W, OUT)),
        st(Y, sh(N), h(false, W, N)),
        st(EL, h(true, N, E), h(true, N, W)),
        st(SIG, sh(E, OUT), h(false, W, SO_, OUT)),
        st(Q, h(true, E, SO_, OUT), h(true, SO_, E, OUT)),
        st(Y, sh(SO_), h(false, E, SO_)),
      ],
    },
    {
      // TWKΘ ×2 - blue R on 2 and 8, red R on 4 and 6, both on 5.
      key: "prl-twkt",
      word: "TWKΘ Rotated",
      startLetter: Letter.GAMMA,
      startLeft: SO_,
      startRight: E,
      rowYs: [316.5, 408.3],
      steps: [
        st(T, h(true, SO_, W), h(true, E, SO_)),
        st(WL, h(false, W, N, OUT), sh(SO_, OUT)),
        st(K, h(true, N, W, OUT), h(true, SO_, W, OUT)),
        st(THE, sh(W), h(false, W, N)),
        st(T, h(true, W, N), h(true, N, E)),
        st(WL, sh(N, OUT), h(false, E, SO_, OUT)),
        st(K, h(true, N, E, OUT), h(true, SO_, E, OUT)),
        st(THE, h(false, E, SO_), sh(E)),
      ],
    },
    {
      // BΔMX ×2 - red R on 3, 5, 7 with red stopping on the even steps; blue
      // CCW throughout.
      key: "prl-bdmx",
      word: "BΔMX Rotated",
      startLetter: Letter.ALPHA,
      startLeft: SO_,
      startRight: N,
      rowYs: [511.2, 603],
      steps: [
        st(B, h(true, SO_, W), h(true, N, E)),
        st(DEL, h(true, W, N, OUT), sh(E, OUT)),
        st(M, h(false, N, W), h(false, E, SO_, OUT)),
        st(X, h(true, W, N), sh(SO_, OUT)),
        st(B, h(true, N, E, OUT), h(true, SO_, W, OUT)),
        st(DEL, h(true, E, SO_), sh(W)),
        st(M, h(false, SO_, E, OUT), h(false, W, N)),
        st(X, h(true, E, SO_, OUT), sh(N)),
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
  const startBox = (l: LoopDef): StepData =>
    ({
      id: `${l.key}-0`,
      letter: l.startLetter,
      gridMode: GridMode.DIAMOND,
      stepNumber: 0,
      startPlacement: getGridPlacementFromLocations(l.startLeft, l.startRight),
      endPlacement: getGridPlacementFromLocations(l.startLeft, l.startRight),
      motions: {
        left: handMotion(HandSide.LEFT, sh(l.startLeft)),
        right: handMotion(HandSide.RIGHT, sh(l.startRight)),
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
  const CELL = 91.8;
  const START_X = 114.8;
  const ROW_X = 206.6;
  const RULES = [104.6, 309, 505.8];
  const MARGINS = [
    { t: "EΣQY", y: 155 },
    { t: "TWKΘ", y: 353 },
    { t: "BΔMX", y: 548 },
  ];

  // ── Text (LOOP + step-not-beat facelift) ────────────────────────────────────
  type Para = { y: number; fs: number; lh: number; html: string };
  let PARAS: Para[] = $state([
    {
      y: 62,
      fs: 15,
      lh: 18,
      html:
        "Each of these words uses a prop-reversal.<br>" +
        "These examples are <em>Rotated LOOPs</em>.",
    },
    {
      y: 722,
      fs: 15,
      lh: 18,
      html:
        'In this example of BΔMX, the <strong class="cR">right</strong> hand stops on steps 2 and 4 before resuming its ' +
        "motion around the center point. Even when there is a step with no motion in<br>" +
        "between, we can still mark the reversal with an “<strong class=\"cR\">R</strong>” to indicate the prop reversal.",
    },
  ]);

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("Prop-Reversal LOOPs (prop-reversal-loops)", () =>
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

<div class="pr-loops">
  {#each RULES as ry (ry)}
    <div class="rule" style="left:{20 * S}px; top:{ry * S}px; width:{572 * S}px"></div>
  {/each}

  <!-- Margin word labels. -->
  {#each MARGINS as m (m.t)}
    <span class="margin-word" style="left:{8 * S}px; top:{m.y * S}px; width:{100 * S}px; font-size:{18 * S}px"
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
      class:selected={guideEdit.selectedId === `prl-para-${i}`}
      style="top:{p.y * S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px"
      use:ptDrag={pt(`prl-para-${i}`, "para", p)}
      use:editText={{ id: `prl-para-${i}`, label: "para", get: () => p.html, set: (h2) => (p.html = h2) }}
    >
      {@html p.html}
    </p>
  {/each}
</div>

<style>
  /* Absolute layer over the whole GuidePage sheet; coords map straight to pt×S. */
  .pr-loops {
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
  .para :global(.cR) {
    color: #cc2127;
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
