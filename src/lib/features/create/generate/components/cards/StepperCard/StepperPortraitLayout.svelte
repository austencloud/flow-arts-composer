<!--
PortraitLayout.svelte - Portrait/vertical stepper layout
Top half increments, bottom half decrements (vertical layout)
Used when card aspect ratio is tall/portrait
-->
<script lang="ts">
  import CardHeader from "../shared/CardHeader.svelte";
  import PortraitTouchZone from "./components/PortraitTouchZone.svelte";
  import StepperButtonVisual from "../shared/StepperButtonVisual.svelte";
  import StepperValue from "./components/StepperValue.svelte";
  import CardFooter from "./components/CardFooter.svelte";

  let {
    title,
    displayValue,
    subtitle = "",
    description = "",
    canIncrement,
    canDecrement,
    handleIncrement,
    handleDecrement,
    handleKeydown,
    headerFontSize = "var(--font-size-compact, 12px)",
  } = $props<{
    title: string;
    displayValue: string;
    subtitle?: string;
    description?: string;
    canIncrement: boolean;
    canDecrement: boolean;
    handleIncrement: () => void;
    handleDecrement: () => void;
    handleKeydown: (
      event: KeyboardEvent,
      action: "increment" | "decrement"
    ) => void;
    headerFontSize?: string;
  }>();
</script>

<div class="vertical-stepper">
  <!-- Portrait touch zones - top/bottom halves -->
  <PortraitTouchZone
    type="increment"
    {title}
    disabled={!canIncrement}
    onclick={handleIncrement}
    onkeydown={(e) => handleKeydown(e, "increment")}
  />

  <PortraitTouchZone
    type="decrement"
    {title}
    disabled={!canDecrement}
    onclick={handleDecrement}
    onkeydown={(e) => handleKeydown(e, "decrement")}
  />

  <CardHeader {title} {headerFontSize} />

  <div class="stepper-controls">
    <StepperButtonVisual type="increment" />
    <StepperValue {displayValue} />
    <StepperButtonVisual type="decrement" />
  </div>

  <CardFooter {subtitle} {description} />
</div>

<style>
  /* PORTRAIT MODE: Vertical Stepper Layout */
  .vertical-stepper {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    width: 100%;
    height: 100%;
    z-index: 2;
  }

  /* Portrait mode: Stepper controls - absolutely centered */
  .stepper-controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: clamp(4px, 1cqh, 6px);
    width: 100%;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 3;
    pointer-events: none;
  }

  /* Visual feedback when parent touch zone is interacted with */
  :global(
    .portrait-increment-zone:hover:not(:disabled)
      ~ .stepper-controls
      .increment-visual
  ),
  :global(
    .portrait-decrement-zone:hover:not(:disabled)
      ~ .stepper-controls
      .decrement-visual
  ) {
    background: color-mix(in srgb, var(--text-color) 25%, transparent);
    border-color: color-mix(in srgb, var(--text-color) 50%, transparent);
    transform: scale(1.05);
  }

  :global(
    .portrait-increment-zone:active:not(:disabled)
      ~ .stepper-controls
      .increment-visual
  ),
  :global(
    .portrait-decrement-zone:active:not(:disabled)
      ~ .stepper-controls
      .decrement-visual
  ) {
    background: color-mix(in srgb, var(--text-color) 35%, transparent);
    transform: scale(0.95);
  }
</style>
