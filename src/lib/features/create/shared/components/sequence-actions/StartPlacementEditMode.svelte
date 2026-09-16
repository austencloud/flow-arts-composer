<!--
  StartPlacementEditMode.svelte

  Location and orientation controls for both props in the selected start
  placement. Location changes transform the prop through the whole sequence.
-->
<script lang="ts">
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { TargetHand } from "$lib/shared/create/domain/panel-types";
  import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import PropControlPair from "./PropControlPair.svelte";
  import MobileHandSelector from "./MobileHandSelector.svelte";
  import PropLocationControl from "./PropLocationControl.svelte";
  import PropOrientationControl from "./PropOrientationControl.svelte";

  interface Props {
    startPlacementData: StepData | null;
    stacked?: boolean;
    compact?: boolean;
    focused?: boolean;
    activeMoveHand?: HandSide | null;
    repositionDisabled?: boolean;
    isRepositioning?: boolean;
    onOrientationChange: (hand: HandSide, orientation: string) => void;
    onLocationRotate: (
      hand: HandSide,
      direction: "clockwise" | "counterclockwise"
    ) => void;
    onMoveProp: (hand: HandSide) => void;
  }

  let {
    startPlacementData,
    stacked = false,
    compact = false,
    focused = false,
    activeMoveHand = null,
    repositionDisabled = false,
    isRepositioning = false,
    onOrientationChange,
    onLocationRotate,
    onMoveProp,
  }: Props = $props();

  const leftMotion = $derived(startPlacementData?.motions?.[HandSide.LEFT]);
  const rightMotion = $derived(startPlacementData?.motions?.[HandSide.RIGHT]);
  const leftLocation = $derived(
    leftMotion?.startLocation ?? GridLocation.CENTER
  );
  const rightLocation = $derived(
    rightMotion?.startLocation ?? GridLocation.CENTER
  );
  const leftOrientation = $derived(leftMotion?.startOrientation ?? "in");
  const rightOrientation = $derived(rightMotion?.startOrientation ?? "in");
  let visibleHand = $state<TargetHand>("left");

  const HAND_OPTIONS: {
    hand: TargetHand;
    label: string;
    shortLabel: string;
  }[] = [
    { hand: "left", label: "Left", shortLabel: "Left" },
    { hand: "right", label: "Right", shortLabel: "Right" },
  ];

  // Stacked and focused layouts are both too narrow for two cards side by side,
  // so they share the hand picker and show one prop at a time.
  const usesHandPicker = $derived(stacked || focused);

  const statusMessage = $derived(
    isRepositioning
      ? "Updating every step."
      : repositionDisabled
        ? "Location controls are unavailable while a prop is at center."
        : ""
  );
</script>

{#snippet propControls(
  hand: HandSide,
  location: GridLocation,
  orientation: string
)}
  <div class="prop-controls">
    <div class="control-field">
      <span class="field-label">Location</span>
      <PropLocationControl
        hand={hand === HandSide.LEFT ? "left" : "right"}
        {location}
        active={activeMoveHand === hand}
        disabled={repositionDisabled || isRepositioning}
        {compact}
        onRotate={(direction) => onLocationRotate(hand, direction)}
        onChoose={() => onMoveProp(hand)}
      />
    </div>

    <div class="control-field">
      <span class="field-label">Orientation</span>
      <PropOrientationControl
        hand={hand === HandSide.LEFT ? "left" : "right"}
        {orientation}
        {compact}
        disabled={isRepositioning}
        onOrientationChange={(nextOrientation) =>
          onOrientationChange(hand, nextOrientation)}
        ghostKind="step-edit"
      />
    </div>
  </div>
{/snippet}

{#if !startPlacementData}
  <div class="empty-state">
    <i class="fas fa-compass" aria-hidden="true"></i>
    <p>No start placement selected</p>
  </div>
{:else}
  <section
    class="start-placement-controls"
    class:compact
    class:focused
    aria-busy={isRepositioning}
  >
    <p class="impact-message">Changes here update every step.</p>
    <span class="screen-reader-status" aria-live="polite">
      {statusMessage}
    </span>

    {#if usesHandPicker}
      <MobileHandSelector
        value={visibleHand}
        onChange={(hand) => (visibleHand = hand)}
        options={HAND_OPTIONS}
        ariaLabel="Choose start placement prop. Changes update every step."
        fullWidth
      />
    {/if}

    <PropControlPair
      {stacked}
      {compact}
      prominentLabels
      visibleHand={usesHandPicker ? visibleHand : "both"}
    >
      {#snippet leftContent()}
        {@render propControls(HandSide.LEFT, leftLocation, leftOrientation)}
      {/snippet}
      {#snippet rightContent()}
        {@render propControls(HandSide.RIGHT, rightLocation, rightOrientation)}
      {/snippet}
    </PropControlPair>
  </section>
{/if}

<style>
  .start-placement-controls {
    display: grid;
    gap: 10px;
    width: 100%;
    max-width: clamp(44rem, 72cqw, 68rem);
    margin-inline: auto;
  }

  .start-placement-controls.compact {
    gap: 6px;
  }

  .impact-message {
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: clamp(var(--font-size-min, 14px), 1cqw, 1.125rem);
    line-height: 1.35;
  }

  .screen-reader-status {
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

  .prop-controls {
    display: grid;
    gap: 12px;
    width: 100%;
  }

  .compact .prop-controls {
    gap: 8px;
  }

  /* A short landscape phone cannot show two full cards and leave room for the
     placement board. One prop stays mounted at a time, while its two fields
     share a row and the hand picker keeps the other prop one tap away. */
  .start-placement-controls.focused .prop-controls {
    --prop-cycle-compact-columns: var(--min-touch-target, 44px)
      minmax(52px, 1fr) var(--min-touch-target, 44px);
    --prop-cycle-compact-gap: 4px;
    --prop-cycle-value-gap: 4px;
    --prop-cycle-value-padding: 4px;

    /* Four orientation targets need 44px each, plus the shared control's
       padding and gaps, even beside Location in a short landscape panel. */
    grid-template-columns: minmax(0, 1fr) minmax(190px, 1fr);
    gap: 6px;
  }

  .start-placement-controls.focused .control-field {
    width: 100%;
    min-width: 0;
  }

  /* At this height the sentence costs a quarter of the usable preview. Its
     meaning remains in the hand picker's accessible name, while the regular
     layouts keep the visible reminder. */
  .start-placement-controls.focused .impact-message {
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

  .control-field {
    display: grid;
    gap: 6px;
    width: min(100%, clamp(18rem, 28cqw, 24rem));
    margin-inline: auto;
  }

  .field-label {
    color: var(--theme-text, #fff);
    font-size: clamp(var(--font-size-min, 14px), 1cqw, 1.125rem);
    font-weight: 650;
    line-height: 1.25;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 32px 16px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    text-align: center;
  }

  .empty-state i {
    font-size: 2rem;
    opacity: 0.5;
  }

  .empty-state p {
    margin: 0;
    font-size: var(--font-size-min, 14px);
  }
</style>
