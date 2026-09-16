<script lang="ts">
  /**
   * Reversals - body page (manifest `reversals`), faithful to proof p33 /
   * "1.2 - Reversals" artboard.
   *
   * Three reversal types, each shown as two single-staff strips (Start at N,
   * thumb in, + 2 steps; right strip then left strip):
   *   Hand-reversal - the hand returns, the prop keeps spinning: pro n→e then
   *   anti e→n (right) / anti n→w then pro w→n (left). No R - the prop never
   *   flips.
   *   Prop-reversal - the hand continues, the prop reverses: pro n→e then
   *   anti e→s (right, R) / anti n→w then pro w→s (left, R).
   *   Full-reversal - prop AND hand retrace: pro n→e then pro e→n (red, R) /
   *   anti n→w then anti w→n (left, R).
   * Reversal flags follow the prop-only rule (R exactly where the prop's
   * rotation direction flips); orientations follow the algebra (pro keeps,
   * anti flips). FACELIFT: the old guide drew the "R" in the gutter between
   * pictographs - here it's the system's own reversal indicator inside the
   * step, same teaching.
   *
   * Reader: each strip click-animates Start + 2 steps with the staff.
   *
   * Geometry off the artboard border scan (20px/pt): 80pt cells; hand strips
   * x 35.3 y 138.8/242.6; prop strips x 352 y 363.2/469; full strips x 35.3
   * y 590.2/699.5; heavy rules y 107.1/337.6/562.3.
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
  const CW = RotationDirection.CLOCKWISE;
  const CCW = RotationDirection.COUNTER_CLOCKWISE;
  const NOROT = RotationDirection.NO_ROTATION;

  // Reader wiring (all null on /print,/book - pages stay pristine).
  const selection = getSequenceSelection();
  const activeStep = getGuideActiveStep();
  const emitSequence = getGuideSequenceClick();

  // ── Single-staff step authoring (other hand = invisible placeholder) ───────
  type M = {
    t: "pro" | "anti" | "static";
    from: GridLocation;
    to: GridLocation;
    rot: RotationDirection;
    so: Orientation;
    eo: Orientation;
  };
  const m = (
    t: M["t"],
    from: GridLocation,
    to: GridLocation,
    rot: RotationDirection,
    so: Orientation,
    eo: Orientation
  ): M => ({ t, from, to, rot, so, eo });

  const motionOf = (hand: HandSide, x: M) =>
    createMotionData({
      motionType:
        x.t === "pro"
          ? MotionType.PRO
          : x.t === "anti"
            ? MotionType.ANTI
            : MotionType.STATIC,
      rotationDirection: x.t === "static" ? NOROT : x.rot,
      startLocation: x.from,
      endLocation: x.to,
      startOrientation: x.so,
      endOrientation: x.eo,
      turns: 0,
      hand,
      propType: PropType.STAFF,
      gridMode: GridMode.DIAMOND,
    });

  type StripDef = {
    key: string;
    label: string;
    hand: HandSide;
    x: number;
    y: number;
    steps: M[];
    revStep?: number;
  };
  const STRIPS: StripDef[] = [
    // Hand-reversal: prop keeps its spin, hand comes back. No R.
    {
      key: "rev-hand-pro",
      label: "Pro→Anti",
      hand: HandSide.RIGHT,
      x: 35.3,
      y: 138.8,
      steps: [m("pro", N, E, CW, IN, IN), m("anti", E, N, CW, IN, OUT)],
    },
    {
      key: "rev-hand-anti",
      label: "Anti→Pro",
      hand: HandSide.LEFT,
      x: 35.3,
      y: 242.6,
      steps: [m("anti", N, W, CW, IN, OUT), m("pro", W, N, CW, OUT, OUT)],
    },
    // Prop-reversal: hand continues, prop flips. R on step 2.
    {
      key: "rev-prop-pro",
      label: "Pro→Anti",
      hand: HandSide.RIGHT,
      x: 352,
      y: 363.2,
      revStep: 2,
      steps: [m("pro", N, E, CW, IN, IN), m("anti", E, SO_, CCW, IN, OUT)],
    },
    {
      key: "rev-prop-anti",
      label: "Anti→Pro",
      hand: HandSide.LEFT,
      x: 352,
      y: 469,
      revStep: 2,
      steps: [m("anti", N, W, CW, IN, OUT), m("pro", W, SO_, CCW, OUT, OUT)],
    },
    // Full-reversal: prop and hand retrace. R on step 2.
    {
      key: "rev-full-pro",
      label: "Pro→Pro",
      hand: HandSide.RIGHT,
      x: 35.3,
      y: 590.2,
      revStep: 2,
      steps: [m("pro", N, E, CW, IN, IN), m("pro", E, N, CCW, IN, IN)],
    },
    {
      key: "rev-full-anti",
      label: "Anti→Anti",
      hand: HandSide.LEFT,
      x: 35.3,
      y: 699.5,
      revStep: 2,
      steps: [m("anti", N, W, CW, IN, OUT), m("anti", W, N, CCW, OUT, IN)],
    },
  ];

  const stepData = (s: StripDef, i: number): StepData => {
    const isRight = s.hand === HandSide.RIGHT;
    const live = motionOf(s.hand, s.steps[i]!);
    const ghost = createPlaceholderMotion(
      isRight ? HandSide.LEFT : HandSide.RIGHT,
      { location: SO_, orientation: IN }
    );
    return {
      id: `${s.key}-${i + 1}`,
      letter: null,
      gridMode: GridMode.DIAMOND,
      stepNumber: i + 1,
      leftReversal: !isRight && s.revStep === i + 1,
      rightReversal: isRight && s.revStep === i + 1,
      motions: { left: isRight ? ghost : live, right: isRight ? live : ghost },
    } as unknown as StepData;
  };

  const startBox = (s: StripDef): StepData => {
    const isRight = s.hand === HandSide.RIGHT;
    const live = motionOf(s.hand, m("static", N, N, NOROT, IN, IN));
    const ghost = createPlaceholderMotion(
      isRight ? HandSide.LEFT : HandSide.RIGHT,
      { location: SO_, orientation: IN }
    );
    return {
      id: `${s.key}-0`,
      letter: null,
      gridMode: GridMode.DIAMOND,
      stepNumber: 0,
      motions: { left: isRight ? ghost : live, right: isRight ? live : ghost },
    } as unknown as StepData;
  };

  const stripSteps = (s: StripDef): StepData[] => [
    startBox(s),
    stepData(s, 0),
    stepData(s, 1),
  ];

  // Admin override (guide-overrides.svelte) replaces the WHOLE strip when
  // present, resolved before baking - reversal dots stay derived either way.
  // Reactive so a save/revert/reset while the reader is open re-renders.
  const resolvedStripSteps = (s: StripDef): StepData[] => {
    const authored = stripSteps(s);
    const override = overrideStepsFor(s.key);
    const full = override && override.length > 0 ? override : authored;
    const [start, ...steps] = full;
    return [start!, ...bakeReversals(steps)];
  };
  const RESOLVED: Record<string, StepData[]> = $derived(
    Object.fromEntries(STRIPS.map((s) => [s.key, resolvedStripSteps(s)]))
  );

  // ── Geometry + heads ────────────────────────────────────────────────────────
  const CELL = 80;
  const RULES = [107.1, 337.6, 562.3];
  const HEADS = [
    { t: "Hand-reversal", x: 350, y: 148 },
    { t: "Prop-reversal", x: 48, y: 372 },
    { t: "Full-reversal", x: 362, y: 600 },
  ];

  // ── Text (artboard-derived coords; side columns like the LOOPs page) ───────
  type Para = {
    y: number;
    fs: number;
    lh: number;
    left?: number;
    width?: number;
    html: string;
  };
  let PARAS: Para[] = $state([
    {
      y: 55,
      fs: 15,
      lh: 18,
      html: "Reversals open up a huge number of possibilities!<br>There are three types of reversals:",
    },
    {
      y: 218,
      fs: 14.5,
      lh: 17.4,
      left: 310,
      width: 290,
      html:
        "With a hand reversal, the hand returns to the point it came from previously, without changing the " +
        "prop’s direction of spin. Relative to the center point, this changes a prospin to an antispin and vice-versa.",
    },
    {
      y: 306,
      fs: 14.5,
      lh: 17.4,
      left: 310,
      width: 290,
      html: "This is the simplest and least disruptive reversal. We’ve already used it in the previous examples.",
    },
    {
      y: 432,
      fs: 14.5,
      lh: 17.4,
      left: 16,
      width: 320,
      html:
        "With a prop reversal, the hand continues to the next point while the prop reverses direction. " +
        "This reversal also changes a prospin into an antispin and vice-versa.",
    },
    {
      y: 504,
      fs: 14.5,
      lh: 17.4,
      left: 16,
      width: 320,
      html:
        'Since a prop reversal is less intuitive, an “<strong class="cR">R</strong>/<strong class="cB">R</strong>” is shown in the ' +
        "corresponding color on the pictograph to indicate it.",
    },
    {
      y: 652,
      fs: 14.5,
      lh: 17.4,
      left: 310,
      width: 290,
      html:
        "With a full-reversal, the prop and hand retrace their paths and return to their previous position, " +
        "as if going backwards in time.",
    },
    {
      y: 722,
      fs: 14.5,
      lh: 17.4,
      left: 310,
      width: 290,
      html:
        'Because this contains a prop reversal, the “<strong class="cR">R</strong>/<strong class="cB">R</strong>” draws attention to it. ' +
        "This succinctly indicates to the performer that something unusual is happening.",
    },
  ]);

  const r1 = (n: number) => Math.round(n * 10) / 10;
  $effect(() =>
    registerEditSource("Reversals (p33)", () =>
      PARAS.map(
        (p, i) =>
          `  para[${i}]: y: ${r1(p.y)}${p.left != null ? `, left: ${r1(p.left)}` : ""}`
      ).join("\n")
    )
  );

  const PICTO_FLAGS = {
    showGrid: true,
    showTKA: false,
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

<div class="reversals-page">
  <!-- Heavy rules + side section heads. -->
  {#each RULES as ry (ry)}
    <div
      class="rule"
      style="left:{20 * S}px; top:{ry * S}px; width:{572 * S}px"
    ></div>
  {/each}
  {#each HEADS as h (h.t)}
    <div
      class="guide-title side-head"
      style="left:{h.x * S}px; right:auto; top:{h.y * S}px"
    >
      {h.t}
    </div>
  {/each}

  <!-- Six single-staff strips with their Pro→Anti / Anti→Pro labels. -->
  {#each STRIPS as s (s.key)}
    <span
      class="strip-label"
      style="left:{(s.x + CELL * 1.5 - 60) * S}px; top:{(s.y - 17) *
        S}px; width:{120 * S}px; font-size:{14 * S}px">{s.label}</span
    >
    <div
      class="strip-wrap tka-seq-cell"
      class:is-hovered={selection?.isHovered(s.key)}
      class:is-selected={selection?.isSelected(s.key)}
      style="left:{s.x * S}px; top:{s.y * S}px; width:{CELL *
        3 *
        S}px; height:{CELL * S}px"
    >
      {#each [0, 1, 2] as i (i)}
        <div
          class="mini"
          class:guide-step-active={activeStep?.key === s.key &&
            activeStep.ringStep === i}
          style="left:{i * CELL * S}px; top:0; width:{CELL *
            S}px; height:{CELL * S}px"
        >
          <PictographContainer
            pictographData={RESOLVED[s.key]![i]}
            gridMode={GridMode.DIAMOND}
            leftPropTypeOverride={PropType.STAFF}
            rightPropTypeOverride={PropType.STAFF}
            stepNumberOverride={true}
            {...PICTO_FLAGS}
          />
        </div>
      {/each}
      <SelectionHit
        groupId={s.key}
        isGroupStart
        label={`Animate the ${s.label} ${s.hand} reversal`}
        onselect={() =>
          emitSequence?.({
            strip: RESOLVED[s.key]!,
            word: s.label,
            key: s.key,
            propType: "staff",
          })}
      />
    </div>
  {/each}

  <!-- Paragraphs: centred intro + side columns. -->
  {#each PARAS as p, i (i)}
    <p
      class="para"
      class:edit={guideEdit.on}
      class:selected={guideEdit.selectedId === `rev-para-${i}`}
      style="top:{p.y * S}px; font-size:{p.fs * S}px; line-height:{p.lh *
        S}px; {p.left != null
        ? `left:${p.left * S}px; right:auto; width:${(p.width ?? 290) * S}px;`
        : ''}"
      use:ptDrag={pt(`rev-para-${i}`, "para", p)}
      use:editText={{
        id: `rev-para-${i}`,
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
  .reversals-page {
    position: absolute;
    inset: 0;
    color: #141414;
  }

  .rule {
    position: absolute;
    height: 2.5px;
    background: #141414;
  }

  .side-head {
    font-size: 42px;
    text-align: left;
  }

  .strip-wrap {
    position: absolute;
  }

  .mini {
    position: absolute;
    border: 1px solid #c4c4cc;
    box-sizing: border-box;
  }

  .strip-label {
    position: absolute;
    font-family: "Cambria", Georgia, "Times New Roman", serif;
    font-style: italic;
    font-weight: 600;
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
