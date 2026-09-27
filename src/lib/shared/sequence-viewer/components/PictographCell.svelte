<!--
  PictographCell.svelte

  Renders a single pictograph cell with loading state and playback highlighting.
  Handles clickable (button) vs non-clickable (div) rendering based on whether
  an onStepClick callback is provided. Start positions (index === -1) are always
  non-clickable.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";

  interface Props {
    index: number;
    label: string;
    imageUrl: string;
    isLoaded: boolean;
    darkMode?: boolean;
    showHighlight?: boolean;
    highlightedStepIndex?: number | null;
    onStepClick?: (stepIndex: number) => void;
    gridColumn?: number;
    gridRow?: number;
  }

  const {
    index,
    label,
    imageUrl,
    isLoaded,
    darkMode = false,
    showHighlight = false,
    highlightedStepIndex = null,
    onStepClick,
    gridColumn,
    gridRow,
  }: Props = $props();

  const isCurrent = $derived(showHighlight && highlightedStepIndex === index);
  const isPlayed = $derived(
    showHighlight &&
      highlightedStepIndex !== null &&
      index < highlightedStepIndex
  );
  const isClickable = $derived(!!onStepClick && index >= 0);
  const positionStyle = $derived(
    gridColumn !== undefined && gridRow !== undefined
      ? `grid-column: ${gridColumn}; grid-row: ${gridRow};`
      : ""
  );
</script>

{#if isClickable}
  <button
    class="pictograph-cell clickable"
    class:current={isCurrent}
    class:played={isPlayed}
    class:dark={darkMode}
    style={positionStyle}
    onclick={() => onStepClick!(index)}
    type="button"
    aria-label={t("browse_audit_go_to_step", { step: label })}
  >
    {#if isLoaded}
      <img class="cell-image" src={imageUrl} alt={label} draggable="false" />
    {:else}
      <div class="cell-spinner-container">
        <ProgressRing percent={-1} size={20} strokeWidth={2} />
      </div>
    {/if}
  </button>
{:else}
  <div
    class="pictograph-cell"
    class:current={isCurrent}
    class:played={isPlayed}
    class:dark={darkMode}
    style={positionStyle}
  >
    {#if isLoaded}
      <img class="cell-image" src={imageUrl} alt={label} draggable="false" />
    {:else}
      <div class="cell-spinner-container">
        <ProgressRing percent={-1} size={20} strokeWidth={2} />
      </div>
    {/if}
  </div>
{/if}

<style>
  .pictograph-cell {
    position: relative;
    aspect-ratio: 1;
    overflow: visible;
    transition:
      transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
      box-shadow 0.2s ease;
    box-sizing: border-box;
    border: 1px solid rgba(0, 0, 0, 0.08);
    background: none;
    padding: 0;
    margin: 0;
    font: inherit;
    color: inherit;
    cursor: default;
  }

  button.pictograph-cell {
    cursor: pointer;
  }

  .pictograph-cell.dark {
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .cell-image {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    -webkit-user-drag: none;
    user-select: none;
    /* Fade the pictograph in when it finishes loading instead of popping. */
    animation: cellImgIn var(--duration-fast, 150ms) ease;
  }
  @keyframes cellImgIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .cell-spinner-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    aspect-ratio: 1;
  }

  .pictograph-cell.clickable:hover {
    z-index: 5;
    transform: scale(1.02);
  }

  .pictograph-cell.clickable:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: -2px;
    z-index: 5;
  }

  /* Current step highlight with scale + glow */
  .pictograph-cell.current {
    z-index: 10;
    transform: scale(1.06);
    box-shadow:
      0 0 12px rgba(251, 191, 36, 0.6),
      0 0 0 3px rgba(251, 191, 36, 0.9);
    animation: cellSelectionGlowIn 0.4s ease-out forwards;
  }

  @keyframes cellSelectionGlowIn {
    0% {
      box-shadow:
        0 0 0 rgba(251, 191, 36, 0),
        0 0 0 0 rgba(251, 191, 36, 0);
      transform: scale(1);
    }
    50% {
      transform: scale(1.08);
    }
    100% {
      box-shadow:
        0 0 12px rgba(251, 191, 36, 0.6),
        0 0 0 3px rgba(251, 191, 36, 0.9);
      transform: scale(1.06);
    }
  }

  /* Showy depth — a soft cast shadow drops in beneath the focused cell. */
  .pictograph-cell.current::after {
    content: "";
    position: absolute;
    left: 8%;
    right: 8%;
    bottom: -9%;
    height: 16%;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.45);
    filter: blur(7px);
    z-index: -1;
    pointer-events: none;
    animation: cellShadowIn 0.32s ease-out forwards;
  }
  @keyframes cellShadowIn {
    from {
      opacity: 0;
      transform: translateY(-4px) scaleX(0.7);
    }
    to {
      opacity: 1;
      transform: translateY(0) scaleX(1);
    }
  }

  /* Played cells dim to distinguish from upcoming */
  .pictograph-cell.played {
    opacity: 0.6;
    transition: opacity 0.15s ease-out;
  }

  /* Light mode needs stronger dimming */
  .pictograph-cell:not(.dark).played {
    opacity: 0.4;
  }

  @media (prefers-reduced-motion: reduce) {
    .pictograph-cell {
      transition: none;
    }

    .pictograph-cell.current {
      animation: none;
      transform: scale(1);
    }

    .cell-image {
      animation: none;
    }

    .pictograph-cell.current::after {
      animation: none;
      opacity: 1;
    }
  }
</style>
