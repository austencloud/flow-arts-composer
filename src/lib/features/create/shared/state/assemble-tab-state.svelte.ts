/**
 * Assemble Tab State
 *
 * Manages the Assemble tab's integration into the Create module.
 * Owns an isolated SequenceState and builder state (from assemble-lab).
 *
 * Assemble owns document-level command history because builder path edits must
 * restore both hands and their start poses together.
 *
 * Builder mutations update the editable sequence document directly. Sequence
 * editor mutations hydrate the builder through the same state boundary.
 */

import type { SequenceRepository } from "$lib/shared/create/services/sequence-repository";
import type { SequencePersister } from "$lib/features/create/shared/services/sequence-persister";
import type { SequenceStatsCalculator } from "$lib/features/create/shared/services/sequence-stats-calculator";
import type { SequenceTransformer } from "$lib/features/create/shared/services/sequence-transforms/sequence-transformer";
import type { SequenceValidator } from "$lib/features/create/shared/services/sequence-validator";
import {
  reversalDetector,
  type ReversalDetector,
} from "$lib/shared/create/services/reversal-detector";
import { createSequenceState } from "./sequence-state-orchestrator.svelte";
import type { SequenceState } from "./sequence-state-orchestrator.svelte";
import { createAssembleState } from "$lib/features/assemble-lab/state/assemble-state.svelte";
import type {
  AssembleDocumentChange,
  AssembleState,
  BuilderPhase,
} from "$lib/features/assemble-lab/state/assemble-state.svelte";
import {
  stepToMotion,
  convertToStartPlacement,
  convertToPictographs,
  lookupLetter,
  sequenceToBuilderHydration,
  withCalculatedArrowLocations,
} from "$lib/features/assemble-lab/services/builder-step-converter";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { createStartPlacementData } from "$lib/shared/create/factories/create-start-placement-data";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { getPropUnlockManager } from "$lib/shared/gamification/get-prop-unlock-manager";
import { generateSequenceWord } from "$lib/features/create/shared/services/sequence-stats-calculator";
import { createHistoryTransitionPlan } from "$lib/features/create/shared/services/history-transition-planner";

export function createAssembleTabState(
  sequenceService?: SequenceRepository,
  sequencePersister?: SequencePersister,
  sequenceStatisticsService?: SequenceStatsCalculator,
  sequenceTransformer?: SequenceTransformer,
  sequenceValidationService?: SequenceValidator
) {
  // Tab-specific state
  let isInitialized = $state(false);
  let error = $state<string | null>(null);

  let sequenceState: SequenceState | null = null;
  let isApplyingBuilderChange = false;
  let isDestroyed = false;
  let lastSynchronizedDocument: SequenceData | null = null;
  const letterCache = new Map<string, Letter | null>();

  // The builder reports document changes at the mutation boundary. This keeps
  // sequence edits and builder edits out of competing reactive effects.
  const builderState: AssembleState = createAssembleState({
    onDocumentChange: syncBuilderToSequence,
    captureDocument: () => sequenceState?.currentSequence ?? null,
    restoreDocument: restoreBuilderDocument,
    onHistoryTransition: (direction, label, from, to) => {
      if (!sequenceState) return;
      sequenceState.animationState.startHistoryTransition(
        createHistoryTransitionPlan({
          direction,
          operation: `assemble:${label}`,
          label,
          fromSequence: (from.document as SequenceData | null) ?? null,
          toSequence: (to.document as SequenceData | null) ?? null,
          fromSelectedStepNumber:
            from.selectedStepIndex === null ? null : from.selectedStepIndex + 1,
          toSelectedStepNumber:
            to.selectedStepIndex === null ? null : to.selectedStepIndex + 1,
        })
      );
    },
  });

  // Isolated editable sequence document for this tab.
  const ReversalDetector: ReversalDetector | undefined = reversalDetector;
  sequenceState = sequenceService
    ? createSequenceState({
        sequenceService,
        ...(sequencePersister && { SequencePersister: sequencePersister }),
        ...(sequenceStatisticsService && { sequenceStatisticsService }),
        ...(sequenceTransformer && {
          SequenceTransformer: sequenceTransformer,
        }),
        ...(sequenceValidationService && { sequenceValidationService }),
        ...(ReversalDetector && { ReversalDetector }),
        tabId: "assemble",
        onCurrentSequenceChange: syncSequenceToBuilder,
      })
    : null;

  function sameMotionCore(left: MotionData, right: MotionData): boolean {
    return (
      left.isVisible === right.isVisible &&
      left.motionType === right.motionType &&
      left.startLocation === right.startLocation &&
      left.endLocation === right.endLocation &&
      left.rotationDirection === right.rotationDirection &&
      left.turns === right.turns &&
      left.startOrientation === right.startOrientation &&
      left.endOrientation === right.endOrientation &&
      left.handPath === right.handPath &&
      left.gridMode === right.gridMode
    );
  }

  function mergeBuilderMotion(
    generated: MotionData,
    existing: MotionData | undefined
  ): MotionData {
    if (!existing) return generated;
    if (sameMotionCore(existing, generated)) return existing;

    return {
      ...existing,
      ...generated,
      propType: existing.propType,
      arrowPlacementData: existing.arrowPlacementData,
      propPlacementData: existing.propPlacementData,
      pathShape: existing.pathShape,
      plane: existing.plane,
    };
  }

  function mergeBuilderStep(
    generated: StepData,
    existing: StepData | undefined,
    index: number
  ): StepData {
    if (!existing) return generated;

    const left = mergeBuilderMotion(
      generated.motions.left,
      existing.motions.left
    );
    const right = mergeBuilderMotion(generated.motions.right, existing.motions.right);

    return {
      ...generated,
      ...existing,
      stepNumber: index + 1,
      gridMode: builderState.gridMode,
      motions: { left, right },
    };
  }

  function syncBuilderToSequence(change?: AssembleDocumentChange): void {
    if (!sequenceState || isApplyingBuilderChange || isDestroyed) return;

    const leftSteps = builderState.leftSteps;
    const rightSteps = builderState.rightSteps;
    const gridMode = builderState.gridMode;
    const startPicto = convertToStartPlacement(
      builderState.startPoses,
      leftSteps,
      rightSteps,
      gridMode
    );
    const current = sequenceState.currentSequence;
    const metadataSteps = remapMetadataSteps(current?.steps ?? [], change);
    const generatedSteps = convertToPictographs(
      leftSteps,
      rightSteps,
      gridMode
    ).map((pictograph, index) => {
      const letter = metadataSteps[index]?.letter ?? null;
      return createStepData({
        ...withCalculatedArrowLocations({ ...pictograph, letter }),
        stepNumber: index + 1,
        duration: metadataSteps[index]?.duration ?? 1,
        letter,
      });
    });
    const steps = generatedSteps.map((step, index) =>
      mergeBuilderStep(step, metadataSteps[index], index)
    );
    const startPlacement = startPicto
      ? createStartPlacementData({ ...startPicto })
      : undefined;

    isApplyingBuilderChange = true;
    try {
      if (!startPlacement && steps.length === 0) {
        if (current) sequenceState.setCurrentSequence(null);
        lastSynchronizedDocument = null;
        return;
      }

      const currentDocument: SequenceData = current ?? {
        id: crypto.randomUUID(),
        name: "Assemble Sequence",
        word: "",
        steps: [],
        thumbnails: [],
        isFavorite: false,
        isCircular: false,
        metadata: {},
        tags: [],
      };
      const {
        startPlacement: _oldStartPlacement,
        startingPlacement: _oldStartingPlacement,
        ...currentWithoutStart
      } = currentDocument;
      let next: SequenceData = {
        ...currentWithoutStart,
        steps,
        word: "",
        sequenceLength: steps.length,
        gridMode,
        ...(startPlacement && {
          startPlacement,
          startingPlacement: startPlacement,
        }),
      };
      next = { ...next, word: generateSequenceWord(next) };
      sequenceState.setCurrentSequence(next);
      lastSynchronizedDocument = sequenceState.currentSequence;
    } finally {
      isApplyingBuilderChange = false;
    }

    scheduleLetterLookups();
  }

  function remapMetadataSteps(
    steps: readonly StepData[],
    change?: AssembleDocumentChange
  ): StepData[] {
    const remapped = [...steps];
    if (!change) return remapped;
    if (change.type === "delete-step") {
      remapped.splice(change.index, 1);
      return remapped;
    }

    const [moved] = remapped.splice(change.fromIndex, 1);
    if (moved) remapped.splice(change.toIndex, 0, moved);
    return remapped;
  }

  function restoreBuilderDocument(document: unknown): void {
    if (!sequenceState || isDestroyed) return;
    isApplyingBuilderChange = true;
    try {
      sequenceState.setCurrentSequence(document as SequenceData | null);
      lastSynchronizedDocument = sequenceState.currentSequence;
    } finally {
      isApplyingBuilderChange = false;
    }
    scheduleLetterLookups();
  }

  function builderPairKey(index: number): string | null {
    const left = builderState.leftSteps[index];
    const right = builderState.rightSteps[index];
    if (!left || !right) return null;
    return JSON.stringify([builderState.gridMode, left, right]);
  }

  function scheduleLetterLookups(): void {
    if (!sequenceState || isDestroyed) return;
    const paired = Math.min(
      builderState.leftSteps.length,
      builderState.rightSteps.length
    );

    for (let index = 0; index < paired; index += 1) {
      const key = builderPairKey(index);
      if (!key || letterCache.has(key)) continue;
      const existingLetter =
        sequenceState.currentSequence?.steps[index]?.letter ?? null;
      if (existingLetter) {
        letterCache.set(key, existingLetter);
        continue;
      }

      const leftMotion = stepToMotion(
        builderState.leftSteps[index]!,
        HandSide.LEFT,
        builderState.gridMode
      );
      const rightMotion = stepToMotion(
        builderState.rightSteps[index]!,
        HandSide.RIGHT,
        builderState.gridMode
      );
      letterCache.set(key, null);
      void lookupLetter(leftMotion, rightMotion, builderState.gridMode)
        .then((letter) => {
          letterCache.set(key, letter);
          applyResolvedLetter(index, key, letter);
        })
        .catch(() => undefined);
    }
  }

  function applyResolvedLetter(
    index: number,
    key: string,
    letter: Letter | null
  ): void {
    if (!sequenceState || isDestroyed || builderPairKey(index) !== key) return;
    const current = sequenceState.currentSequence;
    const step = current?.steps[index];
    if (!current || !step || step.letter === letter) return;

    const steps = current.steps.map((candidate, candidateIndex) =>
      candidateIndex === index
        ? withCalculatedArrowLocations({
            ...candidate,
            letter,
            gridMode: candidate.gridMode ?? current.gridMode,
          })
        : candidate
    );
    let next: SequenceData = { ...current, steps, word: "" };
    next = { ...next, word: generateSequenceWord(next) };
    isApplyingBuilderChange = true;
    try {
      sequenceState.setCurrentSequence(next);
      lastSynchronizedDocument = sequenceState.currentSequence;
    } finally {
      isApplyingBuilderChange = false;
    }
  }

  function syncSequenceToBuilder(sequence: SequenceData | null): void {
    if (isApplyingBuilderChange || isDestroyed) return;
    if (sequence) {
      const previousDocument = lastSynchronizedDocument;
      lastSynchronizedDocument = sequence;
      const hydration = sequenceToBuilderHydration(sequence);
      if (previousDocument?.id === sequence.id) {
        builderState.hydrateFromExternalSequence(hydration, previousDocument);
      } else {
        builderState.hydrateFromSequence(hydration);
      }
      scheduleLetterLookups();
      return;
    }

    lastSynchronizedDocument = null;
    builderState.hydrateFromSequence({
      leftSteps: [],
      rightSteps: [],
      gridMode: builderState.gridMode,
      startPoses: {},
    });
  }

  let prevAssemblePhase: BuilderPhase | null = null;
  const cleanupEffects = $effect.root(() => {
    $effect(() => {
      const phase = builderState.phase;
      if (phase === "complete" && prevAssemblePhase !== "complete") {
        void getPropUnlockManager().recordCreation("construct");
      }
      prevAssemblePhase = phase;
    });
  });

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async function initializeAssembleTab() {
    if (!sequenceState) {
      isInitialized = true;
      return;
    }

    try {
      if (sequencePersister) {
        await sequenceState.initializeWithPersistence();
      }
      isInitialized = true;
    } catch (err) {
      console.error("AssembleTabState: Failed to initialize:", err);
      error = err instanceof Error ? err.message : "Failed to initialize";
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  return {
    // State access
    get isInitialized() {
      return isInitialized;
    },
    get isPersistenceInitialized() {
      return isInitialized;
    },
    get error() {
      return error;
    },
    get hasError() {
      return error !== null;
    },

    // Builder state (consumed by InteractiveGrid & BuilderControls)
    get assembleBuilderState() {
      return builderState;
    },

    // Sequence state (consumed by StepGrid via SequenceState)
    get sequenceState() {
      return sequenceState;
    },

    // History is owned by the builder and delegated through CreateModuleState.
    get canUndo() {
      return builderState.canUndo;
    },
    get canRedo() {
      return builderState.canRedo;
    },
    undo: () => {
      if (!builderState.canUndo) return false;
      return builderState.undoStep();
    },
    redo: () => {
      if (!builderState.canRedo) return false;
      return builderState.redoStep();
    },

    // Initialization
    initializeAssembleTab,

    // Cleanup - call when Create module unmounts
    destroy: () => {
      isDestroyed = true;
      cleanupEffects();
    },
  };
}

export type AssembleTabState = ReturnType<typeof createAssembleTabState>;
