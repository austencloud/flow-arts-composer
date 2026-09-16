/**
 * Letter Transition Graph Implementation
 *
 * Wrapper around the shared TransitionGraph for browser contexts.
 * Provides Letter-typed interface for type safety.
 */

import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import { GridPlacementGroup } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { TransitionGraph } from "$lib/shared/sequence-engine/services/transition-graph";
import { BrowserDataProvider } from "$lib/shared/sequence-engine/data/browser-data-provider";
import type { ILetterQueryHandler } from "$lib/shared/foundation/services/data/data-contracts";

import type {
  LetterPlacementInfo,
  LetterCategory,
} from "../domain/models/spell-models";
import type { PlacementGroup } from "$lib/shared/sequence-engine/domain/models/sequence-engine-types";

/**
 * Browser-specific transition graph using the shared engine.
 */
export class LetterTransitionGraph {
  private sharedGraph: TransitionGraph | null = null;
  private letterQueryHandler: ILetterQueryHandler | null = null;
  private initialized = false;

  /**
   * Set the letter query handler for data loading.
   * Must be called before initialize().
   */
  setLetterQueryHandler(handler: ILetterQueryHandler): void {
    this.letterQueryHandler = handler;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (!this.letterQueryHandler) {
      throw new Error(
        "LetterQueryHandler must be set before initialization. Call setLetterQueryHandler() first."
      );
    }

    // Create browser data provider wrapping the letter query handler
    const dataProvider = new BrowserDataProvider(this.letterQueryHandler);

    this.sharedGraph = new TransitionGraph(dataProvider);
    await this.sharedGraph.initialize();
    this.initialized = true;
  }

  canFollow(letterA: Letter, letterB: Letter): boolean {
    if (!this.sharedGraph) return false;
    return this.sharedGraph.canFollow(letterA, letterB);
  }

  getValidSuccessors(letter: Letter): Letter[] {
    if (!this.sharedGraph) return [];
    return this.sharedGraph.getValidSuccessors(letter) as Letter[];
  }

  getLettersStartingAt(placementGroup: GridPlacementGroup): Letter[] {
    if (!this.sharedGraph) return [];
    const sharedGroup = this.toSharedPlacementGroup(placementGroup);
    if (!sharedGroup) return [];
    return this.sharedGraph.getLettersStartingAt(sharedGroup) as Letter[];
  }

  getLettersEndingAt(placementGroup: GridPlacementGroup): Letter[] {
    if (!this.sharedGraph) return [];
    const sharedGroup = this.toSharedPlacementGroup(placementGroup);
    if (!sharedGroup) return [];
    return this.sharedGraph.getLettersEndingAt(sharedGroup) as Letter[];
  }

  getLetterPlacementInfo(letter: Letter): LetterPlacementInfo | null {
    if (!this.sharedGraph) return null;
    const sharedInfo = this.sharedGraph.getLetterPlacementInfo(letter);
    if (!sharedInfo) return null;

    return {
      letter: sharedInfo.letter as Letter,
      startPlacementGroup: this.toGridPlacementGroup(sharedInfo.startPlacementGroup),
      endPlacementGroup: this.toGridPlacementGroup(sharedInfo.endPlacementGroup),
      category: (sharedInfo.category || "dual-shift") as LetterCategory,
    };
  }

  getStartPlacementGroup(letter: Letter): GridPlacementGroup | null {
    if (!this.sharedGraph) return null;
    const sharedGroup = this.sharedGraph.getStartPlacementGroup(letter);
    if (!sharedGroup) return null;
    return this.toGridPlacementGroup(sharedGroup);
  }

  getEndPlacementGroup(letter: Letter): GridPlacementGroup | null {
    if (!this.sharedGraph) return null;
    const sharedGroup = this.sharedGraph.getEndPlacementGroup(letter);
    if (!sharedGroup) return null;
    return this.toGridPlacementGroup(sharedGroup);
  }

  findBridgeLetters(letterA: Letter, letterB: Letter): Letter[] {
    if (!this.sharedGraph) return [];
    return this.sharedGraph.findBridgeLetters(letterA, letterB) as Letter[];
  }

  findAllBridgeOptions(letterA: Letter, letterB: Letter): Letter[] {
    if (!this.sharedGraph) return [];
    return this.sharedGraph.findAllBridgeOptions(letterA, letterB) as Letter[];
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Convert GridPlacementGroup enum to shared PlacementGroup string.
   */
  private toSharedPlacementGroup(group: GridPlacementGroup): PlacementGroup | null {
    switch (group) {
      case GridPlacementGroup.ALPHA:
        return "alpha";
      case GridPlacementGroup.BETA:
        return "beta";
      case GridPlacementGroup.GAMMA:
        return "gamma";
      default:
        return null;
    }
  }

  /**
   * Convert shared PlacementGroup string to GridPlacementGroup enum.
   */
  private toGridPlacementGroup(group: PlacementGroup): GridPlacementGroup {
    switch (group) {
      case "alpha":
        return GridPlacementGroup.ALPHA;
      case "beta":
        return GridPlacementGroup.BETA;
      case "gamma":
        return GridPlacementGroup.GAMMA;
      default:
        return GridPlacementGroup.ALPHA;
    }
  }
}

export const letterTransitionGraph = new LetterTransitionGraph();
