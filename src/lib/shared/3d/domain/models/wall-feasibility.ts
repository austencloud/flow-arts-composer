/**
 * Wall-plane feasibility verdict, written offline by the feasibility
 * scanner (scripts/scan-wall-feasibility.ts) into sequence metadata.
 * The viewer reads it to choose plane mode and path params. Absent =
 * unscanned: current behavior, no claims.
 */
/**
 * Bump when thresholds, stance, or the petal model change shape.
 * v2: the depth solver writes per-hand depthOffset overrides.
 */
export const SCAN_VERSION = 2;

export type WallFeasibilityVerdict = true | "withCheat" | false;

/** Per-step, per-hand path overrides. Phase 2 writes k; Phase 3 adds depthOffset. */
export interface WallPlaneStepOverride {
  /** Concavity depth 0..1 for this step's concave path. */
  k?: number;
  /** Phase 3: per-hand z-offset toward (−) / away from (+) the body, meters. */
  depthOffset?: number;
}

export interface WallFeasibilityMetadata {
  wallFeasible: WallFeasibilityVerdict;
  /** Keyed by step index, then hand. Only present for "withCheat". */
  wallPlaneOverrides?: Record<
    number,
    { left?: WallPlaneStepOverride; right?: WallPlaneStepOverride }
  >;
  /** Scanner version for invalidation when thresholds/model change. */
  scanVersion: number;
}

/**
 * A caution preserved from an attributed external source. This is deliberately
 * separate from WallFeasibilityMetadata: a source flag is evidence to review,
 * not a positive scanner result and not a precise impossible/with-cheat verdict.
 */
export interface WallPlaneSourceAssessment {
  status: "flagged-difficult-or-impossible";
  source: string;
  sourceRepository?: string;
  sourceCommit?: string;
  note: string;
}
