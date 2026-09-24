<!--
  FanStyleOptions.svelte
  The fan look (Pictograph, DoodleGrip Fire, Lotus Fire, Flat Grip Fire,
  DoodleGrip Day, Moon LED, Star Fire, plus the covered DoodleGrip), opened
  from the prop grid's look chip once a fan is selected. Bound to the shared
  fanAppearance setting, which the 2D canvas and the 3D scene both read. The
  frame color is a 3D-only detail and stays out of this 2D control.
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

  let dragging = $state(false);
  let pointer: {
    id: number;
    x: number;
    scrollLeft: number;
    dragging: boolean;
  } | null = null;
  let suppressClick = false;

  function pointerDown(event: PointerEvent) {
    if (!horizontal || event.pointerType !== "mouse" || event.button !== 0)
      return;
    const rail = event.currentTarget as HTMLDivElement;
    if (rail.scrollWidth <= rail.clientWidth) return;
    pointer = {
      id: event.pointerId,
      x: event.clientX,
      scrollLeft: rail.scrollLeft,
      dragging: false,
    };
  }

  function pointerMove(event: PointerEvent) {
    if (!pointer || event.pointerId !== pointer.id) return;
    const distance = event.clientX - pointer.x;
    if (!pointer.dragging && Math.abs(distance) < 6) return;
    const rail = event.currentTarget as HTMLDivElement;
    if (!pointer.dragging) {
      pointer.dragging = true;
      dragging = true;
      rail.setPointerCapture(event.pointerId);
    }
    rail.scrollLeft = pointer.scrollLeft - distance;
    event.preventDefault();
  }

  function pointerEnd(event: PointerEvent) {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (pointer.dragging) {
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 0);
    }
    pointer = null;
    dragging = false;
  }

  function clickCapture(event: MouseEvent) {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }
</script>

<div
  class="fan-style-options"
  role="group"
  aria-label="Fan appearance choices"
  class:fill
  class:horizontal
  class:dragging
  data-testid="fan-style-options"
  onpointerdown={pointerDown}
  onpointermove={pointerMove}
  onpointerup={pointerEnd}
  onpointercancel={pointerEnd}
  onclickcapture={clickCapture}
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

  /*
    One card per look, as many across as the host affords: a 200px effects
    panel stacks them, a drawer seats three, a wide sheet four. The count is
    never fixed, so adding a build can only add a card, not shrink the rest.
  */
  .fan-style-options :global(.option-grid) {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 8.75rem), 1fr));
    gap: 10px;
  }

  /*
    Each compact preview is scaled so every fan reads at one size
    (imageScale). The tallest of them, the DoodleGrip at 1.92, stands 0.57
    card widths high, so a 3:2 frame holds it with air above and below
    instead of the 8:3 capture frame cropping its wicks.
  */
  .fan-style-options :global(.preview-frame) {
    aspect-ratio: 3 / 2;
    height: auto;
  }

  @media (max-height: 560px) {
    .fan-style-options :global(.preview-frame) {
      aspect-ratio: 5 / 3;
    }
  }

  /* The chosen look glows from behind. Screen blending lets the wash sit
     over captures that are opaque at the frame's own black, so it reads as
     light in the room rather than a tinted rectangle. */
  .fan-style-options :global(.preview-frame)::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 1;
    background: radial-gradient(
      62% 74% at 50% 56%,
      color-mix(in srgb, var(--prop-picker-accent) 62%, transparent),
      transparent 72%
    );
    opacity: 0;
    mix-blend-mode: screen;
    pointer-events: none;
    transition: opacity var(--duration-normal, 220ms) ease;
  }

  .fan-style-options :global(.option.selected .preview-frame)::after {
    opacity: 0.5;
  }

  .fan-style-options :global(.option-label) {
    padding: 9px 12px 10px;
    font-size: 13px;
  }

  /* Bounded hosts give the cards all available height to share. */
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

  /* Rows grow to share the height when there is room and never shrink
     below a card's natural size: a short phone drawer scrolls the grid
     instead of cropping every fan. The 3px inset keeps a lifted or ringed
     card's edge inside the scrollport. */
  .fan-style-options.fill :global(.option-grid) {
    flex: 1;
    min-height: 0;
    grid-auto-rows: minmax(min-content, 1fr);
    overflow-y: auto;
    overscroll-behavior-y: contain;
    padding: 3px;
    margin: -3px;
  }

  .fan-style-options.fill :global(.option) {
    height: 100%;
    min-height: 0;
  }

  /* A grid item with an aspect ratio aligns to the start by default, which
     would park the frame at the top of a tall card above a black band. It
     stretches instead, and `contain` gives the fan the extra room as air. */
  .fan-style-options.fill :global(.preview-frame) {
    align-self: stretch;
  }

  /* The rail scrolls its cards sideways under a compact toolbar. */
  .fan-style-options.horizontal {
    container-type: size;
    height: 100%;
    min-height: 0;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    scroll-snap-type: x proximity;
    touch-action: pan-x pinch-zoom;
    cursor: grab;
    padding: 2px 2px 8px;
  }
  .fan-style-options.horizontal.dragging {
    cursor: grabbing;
    scroll-snap-type: none;
    user-select: none;
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
    padding: 8px 12px 9px;
  }

  @media (prefers-reduced-motion: reduce) {
    .fan-style-options :global(.preview-frame)::after {
      transition: none;
    }
  }
</style>
