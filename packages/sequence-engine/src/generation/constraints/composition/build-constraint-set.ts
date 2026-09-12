/**
 * Compositional Constraint Builder
 *
 * Single entry point for converting structured ConstraintOptions into a ConstraintSet.
 * All three constraint paths (structured, presets, NL parsing) funnel through here.
 */

import type { ConstraintSet, IConstraint } from "../types.js";
import { ConstraintType } from "../constraint-types.js";
import type { ConstraintOptions } from "./constraint-options.js";
import { MotionTypeConstraint } from "../style/motion-type-constraint.js";
import { RotationDirectionConstraint } from "../style/rotation-direction-constraint.js";
import { ContinuityConstraint } from "../style/continuity-constraint.js";
import { ReversalConstraint } from "../style/reversal-constraint.js";
import {
  HandPathReversalConstraint,
  maximizeHandPathContinuity,
} from "../style/hand-path-constraint.js";
import { TurnConstraint } from "../style/turn-constraint.js";
import {
  maximizeDashes,
  minimizeDashes,
} from "../style/dash-preference-constraint.js";
import { HandRelationshipConstraint } from "../style/hand-relationship-constraint.js";

// Dash preference shares ConstraintType.MOTION_TYPE with hard filters, but
// is always soft. Weight it heavier than the default 1.0 so it actually
// biases beam selection against the other soft constraints (prop continuity,
// hand path continuity) that also score near 1.0 for their preferred
// candidates. Without this boost, a 3-way average drowns the dash signal.
const DASH_PREFERENCE_WEIGHT = 2.5;

export function buildConstraintSet(options: ConstraintOptions): ConstraintSet {
  const hard: IConstraint[] = [];
  const soft: IConstraint[] = [];
  const weights = new Map<ConstraintType, number>();

  // Motion type dimension
  if (options.motionType && options.motionType !== "any") {
    hard.push(
      new MotionTypeConstraint({
        motionType: options.motionType,
        hand: "both",
        mode: "require",
      })
    );
  }

  // Rotation direction dimension
  if (options.rotationDirection && options.rotationDirection !== "any") {
    hard.push(
      new RotationDirectionConstraint({
        direction: options.rotationDirection,
        hand: "both",
        mode: "require",
      })
    );
  }

  // Turn value dimension
  if (options.turns !== undefined && options.turns !== "any") {
    hard.push(new TurnConstraint(options.turns));
  }

  // Motion family include/exclude
  if (options.motionFamily) {
    if (options.motionFamily.exclude) {
      for (const family of options.motionFamily.exclude) {
        hard.push(
          new MotionTypeConstraint({
            motionType: family,
            hand: "both",
            mode: "exclude",
          })
        );
      }
    }
    if (options.motionFamily.include) {
      // "include: ['shift']" means exclude everything EXCEPT shift
      const allFamilies: ("shift" | "dash" | "static")[] = ["shift", "dash", "static"];
      const excluded = allFamilies.filter(f => !options.motionFamily!.include!.includes(f));
      for (const family of excluded) {
        hard.push(
          new MotionTypeConstraint({
            motionType: family,
            hand: "both",
            mode: "exclude",
          })
        );
      }
    }
  }

  // Prop continuity dimension
  if (options.propContinuity) {
    switch (options.propContinuity) {
      case "maximize":
        soft.push(new ContinuityConstraint("maximize"));
        break;
      case "force-reversals":
        soft.push(new ReversalConstraint("every"));
        break;
      case "allow-reversals":
        // No constraint — allow whatever happens naturally
        break;
    }
  }

  // Hand path continuity dimension
  if (options.handPathContinuity) {
    switch (options.handPathContinuity) {
      case "maximize":
        soft.push(maximizeHandPathContinuity());
        break;
      case "force-reversals":
        soft.push(new HandPathReversalConstraint("every"));
        break;
      case "allow-reversals":
        break;
    }
  }

  // Dash preference dimension (soft bias, best-effort)
  if (options.dashPreference === "maximize") {
    soft.push(maximizeDashes());
    weights.set(ConstraintType.MOTION_TYPE, DASH_PREFERENCE_WEIGHT);
  } else if (options.dashPreference === "minimize") {
    soft.push(minimizeDashes());
    weights.set(ConstraintType.MOTION_TYPE, DASH_PREFERENCE_WEIGHT);
  }

  // Hand relationship dimension. Hard: a pair either relates or it does not.
  if (options.handRelationship) {
    hard.push(new HandRelationshipConstraint(options.handRelationship));
  }

  const set: ConstraintSet = { hard, soft };
  if (weights.size > 0) {
    set.weights = weights;
  }
  return set;
}
