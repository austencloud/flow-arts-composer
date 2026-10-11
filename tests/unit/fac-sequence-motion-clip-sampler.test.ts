import { describe, expect, it } from "vitest";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  HandSide,
  MotionType,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type {
  MotionClip,
  MotionCompositionV3,
  PropStream,
} from "#lib/shared/motion-composition/domain/motion-composition-types.js";
import { FacSequenceMotionClipSampler } from "#lib/shared/motion-composition/services/implementations/FacSequenceMotionClipSampler.js";
import { sampleMotionCompositionAt } from "#lib/shared/motion-composition/services/motion-composition-sampler.js";

function fixture(): { clip: MotionClip; stream: PropStream } {
  const left = createMotionData({
    hand: HandSide.LEFT,
    startLocation: GridLocation.NORTH,
    endLocation: GridLocation.EAST,
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    gridMode: GridMode.DIAMOND,
  });
  const right = createMotionData({
    hand: HandSide.RIGHT,
    startLocation: GridLocation.SOUTH,
    endLocation: GridLocation.WEST,
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    gridMode: GridMode.DIAMOND,
  });
  const sequence = createSequenceData({
    id: "native-sequence",
    word: "A",
    gridMode: GridMode.DIAMOND,
    steps: [
      createStepData({
        stepNumber: 1,
        motions: { left, right },
      }),
    ],
  });

  return {
    clip: { kind: "fac-sequence", durationBeats: 1, sequence },
    stream: {
      id: "left-staff",
      nodeId: "root",
      clipId: "native",
      channelId: "left",
      time: { offsetBeats: 0, rate: 1, completion: "hold" },
      style: { color: "#3d44b8", propType: "staff" },
    },
  };
}

describe("FacSequenceMotionClipSampler", () => {
  it("moves during the first count and reaches the final pose at clip duration", () => {
    const sampler = new FacSequenceMotionClipSampler();
    const { clip, stream } = fixture();
    const middle = sampler.sample(clip, stream, 0.5)!;
    const end = sampler.sample(clip, stream, 1)!;
    expect(middle.transform.translation[0]).toBeCloseTo(150 / Math.sqrt(2), 6);
    expect(middle.transform.translation[1]).toBeCloseTo(150 / Math.sqrt(2), 6);
    expect(end.transform.translation[0]).toBeCloseTo(150, 6);
    expect(end.transform.translation[1]).toBeCloseTo(0, 6);
  });
  it("samples the real opening pose instead of a zero placeholder", () => {
    const sampler = new FacSequenceMotionClipSampler();
    const { clip, stream } = fixture();
    const opening = sampler.sample(clip, stream, 0)!;

    expect(opening.transform.translation[0]).toBeCloseTo(0, 8);
    expect(opening.transform.translation[1]).toBeCloseTo(150, 8);
    expect(opening.endpoints.map((endpoint) => endpoint.id)).toEqual([
      "tip:0",
      "tip:1",
    ]);
  });

  it("is seek-order independent while reusing its initialized sequence", () => {
    const sampler = new FacSequenceMotionClipSampler();
    const { clip, stream } = fixture();
    const expected = sampler.sample(clip, stream, 0.625);
    sampler.sample(clip, stream, 0.125);
    sampler.sample(clip, stream, 0.9);

    expect(sampler.sample(clip, stream, 0.625)).toEqual(expected);
  });

  it("plugs native FAC clips into the recursive world sampler", () => {
    const sampler = new FacSequenceMotionClipSampler();
    const { clip, stream } = fixture();
    const source: MotionCompositionV3 = {
      version: 3,
      id: "native",
      name: "Native FAC clip",
      bpm: 60,
      rootNodeId: "root",
      clips: { native: clip },
      nodes: {
        root: {
          id: "root",
          parentId: null,
          childNodeIds: [],
          streamIds: [stream.id],
          transform: { kind: "identity", durationBeats: 1 },
          time: { offsetBeats: 0, rate: 1, completion: "hold" },
          orientationMode: "rigid",
        },
      },
      streams: { [stream.id]: stream },
      relationships: [],
      loop: { kind: "duration", durationBeats: 1 },
    };
    const frame = sampleMotionCompositionAt(source, 0, {
      sampleClip: sampler.sample.bind(sampler),
    });

    expect(frame.streams[stream.id]!.center[0]).toBeCloseTo(0, 8);
    expect(frame.streams[stream.id]!.center[1]).toBeCloseTo(150, 8);
    expect(frame.streams[stream.id]!.endpoints).toHaveLength(2);
  });

  it("leaves non-FAC clips to the built-in spatial sampler", () => {
    const sampler = new FacSequenceMotionClipSampler();
    const { stream } = fixture();
    expect(
      sampler.sample(
        {
          kind: "spatial-keyframes",
          durationBeats: 1,
          channels: [],
        },
        stream,
        0
      )
    ).toBeUndefined();
  });
});
