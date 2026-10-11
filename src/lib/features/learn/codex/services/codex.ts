/**
 * Clean Codex Implementation
 *
 * A clean, maintainable implementation that uses proper separation of concerns.
 * No more hardcoded mappings or mixed responsibilities!
 */

import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import type { ILetterQueryHandler } from "#lib/shared/foundation/services/data/data-contracts.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { QuizRepoManager } from "../../quiz/services/quiz-repo-manager";
import type {
  rotateAllPictographs,
  mirrorAllPictographs,
  handSwapAllPictographs,
} from "./codex-pictograph-updater";

interface ICodexPictographUpdater {
  rotateAllPictographs: typeof rotateAllPictographs;
  mirrorAllPictographs: typeof mirrorAllPictographs;
  handSwapAllPictographs: typeof handSwapAllPictographs;
}

import type { CodexLetterMappingRepo } from "#lib/shared/learn/services/codex-letter-mapping-repo.js";

export class Codex {
  private initialized = false;

  constructor(
    private letterMappingRepo: CodexLetterMappingRepo,
    private lessonRepo: QuizRepoManager,
    private operationsService: ICodexPictographUpdater,
    private LetterQueryHandler: ILetterQueryHandler
  ) {}

  /**
   * Initialize the service and all dependencies
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize all repositories and services
      await Promise.all([
        this.letterMappingRepo.initialize(),
        this.lessonRepo.initialize(),
        // LetterQueryHandler initializes automatically when first used
      ]);

      this.initialized = true;
    } catch (error) {
      console.error("❌ Failed to initialize clean Codex:", error);
      throw error;
    }
  }

  /**
   * Load all pictographs in alphabetical order
   */
  async loadAllPictographs(): Promise<PictographData[]> {
    await this.initialize();

    const pictographs = await this.LetterQueryHandler.getAllCodexPictographs(
      GridMode.DIAMOND
    );
    const sortedPictographs = this.sortPictographsAlphabetically(pictographs);
    return sortedPictographs;
  }

  /**
   * Search pictographs by letter or pattern
   */
  async searchPictographs(searchTerm: string): Promise<PictographData[]> {
    await this.initialize();

    const pictographs = await this.LetterQueryHandler.searchPictographs(
      searchTerm,
      GridMode.DIAMOND
    );
    return this.sortPictographsAlphabetically(pictographs);
  }

  /**
   * Get a specific pictograph by letter
   */
  async getPictographByLetter(letter: string): Promise<PictographData | null> {
    await this.initialize();

    return this.LetterQueryHandler.getPictographByLetter(
      letter as Letter,
      GridMode.DIAMOND
    );
  }

  /**
   * Get all pictograph variations for a specific letter
   * Returns all 8 pictographs (all rotations and orientations) for the letter
   */
  async getAllPictographsForLetter(letter: string): Promise<PictographData[]> {
    await this.initialize();

    // Get all pictograph variations and filter by letter
    const allVariations =
      await this.LetterQueryHandler.getAllPictographVariations(
        GridMode.DIAMOND
      );
    const letterVariations = allVariations.filter((p) => p.letter === letter);

    return letterVariations;
  }

  /**
   * Get pictographs for a specific lesson type
   */
  async getPictographsForLesson(lessonType: string): Promise<PictographData[]> {
    await this.initialize();

    const letters = this.lessonRepo.getLettersForLesson(lessonType);
    if (letters.length === 0) {
      return [];
    }

    const pictographs = await this.LetterQueryHandler.getPictographsByLetters(
      letters as Letter[],
      GridMode.DIAMOND
    );
    return this.sortPictographsAlphabetically(pictographs);
  }

  /**
   * Get letters organized by rows for grid display
   */
  async getLettersByRow(): Promise<string[][]> {
    this.ensureInitialized();

    const rows = await this.letterMappingRepo.getLetterRows();
    return rows.map((row) => [...row.letters]); // Return copy to prevent mutation
  }

  /**
   * Apply rotate operation to all pictographs
   */
  async rotateAllPictographs(
    pictographs: PictographData[]
  ): Promise<PictographData[]> {
    await this.initialize();

    return this.operationsService.rotateAllPictographs(pictographs);
  }

  /**
   * Apply mirror operation to all pictographs
   */
  async mirrorAllPictographs(
    pictographs: PictographData[]
  ): Promise<PictographData[]> {
    await this.initialize();

    return this.operationsService.mirrorAllPictographs(pictographs);
  }

  /**
   * Apply hand swap operation to all pictographs
   */
  async handSwapAllPictographs(
    pictographs: PictographData[]
  ): Promise<PictographData[]> {
    await this.initialize();

    return this.operationsService.handSwapAllPictographs(pictographs);
  }

  /**
   * Get all pictograph data organized by letter
   */
  async getAllPictographData(): Promise<Record<string, PictographData | null>> {
    await this.initialize();

    const allLetters = await this.letterMappingRepo.getAllLetters();
    const result: Record<string, PictographData | null> = {};

    // Initialize all letters to null
    allLetters.forEach((letter) => {
      result[letter] = null;
    });

    // Load actual pictographs
    const pictographs = await this.loadAllPictographs();
    pictographs.forEach((pictograph) => {
      if (pictograph.letter) {
        result[pictograph.letter] = pictograph;
      }
    });

    return result;
  }

  // Additional clean helper methods

  async getAvailableQuizTypes(): Promise<string[]> {
    await this.initialize();

    return this.lessonRepo.getAllQuizTypes();
  }

  /**
   * Check if a letter is valid in the codex
   */
  isValidLetter(letter: string): boolean {
    this.ensureInitialized();

    return this.letterMappingRepo.isValidLetter(letter);
  }

  // Private helper methods

  private sortPictographsAlphabetically(
    pictographs: PictographData[]
  ): PictographData[] {
    return [...pictographs].sort((a, b) => {
      const letterA = a.letter || "";
      const letterB = b.letter || "";
      return letterA.localeCompare(letterB);
    });
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        "Codex not initialized. Methods will auto-initialize, but sync methods require prior initialization."
      );
    }
  }
}
