import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  buildTnDSeedClasses,
  getTnDFamilyOptions,
} from "#lib/features/choreo-card/services/deck-composer.js";
import { loadTndBaseWords } from "#lib/features/choreo-card/services/tnd-base-word-snapshot.js";
import { applyVariationDescriptor } from "#lib/features/choreo-card/services/deck-variation.js";
import type { CardVariation } from "#lib/features/choreo-card/domain/models/DeckRelease.js";
import { loadDiamondEdges } from "#lib/features/choreo-card/services/pictograph-letter-lookup.js";
import {
  classifyRotationStyle,
  type RotationStyle,
} from "../domain/rotation-style";
import { normalizeLegacySequence } from "@tka/tka-types";
import { yieldToScheduler } from "#lib/shared/foundation/utils/background-scheduling.js";

export type RotationGridMode = "diamond" | "box";
export type StartOrientationPair = {
  left?: Orientation;
  right?: Orientation;
};

export interface ClassifiedRotationStyleMember {
  seq: SequenceData;
  familyId: string;
}

export interface RotationStyleArchetype {
  style: RotationStyle;
  byTurn: Map<string, SequenceData>;
}

export const ROTATION_STYLE_ORDER: RotationStyle[] = [
  "iso",
  "antispin",
  "hybrid",
];

function word(seedId: string): string {
  return (seedId.split("-").pop() ?? seedId).toUpperCase();
}

let basesPromise: Promise<SequenceData[]> | null = null;

export function loadRotationStyleBases(): Promise<SequenceData[]> {
  if (!basesPromise) basesPromise = loadTndBaseWords();
  return basesPromise;
}

/** Each base word's TnD family, by sequence id. */
function rotationStyleFamilies(
  normalizedBases: SequenceData[],
  grid: RotationGridMode
): Map<string, string> {
  const seedClasses = buildTnDSeedClasses(normalizedBases);
  const familyBySeed = new Map<string, string>();
  for (const family of getTnDFamilyOptions(seedClasses, [grid])) {
    for (const entry of family.entries) {
      familyBySeed.set(entry.sequenceId, family.familyId);
    }
  }
  return familyBySeed;
}

function groupRotationStyleMembers(
  normalizedBases: SequenceData[],
  familyBySeed: Map<string, string>
): Map<RotationStyle, ClassifiedRotationStyleMember[]> {
  const baseById = new Map(normalizedBases.map((base) => [base.id, base]));
  const byStyle = new Map<RotationStyle, ClassifiedRotationStyleMember[]>();
  for (const [seedId, familyId] of familyBySeed) {
    const sequence = baseById.get(seedId);
    if (!sequence) continue;
    const style = classifyRotationStyle(sequence);
    const members = byStyle.get(style) ?? [];
    members.push({ seq: sequence, familyId });
    byStyle.set(style, members);
  }
  return byStyle;
}

export function classifyRotationStyleMembers(
  bases: SequenceData[],
  grid: RotationGridMode
): Map<RotationStyle, ClassifiedRotationStyleMember[]> {
  const normalizedBases = bases.map(normalizeLegacySequence);
  return groupRotationStyleMembers(
    normalizedBases,
    rotationStyleFamilies(normalizedBases, grid)
  );
}

export function representativeRotationStyleMember(
  members: ClassifiedRotationStyleMember[]
): SequenceData {
  return [...members].sort((left, right) => {
    const leftDistinct = new Set(word(left.seq.id).split("")).size;
    const rightDistinct = new Set(word(right.seq.id).split("")).size;
    if (leftDistinct !== rightDistinct) {
      return leftDistinct - rightDistinct;
    }
    return word(left.seq.id).localeCompare(word(right.seq.id));
  })[0]!.seq;
}

/** Resolve only the zero-turn representatives consumed by flower paths. */
export async function resolveRotationStyleArchetypes(
  grid: RotationGridMode = "diamond",
  startOrientation?: StartOrientationPair
): Promise<RotationStyleArchetype[]> {
  const [bases, edges] = await Promise.all([
    loadRotationStyleBases(),
    loadDiamondEdges(),
  ]);
  // One stage per task, so a phone never blocks input for the whole set
  // (Create method previews' cost gate).
  const normalizedBases = bases.map(normalizeLegacySequence);
  await yieldToScheduler();
  const familyBySeed = rotationStyleFamilies(normalizedBases, grid);
  await yieldToScheduler();
  const byStyle = groupRotationStyleMembers(normalizedBases, familyBySeed);
  const archetypes: RotationStyleArchetype[] = [];

  for (const style of ROTATION_STYLE_ORDER) {
    const members = byStyle.get(style) ?? [];
    if (members.length === 0) continue;
    await yieldToScheduler();
    const representative = representativeRotationStyleMember(members);
    const sequence = applyVariationDescriptor(
      representative,
      {
        turnPattern: "0|0",
        turnLabel: "0|0",
        gridMode: grid,
        startOriPair: startOrientation,
      } satisfies CardVariation,
      edges
    ).sequence;
    archetypes.push({ style, byTurn: new Map([["0|0", sequence]]) });
  }
  return archetypes;
}
