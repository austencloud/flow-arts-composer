import {
  HandRelationshipConstraint,
  PropRelationshipConstraint,
  type HandRelationshipOptions,
  type PictographData,
  type PropRelationshipOptions,
} from "@tka/sequence-engine/generation";
import type { ReflectionAxis } from "@tka/sequence-engine/loop";
import {
  handModeOptionsForContext,
  propModeToEngine,
  type TnDSelection,
} from "$lib/shared/create/domain/hand-relationship";

export interface StartFeasibilityInput {
  variations: readonly PictographData[];
  handRelationship?: TnDSelection;
  propRelationship?: TnDSelection;
  blockedStartPlacements?: readonly string[];
  startPlacement?: string;
  loopAxis?: ReflectionAxis | null;
  startLocations?: { left: string; right: string } | null;
}

export interface StartFeasibilityResult {
  /** False only when the production hard constraints leave no possible step 1. */
  feasible: boolean;
  /** Placements that still have at least one valid first-step variation. */
  candidateStartPlacements: readonly string[];
  /** Candidate count after the exact hand/prop and start-placement filters. */
  candidateVariationCount: number;
  /** The hand-map senses with at least one allowed first step. */
  viableHandRelationships: readonly HandRelationshipOptions[];
  /** A deterministic viable sense for the builder, when hands are constrained. */
  resolvedHandRelationship?: HandRelationshipOptions;
  /** Safe user-facing explanation when the request cannot begin at all. */
  reason?: string;
}

function allowedStarts(input: StartFeasibilityInput): readonly PictographData[] {
  const blocked = new Set(input.blockedStartPlacements ?? []);
  return input.variations.filter(
    (variation) =>
      !blocked.has(variation.startPlacement) &&
      (!input.startPlacement || variation.startPlacement === input.startPlacement)
  );
}

function satisfies(
  variations: readonly PictographData[],
  hand: HandRelationshipOptions | undefined,
  prop: PropRelationshipOptions | undefined
): readonly PictographData[] {
  const handConstraint = hand ? new HandRelationshipConstraint(hand) : undefined;
  const propConstraint = prop ? new PropRelationshipConstraint(prop) : undefined;
  return variations.filter(
    (variation) =>
      (!handConstraint || handConstraint.couldSatisfy(variation)) &&
      (!propConstraint || propConstraint.couldSatisfy(variation))
  );
}

/**
 * Finds only a conclusive failure: whether the exact production dataset has a
 * first step that can obey the selected hand/prop relationship and start
 * restrictions. It does not predict path search or LOOP closure, so a true
 * result means "may generate", never "is guaranteed to generate".
 */
export function assessStartFeasibility(
  input: StartFeasibilityInput
): StartFeasibilityResult {
  const starts = allowedStarts(input);
  const hand = input.handRelationship ?? "free";
  const prop = input.propRelationship ?? "free";
  const handOptions = handModeOptionsForContext(hand, {
    prop,
    loopAxis: input.loopAxis,
    startLocations: input.startLocations,
  });
  const propOption = propModeToEngine(prop);
  const options = hand === "free" ? [undefined] : handOptions;

  const viable = options.map((option) => ({
    option,
    variations: satisfies(starts, option, propOption),
  }));
  const viableOptions = viable
    .filter((entry) => entry.variations.length > 0)
    .map((entry) => entry.option)
    .filter((option): option is HandRelationshipOptions => option !== undefined);
  const surviving = viable.flatMap((entry) => entry.variations);
  const placements = [...new Set(surviving.map((variation) => variation.startPlacement))];

  if (surviving.length > 0) {
    return {
      feasible: true,
      candidateStartPlacements: placements,
      candidateVariationCount: surviving.length,
      viableHandRelationships: viableOptions,
      resolvedHandRelationship: viableOptions[0],
    };
  }

  return {
    feasible: false,
    candidateStartPlacements: [],
    candidateVariationCount: 0,
    viableHandRelationships: [],
    reason:
      "No allowed starting placement can satisfy the selected hand and prop timing/direction.",
  };
}
