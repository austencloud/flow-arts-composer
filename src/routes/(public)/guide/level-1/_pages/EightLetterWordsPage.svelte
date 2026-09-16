<script lang="ts">
  /**
   * 8-Letter Words - body page (manifest `eight-letter-words`), faithful to
   * "1.2 - 8-Letter Words" artboard (word 2 reads CΣNZIΘUW - the U is a U, dataset-confirmed) (old p41; CAP→LOOP
   * facelift).
   *
   * FLAGGED LAYOUT DEVIATION: the original artboard is LANDSCAPE (Start + 8
   * across). This book is portrait, so each word reflows to the 16-count
   * layout: Start + 4 rows of 4. Content (every motion) is unchanged.
   *
   * Two 8-letter words, each repeated twice → 16 counts:
   *   IIΩXKEΣY - Rotated LOOP (second repetition = 180° rotation). Variations
   *   I[1] I[2] Ω[5] X[4] K[6] E[7] Σ[14] Y[15] / I[3] I[0] Ω[6] X[7] K[5]
   *   E[4] Σ[13] Y[12]. Blue prop CCW, red CW throughout - no reversals.
   *   CΣNZIΘUW - Mirrored + Swapped LOOP. C Σ[0] N[6] Z[7] I[13] Θ[12] U[8]
   *   W[15] / C Σ[12] N[7] Z[10] I[3] Θ[0] U[5] W[2]. Blue CCW, red CW
   *   throughout - fully continuous, no reversal flags.
   * Every step MCP-verified against list_letter_variations this build.
   *
   * Reader: each word is one clickable strip playing Start + 16 steps.
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
  const { C, I, K, U, W: WL, X, Y, Z } = Letter;
  const NL = Letter.N;
  const EL = Letter.E;
  const SIG = Letter.SIGMA;
  const THE = Letter.THETA;
  const OME = Letter.OMEGA;

  type SeqDef = {
    key: string;
    word: string;
    tag: string;
    rowY: number;
    startLetter: Letter;
    startLeft: GridLocation;
    startRight: GridLocation;
    steps: Step[];
  };
  const SEQS: SeqDef[] = [
    {
      // IIΩXKEΣY ×2 - Rotated LOOP; blue CCW, red CW throughout.
      key: "el-iixksy",
      word: "IIΩXKEΣY",
      tag: "Rotated LOOP",
      rowY: 96,
      startLetter: Letter.BETA,
      startLeft: SO_,
      startRight: SO_,
      steps: [
        st(I, h(true, SO_, W), h(false, SO_, W)),
        st(I, h(true, W, N, OUT), h(false, W, N)),
        st(OME, sh(N), h(true, N, W)),
        st(X, sh(N), h(true, W, SO_, OUT)),
        st(K, h(true, N, E), h(true, SO_, E)),
        st(EL, h(true, E, SO_, OUT), h(true, E, N, OUT)),
        st(SIG, h(false, SO_, E), sh(N)),
        st(Y, h(false, E, N), sh(N)),
        st(I, h(true, N, E), h(false, N, E)),
        st(I, h(true, E, SO_, OUT), h(false, E, SO_)),
        st(OME, sh(SO_), h(true, SO_, E)),
        st(X, sh(SO_), h(true, E, N, OUT)),
        st(K, h(true, SO_, W), h(true, N, W)),
        st(EL, h(true, W, N, OUT), h(true, W, SO_, OUT)),
        st(SIG, h(false, N, W), sh(SO_)),
        st(Y, h(false, W, SO_), sh(SO_)),
      ],
    },
    {
      // CΣNZIΘUW ×2 - Mirrored + Swapped LOOP; blue prop CCW and red CW the
      // whole way (fully continuous, no reversals). The margin letter is U,
      // not V - U[8]/U[5] are the dataset steps that keep both hands
      // continuous (V has no variation pairing these paths). Corrected
      // 2026-07-13 after Austen caught the discontinuity.
      key: "el-csnzvw",
      word: "CΣNZIΘUW",
      tag: "Mirrored + Swapped LOOP",
      rowY: 448,
      startLetter: Letter.ALPHA,
      startLeft: SO_,
      startRight: N,
      steps: [
        st(C, h(true, SO_, W), h(false, N, E)),
        st(SIG, sh(W, OUT), h(false, E, SO_)),
        st(NL, h(true, W, N, OUT), h(true, SO_, E)),
        st(Z, sh(N), h(true, E, N, OUT)),
        st(I, h(false, N, W), h(true, N, W)),
        st(THE, h(false, W, SO_), sh(W, OUT)),
        st(U, h(false, SO_, E), h(true, W, SO_, OUT)),
        st(WL, h(false, E, N), sh(SO_)),
        st(C, h(false, N, W), h(true, SO_, E)),
        st(SIG, h(false, W, SO_), sh(E, OUT)),
        st(NL, h(true, SO_, W), h(true, E, N, OUT)),
        st(Z, h(true, W, N, OUT), sh(N)),
        st(I, h(true, N, E), h(false, N, E)),
        st(THE, sh(E, OUT), h(false, E, SO_)),
        st(U, h(true, E, SO_, OUT), h(false, SO_, W)),
        st(WL, sh(SO_), h(false, W, N)),
      ],
    },
  ];

  const stepData = (q: SeqDef, i: number): StepData => {
    const s = q.steps[i]!;
    return {
      id: `${q.key}-${i + 1}`,
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
  const startBox = (q: SeqDef): StepData =>
    ({
      id: `${q.key}-0`,
      letter: q.startLetter,
      gridMode: GridMode.DIAMOND,
      stepNumber: 0,
      startPlacement: getGridPlacementFromLocations(q.startLeft, q.startRight),
      endPlacement: getGridPlacementFromLocations(q.startLeft, q.startRight),
      motions: {
        left: handMotion(HandSide.LEFT, sh(q.startLeft)),
        right: handMotion(HandSide.RIGHT, sh(q.startRight)),
      },
    }) as unknown as StepData;

  const resolvedStrip = (q: SeqDef): StepData[] => {
    const authored = [startBox(q), ...q.steps.map((_, i) => stepData(q, i))];
    const override = overrideStepsFor(q.key);
    const full = override && override.length > 0 ? override : authored;
    const [start, ...steps] = full;
    return [start!, ...bakeReversals(steps)];
  };
  const RESOLVED: Record<string, StepData[]> = $derived(
    Object.fromEntries(SEQS.map((q) => [q.key, resolvedStrip(q)]))
  );

  // ── Geometry (portrait reflow - Start + 4 rows of 4 per word) ──────────────
  const CELL = 80;
  const START_X = 128;
  const ROW_X = 208;
  const RULES = [84, 436];
  const LABELS = [
    { word: "IIΩXKEΣY", tag: "Rotated LOOP", y: 210 },
    { word: "CΣNZIΘUW", tag: "Mirrored + Swapped LOOP", y: 562 },
  ];

  // ── Text (LOOP facelift) ────────────────────────────────────────────────────
  type Para = { y: number; fs: number; lh: number; html: string };
  let PARAS: Para[] = $state([
    {
      y: 44,
      fs: 15,
      lh: 18,
      html:
        "Words can be any length.<br>" +
        "These 8-letter words repeat twice, to create 16-count sequences.",
    },
  ]);

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("8-Letter Words (eight-letter-words)", () =>
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

<div class="eight-letter">
  {#each RULES as ry (ry)}
    <div class="rule" style="left:{20 * S}px; top:{ry * S}px; width:{572 * S}px"></div>
  {/each}

  <!-- Word labels + classification tags (left margin). -->
  {#each LABELS as m (m.word)}
    <span class="margin-word" style="left:{4 * S}px; top:{m.y * S}px; width:{118 * S}px; font-size:{13.5 * S}px"
      ><span class="tka-font">{m.word}</span></span
    >
    <span class="margin-tag" style="left:{4 * S}px; top:{(m.y + 24) * S}px; width:{118 * S}px; font-size:{12.5 * S}px">({m.tag})</span>
  {/each}

  <!-- The two words: Start + 4 rows of 4, each one clickable strip. -->
  {#each SEQS as q (q.key)}
    <div
      class="seq tka-seq-cell"
      class:is-hovered={selection?.isHovered(q.key)}
      class:is-selected={selection?.isSelected(q.key)}
      style="left:{START_X * S}px; top:{q.rowY * S}px; width:{(ROW_X + CELL * 4 - START_X) * S}px; height:{CELL * 4 * S}px"
    >
      <div
        class="mini"
        class:guide-step-active={activeStep?.key === q.key && activeStep.ringStep === 0}
        style="left:0; top:0; width:{CELL * S}px; height:{CELL * S}px"
      >
        <PictographContainer
          pictographData={RESOLVED[q.key]![0]}
          gridMode={GridMode.DIAMOND}
          leftPropTypeOverride={PropType.STAFF}
          rightPropTypeOverride={PropType.STAFF}
          stepNumberOverride={true}
          {...PICTO_FLAGS}
        />
      </div>
      {#each RESOLVED[q.key]!.slice(1) as sd, i (i)}
        <div
          class="mini"
          class:guide-step-active={activeStep?.key === q.key && activeStep.ringStep === i + 1}
          style="left:{(ROW_X - START_X + (i % 4) * CELL) * S}px; top:{Math.floor(i / 4) * CELL * S}px; width:{CELL * S}px; height:{CELL * S}px"
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
        groupId={q.key}
        isGroupStart
        label={`Animate ${q.word}`}
        onselect={() => emitSequence?.({ strip: RESOLVED[q.key]!, word: q.word, key: q.key, propType: "staff" })}
      />
    </div>
  {/each}

  <!-- Paragraphs. -->
  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `el-para-${i}`}
      style="top:{p.y * S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px"
      use:ptDrag={pt(`el-para-${i}`, "para", p)}
      use:editText={{ id: `el-para-${i}`, label: "para", get: () => p.html, set: (h2) => (p.html = h2) }}
    >
      {@html p.html}
    </p>
  {/each}
</div>

<style>
  /* Absolute layer over the whole GuidePage sheet; coords map straight to pt×S. */
  .eight-letter {
    position: absolute;
    inset: 0;
    color: #141414;
  }

  .rule {
    position: absolute;
    height: 2.5px;
    background: #141414;
  }

  .seq {
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
    letter-spacing: 0.04em;
  }
  .margin-tag {
    position: absolute;
    font-family: "Cambria", Georgia, "Times New Roman", serif;
    font-style: italic;
    text-align: center;
    line-height: 1.25;
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
