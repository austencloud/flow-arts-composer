import { z } from "zod";
import type { GridJoin } from "@tka/tka-types";
import type {
  TunnelLayerConfig,
  CellMediaType,
} from "#lib/shared/animation-engine/domain/compose-types.js";
import type {
  TipEffectMap,
  TipEffortMap,
} from "#lib/shared/animation-engine/domain/types/tip-effect-types.js";
import { migrateArrangementSnapshot } from "./arrangement-migration.js";
import {
  PostAnimationAppearanceSchema,
  type PostAnimationAppearance,
} from "./post-animation-appearance.js";

export const ARRANGEMENT_SCHEMA_VERSION = 2;
/** The backing grid is always this many rows and columns; `gridRows × gridCols` of it show. */
export const ARRANGEMENT_MAX_GRID_SIZE = 8;

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
  /** Look and effects for this cell over the grid's `appearance`; set flags only. */
  appearance?: PostAnimationAppearance;
  tipEffectMap?: TipEffectMap;
  tipEffortMap?: TipEffortMap;
  leftMotionVisible?: boolean;
  rightMotionVisible?: boolean;
  /**
   * The cell's own join: undefined follows the first layer's sequence, null
   * draws one grid, a join is the cell's pair. The same tri-state as a 3D
   * performer's; `arrangement-grid-join.ts` resolves it.
   */
  gridJoin?: GridJoin | null;
}

export interface ArrangementSnapshot {
  schemaVersion: 2;
  cells: ArrangementCell[];
  gridRows: number;
  gridCols: number;
  bpm: number;
  skipStartPlacement: boolean;
  /** The grid's default look and effects; a cell's `appearance` overrides set flags. */
  appearance?: PostAnimationAppearance;
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

export const arrangementCellSchema = z
  .object({
    id: z.string(),
    row: z.number().int().min(0).max(ARRANGEMENT_MAX_GRID_SIZE - 1),
    col: z.number().int().min(0).max(ARRANGEMENT_MAX_GRID_SIZE - 1),
    layers: z.array(layerSchema).max(4),
    beatOffset: z.number().finite(),
    colSpan: z.number().int().min(1).max(ARRANGEMENT_MAX_GRID_SIZE),
    rowSpan: z.number().int().min(1).max(ARRANGEMENT_MAX_GRID_SIZE),
    mediaType: z.enum([
      "video",
      "animation",
      "image",
      "choreo-card",
      "viewer-3d",
      "empty",
    ]),
    speedMultiplier: z.number().finite().positive().optional(),
    appearance: PostAnimationAppearanceSchema.optional(),
    tipEffectMap: z.record(z.string(), jsonValueSchema).optional(),
    tipEffortMap: z.record(z.string(), jsonValueSchema).optional(),
    leftMotionVisible: z.boolean().optional(),
    rightMotionVisible: z.boolean().optional(),
    // The resolver, not the schema, decides what a stored join means, so a
    // malformed value from an older build follows the sequence instead of
    // making the whole arrangement unreadable.
    gridJoin: z.unknown().optional(),
  })
  .passthrough();

/** A `schemaVersion: 2` snapshot as stored. `arrangementSnapshotSchema` migrates older ones into it. */
export const arrangementSnapshotV2Schema = z.object({
  schemaVersion: z.literal(ARRANGEMENT_SCHEMA_VERSION),
  cells: z.array(arrangementCellSchema),
  gridRows: z.number().int().min(1).max(ARRANGEMENT_MAX_GRID_SIZE),
  gridCols: z.number().int().min(1).max(ARRANGEMENT_MAX_GRID_SIZE),
  bpm: z.number().finite().positive(),
  skipStartPlacement: z.boolean(),
  appearance: PostAnimationAppearanceSchema.optional(),
});

/** Accepts a v1 or v2 snapshot and parses it as v2. */
export const arrangementSnapshotSchema = z.preprocess(
  (value) => migrateArrangementSnapshot(value),
  arrangementSnapshotV2Schema
);

/** The snapshot as v2, detached from its input. Throws on anything the schema rejects. */
export function validateArrangementSnapshot(
  value: unknown
): ArrangementSnapshot {
  // The parsed shape carries passthrough index signatures, so it is widened before the domain type.
  return structuredClone(
    arrangementSnapshotSchema.parse(value)
  ) as unknown as ArrangementSnapshot;
}
