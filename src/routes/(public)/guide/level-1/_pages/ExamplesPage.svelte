<script lang="ts">
  /**
   * Examples - body page (manifest `examples-abc`, retitled "Examples"),
   * faithful to proof p34 / "1.2 - Guide pt 1 - AABB" artboard.
   *
   * Three AABB presentations differing only in reversal placement (no Start
   * boxes - "interpret it from the first motions"; all start α, blue S / red N,
   * thumbs in). Reversal flags follow the prop-only rule:
   *   1. AABB ×1, prop-reversals after steps 2 and 4 - the whole word rides
   *      the CW handpath, so B flips the prop (R on 3) and the loop wrap flips
   *      it back (R on 1).
   *   2. AABB ×2 Mirrored LOOP, reversals after steps 1 and 5 (R on 2 and 6)
   *      - steps 5-8 mirror 1-4 across the horizontal plane.
   *   3. AABB ×2, reversals after steps 3 and 7 (R on 4 and 8).
   * FACELIFT: "beats" reads "steps"; "Mirrored CAP" reads "Mirrored LOOP"; the
   * gutter "R/R" is the system's own reversal indicator on the step.
   *
   * Reader: each sequence is one clickable strip (a Start pose is synthesized
   * for playback only).
   *
   * Geometry off the artboard border scan (20px/pt): 90pt cells; v1 x 4.7
   * y 125; v2 x 252 rows y 288.9/378.8; v3 x 4.7 rows y 582.5/672.4; heavy
   * rules y 253.5/508.2.
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
  const handMotion = (color: HandSide, h: HandStep) => {
    const dir = HP_CW.has(`${h.from}-${h.to}`) ? CW : CCW;
    return createMotionData({
      motionType: h.anti ? MotionType.ANTI : MotionType.PRO,
      rotationDirection: h.anti ? (dir === CW ? CCW : CW) : dir,
      startLocation: h.from,
      endLocation: h.to,
      startOrientation: h.so,
      endOrientation: h.anti ? flip(h.so) : h.so,
      turns: 0,
      color,
      propType: PropType.STAFF,
      gridMode: GridMode.DIAMOND,
    });
  };

  type Step = { letter: Letter; left: HandStep; right: HandStep; rev?: boolean };
  const st = (letter: Letter, bAnti: boolean, bf: GridLocation, bt: GridLocation, rf: GridLocation, rt: GridLocation, so: [Orientation, Orientation], rev = false): Step =>
    ({ letter, left: { anti: bAnti, from: bf, to: bt, so: so[0] }, right: { anti: bAnti, from: rf, to: rt, so: so[1] }, rev });

  const A = Letter.A;
  const B = Letter.B;
  type SeqDef = { key: string; word: string; x: number; rowYs: number[]; steps: Step[] };
  const SEQS: SeqDef[] = [
    {
      // Prop-reversals after steps 2 and 4 (flags on 3 and, via loop wrap, 1).
      key: "ex-v1",
      word: "AABB (reversals after 2 & 4)",
      x: 4.7,
      rowYs: [125],
      steps: [
        st(A, false, SO_, W, N, E, [IN, IN], true),
        st(A, false, W, N, E, SO_, [IN, IN]),
        st(B, true, N, E, SO_, W, [IN, IN], true),
        st(B, true, E, SO_, W, N, [OUT, OUT]),
      ],
    },
    {
      // Mirrored LOOP: reversals after steps 1 and 5 (flags on 2 and 6).
      key: "ex-v2",
      word: "AABB ×2 Mirrored LOOP",
      x: 252,
      rowYs: [288.9, 378.8],
      steps: [
        st(A, false, SO_, W, N, E, [IN, IN]),
        st(A, false, W, SO_, E, N, [IN, IN], true),
        st(B, true, SO_, W, N, E, [IN, IN]),
        st(B, true, W, N, E, SO_, [OUT, OUT]),
        st(A, false, N, W, SO_, E, [IN, IN]),
        st(A, false, W, N, E, SO_, [IN, IN], true),
        st(B, true, N, W, SO_, E, [IN, IN]),
        st(B, true, W, SO_, E, N, [OUT, OUT]),
      ],
    },
    {
      // Reversals after steps 3 and 7 (flags on 4 and 8).
      key: "ex-v3",
      word: "AABB ×2 (reversals after 3 & 7)",
      x: 4.7,
      rowYs: [582.5, 672.4],
      steps: [
        st(A, false, SO_, W, N, E, [IN, IN]),
        st(A, false, W, N, E, SO_, [IN, IN]),
        st(B, true, N, W, SO_, E, [IN, IN]),
        st(B, true, W, N, E, SO_, [OUT, OUT], true),
        st(A, false, N, W, SO_, E, [IN, IN]),
        st(A, false, W, SO_, E, N, [IN, IN]),
        st(B, true, SO_, W, N, E, [IN, IN]),
        st(B, true, W, SO_, E, N, [OUT, OUT], true),
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
      leftReversal: !!s.rev,
      rightReversal: !!s.rev,
      motions: {
        left: handMotion(HandSide.LEFT, s.left),
        right: handMotion(HandSide.RIGHT, s.right),
      },
    } as unknown as StepData;
  };

  // Playback-only Start pose (α, blue S / red N, thumbs in).
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
  const startPose = (q: SeqDef): StepData =>
    ({
      id: `${q.key}-0`,
      letter: Letter.ALPHA,
      gridMode: GridMode.DIAMOND,
      stepNumber: 0,
      motions: { left: stat(HandSide.LEFT, SO_), right: stat(HandSide.RIGHT, N) },
    }) as unknown as StepData;
  const seqSteps = (q: SeqDef): StepData[] => [startPose(q), ...q.steps.map((_, i) => stepData(q, i))];

  // Admin override (guide-overrides.svelte) replaces the WHOLE strip when
  // present, resolved before baking - reversal dots stay derived either way.
  // Reactive so a save/revert/reset while the reader is open re-renders.
  const resolvedSeqSteps = (q: SeqDef): StepData[] => {
    const authored = seqSteps(q);
    const override = overrideStepsFor(q.key);
    const full = override && override.length > 0 ? override : authored;
    const [start, ...steps] = full;
    return [start!, ...bakeReversals(steps)];
  };
  const RESOLVED: Record<string, StepData[]> = $derived(
    Object.fromEntries(SEQS.map((q) => [q.key, resolvedSeqSteps(q)]))
  );

  // ── Geometry ────────────────────────────────────────────────────────────────
  const CELL = 90;
  const RULES = [253.5, 508.2];

  // ── Text (step-not-beat + LOOP facelift) ────────────────────────────────────
  type Para = { y: number; fs: number; lh: number; left?: number; width?: number; bold?: boolean; html: string };
  let PARAS: Para[] = $state([
    {
      y: 48, fs: 15, lh: 18,
      html:
        "Let’s practice reversals and permutations.<br>" +
        "We’ll use AABB as an example to explore different reversal placements.<br>" +
        "<strong>These start from the same alpha start position. Interpret it from the first motions.</strong>",
    },
    {
      y: 128, fs: 14.5, lh: 17.4, left: 378, width: 226,
      html:
        "Here’s an AABB in which both staves execute <strong>prop-reversals</strong> after steps 2 and 4, notated by an " +
        '“<strong class="cR">R</strong>/<strong class="cB">R</strong>” on the pictographs.',
    },
    {
      y: 212, fs: 14.5, lh: 17.4, left: 378, width: 226,
      html: "This requires negative space or a body turn to execute.",
    },
    {
      y: 292, fs: 14.5, lh: 17.4, left: 8, width: 232,
      html: "Let’s place the reversals in a different place. This time we’ll put them after step 1.",
    },
    {
      y: 352, fs: 14.5, lh: 17.4, left: 8, width: 232,
      html:
        "This will put our left hand on top after step 4, so we’ll repeat the sequence again mirrored (with a " +
        "reversal after step 5) to return to our original home position.",
    },
    {
      y: 470, fs: 14.5, lh: 17.4, left: 8, width: 232,
      html: "This is a <em>Mirrored LOOP</em>.",
    },
    {
      y: 545, fs: 15, lh: 18,
      html: "Now let’s look at another variation of AABB*2 with reversals after steps 3 & 7:",
    },
    {
      y: 592, fs: 14.5, lh: 17.4, left: 378, width: 226,
      html:
        "As demonstrated with these examples, a reversal in different locations in the word can lead to a " +
        "notably different outcome.",
    },
    {
      y: 678, fs: 14.5, lh: 17.4, left: 378, width: 226,
      html:
        "The word AABB is not limited to one presentation, it is a broad category of sequences that includes " +
        "those letters with variations on reversals and thumb orientation.",
    },
  ]);

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("Examples (examples-abc)", () =>
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

<div class="examples-page">
  {#each RULES as ry (ry)}
    <div class="rule" style="left:{20 * S}px; top:{ry * S}px; width:{572 * S}px"></div>
  {/each}

  <!-- The three AABB presentations, each one clickable strip. -->
  {#each SEQS as q (q.key)}
    <div
      class="seq tka-seq-cell"
      class:is-hovered={selection?.isHovered(q.key)}
      class:is-selected={selection?.isSelected(q.key)}
      style="left:{q.x * S}px; top:{q.rowYs[0]! * S}px; width:{CELL * 4 * S}px; height:{(q.rowYs.length === 1 ? CELL : q.rowYs[1]! - q.rowYs[0]! + CELL) * S}px"
    >
      {#each q.steps as _, i (i)}
        <div
          class="mini"
          class:guide-step-active={activeStep?.key === q.key && activeStep.ringStep === i + 1}
          style="left:{(i % 4) * CELL * S}px; top:{(Math.floor(i / 4) * (q.rowYs.length === 1 ? 0 : q.rowYs[1]! - q.rowYs[0]!)) * S}px; width:{CELL * S}px; height:{CELL * S}px"
        >
          <PictographContainer
            pictographData={RESOLVED[q.key]!.slice(1)[i]}
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

  <!-- Paragraphs: centred + side columns. -->
  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `ex-para-${i}`}
      style="top:{p.y * S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px; {p.left != null
        ? `left:${p.left * S}px; right:auto; width:${(p.width ?? 226) * S}px;`
        : ''}"
      use:ptDrag={pt(`ex-para-${i}`, "para", p)}
      use:editText={{ id: `ex-para-${i}`, label: "para", get: () => p.html, set: (h) => (p.html = h) }}
    >
      {@html p.html}
    </p>
  {/each}
</div>

<style>
  /* Absolute layer over the whole GuidePage sheet; coords map straight to pt×S. */
  .examples-page {
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
