<script lang="ts">
  /**
   * Mixed Words (ACAC, BCBC) - body page (manifest `examples-acac`), faithful
   * to "1.2 - Guide pt. 3 - ACAC, BCBC" artboard (old p36).
   *
   * Combining a hybrid (C) with a non-hybrid (A or B) forces prop-reversals.
   * Three 4-step strips (no Start boxes - same convention as ExamplesPage):
   *   ACAC v1 - the left (blue) hand prop-reverses on every step (R on 2,3,4);
   *   the right hand rides a continuous pro CW path.
   *   ACAC v2 - reversals alternate left/right (blue R on 2 and 4, red R on 3);
   *   uses every reversal type: hand (blue path flips at 3), prop, and full.
   *   BCBC - the right (red) hand prop-reverses on every step (R on 2,3,4);
   *   the left hand stays anti on a continuous CW path.
   * Letters MCP-verified this build (A dual-pro, B dual-anti, C hybrid); the
   * R flags are DERIVED via bakeReversals from the motion data, never authored.
   * FACELIFT: "beats" reads "steps"; artboard typo fixed ("Evenutally").
   *
   * Geometry off the artboard scan (20px/pt): strips x 128.7, 89pt cells, ys
   * 132.1/441.6/622.4; heavy rules y 287.8/556.8.
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
  const { A, B, C } = Letter;

  type SeqDef = { key: string; word: string; y: number; steps: Step[] };
  const SEQS: SeqDef[] = [
    {
      // ACAC v1 - blue prop-reverses every step (R derives on 2, 3, 4).
      key: "mw-acac1",
      word: "ACAC (left-hand reversals)",
      y: 132.1,
      steps: [
        st(A, h(false, SO_, W), h(false, N, E)),
        st(C, h(true, W, N), h(false, E, SO_)),
        st(A, h(false, N, E, OUT), h(false, SO_, W)),
        st(C, h(true, E, SO_, OUT), h(false, W, N)),
      ],
    },
    {
      // ACAC v2 - reversals alternate left/right (blue R on 2 and 4, red R on
      // 3); blue's handpath also flips at step 3 (hand reversal, no dot).
      key: "mw-acac2",
      word: "ACAC (alternating reversals)",
      y: 441.6,
      steps: [
        st(A, h(false, SO_, W), h(false, N, E)),
        st(C, h(true, W, N), h(false, E, SO_)),
        st(A, h(false, N, W, OUT), h(false, SO_, E)),
        st(C, h(true, W, SO_, OUT), h(false, E, N)),
      ],
    },
    {
      // BCBC - red prop-reverses every step (R derives on 2, 3, 4).
      key: "mw-bcbc",
      word: "BCBC (right-hand reversals)",
      y: 622.4,
      steps: [
        st(B, h(true, SO_, W), h(true, N, E)),
        st(C, h(true, W, N, OUT), h(false, E, SO_, OUT)),
        st(B, h(true, N, E), h(true, SO_, W, OUT)),
        st(C, h(true, E, SO_, OUT), h(false, W, N)),
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

  // Playback-only Start pose (α, blue S / red N, thumbs in).
  const startPose = (q: SeqDef): StepData =>
    ({
      id: `${q.key}-0`,
      letter: Letter.ALPHA,
      gridMode: GridMode.DIAMOND,
      stepNumber: 0,
      motions: { left: stat(HandSide.LEFT, SO_), right: stat(HandSide.RIGHT, N) },
    }) as unknown as StepData;

  const resolvedSeqSteps = (q: SeqDef): StepData[] => {
    const authored = [startPose(q), ...q.steps.map((_, i) => stepData(q, i))];
    const override = overrideStepsFor(q.key);
    const full = override && override.length > 0 ? override : authored;
    const [start, ...steps] = full;
    return [start!, ...bakeReversals(steps)];
  };
  const RESOLVED: Record<string, StepData[]> = $derived(
    Object.fromEntries(SEQS.map((q) => [q.key, resolvedSeqSteps(q)]))
  );

  // ── Geometry ────────────────────────────────────────────────────────────────
  const CELL = 89;
  const STRIP_X = 128.7;
  const RULES = [287.8, 556.8];

  // ── Text (step-not-beat facelift; typo fixed) ───────────────────────────────
  type Para = { y: number; fs: number; lh: number; html: string };
  let PARAS: Para[] = $state([
    {
      y: 58, fs: 15, lh: 18,
      html:
        "When combining a hybrid like C with a non-hybrid like A or B, a prop-reversal is necessary.<br>" +
        "Let’s look at the word ACAC.",
    },
    {
      y: 102.9, fs: 15, lh: 18,
      html: "In this variation, the left hand does a reversal on every step. Give it a try:",
    },
    {
      y: 250.4, fs: 15, lh: 18,
      html: "It would be impossible to execute ACAC without using a prop-reversal.",
    },
    {
      y: 316.5, fs: 15, lh: 18,
      html:
        "The previous example shows the hands moving in a <em>continuous</em> path.<br>" +
        "Let’s change that in the next example by including a full-reversal in the middle.<br>" +
        'In this example, the reversals alternate between left (<strong class="cB">R</strong>) and right (<strong class="cR">R</strong>).',
    },
    {
      y: 389.5, fs: 15, lh: 18,
      html:
        "This example uses every type of reversal - <em>hand</em>, <em>prop</em>, and <em>full</em>.<br>" +
        "Challenge yourself to identify where each one occurs.",
    },
    {
      y: 587.7, fs: 15, lh: 18,
      html: "Prop-reversals are also required with BCBC, as shown in this example:",
    },
    {
      y: 747.7, fs: 15, lh: 18,
      html:
        'Here, the <strong class="cR">right</strong> hand is prop-reversing after every step. Eventually, it returns to home.',
    },
  ]);

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("Mixed Words (examples-acac)", () =>
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

<div class="mixed-words">
  {#each RULES as ry (ry)}
    <div class="rule" style="left:{20 * S}px; top:{ry * S}px; width:{572 * S}px"></div>
  {/each}

  <!-- The three strips, each one clickable sequence. -->
  {#each SEQS as q (q.key)}
    <div
      class="seq tka-seq-cell"
      class:is-hovered={selection?.isHovered(q.key)}
      class:is-selected={selection?.isSelected(q.key)}
      style="left:{STRIP_X * S}px; top:{q.y * S}px; width:{CELL * 4 * S}px; height:{CELL * S}px"
    >
      {#each q.steps as _, i (i)}
        <div
          class="mini"
          class:guide-step-active={activeStep?.key === q.key && activeStep.ringStep === i + 1}
          style="left:{i * CELL * S}px; top:0; width:{CELL * S}px; height:{CELL * S}px"
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

  <!-- Paragraphs (artboard coords). -->
  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `mw-para-${i}`}
      style="top:{p.y * S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px"
      use:ptDrag={pt(`mw-para-${i}`, "para", p)}
      use:editText={{ id: `mw-para-${i}`, label: "para", get: () => p.html, set: (h2) => (p.html = h2) }}
    >
      {@html p.html}
    </p>
  {/each}
</div>

<style>
  /* Absolute layer over the whole GuidePage sheet; coords map straight to pt×S. */
  .mixed-words {
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
