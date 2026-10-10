import { z } from "zod";
// Worker-safe leaf (no auth/firebase-client): the barrel pulls authState → $app/navigation.
import { firestoreDate } from "#lib/shared/firestore/firestore-date.js";
import type { Timestamp } from "firebase/firestore";
import {
  normalizePlacementFrame,
  PlacementFrame,
  type PlacementFrame as PlacementFrameValue,
} from "../../placement/domain/placement-frame";

export interface SpecialArrowPlacement {
  readonly key: string;
  readonly placementFrame: PlacementFrameValue;
  readonly oriFolder: string;
  readonly letter: string;
  readonly turnsTuple: string;
  readonly motionType: string;
  // Per-arrow discriminator (the same attribute key the static special-placement
  // JSON keys on — color for non-hybrid letters). Without this two arrows that
  // share motionType collapse to one key and an override bleeds across both.
  readonly attributeKey: string;
  // Prop-type discriminator: a fan override and a staff override for the same
  // arrow are distinct and must not bleed across prop types.
  readonly propType: string;
  readonly adjustmentX: number;
  readonly adjustmentY: number;
  readonly originalX: number;
  readonly originalY: number;
  // Tombstone. A static special-placement JSON entry lives in a shipped file and
  // can't be deleted at runtime, so "remove the special placement for this arrow"
  // is expressed as a doc at the same key with suppressed = true. The render path
  // drops the WHOLE Special tier for the key (static JSON included) and falls
  // through to Prop Geometry -> Default. Adjustments stay [0,0] so the existing
  // "zero = absent" sentinel keeps getOverride/hasOverride blind to it;
  // originalX/Y retain the static value being hidden so Restore and the history
  // panel can name it.
  readonly suppressed: boolean;
  readonly updatedAt: Timestamp;
  readonly updatedBy: string;
}

/** The 7 key fields plus the static value being hidden. Input to a tombstone write. */
export interface SpecialSuppressionInput {
  readonly placementFrame: string;
  readonly oriFolder: string;
  readonly letter: string;
  readonly turnsTuple: string;
  readonly motionType: string;
  readonly attributeKey: string;
  readonly propType: string;
  /** The static JSON value this tombstone hides, retained for Restore + history. */
  readonly originalX: number;
  readonly originalY: number;
}

export interface SpecialArrowPlacementInput {
  readonly placementFrame: string;
  readonly oriFolder: string;
  readonly letter: string;
  readonly turnsTuple: string;
  readonly motionType: string;
  readonly attributeKey: string;
  readonly propType: string;
  readonly adjustmentX: number;
  readonly adjustmentY: number;
  readonly originalX: number;
  readonly originalY: number;
}

export const SpecialArrowPlacementSchema = z
  .object({
    key: z.string(),
    placementFrame: z.enum([PlacementFrame.CANONICAL, PlacementFrame.SKEWED]),
    oriFolder: z.string(),
    letter: z.string(),
    turnsTuple: z.string(),
    motionType: z.string(),
    // Legacy docs predate this field. Default to "" so they parse cleanly and
    // become inert (an empty discriminator never matches a real 6-part key)
    // rather than incorrectly bleeding across both arrows.
    attributeKey: z.string().default(""),
    // Legacy docs predate this field. Default to "staff" (canonical prop) so
    // existing Firestore data continues to work without migration.
    propType: z.string().default("staff"),
    adjustmentX: z.number(),
    adjustmentY: z.number(),
    originalX: z.number(),
    originalY: z.number(),
    // Every doc written before tombstones existed is a real override, not a
    // suppression — default false so legacy data parses unchanged and behaves
    // exactly as it did.
    suppressed: z.boolean().default(false),
    updatedAt: firestoreDate,
    updatedBy: z.string(),
  })
  .passthrough();

export function generateSpecialOverrideKey(input: {
  placementFrame: string;
  oriFolder: string;
  letter: string;
  turnsTuple: string;
  motionType: string;
  attributeKey: string;
  propType: string;
}): string {
  return `${normalizePlacementFrame(input.placementFrame)}|${input.oriFolder}|${input.letter}|${input.turnsTuple}|${input.motionType}|${input.attributeKey}|${input.propType}`;
}

export function parseSpecialOverrideKey(key: string): {
  placementFrame: PlacementFrameValue;
  oriFolder: string;
  letter: string;
  turnsTuple: string;
  motionType: string;
  attributeKey: string;
  propType: string;
} | null {
  const parts = key.split("|");
  if (parts.length !== 6 && parts.length !== 7) return null;
  const [
    placementFrameValue,
    oriFolder,
    letter,
    turnsTuple,
    motionType,
    attributeKey,
  ] = parts;
  const propType = parts.length === 7 ? parts[6] : "staff";
  if (
    !placementFrameValue ||
    !oriFolder ||
    !letter ||
    !turnsTuple ||
    !motionType ||
    !attributeKey ||
    !propType
  )
    return null;
  let placementFrame: PlacementFrameValue;
  try {
    placementFrame = normalizePlacementFrame(placementFrameValue);
  } catch {
    return null;
  }
  return {
    placementFrame,
    oriFolder,
    letter,
    turnsTuple,
    motionType,
    attributeKey,
    propType,
  };
}

export function extractOriFolderFromPath(filePath: string): string {
  const parts = filePath.split("/");
  const specialIndex = parts.indexOf("special");
  const oriFolder = specialIndex >= 0 ? parts[specialIndex + 1] : undefined;
  if (oriFolder) {
    return oriFolder;
  }
  return "from_layer1";
}
