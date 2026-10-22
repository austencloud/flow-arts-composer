/**
 * Thrown when the placement graph proves no path exists for the request, as
 * opposed to a search that ran out of luck. Retrying with the same options
 * cannot help, so the builder's LOOP reroll stops on it.
 *
 * `relaxations` lists what would make the request possible on its own: a hard
 * constraint type to drop, or "staticSteps" when level 1's ban on static
 * (Type 6) beats is what closes the last path. Each is found by rerunning the
 * same reachability check without it, so it costs a few graph passes.
 * "inversionHalfway" and "inversionAddsLength" name the LOOP rhythm instead,
 * for an overlay inversion that has no related blocks to flip. A
 * different seed length is not offered: placements can close at a length
 * where the props' orientations still cannot.
 */
import type { ConstraintType } from "../constraints/constraint-types.js";

export type InfeasibleRelaxation =
  | ConstraintType
  | "staticSteps"
  | "inversionHalfway"
  | "inversionAddsLength";

export class GenerationInfeasibleError extends Error {
  constructor(
    message: string,
    readonly seedLength: number,
    readonly relaxations: readonly InfeasibleRelaxation[] = []
  ) {
    super(message);
    this.name = "GenerationInfeasibleError";
  }
}
