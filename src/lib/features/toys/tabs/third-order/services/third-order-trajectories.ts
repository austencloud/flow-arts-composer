import { getTipPoints } from "#lib/shared/animation-engine/domain/types/prop-tip-points.js";
import {
  calculatePropCenter,
  calculateTrailSourceEndpoint,
} from "#lib/shared/animation-engine/services/prop-position-calculator.js";
import {
  BLUE_STROKE,
  RED_STROKE,
} from "#lib/shared/mandala/domain/mandala-constants.js";
import { bakeWorldTrajectories } from "../../../../../shared/mandala/services/motion-trajectory-baker";
import { projectWorldTrajectories } from "../../../../../shared/mandala/services/trajectory-projector";
import type { ProjectedTrajectorySet } from "#lib/shared/mandala/domain/trajectory-types.js";
import type {
  MotionCompositionFrame,
  SampledPropStream,
} from "#lib/shared/motion-composition/domain/motion-composition-types.js";
import { isVisibleMotion } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type {
  ThirdOrderCompositionDraft,
  ThirdOrderCompositionFrame,
} from "../domain/third-order-composition";
import { THIRD_ORDER_VIEWBOX_SIZE } from "../domain/third-order-math";
import type { IThirdOrderCompositionSampler } from "./contracts/IThirdOrderCompositionSampler";

export interface ThirdOrderPropTypes {
  left: string;
  right: string;
}

const CENTER = THIRD_ORDER_VIEWBOX_SIZE / 2;
const ENDPOINT_CONFIG = {
  canvasSize: THIRD_ORDER_VIEWBOX_SIZE,
  propDimensions: { width: 0, height: 0 },
};

export function thirdOrderWorldFrame(
  frame: ThirdOrderCompositionFrame,
  propTypes: ThirdOrderPropTypes
): MotionCompositionFrame {
  const streams: Record<string, SampledPropStream> = {};
  for (const child of frame.children) {
    if (!child.visible) continue;
    const { centerX, centerY, rotation, scale } = child.pose;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const toWorld = (local: { x: number; y: number }) => {
      const x = (local.x - CENTER) * scale;
      const y = (local.y - CENTER) * scale;
      return [
        centerX - CENTER + cos * x - sin * y,
        CENTER - centerY - sin * x - cos * y,
        0,
      ] as const;
    };
    for (const hand of ["left", "right"] as const) {
      if (
        !child.sequence.steps.some((step) =>
          isVisibleMotion(step.motions[hand])
        )
      )
        continue;
      const propType = propTypes[hand];
      const id = `${child.id}:${hand}`;
      const halfAngle = -(rotation + child.props[hand].staffRotationAngle) / 2;
      streams[id] = {
        id,
        nodeId: child.id,
        localBeat: child.step,
        center: toWorld(
          calculatePropCenter(child.props[hand], ENDPOINT_CONFIG)
        ),
        rotation: [0, 0, Math.sin(halfAngle), Math.cos(halfAngle)],
        scale: [scale, scale, scale],
        style: { color: hand === "left" ? BLUE_STROKE : RED_STROKE, propType },
        endpoints: getTipPoints(propType).points.flatMap((_, index) => {
          const local = calculateTrailSourceEndpoint(
            child.props[hand],
            ENDPOINT_CONFIG,
            { type: "tip", index },
            propType
          );
          if (!local) return [];
          return [
            {
              id: `tip:${index}`,
              position: toWorld(local),
            },
          ];
        }),
      };
    }
  }
  return { beat: frame.masterBeat, nodes: {}, streams };
}

export function bakeThirdOrderTrajectories(
  composition: ThirdOrderCompositionDraft,
  sampler: IThirdOrderCompositionSampler,
  propTypes: ThirdOrderPropTypes
): ProjectedTrajectorySet {
  const durationBeats = sampler.sample(composition, 0).totalBeats;
  if (durationBeats <= 0)
    return {
      durationBeats: 0,
      projection: { kind: "world-front" },
      layers: [],
    };
  // Finish at the actual end pose. Wrapping to the opening frame would draw a
  // false closing chord for a sequence whose beginning and end differ.
  const previousSteps = new Map<string, number>();
  const world = bakeWorldTrajectories(
    (beat) => {
      const frame = thirdOrderWorldFrame(
        sampler.sample(composition, Math.min(beat, durationBeats - 1e-8)),
        propTypes
      );
      for (const stream of Object.values(frame.streams)) {
        const previous = previousSteps.get(stream.id);
        if (previous !== undefined && stream.localBeat < previous)
          stream.breakBefore = true;
        previousSteps.set(stream.id, stream.localBeat);
      }
      return frame;
    },
    { durationBeats, samplesPerBeat: 64 }
  );
  return projectWorldTrajectories(world, { kind: "world-front" });
}
