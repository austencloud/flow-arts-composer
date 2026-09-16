/**
 * Transition Graph Interface
 *
 * Manages valid letter transitions based on placement groups.
 * A letter can follow another if its start placement group matches
 * the previous letter's end placement group.
 */

import type {
  PlacementGroup,
  LetterPlacementInfo,
} from "../types/sequence-engine-types.js";

/**
 * Interface for letter transition graph operations.
 */
export interface ITransitionGraph {
  /**
   * Must be called before using other methods.
   */
  initialize(): Promise<void>;

  /**
   * True if letterB's start placement group equals letterA's end placement group.
   */
  canFollow(letterA: string, letterB: string): boolean;

  /**
   * Get all letters that can directly follow the given letter.
   */
  getValidSuccessors(letter: string): string[];

  getLettersStartingAt(placementGroup: PlacementGroup): string[];

  getLettersEndingAt(placementGroup: PlacementGroup): string[];

  getLetterPlacementInfo(letter: string): LetterPlacementInfo | null;

  getStartPlacementGroup(letter: string): PlacementGroup | null;

  getEndPlacementGroup(letter: string): PlacementGroup | null;

  /**
   * Find bridge letters to connect letterA to letterB when they can't directly follow.
   * Uses BFS to find the shortest path.
   * @returns Array of bridge letters (empty if direct transition is possible)
   */
  findBridgeLetters(letterA: string, letterB: string): string[];

  /**
   * Find ALL valid single-letter bridges between two letters.
   * Returns all letters that can connect letterA's end to letterB's start in one step.
   * @returns Array of possible bridge letters (empty if direct transition or no single-letter bridge)
   */
  findAllBridgeOptions(letterA: string, letterB: string): string[];

  /**
   * Get all letters in the graph.
   * @param excludeLetters - Optional set of letters to exclude
   */
  getAllLetters(excludeLetters?: Set<string>): string[];

  isInitialized(): boolean;
}
