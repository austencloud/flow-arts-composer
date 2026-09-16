/**
 * Sequence Transform Operations
 *
 * Handles sequence-level transformations:
 * - Mirror sequence
 * - Swap hands
 * - Rotate sequence
 * - Duplicate sequence
 * - Set start placement
 * - Validation
 *
 * RESPONSIBILITY: Transform operations coordinator, orchestrates state + services
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { updateSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import type { SequenceStatsCalculator } from "$lib/features/create/shared/services/sequence-stats-calculator";
import type { SequenceTransformer } from "$lib/features/create/shared/services/sequence-transforms/sequence-transformer";
import type { SequenceValidator } from "$lib/features/create/shared/services/sequence-validator";
import type { SequenceCoreState } from "../core/sequence-core-state.svelte";
import type { SequenceSelectionState } from "../selection/sequence-selection-state.svelte";
import type { ValidationResult } from "$lib/shared/validation/validation-result";
import type { TargetHand } from "../panel-coordination-state.svelte";

export interface TransformOperationsConfig {
  coreState: SequenceCoreState;
  selectionState: SequenceSelectionState;
  sequenceStatisticsService?: SequenceStatsCalculator | null;
  SequenceTransformer?: SequenceTransformer | null;
  sequenceValidationService?: SequenceValidator | null;
  onError?: (error: string) => void;
  onSave?: () => Promise<void>;
}

export function createSequenceTransformOperations(
  config: TransformOperationsConfig
) {
  const {
    coreState,
    selectionState,
    sequenceStatisticsService,
    SequenceTransformer,
    sequenceValidationService,
    onError,
    onSave,
  } = config;

  function handleError(message: string, error?: unknown) {
    const errorMsg = error instanceof Error ? error.message : message;
    coreState.setError(errorMsg);
    onError?.(errorMsg);
    console.error(message, error);
  }

  return {
    setStartPlacement(startPlacement: StartPlacementData | null) {
      if (!coreState.currentSequence) return;

      try {
        if (startPlacement === null) {
          // Clear start placement
          const updatedSequence = updateSequenceData(
            coreState.currentSequence,
            {
              startPlacement: undefined,
              startingPlacement: undefined,
            }
          );
          coreState.setCurrentSequence(updatedSequence);
          selectionState.setStartPlacement(null);
        } else {
          // Update sequence with start placement - set both fields for compatibility
          const updatedSequence = updateSequenceData(
            coreState.currentSequence,
            {
              startPlacement: startPlacement,
              startingPlacement: startPlacement, // CRITICAL: Set both fields for compatibility
            }
          );
          coreState.setCurrentSequence(updatedSequence);
          selectionState.setStartPlacement(startPlacement);
        }
        coreState.clearError();
      } catch (error) {
        handleError("Failed to set start placement", error);
      }
    },

    async mirrorSequence(targetHand: TargetHand = "both") {
      if (!coreState.currentSequence || !SequenceTransformer) {
        return;
      }

      try {
        // Phase 1: Transform motions (synchronous for single-hand, keeps existing letters)
        const transformedSequence = await SequenceTransformer.mirrorSequence(
          coreState.currentSequence,
          targetHand
        );

        // Update state immediately - animation starts here
        coreState.setCurrentSequence(transformedSequence);
        if (transformedSequence.startPlacement) {
          selectionState.setStartPlacement(transformedSequence.startPlacement);
        }
        coreState.clearError();

        // Phase 2: Derive correct letters asynchronously (only for single-hand transforms)
        if (targetHand !== "both") {
          // Use requestAnimationFrame to ensure animation has started before deriving letters
          requestAnimationFrame(async () => {
            try {
              const withLetters =
                await SequenceTransformer.deriveSequenceLetters(
                  transformedSequence
                );
              coreState.setCurrentSequence(withLetters);
              await onSave?.();
            } catch (letterError) {
              console.warn(
                "Failed to derive letters after mirror:",
                letterError
              );
              // Still save the transformed sequence even if letter derivation fails
              await onSave?.();
            }
          });
        } else {
          // For "both" mode, letters are already correct - just save
          await onSave?.();
        }
      } catch (error) {
        console.error("❌ Mirror error:", error);
        handleError("Failed to mirror sequence", error);
      }
    },

    async swapHands() {
      if (!coreState.currentSequence || !SequenceTransformer) return;

      try {
        const updatedSequence = SequenceTransformer.swapHands(
          coreState.currentSequence
        );
        coreState.setCurrentSequence(updatedSequence);

        // Update selection state with transformed start placement so UI re-renders
        if (updatedSequence.startPlacement) {
          selectionState.setStartPlacement(updatedSequence.startPlacement);
        }

        coreState.clearError();

        // Persist the transformed sequence
        await onSave?.();
      } catch (error) {
        handleError("Failed to swap hands", error);
      }
    },

    async rotateSequence(
      direction: "clockwise" | "counterclockwise",
      targetHand: TargetHand = "both",
      rotationSteps = 1
    ) {
      if (!coreState.currentSequence || !SequenceTransformer) return;

      try {
        if (!Number.isInteger(rotationSteps) || rotationSteps < 1) {
          throw new Error("Rotation steps must be a positive integer");
        }

        const rotationAmount =
          (direction === "clockwise" ? 1 : -1) * rotationSteps;

        // Phase 1: Transform motions (synchronous for single-hand, keeps existing letters)
        const transformedSequence = await SequenceTransformer.rotateSequence(
          coreState.currentSequence,
          rotationAmount,
          targetHand
        );

        // Update state immediately - animation starts here
        coreState.setCurrentSequence(transformedSequence);
        if (transformedSequence.startPlacement) {
          selectionState.setStartPlacement(transformedSequence.startPlacement);
        }
        coreState.clearError();

        // Let the geometry paint before resolving the new letters. Awaiting the
        // scheduled work keeps a direct multi-increment move inside one pending
        // action instead of letting another transform race its letter lookup.
        if (targetHand !== "both") {
          await new Promise<void>((resolve) => {
            requestAnimationFrame(async () => {
              try {
                const withLetters =
                  await SequenceTransformer.deriveSequenceLetters(
                    transformedSequence
                  );
                coreState.setCurrentSequence(withLetters);
                await onSave?.();
              } catch (letterError) {
                console.warn(
                  "Failed to derive letters after rotate:",
                  letterError
                );
                await onSave?.();
              } finally {
                resolve();
              }
            });
          });
        } else {
          await onSave?.();
        }
      } catch (error) {
        handleError("Failed to rotate sequence", error);
      }
    },

    duplicateSequence(newName?: string): SequenceData | null {
      if (!coreState.currentSequence || !SequenceTransformer) return null;

      try {
        const duplicated = SequenceTransformer.duplicateSequence(
          coreState.currentSequence,
          newName
        );
        coreState.clearError();
        return duplicated;
      } catch (error) {
        handleError("Failed to duplicate sequence", error);
        return null;
      }
    },

    async rewindSequence(targetHand: TargetHand = "both") {
      if (!coreState.currentSequence || !SequenceTransformer) return;

      try {
        // Phase 1: Transform motions (synchronous for single-hand, keeps existing letters)
        const transformedSequence = await SequenceTransformer.rewindSequence(
          coreState.currentSequence,
          targetHand
        );

        // Update state immediately - animation starts here
        coreState.setCurrentSequence(transformedSequence);
        if (transformedSequence.startPlacement) {
          selectionState.setStartPlacement(transformedSequence.startPlacement);
        }
        coreState.clearError();

        // Phase 2: Derive correct letters asynchronously (only for single-hand transforms)
        if (targetHand !== "both") {
          requestAnimationFrame(async () => {
            try {
              const withLetters =
                await SequenceTransformer.deriveSequenceLetters(
                  transformedSequence
                );
              coreState.setCurrentSequence(withLetters);
              await onSave?.();
            } catch (letterError) {
              console.warn(
                "Failed to derive letters after rewind:",
                letterError
              );
              await onSave?.();
            }
          });
        } else {
          await onSave?.();
        }
      } catch (error) {
        handleError("Failed to rewind sequence", error);
      }
    },

    async shiftStartPlacement(targetStepNumber: number) {
      if (!coreState.currentSequence || !SequenceTransformer) return;

      try {
        const shiftedSequence = SequenceTransformer.shiftStartPlacement(
          coreState.currentSequence,
          targetStepNumber
        );
        coreState.setCurrentSequence(shiftedSequence);

        // Update selection state with new start placement so UI re-renders
        if (shiftedSequence.startPlacement) {
          selectionState.setStartPlacement(shiftedSequence.startPlacement);
        }

        coreState.clearError();

        // Persist the transformed sequence
        await onSave?.();
      } catch (error) {
        handleError("Failed to shift start placement", error);
      }
    },

    async flipSequence(targetHand: TargetHand = "both") {
      if (!coreState.currentSequence || !SequenceTransformer) return;

      try {
        // Phase 1: Transform motions (synchronous for single-hand, keeps existing letters)
        const transformedSequence = await SequenceTransformer.flipSequence(
          coreState.currentSequence,
          targetHand
        );

        // Update state immediately - animation starts here
        coreState.setCurrentSequence(transformedSequence);
        if (transformedSequence.startPlacement) {
          selectionState.setStartPlacement(transformedSequence.startPlacement);
        }
        coreState.clearError();

        // Phase 2: Derive correct letters asynchronously (only for single-hand transforms)
        if (targetHand !== "both") {
          requestAnimationFrame(async () => {
            try {
              const withLetters =
                await SequenceTransformer.deriveSequenceLetters(
                  transformedSequence
                );
              coreState.setCurrentSequence(withLetters);
              await onSave?.();
            } catch (letterError) {
              console.warn("Failed to derive letters after flip:", letterError);
              await onSave?.();
            }
          });
        } else {
          await onSave?.();
        }
      } catch (error) {
        console.error("❌ Flip error:", error);
        handleError("Failed to flip sequence", error);
      }
    },

    async invertSequence(targetHand: TargetHand = "both") {
      if (!coreState.currentSequence || !SequenceTransformer) return;

      try {
        // Phase 1: Transform motions (synchronous for single-hand, keeps existing letters)
        const transformedSequence = await SequenceTransformer.invertSequence(
          coreState.currentSequence,
          targetHand
        );

        // Update state immediately - animation starts here
        coreState.setCurrentSequence(transformedSequence);
        if (transformedSequence.startPlacement) {
          selectionState.setStartPlacement(transformedSequence.startPlacement);
        }
        coreState.clearError();

        // Phase 2: Derive correct letters asynchronously (only for single-hand transforms)
        if (targetHand !== "both") {
          requestAnimationFrame(async () => {
            try {
              const withLetters =
                await SequenceTransformer.deriveSequenceLetters(
                  transformedSequence
                );
              coreState.setCurrentSequence(withLetters);
              await onSave?.();
            } catch (letterError) {
              console.warn(
                "Failed to derive letters after invert:",
                letterError
              );
              await onSave?.();
            }
          });
        } else {
          await onSave?.();
        }
      } catch (error) {
        console.error("❌ Invert error:", error);
        handleError("Failed to invert sequence", error);
      }
    },

    validateSequence(): ValidationResult | null {
      if (!coreState.currentSequence || !sequenceValidationService) return null;
      return sequenceValidationService.validateSequence(
        coreState.currentSequence
      );
    },

    getSequenceStatistics() {
      if (!coreState.currentSequence || !sequenceStatisticsService) return null;
      return sequenceStatisticsService.getSequenceStatistics(
        coreState.currentSequence
      );
    },

    generateSequenceWord(): string {
      if (!coreState.currentSequence || !sequenceStatisticsService) {
        return "";
      }
      return sequenceStatisticsService.generateSequenceWord(
        coreState.currentSequence
      );
    },

    calculateSequenceDuration(): number {
      if (!coreState.currentSequence || !sequenceStatisticsService) return 0;
      return sequenceStatisticsService.calculateSequenceDuration(
        coreState.currentSequence
      );
    },
  };
}

export type SequenceTransformOperations = ReturnType<
  typeof createSequenceTransformOperations
>;
