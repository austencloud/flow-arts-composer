/**
 * Type 6 Constraint
 *
 * Type 6 letters (α, β, γ) are static — no hand movement, only prop rotation.
 * At level 1, they're excluded entirely because L1 only has 0-turn motions,
 * and a 0-turn static letter is just "stand there doing nothing."
 * At level 2+, they're allowed only when at least one hand has turns > 0,
 * so the props are actually doing something while the hands hold still.
 *
 * This only gets a say when static letters are in the candidate pool at all,
 * which BuildOptions.allowStaticSteps controls — on by default only when the
 * caller set a turn pattern, a layer target, or a no-dash hand-relationship
 * LOOP with turns available. LetterClassifier additionally
 * treats ζ, η, τ and ⊕ as Type 6; those are synthesized position placeholders
 * rather than alphabet letters, and never reach the pool.
 */

import { ConstraintType, type ConstraintMode } from "../constraint-types.js";
import type {
  IConstraint,
  ConstraintContext,
  ConstraintScore,
} from "../types.js";
import { LetterClassifier } from "../../../core/letters/LetterClassifier.js";

export class Type6Constraint implements IConstraint {
  readonly type = ConstraintType.TYPE_6;
  readonly mode: ConstraintMode = "hard";
  readonly description =
    "Filters Type 6 (static) letters by level and turn allocation";

  private readonly classifier = new LetterClassifier();

  evaluate(context: ConstraintContext): ConstraintScore {
    const letterType = this.classifier.getType(context.letter);

    if (letterType !== 6) {
      return { score: 1, satisfied: true, reason: "Not Type 6" };
    }

    const level = context.level ?? 1;

    if (level === 1) {
      return {
        score: 0,
        satisfied: false,
        reason: "Type 6 not allowed at L1",
      };
    }

    const turns = context.assignedTurns ?? context.turnAllocation;
    const leftTurns = typeof turns?.left === "number" ? turns.left : 0;
    const rightTurns = typeof turns?.right === "number" ? turns.right : 0;
    if (leftTurns <= 0 && rightTurns <= 0) {
      return {
        score: 0,
        satisfied: false,
        reason: "Type 6 requires turns > 0 at L2+",
      };
    }

    return { score: 1, satisfied: true, reason: "Type 6 with turns" };
  }
}
