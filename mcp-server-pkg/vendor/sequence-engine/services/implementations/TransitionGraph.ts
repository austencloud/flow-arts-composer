/**
 * Transition Graph Implementation
 *
 * Builds and manages a graph of valid letter transitions based on placement groups.
 * Uses BFS to find shortest bridge paths between letters that can't directly follow.
 *
 * Platform-agnostic: uses ISequenceDataProvider for data loading.
 */

import type { ITransitionGraph } from "../contracts/ITransitionGraph.js";
import type { ISequenceDataProvider } from "../../data/contracts/ISequenceDataProvider.js";
import type {
  PlacementGroup,
  LetterPlacementInfo,
  LetterMappingsJson,
  LetterMappingData,
} from "../../domain/models/SequenceEngineTypes.js";

/**
 * Transition graph for letter sequence building.
 * Manages valid transitions and finds bridge paths using BFS.
 */
export class TransitionGraph implements ITransitionGraph {
  private letterPlacements: Map<string, LetterPlacementInfo> = new Map();
  private lettersByStartGroup: Map<PlacementGroup, string[]> = new Map();
  private lettersByEndGroup: Map<PlacementGroup, string[]> = new Map();
  private initialized = false;

  constructor(private readonly dataProvider: ISequenceDataProvider) {
    // Initialize maps for each placement group
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

      const placementInfo: LetterPlacementInfo = {
        letter: letterStr,
        startPlacementGroup: startGroup,
        endPlacementGroup: endGroup,
        category,
      };

      this.letterPlacements.set(letterStr, placementInfo);
      this.lettersByStartGroup.get(startGroup)?.push(letterStr);
      this.lettersByEndGroup.get(endGroup)?.push(letterStr);
    }
  }

  private placementToGroup(placement: string): PlacementGroup | null {
    if (placement.startsWith("alpha")) return "alpha";
    if (placement.startsWith("beta")) return "beta";
    if (placement.startsWith("gamma")) return "gamma";
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
    const infoA = this.letterPlacements.get(letterA);
    const infoB = this.letterPlacements.get(letterB);

    if (!infoA || !infoB) return false;

    return infoA.endPlacementGroup === infoB.startPlacementGroup;
  }

  getValidSuccessors(letter: string): string[] {
    const info = this.letterPlacements.get(letter);
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
    return this.letterPlacements.get(letter) || null;
  }

  getStartPlacementGroup(letter: string): PlacementGroup | null {
    return this.letterPlacements.get(letter)?.startPlacementGroup || null;
  }

  getEndPlacementGroup(letter: string): PlacementGroup | null {
    return this.letterPlacements.get(letter)?.endPlacementGroup || null;
  }

  findBridgeLetters(letterA: string, letterB: string): string[] {
    // If direct transition is possible, no bridge needed
    if (this.canFollow(letterA, letterB)) {
      return [];
    }

    const infoA = this.letterPlacements.get(letterA);
    const infoB = this.letterPlacements.get(letterB);

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
        const info = this.letterPlacements.get(letter);
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

    const infoA = this.letterPlacements.get(letterA);
    const infoB = this.letterPlacements.get(letterB);

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
      const info = this.letterPlacements.get(letter);
      if (info && info.endPlacementGroup === targetGroup) {
        bridges.push(letter);
      }
    }

    return bridges;
  }

  getAllLetters(excludeLetters: Set<string> = new Set()): string[] {
    const letters: string[] = [];
    for (const letter of this.letterPlacements.keys()) {
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
