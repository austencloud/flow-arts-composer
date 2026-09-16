<script lang="ts">
  /**
   * Negative Space / Body Turns - body page 11 (manifest `negative-space`),
   * faithful to the proof PDF / "1.0 - Prerequisites" artboard.
   *
   * Two REAL single-staff sequences (red hand, prop pinned to STAFF), Start + 4
   * steps each, rendered entirely by the system (StepNumber "Start"/1–4, arc
   * arrows, thumb crossbar from orientations):
   *   360° Isolation  → 4 × PRO around S→E→N→W→S (ccw handpath, prop ccw);
   *                     thumb stays in the whole way (pro preserves).
   *   4-Petal Antispin → same handpath, 4 × ANTI (prop CW - rotationDirection is
   *                     the prop's rotation); thumb alternates in→out→in→out→in
   *                     (anti reverses at 0 turns).
   * Companion click-to-animate is deliberately NOT wired: the reader companion
   * animates hand-mode only today; staff-prop playback is a deferred unlock.
   *
   * Geometry off the artboard border scan (20px/pt): contiguous 99.8pt boxes,
   * iso strip at (52.2, 240.5), antispin strip at (48.3, 522.4); hairlines at
   * y 189.6 / 467.2. Text at PROOF_TEXT coords ("step", not "beat", per the
   * terminology pass).
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
  const CCW = RotationDirection.COUNTER_CLOCKWISE;
  const CW = RotationDirection.CLOCKWISE;
  const NOROT = RotationDirection.NO_ROTATION;

  // Reader wiring: whole-strip selection ring, golden step ring, and the
  // companion handoff (all null outside the reader - /print,/book stay inert).
  const selection = getSequenceSelection();
  const activeStep = getGuideActiveStep();
  const emitSequence = getGuideSequenceClick();

  type Cell = {
    step: number;
    type: MotionType;
    from: GridLocation;
    to: GridLocation;
    so: Orientation;
    eo: Orientation;
    rot: RotationDirection;
  };
  // Blue is an invisible placeholder (both-hands step contract) - renderers and
  // the animation engine skip it; only the red staff shows/plays.
  const cellData = (stripId: string, c: Cell) => ({
    id: `ns-${stripId}-${c.step}`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    stepNumber: c.step,
    motions: {
      left: createPlaceholderMotion(HandSide.LEFT, {
        location: SO_,
        orientation: IN,
      }),
      right: createMotionData({
        motionType: c.type,
        rotationDirection: c.rot,
        startLocation: c.from,
        endLocation: c.to,
        startOrientation: c.so,
        endOrientation: c.eo,
        turns: 0,
        hand: HandSide.RIGHT,
        propType: PropType.STAFF,
        gridMode: GridMode.DIAMOND,
      }),
    },
  });

  /** Strip → ordered StepData for the animation companion (staff props). */
  const stripSteps = (s: Strip): StepData[] =>
    s.cells.map((c) => cellData(s.id, c) as unknown as StepData);

  type Strip = {
    id: string;
    word: string;
    x: number;
    y: number;
    cells: Cell[];
  };

  // Override-resolving strip: an admin override (guide-overrides.svelte) replaces
  // the WHOLE strip when present; reversal dots stay derived either way
  // (bakeReversals, never hand-authored). Reactive so a save/revert/reset while
  // the reader is open re-renders these cells without a refresh.
  const resolvedStrip = (s: Strip): StepData[] => {
    const authored = stripSteps(s);
    const override = overrideStepsFor(`ns-${s.id}`);
    const full = override && override.length > 0 ? override : authored;
    const [start, ...steps] = full;
    return [start!, ...bakeReversals(steps)];
  };
  const SIZE = 99.8;
  const STRIPS: Strip[] = [
    {
      // 360° Isolation - pro all the way around, thumb in throughout.
      id: "iso",
      word: "360° Isolation",
      x: 52.2,
      y: 240.5,
      cells: [
        {
          step: 0,
          type: MotionType.STATIC,
          from: SO_,
          to: SO_,
          so: IN,
          eo: IN,
          rot: NOROT,
        },
        {
          step: 1,
          type: MotionType.PRO,
          from: SO_,
          to: E,
          so: IN,
          eo: IN,
          rot: CCW,
        },
        {
          step: 2,
          type: MotionType.PRO,
          from: E,
          to: N,
          so: IN,
          eo: IN,
          rot: CCW,
        },
        {
          step: 3,
          type: MotionType.PRO,
          from: N,
          to: W,
          so: IN,
          eo: IN,
          rot: CCW,
        },
        {
          step: 4,
          type: MotionType.PRO,
          from: W,
          to: SO_,
          so: IN,
          eo: IN,
          rot: CCW,
        },
      ],
    },
    {
      // 4-Petal Antispin - same handpath, prop counter-rotates (CW), thumb alternates.
      id: "anti",
      word: "4-Petal Antispin",
      x: 48.3,
      y: 522.4,
      cells: [
        {
          step: 0,
          type: MotionType.STATIC,
          from: SO_,
          to: SO_,
          so: IN,
          eo: IN,
          rot: NOROT,
        },
        {
          step: 1,
          type: MotionType.ANTI,
          from: SO_,
          to: E,
          so: IN,
          eo: OUT,
          rot: CW,
        },
        {
          step: 2,
          type: MotionType.ANTI,
          from: E,
          to: N,
          so: OUT,
          eo: IN,
          rot: CW,
        },
        {
          step: 3,
          type: MotionType.ANTI,
          from: N,
          to: W,
          so: IN,
          eo: OUT,
          rot: CW,
        },
        {
          step: 4,
          type: MotionType.ANTI,
          from: W,
          to: SO_,
          so: OUT,
          eo: IN,
          rot: CW,
        },
      ],
    },
  ];

  const RESOLVED: Record<string, StepData[]> = $derived(
    Object.fromEntries(STRIPS.map((s) => [s.id, resolvedStrip(s)]))
  );

  // ── Section headings (script face) + hairlines ──────────────────────────────
  const HEADS = [
    { t: "360° Isolation", y: 192 },
    { t: "4-Petal Antispin", y: 473 },
  ];
  const HAIRLINES = [189.6, 467.2];

  // ── Text at proof coords ────────────────────────────────────────────────────
  type Para = {
    x: number;
    y: number;
    fs: number;
    lh: number;
    left?: boolean;
    indent?: number;
    bold?: boolean;
    html: string;
  };
  let PARAS: Para[] = $state([
    {
      x: 0,
      y: 59.5,
      fs: 14,
      lh: 16.8,
      html:
        "Many sequences seem impossible, but most can be solved by using negative space or body turns.<br>" +
        "<strong><em>Negative space</em></strong> lets you face the audience and reduces body movement<br>" +
        "<strong><em>Body turns</em></strong> add movement and help you execute patterns with longer staves.<br>" +
        "Each method is equally important, and learning both will maximize capability.<br>" +
        "This guide will assume some knowledge of these fundamental concepts.",
    },
    {
      x: 0,
      y: 160.3,
      fs: 14,
      lh: 16.8,
      html: "To make the most of the Alphabet, it’s highly recommended that you learn the following.",
    },
    {
      x: 12.9,
      y: 350.9,
      fs: 14,
      lh: 16.8,
      left: true,
      indent: 36,
      html:
        "To execute this without finger-spinning, turn your torso to the left on step 3. During this " +
        "step, the staff moves briefly in wheel-plane relative to your left-facing view. On step 4, turn your " +
        "body back to center as you return to the start position.",
    },
    {
      x: 0,
      y: 418.1,
      fs: 14,
      lh: 16.8,
      bold: true,
      html: "Practice in reverse, then do both directions in the other hand.<br>Then practice it with the thumb out, isolating the pinky end.",
    },
    {
      x: 0,
      y: 626.9,
      fs: 14,
      lh: 16.8,
      html: "To execute this in wall plane, you must do one of the following on step 2:",
    },
    {
      x: 11.7,
      y: 660.5,
      fs: 14,
      lh: 16.8,
      left: true,
      html:
        "• Pass the thumb end through the negative space above your right shoulder on step 2.<br>" +
        "• Turn your torso to the left on step 2 and pass the thumb end in front, then pass the pinky end on " +
        "the inside of your right arm as you move to step 3.",
    },
    {
      x: 0,
      y: 727.7,
      fs: 14,
      lh: 16.8,
      bold: true,
      html:
        "Practice in reverse, then do both directions in the other hand.<br>" +
        "Then practice everything again starting with the thumb out.<br>" +
        "Try using both negative space and turns. Good luck!",
    },
  ]);

  // "VTG: 1:1" tag beside the title (proof top-right).
  let vtg = $state({ x: 532.4, y: 16, fs: 20 });

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource(
      "Negative Space (p11)",
      () =>
        PARAS.map((p, i) => `  para[${i}]: x: ${r1(p.x)}, y: ${r1(p.y)}`).join(
          "\n"
        ) + `\n  vtg: x: ${r1(vtg.x)}, y: ${r1(vtg.y)}`
    )
  );
</script>

<div class="negative-space">
  <!-- Section headings in the shared script face. -->
  {#each HEADS as h (h.t)}
    <div class="guide-title section-head" style="top:{h.y * S}px">{h.t}</div>
  {/each}

  {#each HAIRLINES as hy (hy)}
    <div
      class="rule hair"
      style="left:{20 * S}px; top:{hy * S}px; width:{572 * S}px"
    ></div>
  {/each}

  <!-- The two staff sequences: Start + 4 steps, all system-rendered. In the
       reader each strip is clickable (SelectionHit) and animates in the
       companion with STAFF props from the authored in-orientation. -->
  {#each STRIPS as strip (strip.id)}
    {@const key = `ns-${strip.id}`}
    <div
      class="strip-wrap tka-seq-cell"
      class:is-hovered={selection?.isHovered(key)}
      class:is-selected={selection?.isSelected(key)}
      style="left:{strip.x * S}px; top:{strip.y * S}px; width:{strip.cells
        .length *
        SIZE *
        S}px; height:{SIZE * S}px"
    >
      {#each strip.cells as c, i (c.step)}
        <div
          class="mini"
          class:guide-step-active={activeStep?.key === key &&
            activeStep.ringStep === c.step}
          style="left:{c.step * SIZE * S}px; top:0; width:{SIZE *
            S}px; height:{SIZE * S}px"
        >
          <PictographContainer
            pictographData={RESOLVED[strip.id]![i]}
            gridMode={GridMode.DIAMOND}
            rightPropTypeOverride={PropType.STAFF}
            showGrid={true}
            showTKA={false}
            showPlacements={false}
            showReversals={false}
            showTnD={false}
            showElemental={false}
            showNonRadialPoints={false}
            showHandPoints={true}
            stepNumberOverride={true}
            darkMode={false}
            printMode={true}
            disableTransitions={true}
          />
        </div>
      {/each}
      <SelectionHit
        groupId={key}
        isGroupStart
        label={`Animate the ${strip.word} sequence`}
        onselect={() =>
          emitSequence?.({
            strip: RESOLVED[strip.id]!,
            word: strip.word,
            key,
            propType: "staff",
          })}
      />
    </div>
  {/each}

  <!-- Paragraphs (proof coords). -->
  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:bold={p.bold}
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `ns-para-${i}`}
      style="top:{p.y * S}px; font-size:{p.fs * S}px; line-height:{p.lh *
        S}px; {p.left
        ? `left:${p.x * S}px; right:${p.x * S}px; text-align:left;`
        : ''} {p.indent ? `text-indent:${p.indent * S}px;` : ''}"
      use:ptDrag={pt(`ns-para-${i}`, "para", p)}
      use:editText={{
        id: `ns-para-${i}`,
        label: "para",
        get: () => p.html,
        set: (h) => (p.html = h),
      }}
    >
      {@html p.html}
    </p>
  {/each}

  <!-- VTG tag beside the title. -->
  <span
    class="vtg"
    class:edit={guideEdit.on}
    class:selected={guideEdit.selectedId === "ns-vtg"}
    style="left:{vtg.x * S}px; top:{vtg.y * S}px; font-size:{vtg.fs * S}px"
    use:ptDrag={pt("ns-vtg", "VTG", vtg)}>VTG: 1:1</span
  >
</div>

<style>
  /* Absolute layer over the whole GuidePage sheet; coords map straight to pt×S. */
  .negative-space {
    position: absolute;
    inset: 0;
    color: #141414;
  }

  .section-head {
    font-size: 48px;
  }

  /* Per-sequence wrapper - carries the shared selection ring (.tka-seq-cell). */
  .strip-wrap {
    position: absolute;
  }

  .mini {
    position: absolute;
    border: 1px solid #c4c4cc;
    box-sizing: border-box;
  }

  .rule.hair {
    position: absolute;
    height: 1px;
    background: #9a9aa4;
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
  .para.bold {
    font-weight: 700;
  }

  .vtg {
    position: absolute;
    font-family: "Cambria", Georgia, serif;
    font-style: italic;
    white-space: nowrap;
  }

  .para.edit,
  .vtg.edit {
    outline: 1px dashed rgba(55, 48, 163, 0.4);
    cursor: move;
  }
  .para.selected,
  .vtg.selected {
    outline: 1.5px solid #3730a3;
    outline-offset: 1px;
  }
</style>
