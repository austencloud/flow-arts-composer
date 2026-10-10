import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  createAutoStepEditorEffect,
  type AutoEditPanelConfig,
} from "#lib/features/create/shared/state/managers/auto-edit-panel-manager.svelte.js";

interface HarnessOptions {
  persistenceInitialized: boolean;
  sequence: SequenceData | null;
  selectedStepNumber: number | null;
  panelOpen: boolean;
  multiSelect?: boolean;
  selectedStepNumbers?: number[];
  mandalaSelected?: boolean;
}

export function createAutoStepEditorEffectHarness(options: HarnessOptions) {
  let persistenceInitialized = $state(options.persistenceInitialized);
  let sequence = $state<SequenceData | null>(options.sequence);
  let selectedStepNumber = $state<number | null>(options.selectedStepNumber);
  let panelOpen = $state(options.panelOpen);
  let multiSelect = $state(options.multiSelect ?? false);
  let selectedStepNumbers = $state(new Set(options.selectedStepNumbers ?? []));
  let mandalaSelected = $state(options.mandalaSelected ?? false);

  const sequenceState = {
    get currentSequence() {
      return sequence;
    },
    get selectedStepNumber() {
      return selectedStepNumber;
    },
    get isMultiSelectMode() {
      return multiSelect;
    },
    get selectedStepNumbers() {
      return selectedStepNumbers;
    },
    clearSelection() {
      selectedStepNumber = null;
    },
    exitMultiSelectMode() {
      multiSelect = false;
      selectedStepNumber = null;
    },
  } as unknown as AutoEditPanelConfig["CreateModuleState"]["sequenceState"];

  const panelState = {
    get isStepEditorPanelOpen() {
      return panelOpen;
    },
    get mandalaViewerSelection() {
      return mandalaSelected ? { variant: "both", pathShape: "hybrid" } : null;
    },
    openStepEditorPanel() {
      panelOpen = true;
    },
    closeStepEditorPanel() {
      panelOpen = false;
    },
  } as unknown as AutoEditPanelConfig["panelState"];

  const CreateModuleState = {
    get isPersistenceInitialized() {
      return persistenceInitialized;
    },
    get sequenceState() {
      return sequenceState;
    },
    getActiveTabSequenceState() {
      return sequenceState;
    },
  } as unknown as AutoEditPanelConfig["CreateModuleState"];

  let disposeEffect: (() => void) | undefined;
  const dispose = $effect.root(() => {
    disposeEffect = createAutoStepEditorEffect({
      CreateModuleState,
      panelState,
      shouldAutoOpen: () => true,
    });

    return () => disposeEffect?.();
  });

  return {
    get panelOpen() {
      return panelOpen;
    },
    get selectedStepNumber() {
      return selectedStepNumber;
    },
    get multiSelect() {
      return multiSelect;
    },
    setPersistenceInitialized(value: boolean) {
      persistenceInitialized = value;
    },
    dispose,
  };
}
