<!--
BaseCard.svelte - Base component for all setting cards
Provides consistent styling and interaction patterns for all generation setting cards
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { attachRipple } from "#lib/shared/application/services/ripple-effect.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import { onMount } from "svelte";
  import CardHeader from "./shared/CardHeader.svelte";

  let {
    title,
    currentValue,
    color = "var(--semantic-info)",
    shadowColor = "0deg 0% 0%", // HSL color for shadows (hue, saturation, lightness)
    clickable = true,
    gridColumnSpan = 2,
    cardIndex = 0, // For stagger animations
    headerFontSize = "9px",
    appearance = "vivid",
    ariaLabel,
    onClick,
    triggerProps,
    children,
  } = $props<{
    title: string;
    currentValue: string;
    icon?: string;
    description?: string;
    color?: string;
    shadowColor?: string; // HSL format: "220deg 60% 50%"
    clickable?: boolean;
    gridColumnSpan?: number;
    cardIndex?: number; // Index for stagger animations
    headerFontSize?: string;
    appearance?: "vivid" | "quiet";
    ariaLabel?: string;
    onClick?: () => void;
    /**
     * Attributes from a headless trigger (bits-ui Popover/Dropdown `child`
     * snippet) to apply to the card itself. Spread last, so the library owns
     * activation and `data-state` while the card keeps its own look. Without
     * this a card that opens a menu has to be rebuilt as a bare button, which
     * is how parallel card chrome starts.
     */
    triggerProps?: Record<string, unknown>;
    children?: import("svelte").Snippet;
  }>();

  let hapticService: HapticFeedback;
  let cardElement: HTMLDivElement | null = $state(null);

  onMount(() => {
    hapticService = getHapticFeedback();

    if (clickable && cardElement) {
      return attachRipple(cardElement, {
        color: "rgba(255, 255, 255, 0.25)",
        duration: 350,
        opacity: 0.15,
      });
    }
    return undefined;
  });

  function handleClick() {
    if (clickable && onClick) {
      hapticService?.trigger("selection");
      onClick();
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (clickable && onClick && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      handleClick();
    }
  }
</script>

{#if clickable}
  <div
    bind:this={cardElement}
    class="base-card clickable"
    class:cap-card={title === "LOOP Type"}
    class:quiet={appearance === "quiet"}
    role="button"
    tabindex="0"
    onclick={handleClick}
    onkeydown={handleKeydown}
    aria-label={ariaLabel ??
      t("create_deep_card_change_aria", { title, value: currentValue })}
    {...triggerProps}
    style="--card-color: {color}; --shadow-color: {shadowColor}; --card-index: {cardIndex}; grid-column: span {gridColumnSpan};"
  >
    <CardHeader {title} {headerFontSize} />

    <!-- Current Value Display -->
    <div class="card-value">
      {currentValue}
    </div>

    <!-- Optional Custom Content -->
    {#if children}
      <div class="card-content">
        {@render children()}
      </div>
    {/if}

    <!-- Click Indicator -->
    {#if clickable}
      <div class="click-indicator" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>
    {/if}
  </div>
{:else}
  <div
    class="base-card"
    class:quiet={appearance === "quiet"}
    aria-label={ariaLabel ?? `${title}: ${currentValue}`}
    style="--card-color: {color}; --shadow-color: {shadowColor}; --card-index: {cardIndex}; grid-column: span {gridColumnSpan};"
  >
    <CardHeader {title} {headerFontSize} />

    <!-- Current Value Display -->
    <div class="card-value">
      {currentValue}
    </div>

    <!-- Optional Custom Content -->
    {#if children}
      <div class="card-content">
        {@render children()}
      </div>
    {/if}
  </div>
{/if}

<style>
  .base-card {
    /* Enable container queries for intelligent responsive sizing */
    container-type: size;
    container-name: base-card;

    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;

    /* Flexible height - let grid control it */
    min-height: 0;
    height: 100%; /* Fill grid cell */

    min-width: 0; /* Allow grid to control width, prevent content expansion */

    /* Container-aware padding - scales with card size */
    padding: clamp(6px, 2cqh, 12px) clamp(4px, 1.5cqw, 8px);

    /* Modern 2025 border-radius (16px sweet spot) */
    border-radius: 16px;
    background: var(--card-color);

    /* Touch optimization: eliminates 300ms tap delay, allows clicks with slight movement */
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;

    /* Layered shadows with color-matching (Josh Comeau technique) */
    /* First shadow creates subtle outline for definition on bright backgrounds */
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.12),
      0 1px 2px hsl(var(--shadow-color) / 0.15),
      0 2px 4px hsl(var(--shadow-color) / 0.12),
      0 4px 8px hsl(var(--shadow-color) / 0.1),
      /* Inner highlight for 3D effect */ inset 0 1px 0 var(--theme-stroke);

    transition:
      transform var(--duration-emphasis) cubic-bezier(0.4, 0, 0.2, 1),
      box-shadow var(--duration-emphasis) cubic-bezier(0.4, 0, 0.2, 1),
      filter var(--duration-emphasis) cubic-bezier(0.4, 0, 0.2, 1);
    overflow: visible; /* Allow hover effects to overflow and pop over neighbors */
    color: white;
    text-align: center;

    /* No entrance animation - cards rebuild on resize via headerFontSize dependency,
       which replays animations and causes visible opacity flashing */
  }

  .base-card.quiet {
    --text-color: var(--theme-text);
    --card-title-letter-spacing: 0;
    --card-title-transform: none;
    border: 1px solid var(--theme-stroke);
    background: var(--theme-card-bg);
    box-shadow: none;
    color: var(--theme-text);
  }

  .base-card.quiet::after {
    display: none;
  }

  .base-card.quiet .card-value {
    color: var(--theme-text);
    text-shadow: none;
  }

  /* 🌟 GLOSSY SHEEN OVERLAY - Creates 3D glass effect */
  .base-card::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 60%; /* Cover top 60% */
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--theme-text) 30%, transparent) 0%,
      color-mix(in srgb, var(--theme-text) 15%, transparent) 40%,
      color-mix(in srgb, var(--theme-text) 5%, transparent) 70%,
      transparent 100%
    );
    border-radius: 16px 16px 0 0;
    pointer-events: none;
    z-index: 1; /* Above background, below content */
  }

  /* 🖱️ DESKTOP HOVER - Only on hover-capable devices (prevents mobile stuck hover) */
  @media (hover: hover) {
    .base-card.quiet.clickable:hover {
      border-color: var(--theme-stroke-strong);
      background: var(--theme-card-hover-bg);
      box-shadow: none;
      filter: none;
      transform: translateY(-1px);
    }

    .base-card.clickable:hover {
      transform: scale(1.02);
      filter: brightness(1.05);
      box-shadow:
        0 2px 4px hsl(var(--shadow-color) / 0.12),
        0 4px 8px hsl(var(--shadow-color) / 0.1),
        0 8px 16px hsl(var(--shadow-color) / 0.08),
        0 16px 24px hsl(var(--shadow-color) / 0.06),
        inset 0 1px 0 var(--theme-stroke);
    }
  }

  /* 🎯 ELASTIC PRESS - Universal click/tap feedback for ALL devices */
  .base-card.clickable:active {
    transform: scale(0.97);
    transition: transform var(--duration-instant) cubic-bezier(0.4, 0, 0.2, 1);
  }

  .base-card.quiet.clickable:active {
    animation: none;
    box-shadow: none;
    transform: scale(0.99);
  }

  .base-card.clickable {
    cursor: pointer;
  }

  /* Move hover effect inside media query to prevent mobile "stuck hover" */
  @media (hover: hover) {
    .base-card.clickable:hover {
      /* Lift effect - increase elevation */
      transform: translateY(-2px);

      /* 🌟 GLOW EFFECT - Color-matched glow on hover */
      box-shadow:
        0 2px 4px hsl(var(--shadow-color) / 0.12),
        0 4px 8px hsl(var(--shadow-color) / 0.1),
        0 8px 16px hsl(var(--shadow-color) / 0.08),
        0 16px 24px hsl(var(--shadow-color) / 0.06),
        0 0 40px hsl(var(--shadow-color) / 0.25); /* Soft glow */

      /* Subtle brightness increase */
      filter: brightness(1.08);
    }
  }

  .base-card.clickable:active {
    /* 🎯 SPRING PHYSICS - Press down with scale */
    transform: translateY(0) scale(0.98);

    /* Reduced shadow on press with color-matching */
    box-shadow:
      0 1px 2px hsl(var(--shadow-color) / 0.18),
      0 2px 4px hsl(var(--shadow-color) / 0.15),
      inset 0 1px 0 var(--theme-stroke, var(--theme-stroke));

    /* Faster transition on press */
    transition: all var(--duration-instant) cubic-bezier(0.4, 0, 0.2, 1);

    /* 🎯 SPRING BOUNCE - Trigger bounce animation on release */
    animation: springBounce var(--duration-dramatic)
      cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  /* 🎯 Spring bounce animation - overshoot and settle */
  @keyframes springBounce {
    0% {
      transform: scale(0.98);
    }
    50% {
      transform: scale(1.02); /* Slight overshoot */
    }
    100% {
      transform: scale(1);
    }
  }

  .base-card:focus-visible {
    outline: 2px solid var(--theme-stroke-strong);
    outline-offset: 3px;
  }

  .card-value {
    /* Use shared card text styling from parent container */
    font-size: var(--card-text-size);
    font-weight: var(--card-text-weight);
    letter-spacing: var(--card-text-spacing);
    text-shadow: var(--card-text-shadow);

    color: white;
    text-align: center;
    line-height: 1.1;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
    margin: clamp(2px, 0.5cqh, 4px) 0;
  }

  .card-content {
    margin-top: 12px;
    width: 100%;
  }

  .click-indicator {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 20px;
    height: 20px;
    color: var(--theme-stroke-strong, var(--theme-text-dim));
    opacity: 0;
    transition: opacity var(--duration-normal) ease;
  }

  @media (hover: hover) {
    .base-card.clickable:hover .click-indicator {
      opacity: 1;
    }
  }

  .click-indicator svg {
    width: 100%;
    height: 100%;
  }

  /* ✨ MAGICAL LOOP CARD - Animated Mesh Gradient */
  .base-card.cap-card {
    /* Use the gradient passed from LOOPCard component */
    background: var(--card-color) !important;
    background-size: 300% 300% !important;

    /* Apply mesh gradient flow animation */
    animation: meshGradientFlow 15s ease infinite !important;

    /* Standard shadow matching other cards - no purple glow */
    box-shadow:
      0 1px 2px hsl(var(--shadow-color) / 0.15),
      0 2px 4px hsl(var(--shadow-color) / 0.12),
      0 4px 8px hsl(var(--shadow-color) / 0.1),
      inset 0 1px 0 var(--theme-stroke) !important;
  }

  /* Mesh Gradient Flow Animation - Organic color movement */
  @keyframes meshGradientFlow {
    0%,
    100% {
      background-position: 0% 50%;
    }
    25% {
      background-position: 50% 100%;
    }
    50% {
      background-position: 100% 50%;
    }
    75% {
      background-position: 50% 0%;
    }
  }

  /* Enhanced shadow on hover - matching other cards - only on hover-capable devices */
  @media (hover: hover) {
    .base-card.cap-card:hover {
      animation: meshGradientFlow 15s ease infinite !important;

      box-shadow:
        0 2px 4px hsl(var(--shadow-color) / 0.12),
        0 4px 8px hsl(var(--shadow-color) / 0.1),
        0 8px 16px hsl(var(--shadow-color) / 0.08),
        0 16px 24px hsl(var(--shadow-color) / 0.06),
        inset 0 1px 0 var(--theme-stroke) !important;
    }
  }

  /* Desktop optimization removed - container query units handle smooth scaling automatically */

  /* Respect motion preferences - disable animations but keep glow */
  @media (prefers-reduced-motion: reduce) {
    .base-card.cap-card {
      animation: none !important;
      background-position: 0% 50% !important;
    }
  }

  /* 📱 LANDSLOOPE MOBILE: Adjust LOOP card styling for compact mode */
  @media (min-aspect-ratio: 17/10) and (max-height: 500px) {
    .base-card.cap-card {
      /* Let grid control height - no forced constraints */
      grid-row: span 1;
    }

    .base-card.cap-card .card-value {
      font-size: clamp(10px, 1.5vmin, 14px);
      margin: 0;
    }

    .base-card.cap-card .click-indicator {
      width: clamp(14px, 3cqw, 18px);
      height: clamp(14px, 3cqw, 18px);
      top: clamp(6px, 1cqh, 10px);
      right: clamp(6px, 1cqw, 10px);
    }
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .base-card {
      animation: none;
    }
    .cap-card {
      animation: none;
    }
    .clickable {
      animation: none;
    }
  }
</style>
