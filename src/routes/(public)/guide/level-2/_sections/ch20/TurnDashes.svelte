<script lang="ts">
  /**
   * Real-pictograph diagram for the 1-turn dash breakdown, mirroring
   * DashStaticTurnsPage.svelte's dash row (`ROWS[0]`) exactly - same motion/
   * turns/orientations, the print artboard is the source of truth for this
   * data.
   */
  import GuideSection from "../../../level-1/_components/GuideSection.svelte";
  import SequenceShowcase from "../../../level-1/_components/SequenceShowcase.svelte";
  import TurnStrip, {
    type TurnStripFrame,
  } from "../../_components/TurnStrip.svelte";
  import {
    createMotionData,
    createPlaceholderMotion,
  } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import { buildHalvedStep } from "$lib/shared/animation-engine/services/build-halved-step";
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
    bakeReversals,
    stripToSequence,
  } from "../../../level-1/_data/guide-sequence-adapter";

  const { NORTH: N, SOUTH: SO_ } = GridLocation;
  const { IN } = Orientation;
  const CCW = RotationDirection.COUNTER_CLOCKWISE;

  const rightStaff = (
    id: string,
    type: MotionType,
    from: GridLocation,
    to: GridLocation,
    startOri: Orientation,
    endOri: Orientation,
    rot: RotationDirection,
    turns = 0
  ) => ({
    id: `l2td1-${id}`,
    letter: null,
    gridMode: GridMode.DIAMOND,
    motions: {
      right: createMotionData({
        motionType: type,
        rotationDirection: rot,
        startLocation: from,
        endLocation: to,
        startOrientation: startOri,
        endOrientation: endOri,
        turns,
        hand: HandSide.RIGHT,
        propType: PropType.STAFF,
        gridMode: GridMode.DIAMOND,
      }),
    },
  });
  const stat = (id: string, loc: GridLocation, ori: Orientation) =>
    rightStaff(
      id,
      MotionType.STATIC,
      loc,
      loc,
      ori,
      ori,
      RotationDirection.NO_ROTATION
    );
  const toHM = (m: ReturnType<typeof rightStaff>["motions"]["right"]) => ({
    type: m.motionType,
    from: m.startLocation,
    to: m.endLocation,
    rot: m.rotationDirection,
    startOri: m.startOrientation,
    endOri: m.endOrientation,
    turns: typeof m.turns === "number" ? m.turns : 0,
  });

  // ── Motion data (verbatim from DashStaticTurnsPage.svelte's dash row) ────
  // Dash: S→N IN→IN CCW turns=1 - a vertical dash returning to thumb in.
  const dashCombined = rightStaff(
    "dash-full",
    MotionType.DASH,
    SO_,
    N,
    IN,
    IN,
    CCW,
    1
  );

  const ANIM = {
    "l2td1-dash": {
      data: dashCombined,
      word: "Dash with a turn",
      startLoc: SO_,
    },
  } as const;
  const animStep = (
    data: ReturnType<typeof rightStaff>,
    stepNumber: number,
    startLoc: GridLocation
  ): StepData =>
    ({
      ...data,
      id: `${data.id}-anim-${stepNumber}`,
      stepNumber,
      motions: {
        left: createPlaceholderMotion(HandSide.LEFT, {
          location: startLoc,
          orientation: IN,
        }),
        right: data.motions.right,
      },
    }) as unknown as StepData;
  const rowSteps = (key: keyof typeof ANIM): StepData[] => {
    const cfg = ANIM[key];
    const start = animStep(
      stat(`${key}-start`, cfg.startLoc, IN),
      0,
      cfg.startLoc
    );
    const combined = animStep(cfg.data, 1, cfg.startLoc);
    return [start, ...bakeReversals([combined])];
  };
  const halfOf = (
    combined: ReturnType<typeof rightStaff>,
    startLoc: GridLocation
  ) => buildHalvedStep(animStep(combined, 1, startLoc), 0.5);

  const dashHM = toHM(dashCombined.motions.right);
  const dashFrames: TurnStripFrame[] = [
    {
      kind: "start",
      step: animStep(stat("start", SO_, IN), 0, SO_),
      frameLabel: "start",
      thumbLabel: "in",
    },
    {
      kind: "half",
      step: halfOf(dashCombined, SO_),
      fallbackMotion: dashHM,
      frameLabel: "halfway",
    },
    {
      kind: "end",
      step: animStep(
        stat("end", N, dashCombined.motions.right.endOrientation),
        0,
        N
      ),
      frameLabel: "end",
      thumbLabel: "in",
    },
    {
      kind: "combined",
      step: animStep(ANIM["l2td1-dash"].data, 1, SO_),
      animKey: "l2td1-dash",
      word: ANIM["l2td1-dash"].word,
      rowSteps: rowSteps("l2td1-dash"),
    },
  ];
  const dashSequence = stripToSequence(rowSteps("l2td1-dash"), {
    word: ANIM["l2td1-dash"].word,
    name: ANIM["l2td1-dash"].word,
  });
</script>

<GuideSection id="turn-dashes" title="Dashes" subtitle="VTG: 1:1">
  <div class="section-body">
    <p>
      You can also add a turn to a dash. During the prop rotation, move the hand
      directly in a straight line. Pause at the halfway point while learning to
      ensure that your hand is in the center point and the staff is
      perpendicular to your starting position.
    </p>
  </div>

  <div class="showcase-wrap">
    <SequenceShowcase
      variant="compact"
      render={{ propType: PropType.STAFF }}
      sequence={dashSequence}
      items={[]}
      bpm={60}
    >
      {#snippet strip(t)}
        <TurnStrip
          frames={dashFrames}
          activeT={t}
          caption="The staff crosses straight through the center from south to north, flipping its thumb reference along the way"
        />
      {/snippet}
    </SequenceShowcase>
  </div>

  <div class="section-body">
    <p>
      A base dash has 1 thumb switch (in → out), therefore a dash with a turn
      has 2 thumb switches (in → in).
    </p>

    <p>
      Executing this move on repeat is commonly called a linear extension. It
      feels peculiar to execute with staves because one end is in pro and the
      other end is in anti. It helps to focus on the half that's in antispin.
      This will ensure that you pass your hand directly through the center
      point.
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
