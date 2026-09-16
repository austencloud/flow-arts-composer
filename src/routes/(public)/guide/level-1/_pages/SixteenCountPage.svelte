<script lang="ts">
  /**
   * 16-Count Sequences - body page (manifest `sixteen-count`), faithful to
   * "1.2 - 16-count sequences - GΘOZ, EΔQY" artboard (old p40; CAP→LOOP
   * facelift).
   *
   * Two 4-letter words repeated 4 times → 16-count sequences (Start + 4 rows
   * of 4, real staff pictographs):
   *   GΘOZ - each repetition ends in a β 90° from its start, so 4 repetitions
   *   return home. Rotated + Swapped LOOP. Variations G[6] Θ[15] O[8] Z[1] /
   *   G[4] Θ[6] O[7] Z[10] / G[5] Θ[4] O[6] Z[11] / G[7] Θ[13] O[11] Z[0].
   *   Blue and red props both CCW throughout.
   *   EΔQY - home after two repetitions; repeats twice more mirrored to fill
   *   the remaining quadrants. Rotated + Mirrored + Swapped LOOP. E[6] Δ[7]
   *   Q[5] Y[2] / E[5] Δ[4] Q[6] Y[0] / E[6] Δ[10] Q[7] Y[15] / E[5] Δ[8]
   *   Q[4] Y[12]. Blue CCW, red CW throughout.
   * Every step MCP-verified against list_letter_variations this build; constant
   * per-hand prop rotation (statics inert) → bakeReversals derives NO flags,
   * matching the artboard.
   *
   * Reader: each sequence is one clickable strip playing Start + 16 steps.
   *
   * Geometry off the artboard scan (20px/pt): 82pt cells; Start x 193.3, step
   * rows x 275.3; GΘOZ rows y 107.8 (82pt pitch), EΔQY rows y 459; heavy rules
   * y 92.2/447.7; side text in the left column.
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
  const { G, O, Q, Y, Z } = Letter;
  const EL = Letter.E;
  const DEL = Letter.DELTA;
  const THE = Letter.THETA;

  type SeqDef = {
    key: string;
    word: string;
    rowY: number;
    steps: Step[];
  };
  const SEQS: SeqDef[] = [
    {
      // GΘOZ ×4 - Rotated + Swapped LOOP; both props CCW throughout.
      key: "sc-gtoz",
      word: "GΘOZ ×4",
      rowY: 107.8,
      steps: [
        st(G, h(false, SO_, E), h(false, SO_, E)),
        st(THE, h(false, E, N), sh(E)),
        st(O, h(false, N, W), h(true, E, SO_)),
        st(Z, sh(W), h(true, SO_, W, OUT)),
        st(G, h(false, W, SO_), h(false, W, SO_)),
        st(THE, sh(SO_), h(false, SO_, E)),
        st(O, h(true, SO_, W), h(false, E, N)),
        st(Z, h(true, W, N, OUT), sh(N)),
        st(G, h(false, N, W), h(false, N, W)),
        st(THE, sh(W), h(false, W, SO_)),
        st(O, h(true, W, N), h(false, SO_, E)),
        st(Z, h(true, N, E, OUT), sh(E)),
        st(G, h(false, E, N), h(false, E, N)),
        st(THE, h(false, N, W), sh(N)),
        st(O, h(false, W, SO_), h(true, N, E)),
        st(Z, sh(SO_), h(true, E, SO_, OUT)),
      ],
    },
    {
      // EΔQY ×4 - Rotated + Mirrored + Swapped LOOP; blue CCW, red CW.
      key: "sc-eqdy",
      word: "EΔQY ×4",
      rowY: 459,
      steps: [
        st(EL, h(true, SO_, W), h(true, SO_, E)),
        st(DEL, sh(W, OUT), h(true, E, N, OUT)),
        st(Q, h(true, W, N, OUT), h(true, N, W)),
        st(Y, sh(N), h(false, W, N, OUT)),
        st(EL, h(true, N, E), h(true, N, W, OUT)),
        st(DEL, sh(E, OUT), h(true, W, SO_)),
        st(Q, h(true, E, SO_, OUT), h(true, SO_, E, OUT)),
        st(Y, sh(SO_), h(false, E, SO_)),
        st(EL, h(true, SO_, W), h(true, SO_, E)),
        st(DEL, h(true, W, N, OUT), sh(E, OUT)),
        st(Q, h(true, N, E), h(true, E, N, OUT)),
        st(Y, h(false, E, N, OUT), sh(N)),
        st(EL, h(true, N, E, OUT), h(true, N, W)),
        st(DEL, h(true, E, SO_), sh(W, OUT)),
        st(Q, h(true, SO_, W, OUT), h(true, W, SO_, OUT)),
        st(Y, h(false, W, SO_), sh(SO_)),
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
  // Start box: β, both S, thumbs in.
  const startBox = (q: SeqDef): StepData =>
    ({
      id: `${q.key}-0`,
      letter: Letter.BETA,
      gridMode: GridMode.DIAMOND,
      stepNumber: 0,
      startPlacement: getGridPlacementFromLocations(SO_, SO_),
      endPlacement: getGridPlacementFromLocations(SO_, SO_),
      motions: {
        left: handMotion(HandSide.LEFT, sh(SO_)),
        right: handMotion(HandSide.RIGHT, sh(SO_)),
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

  // ── Geometry ────────────────────────────────────────────────────────────────
  const CELL = 82;
  const START_X = 193.3;
  const ROW_X = 275.3;
  const RULES = [92.2, 447.7];
  const MARGINS = [
    { t: "GΘOZ", y: 146 },
    { t: "EΔQY", y: 499 },
  ];

  // ── Text (LOOP facelift) ────────────────────────────────────────────────────
  type Para = { y: number; fs: number; lh: number; left?: number; width?: number; html: string };
  let PARAS: Para[] = $state([
    {
      y: 66, fs: 15, lh: 18,
      html: "These 4-letter words repeat 4 times, giving us 16-count sequences.",
    },
    {
      y: 215, fs: 14.5, lh: 17.4, left: 16, width: 160,
      html:
        "Here, each repetition of the word ends in a β that is 90° from its start. " +
        "This means it will take 4 repetitions to return to home.",
    },
    {
      y: 368.6, fs: 14, lh: 17, left: 16, width: 160,
      html: "<em>(Rotated + Swapped LOOP)</em>",
    },
    {
      y: 570, fs: 14.5, lh: 17.4, left: 16, width: 160,
      html:
        "Here, the staves return to home after two word repetitions. To make it " +
        "symmetrical, it repeats twice more, filling the rest of the quadrants.",
    },
    {
      y: 709.4, fs: 14, lh: 17, left: 8, width: 176,
      html: "<em>(Rotated + Mirrored + Swapped LOOP)</em>",
    },
  ]);

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("16-Count Sequences (sixteen-count)", () =>
      PARAS.map((p, i) => `  para[${i}]: y: ${r1(p.y)}${p.left != null ? `, left: ${r1(p.left)}` : ""}`).join("\n")
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

<div class="sixteen-count">
  {#each RULES as ry (ry)}
    <div class="rule" style="left:{20 * S}px; top:{ry * S}px; width:{572 * S}px"></div>
  {/each}

  <!-- Margin word labels. -->
  {#each MARGINS as m (m.t)}
    <span class="margin-word" style="left:{60 * S}px; top:{m.y * S}px; width:{110 * S}px; font-size:{19 * S}px"
      ><span class="tka-font">{m.t}</span></span
    >
  {/each}

  <!-- The two sequences: Start + 4 rows of 4, each one clickable strip. -->
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

  <!-- Paragraphs (artboard coords; side notes live in the left column). -->
  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `sc-para-${i}`}
      style="top:{p.y * S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px; {p.left != null
        ? `left:${p.left * S}px; right:auto; width:${(p.width ?? 160) * S}px;`
        : ''}"
      use:ptDrag={pt(`sc-para-${i}`, "para", p)}
      use:editText={{ id: `sc-para-${i}`, label: "para", get: () => p.html, set: (h2) => (p.html = h2) }}
    >
      {@html p.html}
    </p>
  {/each}
</div>

<style>
  /* Absolute layer over the whole GuidePage sheet; coords map straight to pt×S. */
  .sixteen-count {
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
