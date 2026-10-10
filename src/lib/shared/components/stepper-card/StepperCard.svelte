<!--
StepperCard.svelte - Card with large touch-friendly increment/decrement zones
Automatically switches between portrait and landscape layouts based on card aspect ratio
Portrait: Top half increments, bottom half decrements (vertical layout)
Landscape: Left half decrements, right half increments (horizontal layout)
-->
<script lang="ts">
  import { attachRipple } from "#lib/shared/application/services/ripple-effect.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import { onMount } from "svelte";
  import LandscapeLayout from "./StepperLandscapeLayout.svelte";
  import PortraitLayout from "./StepperPortraitLayout.svelte";

  let {
    title,
    currentValue,
    minValue,
    maxValue,
    onIncrement,
    onDecrement,
    onIncrementBlocked,
    formatValue = (val: number) => val.toString(),
    subtitle = "",
    description = "",
    color = "var(--semantic-info)",
    shadowColor = "0deg 0% 0%",
    textColor = "white",
    gridColumnSpan = 2,
    cardIndex = 0,
    headerFontSize = "9px",
    appearance = "vivid",
  } = $props<{
    title: string;
    currentValue: number;
    minValue: number;
    maxValue: number;
    onIncrement: () => void;
    onDecrement: () => void;
    onIncrementBlocked?: () => void;
    formatValue?: (value: number) => string;
    subtitle?: string;
    description?: string;
    color?: string;
    shadowColor?: string;
    textColor?: string;
    gridColumnSpan?: number;
    cardIndex?: number;
    headerFontSize?: string;
    appearance?: "vivid" | "quiet";
  }>();

  let hapticService: HapticFeedback;
  let cardElement: HTMLDivElement | null = $state(null);
  let previousColor = $state("");
  let isTransitioning = $state(false);
  let fadeTimer: ReturnType<typeof setTimeout> | null = null;

  // Sync previousColor on mount
  $effect(() => {
    if (previousColor === "") {
      previousColor = color;
    }
  });

  onMount(() => {
    hapticService = getHapticFeedback();

    if (cardElement) {
      return attachRipple(cardElement, {
        color: "rgba(255, 255, 255, 0.25)",
        duration: 350,
        opacity: 0.15,
      });
    }
    return undefined;
  });

  function handleIncrement() {
    if (currentValue < maxValue) {
      hapticService?.trigger("selection");
      snapshotAndFade();
      onIncrement();
    } else if (onIncrementBlocked) {
      hapticService?.trigger("warning");
      onIncrementBlocked();
    }
  }

  function handleDecrement() {
    if (currentValue > minValue) {
      hapticService?.trigger("selection");
      snapshotAndFade();
      onDecrement();
    }
  }

  /** Capture the current color as "previous" BEFORE the parent changes the color prop */
  function snapshotAndFade() {
    if (!cardElement) return;
    if (fadeTimer) clearTimeout(fadeTimer);

    // Snapshot what's visible right now as the "from" state
    previousColor = color;
    isTransitioning = false;

    // Next frame: the parent will have updated the color prop,
    // so background shows the new color. ::before shows previousColor
    // at full opacity. Now fade it out.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        isTransitioning = true;
        fadeTimer = setTimeout(() => {
          previousColor = color;
          isTransitioning = false;
          fadeTimer = null;
        }, 400);
      });
    });
  }

  function handleKeydown(
    event: KeyboardEvent,
    action: "increment" | "decrement"
  ) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action === "increment" ? handleIncrement() : handleDecrement();
    }
  }

  const canIncrement = $derived(
    currentValue < maxValue || !!onIncrementBlocked
  );
  const canDecrement = $derived(currentValue > minValue);
  const displayValue = $derived(formatValue(currentValue));
</script>

<div
  bind:this={cardElement}
  class="stepper-card"
  class:transitioning={isTransitioning}
  class:quiet={appearance === "quiet"}
  style="--card-color: {color}; --prev-color: {previousColor}; --shadow-color: {shadowColor}; --text-color: {textColor}; --card-index: {cardIndex}; grid-column: span {gridColumnSpan};"
  role="group"
  aria-label={title}
>
  <!-- Portrait Mode: Shown by default, hidden in landscape via container query -->
  <div class="portrait-only">
    <PortraitLayout
      {title}
      {displayValue}
      {subtitle}
      {description}
      {canIncrement}
      {canDecrement}
      {handleIncrement}
      {handleDecrement}
      {handleKeydown}
      {headerFontSize}
    />
  </div>

  <!-- Landscape Mode: Hidden by default, shown in landscape via container query -->
  <div class="landscape-only">
    <LandscapeLayout
      {title}
      {displayValue}
      {subtitle}
      {description}
      {canIncrement}
      {canDecrement}
      {handleIncrement}
      {handleDecrement}
      {handleKeydown}
      {headerFontSize}
    />
  </div>
</div>

<style>
  .stepper-card {
    /* Enable container queries to detect card aspect ratio */
    container-type: size;
    container-name: stepper-card;

    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;

    height: 100%;
    min-height: 0;
    min-width: 0;

    /* Responsive padding - reduced minimums for small screens like iPhone SE */
    padding: clamp(3px, 1cqh, 12px) clamp(3px, 1.5cqw, 8px);

    /* Modern border-radius matching BaseCard */
    border-radius: 16px;
    background: var(--card-color);
    border: none;

    /* Layered shadows matching BaseCard + inner highlight for 3D depth */
    box-shadow:
      0 1px 2px hsl(var(--shadow-color) / 0.15),
      0 2px 4px hsl(var(--shadow-color) / 0.12),
      0 4px 8px hsl(var(--shadow-color) / 0.1),
      /* Inner highlight for 3D effect */ inset 0 1px 0 rgba(255, 255, 255, 0.2);

    /* Remove background transition - handled by ::before crossfade */
    transition:
      box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: visible; /* Allow hover effects to overflow and pop over neighbors */
    color: white;
    text-align: center;

    /* No entrance animation - cards rebuild on resize via headerFontSize dependency,
       which replays animations and causes visible opacity flashing */
  }

  .stepper-card.quiet {
    --text-color: var(--theme-text) !important;
    --card-title-letter-spacing: 0;
    --card-title-transform: none;
    --card-description-letter-spacing: 0;
    --card-description-transform: none;
    --card-description-size: var(--font-size-compact, 12px);
    --card-subtitle-size: var(--font-size-compact, 12px);
    --card-value-shadow: none;
    border: 1px solid var(--theme-stroke);
    background: var(--theme-card-bg);
    box-shadow: none;
    color: var(--theme-text);
  }

  .stepper-card.quiet::before,
  .stepper-card.quiet::after {
    display: none;
  }

  /* Gradient crossfade: ::before shows OLD gradient, background shows NEW gradient */
  .stepper-card::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--prev-color, var(--card-color)); /* Previous gradient */
    border-radius: 16px;
    opacity: 1; /* Start visible */
    z-index: -1;
    pointer-events: none;
    transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Trigger crossfade: fade out old gradient to reveal new */
  .stepper-card.transitioning::before {
    opacity: 0;
  }

  /* Glossy sheen overlay - Creates 3D glass effect */
  .stepper-card::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 60%; /* Cover top 60% */
    background: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.3) 0%,
      rgba(255, 255, 255, 0.15) 40%,
      transparent 70%,
      rgba(255, 255, 255, 0) 100%
    );
    border-radius: 16px 16px 0 0;
    pointer-events: none;
    z-index: 1; /* Above background, below content */
  }

  /* Desktop hover - Only on hover-capable devices */
  @media (hover: hover) {
    .stepper-card.quiet:hover {
      border-color: var(--theme-stroke-strong);
      background: var(--theme-card-hover-bg);
      box-shadow: none;
      filter: none;
      transform: translateY(-1px);
    }

    .stepper-card:hover {
      transform: scale(1.02);
      filter: brightness(1.05);
      box-shadow:
        0 2px 4px hsl(var(--shadow-color) / 0.12),
        0 4px 8px hsl(var(--shadow-color) / 0.1),
        0 8px 16px hsl(var(--shadow-color) / 0.08),
        0 16px 24px hsl(var(--shadow-color) / 0.06),
        inset 0 1px 0 rgba(255, 255, 255, 0.2);
    }
  }

  /* Elastic press - Universal click/tap feedback for ALL devices */
  .stepper-card:active {
    transform: scale(0.97);
    transition: transform var(--duration-instant) cubic-bezier(0.4, 0, 0.2, 1);
  }

  .stepper-card.quiet:active {
    box-shadow: none;
    transform: scale(0.99);
  }

  .stepper-card:focus-within {
    outline-offset: 3px;
  }

  /* Show/hide layouts based on aspect ratio */
  .portrait-only,
  .landscape-only {
    width: 100%;
    height: 100%;
  }

  /* Default: Show portrait layout */
  .portrait-only {
    display: flex !important;
  }

  .landscape-only {
    display: none !important;
  }

  /* Container query: Switch to landscape layout when card is wider */
  /* Trigger at aspect-ratio >9/10 (~1:1.2) - makes it willing to use side-by-side earlier */
  @container stepper-card (min-aspect-ratio: 9/10) {
    /* Hide portrait layout, show landscape layout */
    .portrait-only {
      display: none !important;
    }

    .landscape-only {
      display: flex !important;
    }
  }

  /* Desktop optimization: Trigger landscape layout earlier for better space usage */
  @media (min-width: 1280px) {
    @container stepper-card (min-aspect-ratio: 3/4) {
      .portrait-only {
        display: none !important;
      }

      .landscape-only {
        display: flex !important;
      }
    }
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .stepper-card {
      transition: none;
    }
  }
</style>
