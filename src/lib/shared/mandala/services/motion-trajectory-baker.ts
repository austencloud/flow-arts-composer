import type {
  MotionCompositionFrame,
  MotionCompositionV3,
} from "#lib/shared/motion-composition/domain/motion-composition-types.js";
import type {
  WorldCameraSample,
  WorldTrajectoryLayer3D,
  WorldTrajectorySample3D,
  WorldTrajectorySet3D,
} from "../domain/trajectory-types";

export type MotionCompositionFrameSampler = (
  composition: MotionCompositionV3,
  beat: number
) => MotionCompositionFrame;

export interface MotionTrajectoryBakeOptions {
  durationBeats?: number;
  samplesPerBeat: number;
  includeFinalSample?: boolean;
  streamIds?: readonly string[];
  tipIds?: readonly string[];
}

interface MutableTrajectoryLayer {
  id: string;
  streamId: string;
  tipId: string;
  color: string;
  samples: WorldTrajectorySample3D[];
}

function sameLayerIds(
  expected: ReadonlySet<string>,
  actual: ReadonlySet<string>
): boolean {
  if (expected.size !== actual.size) return false;
  for (const id of expected) {
    if (!actual.has(id)) return false;
  }
  return true;
}

export function bakeMotionCompositionTrajectories(
  composition: MotionCompositionV3,
  sampleFrame: MotionCompositionFrameSampler,
  options: MotionTrajectoryBakeOptions
): WorldTrajectorySet3D {
  const durationBeats = options.durationBeats ?? composition.loop.durationBeats;
  return bakeWorldTrajectories((beat) => sampleFrame(composition, beat), {
    ...options,
    durationBeats,
  });
}

export function bakeWorldTrajectories(
  sampleFrame: (beat: number) => MotionCompositionFrame,
  options: MotionTrajectoryBakeOptions & { durationBeats: number }
): WorldTrajectorySet3D {
  const { durationBeats } = options;
  if (!Number.isFinite(durationBeats) || durationBeats <= 0) {
    throw new Error("Trajectory duration must be a positive number of beats");
  }
  if (!Number.isFinite(options.samplesPerBeat) || options.samplesPerBeat <= 0) {
    throw new Error("Trajectory samplesPerBeat must be positive");
  }

  const streamFilter = options.streamIds ? new Set(options.streamIds) : null;
  const tipFilter = options.tipIds ? new Set(options.tipIds) : null;
  const intervalCount = Math.max(
    1,
    Math.ceil(durationBeats * options.samplesPerBeat)
  );
  const includeFinalSample = options.includeFinalSample ?? true;
  const frameCount = includeFinalSample ? intervalCount + 1 : intervalCount;
  const layers = new Map<string, MutableTrajectoryLayer>();
  const cameraSamples: WorldCameraSample[] = [];
  let expectedLayerIds: Set<string> | null = null;

  for (let index = 0; index < frameCount; index += 1) {
    const beat = (durationBeats * index) / intervalCount;
    const frame = sampleFrame(beat);
    const currentLayerIds = new Set<string>();

    for (const stream of Object.values(frame.streams)) {
      if (
        stream.style.visible === false ||
        (streamFilter !== null && !streamFilter.has(stream.id))
      ) {
        continue;
      }
      for (const endpoint of stream.endpoints) {
        if (tipFilter && !tipFilter.has(endpoint.id)) continue;
        const layerId = `${stream.id}:${endpoint.id}`;
        currentLayerIds.add(layerId);
        let layer = layers.get(layerId);
        if (!layer) {
          layer = {
            id: layerId,
            streamId: stream.id,
            tipId: endpoint.id,
            color: stream.style.color,
            samples: [],
          };
          layers.set(layerId, layer);
        }
        layer.samples.push({
          beat,
          x: endpoint.position[0],
          y: endpoint.position[1],
          z: endpoint.position[2],
          ...(stream.breakBefore ? { breakBefore: true } : {}),
        });
      }
    }

    if (expectedLayerIds && !sameLayerIds(expectedLayerIds, currentLayerIds)) {
      throw new Error(
        "Trajectory endpoint layers changed during the sampled span"
      );
    }
    expectedLayerIds ??= currentLayerIds;
    if (frame.camera) cameraSamples.push({ beat, camera: frame.camera });
  }

  return {
    durationBeats,
    samplesPerBeat: options.samplesPerBeat,
    layers: Array.from(layers.values()) as WorldTrajectoryLayer3D[],
    cameraSamples,
  };
}
