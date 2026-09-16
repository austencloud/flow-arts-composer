<!--
PositionCard.svelte - Unified starting position selection card
Styled to match Generate module's card aesthetic
Supports Alpha, Beta, Gamma positions with Greek symbol pills
-->
<script lang="ts">
  import { attachRipple } from "$lib/shared/application/services/ripple-effect";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { onMount } from "svelte";
  import {
    type StartingPlacement,
    STARTING_PLACEMENTS_LIST,
  } from "$lib/shared/domain/models/sequence-parameters";

  let {
    value = null,
    allowNull = true,
    disabled = false,
    gridColumnSpan = 2,
    cardIndex = 0,
    onChange,
  }: {
    value?: StartingPlacement | null;
    allowNull?: boolean;
    disabled?: boolean;
    gridColumnSpan?: number;
    cardIndex?: number;
    onChange: (position: StartingPlacement | null) => void;
  } = $props();

  let hapticService: HapticFeedback | null = null;
  let cardElement: HTMLDivElement | null = $state(null);

  onMount(() => {
    hapticService = getHapticFeedback() ?? null;

    if (cardElement) {
      return attachRipple(cardElement, {
        color: "rgba(255, 255, 255, 0.25)",
        duration: 350,
        opacity: 0.15,
      });
    }
    return undefined;
  });

  function handlePositionClick(positionId: StartingPlacement) {
    if (disabled) return;
    hapticService?.trigger("selection");

    if (value === positionId && allowNull) {
      onChange(null);
    } else {
      onChange(positionId);
    }
  }

  const displayValue = $derived(
    value
      ? (STARTING_PLACEMENTS_LIST.find((p) => p.id === value)?.fullName ?? value)
      : "Any"
  );
</script>

<div
  bind:this={cardElement}
  class="position-card"
  class:disabled
  style="--card-index: {cardIndex}; grid-column: span {gridColumnSpan};"
  role="group"
  aria-label="Starting position selection"
>
  <div class="card-header">
    <span class="card-title">Position</span>
  </div>

  <div class="current-value">{displayValue}</div>

  <div class="pill-toggle">
    {#each STARTING_PLACEMENTS_LIST as position}
      <button
        class="pill-option"
        class:selected={value === position.id}
        onclick={() => handlePositionClick(position.id)}
        aria-label="{position.fullName} position"
        aria-pressed={value === position.id}
        {disabled}
      >
        <span class="pill-symbol">{position.symbol}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .position-card {
    container-type: size;
    container-name: position-card;

    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;

    /* Fill grid cell like Generate does */
    height: 100%;
    min-height: 80px;
    min-width: 0;

    padding: clamp(6px, 2cqh, 12px) clamp(4px, 1.5cqw, 8px);

    border-radius: 16px;
    background: radial-gradient(
      ellipse at top left,
      #a78bfa 0%,
      var(--theme-accent-strong) 40%,
      #6d28d9 100%
    );
    border: none;
    color: white;
    text-align: center;

    /* Layered shadows matching Generate */
    box-shadow:
      0 1px 2px hsl(263deg 70% 40% / 0.15),
      0 2px 4px hsl(263deg 70% 40% / 0.12),
      0 4px 8px hsl(263deg 70% 40% / 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);

    transition:
      box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: visible;

    animation: cardEnter var(--duration-dramatic) ease-out;
  }

  .position-card.disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  /* Glossy sheen overlay */
  .position-card::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 60%;
    background: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.3) 0%,
      rgba(255, 255, 255, 0.15) 40%,
      var(--theme-card-bg) 70%,
      rgba(255, 255, 255, 0) 100%
    );
    border-radius: 16px 16px 0 0;
    pointer-events: none;
    z-index: 1;
  }

  @media (hover: hover) {
    .position-card:hover {
      transform: scale(1.02);
      filter: brightness(1.05);
      box-shadow:
        0 2px 4px hsl(263deg 70% 40% / 0.12),
        0 4px 8px hsl(263deg 70% 40% / 0.1),
        0 8px 16px hsl(263deg 70% 40% / 0.08),
        0 16px 24px hsl(263deg 70% 40% / 0.06),
        inset 0 1px 0 rgba(255, 255, 255, 0.2);
    }
  }

  .position-card:active {
    transform: scale(0.97);
    transition: transform var(--duration-instant) cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes cardEnter {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .card-header {
    position: relative;
    z-index: 2;
    width: 100%;
    padding: clamp(3px, 0.8cqh, 6px) clamp(6px, 1.5cqw, 10px);
  }

  .card-title {
    font-size: clamp(8px, 2.5cqi, 11px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.2px;
    opacity: 0.9;
  }

  .current-value {
    position: relative;
    z-index: 2;
    font-size: clamp(16px, 5cqw, 28px);
    font-weight: 700;
    letter-spacing: 0.3px;
    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pill-toggle {
    position: relative;
    z-index: 2;
    display: flex;
    gap: clamp(4px, 1cqw, 8px);
    background: rgba(0, 0, 0, 0.2);
    padding: clamp(3px, 0.8cqh, 5px);
    border-radius: 100px;
    margin-top: auto;
  }

  .pill-option {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: clamp(32px, 8cqw, 44px);
    min-height: clamp(28px, 6cqh, 36px);
    padding: 0 clamp(8px, 2cqw, 12px);
    background: transparent;
    border: none;
    border-radius: 100px;
    color: var(--theme-text-dim);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .pill-option:hover:not(.selected):not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    color: var(--theme-text);
  }

  .pill-option.selected {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.95));
    color: #6d28d9;
    box-shadow: 0 2px 8px var(--theme-shadow);
  }

  .pill-option:active:not(:disabled) {
    transform: scale(0.95);
  }

  .pill-option:disabled {
    cursor: not-allowed;
  }

  .pill-symbol {
    font-size: clamp(12px, 3cqw, 16px);
    font-weight: 600;
  }

  @media (prefers-reduced-motion: reduce) {
    .position-card {
      animation: none;
      transition: none;
    }
    .pill-option {
      transition: none;
    }
  }
</style>
