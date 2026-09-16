<script lang="ts">
  import { onMount } from "svelte";
  import SequenceActionsPanel from "$lib/features/create/shared/components/sequence-actions/SequenceActionsPanel.svelte";
  import {
    setCreateModuleContext,
    type CreateModuleContext,
  } from "$lib/features/create/shared/context/create-module-context";
  import type { TargetHand } from "$lib/shared/create/domain/panel-types";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { ActionHelpId } from "$lib/features/create/shared/domain/transforms/transform-help-content";
  import type { DirectionDrillRoute } from "$lib/features/create/shared/components/sequence-actions/direction-drill-route";
  import { createSequenceTransformActionDispatcher } from "$lib/features/create/shared/services/sequence-transform-action-dispatcher";
  import {
    SEQUENCE_ACTIONS_EXTENSION_ANALYSIS,
    SEQUENCE_ACTIONS_REVIEW_SEQUENCE,
  } from "../sequence-actions-review-fixtures";

  let {
    surface,
    variant,
  }: {
    surface: string;
    variant: string;
  } = $props();

  let frameWidth = $state(
    typeof window === "undefined" ? 375 : window.innerWidth
  );
  let frameHeight = $state(
    typeof window === "undefined" ? 667 : window.innerHeight
  );
  let panelOpen = $state(true);
  let currentSequence = $state<SequenceData>(SEQUENCE_ACTIONS_REVIEW_SEQUENCE);
  let targetHand = $state<TargetHand>("both");
  let selectedStepNumber = $state<number | null>(1);
  let shiftStartActive = $state(variant === "first-step");
  let durationPreviewActive = $state(false);

  const basePanelHeight = $derived(Math.round(frameHeight * 0.5));
  const useSideBySide = $derived(frameWidth >= 900 && frameWidth > frameHeight);

  const activeSequenceState = {
    get currentSequence() {
      return currentSequence;
    },
    get selectedStepNumber() {
      return selectedStepNumber;
    },
    hasSequence: () => true,
    selectStep: (stepNumber: number) => (selectedStepNumber = stepNumber),
    clearSelection: () => (selectedStepNumber = null),
    setCurrentSequence: (sequence: SequenceData) =>
      (currentSequence = sequence),
    mirrorSequence: async () => {},
    swapHands: async () => {},
    rewindSequence: async () => {},
    flipSequence: async () => {},
    invertSequence: async () => {},
    rotateSequence: async () => {},
    shiftStartPlacement: async () => {},
  };

  const panelState = {
    get navigationBarHeight() {
      return 56;
    },
    get toolPanelHeight() {
      return Math.max(0, basePanelHeight - 56);
    },
    get toolPanelWidth() {
      return useSideBySide ? Math.round(frameWidth * 0.46) : 0;
    },
    get targetHand() {
      return targetHand;
    },
    get isShiftStartMode() {
      return shiftStartActive;
    },
    get isDurationPreviewMode() {
      return durationPreviewActive;
    },
    setTargetHand: (hand: TargetHand) => (targetHand = hand),
    openStepEditorPanel: () => {},
    enterShiftStartMode: () => (shiftStartActive = true),
    exitShiftStartMode: () => (shiftStartActive = false),
    enterDurationPreviewMode: () => (durationPreviewActive = true),
    exitDurationPreviewMode: () => (durationPreviewActive = false),
    setPreviewSequence: () => {},
  };

  const createModuleState = {
    getActiveTabSequenceState: () => activeSequenceState,
    pushUndoSnapshot: () => {},
    sequenceState: activeSequenceState,
  };

  const constructTabState = {
    sequenceState: activeSequenceState,
    syncGridModeFromSequence: () => {},
    setSelectedStartPlacement: () => {},
    setShowStartPlacementPicker: () => {},
    syncPickerStateWithSequence: () => {},
  };

  const layout = {
    get shouldUseSideBySideLayout() {
      return useSideBySide;
    },
    isMobilePortrait: () => frameWidth < frameHeight,
    isInputMode: false,
    setInputMode: () => {},
  };

  const sequenceTransformActions = createSequenceTransformActionDispatcher({
    getSequenceState: () => activeSequenceState,
    getCreateMode: () => "sequence-actions-review",
    pushUndoSnapshot: () => {},
    hapticService: null,
    setGridRotationDirection: () => {},
  });

  setCreateModuleContext({
    CreateModuleState: createModuleState,
    constructTabState,
    constructTutorialState: {},
    panelState,
    services: {},
    sessionManager: null,
    autosaver: null,
    libraryRepository: null,
    layout,
    handlers: { onError: () => {} },
    getSequenceTransformActions: () => sequenceTransformActions,
  } as unknown as CreateModuleContext);

  const initialSubView = $derived(
    surface === "turn"
      ? "turnPattern"
      : surface === "duration"
        ? "duration"
        : surface === "direction"
          ? "rotation"
          : surface === "extend"
            ? "extend"
            : null
  );
  const initialActionCategory = $derived(
    variant === "patterns" || variant === "first-step"
      ? "patterns"
      : variant === "edit"
        ? "edit"
        : "transform"
  );
  const initialDirectionRoute = $derived<DirectionDrillRoute>(
    variant === "hub"
      ? "hub"
      : variant === "apply" || variant === "save"
        ? "absolute"
        : "reversals"
  );
  const initialRotationMode = $derived(variant === "save" ? "save" : "apply");
  const initialHelpAction = $derived<ActionHelpId | null>(
    surface === "help" ? "direction" : null
  );
  const extensionAnalysis = $derived(
    variant === "repeat"
      ? {
          ...SEQUENCE_ACTIONS_EXTENSION_ANALYSIS,
          orientationRepeat: { count: 4 as const },
        }
      : SEQUENCE_ACTIONS_EXTENSION_ANALYSIS
  );

  onMount(() => {
    document.getElementById("app-loading")?.remove();
    const updateSize = () => {
      frameWidth = window.innerWidth;
      frameHeight = window.innerHeight;
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  });
</script>

<main class="review-frame">
  <section class="workspace-preview" aria-label="Sequence workspace context">
    <header>
      <span>Sequence workspace</span>
      <strong>40 steps</strong>
    </header>
    <div class="sequence-strip" aria-hidden="true">
      {#each Array.from({ length: 10 }) as _, index}
        <div class="sequence-cell" class:accent={index === 0 || index === 5}>
          <span></span><span></span>
        </div>
      {/each}
    </div>
  </section>

  <SequenceActionsPanel
    show={panelOpen}
    onClose={() => (panelOpen = false)}
    {initialSubView}
    {initialDirectionRoute}
    {initialRotationMode}
    {initialActionCategory}
    initialExtensionAnalysis={extensionAnalysis}
    {initialHelpAction}
    persistReviewState={false}
  />
</main>

<style>
  :global(html),
  :global(body) {
    margin: 0;
    min-height: 100%;
    overflow: hidden;
    background: #07121b;
  }

  .review-frame {
    min-height: 100dvh;
    overflow: hidden;
    background:
      radial-gradient(
        circle at 18% 12%,
        rgba(30, 132, 184, 0.22),
        transparent 32%
      ),
      linear-gradient(160deg, #0c2633, #07121b 62%);
    color: var(--theme-text, #f7f8fb);
    font-family: system-ui, sans-serif;
  }

  .workspace-preview {
    box-sizing: border-box;
    height: 50dvh;
    padding: 18px 14px 12px;
  }

  .workspace-preview header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-size: var(--font-size-compact, 12px);
  }

  .workspace-preview header strong {
    color: var(--theme-text, #fff);
    font-variant-numeric: tabular-nums;
  }

  .sequence-strip {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 5px;
    margin-top: 14px;
    padding: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    background: rgba(4, 9, 15, 0.76);
  }

  .sequence-cell {
    display: grid;
    min-height: 42px;
    grid-template-columns: 1fr 1fr;
    place-items: center;
    gap: 3px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.035);
  }

  .sequence-cell span {
    width: 3px;
    height: 24px;
    border-radius: 999px;
    background: #2e8bf0;
    transform: rotate(38deg);
  }

  .sequence-cell span:last-child {
    background: #ed1c24;
    transform: rotate(-38deg);
  }

  .sequence-cell.accent {
    outline: 1px solid rgba(139, 108, 255, 0.72);
    background: rgba(139, 108, 255, 0.14);
  }

  @media (min-width: 900px) and (orientation: landscape) {
    .workspace-preview {
      width: 54vw;
      height: 100dvh;
      padding: 24px;
    }

    .sequence-strip {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
  }
</style>
