<script lang="ts">
  /**
   * Real-pictograph diagram for the 1-turn static breakdown, mirroring
   * DashStaticTurnsPage.svelte's static row (`ROWS[1]`) exactly - same
   * motion/turns/orientations, the print artboard is the source of truth
   * for this data.
   *
   * The second TODO on this section (the static-turn-arrow vs prospin-turn-
   * arrow comparison, `DashStaticTurnsPage`'s bottom NOTE_STATIC/NOTE_SHIFT
   * boxes) is a side-by-side compare of two unrelated full-motion
   * pictographs with no start/halfway/end chain between them - TurnStrip's
   * connector always renders a flow-arrow-then-equals between frames, which
   * would visually claim "static turn = prospin turn" (false - the point of
   * the comparison is that their ARROW SHAPES differ, not that the motions
   * are equal). Left text-only; not a fit for this primitive.
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

  const { EAST: E } = GridLocation;
  const { IN, OUT } = Orientation;
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
    id: `l2tst1-${id}`,
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

  // ── Motion data (verbatim from DashStaticTurnsPage.svelte's static row) ──
  // Static: E→E IN→OUT CCW turns=1 - a 180° turn in place (in → out).
  const staticCombined = rightStaff(
    "static-full",
    MotionType.STATIC,
    E,
    E,
    IN,
    OUT,
    CCW,
    1
  );

  const ANIM = {
    "l2tst1-static": { data: staticCombined, word: "Static turn", startLoc: E },
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

  const staticFrames: TurnStripFrame[] = [
    {
      kind: "start",
      step: animStep(stat("start", E, IN), 0, E),
      frameLabel: "start",
      thumbLabel: "in",
    },
    {
      kind: "half",
      step: halfOf(staticCombined, E),
      fallbackMotion: toHM(staticCombined.motions.right),
      frameLabel: "halfway",
    },
    {
      kind: "end",
      step: animStep(
        stat("end", E, staticCombined.motions.right.endOrientation),
        0,
        E
      ),
      frameLabel: "end",
      thumbLabel: "out",
    },
    {
      kind: "combined",
      step: animStep(ANIM["l2tst1-static"].data, 1, E),
      animKey: "l2tst1-static",
      word: ANIM["l2tst1-static"].word,
      rowSteps: rowSteps("l2tst1-static"),
    },
  ];
  const staticSequence = stripToSequence(rowSteps("l2tst1-static"), {
    word: ANIM["l2tst1-static"].word,
    name: ANIM["l2tst1-static"].word,
  });
</script>

<GuideSection id="turn-static" title="Static">
  <div class="section-body">
    <p>
      Finally, we'll look at static turns. Here is a breakdown of a static turn
      starting from thumb in:
    </p>
  </div>

  <div class="showcase-wrap">
    <SequenceShowcase
      variant="compact"
      render={{ propType: PropType.STAFF }}
      sequence={staticSequence}
      items={[]}
      bpm={60}
    >
      {#snippet strip(t)}
        <TurnStrip
          frames={staticFrames}
          activeT={t}
          caption="The staff never leaves east - only its thumb reference flips as it turns in place, in to out"
        />
      {/snippet}
    </SequenceShowcase>
  </div>

  <div class="section-body">
    <p>
      This can be executed at any hand point, starting from either thumb
      orientation, turning in either direction.
    </p>

    <p>
      Note the differences between the arrow for static turns and the arrow for
      prospin turns:
    </p>

    <!-- TODO: add diagram - comparison of static turn arrow vs prospin turn arrow -->

    <p>
      <strong>Static:</strong> Prop remains at its start position. The arrow forms
      a half circle with that position.
    </p>
    <p>
      <strong>Shift:</strong> Prop ends at an adjacent position. The arrow forms a
      half-circle around the empty start position.
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
