/**
 * Sequence Persistence Service Implementation
 *
 * Manages sequence state persistence that survives hot module replacement.
 * Uses the shared persistence service to store and restore sequence state.
 *
 * Each creation mode (Constructor, Generator, Assembler) has its own workspace
 * with independent localStorage persistence.
 */

import { getErrorHandler } from "$lib/shared/application/get-error-handler";
import {
  initialize as persistenceInitialize,
  saveCurrentSequenceState,
  loadCurrentSequenceState,
  clearCurrentSequenceState,
} from "$lib/shared/persistence/services/dexie-persistence-service";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { ActiveCreateModule } from "$lib/shared/foundation/ui/ui-types";
import { navigationState } from "$lib/shared/navigation/state/navigation-state.svelte";
import type { ErrorHandler } from '$lib/shared/application/services/error-handler'

export class SequencePersister {
  /**
   * Get the current active mode from navigation state
   * Dynamically imported to avoid circular dependencies
   */
  private async getCurrentMode(): Promise<string> {
    try {
      return navigationState.currentSection || "construct";
    } catch (error) {
      console.warn(
        "⚠️ Failed to get current mode, defaulting to construct:",
        error
      );
      return "construct";
    }
  }

  async initialize(): Promise<void> {
    try {
      await persistenceInitialize();
    } catch (error) {
      console.error("❌ SequencePersister: Failed to initialize:", error);
      throw error;
    }
  }

  async saveCurrentState(state: {
    currentSequence: SequenceData | null;
    selectedStartPlacement: StartPlacementData | null;
    hasStartPlacement: boolean;
    activeBuildSection: ActiveCreateModule;
  }): Promise<void> {
    try {
      await saveCurrentSequenceState(state);
    } catch (error) {
      console.error(
        "❌ SequencePersister: Failed to save current state:",
        error
      );
      const errorHandler = getErrorHandler() as ErrorHandler;
      errorHandler.showUserError({
        message: "Couldn't save your sequence",
        technicalDetails: error instanceof Error ? error.message : String(error),
        error: error instanceof Error ? error : new Error(String(error)),
        severity: "error",
        context: {
          module: "create",
          action: "save-sequence",
        },
      });
      throw error;
    }
  }

  async loadCurrentState(mode?: string): Promise<{
    currentSequence: SequenceData | null;
    selectedStartPlacement: StartPlacementData | null;
    hasStartPlacement: boolean;
    activeBuildSection: ActiveCreateModule;
  } | null> {
    try {
      const targetMode = mode ?? (await this.getCurrentMode());

      const state = await loadCurrentSequenceState(targetMode);
      if (state) {
        const activeBuildSection = isActiveCreateModule(
          state.activeBuildSection
        )
          ? state.activeBuildSection
          : (targetMode as ActiveCreateModule);

        return {
          currentSequence: state.currentSequence,
          selectedStartPlacement: state.selectedStartPlacement,
          hasStartPlacement: state.hasStartPlacement,
          activeBuildSection,
        };
      }
      return null;
    } catch (error) {
      console.error(
        "❌ SequencePersister: Failed to load current state:",
        error
      );
      const errorHandler = getErrorHandler() as ErrorHandler;
      errorHandler.showUserError({
        message: "Couldn't load your sequence",
        technicalDetails: error instanceof Error ? error.message : String(error),
        error: error instanceof Error ? error : new Error(String(error)),
        severity: "error",
        context: {
          module: "create",
          action: "load-sequence",
        },
      });
      return null;
    }
  }

  async clearCurrentState(mode?: string): Promise<void> {
    try {
      await clearCurrentSequenceState(mode);
    } catch (error) {
      console.error(
        "❌ SequencePersister: Failed to clear current state:",
        error
      );
      throw error;
    }
  }

  async hasSavedState(mode?: string): Promise<boolean> {
    try {
      const targetMode = mode ?? (await this.getCurrentMode());
      const state = await loadCurrentSequenceState(targetMode);
      return state !== null;
    } catch (error) {
      console.error(
        "❌ SequencePersister: Failed to check for saved state:",
        error
      );
      return false;
    }
  }

  async getLastSaveTimestamp(mode?: string): Promise<number | null> {
    try {
      const targetMode = mode ?? (await this.getCurrentMode());
      const state = await loadCurrentSequenceState(targetMode);
      if (state && "timestamp" in state) {
        const stateWithTimestamp = state as Record<string, unknown>;
        const timestamp = stateWithTimestamp["timestamp"];
        return typeof timestamp === "number" ? timestamp : null;
      }
      return null;
    } catch (error) {
      console.error(
        "❌ SequencePersister: Failed to get last save timestamp:",
        error
      );
      return null;
    }
  }
}

function isActiveCreateModule(value: unknown): value is ActiveCreateModule {
  return (
    typeof value === "string" &&
    (value === "construct" ||
      value === "generate" ||
      value === "assemble" ||
      value === "spell")
  );
}

export const sequencePersister = new SequencePersister();
