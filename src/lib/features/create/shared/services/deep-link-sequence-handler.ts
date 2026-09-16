/**
 * Deep Link Sequence Service Implementation
 *
 * Handles loading sequences from deep links and pending edits.
 * Encapsulates the complex sequence enrichment logic that was
 * previously in CreateModule.svelte onMount (80+ lines).
 *
 * Domain: Create module - Sequence Loading
 */

import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";

/**
 * Deep Link Sequence Service Contract
 */
export interface DeepLinkLoadResult {
  /** Whether a sequence was loaded */
  loaded: boolean;
  /** The tab to navigate to (if specified in deep link) */
  targetTab?: string;
  /** Source of the loaded sequence */
  source?: "deepLink" | "pendingEdit";
}
import type { DeepLinker } from "$lib/shared/navigation/services/deep-linker";
import { deriveLettersForSequence } from "$lib/shared/navigation/services/letter-deriver";
import { derivePositionsForSequence } from "$lib/shared/navigation/services/position-deriver";

const PENDING_EDIT_KEY = "tka-pending-edit-sequence";

/**
 * Session-level flag indicating a pending edit was processed this session.
 * This survives localStorage clearing and prevents persistence restoration
 * from overwriting the loaded sequence.
 */
let pendingEditProcessedThisSession = false;

export class DeepLinkSequenceHandler {
  constructor(private deepLinkService: DeepLinker | null) {}

  hasDeepLink(): boolean {
    return this.deepLinkService?.hasDataForModule("create") ?? false;
  }

  hasPendingEdit(): boolean {
    try {
      return localStorage.getItem(PENDING_EDIT_KEY) !== null;
    } catch {
      return false;
    }
  }

  /**
   * Check if a pending edit was processed this session.
   * This flag survives localStorage clearing and can be used by persistence
   * restoration code to avoid overwriting the loaded sequence.
   */
  wasPendingEditProcessedThisSession(): boolean {
    return pendingEditProcessedThisSession;
  }

  async loadFromDeepLink(
    setSequence: (sequence: SequenceData) => void
  ): Promise<DeepLinkLoadResult> {
    const deepLinkData = this.deepLinkService?.consumeData("create");

    if (!deepLinkData) {
      return { loaded: false };
    }

    try {
      // Set sequence immediately (placements/letters enriched async)
      setSequence(deepLinkData.sequence);

      // Enrich sequence with derived data in background
      this.enrichSequenceAsync(deepLinkData.sequence, setSequence);

      // Clear the deep link from URL now that we've consumed it
      this.deepLinkService?.clearDeepLinkFromURL();

      return {
        loaded: true,
        source: "deepLink",
        targetTab: deepLinkData.tabId,
      };
    } catch (err) {
      console.error("Failed to load deep link sequence:", err);
      return { loaded: false };
    }
  }

  async loadFromPendingEdit(
    setSequence: (sequence: SequenceData) => void
  ): Promise<DeepLinkLoadResult> {
    try {
      const pendingData = localStorage.getItem(PENDING_EDIT_KEY);
      if (!pendingData) {
        return { loaded: false };
      }

      const rawData = JSON.parse(pendingData);
      const sequence = createSequenceData(rawData);
      setSequence(sequence);

      // Enrich sequence with derived placements/letters in background
      // This is critical for imported sequences from Browse which have null placements
      this.enrichSequenceAsync(sequence, setSequence);

      // Set session flag BEFORE clearing localStorage
      // This flag survives localStorage clearing and prevents persistence restoration
      // from overwriting the loaded sequence
      pendingEditProcessedThisSession = true;

      this.clearPendingEdit();

      return {
        loaded: true,
        source: "pendingEdit",
      };
    } catch (err) {
      console.error("Failed to load pending edit sequence:", err);
      this.clearPendingEdit(); // Clear invalid data
      return { loaded: false };
    }
  }

  async loadFromAnySource(
    setSequence: (sequence: SequenceData) => void
  ): Promise<DeepLinkLoadResult> {
    // Deep link takes priority
    if (this.hasDeepLink()) {
      return this.loadFromDeepLink(setSequence);
    }

    // Fall back to pending edit
    if (this.hasPendingEdit()) {
      return this.loadFromPendingEdit(setSequence);
    }

    return { loaded: false };
  }

  clearPendingEdit(): void {
    try {
      localStorage.removeItem(PENDING_EDIT_KEY);
    } catch {
      // Ignore localStorage errors
    }
  }

  /**
   * Enrich sequence with derived placements and letters asynchronously.
   * This is the complex merging logic extracted from CreateModule.svelte.
   */
  private enrichSequenceAsync(
    sequence: SequenceData,
    setSequence: (sequence: SequenceData) => void
  ): void {
    Promise.all([
      derivePositionsForSequence(sequence),
      deriveLettersForSequence(sequence),
    ])
      .then(([sequenceWithPlacements, sequenceWithLetters]) => {
        const enrichedSequence = this.mergeEnrichedSequence(
          sequenceWithPlacements,
          sequenceWithLetters
        );
        setSequence(enrichedSequence);
      })
      .catch((err) => {
        console.warn("Placement/letter derivation failed:", err);
        // Original sequence already loaded, no action needed
      });
  }

  /**
   * Merge placement-enriched and letter-enriched sequences.
   * Letters take precedence but preserve placements from placement derivation.
   */
  private mergeEnrichedSequence(
    sequenceWithPlacements: SequenceData,
    sequenceWithLetters: SequenceData
  ): SequenceData {
    return {
      ...sequenceWithLetters,
      steps: sequenceWithLetters.steps.map((step, index) => ({
        ...step,
        startPlacement:
          step.startPlacement ??
          sequenceWithPlacements.steps[index]?.startPlacement,
        endPlacement:
          step.endPlacement ?? sequenceWithPlacements.steps[index]?.endPlacement,
      })),
      startPlacement: sequenceWithLetters.startPlacement
        ? {
            ...sequenceWithLetters.startPlacement,
            startPlacement:
              sequenceWithLetters.startPlacement.startPlacement ??
              sequenceWithPlacements.startPlacement?.startPlacement,
            endPlacement:
              sequenceWithLetters.startPlacement.endPlacement ??
              sequenceWithPlacements.startPlacement?.endPlacement,
          }
        : sequenceWithPlacements.startPlacement,
      startingPlacement: sequenceWithLetters.startingPlacement
        ? {
            ...sequenceWithLetters.startingPlacement,
            startPlacement:
              sequenceWithLetters.startingPlacement.startPlacement ??
              sequenceWithPlacements.startingPlacement?.startPlacement,
            endPlacement:
              sequenceWithLetters.startingPlacement.endPlacement ??
              sequenceWithPlacements.startingPlacement?.endPlacement,
          }
        : sequenceWithPlacements.startingPlacement,
      // Add timestamp to ensure reactivity
      metadata: {
        ...sequenceWithLetters.metadata,
        _enrichedAt: Date.now(),
      },
    } as SequenceData;
  }
}

// Dependencies are optional - pass null since they come from navigation layer
export const deepLinkSequenceHandler = new DeepLinkSequenceHandler(null);
