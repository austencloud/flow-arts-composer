<script lang="ts">
  /**
   * Real-pictograph diagrams for the 1-turn shifts breakdown, mirroring
   * TurnsPage.svelte's `ROWS` (pro, anti) exactly - same motions/turns/
   * orientations, the print artboard is the source of truth for this data.
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
    id: `l2ts1-${id}`,
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

  // ── Motion data (verbatim from TurnsPage.svelte) ─────────────────────────
  // Pro: E→S IN→OUT CW turns=1. Anti: E→S IN→IN CCW turns=1.
  const proCombined = rightStaff(
    "pro-full",
    MotionType.PRO,
    E,
    SO_,
    IN,
    OUT,
    CW,
    1
  );
  const antiCombined = rightStaff(
    "anti-full",
    MotionType.ANTI,
    E,
    SO_,
    IN,
    IN,
    CCW,
    1
  );

  const ANIM = {
    "l2ts1-pro": {
      data: proCombined,
      word: "Prospin with a turn",
      startLoc: E,
    },
    "l2ts1-anti": {
      data: antiCombined,
      word: "Antispin with a turn",
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
    },
    {
      kind: "end",
      step: animStep(
        stat("pro-end", SO_, proCombined.motions.right.endOrientation),
        0,
        SO_
      ),
      frameLabel: "end",
      thumbLabel: "out",
    },
    {
      kind: "combined",
      step: animStep(ANIM["l2ts1-pro"].data, 1, E),
      animKey: "l2ts1-pro",
      word: ANIM["l2ts1-pro"].word,
      rowSteps: rowSteps("l2ts1-pro"),
    },
  ];
  const proSequence = stripToSequence(rowSteps("l2ts1-pro"), {
    word: ANIM["l2ts1-pro"].word,
    name: ANIM["l2ts1-pro"].word,
  });

  const antiFrames: TurnStripFrame[] = [
    {
      kind: "start",
      step: animStep(stat("anti-start", E, IN), 0, E),
      frameLabel: "start",
      thumbLabel: "in",
    },
    {
      kind: "half",
      step: halfOf(antiCombined, E),
      fallbackMotion: toHM(antiCombined.motions.right),
      frameLabel: "halfway",
      thumbLabel: "out",
    },
    {
      kind: "end",
      step: animStep(
        stat("anti-end", SO_, antiCombined.motions.right.endOrientation),
        0,
        SO_
      ),
      frameLabel: "end",
      thumbLabel: "in",
    },
    {
      kind: "combined",
      step: animStep(ANIM["l2ts1-anti"].data, 1, E),
      animKey: "l2ts1-anti",
      word: ANIM["l2ts1-anti"].word,
      rowSteps: rowSteps("l2ts1-anti"),
    },
  ];
  const antiSequence = stripToSequence(rowSteps("l2ts1-anti"), {
    word: ANIM["l2ts1-anti"].word,
    name: ANIM["l2ts1-anti"].word,
  });
</script>

<GuideSection id="turn-shifts" title="Shifts" subtitle="VTG: 1:3">
  <div class="section-body">
    <p>
      <strong>Turns:</strong> A turn is a 180° rotation that occurs during a motion.
      Let's add a single turn to a shift.
    </p>

    <p>
      First we'll add 1 turn to a prospin. Take note of the diagonal halfway
      position, and pause there for a moment before continuing. These arrows
      refer to the pinky end on the first half, then to the thumb end on the
      second half. The full arrow depicts a half-circle, from the start
      position's outer point.
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
          caption="Prospin: the staff's spin matches its arc, so the turn and the shift from east to south blend into one curl"
        />
      {/snippet}
    </SequenceShowcase>
  </div>

  <div class="section-body">
    <p>Each turn adds a thumb switch.</p>

    <p>
      <strong>Pro:</strong> An isolation has 0 thumb switches, therefore a prospin
      with a turn has 1 thumb switch (in → out)
    </p>

    <p>
      Now let's add 1 turn to an antispin. Again, take note of the diagonal
      halfway position, and pause there before continuing.
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
          caption="Antispin: the staff's spin fights its arc, curling back against the shift from east to south"
        />
      {/snippet}
    </SequenceShowcase>
  </div>

  <div class="section-body">
    <p>
      <strong>Anti:</strong> A base antispin has 1 thumb switch. (in → out), therefore
      an antispin with a turn has 2 thumb switches (in → out → in).
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
  /* Break the showcase out of the inherited prose column the same way
     TurnStrip breaks itself out when unwrapped (see TurnStrip.svelte's own
     comment) - this div is now the direct GuideSection child, so it owns the
     breakout instead. */
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
