import { z } from "zod";
import type {
  TunnelLayerConfig,
  CellMediaType,
  CellEffect,
} from "#lib/shared/animation-engine/domain/compose-types.js";
import type { TrailMode } from "#lib/shared/animation-engine/domain/types/trail-types.js";
import type {
  TipEffectMap,
  TipEffortMap,
} from "#lib/shared/animation-engine/domain/types/tip-effect-types.js";

export interface ArrangementCell {
  id: string;
  row: number;
  col: number;
  layers: TunnelLayerConfig[];
  beatOffset: number;
  colSpan: number;
  rowSpan: number;
  mediaType: CellMediaType;
  speedMultiplier?: number;
  effect?: CellEffect;
  trailMode?: TrailMode;
  effort?: string;
  tipEffectMap?: TipEffectMap;
  tipEffortMap?: TipEffortMap;
  leftMotionVisible?: boolean;
  rightMotionVisible?: boolean;
}

export interface ArrangementSnapshot {
  schemaVersion: 1;
  cells: ArrangementCell[];
  gridRows: number;
  gridCols: number;
  bpm: number;
  skipStartPlacement: boolean;
}

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.undefined(),
    z.date(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
);

const layerSchema = z
  .object({
    sequence: z.record(z.string(), jsonValueSchema),
    beatOffset: z.number().finite(),
    propColors: z.object({ left: z.string(), right: z.string() }),
    transformStack: z.array(
      z
        .object({
          type: z.string(),
          hand: z.enum(["left", "right", "both"]),
          timestamp: z.number().finite(),
        })
        .passthrough()
    ),
    appliedTransforms: z.array(z.string()).optional(),
  })
  .passthrough();

export const arrangementSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  cells: z.array(
    z
      .object({
        id: z.string(),
        row: z.number().int().min(0).max(7),
        col: z.number().int().min(0).max(7),
        layers: z.array(layerSchema).max(4),
        beatOffset: z.number().finite(),
        colSpan: z.number().int().min(1).max(8),
        rowSpan: z.number().int().min(1).max(8),
        mediaType: z.enum([
          "video",
          "animation",
          "image",
          "choreo-card",
          "viewer-3d",
          "empty",
        ]),
        speedMultiplier: z.number().finite().positive().optional(),
        effect: z
          .enum(["none", "fire", "charcoal", "led", "trails"])
          .optional(),
        trailMode: z.string().optional(),
        effort: z.string().optional(),
        tipEffectMap: z.record(z.string(), jsonValueSchema).optional(),
        tipEffortMap: z.record(z.string(), jsonValueSchema).optional(),
        leftMotionVisible: z.boolean().optional(),
        rightMotionVisible: z.boolean().optional(),
      })
      .passthrough()
  ),
  gridRows: z.number().int().min(1).max(8),
  gridCols: z.number().int().min(1).max(8),
  bpm: z.number().finite().positive(),
  skipStartPlacement: z.boolean(),
});

export function validateArrangementSnapshot(
  value: unknown
): ArrangementSnapshot {
  arrangementSnapshotSchema.parse(value);
  return structuredClone(value) as ArrangementSnapshot;
}
