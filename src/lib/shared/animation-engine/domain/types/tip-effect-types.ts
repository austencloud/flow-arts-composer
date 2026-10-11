/**
 * Per-tip visual effect assignment types.
 *
 * Props have variable tip counts (staff = 2 tips, fan = 5, club = 1).
 * Effects can be assigned at three granularity levels:
 *   "*"       - applies to every tip in the cell
 *   "0"/"1"   - applies to every tip on one hand's prop
 *   "0-0"     - applies to a single tip on a single prop
 *
 * Resolution walks from most-specific to least-specific within
 * the cell map first, then falls through to the global map.
 */

import type { EffortId } from "#lib/shared/effort/domain/effort-types.js";

export type EffectType =
  | "none"
  | "fire"
  | "charcoal"
  | "led"
  | "trails"
  | "zap"
  | "sparkles"
  | "ghost"
  | "bloom"
  | "goo"
  | "bubbles"
  | "petals"
  | "smoke"
  | "ink"
  | "frost"
  | "silk"
  | "animal"
  | "pulse";

export interface TipEffectAssignment {
  effect: EffectType;
}

export interface TipEffortAssignment {
  effort: EffortId;
}

/**
 * Key format:
 *   "*"         - cell-wide (all tips on all props)
 *   "0" / "1"   - per-hand (all tips on one prop)
 *   "0-0"       - per-tip  (single tip on one prop)
 */
export type TipEffectMap = Record<string, TipEffectAssignment>;
export type TipEffortMap = Record<string, TipEffortAssignment>;

/**
 * Resolve which visual effect applies to a specific tip.
 *
 * Priority order (first match wins):
 *   1. Cell-level per-tip   ("0-1")
 *   2. Cell-level per-hand  ("0")
 *   3. Cell-level cell-wide ("*")
 *   4. Global per-tip
 *   5. Global per-hand
 *   6. Global cell-wide
 *   7. Fallback: "none"
 */
export function resolveEffect(
  propIndex: number,
  tipIndex: number,
  cellMap: TipEffectMap | undefined,
  globalMap: TipEffectMap
): EffectType {
  const tipKey = `${propIndex}-${tipIndex}`;
  const handKey = `${propIndex}`;

  if (cellMap) {
    if (cellMap[tipKey]) return cellMap[tipKey].effect;
    if (cellMap[handKey]) return cellMap[handKey].effect;
    if (cellMap["*"]) return cellMap["*"].effect;
  }

  if (globalMap[tipKey]) return globalMap[tipKey].effect;
  if (globalMap[handKey]) return globalMap[handKey].effect;
  if (globalMap["*"]) return globalMap["*"].effect;

  return "none";
}

/**
 * Resolve which effort quality applies to a specific tip.
 * Same priority cascade as resolveEffect.
 * Fallback: "linear" (neutral easing).
 */
export function resolveEffort(
  propIndex: number,
  tipIndex: number,
  cellMap: TipEffortMap | undefined,
  globalMap: TipEffortMap
): EffortId {
  const tipKey = `${propIndex}-${tipIndex}`;
  const handKey = `${propIndex}`;

  if (cellMap) {
    if (cellMap[tipKey]) return cellMap[tipKey].effort;
    if (cellMap[handKey]) return cellMap[handKey].effort;
    if (cellMap["*"]) return cellMap["*"].effort;
  }

  if (globalMap[tipKey]) return globalMap[tipKey].effort;
  if (globalMap[handKey]) return globalMap[handKey].effort;
  if (globalMap["*"]) return globalMap["*"].effort;

  return "linear";
}
