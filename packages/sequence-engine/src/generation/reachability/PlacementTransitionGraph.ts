/**
 * Placement Transition Graph
 *
 * Builds a bidirectional adjacency graph from a set of variations that have
 * already been filtered by hard constraints. Each edge represents a valid
 * transition: one variation's startPlacement → endPlacement.
 *
 * Used by PlacementReachabilityAnalyzer to propagate reachability backward
 * from the LOOP goal and forward from the start, ensuring the beam search
 * only explores placements that can participate in a complete path.
 */

import type { PictographData } from "../constraints/types.js";

export class PlacementTransitionGraph {
  private readonly forward: Map<string, Set<string>> = new Map();
  private readonly reverse: Map<string, Set<string>> = new Map();

  constructor(variations: PictographData[]) {
    for (const v of variations) {
      const { startPlacement, endPlacement } = v;

      let fwd = this.forward.get(startPlacement);
      if (!fwd) {
        fwd = new Set();
        this.forward.set(startPlacement, fwd);
      }
      fwd.add(endPlacement);

      let rev = this.reverse.get(endPlacement);
      if (!rev) {
        rev = new Set();
        this.reverse.set(endPlacement, rev);
      }
      rev.add(startPlacement);
    }
  }

  getReachableFrom(placement: string): Set<string> {
    return this.forward.get(placement) ?? new Set();
  }

  /** Placements that can reach TO the given placement (one step backward). */
  getReachableTo(placement: string): Set<string> {
    return this.reverse.get(placement) ?? new Set();
  }

  getAllPlacements(): Set<string> {
    const all = new Set<string>();
    for (const pos of this.forward.keys()) all.add(pos);
    for (const pos of this.reverse.keys()) all.add(pos);
    return all;
  }
}
