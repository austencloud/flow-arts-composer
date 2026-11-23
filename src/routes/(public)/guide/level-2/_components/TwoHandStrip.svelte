<script lang="ts">
  /**
   * One two-hand turn breakdown for the Level 2 turn sections (Types 1 to 6):
   * start, halfway and end poses plus the full motion, playing in a compact
   * showcase. It is the same figure OpeningClosing.svelte builds for the Lam
   * strips, made reusable. The motion data of every caller is copied from the
   * print page named at the call (Type1DualShiftPage.svelte and its siblings),
   * which stays the source of truth. A turn on a static hand is drawn the way
   * OpeningClosing draws it: the hand holds its place and the staff spins.
   */
  import SequenceShowcase from "../../level-1/_components/SequenceShowcase.svelte";
  import TurnStrip, { type TurnStripFrame } from "./TurnStrip.svelte";
  import {
    createMotionData,
    type MotionData,
  } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
  import {
    MotionType,
    HandSide,
    Orientation,
    RotationDirection,
  } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import {
    GridMode,
    type GridLocation,
  } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import type { HalfwayMotion } from "../_data/halfway-pose";
  import {
    bakeReversals,
    stripToSequence,
  } from "../../level-1/_data/guide-sequence-adapter";

  import type { StripHand } from "../_data/type-strips";

  let {
    id,
    word,
    left,
    right,
    caption,
    stripOnly = false,
  }: {
    /** Unique across the page: names the click-to-animate target. */
    id: string;
    /** The TKA word the strip shows; also its caption when none is given. */
    word: string;
    /** Blue hand. */
    left: StripHand;
    /** Red hand. */
    right: StripHand;
    caption?: string;
    /** Only the frames, no player: for a screen too short to hold the stage. */
    stripOnly?: boolean;
  } = $props();

  const { IN, OUT } = Orientation;
  const NOROT = RotationDirection.NO_ROTATION;
  const B = HandSide.LEFT;
  const R = HandSide.RIGHT;

  const mo = (
    color: HandSide,
    type: MotionType,
    from: GridLocation,
    to: GridLocation,
    rot: RotationDirection,
    so: Orientation,
    eo: Orientation,
    turns = 0
  ): MotionData =>
    createMotionData({
      motionType: type,
      rotationDirection: rot,
      startLocation: from,
      endLocation: to,
      startOrientation: so,
      endOrientation: eo,
      turns,
      color,
      propType: PropType.STAFF,
      gridMode: GridMode.DIAMOND,
    });
  const stat = (color: HandSide, loc: GridLocation, ori: Orientation) =>
    mo(color, MotionType.STATIC, loc, loc, NOROT, ori, ori);
  const endOf = (h: StripHand): Orientation =>
    ((h.type === MotionType.ANTI || h.type === MotionType.DASH ? 1 : 0) +
      h.turns) %
      2 ===
    0
      ? IN
      : OUT;

  const built = $derived.by(() => {
    const bEnd = endOf(left);
    const rEnd = endOf(right);
    const hm = (h: StripHand, eo: Orientation): HalfwayMotion => ({
      type: h.type,
      from: h.from,
      to: h.to,
      rot: h.rot,
      startOri: IN,
      endOri: eo,
      turns: h.turns,
    });
    const step = (
      key: string,
      l: MotionData,
      r: MotionData,
      stepNumber: number
    ) =>
      ({
        id: `l2t-${id}-${key}`,
        letter: null,
        gridMode: GridMode.DIAMOND,
        motions: { left: l, right: r },
        stepNumber,
      }) as unknown as StepData;
    const startStep = step(
      "start",
      stat(B, left.from, IN),
      stat(R, right.from, IN),
      0
    );
    const endStep = step(
      "end",
      stat(B, left.to, bEnd),
      stat(R, right.to, rEnd),
      0
    );
    const combinedStep = step(
      "full",
      mo(B, left.type, left.from, left.to, left.rot, IN, bEnd, left.turns),
      mo(R, right.type, right.from, right.to, right.rot, IN, rEnd, right.turns),
      1
    );
    const rowSteps = [startStep, ...bakeReversals([combinedStep])];
    // Both thumbs finish the same way: say which. Mixed endings stay unlabelled.
    const endLabel =
      bEnd === rEnd ? (bEnd === IN ? "in" : "out") : undefined;
    const frames: TurnStripFrame[] = [
      { kind: "start", step: startStep, frameLabel: "start", thumbLabel: "in" },
      {
        kind: "dual-pose",
        poses: [
          { motion: hm(left, bEnd), color: B, t: 0.5 },
          { motion: hm(right, rEnd), color: R, t: 0.5 },
        ],
        frameLabel: "halfway",
      },
      {
        kind: "end",
        step: endStep,
        frameLabel: "end",
        thumbLabel: endLabel,
      },
      {
        kind: "combined",
        step: combinedStep,
        animKey: `l2t-${id}`,
        word,
        rowSteps,
      },
    ];
    return { frames, sequence: stripToSequence(rowSteps, { word, name: word }) };
  });
</script>

{#if stripOnly}
  <TurnStrip frames={built.frames} caption={caption ?? word} />
{:else}
<div class="showcase-wrap">
  <SequenceShowcase
    variant="compact"
    render={{ propType: PropType.STAFF }}
    sequence={built.sequence}
    items={[]}
    bpm={60}
  >
    {#snippet strip(t)}
      <TurnStrip frames={built.frames} activeT={t} caption={caption ?? word} />
    {/snippet}
  </SequenceShowcase>
</div>
{/if}

<style>
  .showcase-wrap {
    /* The showcase inside is a container-query container, so it has no
       intrinsic width: this wrapper takes a definite width from the grid. */
    grid-column: full-start / full-end;
    width: 100%;
    max-width: 76rem;
    justify-self: center;
    margin: 1.9rem 0;
    padding: 0 2rem;
  }
</style>
