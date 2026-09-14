/**
 * Compositional Constraint Options
 *
 * Structured type representing the orthogonal dimensions of constraint.
 * Each field is independent — compose freely. Named presets are aliases
 * that resolve to ConstraintOptions before calling buildConstraintSet().
 */

import type { HandRelationshipOptions } from "../style/hand-relationship-constraint.js";

export interface ConstraintOptions {
  /** Pro, anti, or any motion type. Default: "any" */
  motionType?: "pro" | "anti" | "any";

  /** Clockwise, counter-clockwise, or any. Default: "any" */
  rotationDirection?: "cw" | "ccw" | "any";

  /** Specific turn value or any. Default: "any" */
  turns?: number | "any";

  /** Which motion families to include/exclude (shift, dash, static).
   *  Named "motionFamily" because shift/dash/static are motion types,
   *  not hand path families (cw/ccw/dash/static/hashIn/hashOut). */
  motionFamily?: {
    include?: ("shift" | "dash" | "static")[];
    exclude?: ("shift" | "dash" | "static")[];
  };

  /** Prop spin continuity preference. Default: "any" */
  propContinuity?: "maximize" | "allow-reversals" | "force-reversals";

  /** Hand path continuity preference. Default: "any" */
  handPathContinuity?: "maximize" | "allow-reversals" | "force-reversals";

  /** Soft preference for dash vs shift motions. Default: no preference.
   *  "maximize" strongly biases the beam toward candidates whose left or right
   *  motion is a dash; "minimize" does the opposite. Closure and other hard
   *  constraints can still force non-dash picks on specific steps — this is
   *  a best-effort bias, not a hard minimum. */
  dashPreference?: "maximize" | "minimize";

  /** Tie the left hand to the right hand inside every step. Hard. See
   *  HandRelationshipConstraint for the maps and what "inverted" means. */
  handRelationship?: HandRelationshipOptions;
}
