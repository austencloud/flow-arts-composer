<script lang="ts">
  /**
   * Type 2 LOOPs - body page (manifest `type2-loops`), faithful to
   * "1.2 - Type 2 Permutations - BΣTX, EΔUZ, OYHΘ" artboard (old p39;
   * "Type 2 CAPs" - CAP→LOOP facelift, lowercase γ).
   *
   * Three 8-step LOOPs using Type 2 letters to travel between α/β and γ
   * (Start + 2 rows of 4, real staff pictographs). Each repetition is rotated
   * 180°, so all three are Rotated LOOPs:
   *   BΣTX - α↔γ via Σ (static + pro) and X (static + anti). Variations
   *   Σ[7] T[3] X[0] / Σ[4] T[1] X[2]; B by symmetry. Blue prop CCW with
   *   statics between, red CCW throughout.
   *   EΔUZ - β↔γ via Δ/Z (static + anti). E[6] Δ[7] U[7] Z[7] / E[5] Δ[4]
   *   U[5] Z[4]. Blue CCW, red CW.
   *   OYHΘ - γ↔β via Y/Θ (static + pro) with H (β→β dual-anti) between.
   *   O[6] Y[7] H[3] Θ[7] / O[5] Y[4] H[1] Θ[4]. Both hands CCW.
   * Every step MCP-verified against list_letter_variations this build; constant
   * per-hand prop rotation (statics inert) means bakeReversals derives NO
   * reversal flags, matching the artboard.
   *
   * Reader: each LOOP is one clickable strip playing Start + 8 steps.
   *
   * Geometry off the artboard scan (20px/pt): 89.2pt cells; Start x 104.3, step
   * rows x 199.6; strips y 163.4/254.6, 372.1/463.3, 577.3/668.5; heavy rules
   * y 355.5/561.9.
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
  const { B, U, O, T, H: HL, X, Y, Z } = Letter;
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
      // BΣTX ×2 - α↔γ; blue CCW (statics between), red CCW throughout.
      key: "t2l-bstx",
      word: "BΣTX Rotated",
      startLetter: Letter.ALPHA,
      startLeft: SO_,
      startRight: N,
      rowYs: [163.4, 254.6],
      steps: [
        st(B, h(true, SO_, W), h(true, N, E)),
        st(SIG, sh(W, OUT), h(false, E, N, OUT)),
        st(T, h(true, W, N, OUT), h(true, N, E, OUT)),
        st(X, sh(N), h(true, E, SO_)),
        st(B, h(true, N, E), h(true, SO_, W, OUT)),
        st(SIG, sh(E, OUT), h(false, W, SO_)),
        st(T, h(true, E, SO_, OUT), h(true, SO_, W)),
        st(X, sh(SO_), h(true, W, N, OUT)),
      ],
    },
    {
      // EΔUZ ×2 - β↔γ; blue CCW, red CW.
      key: "t2l-eduz",
      word: "EΔUZ Rotated",
      startLetter: Letter.BETA,
      startLeft: SO_,
      startRight: SO_,
      rowYs: [372.1, 463.3],
      steps: [
        st(EL, h(true, SO_, W), h(true, SO_, E)),
        st(DEL, sh(W, OUT), h(true, E, N, OUT)),
        st(U, h(true, W, N, OUT), h(false, N, E)),
        st(Z, sh(N), h(true, E, N)),
        st(EL, h(true, N, E), h(true, N, W, OUT)),
        st(DEL, sh(E, OUT), h(true, W, SO_)),
        st(U, h(true, E, SO_, OUT), h(false, SO_, W, OUT)),
        st(Z, sh(SO_), h(true, W, SO_, OUT)),
      ],
    },
    {
      // OYHΘ ×2 - γ↔β; both hands CCW throughout.
      key: "t2l-oyht",
      word: "OYHΘ Rotated",
      startLetter: Letter.GAMMA,
      startLeft: W,
      startRight: SO_,
      rowYs: [577.3, 668.5],
      steps: [
        st(O, h(true, W, N), h(false, SO_, E)),
        st(Y, sh(N, OUT), h(false, E, N)),
        st(HL, h(true, N, E, OUT), h(true, N, E)),
        st(THE, sh(E), h(false, E, N, OUT)),
        st(O, h(true, E, SO_), h(false, N, W, OUT)),
        st(Y, sh(SO_, OUT), h(false, W, SO_, OUT)),
        st(HL, h(true, SO_, W, OUT), h(true, SO_, W, OUT)),
        st(THE, sh(W), h(false, W, SO_)),
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
  const CELL = 89.2;
  const START_X = 104.3;
  const ROW_X = 199.6;
  const RULES = [355.5, 561.9];
  const MARGINS = [
    { t: "BΣTX", y: 198 },
    { t: "EΔUZ", y: 407 },
    { t: "OYHΘ", y: 612 },
  ];

  // ── Text (LOOP + lowercase-γ facelift) ──────────────────────────────────────
  type Para = { y: number; fs: number; lh: number; html: string };
  let PARAS: Para[] = $state([
    {
      y: 82,
      fs: 15,
      lh: 18,
      html: "These words use the Type 2 letters to travel between α/β and γ.",
    },
    {
      y: 119.6,
      fs: 15,
      lh: 18,
      html: "Since each repetition is rotated by 180°, these are all <em>Rotated LOOPs</em>.",
    },
  ]);

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("Type 2 LOOPs (type2-loops)", () =>
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

<div class="t2-loops">
  {#each RULES as ry (ry)}
    <div class="rule" style="left:{20 * S}px; top:{ry * S}px; width:{572 * S}px"></div>
  {/each}

  <!-- Margin word labels. -->
  {#each MARGINS as m (m.t)}
    <span class="margin-word" style="left:{6 * S}px; top:{m.y * S}px; width:{96 * S}px; font-size:{18 * S}px"
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
      class:selected={guideEdit.selectedId === `t2l-para-${i}`}
      style="top:{p.y * S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px"
      use:ptDrag={pt(`t2l-para-${i}`, "para", p)}
      use:editText={{ id: `t2l-para-${i}`, label: "para", get: () => p.html, set: (h2) => (p.html = h2) }}
    >
      {@html p.html}
    </p>
  {/each}
</div>

<style>
  /* Absolute layer over the whole GuidePage sheet; coords map straight to pt×S. */
  .t2-loops {
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
