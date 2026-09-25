<script lang="ts">
  /**
   * Real-pictograph diagrams for the Type 1 (dual-shift) 1|1 breakdown,
   * mirroring OneOneType1Page.svelte's four `STRIPS` (D, I, N, V) exactly -
   * same motions/turns/orientations, the print artboard is the source of
   * truth for this data. Both hands turn simultaneously on every strip, so
   * the halfway frame uses TurnStrip's dual-pose kind (two staves in one
   * cell) rather than buildHalvedStep - matching the print artboard, which
   * also renders these via the raw halfwayPose interpolator rather than the
   * halved-pictograph pipeline.
   *
   * Types 2 through 6 are left as their original TODO markers: their source
   * artboards (OneOneType23Page.svelte, OneOneType456Page.svelte) were not
   * part of this task's assigned data sources, so no motion data has been
   * copied for them here - inventing it would violate the "never invent
   * motions" rule.
   */
  import GuideSection from "../../../level-1/_components/GuideSection.svelte";
  import SequenceShowcase from "../../../level-1/_components/SequenceShowcase.svelte";
  import TurnStrip, { type TurnStripFrame } from "../../_components/TurnStrip.svelte";
  import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import {
    MotionType,
    HandSide,
    Orientation,
    RotationDirection,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { GridMode, GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { HalfwayMotion } from "../../_data/halfway-pose";
  import { bakeReversals, stripToSequence } from "../../../level-1/_data/guide-sequence-adapter";

  const { NORTH: N, EAST: E, SOUTH: SO_, WEST: W } = GridLocation;
  const { IN, OUT } = Orientation;
  const CW = RotationDirection.CLOCKWISE;
  const CCW = RotationDirection.COUNTER_CLOCKWISE;
  const NOROT = RotationDirection.NO_ROTATION;
  const B = HandSide.LEFT;
  const R = HandSide.RIGHT;
  const PRO = MotionType.PRO;
  const ANTI = MotionType.ANTI;

  const mo = (
    color: HandSide,
    type: MotionType,
    from: GridLocation,
    to: GridLocation,
    rot: RotationDirection,
    so: Orientation,
    eo: Orientation,
    turns = 0
  ) =>
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

  type Hand = { type: MotionType; from: GridLocation; to: GridLocation; rot: RotationDirection };
  const H = (type: MotionType, from: GridLocation, to: GridLocation, rot: RotationDirection): Hand => ({ type, from, to, rot });
  const half = (t: MotionType): number => (t === ANTI ? 1 : 0) + 1;
  const endOf = (t: MotionType): Orientation => (half(t) % 2 === 0 ? IN : OUT);

  function makeStrip(opts: { id: string; word: string; endThumb: string; halfThumb?: string; left: Hand; right: Hand }) {
    const bEnd = endOf(opts.left.type);
    const rEnd = endOf(opts.right.type);
    const hm = (h: Hand, eo: Orientation): HalfwayMotion => ({
      type: h.type,
      from: h.from,
      to: h.to,
      rot: h.rot,
      startOri: IN,
      endOri: eo,
      turns: 1,
    });
    const step = (id: string, left, right) => ({
      id: `l2oo1-${opts.id}-${id}`,
      letter: null,
      gridMode: GridMode.DIAMOND,
      motions: { left, right },
    });
    const startStep = step("start", stat(B, opts.left.from, IN), stat(R, opts.right.from, IN)) as unknown as StepData;
    const endStep = step("end", stat(B, opts.left.to, bEnd), stat(R, opts.right.to, rEnd)) as unknown as StepData;
    const combinedData = step(
      "full",
      mo(B, opts.left.type, opts.left.from, opts.left.to, opts.left.rot, IN, bEnd, 1),
      mo(R, opts.right.type, opts.right.from, opts.right.to, opts.right.rot, IN, rEnd, 1)
    );
    const combinedStep = { ...combinedData, stepNumber: 1 } as unknown as StepData;
    const animKey = `l2oo1-${opts.id}`;
    const rowSteps = [
      { ...startStep, stepNumber: 0 } as unknown as StepData,
      ...bakeReversals([combinedStep]),
    ];
    const frames: TurnStripFrame[] = [
      { kind: "start", step: { ...startStep, stepNumber: 0 } as unknown as StepData, frameLabel: "start", thumbLabel: "in" },
      {
        kind: "dual-pose",
        poses: [
          { motion: hm(opts.left, bEnd), color: B, t: 0.5 },
          { motion: hm(opts.right, rEnd), color: R, t: 0.5 },
        ],
        frameLabel: "halfway",
        thumbLabel: opts.halfThumb,
      },
      { kind: "end", step: { ...endStep, stepNumber: 0 } as unknown as StepData, frameLabel: "end", thumbLabel: opts.endThumb },
      { kind: "combined", step: combinedStep, animKey, word: opts.word, rowSteps },
    ];
    const sequence = stripToSequence(rowSteps, { word: opts.word, name: opts.word });
    return { frames, sequence };
  }

  const { frames: dFrames, sequence: dSequence } = makeStrip({
    id: "d", word: "D-One-One", endThumb: "out",
    left: H(PRO, N, W, CCW), right: H(PRO, N, E, CW),
  });
  const { frames: iFrames, sequence: iSequence } = makeStrip({
    id: "i", word: "I-One-One", endThumb: "mixed",
    left: H(ANTI, E, SO_, CCW), right: H(PRO, E, SO_, CW),
  });
  const { frames: nFrames, sequence: nSequence } = makeStrip({
    id: "n", word: "N-One-One", endThumb: "in", halfThumb: "out",
    left: H(ANTI, SO_, E, CW), right: H(ANTI, W, N, CCW),
  });
  const { frames: vFrames, sequence: vSequence } = makeStrip({
    id: "v", word: "V-One-One", endThumb: "mixed",
    left: H(ANTI, W, N, CCW), right: H(PRO, SO_, W, CW),
  });
</script>

<GuideSection id="one-one-turns" title="1|1 Turns">
  <div class="section-body">
    <p>
      For a turn on both props, add a "1" in both the high and the low slot. This can also be written as 1|1. Here are some cherry-picked examples of 1|1 in each Type. Since you know all the mechanisms involved, explanation is kept to a minimum.
    </p>

    <h3>Type 1</h3>
    <p>Pause at the halfway point of each motion while learning. This will ensure accurate timing.</p>
  </div>

  <div class="showcase-wrap">
    <SequenceShowcase variant="compact" render={{ propType: PropType.STAFF }} sequence={dSequence} items={[]} bpm={60}>
      {#snippet strip(t)}
        <TurnStrip frames={dFrames} activeT={t} caption="D-One-One - both hands prospin together, watch them turn in sync, ending with thumbs out" />
      {/snippet}
    </SequenceShowcase>
  </div>
  <div class="showcase-wrap">
    <SequenceShowcase variant="compact" render={{ propType: PropType.STAFF }} sequence={iSequence} items={[]} bpm={60}>
      {#snippet strip(t)}
        <TurnStrip frames={iFrames} activeT={t} caption="I-One-One - one hand prospins while the other antispins at the same time, ending with mixed thumb references" />
      {/snippet}
    </SequenceShowcase>
  </div>
  <div class="showcase-wrap">
    <SequenceShowcase variant="compact" render={{ propType: PropType.STAFF }} sequence={nSequence} items={[]} bpm={60}>
      {#snippet strip(t)}
        <TurnStrip frames={nFrames} activeT={t} caption="N-One-One - both hands antispin together, watch them turn in sync, ending with thumbs in" />
      {/snippet}
    </SequenceShowcase>
  </div>
  <div class="showcase-wrap">
    <SequenceShowcase variant="compact" render={{ propType: PropType.STAFF }} sequence={vSequence} items={[]} bpm={60}>
      {#snippet strip(t)}
        <TurnStrip frames={vFrames} activeT={t} caption="V-One-One - one hand antispins while the other prospins at the same time, ending with mixed thumb references" />
      {/snippet}
    </SequenceShowcase>
  </div>

  <div class="section-body">
    <h3>Type 2</h3>
    <!-- TODO: add diagram - X-Same One-One, X-Opp One-One -->

    <h3>Type 3</h3>
    <!-- TODO: add diagram - Theta-Dash Same One-One, Theta-Dash Opp One-One, Delta-Dash Same One-One, Delta-Dash Opp One-One -->

    <h3>Type 4</h3>
    <!-- TODO: add diagram - Phi-Same One-One, Phi-Opp One-One -->

    <h3>Type 5</h3>
    <!-- TODO: add diagram - Psi-Dash Same One-One, Psi-Dash Opp One-One -->

    <h3>Type 6</h3>
    <!-- TODO: add diagram - Gamma Opp One-One (two variations) -->
  </div>
</GuideSection>

<style>
  /* GuideSection owns text width; these rules set paragraph rhythm. */
  .section-body :global(p) {
    margin: 0 auto 1.1rem;
    text-align: center;
    text-wrap: balance;
  }
  .section-body :global(p:last-child) {
    margin-bottom: 0;
  }
  .section-body :global(h3) {
    text-align: center;
    text-wrap: balance;
    margin: 1.75rem 0 0.35rem;
  }
  .section-body :global(h3:first-child) {
    margin-top: 0;
  }
  .showcase-wrap {
    /* The showcase inside is a container-query container (container-type:
       inline-size), so it has ZERO intrinsic width - this wrapper must get a
       DEFINITE width from the grid (width: 100% + justify-self), never
       shrink-to-fit (auto width + auto margins collapsed it to its padding). */
    grid-column: full-start / full-end;
    width: 100%;
    max-width: 76rem;
    justify-self: center;
    margin: 1.9rem 0;
    padding: 0 2rem;
  }
</style>
