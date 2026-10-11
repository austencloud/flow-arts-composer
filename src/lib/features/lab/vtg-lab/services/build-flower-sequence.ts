import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { CsvEdge } from "#lib/features/choreo-card/services/pictograph-letter-lookup.js";
import { applyVariationDescriptor } from "#lib/features/choreo-card/services/deck-variation.js";
import { prepareMandalaPropSequence } from "./prepare-mandala-club-sequence";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  flowerStartOrientation,
  flowerTurnPattern,
  type Flower,
} from "#lib/shared/shape-matrix/domain/flower-signature.js";
import { closeSequenceOrientationCycle } from "#lib/shared/create/services/sequence-orientation-cycle.js";

/**
 * archetype (two-hand pure-pro or pure-anti seed) + flower → a single-hand
 * club SequenceData, south-anchored, at the flower's turns + start orientation.
 * `hand` is which performer-relative axis this flower lives on.
 */
export function buildFlowerSequence(
  archetype: SequenceData,
  flower: Flower,
  hand: "left" | "right",
  edges: CsvEdge[],
  propType: PropType = PropType.CLUB
): SequenceData {
  // Apply turns + start orientation to the FULL two-hand archetype first (the
  // proven rosetta order — applyVariationDescriptor's per-hand turn/closure logic
  // expects both hands present), THEN strip to the single shown hand as a club.
  const { sequence } = applyVariationDescriptor(
    archetype,
    {
      turnPattern: flowerTurnPattern(flower),
      turnLabel: flowerTurnPattern(flower),
      gridMode: flower.grid,
      startOriPair:
        hand === "left"
          ? { left: flowerStartOrientation(flower) }
          : { right: flowerStartOrientation(flower) },
    },
    edges
  );
  return prepareMandalaPropSequence(closeSequenceOrientationCycle(sequence), {
    show: hand,
    pathShape: "arc",
    propType,
  });
}
