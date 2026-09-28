<script lang="ts">
  import { t as translate } from "$lib/shared/i18n/i18n.svelte.js";
  /**
   * Real-pictograph diagrams for the Lam (Λ) opening/closing breakdown,
   * mirroring OpeningClosingPage.svelte's four `STRIPS` exactly - same
   * motions/turns/orientations, the print artboard is the source of truth
   * for this data. The print artboard's bonus "Continuation" column (a
   * hypothetical pro-shift showing why each variant is called opening/W or
   * closing/Y) has no corresponding prose or TODO in this article section -
   * omitted here to avoid inventing new copy around it, same judgment call
   * ch21's DoubleTurnShifts made for TwoTurnsShiftsPage's bonus antiHalves
   * strip. Both hands move on every strip (one hand always turns, the other
   * stays at its base form), so the halfway frame uses TurnStrip's
   * dual-pose kind, matching how the print artboard renders these via the
   * raw halfway-pose interpolator.
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

  const { NORTH: N, SOUTH: SO_, WEST: W } = GridLocation;
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

  type Hand = { type: MotionType; from: GridLocation; to: GridLocation; rot: RotationDirection; turns: number };
  const half = (h: Hand): number => (h.type === MotionType.ANTI || h.type === MotionType.DASH ? 1 : 0) + h.turns;
  const endOf = (h: Hand): Orientation => (half(h) % 2 === 0 ? IN : OUT);

  function makeStrip(opts: { id: string; word: string; left: Hand; right: Hand }): { frames: TurnStripFrame[]; sequence: SequenceData } {
    const bEnd = endOf(opts.left);
    const rEnd = endOf(opts.right);
    const hm = (h: Hand, eo: Orientation): HalfwayMotion => ({
      type: h.type,
      from: h.from,
      to: h.to,
      rot: h.rot,
      startOri: IN,
      endOri: eo,
      turns: h.turns,
    });
    const step = (id: string, left, right) => ({
      id: `l2lam-${opts.id}-${id}`,
      letter: null,
      gridMode: GridMode.DIAMOND,
      motions: { left, right },
    });
    const startStep = { ...step("start", stat(B, opts.left.from, IN), stat(R, opts.right.from, IN)), stepNumber: 0 } as unknown as StepData;
    const endStep = { ...step("end", stat(B, opts.left.to, bEnd), stat(R, opts.right.to, rEnd)), stepNumber: 0 } as unknown as StepData;
    const combinedStep = {
      ...step(
        "full",
        mo(B, opts.left.type, opts.left.from, opts.left.to, opts.left.rot, IN, bEnd, opts.left.turns),
        mo(R, opts.right.type, opts.right.from, opts.right.to, opts.right.rot, IN, rEnd, opts.right.turns)
      ),
      stepNumber: 1,
    } as unknown as StepData;
    const animKey = `l2lam-${opts.id}`;
    const rowSteps = [startStep, ...bakeReversals([combinedStep])];
    const frames: TurnStripFrame[] = [
      { kind: "start", step: startStep, frameLabel: "start", thumbLabel: "in" },
      {
        kind: "dual-pose",
        poses: [
          { motion: hm(opts.left, bEnd), color: B, t: 0.5 },
          { motion: hm(opts.right, rEnd), color: R, t: 0.5 },
        ],
        frameLabel: "halfway",
      },
      { kind: "end", step: endStep, frameLabel: "end", thumbLabel: bEnd === IN ? "in" : "out" },
      { kind: "combined", step: combinedStep, animKey, word: opts.word, rowSteps },
    ];
    const sequence = stripToSequence(rowSteps, { word: opts.word, name: opts.word });
    return { frames, sequence };
  }

  // Λ = static(blue @W) + dash(red s→n), the same base OpeningClosingPage draws from.
  const STAT_BLUE = (turns: number, rot: RotationDirection): Hand => ({ type: MotionType.STATIC, from: W, to: W, rot, turns });
  const DASH_RED = (turns: number, rot: RotationDirection): Hand => ({ type: MotionType.DASH, from: SO_, to: N, rot, turns });

  const { frames: highOpenFrames, sequence: highOpenSequence } = makeStrip({
    id: "hi-op", word: "Lam-High-One opening",
    left: STAT_BLUE(0, NOROT), right: DASH_RED(1, CW),
  });
  const { frames: highCloseFrames, sequence: highCloseSequence } = makeStrip({
    id: "hi-cl", word: "Lam-High-One closing",
    left: STAT_BLUE(0, NOROT), right: DASH_RED(1, CCW),
  });
  const { frames: lowOpenFrames, sequence: lowOpenSequence } = makeStrip({
    id: "lo-op", word: "Lam-Low-One opening",
    left: STAT_BLUE(1, CCW), right: DASH_RED(0, NOROT),
  });
  const { frames: lowCloseFrames, sequence: lowCloseSequence } = makeStrip({
    id: "lo-cl", word: "Lam-Low-One closing",
    left: STAT_BLUE(1, CW), right: DASH_RED(0, NOROT),
  });
</script>

<GuideSection id="opening-closing" title={translate("guide_l2_open_close_title")}>
  <div class="section-body">
    <p>
      {translate("guide_l2_open_close_intro")}
    </p>
  </div>

  <div class="showcase-wrap">
    <SequenceShowcase variant="compact" render={{ propType: PropType.STAFF }} sequence={highOpenSequence} items={[]} bpm={60}>
      {#snippet strip(t)}
        <TurnStrip frames={highOpenFrames} activeT={t} caption={translate("guide_l2_open_close_high_open_caption")} />
      {/snippet}
    </SequenceShowcase>
  </div>
  <div class="showcase-wrap">
    <SequenceShowcase variant="compact" render={{ propType: PropType.STAFF }} sequence={highCloseSequence} items={[]} bpm={60}>
      {#snippet strip(t)}
        <TurnStrip frames={highCloseFrames} activeT={t} caption={translate("guide_l2_open_close_high_close_caption")} />
      {/snippet}
    </SequenceShowcase>
  </div>

  <div class="section-body">
    <p>
      {translate("guide_l2_open_close_static_turn")}
    </p>
  </div>

  <div class="showcase-wrap">
    <SequenceShowcase variant="compact" render={{ propType: PropType.STAFF }} sequence={lowOpenSequence} items={[]} bpm={60}>
      {#snippet strip(t)}
        <TurnStrip frames={lowOpenFrames} activeT={t} caption={translate("guide_l2_open_close_low_open_caption")} />
      {/snippet}
    </SequenceShowcase>
  </div>
  <div class="showcase-wrap">
    <SequenceShowcase variant="compact" render={{ propType: PropType.STAFF }} sequence={lowCloseSequence} items={[]} bpm={60}>
      {#snippet strip(t)}
        <TurnStrip frames={lowCloseFrames} activeT={t} caption={translate("guide_l2_open_close_low_close_caption")} />
      {/snippet}
    </SequenceShowcase>
  </div>

  <div class="section-body">
    <p>
      {translate("guide_l2_open_close_speech")}
    </p>

    <p>
      {translate("guide_l2_open_close_code")}
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
