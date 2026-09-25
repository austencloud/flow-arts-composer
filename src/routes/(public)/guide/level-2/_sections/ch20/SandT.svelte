<script lang="ts">
  /**
   * Real-pictograph diagrams for the S/T leading-following breakdown,
   * mirroring SAndTPage.svelte's four `STRIPS` (S-High, S-Low, T-High,
   * T-Low) exactly - same motions/turns/orientations, the print artboard
   * is the source of truth for this data. Both hands move on every strip,
   * so the halfway frame uses TurnStrip's dual-pose kind, matching how the
   * print artboard renders these via the raw halfway-pose interpolator.
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
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { HalfwayMotion } from "../../_data/halfway-pose";
  import { bakeReversals, stripToSequence } from "../../../level-1/_data/guide-sequence-adapter";

  const { EAST: E, SOUTH: SO_, WEST: W } = GridLocation;
  const { IN, OUT } = Orientation;
  const CW = RotationDirection.CLOCKWISE;
  const CCW = RotationDirection.COUNTER_CLOCKWISE;
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
  const halfTurns = (type: MotionType, turns: number): number => (type === MotionType.ANTI ? 1 : 0) + turns;
  const endOri = (type: MotionType, turns: number): Orientation => (halfTurns(type, turns) % 2 === 0 ? IN : OUT);

  function makeStrip(opts: {
    id: string;
    word: string;
    left: Hand;
    right: Hand;
    leftTurns: number;
    rightTurns: number;
  }): { frames: TurnStripFrame[]; sequence: SequenceData } {
    const bEnd = endOri(opts.left.type, opts.leftTurns);
    const rEnd = endOri(opts.right.type, opts.rightTurns);
    const bHalf: HalfwayMotion = { type: opts.left.type, from: opts.left.from, to: opts.left.to, rot: opts.left.rot, startOri: IN, endOri: bEnd, turns: opts.leftTurns };
    const rHalf: HalfwayMotion = { type: opts.right.type, from: opts.right.from, to: opts.right.to, rot: opts.right.rot, startOri: IN, endOri: rEnd, turns: opts.rightTurns };
    const step = (id: string, left, right) => ({
      id: `l2st-${opts.id}-${id}`,
      letter: null,
      gridMode: GridMode.DIAMOND,
      motions: { left, right },
    });
    const startStep = { ...step("start", stat(B, opts.left.from, IN), stat(R, opts.right.from, IN)), stepNumber: 0 } as unknown as StepData;
    const endStep = { ...step("end", stat(B, opts.left.to, bEnd), stat(R, opts.right.to, rEnd)), stepNumber: 0 } as unknown as StepData;
    const combinedStep = {
      ...step(
        "full",
        mo(B, opts.left.type, opts.left.from, opts.left.to, opts.left.rot, IN, bEnd, opts.leftTurns),
        mo(R, opts.right.type, opts.right.from, opts.right.to, opts.right.rot, IN, rEnd, opts.rightTurns)
      ),
      stepNumber: 1,
    } as unknown as StepData;
    const animKey = `l2st-${opts.id}`;
    const rowSteps = [startStep, ...bakeReversals([combinedStep])];
    const frames: TurnStripFrame[] = [
      { kind: "start", step: startStep, frameLabel: "start", thumbLabel: "in" },
      {
        kind: "dual-pose",
        poses: [
          { motion: bHalf, color: B, t: 0.5 },
          { motion: rHalf, color: R, t: 0.5 },
        ],
        frameLabel: "halfway",
      },
      { kind: "end", step: endStep, frameLabel: "end", thumbLabel: "mixed" },
      { kind: "combined", step: combinedStep, animKey, word: opts.word, rowSteps },
    ];
    const sequence = stripToSequence(rowSteps, { word: opts.word, name: opts.word });
    return { frames, sequence };
  }

  // S = pro|pro leading/following; T = anti|anti leading/following. Both use
  // the same base blue w→s / red s→e variation SAndTPage draws from.
  const S_BLUE: Hand = { type: MotionType.PRO, from: W, to: SO_, rot: CCW };
  const S_RED: Hand = { type: MotionType.PRO, from: SO_, to: E, rot: CCW };
  const T_BLUE: Hand = { type: MotionType.ANTI, from: W, to: SO_, rot: CW };
  const T_RED: Hand = { type: MotionType.ANTI, from: SO_, to: E, rot: CW };

  const { frames: sHighFrames, sequence: sHighSequence } = makeStrip({ id: "s-hi", word: "S-High-One", left: S_BLUE, right: S_RED, leftTurns: 1, rightTurns: 0 });
  const { frames: sLowFrames, sequence: sLowSequence } = makeStrip({ id: "s-lo", word: "S-Low-One", left: S_BLUE, right: S_RED, leftTurns: 0, rightTurns: 1 });
  const { frames: tHighFrames, sequence: tHighSequence } = makeStrip({ id: "t-hi", word: "T-High-One", left: T_BLUE, right: T_RED, leftTurns: 1, rightTurns: 0 });
  const { frames: tLowFrames, sequence: tLowSequence } = makeStrip({ id: "t-lo", word: "T-Low-One", left: T_BLUE, right: T_RED, leftTurns: 0, rightTurns: 1 });
</script>

<GuideSection id="s-and-t" title="S and T">
  <div class="section-body">
    <p>
      S and T are a different type of hybrid. Even though their motions are a matching shift type (pro|pro, anti|anti), each has one hand leading and the other following. Though this doesn't affect their base forms, it produces additional variations when modifying their motions. S and T are the only letters that have a leader and follower while both hands share the same motion type.
    </p>

    <p>
      Fortunately, we have a tool to disambiguate hybrids: the high/low slots. For S and T, high = leading and low = following.
    </p>
  </div>

  <div class="showcase-wrap">
    <SequenceShowcase variant="compact" render={{ propType: PropType.STAFF }} sequence={sHighSequence} items={[]} bpm={60}>
      {#snippet strip(t)}
        <TurnStrip frames={sHighFrames} activeT={t} caption="S-High-One - both hands prospin; the leading hand carries the turn, the following hand only travels" />
      {/snippet}
    </SequenceShowcase>
  </div>
  <div class="showcase-wrap">
    <SequenceShowcase variant="compact" render={{ propType: PropType.STAFF }} sequence={sLowSequence} items={[]} bpm={60}>
      {#snippet strip(t)}
        <TurnStrip frames={sLowFrames} activeT={t} caption="S-Low-One - both hands prospin; the following hand carries the turn, the leading hand only travels" />
      {/snippet}
    </SequenceShowcase>
  </div>
  <div class="showcase-wrap">
    <SequenceShowcase variant="compact" render={{ propType: PropType.STAFF }} sequence={tHighSequence} items={[]} bpm={60}>
      {#snippet strip(t)}
        <TurnStrip frames={tHighFrames} activeT={t} caption="T-High-One - both hands antispin; the leading hand carries the turn, the following hand only travels" />
      {/snippet}
    </SequenceShowcase>
  </div>
  <div class="showcase-wrap">
    <SequenceShowcase variant="compact" render={{ propType: PropType.STAFF }} sequence={tLowSequence} items={[]} bpm={60}>
      {#snippet strip(t)}
        <TurnStrip frames={tLowFrames} activeT={t} caption="T-Low-One - both hands antispin; the following hand carries the turn, the leading hand only travels" />
      {/snippet}
    </SequenceShowcase>
  </div>

  <div class="section-body">
    <p>
      Note that these leading/following rules do NOT apply to U and V. Even though U and V have a leader/follower, their slots refer to pro/anti.
    </p>
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
