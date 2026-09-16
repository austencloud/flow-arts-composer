/**
 * Transition Graph Implementation
 *
 * Builds and manages a graph of valid letter transitions based on position groups.
 * Uses BFS to find shortest bridge paths between letters that can't directly follow.
 *
 * Platform-agnostic: uses ISequenceDataProvider for data loading.
 */

import type { BrowserDataProvider } from "../data/browser-data-provider";
import type {
  PlacementGroup,
  LetterPlacementInfo,
  LetterMappingsJson,
  LetterMappingData,
} from "../domain/models/sequence-engine-types";

/**
 * Transition graph for letter sequence building.
 * Manages valid transitions and finds bridge paths using BFS.
 */
export class TransitionGraph {
  private letterPositions: Map<string, LetterPlacementInfo> = new Map();
  private lettersByStartGroup: Map<PlacementGroup, string[]> = new Map();
  private lettersByEndGroup: Map<PlacementGroup, string[]> = new Map();
  private initialized = false;

  constructor(private readonly dataProvider: BrowserDataProvider) {
    // Initialize maps for each position group
    const groups: PlacementGroup[] = ["alpha", "beta", "gamma"];
    for (const group of groups) {
      this.lettersByStartGroup.set(group, []);
      this.lettersByEndGroup.set(group, []);
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const data = await this.dataProvider.loadLetterMappings();
    this.buildGraph(data);
    this.initialized = true;
  }

  private buildGraph(data: LetterMappingsJson): void {
    // Process each letter
    for (const [letterStr, mapping] of Object.entries(data.letters) as [string, LetterMappingData][]) {
      const startGroup = this.placementToGroup(mapping.startPlacement);
      const endGroup = this.placementToGroup(mapping.endPlacement);

      if (!startGroup || !endGroup) continue;

      const category = this.getCategoryForLetter(letterStr, data.categories);

      const positionInfo: LetterPlacementInfo = {
        letter: letterStr,
        startPlacementGroup: startGroup,
        endPlacementGroup: endGroup,
        category,
      };

      this.letterPositions.set(letterStr, positionInfo);
      this.lettersByStartGroup.get(startGroup)?.push(letterStr);
      this.lettersByEndGroup.get(endGroup)?.push(letterStr);
    }
  }

  private placementToGroup(position: string): PlacementGroup | null {
    if (position.startsWith("alpha")) return "alpha";
    if (position.startsWith("beta")) return "beta";
    if (position.startsWith("gamma")) return "gamma";
    return null;
  }

  private getCategoryForLetter(
    letterStr: string,
    categories: Record<string, string[]>
  ): LetterPlacementInfo["category"] {
    for (const [category, letters] of Object.entries(categories)) {
      if (letters.includes(letterStr)) {
        return category as LetterPlacementInfo["category"];
      }
    }
    return "dual-shift"; // Default
  }

  canFollow(letterA: string, letterB: string): boolean {
    const infoA = this.letterPositions.get(letterA);
    const infoB = this.letterPositions.get(letterB);

    if (!infoA || !infoB) return false;

    return infoA.endPlacementGroup === infoB.startPlacementGroup;
  }

  getValidSuccessors(letter: string): string[] {
    const info = this.letterPositions.get(letter);
    if (!info) return [];

    return this.lettersByStartGroup.get(info.endPlacementGroup) || [];
  }

  getLettersStartingAt(placementGroup: PlacementGroup): string[] {
    return this.lettersByStartGroup.get(placementGroup) || [];
  }

  getLettersEndingAt(placementGroup: PlacementGroup): string[] {
    return this.lettersByEndGroup.get(placementGroup) || [];
  }

  getLetterPlacementInfo(letter: string): LetterPlacementInfo | null {
    return this.letterPositions.get(letter) || null;
  }

  getStartPlacementGroup(letter: string): PlacementGroup | null {
    return this.letterPositions.get(letter)?.startPlacementGroup || null;
  }

  getEndPlacementGroup(letter: string): PlacementGroup | null {
    return this.letterPositions.get(letter)?.endPlacementGroup || null;
  }

  findBridgeLetters(letterA: string, letterB: string): string[] {
    // If direct transition is possible, no bridge needed
    if (this.canFollow(letterA, letterB)) {
      return [];
    }

    const infoA = this.letterPositions.get(letterA);
    const infoB = this.letterPositions.get(letterB);

    if (!infoA || !infoB) {
      return [];
    }

    // First, try to find all single-letter bridges (most common case)
    const singleBridges = this.findAllBridgeOptions(letterA, letterB);

    if (singleBridges.length > 0) {
      // Randomly select one bridge letter for variety
      const randomIndex = Math.floor(Math.random() * singleBridges.length);
      return [singleBridges[randomIndex]!];
    }

    // Fallback to BFS for multi-letter bridges (rare case)
    const startGroup = infoA.endPlacementGroup;
    const targetGroup = infoB.startPlacementGroup;

    return this.findShortestBridgePath(startGroup, targetGroup);
  }

  /**
   * BFS to find the shortest sequence of letters to get from one position group to another.
   */
  private findShortestBridgePath(
    startGroup: PlacementGroup,
    targetGroup: PlacementGroup
  ): string[] {
    if (startGroup === targetGroup) {
      return [];
    }

    // BFS queue: [current group, path of letters taken]
    const queue: [PlacementGroup, string[]][] = [[startGroup, []]];
    const visited = new Set<PlacementGroup>();
    visited.add(startGroup);

    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;

      const [currentGroup, path] = item;

      // Get all letters that start at this group
      const lettersFromHere = this.lettersByStartGroup.get(currentGroup) || [];

      for (const letter of lettersFromHere) {
        const info = this.letterPositions.get(letter);
        if (!info) continue;

        const nextGroup = info.endPlacementGroup;
        const newPath = [...path, letter];

        // Found the target!
        if (nextGroup === targetGroup) {
          return newPath;
        }

        // Continue BFS if we haven't visited this group
        if (!visited.has(nextGroup)) {
          visited.add(nextGroup);
          queue.push([nextGroup, newPath]);
        }
      }
    }

    // No path found (should not happen in TKA as all groups are connected)
    return [];
  }

  findAllBridgeOptions(letterA: string, letterB: string): string[] {
    // If direct transition is possible, no bridge needed
    if (this.canFollow(letterA, letterB)) {
      return [];
    }

    const infoA = this.letterPositions.get(letterA);
    const infoB = this.letterPositions.get(letterB);

    if (!infoA || !infoB) {
      return [];
    }

    // Find all single-letter bridges: letters that START at A's end group
    // and END at B's start group
    const startGroup = infoA.endPlacementGroup;
    const targetGroup = infoB.startPlacementGroup;

    const bridges: string[] = [];
    const lettersFromStartGroup = this.lettersByStartGroup.get(startGroup) || [];

    for (const letter of lettersFromStartGroup) {
      const info = this.letterPositions.get(letter);
      if (info?.endPlacementGroup === targetGroup) {
        bridges.push(letter);
      }
    }

    return bridges;
  }

  getAllLetters(excludeLetters: Set<string> = new Set()): string[] {
    const letters: string[] = [];
    for (const letter of this.letterPositions.keys()) {
      if (!excludeLetters.has(letter)) {
        letters.push(letter);
      }
    }
    return letters;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
