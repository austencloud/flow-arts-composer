/**
 * Timing and direction as the primary Linked rule.
 *
 * In Linked mode the follower is one fixed transform of the driver on every
 * beat, and TnD is derived purely from each hand's start-to-end arc
 * (tnd-deriver.ts). So a rule pins one TnD mode for the whole sequence, and
 * the user can pick the mode and let the rule follow. This module is the
 * two-way map between a mode selection and the FuseRule the transform
 * pipeline already runs. The pipeline itself is untouched.
 *
 * Quarter modes carry an offset rather than a lead hand: which hand reaches
 * the downbeat first depends on the driver's arc sense per beat, and
 * generated paths reverse arc sense. A quarter clockwise is what the rule
 * actually fixes.
 *
 * Design: docs/superpowers/specs/2026-09-17-fuse-tnd-mode-rule-design.md
 */
import {
  MODE_LABEL,
  MODE_ORDER,
  type VtgMode,
} from "$lib/shared/shape-matrix/services/shape-matrix-realizations";
import { createFuseRule, type FuseRule } from "./fuse-rule";

export type FuseTnDMode = VtgMode;
export type FuseQuarterOffset = "cw" | "ccw";

export interface FuseTnDSelection {
  mode: FuseTnDMode;
  /** Only meaningful for QS and QO. Which way round the circle the follower
   *  sits from the driver. Kept on every selection so switching into a
   *  quarter mode reuses the last choice. */
  quarterOffset: FuseQuarterOffset;
  invert: boolean;
  rewind: boolean;
}

export const FUSE_TND_MODES: readonly FuseTnDMode[] = MODE_ORDER;

export const DEFAULT_TND_SELECTION: FuseTnDSelection = {
  mode: "TO",
  quarterOffset: "cw",
  invert: false,
  rewind: false,
};

export function isQuarterMode(mode: FuseTnDMode): boolean {
  return mode === "QS" || mode === "QO";
}

/** "Together, opposite" — the words the panel and the rail read. */
export function fuseTnDModeLabel(mode: FuseTnDMode): string {
  const [timing, direction] = MODE_LABEL[mode].split(" · ");
  const fullDirection = direction === "Opp" ? "opposite" : "same";
  return `${timing}, ${fullDirection}`;
}

function quarterSteps(offset: FuseQuarterOffset): number {
  return offset === "cw" ? 2 : 6;
}

/** The FuseRule that yields this mode on every beat (rewind aside). */
export function resolveFuseRule(selection: FuseTnDSelection): FuseRule {
  const { mode, quarterOffset, invert, rewind } = selection;
  switch (mode) {
    case "TS":
      return createFuseRule({ rotationSteps: 0, reflect: "none", invert, rewind });
    case "SS":
      return createFuseRule({ rotationSteps: 4, reflect: "none", invert, rewind });
    case "QS":
      return createFuseRule({
        rotationSteps: quarterSteps(quarterOffset),
        reflect: "none",
        invert,
        rewind,
      });
    case "TO":
      return createFuseRule({ rotationSteps: 0, reflect: "mirror", invert, rewind });
    case "SO":
      // Flip alone is rotate 180 composed with mirror; it is the single-op label.
      return createFuseRule({ rotationSteps: 0, reflect: "flip", invert, rewind });
    case "QO":
      return createFuseRule({
        rotationSteps: quarterSteps(quarterOffset),
        reflect: "mirror",
        invert,
        rewind,
      });
  }
}

/**
 * The mode a rule yields, or null when the rotation is odd (a 45-degree slice
 * gives eighth timing, which the deriver files under quarter; the panel does
 * not offer it).
 *
 * Rotate 180 composed with mirror is flip, and composed with flip is mirror,
 * so the two composites read as the single reflection they equal. The
 * resolver never emits them, but persisted rules can carry them.
 */
export function classifyFuseRule(rule: FuseRule): FuseTnDSelection | null {
  const steps = rule.rotationSteps;
  if (steps % 2 !== 0) return null;

  const { invert, rewind } = rule;
  const quarterOffset: FuseQuarterOffset = steps === 6 ? "ccw" : "cw";
  const base = { quarterOffset, invert, rewind };

  if (steps === 2 || steps === 6) {
    return { ...base, mode: rule.reflect === "none" ? "QS" : "QO" };
  }

  // steps is 0 or 4. Fold the rotation into the reflection.
  const effectiveReflect =
    steps === 0
      ? rule.reflect
      : rule.reflect === "none"
        ? "rotate180"
        : rule.reflect === "mirror"
          ? "flip"
          : "mirror";

  switch (effectiveReflect) {
    case "none":
      return { ...base, mode: "TS" };
    case "rotate180":
      return { ...base, mode: "SS" };
    case "mirror":
      return { ...base, mode: "TO" };
    case "flip":
      return { ...base, mode: "SO" };
  }
}

/**
 * Bring a persisted rule into the mode model. Odd rotations round down to the
 * nearest even step; everything else is kept. `adjusted` says whether a
 * change was made, so the panel can say so once.
 */
export function coerceToTnDRule(rule: FuseRule): {
  selection: FuseTnDSelection;
  adjusted: boolean;
} {
  const direct = classifyFuseRule(rule);
  if (direct) return { selection: direct, adjusted: false };

  const rounded = createFuseRule({
    ...rule,
    rotationSteps: rule.rotationSteps - 1,
  });
  const selection = classifyFuseRule(rounded);
  if (!selection) {
    // Unreachable: an odd step minus one is even. Kept so the return type is
    // honest without a non-null assertion.
    return { selection: DEFAULT_TND_SELECTION, adjusted: true };
  }
  return { selection, adjusted: true };
}
