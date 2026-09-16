/**
 * Placement Reachability Analyzer
 *
 * Implements Directional Arc Consistency (DAC) for the chain-structured CSP
 * that sequence generation represents. Before the beam search runs, this
 * analyzer pre-computes which placements at each step can participate in a
 * valid path from start to goal.
 *
 * Algorithm:
 *   1. Build a placement transition graph from hard-constraint-filtered variations
 *   2. Backward pass: propagate goal requirement backward through each step
 *   3. Apply blocked start placements to step 0
 *   4. Forward pass: prune placements that can't be reached from step 0
 *   5. Return per-step reachable placement sets + feasibility flag
 *
 * After this preprocessing, the beam search can filter candidates at every
 * step — not just the final one — guaranteeing it never wastes lanes on
 * paths that dead-end at a future constraint.
 *
 * Complexity: O(seedLength × |placements|²) — with ~56 placements and seeds
 * up to ~8 steps, this is under 25,000 operations. Negligible.
 */

import type { PictographData } from "../constraints/types.js";
import { PlacementTransitionGraph } from "./PlacementTransitionGraph.js";

export interface ReachabilityResult {
  /** reachableAt[i] = placements valid as startPlacement for step i */
  reachableAt: Set<string>[];

  /** True if the goal is reachable from at least one non-blocked start */
  feasible: boolean;

  /** If !feasible, the first step index where the reachable set is empty */
  emptyStepIndex?: number;
}

export class PlacementReachabilityAnalyzer {
  analyze(
    seedLength: number,
    requiredEndPlacements: Set<string>,
    validVariations: PictographData[],
    blockedStartPlacements?: Set<string>,
  ): ReachabilityResult {
    const graph = new PlacementTransitionGraph(validVariations);
    const allPlacements = graph.getAllPlacements();

    // Edge case: single-step seed. The only valid start placements are those
    // with a direct transition to a required end placement.
    if (seedLength === 1) {
      const reachable = new Set<string>();
      for (const pos of allPlacements) {
        const reachableEnds = graph.getReachableFrom(pos);
        for (const end of requiredEndPlacements) {
          if (reachableEnds.has(end)) {
            reachable.add(pos);
            break;
          }
        }
      }

      if (blockedStartPlacements) {
        for (const blocked of blockedStartPlacements) {
          reachable.delete(blocked);
        }
      }

      return {
        reachableAt: [reachable],
        feasible: reachable.size > 0,
        emptyStepIndex: reachable.size === 0 ? 0 : undefined,
      };
    }

    // reachableAt[i] = set of placements that, as the startPlacement of step i,
    // can eventually reach a requiredEndPlacement by step seedLength-1.
    const reachableAt: Set<string>[] = new Array(seedLength);

    // Final step: placements whose forward transitions include at least one
    // required end placement.
    const finalStep = new Set<string>();
    reachableAt[seedLength - 1] = finalStep;
    for (const pos of allPlacements) {
      const reachableEnds = graph.getReachableFrom(pos);
      for (const end of requiredEndPlacements) {
        if (reachableEnds.has(end)) {
          finalStep.add(pos);
          break;
        }
      }
    }

    // Propagate backward: step i is reachable if at least one of its forward
    // transitions lands in the reachable set of step i+1.
    for (let i = seedLength - 2; i >= 0; i--) {
      const currentStep = new Set<string>();
      reachableAt[i] = currentStep;
      const nextStep = reachableAt[i + 1]!;
      for (const pos of allPlacements) {
        const reachableEnds = graph.getReachableFrom(pos);
        for (const nextPos of nextStep) {
          if (reachableEnds.has(nextPos)) {
            currentStep.add(pos);
            break;
          }
        }
      }
    }

    // --- Apply blocked start placements to step 0 ---
    if (blockedStartPlacements) {
      const step0 = reachableAt[0]!;
      for (const blocked of blockedStartPlacements) {
        step0.delete(blocked);
      }
    }

    // A placement at step i is only useful if it can be reached from some
    // placement at step i-1 (which itself was reachable). This prunes placements
    // that survived the backward pass but have no valid incoming path.
    for (let i = 1; i < seedLength; i++) {
      const forwardReachable = new Set<string>();
      const currentStep = reachableAt[i]!;
      const prevStep = reachableAt[i - 1]!;
      for (const pos of currentStep) {
        // pos is valid at step i if some placement at step i-1 can transition to it
        const predecessors = graph.getReachableTo(pos);
        for (const pred of prevStep) {
          if (predecessors.has(pred)) {
            forwardReachable.add(pos);
            break;
          }
        }
      }
      reachableAt[i] = forwardReachable;
    }

    let emptyStepIndex: number | undefined;
    for (let i = 0; i < seedLength; i++) {
      if (reachableAt[i]!.size === 0) {
        emptyStepIndex = i;
        break;
      }
    }

    return {
      reachableAt,
      feasible: emptyStepIndex === undefined,
      emptyStepIndex,
    };
  }
}
