/**
 * Cards Adapter
 *
 * Loads sequences from the user's library and formats them as choreo cards
 * for CARDS.EXE. Reuses the step-to-retro conversion from notation-adapter
 * rather than duplicating it.
 *
 * Domain: Retro CARDS App
 */

import type { LibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { getLibraryRepository } from "#lib/shared/library/get-library-repository.js";

import type { RetroPictographData } from "../../shared/domain/pictograph-types";
import {
  motionToRetroHand,
  fallbackHand,
} from "../../shared/utils/retro-motion-utils";

export interface RetroCard {
  id: string;
  word: string;
  beats: RetroPictographData[];
  constraint?: string;
  date: string; // MM/DD/YY format
  notes?: string;
}

/**
 * Convert a sequence's steps array to the RetroPictographData list the
 * pixel renderer expects - one entry per beat.
 */
function convertStepsToRetro(steps: readonly StepData[]): RetroPictographData[] {
  return steps.map((step) => {
    const leftMotion = step.motions[HandSide.LEFT];
    const rightMotion = step.motions[HandSide.RIGHT];

    return {
      letter: step.letter ?? "?",
      gridMode: step.gridMode ?? GridMode.DIAMOND,
      leftHand: leftMotion
        ? motionToRetroHand(leftMotion)
        : fallbackHand(HandSide.LEFT),
      rightHand: rightMotion
        ? motionToRetroHand(rightMotion)
        : fallbackHand(HandSide.RIGHT),
    };
  });
}

/**
 * Format a JS Date as MM/DD/YY - the DOS-era date style shown on each card.
 */
function formatDosDate(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const y = String(date.getFullYear()).slice(2);
  return `${m}/${d}/${y}`;
}

/**
 * Map a LibrarySequence to a RetroCard for display in CARDS.EXE.
 */
function librarySequenceToRetroCard(seq: LibrarySequence): RetroCard {
  // Prefer the user's intended word over the expanded word (which may include bridge letters)
  const word = seq.intendedWord || seq.word || seq.name || "???";

  // createdAt on LibrarySequence is always a real Date (not a Firestore Timestamp)
  // because the repository hydrates it. Fall back to now if somehow absent.
  const date = seq.createdAt instanceof Date
    ? seq.createdAt
    : new Date();

  return {
    id: seq.id,
    word,
    beats: convertStepsToRetro(seq.steps ?? []),
    constraint: seq.difficultyLevel || undefined,
    date: formatDosDate(date),
    notes: seq.notes || undefined,
  };
}

/**
 * Load real sequences from the user's library, sorted newest-first,
 * and format them as choreo cards for CARDS.EXE.
 */
export async function loadCards(): Promise<RetroCard[]> {
  const repo = getLibraryRepository();

  const sequences = await repo.getSequences({
    sortBy: "updatedAt",
    sortDirection: "desc",
  });

  return sequences
    .filter((seq) => !seq.isDeleted)
    .map(librarySequenceToRetroCard);
}
