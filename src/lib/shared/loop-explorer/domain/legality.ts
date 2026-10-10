/**
 * Loop Explorer — Legality
 *
 * Selection → legal/illegal + reason, wrapping the canonical combo table
 * (`IMPLEMENTED_COMBOS` via `generateLOOPType`/`canExtendCombo`) and the
 * quartered-slice gate (`ROTATED_LOOP_TYPES`). This module adds NO new
 * legality data — it only translates the existing SSOT into UI-shaped
 * answers (why a chip is disabled, whether the slice control may offer
 * quartered) so the picker never re-derives the algebra.
 *
 * Source of truth: `#lib/shared/create/services/loop-type-utils.ts`.
 */

import { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import { LOOPType, ROTATED_LOOP_TYPES } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
import {
  canExtendCombo,
  generateLOOPType,
  isImplementedCombo,
} from "#lib/shared/create/services/loop-type-utils.js";

export type LoopSlice = "halved" | "quartered";

export interface SelectionLegality {
  /** True when the exact component set maps to an implemented LOOP type. */
  readonly legal: boolean;
  /** The resolved LOOP type when legal; null otherwise. */
  readonly loopType: LOOPType | null;
  /** Human-readable reason, present only when illegal. */
  readonly reason?: string;
}

export interface ChipLegality {
  /** Whether adding this component to the current selection can still lead
   * to SOME implemented combo (superset reachability, not exact match). */
  readonly canAdd: boolean;
  /** Why-tooltip text when `canAdd` is false. */
  readonly reason?: string;
}

/**
 * FLIPPED and REWOUND compose with nothing today (see loop-type-utils.ts
 * IMPLEMENTED_COMBOS comment: mirror+flip has no fixed points at L1–L5 and
 * degenerates to a 180° rotation; rewound combos have no designed semantics
 * yet). Named here so the picker's why-tooltip can quote a real reason
 * instead of a generic "not supported".
 */
const SOLO_ONLY: ReadonlySet<LOOPComponent> = new Set([
  LOOPComponent.FLIPPED,
  LOOPComponent.REWOUND,
]);

/**
 * Evaluate the CURRENT selection (the Apply-button gate): legal only when
 * the exact set maps to an implemented LOOP type.
 */
export function evaluateSelection(components: ReadonlySet<LOOPComponent>): SelectionLegality {
  const set = new Set(components);
  const loopType = generateLOOPType(set);

  if (loopType !== null) {
    return { legal: true, loopType };
  }

  if (set.size === 0) {
    // Empty set resolves to LOOPType.ROTATED (legacy placeholder) inside
    // generateLOOPType, so this branch is unreachable in practice — kept
    // for exhaustiveness since callers may pass an empty set defensively.
    return { legal: false, loopType: null, reason: "Select at least one component." };
  }

  const soloPicked = [...set].filter((c) => SOLO_ONLY.has(c));
  if (soloPicked.length > 0 && set.size > 1) {
    const names = soloPicked.map(formatComponentName).join(" and ");
    return {
      legal: false,
      loopType: null,
      reason: `${names} ${soloPicked.length === 1 ? "composes" : "compose"} with nothing else. Pick it alone.`,
    };
  }

  return {
    legal: false,
    loopType: null,
    reason: "This combination has no implemented LOOP type.",
  };
}

/**
 * Evaluate whether a SINGLE chip should be enabled given the rest of the
 * current selection (the picker's per-chip disabled/why-tooltip gate).
 * Superset-reachable, not exact-match — matches `canExtendCombo`'s builder
 * semantics so the user can pass through unmapped intermediates.
 */
export function evaluateChip(
  current: ReadonlySet<LOOPComponent>,
  candidate: LOOPComponent
): ChipLegality {
  // Already selected — always "addable" (i.e. removable, picker toggles it off).
  if (current.has(candidate)) {
    return { canAdd: true };
  }

  if (canExtendCombo(current, candidate)) {
    return { canAdd: true };
  }

  if (SOLO_ONLY.has(candidate) && current.size > 0) {
    return {
      canAdd: false,
      reason: `${formatComponentName(candidate)} composes with nothing else. Clear the current selection first.`,
    };
  }

  const soloActive = [...current].find((c) => SOLO_ONLY.has(c));
  if (soloActive) {
    return {
      canAdd: false,
      reason: `${formatComponentName(soloActive)} is selected solo and composes with nothing else.`,
    };
  }

  return {
    canAdd: false,
    reason: "No implemented LOOP type reaches this combination.",
  };
}

/** True when `loopType` has a genuine period-4 orbit (rotation-containing types). */
export function supportsQuarteredSlice(loopType: LOOPType | null): boolean {
  return loopType !== null && ROTATED_LOOP_TYPES.has(loopType);
}

/**
 * Resolve the effective slice for a selection: quartered only when both
 * requested AND the resolved LOOP type supports it (mirrors
 * `resolveLoopConfig`'s gate — quartered silently coerces to halved for
 * non-rotation types elsewhere, but the explorer should never OFFER a
 * quartered control it would immediately downgrade).
 */
export function resolveEffectiveSlice(
  loopType: LOOPType | null,
  requested: LoopSlice
): LoopSlice {
  if (requested === "quartered" && !supportsQuarteredSlice(loopType)) {
    return "halved";
  }
  return requested;
}

function formatComponentName(component: LOOPComponent): string {
  return component.charAt(0).toUpperCase() + component.slice(1).toLowerCase();
}

export { isImplementedCombo };
