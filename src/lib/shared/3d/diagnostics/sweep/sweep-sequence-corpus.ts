/**
 * Real published sequences as a sweep axis.
 *
 * A grip failure lives in choreography, so the sequence axis has to be real
 * choreography. The committed `publicSequences` snapshot is 568 sequences
 * people actually published; inventing fixtures instead would sweep a space
 * nobody performs. This module rebuilds full `SequenceData` from that snapshot
 * the same way the app's own loader does — the stored form is compositional
 * (two solo prop tracks plus per-step pairings), and `deriveSteps` is the
 * owner that composes them.
 *
 * Reading the file is left to the caller: a test reads it from disk, a browser
 * fetches `/data/snapshots/public-sequences.json`. This module only turns
 * documents into axis members.
 */

import { normalizeLegacySequence } from "@tka/tka-types";
import { deriveSteps } from "$lib/shared/foundation/services/step-deriver";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { toSweepSequence, type SweepSequence } from "./sweep-space";

/** The shape the snapshot stores. Only the fields a rebuild needs. */
export interface PublicSequenceDocument {
  id?: string;
  _id?: string;
  word?: string;
  name?: string;
  level?: number;
  difficultyLevel?: string;
  gridMode?: string;
  loopType?: string | null;
  isCircular?: boolean;
  startPlacement?: unknown;
  sequenceLength?: number;
  blueSoloProp?: { steps: unknown[] };
  redSoloProp?: { steps: unknown[] };
  leftSoloProp?: { steps: unknown[] };
  rightSoloProp?: { steps: unknown[] };
  stepPairings?: unknown[];
}

export interface SweepCorpusSnapshot {
  documents: PublicSequenceDocument[];
}

/**
 * Rebuild one snapshot document into the sequence the 3D performer plays.
 * Returns null for a document whose tracks and pairings disagree in length —
 * `deriveSteps` refuses those, and a half-built sequence would sweep a body
 * through choreography that does not exist.
 */
export function rebuildPublicSequence(
  document: PublicSequenceDocument
): SequenceData | null {
  // The snapshot stores hand tracks under the prop-colour names the old schema
  // used. `normalizeLegacySequence` renames them to the side names the rest of
  // the app speaks, so the rebuilt tracks have to be read back under the new
  // names — reading them back as blue/red finds nothing and silently rebuilds
  // no sequences at all.
  const normalized = normalizeLegacySequence(document) as PublicSequenceDocument;
  const left = normalized.leftSoloProp ?? normalized.blueSoloProp;
  const right = normalized.rightSoloProp ?? normalized.redSoloProp;
  const pairings = normalized.stepPairings;
  if (!left?.steps?.length || !right?.steps?.length || !pairings?.length) {
    return null;
  }
  let steps;
  try {
    steps = deriveSteps(left as never, right as never, pairings as never);
  } catch {
    return null;
  }
  const id = normalized.id ?? normalized._id;
  if (!id) return null;

  return {
    id,
    name: normalized.name ?? normalized.word ?? id,
    word: normalized.word ?? "",
    steps,
    startPlacement: normalized.startPlacement as SequenceData["startPlacement"],
    thumbnails: [],
    isFavorite: false,
    isCircular: Boolean(normalized.isCircular),
    level: normalized.level ?? 2,
    difficultyLevel:
      (normalized.difficultyLevel as SequenceData["difficultyLevel"]) ??
      "intermediate",
    tags: [],
    metadata: {},
  } as SequenceData;
}

export interface CorpusSelection {
  /** How many sequences to take. */
  count: number;
  /** Skip anything shorter than this; a two-step sequence exercises very little. */
  minSteps?: number;
  /** Skip anything longer than this; length is linear wall-time. */
  maxSteps?: number;
}

/**
 * Pick a spread of sequences rather than the first N.
 *
 * The snapshot is ordered by document id, which correlates with nothing, so
 * the first N would over-sample whatever one person published in a sitting.
 * Bucketing by step count and taking round-robin across buckets gives a set
 * that covers short and long choreography, which is what varies the reach and
 * stance demands the sweep is looking for.
 */
export function selectSweepSequences(
  snapshot: SweepCorpusSnapshot,
  selection: CorpusSelection
): SweepSequence[] {
  const minSteps = selection.minSteps ?? 4;
  const maxSteps = selection.maxSteps ?? 16;

  const byLength = new Map<number, SweepSequence[]>();
  for (const document of snapshot.documents) {
    const sequence = rebuildPublicSequence(document);
    if (!sequence) continue;
    const stepCount = sequence.steps.length;
    if (stepCount < minSteps || stepCount > maxSteps) continue;
    const bucket = byLength.get(stepCount) ?? [];
    bucket.push(toSweepSequence(sequence));
    byLength.set(stepCount, bucket);
  }

  const lengths = [...byLength.keys()].sort((a, b) => a - b);
  const picked: SweepSequence[] = [];
  let index = 0;
  while (picked.length < selection.count && lengths.length > 0) {
    let tookOne = false;
    for (const length of lengths) {
      const bucket = byLength.get(length);
      const candidate = bucket?.[index];
      if (!candidate) continue;
      picked.push(candidate);
      tookOne = true;
      if (picked.length >= selection.count) break;
    }
    if (!tookOne) break;
    index += 1;
  }
  return picked;
}
