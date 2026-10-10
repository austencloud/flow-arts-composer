import { describe, expect, it } from "vitest";
import { mapCompositionBeat } from "#lib/shared/motion-composition/domain/motion-composition-time.js";
import { IDENTITY_TRANSFORM } from "#lib/shared/motion-composition/domain/motion-composition-transform.js";
import type {
  CoordinateOrientationMode,
  MotionCompositionV3,
  QuaternionTuple,
  SpatialTransform,
  TimeMapping,
} from "#lib/shared/motion-composition/domain/motion-composition-types.js";
import { sampleMotionCompositionAt } from "#lib/shared/motion-composition/services/motion-composition-sampler.js";

const HOLD: TimeMapping = {
  offsetBeats: 0,
  rate: 1,
  completion: "hold",
};

const QUARTER_TURN: QuaternionTuple = [
  0,
  0,
  Math.sin(Math.PI / 4),
  Math.cos(Math.PI / 4),
];

function transform(
  translation: SpatialTransform["translation"],
  rotation: QuaternionTuple = IDENTITY_TRANSFORM.rotation,
  scale: SpatialTransform["scale"] = IDENTITY_TRANSFORM.scale
): SpatialTransform {
  return { translation, rotation, scale };
}

function composition(
  orientationMode: CoordinateOrientationMode = "rigid"
): MotionCompositionV3 {
  const childRotation =
    orientationMode === "world" ? IDENTITY_TRANSFORM.rotation : QUARTER_TURN;
  const childScale =
    orientationMode === "world"
      ? IDENTITY_TRANSFORM.scale
      : ([2, 2, 2] as const);
  return {
    version: 3,
    id: "recursive",
    name: "Recursive sampler",
    bpm: 60,
    rootNodeId: "root",
    clips: {
      prop: {
        kind: "spatial-keyframes",
        durationBeats: 4,
        channels: [
          {
            id: "staff",
            keyframes: [
              {
                beat: 0,
                transform: transform([0, 0, 0]),
                endpoints: [{ id: "tip", position: [1, 0, 0] }],
              },
              {
                beat: 4,
                transform: transform([4, 0, 0]),
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
        childNodeIds: ["child"],
        streamIds: [],
        transform: {
          kind: "keyframes",
          durationBeats: 4,
          keyframes: [
            {
              beat: 0,
              transform: transform([10, 0, 0], QUARTER_TURN),
            },
          ],
        },
        time: HOLD,
        orientationMode: "rigid",
      },
      child: {
        id: "child",
        parentId: "root",
        childNodeIds: [],
        streamIds: ["staff"],
        transform: {
          kind: "keyframes",
          durationBeats: 4,
          keyframes: [
            {
              beat: 0,
              transform: transform([2, 0, 0], childRotation, childScale),
            },
            {
              beat: 4,
              transform: transform([6, 0, 0], childRotation, childScale),
            },
          ],
        },
        time: HOLD,
        orientationMode,
      },
    },
    streams: {
      staff: {
        id: "staff",
        nodeId: "child",
        clipId: "prop",
        channelId: "staff",
        time: HOLD,
        style: { color: "#38bdf8", propType: "staff" },
      },
    },
    relationships: [],
    loop: { kind: "duration", durationBeats: 4 },
  };
}

function expectVector(
  actual: readonly number[],
  expected: readonly number[]
): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) =>
    expect(actual[index]).toBeCloseTo(value, 8)
  );
}

describe("motion composition time mapping", () => {
  it("keeps hold, loop, and stretch clocks independent", () => {
    expect(
      mapCompositionBeat(1, 4, {
        offsetBeats: 2,
        rate: 1,
        completion: "hold",
      })
    ).toBe(0);
    expect(
      mapCompositionBeat(10, 4, {
        offsetBeats: 2,
        rate: 1,
        completion: "hold",
      })
    ).toBe(4);
    expect(
      mapCompositionBeat(7, 4, {
        offsetBeats: 2,
        rate: 1,
        completion: "loop",
      })
    ).toBe(1);
    expect(
      mapCompositionBeat(6, 4, {
        offsetBeats: 2,
        rate: 1,
        completion: "stretch",
        stretchToBeats: 8,
      })
    ).toBe(2);
  });
});

describe("sampleMotionCompositionAt", () => {
  it("composes recursive transforms and canonical endpoints", () => {
    const frame = sampleMotionCompositionAt(composition(), 1);
    const staff = frame.streams.staff!;

    expectVector(staff.center, [8, 3, 0]);
    expectVector(staff.endpoints[0]!.position, [6, 3, 0]);
    expect(frame.nodes.child!.localBeat).toBe(1);
    expect(staff.localBeat).toBe(1);
  });

  it("keeps world-oriented contents upright inside a rotating parent", () => {
    const frame = sampleMotionCompositionAt(composition("world"), 0);
    const staff = frame.streams.staff!;

    expectVector(staff.center, [10, 2, 0]);
    expectVector(staff.endpoints[0]!.position, [11, 2, 0]);
    expectVector(staff.scale, [1, 1, 1]);
  });

  it("strips authored rotation and scale in position-only mode", () => {
    const frame = sampleMotionCompositionAt(composition("position-only"), 0);
    const staff = frame.streams.staff!;

    expectVector(staff.center, [10, 2, 0]);
    expectVector(staff.endpoints[0]!.position, [10, 3, 0]);
    expectVector(staff.scale, [1, 1, 1]);
  });

  it("derives radial and end-of-track tangent orientation from the carrier path", () => {
    const radial = sampleMotionCompositionAt(composition("radial"), 0);
    const tangent = sampleMotionCompositionAt(composition("tangent"), 4);

    expectVector(radial.streams.staff!.endpoints[0]!.position, [12, 2, 0]);
    expectVector(tangent.streams.staff!.endpoints[0]!.position, [20, 6, 0]);
  });

  it("returns identical frames regardless of seek order", () => {
    const source = composition();
    const first = sampleMotionCompositionAt(source, 2.75);
    sampleMotionCompositionAt(source, 0.125);
    sampleMotionCompositionAt(source, 3.9);
    const repeated = sampleMotionCompositionAt(source, 2.75);

    expect(repeated).toEqual(first);
  });

  it("rejects unreachable nodes instead of silently dropping them", () => {
    const source = composition();
    const malformed: MotionCompositionV3 = {
      ...source,
      nodes: {
        ...source.nodes,
        orphan: {
          id: "orphan",
          parentId: null,
          childNodeIds: [],
          streamIds: [],
          transform: { kind: "identity", durationBeats: 4 },
          time: HOLD,
          orientationMode: "rigid",
        },
      },
    };

    expect(() => sampleMotionCompositionAt(malformed, 0)).toThrow(
      "unreachable coordinate nodes"
    );
  });
});
