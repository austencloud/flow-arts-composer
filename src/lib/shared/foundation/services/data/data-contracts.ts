/**
 * Data Service Interfaces
 *
 * Service contracts for data handling, CSV parsing, and query operations.
 */

import type { PictographData } from "../../../pictograph/shared/domain/models/pictograph-data";
import type { MotionData } from "../../../pictograph/shared/domain/models/motion-data";
import type { GridMode } from "../../../pictograph/grid/domain/enums/grid-enums";
import type { Letter } from "../../domain/models/letter";
import type { CodexLetterMappingRepo } from "#lib/shared/learn/services/codex-letter-mapping-repo.js";

// CSV data models have been moved to domain/models/core/csv-handling/CsvModels.ts
// Import them from $domain instead

// SERVICE CONTRACTS (Behavioral Interfaces)

export interface ILetterQueryHandler {
  /**
   * Get all codex pictographs for a grid mode
   */
  getAllCodexPictographs(gridMode: GridMode): Promise<PictographData[]>;

  /**
   * Search pictographs by term and grid mode
   */
  searchPictographs(
    searchTerm: string,
    gridMode: GridMode
  ): Promise<PictographData[]>;

  /**
   * Get pictograph by letter and grid mode
   */
  getPictographByLetter(
    letter: Letter,
    gridMode: GridMode
  ): Promise<PictographData | null>;

  /**
   * Get pictographs for multiple letters
   */
  getPictographsByLetters(
    letters: Letter[],
    gridMode: GridMode
  ): Promise<PictographData[]>;

  /**
   * Get ALL pictograph variations from CSV data (not limited by letter mappings)
   * This returns every row in the CSV as a separate pictograph, including multiple variations per letter
   */
  getAllPictographVariations(gridMode: GridMode): Promise<PictographData[]>;

  /**
   * Set the letter mapping repository after construction.
   * Needed when the repo is created in a different container (learn module).
   */
  setLetterMappingRepo?(repo: CodexLetterMappingRepo): void;
}

export interface IMotionQueryHandler {
  /**
   * Query motions based on criteria
   */
  queryMotions(criteria: Record<string, unknown>): Promise<PictographData[]>;

  /**
   * Get motion data by ID
   */
  getMotionById(motionId: string): Promise<PictographData | null>;

  /**
   * Search motions by pattern
   */
  searchMotions(pattern: string): Promise<PictographData[]>;

  /**
   * Get next options for sequence building
   */
  getNextOptionsForSequence(
    sequence: unknown[],
    gridMode: GridMode
  ): Promise<PictographData[]>;

  /**
   * Find letter by motion configuration
   * Used when reversing sequences to find the correct letter for the reversed motion
   */
  findLetterByMotionConfiguration(
    leftMotion: MotionData,
    rightMotion: MotionData,
    gridMode: GridMode
  ): Promise<string | null>;
}
