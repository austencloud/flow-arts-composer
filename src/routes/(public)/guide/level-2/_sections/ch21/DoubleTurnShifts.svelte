<script lang="ts">
  /**
   * Real-pictograph diagrams for the 2-turn shifts breakdown, mirroring
   * TwoTurnsShiftsPage.svelte's `proStrip` and `antiThirds` strips exactly
   * (same motions/turns/orientations - the print artboard is the source of
   * truth for this data). The artboard's third strip, `antiHalves`, is a bonus
   * alternate breakdown with no corresponding prose paragraph in this article
   * (the article has exactly 2 diagram TODOs - pro, anti) - omitted here to
   * avoid inventing new copy around it.
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

  const { EAST: E, SOUTH: SO_ } = GridLocation;
  const { IN, OUT } = Orientation;
  const CW = RotationDirection.CLOCKWISE;
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
    id: `l2a-ts-${id}`,
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

  // ── Motion data (verbatim from TwoTurnsShiftsPage.svelte) ────────────────
  // Pro: E→S IN→IN CW turns=2. Anti (thirds): E→S IN→OUT CCW turns=2.
  const proCombined = rightStaff(
    "pro-full",
    MotionType.PRO,
    E,
    SO_,
    IN,
    IN,
    CW,
    2
  );
  const antiCombined = rightStaff(
    "anti-full",
    MotionType.ANTI,
    E,
    SO_,
    IN,
    OUT,
    CCW,
    2
  );

  const ANIM = {
    "l2a-ts-pro": {
      data: proCombined,
      word: "Prospin with 2 turns",
      startLoc: E,
    },
    "l2a-ts-anti": {
      data: antiCombined,
      word: "Antispin with 2 turns",
      startLoc: E,
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

  const proFrames: TurnStripFrame[] = [
    {
      kind: "start",
      step: animStep(stat("pro-start", E, IN), 0, E),
      frameLabel: "start",
      thumbLabel: "in",
    },
    {
      kind: "half",
      step: halfOf(proCombined, E),
      fallbackMotion: toHM(proCombined.motions.right),
      frameLabel: "halfway",
      thumbLabel: "out",
    },
    {
      kind: "end",
      step: animStep(
        stat("pro-end", SO_, proCombined.motions.right.endOrientation),
        0,
        SO_
      ),
      frameLabel: "end",
      thumbLabel: "in",
    },
    {
      kind: "combined",
      step: animStep(ANIM["l2a-ts-pro"].data, 1, E),
      animKey: "l2a-ts-pro",
      word: ANIM["l2a-ts-pro"].word,
      rowSteps: rowSteps("l2a-ts-pro"),
    },
  ];
  const proSequence = stripToSequence(rowSteps("l2a-ts-pro"), {
    word: ANIM["l2a-ts-pro"].word,
    name: ANIM["l2a-ts-pro"].word,
  });

  const antiHM = toHM(antiCombined.motions.right);
  const antiFrames: TurnStripFrame[] = [
    {
      kind: "start",
      step: animStep(stat("anti-start", E, IN), 0, E),
      frameLabel: "start",
      thumbLabel: "in",
    },
    {
      kind: "pose",
      motion: antiHM,
      t: 1 / 3,
      arrowStart: 0,
      thumbLabel: "out",
    },
    {
      kind: "pose",
      motion: antiHM,
      t: 2 / 3,
      arrowStart: 1 / 3,
      thumbLabel: "in",
    },
    {
      kind: "end",
      step: animStep(
        stat("anti-end", SO_, antiCombined.motions.right.endOrientation),
        0,
        SO_
      ),
      frameLabel: "end",
      thumbLabel: "out",
    },
    {
      kind: "combined",
      step: animStep(ANIM["l2a-ts-anti"].data, 1, E),
      animKey: "l2a-ts-anti",
      word: ANIM["l2a-ts-anti"].word,
      rowSteps: rowSteps("l2a-ts-anti"),
    },
  ];
  const antiSequence = stripToSequence(rowSteps("l2a-ts-anti"), {
    word: ANIM["l2a-ts-anti"].word,
    name: ANIM["l2a-ts-anti"].word,
  });
</script>

<GuideSection id="double-turn-shifts" title="Shifts">
  <div class="section-body">
    <p>2 turns add a 360 degree rotation to a motion.</p>

    <h3>Pro</h3>
    <p>
      On a prospin with a double turn, note the 45° angle of the halfway
      position.
    </p>
  </div>

  <div class="showcase-wrap">
    <SequenceShowcase
      variant="compact"
      render={{ propType: PropType.STAFF }}
      sequence={proSequence}
      items={[]}
      bpm={60}
    >
      {#snippet strip(t)}
        <TurnStrip
          frames={proFrames}
          activeT={t}
          caption="Prospin, 2 turns: the staff spins twice around while still tracing one arc from east to south"
        />
      {/snippet}
    </SequenceShowcase>
  </div>

  <div class="section-body">
    <p>
      A base prospin (ASA isolation) has 0 thumb switches, therefore a prospin
      with 2 turns has 2 thumb switches (in → out → in)
    </p>

    <h3>Anti</h3>
    <p>
      With a double-turning antispin, it's easier to visually conceive of the
      motion in thirds. At each third there is a staff end at the center point.
    </p>
  </div>

  <div class="showcase-wrap">
    <SequenceShowcase
      variant="compact"
      render={{ propType: PropType.STAFF }}
      sequence={antiSequence}
      items={[]}
      bpm={60}
    >
      {#snippet strip(t)}
        <TurnStrip
          frames={antiFrames}
          activeT={t}
          caption="Antispin, 2 turns, broken into thirds so you can catch the staff fighting its own arc the whole way from east to south"
        />
      {/snippet}
    </SequenceShowcase>
  </div>

  <div class="section-body">
    <p>
      A base antispin has 1 thumb switch (in → out), therefore an antispin with
      2 turns has 3 thumb switches (in → out → in → out)
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
