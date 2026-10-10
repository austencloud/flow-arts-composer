import { describe, expect, it } from "vitest";
import type { MotionCompositionV3 } from "#lib/shared/motion-composition/domain/motion-composition-types.js";
import { IDENTITY_TRANSFORM } from "#lib/shared/motion-composition/domain/motion-composition-transform.js";
import { sampleMotionCompositionAt } from "#lib/shared/motion-composition/services/motion-composition-sampler.js";
import type { MandalaPaths } from "#lib/shared/mandala/domain/mandala-types.js";
import { bakeMotionCompositionTrajectories } from "#lib/shared/mandala/services/motion-trajectory-baker.js";
import { projectWorldTrajectories } from "#lib/shared/mandala/services/trajectory-projector.js";
import {
  legacyMandalaPathsToLayers,
  projectedTrajectoriesToMandalaLayers,
} from "#lib/shared/mandala/services/mandala-layer-adapter.js";

const HOLD = {
  offsetBeats: 0,
  rate: 1,
  completion: "hold",
} as const;

function trajectoryComposition(): MotionCompositionV3 {
  return {
    version: 3,
    id: "trajectory",
    name: "Trajectory",
    bpm: 60,
    rootNodeId: "root",
    clips: {
      moving: {
        kind: "spatial-keyframes",
        durationBeats: 2,
        channels: [
          {
            id: "staff",
            keyframes: [
              {
                beat: 0,
                transform: IDENTITY_TRANSFORM,
                endpoints: [{ id: "tip", position: [1, 0, 0] }],
              },
              {
                beat: 2,
                transform: {
                  ...IDENTITY_TRANSFORM,
                  translation: [2, 0, 2],
                },
                endpoints: [{ id: "tip", position: [1, 0, 0] }],
              },
            ],
          },
        ],
      },
    },
    nodes: {
      root: {
        id: "root",
        parentId: null,
        childNodeIds: [],
        streamIds: ["staff"],
        transform: { kind: "identity", durationBeats: 2 },
        time: HOLD,
        orientationMode: "rigid",
      },
    },
    streams: {
      staff: {
        id: "staff",
        nodeId: "root",
        clipId: "moving",
        channelId: "staff",
        time: HOLD,
        style: { color: "#f97316" },
      },
    },
    relationships: [],
    camera: {
      durationBeats: 2,
      time: HOLD,
      keyframes: [
        {
          beat: 0,
          position: [0, 0, 10],
          target: [0, 0, 0],
          up: [0, 1, 0],
          projection: {
            kind: "perspective",
            fovDegrees: 60,
            aspect: 1,
            near: 0.1,
            far: 100,
          },
        },
        {
          beat: 2,
          position: [2, 0, 10],
          target: [2, 0, 0],
          up: [0, 1, 0],
          projection: {
            kind: "perspective",
            fovDegrees: 60,
            aspect: 1,
            near: 0.1,
            far: 100,
          },
        },
      ],
    },
    loop: { kind: "duration", durationBeats: 2 },
  };
}

describe("motion trajectory pipeline", () => {
  it("bakes stable world endpoints and keeps projection choices explicit", () => {
    const source = trajectoryComposition();
    const world = bakeMotionCompositionTrajectories(
      source,
      sampleMotionCompositionAt,
      { samplesPerBeat: 1 }
    );

    expect(world.layers).toHaveLength(1);
    expect(world.layers[0]!.samples).toEqual([
      { beat: 0, x: 1, y: 0, z: 0 },
      { beat: 1, x: 2, y: 0, z: 1 },
      { beat: 2, x: 3, y: 0, z: 2 },
    ]);
    expect(world.cameraSamples).toHaveLength(3);

    expect(
      projectWorldTrajectories(world, { kind: "world-front" }).layers[0]!.points
    ).toEqual([
      { beat: 0, x: 1, y: 0 },
      { beat: 1, x: 2, y: 0 },
      { beat: 2, x: 3, y: 0 },
    ]);
    expect(
      projectWorldTrajectories(world, { kind: "world-top" }).layers[0]!.points
    ).toEqual([
      { beat: 0, x: 1, y: 0 },
      { beat: 1, x: 2, y: 1 },
      { beat: 2, x: 3, y: 2 },
    ]);

    const cameraPoints = projectWorldTrajectories(world, {
      kind: "authored-camera",
    }).layers[0]!.points;
    expect(cameraPoints).toHaveLength(3);
    expect(cameraPoints.every((point) => Number.isFinite(point.x))).toBe(true);
  });

  it("filters selected streams without changing the sampled composition", () => {
    const source = trajectoryComposition();
    const world = bakeMotionCompositionTrajectories(
      source,
      sampleMotionCompositionAt,
      { samplesPerBeat: 1, streamIds: ["not-the-staff"] }
    );
    expect(world.layers).toEqual([]);
  });

  it("converts projected trajectories into arbitrary Mandala layers", () => {
    const source = trajectoryComposition();
    const world = bakeMotionCompositionTrajectories(
      source,
      sampleMotionCompositionAt,
      { samplesPerBeat: 1 }
    );
    const projected = projectWorldTrajectories(world, { kind: "world-top" });
    const layers = projectedTrajectoriesToMandalaLayers(projected);

    expect(layers.source).toBe("trajectory");
    expect(layers.layers).toHaveLength(1);
    expect(layers.layers[0]!.paths[0]!.d).toBe("M 1 0 L 2 1 L 3 2");
  });

  it("adapts legacy left/right/overlap paths without changing their geometry", () => {
    const legacy: MandalaPaths = {
      left: [{ tipIndex: 0, d: "M 1 2 L 3 4" }],
      right: [{ tipIndex: 1, d: "M 5 6 L 7 8" }],
      purple: [{ tipIndex: 0, d: "M 9 10 L 11 12" }],
    };
    const layers = legacyMandalaPathsToLayers(legacy);

    expect(layers.source).toBe("legacy-pair");
    expect(layers.layers.map((layer) => layer.paths[0]!.d)).toEqual([
      legacy.left[0]!.d,
      legacy.right[0]!.d,
      legacy.purple[0]!.d,
    ]);
  });
});
