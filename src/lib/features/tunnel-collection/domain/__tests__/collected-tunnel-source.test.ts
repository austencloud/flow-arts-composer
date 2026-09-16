import { describe, it, expect } from "vitest";
import { SNAPSHOT_VERSION } from "$lib/shared/sequence-viewer/tunnel/tunnel-snapshot";
import {
  DEFAULT_CONFIG,
  type TunnelConfig,
} from "$lib/shared/sequence-viewer/tunnel/tunnel-config";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { buildTunnelCompositionLayers } from "$lib/shared/sequence-viewer/tunnel/tunnel-layer-builder";
import {
  createIndependentTunnelPerformer,
  createTunnelComposition,
  resolveTunnelLayerPlans,
} from "$lib/shared/sequence-viewer/tunnel/tunnel-composition";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  HandSide,
  MotionType,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  collectedTunnelComposition,
  collectedTunnelSequence,
  collectedTunnelViewerSequence,
} from "../collected-tunnel-source";
import type { CollectedTunnel } from "../tunnel-collection-types";

const steps = [
  { stepNumber: 1, letter: "A", gridMode: "diamond" },
  { stepNumber: 2, letter: "B" },
  { stepNumber: 3, letter: "C" },
  { stepNumber: 4, letter: "D" },
] as unknown as StepData[];

// Collected steps come off a live viewer sequence, so the first one carries the
// two start locations needed to rebuild the start-placement cell.
const hydratedSteps = [
  {
    stepNumber: 1,
    letter: "P",
    startPlacement: "gamma13",
    endPlacement: "gamma7",
    motions: {
      [HandSide.LEFT]: createMotionData({
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        startLocation: GridLocation.WEST,
        endLocation: GridLocation.SOUTH,
        hand: HandSide.LEFT,
      }),
      [HandSide.RIGHT]: createMotionData({
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.CLOCKWISE,
        startLocation: GridLocation.SOUTH,
        endLocation: GridLocation.WEST,
        hand: HandSide.RIGHT,
      }),
    },
  },
  { stepNumber: 2, letter: "Λ" },
] as unknown as StepData[];

function savedTunnel(
  config: TunnelConfig = { ...DEFAULT_CONFIG, fold: 4 },
  overrides: Partial<CollectedTunnel> = {}
): CollectedTunnel {
  return {
    id: "tunnel-42",
    name: "QPUΛ-",
    steps,
    poster: "data:image/webp;base64,AA",
    createdAt: 123,
    snapshot: {
      version: SNAPSHOT_VERSION,
      tunnel: {
        config,
        gridVisible: false,
        colors: {
          mode: "spectrum",
          custom: { left: "#2e8bf0", right: "#ed1c24" },
        },
        section: "tunnel",
      },
      effects: { activeEffect: "none" },
      effort: "linear",
      paths: {
        pathShape: "arc",
        motionAwarePaths: false,
        leftPathLines: false,
        rightPathLines: false,
      },
      playback: { bpm: 60, playbackMode: "continuous" },
      props: { leftPropType: "staff", rightPropType: "staff" },
      trailRender: { mode: "none" },
    },
    ...overrides,
  } as unknown as CollectedTunnel;
}

describe("collectedTunnelSequence", () => {
  it("rebuilds the saved sequence and recovers its grid mode", () => {
    const sequence = collectedTunnelSequence(savedTunnel());

    expect(sequence.id).toBe("tunnel-42");
    expect(sequence.name).toBe("QPUΛ-");
    expect(sequence.steps).toHaveLength(4);
    expect(sequence.gridMode).toBe("diamond");
  });

  // A CollectedTunnel has no field for the start position, so reopening one
  // used to drop the start cell: the strip began at step 1 with a hole where
  // the start-placement pictograph belongs.
  it("rebuilds the start-placement pictograph the record never stored", () => {
    const sequence = collectedTunnelSequence(
      savedTunnel(undefined, { steps: hydratedSteps })
    );

    const start = sequence.startPlacement;
    expect(start).toBeDefined();
    // Static props at the first step's start locations, not the first step's
    // own motion — and labelled by position, never by the step's letter.
    expect(start?.motions?.[HandSide.LEFT]).toMatchObject({
      motionType: MotionType.STATIC,
      startLocation: GridLocation.WEST,
      endLocation: GridLocation.WEST,
    });
    expect(start?.motions?.[HandSide.RIGHT]).toMatchObject({
      motionType: MotionType.STATIC,
      startLocation: GridLocation.SOUTH,
      endLocation: GridLocation.SOUTH,
    });
  });

  it("leaves the start position off when the first step cannot derive one", () => {
    expect(
      collectedTunnelSequence(savedTunnel()).startPlacement
    ).toBeUndefined();
  });
});

describe("collectedTunnelComposition", () => {
  it("returns the authored cast untouched", () => {
    const authored = createTunnelComposition([
      createIndependentTunnelPerformer(
        createSequenceData({ id: "s1", name: "Lead", word: "LEAD", steps }),
        0
      ),
    ]);

    expect(
      collectedTunnelComposition(
        savedTunnel(undefined, { composition: authored })
      )
    ).toBe(authored);
  });

  // A legacy tunnel stored one sequence. Every arm past the first came from the
  // formation, so handing back a second performer would write a relationship
  // into the record that nobody authored — and an identity copy shown beside
  // its own lead reads as a transform that failed to save.
  it("gives a legacy tunnel the solo cast its record describes", () => {
    const composition = collectedTunnelComposition(savedTunnel());

    expect(composition.id).toBe("tunnel-42");
    expect(composition.name).toBe("QPUΛ-");
    expect(composition.performers).toHaveLength(1);

    const [lead] = composition.performers;
    expect(lead!.source.kind).toBe("independent");
    if (lead!.source.kind === "independent") {
      expect(lead!.source.sequence.steps).toHaveLength(4);
    }
  });

  // The formation is the transform a legacy tunnel actually saved: fold spreads
  // the one sequence across arms, stagger offsets them. It has to survive the
  // round trip verbatim or the reopened tunnel is a different tunnel.
  it("carries the saved formation through untouched", () => {
    const formation = {
      ...DEFAULT_CONFIG,
      fold: 4,
      staggerSteps: 1,
      mirror: true,
    };
    const composition = collectedTunnelComposition(savedTunnel(formation));

    expect(composition.formation).toEqual(formation);
  });

  it("rebuilds the choreography each legacy arm actually performs", async () => {
    const tunnel = savedTunnel(
      { ...DEFAULT_CONFIG, fold: 4 },
      { steps: [hydratedSteps[0]!] }
    );
    const composition = collectedTunnelComposition(tunnel);
    const layers = await buildTunnelCompositionLayers(
      composition,
      composition.formation
    );
    const performerTwo = layers[1]!;

    expect(performerTwo.performerSequence.steps).toEqual(
      layers[0]!.performerSequence.steps
    );
    expect(performerTwo.formationOps).toEqual([{ kind: "rotate", amount: 2 }]);
    expect(performerTwo.sequence.steps).not.toEqual(
      performerTwo.performerSequence.steps
    );
    expect(performerTwo.sequence.startPlacement).toBeDefined();
    expect(performerTwo.sequence.startPlacement).not.toEqual(
      performerTwo.performerSequence.startPlacement
    );
  });

  it("paints exactly what the one-performer tunnel painted", () => {
    const tunnel = savedTunnel();
    const formation = tunnel.snapshot.tunnel.config;
    const solo = createTunnelComposition(
      [createIndependentTunnelPerformer(collectedTunnelSequence(tunnel), 0)],
      { formation, legacyGeneratedStage: true }
    );

    const before = resolveTunnelLayerPlans(solo);
    const after = resolveTunnelLayerPlans(collectedTunnelComposition(tunnel));

    expect(after).toHaveLength(before.length);
    for (const [arm, plan] of after.entries()) {
      expect(plan.ops).toEqual(before[arm]!.ops);
      expect(plan.sequence.steps).toEqual(before[arm]!.sequence.steps);
      expect(plan.stepOffset).toBe(before[arm]!.stepOffset);
      expect(plan.speed).toBe(before[arm]!.speed);
    }
  });
});

describe("collectedTunnelViewerSequence", () => {
  it("mounts the authored SequenceData without replacing its identity", () => {
    const authoredSequence = createSequenceData({
      id: "shape-matrix:base:SS:blue:red",
      name: "Matrix realization",
      word: "AAAA",
      steps: hydratedSteps,
      metadata: { exactSourceMarker: "preserve-me" },
    });
    const authored = createTunnelComposition([
      createIndependentTunnelPerformer(authoredSequence, 0),
    ]);
    const tunnel = savedTunnel(undefined, { composition: authored });

    expect(collectedTunnelViewerSequence(tunnel)).toBe(authoredSequence);
    expect(collectedTunnelViewerSequence(tunnel)).toEqual(authoredSequence);
  });

  it("rebuilds the legacy start pose so the saved loop keeps its orientation", () => {
    const sequence = collectedTunnelViewerSequence(
      savedTunnel(undefined, { steps: hydratedSteps })
    );

    expect(sequence.id).toBe("tunnel-42");
    expect(sequence.startPlacement?.motions?.[HandSide.LEFT]).toMatchObject({
      startLocation: GridLocation.WEST,
      endLocation: GridLocation.WEST,
    });
    expect(sequence.startPlacement?.motions?.[HandSide.RIGHT]).toMatchObject({
      startLocation: GridLocation.SOUTH,
      endLocation: GridLocation.SOUTH,
    });
  });
});
