/**
 * Letter Transition Graph for MCP Server
 *
 * Thin wrapper around the shared TransitionGraph implementation.
 * Provides the same API for backward compatibility with existing MCP code.
 */

import { TransitionGraph } from "../../vendor/sequence-engine/services/implementations/TransitionGraph.js";
import { getNodeDataProvider } from "../adapters/NodeDataProvider.js";
import type { PlacementGroup, LetterPlacementInfo } from "../../vendor/sequence-engine/domain/models/SequenceEngineTypes.js";

/**
 * Legacy wrapper class that delegates to the shared TransitionGraph.
 * Maintains backward compatibility with existing MCP code.
 */
export class LetterTransitionGraph {
  private readonly sharedGraph: TransitionGraph;
  private initialized = false;

  constructor() {
    const dataProvider = getNodeDataProvider();
    this.sharedGraph = new TransitionGraph(dataProvider);
  }

  /**
   * Returns a Promise for proper async handling.
   */
  async initializeAsync(): Promise<void> {
    if (this.initialized) return;

    await this.sharedGraph.initialize();
    this.initialized = true;
  }

  /**
   * Synchronous initialization - DEPRECATED.
   * This doesn't actually wait for the async init to complete.
   * Use initializeAsync() and await it instead.
   */
  initialize(): void {
    if (this.initialized) return;

    // Start the async initialization
    this.sharedGraph.initialize()
      .then(() => {
        this.initialized = true;
      })
      .catch((error) => {
        console.error("[MCP] Failed to initialize LetterTransitionGraph:", error);
      });

    // NOTE: This returns immediately without waiting!
    // The graph will be in an uninitialized state until the Promise resolves.
    // Callers should use initializeAsync() and await it.
  }

  canFollow(letterA: string, letterB: string): boolean {
    return this.sharedGraph.canFollow(letterA, letterB);
  }

  getValidSuccessors(letter: string): string[] {
    return this.sharedGraph.getValidSuccessors(letter);
  }

  getLetterPlacementInfo(letter: string): LetterPlacementInfo | null {
    return this.sharedGraph.getLetterPlacementInfo(letter);
  }

  getStartPlacementGroup(letter: string): PlacementGroup | null {
    return this.sharedGraph.getStartPlacementGroup(letter);
  }

  getEndPlacementGroup(letter: string): PlacementGroup | null {
    return this.sharedGraph.getEndPlacementGroup(letter);
  }

  findBridgeLetters(letterA: string, letterB: string): string[] {
    return this.sharedGraph.findBridgeLetters(letterA, letterB);
  }

  findAllBridgeOptions(letterA: string, letterB: string): string[] {
    return this.sharedGraph.findAllBridgeOptions(letterA, letterB);
  }

  isInitialized(): boolean {
    return this.initialized && this.sharedGraph.isInitialized();
  }

  getAllLetters(excludeLetters: Set<string> = new Set()): string[] {
    return this.sharedGraph.getAllLetters(excludeLetters);
  }
}

// Singleton instance
let transitionGraphInstance: LetterTransitionGraph | null = null;
let initializationPromise: Promise<void> | null = null;

/**
 * Get the singleton LetterTransitionGraph instance.
 * NOTE: The instance may not be initialized yet. Use ensureInitialized() first.
 */
export function getLetterTransitionGraph(): LetterTransitionGraph {
  if (!transitionGraphInstance) {
    transitionGraphInstance = new LetterTransitionGraph();
    // Start initialization but don't wait
    initializationPromise = transitionGraphInstance.initializeAsync();
  }
  return transitionGraphInstance;
}

/**
 * Call this at MCP server startup.
 */
export async function ensureTransitionGraphInitialized(): Promise<LetterTransitionGraph> {
  const graph = getLetterTransitionGraph();
  if (initializationPromise) {
    await initializationPromise;
  }
  return graph;
}

// Re-export types for convenience
export type { PlacementGroup, LetterPlacementInfo };
