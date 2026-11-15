<!--
  StepEditorPanel.svelte

  Panel for editing individual steps (turns, rotation, orientation).
  Opens directly when clicking a pictograph, or via "Edit Turns" in Sequence Actions.
  Non-modal - allows clicking through to other pictographs while open.

  Mobile: Full-height panel with step grid at top, stacked controls at bottom
  Desktop: Side panel with pictograph preview, horizontal controls

  Phone held upright (.phone): 36px controls, and the arrangement that gives
  the picture the most room without an empty band under it, chosen from the
  top zone's measured size (choosePhoneStepForm / choosePhoneStartForm in
  editor-layout.ts, which holds the arithmetic for each):
    step  - tall (header, picture, Duration), side (picture beside a column of
            title, actions and Duration in one row), column (the same column
            with Duration as fine pair over coarse pair), below (picture beside
            the title and actions, Duration full width under both).
    start - side (board in a full-height column beside the controls) or stack
            (title, hand picker and Done in one row, the board, then Location
            beside Orientation).
  The arrangement follows the drawer's size, not a tap, so it does not animate.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import PropPlacementGrid from "#lib/shared/pictograph/grid/components/PropPlacementGrid.svelte";
  import type { PlacementMotionMove } from "#lib/shared/pictograph/grid/state/prop-placement-motion.svelte.js";
  import type { PropPlacementChange } from "#lib/shared/pictograph/grid/domain/prop-placement.js";
  import StartPlacementEditMode from "./StartPlacementEditMode.svelte";
  import DurationControl from "./DurationControl.svelte";
  import { planStepWidth } from "./step-width-motion";
  import PictographInspectModal from "./PictographInspectModal.svelte";
  import ArrowAdjustmentPanel from "./ArrowAdjustmentPanel.svelte";
  import ArrowAdjustmentHistory from "./ArrowAdjustmentHistory.svelte";
  import StepEditorTour from "#lib/shared/onboarding/components/step-editor-tour/StepEditorTour.svelte";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { motionDuration } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import {
    NARROW_EDITOR_WIDTH,
    SHORT_EDITOR_HEIGHT,
    choosePhoneStartForm,
    choosePhoneStepForm,
    tallHeaderExtraHeight,
  } from "./editor-layout";
  import { getViewportManager } from "#lib/shared/device/get-viewport-manager.js";
  import { stepEditorTourState } from "#lib/shared/onboarding/state/step-editor-tour-state.svelte.js";
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { gridJoinCellResolver } from "@tka/render-core";
  import { sequenceGridJoin } from "#lib/shared/grid-join/sequence-grid-join.js";
  import { isVisibleMotion } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
  import {
    HandSide,
    Orientation,
  } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import {
    GridLocation,
    GridMode,
  } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { deriveGridMode } from "#lib/shared/pictograph/grid/services/grid-mode-deriver.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { isAdmin } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import { getCreateModuleContext } from "../../context/create-module-context";
  import { selectedArrowState } from "#lib/shared/create/state/selected-arrow-state.svelte.js";
  import { UndoOperationType } from "#lib/features/create/shared/services/undo-manager.js";
  import {
    getShortestRotationStepsBetweenLocations,
    rotateLocation,
  } from "#lib/shared/create/services/rotation-helpers.js";
  import { setGridRotationDirection } from "#lib/shared/pictograph/grid/state/grid-rotation-state.svelte.js";
  import { createPersistenceHelper } from "#lib/shared/state/utils/persistent-state.js";
  import { onMount, untrack } from "svelte";

  // Persist whether the inspect modal is open so a dev HMR / page refresh
  // restores it instead of closing it. load() re-reads localStorage on every
  // remount, which is exactly what survives the HMR teardown of this component.
  const inspectModalPersistence = createPersistenceHelper<boolean>({
    key: "tka_inspect_modal_open",
    defaultValue: false,
  });

  interface Props {
    isOpen: boolean;
    selectedStepNumber: number | null;
    selectedStepData: StepData | null;
    sequence?: SequenceData | null;
    removingStepIndices?: Set<number>;
    onClose: () => void;
    onOrientationChange: (color: HandSide, orientation: string) => void;
    onStepSelect?: (stepNumber: number) => void;
    onDelete?: () => void;
    onStepDataUpdate?: (updatedStepData: StepData) => void;
    onPushUndoSnapshot?: () => void;
    onDurationChange?: (newDuration: number) => void;
    onBetaSwapToggle?: () => void;
  }

  let {
    isOpen,
    selectedStepNumber,
    selectedStepData,
    sequence = null,
    removingStepIndices = new Set<number>(),
    onClose,
    onOrientationChange,
    onStepSelect,
    onDelete,
    onStepDataUpdate,
    onPushUndoSnapshot,
    onDurationChange,
    onBetaSwapToggle,
  }: Props = $props();

  // Track if an arrow is selected for showing adjustment panel
  const hasArrowSelected = $derived(selectedArrowState.selectedArrow !== null);

  // Get layout context for responsive behavior
  const ctx = getCreateModuleContext();
  const { CreateModuleState, layout, panelState } = ctx;
  const activeSequenceState = $derived.by(() =>
    CreateModuleState.getActiveTabSequenceState()
  );
  const isSideBySideLayout = $derived(layout.shouldUseSideBySideLayout);
  let editorWidth = $state(0);
  let editorHeight = $state(0);
  // A landscape phone leaves the right-side editor almost square. Focused
  // controls keep one prop usable at a time without shrinking the placement
  // board into a decorative strip.
  const isShortWideEditor = $derived(
    editorWidth > 0 && editorHeight > 0 && editorHeight <= SHORT_EDITOR_HEIGHT
  );
  // A short panel that is also wider than it is tall (a landscape phone's
  // side drawer) composes the preview beside its controls instead of above.
  // Short landscape is a property of the screen, not of the top zone: a phone
  // held upright also has a short top zone once the drawer splits it, but its
  // preview still belongs above the duration row, not beside it.
  const viewport = getViewportManager();
  const isShortLandscape = $derived(
    isShortWideEditor && viewport.width > viewport.height
  );
  // Narrow vs. wide is the drawer's own width, shared with the controls zone
  // through editor-layout.ts; the viewport only decides the first paint.
  const narrowEditor = $derived(
    editorWidth > 0 ? editorWidth < NARROW_EDITOR_WIDTH : !isSideBySideLayout
  );
  // Compact arrangements take the 36px phone controls; a phone held upright
  // also gets the tall / short top-zone arrangements described above.
  const compactControls = $derived(narrowEditor || isShortLandscape);
  const phoneLayout = $derived(narrowEditor && !isShortLandscape);
  const startPlacementHitTargetRadius = $derived(
    isShortWideEditor ? 160 : isSideBySideLayout ? 75 : 85
  );

  // Hold onto previous step data during transitions
  // This prevents layout flicker when deleting steps - the controls stay visible
  // with the old data until the new step is selected, then CSS transitions
  // smoothly animate the pictograph elements to their new positions
  let displayedStepData = $state<StepData | null>(null);
  let displayedStepNumber = $state<number | null>(null);

  // The preview draws the step on the sequence's joined grids when it has a
  // join, the same as its cell in the step grid.
  const gridJoin = $derived(sequenceGridJoin(sequence));
  const withGridJoin = $derived(gridJoinCellResolver({ conjoined: gridJoin }));
  const joinedStepData = $derived(
    gridJoin && displayedStepData
      ? withGridJoin(displayedStepData)
      : displayedStepData
  );

  $effect(() => {
    // Only update displayed data when we have actual new data
    // When selectedStepData becomes null (during deletion), keep showing previous
    if (selectedStepData !== null) {
      displayedStepData = selectedStepData;
    }
    if (selectedStepNumber !== null) {
      displayedStepNumber = selectedStepNumber;
    }
  });

  // The inspect modal is subordinate to the editor: if the editor isn't open,
  // force the modal closed so a persisted-open flag can't pop it on the next
  // step click. On a refresh that restored the editor, isOpen is already true
  // here, so a restored inspect modal survives. The displayed step is kept:
  // the editor fades out showing it, then unmounts, so nothing goes stale.
  $effect(() => {
    if (!isOpen) {
      showInspectModal = false;
    }
  });

  // Derived state - use displayed values for rendering to prevent flicker
  // Data, not just a step number. The preview section is gated on both, so a
  // number without data used to render the controls alone — floating at the top
  // of the panel over an empty board area. "Select a step to edit" is the honest
  // state there, and it is one the panel already draws.
  const hasSelection = $derived(
    displayedStepNumber !== null && displayedStepData !== null
  );
  const isStartPlacementSelected = $derived(displayedStepNumber === 0);

  // The preview is as wide as the step's duration, the way the step's cell
  // widens in the grid; planStepWidth (step-width-motion.ts) times the card
  // and the drawing so the step never dips smaller mid-move. Opening the
  // editor, or coming to a step from the start, sizes it at once.
  const stepDuration = $derived(
    displayedStepData && !isStartPlacementSelected
      ? (displayedStepData.duration ?? 1)
      : null
  );
  let cardDuration = $state(1);
  let drawnDuration = $state(1);
  let durationMoving = $state(false);
  let lastStepDuration: number | null = null;

  $effect(() => {
    const target = stepDuration;
    const previous = lastStepDuration;
    lastStepDuration = target;
    if (target === null) {
      durationMoving = false;
      return;
    }
    const ms = motionDuration(DURATION.normal);
    const plan = planStepWidth(
      previous,
      target,
      untrack(() => drawnDuration),
      ms
    );
    cardDuration = plan.card;
    drawnDuration = plan.drawn;
    durationMoving = plan.moving;
    if (!plan.moving) return;
    const settle = setTimeout(() => {
      drawnDuration = plan.settledDrawn;
      durationMoving = false;
    }, ms);
    return () => clearTimeout(settle);
  });

  const startLeftMotion = $derived(displayedStepData?.motions?.[HandSide.LEFT]);
  const startRightMotion = $derived(
    displayedStepData?.motions?.[HandSide.RIGHT]
  );
  const startLeftLocation = $derived(
    isVisibleMotion(startLeftMotion) ? startLeftMotion.startLocation : null
  );
  const startRightLocation = $derived(
    isVisibleMotion(startRightMotion) ? startRightMotion.startLocation : null
  );
  const startGridMode = $derived.by(() => {
    if (isVisibleMotion(startLeftMotion) && isVisibleMotion(startRightMotion)) {
      return deriveGridMode(startLeftMotion, startRightMotion);
    }

    return (
      displayedStepData?.gridMode ??
      startLeftMotion?.gridMode ??
      startRightMotion?.gridMode ??
      GridMode.DIAMOND
    );
  });
  const startLeftPropType = $derived.by(
    () =>
      getSettings().leftPropType ?? startLeftMotion?.propType ?? PropType.STAFF
  );
  const startRightPropType = $derived.by(
    () =>
      getSettings().rightPropType ??
      startRightMotion?.propType ??
      PropType.STAFF
  );
  const canAimStartPlacement = $derived(
    isStartPlacementSelected &&
      startLeftLocation !== null &&
      startRightLocation !== null
  );
  const startPlacementUsesCenter = $derived(
    startLeftLocation === GridLocation.CENTER ||
      startRightLocation === GridLocation.CENTER
  );
  let placementGrid = $state<ReturnType<typeof PropPlacementGrid> | null>(null);
  let activeMoveHand = $state<HandSide | null>(null);
  let isRepositioning = $state(false);
  let placementResetEpoch = $state(0);
  let placementMotionMove = $state<PlacementMotionMove | null>(null);

  // The header says which mode you're in: the step editor replaces the tools,
  // and Sequence Actions closes while a step is selected, so this line is how
  // you know what you're editing and that Done is the way back.
  const modeLabel = $derived.by(() => {
    if (displayedStepNumber === null) return t("create_ui_step_editor");
    return displayedStepNumber === 0
      ? t("create_editor_editing_start")
      : t("create_editor_editing_step", { number: displayedStepNumber });
  });

  // Calculate how many subsequent steps would be affected by orientation changes
  // This helps users understand cascade impact when editing turns on mobile
  const cascadeCount = $derived.by(() => {
    if (displayedStepNumber === null || !sequence?.steps) return 0;
    // Start placement affects all steps, regular steps affect subsequent ones
    if (displayedStepNumber === 0) {
      return sequence.steps.length;
    }
    // Steps after the selected one (stepNumber 1 = index 0, so steps after index (n-1))
    return Math.max(0, sequence.steps.length - displayedStepNumber);
  });

  // Deleting a middle step takes every step after it with it (the steps after
  // start where it ended, so they can't stay without it). The header says so
  // before the tap: "Delete takes steps 2–8". On the last step the pill's own
  // word is the whole truth, so there is no line.
  const deleteRange = $derived.by(() => {
    if (!onDelete || displayedStepNumber === null || displayedStepNumber < 1)
      return null;
    const last = sequence?.steps?.length ?? 0;
    return displayedStepNumber < last
      ? { from: displayedStepNumber, to: last }
      : null;
  });
  const deleteScopeText = $derived(
    deleteRange ? t("create_ui_delete_takes_steps", deleteRange) : ""
  );

  // Track sequence changes to trigger pulse animation when cascade occurs
  // We watch the sequence's steps array - when it changes and we have cascade steps,
  // that means orientation propagated through subsequent steps
  let lastSequenceVersion = $state(0);
  let showCascadePulse = $state(false);

  // Create a simple version number that changes when sequence steps change
  const sequenceVersion = $derived.by(() => {
    if (!sequence?.steps) return 0;
    // Use a combination that changes when any step's orientation changes
    return sequence.steps.reduce((acc, step, idx) => {
      const left = step?.motions?.[HandSide.LEFT];
      const right = step?.motions?.[HandSide.RIGHT];
      const leftTurnsNum =
        left?.turns === "fl" ? -0.5 : Number(left?.turns ?? 0);
      const rightTurnsNum =
        right?.turns === "fl" ? -0.5 : Number(right?.turns ?? 0);
      return acc + idx * 1000 + leftTurnsNum * 100 + rightTurnsNum * 10;
    }, sequence.steps.length);
  });

  $effect(() => {
    // Only pulse when:
    // 1. We have cascade steps (cascadeCount > 0)
    // 2. The sequence version changed (turns/orientations updated)
    // 3. This isn't the initial load (lastSequenceVersion !== 0)
    // 4. Panel is open and we're not on start placement
    if (
      cascadeCount > 0 &&
      sequenceVersion !== lastSequenceVersion &&
      lastSequenceVersion !== 0 &&
      isOpen &&
      !isStartPlacementSelected
    ) {
      showCascadePulse = true;
      const timeout = setTimeout(() => {
        showCascadePulse = false;
      }, motionDuration(DURATION.emphasis));
      lastSequenceVersion = sequenceVersion;
      return () => clearTimeout(timeout);
    }
    lastSequenceVersion = sequenceVersion;
    return undefined;
  });

  // Trigger step editor tour on first open with a selection
  $effect(() => {
    if (isOpen && hasSelection) {
      stepEditorTourState.triggerIfFirstTime();
    }
  });

  // Which section to highlight during tour
  const tourHighlight = $derived(
    stepEditorTourState.isActive
      ? (
          {
            welcome: "all",
            preview: "preview",
            turns: "turns",
            duration: "duration",
          } as const
        )[stepEditorTourState.currentStop]
      : "none"
  );

  // Beta swap state — both hands end at same location. Invisible placeholder =
  // hand not really there (both-required Step shape): not a beta placement.
  const isBetaPlacement = $derived.by(() => {
    if (!displayedStepData || isStartPlacementSelected) return false;
    const left = displayedStepData.motions?.[HandSide.LEFT];
    const right = displayedStepData.motions?.[HandSide.RIGHT];
    return !!(
      isVisibleMotion(left) &&
      isVisibleMotion(right) &&
      left.endLocation === right.endLocation
    );
  });
  const isBetaSwapped = $derived(!!displayedStepData?.betaSwapped);

  // Phone arrangement (see the header comment). The column form must hold the
  // header's widest line without cutting it, so the layout reads the lines'
  // own widths from the page: the action row (Delete pill, Done, and the
  // admin inspect button) and the title and red scope line as text. A longer
  // translation widens the column instead of being cut or running past the
  // screen edge. The action row never counts for less than the old English
  // estimate (pill 90, gap 6, Done 72), so English keeps its picture; the
  // beta chip is still estimated at 56 and its gap 6.
  let titleEl = $state<HTMLElement>();
  let scopeEl = $state<HTMLElement>();
  let actionsRect = $state<DOMRectReadOnly>();
  let headerTextWidth = $state(0);
  // The tall form wraps the title and red line instead of cutting them, so
  // the chooser hears how tall that makes the header in this language.
  let titleTextWidth = $state(0);
  let scopeTextWidth = $state(0);
  let titleLineHeight = $state(18.4);
  let scopeLineHeight = $state(14.4);

  // Read on one line: the tall form lets these wrap, and a wrapped line's
  // box is not the words' own width.
  function naturalTextWidth(el: HTMLElement | undefined): number {
    if (!el) return 0;
    const wrap = el.style.whiteSpace;
    el.style.whiteSpace = "nowrap";
    const range = document.createRange();
    range.selectNodeContents(el);
    const width = range.getBoundingClientRect().width;
    el.style.whiteSpace = wrap;
    return width;
  }

  $effect(() => {
    void modeLabel;
    void deleteScopeText;
    const title = titleEl;
    const scope = scopeEl;
    const measure = () => {
      titleTextWidth = naturalTextWidth(title);
      scopeTextWidth = naturalTextWidth(scope);
      headerTextWidth = Math.max(titleTextWidth, scopeTextWidth);
      if (title) {
        titleLineHeight =
          parseFloat(getComputedStyle(title).lineHeight) || titleLineHeight;
      }
      if (scope) {
        scopeLineHeight =
          parseFloat(getComputedStyle(scope).lineHeight) || scopeLineHeight;
      }
    };
    measure();
    document.fonts?.ready.then(measure);
  });

  const stepActionsWidth = $derived.by(() => {
    const estimate = 90 + 6 + 72 + (isAdmin() && hasSelection ? 36 + 6 : 0);
    const actions = Math.max(estimate, Math.ceil(actionsRect?.width ?? 0));
    return Math.max(
      actions + (isBetaPlacement ? 56 + 6 : 0),
      Math.ceil(headerTextWidth)
    );
  });
  // The tall header's text room: the row less its 12px padding each side,
  // the 6px gap, the action row and the beta chip (estimated 56 + 6). The
  // action row is read only while the tall form shows: beside the picture it
  // wraps to the column's width, and feeding that back flipped the form
  // between tall and below without end.
  let tallActionsWidth = $state(0);
  const tallHeaderExtra = $derived.by(() => {
    const estimate = 90 + 6 + 72 + (isAdmin() && hasSelection ? 36 + 6 : 0);
    const actions =
      Math.max(estimate, tallActionsWidth) + (isBetaPlacement ? 56 + 6 : 0);
    return tallHeaderExtraHeight({
      textRoom: editorWidth - 24 - 6 - actions,
      titleWidth: titleTextWidth,
      titleLine: titleLineHeight,
      scopeWidth: deleteRange ? scopeTextWidth : 0,
      scopeLine: scopeLineHeight,
    });
  });
  const phoneChoice = $derived.by(() => {
    if (!phoneLayout || editorWidth <= 0 || editorHeight <= 0) return null;
    return isStartPlacementSelected
      ? choosePhoneStartForm(editorWidth, editorHeight)
      : choosePhoneStepForm(
          editorWidth,
          editorHeight,
          stepActionsWidth,
          tallHeaderExtra
        );
  });
  const phoneForm = $derived(phoneChoice?.form ?? null);
  $effect(() => {
    if (phoneForm !== "tall" || !actionsRect) return;
    const width = Math.ceil(actionsRect.width);
    if (width !== tallActionsWidth) tallActionsWidth = width;
  });
  const startTwoUp = $derived(
    phoneChoice && "twoUp" in phoneChoice ? phoneChoice.twoUp : true
  );

  // Keyboard handler for B key beta swap toggle
  function handleBetaSwapKeydown(event: KeyboardEvent) {
    if (event.key.toLowerCase() !== "b") return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
      return;
    if (!isOpen || !hasSelection || isStartPlacementSelected) return;
    if (!isBetaPlacement) return;
    if (hasArrowSelected) return;
    const target = event.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    )
      return;
    event.preventDefault();
    onBetaSwapToggle?.();
  }

  onMount(() => {
    window.addEventListener("keydown", handleBetaSwapKeydown);
    return () => window.removeEventListener("keydown", handleBetaSwapKeydown);
  });

  // Inspect modal state (admin-only) — persisted across HMR / refresh.
  let showInspectModal = $state(inspectModalPersistence.load());

  $effect(() => {
    void showInspectModal;
    inspectModalPersistence.setupAutoSave(showInspectModal);
  });

  function handleClose() {
    selectedArrowState.clearSelection();
    onClose();
  }

  function handleStepClick(stepNumber: number) {
    onStepSelect?.(stepNumber);
  }

  function handleOpenInspect() {
    showInspectModal = true;
  }

  function handleCloseInspect() {
    showInspectModal = false;
  }

  function handleStepDataUpdate(updatedStepData: StepData) {
    // Forward to parent for persistence
    onStepDataUpdate?.(updatedStepData);
    // Also update the displayed step data locally for immediate visual feedback
    displayedStepData = updatedStepData;
  }

  function handlePlacementChange(change: PropPlacementChange) {
    activeMoveHand = change.activeHand;
  }

  function handleMoveProp(color: HandSide) {
    if (isRepositioning || startPlacementUsesCenter) return;
    placementGrid?.moveProp(color);
  }

  async function rotateStartPlacementLocation(
    color: HandSide,
    direction: "clockwise" | "counterclockwise",
    rotationSteps: number,
    targetLocation: GridLocation,
    animateFromLocation: GridLocation | null = null
  ) {
    if (
      !isStartPlacementSelected ||
      isRepositioning ||
      startPlacementUsesCenter ||
      rotationSteps < 1
    ) {
      return;
    }

    const targetHand = color === HandSide.LEFT ? "left" : "right";
    const directionStep = direction === "clockwise" ? 1 : -1;
    isRepositioning = true;
    activeMoveHand = null;
    CreateModuleState.pushUndoSnapshot(UndoOperationType.ROTATE_SEQUENCE);
    setGridRotationDirection(directionStep);

    try {
      await activeSequenceState.rotateSequence(
        direction,
        targetHand,
        rotationSteps
      );

      const updatedLocation =
        activeSequenceState.selectedStartPlacement?.motions?.[color]
          ?.startLocation;
      if (updatedLocation !== targetLocation) {
        placementResetEpoch += 1;
      } else if (animateFromLocation !== null) {
        // Rotate-arrow moves play in place: the moving prop arcs a
        // pro-with-zero-turns path around the center while the partner
        // resolves its beta offset. Drag moves skip this — the finger
        // already carried the prop.
        placementMotionMove = {
          epoch: (placementMotionMove?.epoch ?? 0) + 1,
          color,
          from: animateFromLocation,
          to: targetLocation,
          direction,
        };
      }
    } finally {
      isRepositioning = false;
    }
  }

  async function handleLocationRotate(
    color: HandSide,
    direction: "clockwise" | "counterclockwise"
  ) {
    const currentLocation =
      color === HandSide.LEFT ? startLeftLocation : startRightLocation;
    if (currentLocation === null || currentLocation === GridLocation.CENTER) {
      return;
    }

    // Rotate by 90° (two 45° steps), never 45°: a single step moves the prop
    // between the cardinal and intercardinal families, silently skewing the
    // grid mode. Locations stay gated to the current mode, same as the
    // placement grid's point set.
    const directionStep = direction === "clockwise" ? 2 : -2;
    const targetLocation = rotateLocation(
      currentLocation,
      directionStep
    ) as GridLocation;
    await rotateStartPlacementLocation(
      color,
      direction,
      2,
      targetLocation,
      currentLocation
    );
  }

  async function handlePlacementComplete(
    leftLocation: GridLocation,
    rightLocation: GridLocation
  ) {
    if (
      !isStartPlacementSelected ||
      isRepositioning ||
      startLeftLocation === null ||
      startRightLocation === null
    ) {
      return;
    }

    const leftChanged = leftLocation !== startLeftLocation;
    const rightChanged = rightLocation !== startRightLocation;

    // Move mode changes one prop at a time. Pressing an occupied prop before an
    // aim drag also publishes the current pair, which is intentionally a no-op.
    if (!leftChanged && !rightChanged) return;
    if (leftChanged === rightChanged) {
      placementResetEpoch += 1;
      return;
    }

    const targetColor = leftChanged ? HandSide.LEFT : HandSide.RIGHT;
    const previousLocation = leftChanged
      ? startLeftLocation
      : startRightLocation;
    const targetLocation = leftChanged ? leftLocation : rightLocation;
    const rotationSteps = getShortestRotationStepsBetweenLocations(
      previousLocation,
      targetLocation
    );

    if (rotationSteps === null || rotationSteps === 0) {
      placementResetEpoch += 1;
      return;
    }

    const direction = rotationSteps > 0 ? "clockwise" : "counterclockwise";
    await rotateStartPlacementLocation(
      targetColor,
      direction,
      Math.abs(rotationSteps),
      targetLocation
    );
  }
</script>

<div
  class="editor-panel"
  class:desktop={isSideBySideLayout}
  class:short-landscape={isShortLandscape}
  class:tour-active={stepEditorTourState.isActive}
  bind:clientWidth={editorWidth}
  bind:clientHeight={editorHeight}
>
  <!-- Step Editor Tour overlay -->
  <StepEditorTour />

  <div
    class="editor-layout"
    class:phone={phoneLayout}
    class:start={isStartPlacementSelected}
    class:form-side={phoneForm === "side"}
    class:form-column={phoneForm === "column"}
    class:form-below={phoneForm === "below"}
    class:form-stack={phoneForm === "stack"}
    style:--phone-board={phoneChoice ? `${phoneChoice.board}px` : undefined}
  >
    <!-- Header -->
    <header
      class="panel-header"
      class:compact={compactControls}
      class:short-landscape={isShortLandscape}
      class:tour-dim={tourHighlight !== "none"}
    >
      <div class="header-info">
        <h2 bind:this={titleEl}>{modeLabel}</h2>
        {#if deleteRange}
          <span class="subtitle">
            <span class="delete-scope" bind:this={scopeEl}
              >{deleteScopeText}</span
            >
          </span>
        {:else if cascadeCount > 0 && !isStartPlacementSelected}
          <span class="subtitle">
            <span class="cascade-indicator" class:pulse={showCascadePulse}>
              → +{t(
                cascadeCount === 1
                  ? "create_deep_step_count_one"
                  : "create_deep_step_count_many",
                { count: cascadeCount }
              )}
            </span>
          </span>
        {/if}
      </div>

      <!-- Beta swap is an on/off toggle, so it is the shared filter chip. The
         keyboard hint is in the chip itself (pointer devices only), which is
         what makes the window-level "b" shortcut discoverable. -->
      {#if isBetaPlacement}
        <div class="beta-swap">
          <FilterChipBase
            label="β⇄"
            mode="toggle"
            size={compactControls ? "phone" : "sm"}
            active={isBetaSwapped}
            chipColor="var(--feature-edit, #8b5cf6)"
            ariaLabel={isBetaSwapped
              ? t("create_review_beta_offset_swapped_press_b_to_toggle")
              : t("create_review_swap_beta_offset_press_b_to_toggle")}
            onclick={() => onBetaSwapToggle?.()}
          >
            {#snippet iconSnippet()}
              <kbd class="key-hint" aria-hidden="true">B</kbd>
            {/snippet}
          </FilterChipBase>
        </div>
      {/if}

      <!-- Arrow adjustment panel in header when arrow is selected -->
      {#if isAdmin() && hasArrowSelected && displayedStepData}
        <ArrowAdjustmentPanel
          stepData={displayedStepData}
          onStepDataUpdate={handleStepDataUpdate}
          {onPushUndoSnapshot}
          keyboardActive={!showInspectModal}
        />
        <ArrowAdjustmentHistory />
      {/if}

      <div class="header-actions" bind:contentRect={actionsRect}>
        {#if isAdmin() && hasSelection && displayedStepData}
          <button
            class="icon-btn inspect"
            onclick={handleOpenInspect}
            aria-label="Inspect pictograph data"
            title="Inspect pictograph data (dev)"
          >
            <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
          </button>
        {/if}
        <!-- No delete button on the start placement: with only a start placement
           the user can already edit it in place, and "deleting" it means
           clearing the whole sequence — that lives on the Clear button. -->
        {#if onDelete && hasSelection && !isStartPlacementSelected}
          <!-- The pill says Delete, and the line under the title says how much
             goes when that is more than this step. The button's name carries
             the same sentence, so a screen reader hears it too. -->
          <div class="delete-action">
            <PanelButton
              variant="primary"
              accentColor="var(--semantic-error)"
              size={compactControls ? "compact" : "md"}
              onclick={() => onDelete()}
              ariaLabel={deleteRange
                ? deleteScopeText
                : t("create_ui_delete_this_step")}
              title={deleteRange
                ? deleteScopeText
                : t("create_ui_delete_this_step")}
            >
              <i class="fa-solid fa-trash" aria-hidden="true"></i>
              {t("action_delete")}
            </PanelButton>
          </div>
        {/if}
        <!-- Done, not a bare ×: it ends the selection and brings the tools
           back, which reads as finishing an edit rather than dismissing a
           sheet. -->
        <PanelButton
          size={compactControls ? "compact" : "md"}
          onclick={handleClose}
          title={t("create_ui_close_step_editor")}
        >
          {t("create_editor_done")}
        </PanelButton>
      </div>
    </header>

    <div class="editor-content" class:short-landscape={isShortLandscape}>
      <!-- Pictograph Preview - shown on both mobile and desktop when beat selected -->
      <!-- Duration is now rendered INSIDE the pictograph via DurationGlyph -->
      {#if hasSelection && displayedStepData}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="preview-section"
          class:mobile={!isSideBySideLayout}
          class:short-landscape={isShortLandscape}
          class:tour-highlight={tourHighlight === "preview"}
          class:tour-dim={tourHighlight !== "none" &&
            tourHighlight !== "preview"}
          onclick={(e) => {
            if (
              hasArrowSelected &&
              !(e.target as HTMLElement).closest('[role="button"]')
            ) {
              selectedArrowState.clearSelection();
            }
          }}
        >
          <div
            class="pictograph-container"
            class:aiming={canAimStartPlacement}
            class:duration-moving={durationMoving}
            style:--step-duration={cardDuration}
          >
            {#if canAimStartPlacement && startLeftLocation && startRightLocation}
              <div class="start-placement-aim" data-swipe-block>
                <PropPlacementGrid
                  bind:this={placementGrid}
                  gridMode={startGridMode}
                  leftPropType={startLeftPropType}
                  rightPropType={startRightPropType}
                  leftOrientation={startLeftMotion?.startOrientation ??
                    Orientation.IN}
                  rightOrientation={startRightMotion?.startOrientation ??
                    Orientation.IN}
                  initialLeftLocation={startLeftLocation}
                  initialRightLocation={startRightLocation}
                  betaSwapped={displayedStepData.betaSwapped}
                  previewPictographData={displayedStepData}
                  {gridJoin}
                  resetEpoch={placementResetEpoch}
                  motionMove={placementMotionMove}
                  showCenter={startPlacementUsesCenter}
                  editAfterCompletion
                  disabled={isRepositioning}
                  showUndo={false}
                  renderTray={false}
                  compactPrompt={phoneLayout}
                  hitTargetRadius={startPlacementHitTargetRadius}
                  onChange={handlePlacementChange}
                  onPlacementComplete={handlePlacementComplete}
                  {onOrientationChange}
                />
              </div>
            {:else}
              <!-- No crossfade between steps; a turns or orientation change
                 glides this step's props and arrows to the new drawing. -->
              <PictographContainer
                pictographData={joinedStepData}
                widthMultiplier={drawnDuration}
                arrowsClickable={isAdmin()}
                disableContentTransitions
              />
            {/if}
          </div>
        </div>
      {/if}

      <!-- Controls - different layout for mobile vs desktop -->
      <div
        class="controls-section"
        class:mobile={!isSideBySideLayout}
        class:short-landscape={isShortLandscape}
        class:duration-only={hasSelection && !isStartPlacementSelected}
      >
        {#if !hasSelection}
          <div class="no-selection">
            <i class="fas fa-hand-pointer" aria-hidden="true"></i>
            <p>{t("create_ui_select_a_step_to_edit")}</p>
          </div>
        {:else if isStartPlacementSelected}
          <StartPlacementEditMode
            startPlacementData={displayedStepData}
            stacked={narrowEditor}
            compact={narrowEditor || isShortWideEditor}
            focused={isShortWideEditor}
            phone={phoneLayout}
            phoneForm={phoneForm === "side" || phoneForm === "stack"
              ? phoneForm
              : null}
            twoUp={startTwoUp}
            {activeMoveHand}
            repositionDisabled={startPlacementUsesCenter}
            {isRepositioning}
            {onOrientationChange}
            onLocationRotate={handleLocationRotate}
            onMoveProp={handleMoveProp}
          />
        {:else}
          {#if onDurationChange}
            <div
              class="tour-section"
              class:tour-highlight={tourHighlight === "duration"}
              class:tour-dim={tourHighlight !== "none" &&
                tourHighlight !== "duration"}
            >
              <DurationControl
                duration={displayedStepData?.duration ?? 1}
                compact={narrowEditor || isShortLandscape}
                layout={isShortLandscape || phoneForm === "column"
                  ? "stacked"
                  : "row"}
                fill={phoneForm === "side" || phoneForm === "column"}
                {onDurationChange}
              />
            </div>
          {/if}
          <!-- Blue/red turns controls now live in the shared, persistent
             StepControlsZone (rendered by the coordinator below this panel), so
             they morph across single ↔ multi instead of being rebuilt here. -->
        {/if}
      </div>
    </div>
  </div>
</div>

<!-- Inspect view (admin-only). Guard on a valid step + admin so a persisted
     open flag can't restore an empty view or surface it to non-admins.

     Deliberately a SIBLING of .editor-panel, not a child. The inspector fills
     the drawer, and .editor-panel declares `container-type: size` — which makes
     it a containing block for fixed descendants as well as absolute ones, and
     it is only the editor's 716px top zone. Mounting inside it would shrink the
     inspector to less than the dialog it used to cover. -->
<PictographInspectModal
  show={showInspectModal && isAdmin() && !!displayedStepData}
  stepData={displayedStepData}
  onClose={handleCloseInspect}
/>

<style>
  .editor-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    position: relative;
    container-type: size;
    container-name: step-editor;
  }

  /* The header and content column. A wrapper rather than the panel itself,
     because the panel is the step-editor container and a container query
     cannot restyle its own container. */
  .editor-layout {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    min-height: 0;
  }

  .editor-content {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 12px;
    min-height: 44px;
    flex-shrink: 0;
  }

  .header-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  /* Short landscape: title and step share one line so the preview keeps the
     height; the actions stay at the trailing edge. */
  .panel-header.short-landscape {
    min-height: var(--min-touch-target);
    padding: 2px 12px;
  }

  .panel-header.short-landscape .header-info {
    flex-direction: row;
    align-items: baseline;
    gap: 8px;
  }

  .beta-swap {
    display: flex;
    align-items: center;
    flex: 1 1 auto;
    min-width: 0;
  }

  .key-hint {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.1rem;
    padding: 0 0.25rem;
    border-radius: 4px;
    border: 1px solid currentColor;
    font-family: inherit;
    font-size: var(--font-size-compact, 0.7rem);
    font-weight: 600;
    line-height: 1.3;
    opacity: 0.8;
  }

  /* A key hint only helps where there is a keyboard. */
  @media (hover: none) {
    .key-hint {
      display: none;
    }
  }

  .panel-header h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--theme-text);
  }

  .subtitle {
    font-size: 0.8rem;
    color: var(--theme-text-muted, var(--theme-text-dim));
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .cascade-indicator {
    color: var(--theme-accent, #60a5fa);
    font-size: 0.75rem;
    opacity: 0.9;
    transition: opacity var(--duration-fast) var(--ease-standard);
  }

  .cascade-indicator.pulse {
    animation: cascade-pulse var(--duration-emphasis) var(--ease-standard-out);
  }

  @keyframes cascade-pulse {
    0% {
      opacity: 1;
      transform: scale(1.15);
    }
    100% {
      opacity: 0.9;
      transform: scale(1);
    }
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  /* Compact header: one 44px row. The 36px actions sit in 4px of padding and
     the "+N steps" line stays under the title in the same cell (title 18px,
     gap 2, line 15). Admin-only extras may wrap to another line. */
  .panel-header.compact {
    flex-wrap: wrap;
    gap: 6px;
    padding: 4px 12px;
  }

  .panel-header.compact .header-info {
    flex: 1 1 0;
  }

  /* The title gets the row's spare width. A stretching β⇄ box cut
     "Editing step 5" to "Editing ste…" at 360. */
  .panel-header.compact .beta-swap {
    flex: 0 0 auto;
  }

  .panel-header.compact h2 {
    overflow: hidden;
    line-height: 1.15;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .panel-header.compact .subtitle {
    line-height: 1.2;
  }

  .panel-header.compact .icon-btn {
    width: var(--alt-touch-target, 36px);
    height: var(--alt-touch-target, 36px);
    min-width: 0;
    min-height: 0;
  }

  /* The drawer's own close-button treatment (DrawerHeader.svelte): a flat
     round with the card tint and stroke, the glyph carrying the meaning. The
     destructive action is told apart by its glyph color, not a filled badge. */
  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    border-radius: 50%;
    cursor: pointer;
    font-size: var(--font-size-base);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard);
  }

  .icon-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text, #fff);
  }

  .icon-btn:active {
    transform: scale(0.95);
  }

  .icon-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #3b82f6);
    outline-offset: 2px;
  }

  .icon-btn.inspect {
    color: var(--theme-accent, #60a5fa);
  }

  .delete-action :global(.panel-btn) {
    gap: 6px;
    white-space: nowrap;
  }

  /* Tall form (no form class): the title and red line wrap, two lines at
     most and balanced, instead of being cut. The header grows by what they
     need and the chooser takes it from the picture (tallHeaderExtraHeight in
     editor-layout.ts). The below form wraps them too: its 150px title column
     beside the picture is mostly empty, so a second line costs nothing. A
     language whose words fit on one line is unchanged. */
  .editor-layout.phone:not(.form-side, .form-column, .form-stack)
    .panel-header.compact
    :is(h2, .delete-scope) {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
    text-wrap: balance;
  }

  /* The scope line reads as part of the warning, in the pill's red. */
  .delete-scope {
    min-width: 0;
    color: color-mix(in srgb, var(--semantic-error) 70%, var(--theme-text));
    font-size: var(--font-size-compact);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ============================================================================
     PREVIEW SECTION - Pictograph preview (both mobile and desktop)
     ============================================================================ */

  .preview-section {
    padding: 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    flex: 1 1 0;
    min-height: 0;
    overflow: hidden;
    /* Enable container queries for responsive pictograph sizing */
    container-type: size;
  }

  /* Mobile: tighter padding, fill available space */
  .preview-section.mobile {
    padding: 12px;
    flex: 1 1 auto;
  }

  /* Short landscape: the preview sits beside the controls and keeps at least
     a readable square; the controls column takes what is left. */
  .editor-content.short-landscape {
    flex-direction: row;
  }

  .preview-section.short-landscape {
    flex: 1 1 auto;
    min-width: 180px;
    padding: 8px;
  }

  .controls-section.short-landscape {
    flex: 0 1 auto;
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
    border-top: none;
    border-left: 1px solid var(--theme-stroke);
    overflow-y: auto;
  }

  .controls-section.short-landscape.duration-only {
    padding: 4px;
  }

  .pictograph-container {
    /* A one-count step fills the space as a square. A longer step keeps that
       height and widens by its duration, like its cell in the grid, until it
       meets the side; then both shrink together to keep its shape. */
    width: min(90cqw, calc(90cqh * var(--step-duration, 1)));
    height: min(calc(90cqw / var(--step-duration, 1)), 90cqh);
    /* Subtle container styling. The pictograph paints its own dark board and
       stroke; on the editor's themed surface it reads as a card, the way it
       does in the option picker and the sequence. */
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.02));
    border-radius: 12px;
  }

  /* Only a duration change eases the card; a resize or the panel's own
     motion keeps the card on the panel's edge. While it moves, the strip
     beside the narrower drawing takes the board's colour, so the board reads
     as one piece growing or shrinking. */
  .pictograph-container.duration-moving {
    background: var(--dm-pictograph-bg, var(--theme-card-bg));
    transition:
      width var(--duration-normal) var(--ease-standard),
      height var(--duration-normal) var(--ease-standard);
  }

  @media (prefers-reduced-motion: reduce) {
    .pictograph-container.duration-moving {
      transition: none;
    }
  }

  /* The placement grid frames its own board and carries a prompt line above it.
     Locking that pair inside a square card left a band of empty card under the
     board and read as a card sitting inside the panel's card. Aiming gets the
     whole preview area instead; the board still keeps itself square. */
  .pictograph-container.aiming {
    width: 100%;
    height: 100%;
    aspect-ratio: auto;
    background: none;
    border-radius: 0;
  }

  .start-placement-aim {
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  /* ============================================================================
     CONTROLS SECTION - Bottom controls area
     Must always fit both Blue and Red controls on mobile
     ============================================================================ */

  .controls-section {
    padding: 12px;
    padding-bottom: max(12px, env(safe-area-inset-bottom, 12px));
    flex-shrink: 0;
  }

  /* Mobile: controls take only what they need - step grid fills the rest */
  .controls-section.mobile {
    flex: 0 0 auto; /* Don't grow - take natural size only */
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    overflow-y: auto; /* Allow scrolling if absolutely necessary */
  }

  /* Duration already owns its spacing. Removing the second padded frame gives
     the pictograph that space without changing the start-placement editor. */
  .controls-section.mobile.duration-only {
    padding: 0;
    overflow: visible;
  }

  .no-selection {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 48px 24px;
    text-align: center;
    color: var(--theme-text-muted, var(--theme-text-dim));
  }

  .no-selection i {
    font-size: 2rem;
    opacity: 0.6;
  }

  .no-selection p {
    margin: 0;
    font-size: 0.9rem;
  }

  /* Small container height (< 600px) - tighter padding */
  @container step-editor (max-height: 600px) {
    .controls-section.mobile {
      padding: 6px;
    }

    .preview-section.mobile {
      padding: 8px;
    }
  }

  /* Fallback for browsers without container query support */
  @supports not (container-type: size) {
    @media (max-height: 700px) {
      .controls-section.mobile {
        padding: 8px;
      }
    }
  }

  /* ============================================================================
     PHONE (upright), tall arrangement: header 44 + picture + Duration 44. The
     picture square is min(width - 16, top zone - 88 - 12).
     ============================================================================ */

  .editor-layout.phone .preview-section.mobile {
    padding: 6px 8px;
  }

  .editor-layout.phone .pictograph-container:not(.aiming) {
    width: min(100cqw, calc(100cqh * var(--step-duration, 1)));
    height: min(calc(100cqw / var(--step-duration, 1)), 100cqh);
  }

  .editor-layout.phone .controls-section.mobile:not(.duration-only) {
    padding: 6px;
    padding-bottom: max(6px, env(safe-area-inset-bottom, 6px));
  }

  /* ============================================================================
     PHONE (upright), picture-beside arrangements. editor-layout.ts picks one
     and its square as --phone-board; the comments there hold the sums.
     ============================================================================ */

  /* Shared by the step's side, column and below forms and the start's side
     form: the picture at the left, the header in the column beside it. */
  .editor-layout.phone:is(.form-side, .form-column, .form-below) {
    display: grid;
    grid-template-columns: var(--phone-board) minmax(0, 1fr);
    column-gap: 6px;
    row-gap: 4px;
    padding: 4px;
  }

  .editor-layout.phone:is(.form-side, .form-column, .form-below)
    .editor-content {
    display: contents;
  }

  .editor-layout.phone:is(.form-side, .form-column, .form-below) .panel-header {
    grid-column: 2;
    grid-row: 1;
    align-content: flex-start;
    justify-content: flex-start;
    gap: 4px 6px;
    min-height: 0;
    padding: 0;
  }

  /* The title block keeps its own line; the actions follow under it (a step:
     beta swap, trash and Done; the start: Done beside the title when it
     fits). */
  .editor-layout.phone:is(.form-side, .form-column, .form-below)
    .panel-header
    .header-info {
    flex: 1 0 auto;
    max-width: 100%;
  }

  .editor-layout.phone:is(.form-side, .form-column, .form-below) .beta-swap {
    flex: 0 0 auto;
  }

  .editor-layout.phone:is(.form-side, .form-column, .form-below)
    .header-actions {
    flex-wrap: wrap;
  }

  .editor-layout.phone:is(.form-side, .form-column, .form-below)
    .preview-section.mobile {
    grid-column: 1;
    grid-row: 1 / -1;
    align-self: start;
    width: var(--phone-board);
    height: var(--phone-board);
    padding: 0;
  }

  .editor-layout.phone:is(.form-side, .form-column, .form-below)
    .controls-section.mobile,
  .editor-layout.phone:is(.form-side, .form-column, .form-below)
    .controls-section.mobile:not(.duration-only) {
    min-width: 0;
    padding: 0;
  }

  /* Side (step): title, actions, then the five-across Duration, top down. */
  .editor-layout.phone.form-side {
    grid-template-rows: auto auto minmax(0, 1fr);
    padding: 6px;
  }

  .editor-layout.phone.form-side .controls-section.mobile {
    grid-column: 2;
    grid-row: 2;
  }

  /* Column: Duration (fine pair over coarse pair) sits at the foot of the
     column, level with the bottom of the picture. */
  .editor-layout.phone.form-column {
    grid-template-rows: auto minmax(0, 1fr);
  }

  .editor-layout.phone.form-column .controls-section.mobile {
    grid-column: 2;
    grid-row: 2;
    justify-content: flex-end;
  }

  /* Below: the picture and the title share the top; Duration takes the full
     width under both. */
  .editor-layout.phone.form-below {
    grid-template-rows: minmax(0, 1fr) auto;
  }

  .editor-layout.phone.form-below .preview-section.mobile {
    grid-row: 1;
  }

  .editor-layout.phone.form-below .controls-section.mobile {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  /* The start's side form: the board carries its prompt line above it, so
     its column runs the full height and PropPlacementGrid squares the board
     inside. The controls stand under the header in the other column. */
  .editor-layout.phone.start.form-side {
    grid-template-rows: auto auto minmax(0, 1fr);
  }

  .editor-layout.phone.start.form-side .preview-section.mobile {
    align-self: stretch;
    height: auto;
  }

  /* Stack (start): title, hand picker and Done share the first row (the
     picker comes from StartPlacementEditMode into the "pick" cell), the
     prompt and board take what is left, and the Location and Orientation
     card closes the column. */
  .editor-layout.phone.form-stack {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    grid-template-rows: auto minmax(0, 1fr) auto;
    grid-template-areas:
      "info pick act"
      "board board board"
      "ctrl ctrl ctrl";
    gap: 4px 6px;
    padding: 4px;
    padding-bottom: max(4px, env(safe-area-inset-bottom, 4px));
  }

  .editor-layout.phone.form-stack .panel-header,
  .editor-layout.phone.form-stack .editor-content,
  .editor-layout.phone.form-stack .controls-section.mobile {
    display: contents;
  }

  /* The header row's outer cells sit 12px from the edges, as the step
     editor's title does: the layout's 4px plus 8px of their own. Only the
     first row takes it, so the board keeps its size. */
  .editor-layout.phone.form-stack .header-info {
    grid-area: info;
    align-self: center;
    padding-inline-start: 8px;
  }

  .editor-layout.phone.form-stack .header-actions {
    grid-area: act;
    padding-inline-end: 8px;
  }

  /* The header box is gone in this form, so the tour's dimming goes to its
     parts. */
  .editor-layout.phone.form-stack .panel-header.tour-dim > * {
    opacity: 0.25;
    pointer-events: none;
  }

  .editor-layout.phone.form-stack .preview-section.mobile {
    grid-area: board;
    padding: 0;
  }

  .tour-section {
    border-radius: 8px;
  }

  .tour-dim {
    opacity: 0.25;
    pointer-events: none;
    transition: opacity var(--duration-emphasis) var(--ease-standard);
  }

  .tour-highlight {
    position: relative;
    z-index: 50;
    opacity: 1;
    box-shadow:
      0 0 0 2px
        color-mix(in srgb, var(--feature-edit, #8b5cf6) 70%, transparent),
      0 0 24px 4px
        color-mix(in srgb, var(--feature-edit, #8b5cf6) 35%, transparent);
    border-radius: 8px;
    transition:
      opacity var(--duration-emphasis) var(--ease-standard),
      box-shadow var(--duration-emphasis) var(--ease-standard);
  }

  @media (prefers-reduced-motion: reduce) {
    .icon-btn {
      transition: none;
    }

    .cascade-indicator {
      transition: none;
    }

    .cascade-indicator.pulse {
      animation: none;
    }

    .tour-dim,
    .tour-highlight {
      transition: none;
    }
  }
</style>
