<!--
  FanStyleOptions.svelte
  The fan look (Pictograph, DoodleGrip Fire, Lotus Fire, DoodleGrip Day,
  Moon LED, plus the cover where a build has one), opened from the prop
  grid's look chip once a fan is selected. Bound to the shared fanAppearance
  setting, which the 2D canvas and the 3D scene both read. The frame color
  is a 3D-only detail and stays out of this 2D control.
-->
<script lang="ts">
  import FanAppearancePicker from "$lib/shared/pictograph/prop/components/FanAppearancePicker.svelte";
  import {
    normalizeFanAppearance,
    type FanAppearance,
  } from "$lib/shared/pictograph/prop/domain/fan-appearance";

  let {
    fill = false,
    horizontal = false,
    appearance,
    onchange,
  }: {
    /**
     * The host has given this chooser a definite height (the drilled view of
     * a bounded picker). The build and cover cards then share that height
     * instead of sitting at their natural size above empty space.
     */
    fill?: boolean;
    horizontal?: boolean;
    appearance: FanAppearance;
    onchange: (appearance: FanAppearance) => void;
  } = $props();

  const normalizedAppearance = $derived(normalizeFanAppearance(appearance));
  function change(next: FanAppearance): void {
    onchange(normalizeFanAppearance(next));
  }
</script>

<div
  class="fan-style-options"
  class:fill
  class:horizontal
  data-testid="fan-style-options"
>
  <FanAppearancePicker
    value={normalizedAppearance}
    onchange={change}
    frameColor={false}
    compact
  />
</div>

<style>
  .fan-style-options {
    container-type: inline-size;
    flex: 0 0 auto;
    min-width: 0;
    width: 100%;
  }

  /* The compact drill owns one visual rail, so its cards never split into a
     second cover row. */
  .fan-style-options :global(.fan-appearance-picker) {
    --build-option-count: 7;
  }

  @container (max-width: 539px) {
    .fan-style-options :global(.option-label) {
      min-height: 0;
      padding: 6px 8px;
      font-size: 11.5px;
      line-height: 1.15;
      white-space: normal;
    }
  }

  /* Five build names share one row here, so the label runs tighter than
     the inspector's full-width cards. */
  .fan-style-options :global(.option-label) {
    padding-inline: 10px;
    font-size: 12.5px;
  }

  /* Bounded hosts give the single compact choice rail all available height. */
  .fan-style-options.fill {
    height: 100%;
    min-height: 0;
  }

  .fan-style-options.fill :global(.fan-appearance-picker) {
    height: 100%;
    min-height: 0;
  }

  .fan-style-options.fill :global(.build-choice),
  .fan-style-options.fill :global(.modifier-grid),
  .fan-style-options.fill :global(.modifier-grid > div) {
    height: 100%;
    min-height: 0;
  }

  .fan-style-options.fill :global(.picker) {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .fan-style-options.fill :global(.option-grid) {
    flex: 1;
    min-height: 0;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-auto-rows: minmax(0, 1fr);
  }

  .fan-style-options.fill :global(.option) {
    height: 100%;
    min-height: 0;
  }

  .fan-style-options.fill :global(.preview-frame) {
    height: 100%;
    min-height: 0;
    aspect-ratio: auto;
  }
  .fan-style-options.horizontal {
    container-type: size;
    height: 100%;
    min-height: 0;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    scroll-snap-type: x proximity;
    padding: 2px 2px 8px;
  }
  .fan-style-options.horizontal :global(.fan-appearance-picker) {
    container-type: normal;
    display: flex;
    gap: 20px;
    width: max-content;
    min-width: 100%;
    height: 100%;
  }
  .fan-style-options.horizontal :global(.build-choice),
  .fan-style-options.horizontal :global(.modifier-grid) {
    flex: 0 0 auto;
    height: 100%;
    min-height: 0;
  }
  .fan-style-options.horizontal :global(.picker) {
    height: 100%;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
  }
  .fan-style-options.horizontal :global(.picker.headingless) {
    grid-template-rows: minmax(0, 1fr);
  }
  .fan-style-options.horizontal :global(.option-grid) {
    grid-template-columns: none;
    grid-auto-flow: column;
    grid-auto-columns: clamp(9.5rem, 28cqw, 13rem);
    grid-template-rows: minmax(0, 1fr);
    gap: 10px;
    min-height: 0;
  }
  .fan-style-options.horizontal :global(.option) {
    scroll-snap-align: start;
    min-height: 44px;
  }
  .fan-style-options.horizontal :global(.preview-frame) {
    height: 100%;
    min-height: 0;
    aspect-ratio: auto;
  }
  .fan-style-options.horizontal :global(.option-label) {
    font-size: var(--font-size-min, 14px);
    min-height: 44px;
    white-space: normal;
    overflow-wrap: anywhere;
    padding: 6px 10px;
  }
</style>
