/**
 * Notation Adapter
 *
 * Bridges the retro UI to the real GenerationOrchestrator from the DI container.
 * Maps retro UI options (level, length, constraint) to the orchestrator's API,
 * then converts the resulting SequenceData steps back to RetroPictographData[]
 * for the pixel renderer.
 *
 * Domain: Retro SCRIBE App
 */

import type { GenerationOptions } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import {
  DifficultyLevel,
  GenerationMode,
} from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import type { LibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";
import type { SaveResult } from "#lib/features/library/services/types.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { getLibraryRepository } from "#lib/shared/library/get-library-repository.js";
import { getLibrarySaveService } from "#lib/features/library/get-library-save-service.js";
import { postSaveActivation } from "#lib/shared/onboarding/state/post-save-activation-state.svelte.js";

import { getGenerationOrchestrator } from "#lib/features/create/generate/shared/get-generation-orchestrator.js";

import type { RetroPictographData } from "../../shared/domain/pictograph-types";
import {
  motionToRetroHand,
  fallbackHand,
} from "../../shared/utils/retro-motion-utils";

export interface RetroGenerationOptions {
  mode: "freeform" | "spell";
  word?: string;
  length?: number;
  level?: number;
  turnIntensity?: number;
  gridMode?: string;
  constraintPreset?: string;
}

export interface RetroGenerationResult {
  word: string;
  beats: { letter: string; pictograph: RetroPictographData }[];
  stepCount: number;
  /**
   * The raw SequenceData from the orchestrator, kept alongside the pixel
   * renderer's beat list so the SCRIBE menu can pass it straight to
   * LibraryRepository without re-running generation.
   */
  sequenceData: SequenceData;
}

/**
 * Map the retro UI's level number (1-4) to the orchestrator's DifficultyLevel enum.
 */
function mapLevelToDifficulty(level: number): DifficultyLevel {
  switch (level) {
    case 1:
      return DifficultyLevel.BEGINNER;
    case 2:
      return DifficultyLevel.INTERMEDIATE;
    case 3:
      return DifficultyLevel.ADVANCED;
    case 4:
      return DifficultyLevel.SKEWED;
    default:
      return DifficultyLevel.INTERMEDIATE;
  }
}

/**
 * Map the retro UI's grid mode string to the GridMode enum.
 */
function mapGridMode(mode: string): GridMode {
  switch (mode) {
    case "box":
      return GridMode.BOX;
    case "diamond":
    default:
      return GridMode.DIAMOND;
  }
}

/**
 * Generate a real TKA sequence through the DI-registered GenerationOrchestrator,
 * then convert the result to the retro renderer's data format.
 */
export async function generateRetroSequence(
  options: RetroGenerationOptions
): Promise<RetroGenerationResult> {
  const orchestrator = getGenerationOrchestrator();

  const generationOptions: GenerationOptions = {
    mode: GenerationMode.FREEFORM,
    length: options.length ?? 8,
    gridMode: mapGridMode(options.gridMode ?? "diamond"),
    propType: PropType.STAFF,
    difficulty: mapLevelToDifficulty(options.level ?? 2),
    turnIntensity: options.turnIntensity ?? 1,
    constraintPreset:
      (options.constraintPreset as "smooth" | "mixed" | "choppy") ?? "smooth",
  };

  const sequenceData = await orchestrator.generateSequence(generationOptions);

  // Convert each step's motion pair into a RetroPictographData for the pixel renderer
  const beats: { letter: string; pictograph: RetroPictographData }[] =
    sequenceData.steps.map((step) => {
      const leftMotion = step.motions[HandSide.LEFT];
      const rightMotion = step.motions[HandSide.RIGHT];

      const pictograph: RetroPictographData = {
        letter: step.letter ?? "?",
        gridMode: step.gridMode ?? GridMode.DIAMOND,
        leftHand: leftMotion
          ? motionToRetroHand(leftMotion)
          : fallbackHand(HandSide.LEFT),
        rightHand: rightMotion
          ? motionToRetroHand(rightMotion)
          : fallbackHand(HandSide.RIGHT),
      };

      return {
        letter: String(step.letter ?? "?"),
        pictograph,
      };
    });

  return {
    word: sequenceData.word,
    beats,
    stepCount: beats.length,
    sequenceData,
  };
}

/**
 * Save a generated sequence to the user's library under the given name.
 * Maps the 8.3 DOS filename to a human-readable library name by replacing
 * underscores with spaces and title-casing the result.
 */
export async function saveRetroSequence(
  sequenceData: SequenceData,
  dosName: string
): Promise<SaveResult> {
  const saveService = getLibrarySaveService();

  // Turn "FIRFLOWB" into "Firflowb" as a display-friendly name.
  // The user chose the name in the DOS save dialog - keep it simple.
  const humanName = dosName
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());

  const result = await saveService.saveSequence(sequenceData, {
    name: humanName,
    displayName: dosName,
    visibility: "public",
    tags: [],
    notes: "",
    analyticsSource: "retro",
  });

  // Keep-on-first-save (SP3 Part B): the retro shell is the fifth durable save
  // path, so a guest's first save here should also raise the "create a free
  // account" prompt. The coordinator gates flag / guest / once-only itself.
  if (result.persisted) {
    postSaveActivation.onGuestSaveSucceeded(result.sequenceId);
  }
  return result;
}

/**
 * Load a sequence from the user's library by its Firestore ID.
 * Returns null when the sequence no longer exists.
 */
export async function loadRetroSequence(
  sequenceId: string
): Promise<LibrarySequence | null> {
  const repo = getLibraryRepository();
  return await repo.getSequence(sequenceId);
}
