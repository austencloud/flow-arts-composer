<!--
  Shared ordered prop placement for Learn and Construct.

  PictographContainer owns the visible grid and props. The focused state owners
  add placement history, aiming, keyboard targets, announcements, and haptics.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import {
    GridLocation,
    GridMode,
  } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { PropPlacementChange } from "$lib/shared/pictograph/grid/domain/prop-placement";
  import { getPlacementGridPoints } from "$lib/shared/pictograph/grid/services/placement-grid-points";
  import {
    buildPlacementPictographData,
    buildPlacementPrompt,
    computeGammaGuideArc,
    getPlacementGuideCoordinates,
  } from "$lib/shared/pictograph/grid/services/prop-placement-view-model";
  import { createPropPlacementAimState } from "$lib/shared/pictograph/grid/state/prop-placement-aim-state.svelte";
  import {
    createPropPlacementMotionState,
    type PlacementMotionMove,
  } from "$lib/shared/pictograph/grid/state/prop-placement-motion.svelte";
  import { createPropPlacementState } from "$lib/shared/pictograph/grid/state/prop-placement-state.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import {
    HandSide,
    Orientation,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import PropPlacementInteractionOverlay from "./PropPlacementInteractionOverlay.svelte";

  interface Props {
    gridMode: GridMode;
    leftPropType?: PropType;
    rightPropType?: PropType;
    leftOrientation?: Orientation;
    rightOrientation?: Orientation;
    initialLeftLocation?: GridLocation | null;
    initialRightLocation?: GridLocation | null;
    betaSwapped?: boolean;
    previewPictographData?: StepData | PictographData | null;
    /** An identified static position uses the normal in-pictograph letter glyph. */
    positionLetter?: PictographData["letter"];
    animateContent?: boolean;
    resetEpoch?: number;
    /** Epoch-counted committed location change to play as an in-place motion. */
    motionMove?: PlacementMotionMove | null;
    showCenter?: boolean;
    hitTargetRadius?: number;
    editAfterCompletion?: boolean;
    dragLocations?: boolean;
    disabled?: boolean;
    leftNoun?: string;
    rightNoun?: string;
    /** A teaching surface can own the instruction beside the board. Empty hides it. */
    promptText?: string;
    showUndo?: boolean;
    allowUndoAfterComplete?: boolean;
    renderTray?: boolean;
    showGuideLines?: boolean;
    guideLineType?: "alpha" | "beta" | "gamma";
    guideLineLocations?: {
      left: GridLocation;
      right: GridLocation;
    } | null;
    onChange?: (change: PropPlacementChange) => void;
    onPlacementComplete?: (leftLocation, rightLocation) => void;
    onOrientationChange?: (color: HandSide, orientation: Orientation) => void;
  }

  let {
    gridMode,
    leftPropType = PropType.HAND,
    rightPropType = PropType.HAND,
    leftOrientation = Orientation.IN,
    rightOrientation = Orientation.IN,
    initialLeftLocation = null,
    initialRightLocation = null,
    betaSwapped = false,
    previewPictographData = null,
    positionLetter,
    animateContent = false,
    resetEpoch = 0,
    motionMove = null,
    showCenter = false,
    hitTargetRadius = 75,
    editAfterCompletion = false,
    dragLocations = false,
    disabled = false,
    leftNoun = "left prop",
    rightNoun = "right prop",
    promptText,
    showUndo = true,
    allowUndoAfterComplete = true,
    renderTray = true,
    showGuideLines = false,
    guideLineType,
    guideLineLocations = null,
    onChange = () => {},
    onPlacementComplete,
    onOrientationChange,
  }: Props = $props();

  let hapticService: { trigger: (type: string) => void } | null = null;
  try {
    hapticService = getHapticFeedback() as {
      trigger: (type: string) => void;
    } | null;
  } catch {
    // Haptics are optional on desktop and during SSR.
  }

  const triggerHaptic = () => hapticService?.trigger("selection");
  const activePoints = $derived(getPlacementGridPoints(gridMode, showCenter));
  const canAim = $derived(!disabled && onOrientationChange !== undefined);

  const placement = createPropPlacementState(
    {
      getGridMode: () => gridMode,
      getShowCenter: () => showCenter,
      getInitialLeftLocation: () => initialLeftLocation,
      getInitialRightLocation: () => initialRightLocation,
      getResetEpoch: () => resetEpoch,
      getDisabled: () => disabled,
      getEditAfterCompletion: () => editAfterCompletion,
      getShowUndo: () => showUndo,
      getAllowUndoAfterComplete: () => allowUndoAfterComplete,
      getLeftOrientation: () => leftOrientation,
      getRightOrientation: () => rightOrientation,
      getLeftNoun: () => leftNoun,
      getRightNoun: () => rightNoun,
      getActivePoints: () => activePoints,
    },
    {
      triggerHaptic,
      onChange: (change) => onChange(change),
      onPlacementComplete: (left, right) => onPlacementComplete?.(left, right),
      onOrientationChange: (color, orientation) =>
        onOrientationChange?.(color, orientation),
    }
  );

  const aim = createPropPlacementAimState(
    placement,
    {
      getGridMode: () => gridMode,
      getActivePoints: () => activePoints,
      getCanAim: () => canAim,
      getCanDragLocations: () => dragLocations && !disabled,
      getEditAfterCompletion: () => editAfterCompletion,
      getLeftOrientation: () => leftOrientation,
      getRightOrientation: () => rightOrientation,
      getLeftPropType: () => leftPropType,
      getRightPropType: () => rightPropType,
      getBetaSwapped: () => betaSwapped,
    },
    {
      triggerHaptic,
      onOrientationChange: (color, orientation) =>
        onOrientationChange?.(color, orientation),
    }
  );

  const motion = createPropPlacementMotionState({
    getMove: () => motionMove,
    getGridMode: () => gridMode,
    getLeftPropType: () => leftPropType,
    getRightPropType: () => rightPropType,
    getLeftOrientation: () => leftOrientation,
    getRightOrientation: () => rightOrientation,
    getLeftLocation: () => placement.leftLocation,
    getRightLocation: () => placement.rightLocation,
    getBetaSwapped: () => betaSwapped,
    getPreviewPictographData: () => previewPictographData,
  });

  const prompt = $derived.by(() =>
    buildPlacementPrompt({
      disabled,
      isComplete: placement.isComplete,
      canAim,
      activeHand: placement.activeHand,
      dragHand: aim.dragHand,
      dragAim: aim.dragAim,
      hoverHand: aim.hoverHand,
      leftLocation: placement.leftLocation,
      rightLocation: placement.rightLocation,
      leftNoun,
      rightNoun,
    })
  );

  const pictographData = $derived.by(() =>
    buildPlacementPictographData({
      gridMode,
      leftLocation: placement.leftLocation,
      rightLocation: placement.rightLocation,
      leftOrientation: aim.shownLeftOrientation,
      rightOrientation: aim.shownRightOrientation,
      leftPropType,
      rightPropType,
      betaSwapped,
      previewPictographData,
    })
  );

  const pulseColor = $derived(
    placement.activeHand === HandSide.RIGHT
      ? "var(--prop-red, #ef4444)"
      : "var(--prop-blue, #3b82f6)"
  );
  const guideCoordinates = $derived(
    getPlacementGuideCoordinates(guideLineLocations)
  );
  const gammaArc = $derived(computeGammaGuideArc(guideCoordinates));

  $effect(() => {
    placement.synchronizeInputs();
  });

  $effect(() => {
    [resetEpoch, gridMode, disabled];
    untrack(() => aim.cancelLocationDrag());
  });

  $effect(() => {
    motion.synchronize();
  });

  $effect(() => {
    return () => motion.destroy();
  });

  $effect(() => {
    const pending = aim.pendingOrientation;
    if (!pending) return;
    if (
      placement.committedOrientationFor(pending.color) !== pending.orientation
    ) {
      return;
    }
    untrack(() => aim.retireCommittedPreview());
  });

  export function moveProp(color: HandSide) {
    placement.edit(color);
  }

  export function undoPlacement() {
    aim.cancelLocationDrag();
    placement.undo();
  }

  export function resetPlacement() {
    aim.cancelLocationDrag();
    placement.reset();
  }
</script>

<div
  data-edit-history-shortcut-scope
  class="placement-grid"
  class:disabled
  class:complete={placement.isComplete}
  class:has-tray={renderTray}
  class:board-only={promptText === "" && !renderTray}
  class:aiming={aim.dragHand !== null}
>
  {#if promptText ?? prompt.text}
    <p class="prompt-text" data-testid="placement-prompt">
      <span class="prompt-line">
        {#if promptText === undefined && prompt.parts}
          {prompt.parts.lead}
          <span
            class="prompt-noun"
            class:blue={prompt.parts.color === HandSide.LEFT}
            class:red={prompt.parts.color === HandSide.RIGHT}
            >{prompt.parts.noun}</span
          >{#if prompt.parts.aim}:
            <span class="prompt-aim">{prompt.parts.aim}</span>{/if}
        {:else}
          {promptText ?? prompt.text}
        {/if}
      </span>
    </p>
  {/if}

  <div class="grid-area">
    <div
      class="grid-wrapper"
      class:animating={motion.active}
      class:can-drag-locations={dragLocations}
      class:grabbed-left={aim.grabbedLocationColor === HandSide.LEFT}
      class:grabbed-right={aim.grabbedLocationColor === HandSide.RIGHT}
      class:drop-outside={aim.locationDragColor !== null && !aim.locationTarget}
      style:--placement-grab-color={aim.grabbedLocationColor === HandSide.RIGHT
        ? "var(--prop-red)"
        : "var(--prop-blue)"}
      class:dragging-left={aim.locationDragColor === HandSide.LEFT}
      class:dragging-right={aim.locationDragColor === HandSide.RIGHT}
      style:--placement-drag-x={`${aim.locationDragDelta.x}px`}
      style:--placement-drag-y={`${aim.locationDragDelta.y}px`}
      bind:this={aim.gridWrapper}
    >
      <div class="pictograph-layer">
        <PictographContainer
          pictographData={motion.step ??
            (positionLetter !== undefined
              ? { ...pictographData, letter: positionLetter }
              : pictographData)}
          gridMode={previewPictographData ? null : gridMode}
          showTKA={positionLetter !== undefined
            ? true
            : previewPictographData
              ? undefined
              : false}
          showReversals={previewPictographData ? undefined : false}
          showTnD={previewPictographData ? undefined : false}
          showElemental={previewPictographData ? undefined : false}
          showPositions={previewPictographData ? undefined : false}
          disableTransitions={true}
          {animateContent}
          directPropPositioning={aim.grabbedLocationColor !== null ||
            aim.landing !== null}
          cellIndex={null}
          leftPropTypeOverride={leftPropType}
          rightPropTypeOverride={rightPropType}
          motionStartData={motion.startData}
          motionProgress={motion.active ? motion.progress : null}
          arrowOpacity={motion.active ? 0 : 1}
        />
      </div>

      <PropPlacementInteractionOverlay
        {placement}
        {aim}
        {activePoints}
        {hitTargetRadius}
        {pulseColor}
        {leftNoun}
        {rightNoun}
        {showGuideLines}
        {guideLineType}
        {guideCoordinates}
        {gammaArc}
      />
    </div>
  </div>

  {#if renderTray}
    <div class="controls-tray" aria-label="Move a prop">
      {#if placement.isComplete && editAfterCompletion && !disabled}
        <button
          class="edit-button blue"
          class:active={placement.activeHand === HandSide.LEFT}
          onclick={() => placement.edit(HandSide.LEFT)}
          aria-pressed={placement.activeHand === HandSide.LEFT}
          aria-label={`Move ${leftNoun}`}
        >
          <span class="label-full" aria-hidden="true">Move left</span>
          <span class="label-short" aria-hidden="true">Left</span>
        </button>
        <button
          class="edit-button red"
          class:active={placement.activeHand === HandSide.RIGHT}
          onclick={() => placement.edit(HandSide.RIGHT)}
          aria-pressed={placement.activeHand === HandSide.RIGHT}
          aria-label={`Move ${rightNoun}`}
        >
          <span class="label-full" aria-hidden="true">Move right</span>
          <span class="label-short" aria-hidden="true">Right</span>
        </button>
      {/if}

      {#if placement.canUndo}
        <button
          data-undo-shortcut
          data-undo-shortcut-label="Placement"
          class="undo-button"
          onclick={placement.undo}
          aria-label="Undo placement"
        >
          Undo
        </button>
      {/if}
    </div>
  {/if}

  <div class="sr-only" aria-live="polite" aria-atomic="true">
    {placement.liveAnnouncement}
  </div>
</div>

<style>
  .placement-grid {
    display: grid;
    grid-template-areas:
      "prompt"
      "board"
      "tray";
    grid-template-rows: auto 1fr auto;
    justify-items: center;
    gap: 0.75rem;
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .placement-grid.disabled {
    pointer-events: none;
    opacity: 0.7;
  }

  .prompt-text {
    grid-area: prompt;
    align-self: center;
    margin: 0;
    min-height: 1.5em;
    color: var(--theme-text, rgba(255, 255, 255, 0.9));
    font-size: max(var(--font-size-min, 14px), 1rem);
    font-weight: 650;
    text-align: center;
  }

  .grid-area {
    grid-area: board;
    width: 100%;
    height: 100%;
    min-height: 8rem;
    display: flex;
    align-items: center;
    justify-content: center;
    container-type: size;
  }

  .grid-wrapper {
    position: relative;
    touch-action: none;
    width: min(100%, 100cqh);
    min-width: 8rem;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 12px;
    box-shadow: 0 4px 16px var(--theme-shadow, rgba(0, 0, 0, 0.3));
  }

  .pictograph-layer {
    width: 100%;
    height: 100%;
  }

  .dragging-left :global(.left-prop-svg),
  .dragging-right :global(.right-prop-svg) {
    translate: var(--placement-drag-x) var(--placement-drag-y);
    transition: none;
  }
  .dragging-left,
  .dragging-right {
    cursor: grabbing;
  }
  .grabbed-left :global(.left-prop-svg),
  .grabbed-right :global(.right-prop-svg) {
    filter: drop-shadow(0 5px 5px var(--theme-shadow))
      drop-shadow(0 0 5px var(--placement-grab-color));
  }
  .can-drag-locations.grabbed-left :global(.click-target),
  .can-drag-locations.grabbed-right :global(.click-target) {
    cursor: grabbing;
  }
  .can-drag-locations.drop-outside :global(.click-target) {
    cursor: not-allowed;
  }
  .can-drag-locations :global(.click-target.occupied) {
    cursor: grab;
  }

  /* Props are mid-flight: drag aiming reads live DOM transforms and would
     fight the animation, so the board ignores input until it lands (~350ms). */
  .grid-wrapper.animating {
    pointer-events: none;
  }

  .controls-tray {
    grid-area: tray;
    display: flex;
    gap: 8px;
    width: min(100%, 360px);
    min-height: var(--min-touch-target, 48px);
  }

  .controls-tray > * {
    flex: 1;
    min-width: 0;
  }

  .edit-button,
  .undo-button {
    min-height: var(--min-touch-target, 48px);
    padding: 8px 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border: 1.5px solid var(--theme-stroke);
    border-radius: 10px;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
    cursor: pointer;
  }

  .label-short {
    display: none;
  }

  .edit-button.blue {
    border-color: color-mix(
      in srgb,
      var(--prop-blue, #3b82f6) 45%,
      var(--theme-stroke)
    );
    color: color-mix(in srgb, var(--prop-blue, #3b82f6) 45%, var(--theme-text));
  }

  .edit-button.red {
    border-color: color-mix(
      in srgb,
      var(--prop-red, #ef4444) 45%,
      var(--theme-stroke)
    );
    color: color-mix(in srgb, var(--prop-red, #ef4444) 45%, var(--theme-text));
  }

  .edit-button.blue.active {
    border-color: color-mix(
      in srgb,
      var(--prop-blue, #3b82f6) 70%,
      var(--theme-stroke)
    );
    background: color-mix(in srgb, var(--prop-blue, #3b82f6) 15%, transparent);
    color: var(--theme-text);
  }

  .edit-button.red.active {
    border-color: color-mix(
      in srgb,
      var(--prop-red, #ef4444) 70%,
      var(--theme-stroke)
    );
    background: color-mix(in srgb, var(--prop-red, #ef4444) 15%, transparent);
    color: var(--theme-text);
  }

  .prompt-noun,
  .prompt-aim {
    font-weight: 750;
  }

  .prompt-aim {
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .prompt-noun.blue {
    color: color-mix(in srgb, var(--prop-blue, #3b82f6) 48%, white);
  }

  .prompt-noun.red {
    color: color-mix(in srgb, var(--prop-red, #ef4444) 62%, white);
  }

  .edit-button:focus-visible,
  .undo-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (min-width: 1680px) {
    .prompt-text {
      font-size: 1.25rem;
    }

    .edit-button,
    .undo-button {
      min-height: 3.25rem;
      font-size: 1.05rem;
    }

    .controls-tray {
      width: min(100%, 32rem);
      min-height: 3.25rem;
    }
  }

  @media (min-width: 2600px) {
    .prompt-text {
      font-size: 1.7rem;
    }

    .edit-button,
    .undo-button {
      min-height: 4rem;
      font-size: 1.3rem;
    }

    .controls-tray {
      width: min(100%, 44rem);
      min-height: 4rem;
    }
  }

  @container (max-width: 21em) {
    .edit-button,
    .undo-button {
      padding: 8px 6px;
    }

    .label-full {
      display: none;
    }

    .label-short {
      display: inline;
    }
  }

  @media (min-width: 1680px) {
    @container (max-width: 23em) {
      .label-full {
        display: none;
      }

      .label-short {
        display: inline;
      }
    }
  }

  @media (min-width: 2600px) {
    @container (max-width: 27em) {
      .label-full {
        display: none;
      }

      .label-short {
        display: inline;
      }
    }
  }

  @container (max-height: 520px) {
    .placement-grid {
      grid-template-areas:
        "prompt tray"
        "board board";
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-rows: auto 1fr;
      align-items: center;
      gap: 0.4rem 0.5rem;
    }

    .placement-grid.has-tray {
      width: min(100%, calc(100cqh - var(--min-touch-target, 48px) - 0.4rem));
      margin-inline: auto;
    }

    .prompt-text {
      min-height: var(--min-touch-target, 48px);
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1.2;
      font-size: var(--font-size-min, 14px);
    }

    .controls-tray {
      width: auto;
      justify-self: end;
    }

    .controls-tray > * {
      flex: 0 0 auto;
    }

    .placement-grid.complete.has-tray .prompt-text {
      display: none;
    }

    .placement-grid.complete.has-tray .controls-tray {
      grid-column: 1 / -1;
      justify-self: center;
    }

    .placement-grid.complete.aiming .prompt-text {
      display: flex;
      grid-column: 1 / -1;
    }

    .placement-grid.complete.aiming .controls-tray {
      display: none;
    }

    .edit-button {
      padding: 8px 12px;
    }

    .label-full {
      display: none;
    }

    .label-short {
      display: inline;
    }
  }
  .placement-grid.board-only {
    grid-template-areas: "board";
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    gap: 0;
  }
</style>
