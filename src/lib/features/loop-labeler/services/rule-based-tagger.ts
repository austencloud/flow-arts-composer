/**
 * Rule-Based Tagger
 *
 * Suggests tags using deterministic heuristics (no ML).
 * Applies simple rules based on sequence features to generate tag suggestions.
 */

import type { SequenceFeatures } from "../domain/models/sequence-features";
import type {
  SuggestedTag,
  TagSuggestionResult,
} from "../domain/models/suggested-tag";
import {
  createSuggestedTag,
  groupByConfidenceLevel,
} from "../domain/models/suggested-tag";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

/**
 * Suggest all applicable tags for a sequence
 */
export function suggestTags(features: SequenceFeatures): SuggestedTag[] {
  const tags: SuggestedTag[] = [];

  // Prop type tags
  tags.push(...getPropTags(features));

  // Motion tags
  tags.push(...getMotionTags(features));

  // Grid mode tags
  tags.push(...getGridTags(features));

  // Position tags
  tags.push(...getPositionTags(features));

  return tags;
}

/**
 * Suggest tags and group by confidence level
 */
export function suggestTagsGrouped(
  features: SequenceFeatures
): TagSuggestionResult {
  const tags = suggestTags(features);
  return groupByConfidenceLevel(tags);
}

/**
 * Get prop type tags
 * NOTE: Returns empty - prop type is viewer preference, not sequence data
 * Sequences should not be tagged by prop type since they can be viewed with any prop
 */
function getPropTags(_features: SequenceFeatures): SuggestedTag[] {
  return [];
}

/**
 * Get motion tags based on which motion types are present
 *
 * Tags are declarative - just describe what's in the sequence.
 * Queries can filter for "only-pro" by checking for pro without others.
 */
export function getMotionTags(features: SequenceFeatures): SuggestedTag[] {
  const tags: SuggestedTag[] = [];
  const {
    reversals,
    hasProMotion,
    hasAntiMotion,
    hasFloatMotion,
    hasDashMotion,
    hasStaticMotion,
  } = features;

  // Motion type tags - declarative, just tag what's present
  if (hasProMotion) {
    tags.push(
      createSuggestedTag("pro", "motion", 1.0, "Contains pro-spin motions")
    );
  }

  if (hasAntiMotion) {
    tags.push(
      createSuggestedTag("anti", "motion", 1.0, "Contains anti-spin motions")
    );
  }

  if (hasFloatMotion) {
    tags.push(
      createSuggestedTag("float", "motion", 1.0, "Contains float motions")
    );
  }

  if (hasDashMotion) {
    tags.push(
      createSuggestedTag("dash", "motion", 1.0, "Contains dash motions")
    );
  }

  if (hasStaticMotion) {
    tags.push(
      createSuggestedTag("static", "motion", 1.0, "Contains static motions")
    );
  }

  // No-turns tag (sequence has no pro or anti spin)
  if (!features.hasTurns) {
    tags.push(
      createSuggestedTag(
        "no-turns",
        "motion",
        1.0,
        "Sequence contains no prop rotations"
      )
    );
  }

  // Reversal tags
  if (reversals.hasReversals) {
    tags.push(
      createSuggestedTag(
        "reversals",
        "motion",
        1.0,
        `${reversals.totalReversals} reversal(s) detected`
      )
    );

    if (reversals.synchronizedReversals) {
      tags.push(
        createSuggestedTag(
          "synchronized-reversals",
          "motion",
          0.9,
          "Left and right hands reverse together"
        )
      );
    }
  }

  return tags;
}

/**
 * Get grid mode tags
 */
function getGridTags(features: SequenceFeatures): SuggestedTag[] {
  const tags: SuggestedTag[] = [];

  if (features.gridMode) {
    const gridName = getGridName(features.gridMode);
    tags.push(
      createSuggestedTag(gridName, "grid", 1.0, `Uses ${gridName} grid mode`)
    );
  }

  return tags;
}

/**
 * Get position-based tags
 *
 * Tags are declarative - just describe which position groups are present.
 * Queries can filter for "only-alpha" by checking for alpha without others.
 */
export function getPositionTags(features: SequenceFeatures): SuggestedTag[] {
  const tags: SuggestedTag[] = [];
  const { hasAlphaPositions, hasBetaPositions, hasGammaPositions } = features;

  if (hasAlphaPositions) {
    tags.push(
      createSuggestedTag("alpha", "position", 1.0, "Contains alpha positions")
    );
  }

  if (hasBetaPositions) {
    tags.push(
      createSuggestedTag("beta", "position", 1.0, "Contains beta positions")
    );
  }

  if (hasGammaPositions) {
    tags.push(
      createSuggestedTag("gamma", "position", 1.0, "Contains gamma positions")
    );
  }

  return tags;
}

// === Private Helpers ===

function _getPropName(propType: PropType): string {
  switch (propType) {
    case PropType.STAFF:
    case PropType.SIMPLESTAFF:
    case PropType.BIGSTAFF:
    case PropType.STAFF2:
    case PropType.CAPSULE_BATON:
    case PropType.FIRE_DOUBLE_STAFF:
      return "staff";
    case PropType.FAN:
    case PropType.BIGFAN:
      return "fan";
    case PropType.CLUB:
    case PropType.BIGCLUB:
      return "club";
    case PropType.BUUGENG:
    case PropType.BIGBUUGENG:
      return "buugeng";
    case PropType.MINIHOOP:
    case PropType.BIGHOOP:
    case PropType.TRIANGLE:
      return "hoop";
    case PropType.HAND:
      return "hand";
    case PropType.TRIAD:
    case PropType.BIGTRIAD:
      return "triad";
    case PropType.DOUBLESTAR:
    case PropType.BIGDOUBLESTAR:
      return "double-star";
    case PropType.SWORD:
      return "sword";
    case PropType.CHICKEN:
    case PropType.BIGCHICKEN:
      return "chicken";
    case PropType.TRIQUETRA:
    case PropType.TRIQUETRA2:
      return "triquetra";
    case PropType.GUITAR:
    case PropType.UKULELE:
      return "guitar";
    case PropType.EIGHTRINGS:
    case PropType.BIGEIGHTRINGS:
      return "eight-rings";
    case PropType.QUIAD:
      return "quiad";
    default:
      return "unknown-prop";
  }
}

function getGridName(gridMode: GridMode): string {
  switch (gridMode) {
    case GridMode.DIAMOND:
      return "diamond";
    case GridMode.BOX:
      return "box";
    default:
      return "unknown-grid";
  }
}
