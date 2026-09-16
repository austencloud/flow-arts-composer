<script lang="ts">
  /**
   * Hybrid Reversals (CCCC) - body page (manifest `examples-cccc`), faithful to
   * "1.2 - Guide pt. 2 - CCCC" artboard (old p35).
   *
   * Top: AABB ×2 with the reversals moved after the second B (step 4) - the R/R
   * flag lands on step 5 (derived, not authored), and the prose explains the
   * body-turn it forces.
   * Bottom: CCCC (hybrid: one pro + one anti) in its three reversal variants,
   * one 4-step row each:
   *   Hand-reversal - the handpath flips each step, prop rotation continues, so
   *   the pro/anti roles trade per step and NO prop-reversal flag appears.
   *   Prop-reversal - the handpath continues CW, the prop rotation flips every
   *   step (R/R on 2, 3, 4).
   *   Full-reversal - both flip together: each hand keeps its pro/anti role
   *   while retracing S↔W / N↔E (R/R on 2, 3, 4).
   * All letters MCP-verified this build (A dual-pro, B dual-anti, C = one anti +
   * one pro; hybrids keep the letter when the colors trade roles). Reversal
   * dots derived via bakeReversals, never hand-authored.
   * FACELIFT: "beats" reads "steps"; artboard typos fixed ("usas" → "us as",
   * "constrast" → "contrast").
   *
   * Reader: each strip is one clickable sequence (Start pose synthesized for
   * playback only, like ExamplesPage).
   *
   * Geometry off the artboard scan (20px/pt): top grid x 128.7 rows y 62/150.9
   * (89pt cells); heavy rule y 408.3; CCCC rows x 167 (89.5pt cells) y
   * 478.1/574.5/670.9.
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

  type SeqDef = { key: string; word: string; label?: string; x: number; rowYs: number[]; cell: number; steps: Step[] };
  const SEQS: SeqDef[] = [
    {
      // AABB ×2, reversals after the second B (step 4) - R/R derives on step 5.
      key: "hr-aabb",
      word: "AABB ×2 (reversals after the second B)",
      x: 128.7,
      rowYs: [74, 162.9],
      cell: 89,
      steps: [
        st(A, h(false, SO_, W), h(false, N, E)),
        st(A, h(false, W, N), h(false, E, SO_)),
        st(B, h(true, N, W), h(true, SO_, E)),
        st(B, h(true, W, SO_, OUT), h(true, E, N, OUT)),
        st(A, h(false, SO_, E), h(false, N, W)),
        st(A, h(false, E, N), h(false, W, SO_)),
        st(B, h(true, N, E), h(true, SO_, W)),
        st(B, h(true, E, SO_, OUT), h(true, W, N, OUT)),
      ],
    },
    {
      // CCCC hand-reversal: handpath flips per step, prop rotation continues -
      // the pro/anti roles trade each step; NO prop-reversal flags derive.
      key: "hr-hand",
      word: "CCCC Hand-reversal",
      label: "Hand-reversal",
      x: 167,
      rowYs: [478.1],
      cell: 89.5,
      steps: [
        st(C, h(true, SO_, W), h(false, N, E)),
        st(C, h(false, W, SO_, OUT), h(true, E, N)),
        st(C, h(true, SO_, W, OUT), h(false, N, E, OUT)),
        st(C, h(false, W, SO_), h(true, E, N, OUT)),
      ],
    },
    {
      // CCCC prop-reversal: handpath continues CW, prop rotation flips each
      // step - R/R derives on 2, 3, 4.
      key: "hr-prop",
      word: "CCCC Prop-reversal",
      label: "Prop-reversal",
      x: 167,
      rowYs: [574.5],
      cell: 89.5,
      steps: [
        st(C, h(true, SO_, W), h(false, N, E)),
        st(C, h(false, W, N, OUT), h(true, E, SO_)),
        st(C, h(true, N, E, OUT), h(false, SO_, W, OUT)),
        st(C, h(false, E, SO_), h(true, W, N, OUT)),
      ],
    },
    {
      // CCCC full-reversal: handpath AND prop flip together - each hand keeps
      // its pro/anti role while retracing; R/R derives on 2, 3, 4.
      key: "hr-full",
      word: "CCCC Full-reversal",
      label: "Full-reversal",
      x: 167,
      rowYs: [670.9],
      cell: 89.5,
      steps: [
        st(C, h(true, SO_, W), h(false, N, E)),
        st(C, h(true, W, SO_, OUT), h(false, E, N)),
        st(C, h(true, SO_, W), h(false, N, E)),
        st(C, h(true, W, SO_, OUT), h(false, E, N)),
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

  // Admin override replaces the WHOLE strip when present, resolved before
  // baking - reversal dots stay derived either way.
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
  const RULES = [408.3];

  // ── Text (step-not-beat facelift; artboard typos fixed) ─────────────────────
  type Para = { y: number; fs: number; lh: number; left?: number; width?: number; html: string };
  let PARAS: Para[] = $state([
    {
      y: 54, fs: 15, lh: 18,
      html: "Let’s add reversals after the second B.",
    },
    {
      y: 266, fs: 15, lh: 18, left: 46, width: 520,
      html:
        "Take note - step 5 has the right hand coming down on the left side of the grid, so it’s " +
        "impossible to follow through to step 6 while remaining square with the audience in wall " +
        "plane. We must <em>body turn</em> on step 5. If turning left, we can bring the left staff into the " +
        "plane behind us as it comes up, moving our relative position into wheel plane.",
    },
    {
      y: 356, fs: 15, lh: 18, left: 46, width: 520,
      html:
        "This sequence is a good example of how body turns can serve both as a method of " +
        "motion execution and a body movement that can add energy and contrast.",
    },
    {
      y: 426, fs: 15, lh: 18,
      html:
        "Now let’s observe how reversals affect pro/anti hybrid words like CCCC.<br>" +
        "They present more variations than non-hybrids:",
    },
  ]);

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("Hybrid Reversals (examples-cccc)", () =>
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

<div class="hybrid-reversals">
  {#each RULES as ry (ry)}
    <div class="rule" style="left:{20 * S}px; top:{ry * S}px; width:{572 * S}px"></div>
  {/each}

  <!-- Row labels for the three CCCC variants. -->
  {#each SEQS.filter((q) => q.label) as q (q.key)}
    <span class="row-label" style="left:{34 * S}px; top:{(q.rowYs[0]! + 38) * S}px; width:{126 * S}px; font-size:{16 * S}px">{q.label}</span>
  {/each}

  <!-- The four strips, each one clickable sequence. -->
  {#each SEQS as q (q.key)}
    <div
      class="seq tka-seq-cell"
      class:is-hovered={selection?.isHovered(q.key)}
      class:is-selected={selection?.isSelected(q.key)}
      style="left:{q.x * S}px; top:{q.rowYs[0]! * S}px; width:{q.cell * 4 * S}px; height:{(q.rowYs.length === 1 ? q.cell : q.rowYs[1]! - q.rowYs[0]! + q.cell) * S}px"
    >
      {#each q.steps as _, i (i)}
        <div
          class="mini"
          class:guide-step-active={activeStep?.key === q.key && activeStep.ringStep === i + 1}
          style="left:{(i % 4) * q.cell * S}px; top:{(Math.floor(i / 4) * (q.rowYs.length === 1 ? 0 : q.rowYs[1]! - q.rowYs[0]!)) * S}px; width:{q.cell * S}px; height:{q.cell * S}px"
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
      class:selected={guideEdit.selectedId === `hr-para-${i}`}
      style="top:{p.y * S}px; font-size:{p.fs * S}px; line-height:{p.lh * S}px; {p.left != null
        ? `left:${p.left * S}px; right:auto; width:${(p.width ?? 520) * S}px;`
        : ''}"
      use:ptDrag={pt(`hr-para-${i}`, "para", p)}
      use:editText={{ id: `hr-para-${i}`, label: "para", get: () => p.html, set: (h2) => (p.html = h2) }}
    >
      {@html p.html}
    </p>
  {/each}
</div>

<style>
  /* Absolute layer over the whole GuidePage sheet; coords map straight to pt×S. */
  .hybrid-reversals {
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

  .row-label {
    position: absolute;
    font-family: "Cambria", Georgia, "Times New Roman", serif;
    font-style: italic;
    font-size: 16px;
    text-align: center;
    line-height: 1.2;
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
