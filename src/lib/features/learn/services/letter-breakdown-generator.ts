/**
 * LetterBreakdownGenerator
 *
 * Produces deterministic, correct letter descriptions and comparisons
 * from the static letter breakdown table. Eliminates LLM hallucination
 * risk by pre-computing all domain content before TIKA receives it.
 */

import type { LetterBreakdown, LetterComparison, ComparisonRelationship } from "./types";
import {
  LETTER_BREAKDOWN_TABLE,
  type LetterBreakdownEntry,
} from "./domain/letter-breakdown-data";

export function getBreakdown(letter: string): LetterBreakdown | null {
  const entry = LETTER_BREAKDOWN_TABLE.get(letter);
  if (!entry) return null;

  return {
    letter,
    typeNumber: entry.typeNumber,
    typeName: entry.typeName,
    placementDescription: buildPlacementDescription(entry),
    motionDescription: entry.motionDescription,
    tndMode: entry.tndMode,
    tndElement: entry.tndElement,
    motionGroup: entry.motionGroup,
    upgradeFrom: entry.upgradeFrom,
    summary: buildSummary(letter, entry),
  };
}

export function compare(letterA: string, letterB: string): LetterComparison | null {
  const breakdownA = getBreakdown(letterA);
  const breakdownB = getBreakdown(letterB);
  if (!breakdownA || !breakdownB) return null;

  const entryA = LETTER_BREAKDOWN_TABLE.get(letterA)!;
  const entryB = LETTER_BREAKDOWN_TABLE.get(letterB)!;

  const relationship = detectRelationship(letterA, letterB, entryA, entryB);
  const explanation = buildExplanation(breakdownA, breakdownB, entryA, entryB, relationship);

  return { letterA: breakdownA, letterB: breakdownB, relationship, explanation };
}


function buildPlacementDescription(entry: LetterBreakdownEntry): string {
  // Hands return to the same placement they started from (e.g. Type 6 static
  // letters, and Type 1 letters like A/B/C). Reading "alpha to alpha" implies
  // a transition that didn't happen — describe it as a single placement.
  if (entry.startPlacement === entry.endPlacement) {
    return `at ${entry.startPlacement}`;
  }
  return `${entry.startPlacement} to ${entry.endPlacement}`;
}

function buildSummary(letter: string, entry: LetterBreakdownEntry): string {
  const pos = `${entry.startPlacement}→${entry.endPlacement}`;

  switch (entry.typeNumber) {
    case 1:
      return buildType1Summary(letter, entry, pos);
    case 2:
      return buildType2Summary(letter, entry, pos);
    case 3:
      return buildType3Summary(letter, entry);
    case 4:
      return buildType4Summary(letter, entry, pos);
    case 5:
      return buildType5Summary(letter, entry);
    case 6:
      return buildType6Summary(letter, entry);
    default:
      return `${letter} is a Type ${entry.typeNumber} (${entry.typeName}) letter: ${pos}, ${entry.motionDescription}`;
  }
}

function buildType1Summary(
  letter: string,
  entry: LetterBreakdownEntry,
  pos: string
): string {
  const base = `${letter} is ${pos} with ${entry.motionDescription} spins`;
  const tndPart = entry.tndMode
    ? ` (${entry.tndMode}${entry.tndElement ? ` / ${entry.tndElement}` : ""})`
    : "";
  return base + tndPart;
}

function buildType2Summary(
  letter: string,
  entry: LetterBreakdownEntry,
  pos: string
): string {
  return `${letter} is ${pos} through a single ${extractShiftDirection(entry)} shift against a static hand`;
}

function buildType3Summary(
  letter: string,
  entry: LetterBreakdownEntry
): string {
  return `${letter} is like ${entry.upgradeFrom} but the static hand now dashes`;
}

function buildType4Summary(
  letter: string,
  entry: LetterBreakdownEntry,
  pos: string
): string {
  const qualifier = extractDashQualifier(entry);
  return `${letter} is ${pos} with one${qualifier} dash against a static hand`;
}

function buildType5Summary(
  letter: string,
  entry: LetterBreakdownEntry
): string {
  const qualifier = extractDashQualifier(entry);
  return `${letter} is like ${entry.upgradeFrom} but both hands dash${qualifier}`;
}

function buildType6Summary(
  letter: string,
  entry: LetterBreakdownEntry
): string {
  return `${letter}: both hands static at ${entry.startPlacement}`;
}

// ─── Helpers for extracting motion details ──────────────────────

function extractShiftDirection(entry: LetterBreakdownEntry): string {
  if (entry.motionDescription.includes("pro")) return "pro";
  if (entry.motionDescription.includes("anti")) return "anti";
  return "";
}

function extractDashQualifier(entry: LetterBreakdownEntry): string {
  if (entry.motionDescription.includes("diverging")) return " diverging";
  if (entry.motionDescription.includes("converging")) return " converging";
  if (entry.motionDescription.includes("angle preserved"))
    return " (angle preserved)";
  return "";
}

// ─── Comparison logic ──────────────────────────────────────────

function detectRelationship(
  letterA: string,
  letterB: string,
  entryA: LetterBreakdownEntry,
  entryB: LetterBreakdownEntry
): ComparisonRelationship {
  // Check for upgrade relationship (Type 2→3 or Type 4→5)
  if (entryA.upgradeFrom === letterB || entryB.upgradeFrom === letterA) {
    return "cross-type-upgrade";
  }

  const sameType = entryA.typeNumber === entryB.typeNumber;
  const sameStart = entryA.startPlacement === entryB.startPlacement;
  const sameEnd = entryA.endPlacement === entryB.endPlacement;

  if (sameType) {
    if (sameStart && sameEnd) {
      // Same placement pair - must differ in rotation
      if (entryA.motionGroup !== entryB.motionGroup) {
        return "same-type-different-rotation";
      }
      // Same type, same placements, same group (e.g. M vs P - different gamma subgroups)
      return "same-type-different-group";
    }
    // Same type, different placements
    return "same-type-different-placement";
  }

  // Different types
  if (sameEnd) {
    return "same-placement-different-type";
  }

  return "cross-type-confusion";
}

function buildExplanation(
  a: LetterBreakdown,
  b: LetterBreakdown,
  entryA: LetterBreakdownEntry,
  entryB: LetterBreakdownEntry,
  relationship: ComparisonRelationship
): string {
  switch (relationship) {
    case "same-type-different-rotation":
      return explainSamePlacementDifferentRotation(a, b);
    case "same-type-different-placement":
      return explainSameTypeDifferentPlacement(a, b);
    case "same-type-different-group":
      return explainSameTypeDifferentGroup(a, b);
    case "cross-type-upgrade":
      return explainUpgrade(a, b, entryA, entryB);
    case "same-placement-different-type":
      return explainSameEndPlacementDifferentType(a, b);
    case "cross-type-confusion":
      return explainCrossTypeConfusion(a, b);
    case "unrelated":
    default:
      return explainUnrelated(a, b);
  }
}

function explainSamePlacementDifferentRotation(
  a: LetterBreakdown,
  b: LetterBreakdown
): string {
  return (
    `Both ${a.letter} and ${b.letter} are ${a.placementDescription} Type ${a.typeNumber} letters. ` +
    `${a.letter} is ${a.motionDescription}. ${b.letter} is ${b.motionDescription}. ` +
    `Same hand paths, different prop rotation.`
  );
}

function explainSameTypeDifferentPlacement(
  a: LetterBreakdown,
  b: LetterBreakdown
): string {
  return (
    `Both are Type ${a.typeNumber} (${a.typeName}), ${a.motionDescription}. ` +
    `${a.letter} goes ${a.placementDescription}. ${b.letter} goes ${b.placementDescription}.`
  );
}

function explainSameTypeDifferentGroup(
  a: LetterBreakdown,
  b: LetterBreakdown
): string {
  const tndA = a.tndMode ? ` (${a.tndMode})` : "";
  const tndB = b.tndMode ? ` (${b.tndMode})` : "";
  return (
    `Both ${a.letter} and ${b.letter} are Type ${a.typeNumber} ${a.placementDescription}. ` +
    `They differ in their VTG timing: ${a.letter}${tndA} vs ${b.letter}${tndB}.`
  );
}

function explainUpgrade(
  a: LetterBreakdown,
  b: LetterBreakdown,
  entryA: LetterBreakdownEntry,
  _entryB: LetterBreakdownEntry
): string {
  const [base, upgraded] = entryA.upgradeFrom ? [b, a] : [a, b];
  return (
    `${upgraded.letter} is ${base.letter} with the static hand upgraded to a dash. ` +
    `${base.letter} is Type ${base.typeNumber} (${base.typeName}). ` +
    `${upgraded.letter} is Type ${upgraded.typeNumber} (${upgraded.typeName}).`
  );
}

function explainSameEndPlacementDifferentType(
  a: LetterBreakdown,
  b: LetterBreakdown
): string {
  return (
    `Both end at the same placement, but use different motion types. ` +
    `${a.letter} is Type ${a.typeNumber} (${a.typeName}): ${a.motionDescription}. ` +
    `${b.letter} is Type ${b.typeNumber} (${b.typeName}): ${b.motionDescription}.`
  );
}

function explainCrossTypeConfusion(
  a: LetterBreakdown,
  b: LetterBreakdown
): string {
  return (
    `${a.letter} is Type ${a.typeNumber} (${a.typeName}): ${a.motionDescription}. ` +
    `${b.letter} is Type ${b.typeNumber} (${b.typeName}): ${b.motionDescription}. ` +
    `Different letter types with different motion patterns.`
  );
}

function explainUnrelated(
  a: LetterBreakdown,
  b: LetterBreakdown
): string {
  return `${a.summary} ${b.summary}`;
}
