<!--
StepperLandscapeLayout.svelte - Landscape/horizontal stepper layout
Left half decrements, right half increments (horizontal layout)
Used when card aspect ratio is wide/landscape
-->
<script lang="ts">
  import CardHeader from "./shared/CardHeader.svelte";
  import LandscapeTouchZone from "./StepperCard/components/LandscapeTouchZone.svelte";
  import LandscapeStepperValue from "./StepperCard/components/LandscapeStepperValue.svelte";
  import LandscapeCardFooter from "./StepperCard/components/LandscapeCardFooter.svelte";

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

<!-- Landscape Mode: Touch Zones -->
<LandscapeTouchZone
  type="decrement"
  disabled={!canDecrement}
  onclick={handleDecrement}
  onkeydown={(e: KeyboardEvent) => handleKeydown(e, "decrement")}
  {title}
/>

<LandscapeTouchZone
  type="increment"
  disabled={!canIncrement}
  onclick={handleIncrement}
  onkeydown={(e: KeyboardEvent) => handleKeydown(e, "increment")}
  {title}
/>

<!-- Landscape Mode: Centered Value Display -->
<LandscapeStepperValue {displayValue} />

<!-- Landscape Mode: Content Layer -->
<div class="content-layer">
  <CardHeader {title} {headerFontSize} />
  <LandscapeCardFooter {subtitle} {description} />
</div>

<style>
  /* Content layer - sits above touch zones */
  .content-layer {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    width: 100%;
    height: 100%;
    z-index: 2;
    pointer-events: none;
  }
</style>
