<!--
VTGModePage - Individual VTG mode learning page
-->
<script lang="ts">
  import {
    VTG_MODES,
    VTG_MODE_INFO,
    type VTGMode,
  } from "../../../../domain/constants/vtg-experience-data";
  import VTGVisualizer from "../VTGVisualizer.svelte";
  import VTGModeDetails from "./VTGModeDetails.svelte";
  import VTGKeyPoint from "./VTGKeyPoint.svelte";
  import VTGModeSummary from "./VTGModeSummary.svelte";

  let {
    mode,
    isLastMode,
    onNext,
  }: {
    mode: VTGMode;
    isLastMode: boolean;
    onNext: () => void;
  } = $props();

  const info = $derived(VTG_MODE_INFO[mode]);
  const modeIndex = $derived(VTG_MODES.indexOf(mode));
  const nextMode = $derived(VTG_MODES[modeIndex + 1]);
</script>

<div class="page">
  <h2 style="--type-color: {info.color}">{mode}: {info.name}</h2>

  <div class="mode-intro" style="--type-color: {info.color}">
    <div class="mode-icon">
      <i class="fa-solid {info.icon}" aria-hidden="true"></i>
    </div>
    <p class="mode-description">{info.description}</p>
  </div>

  <div class="visualizer-section">
    <VTGVisualizer {mode} showLabels={true} />
  </div>

  <VTGModeDetails
    directionLabel={info.directionLabel}
    timingLabel={info.timingLabel}
    color={info.color}
  />

  <VTGKeyPoint text={info.keyPoint} color={info.color} />

  {#if isLastMode}
    <VTGModeSummary />
  {/if}

  <button class="next-button" onclick={onNext}>
    {#if isLastMode}
      <i class="fa-solid fa-graduation-cap" aria-hidden="true"></i>
      Take the Quiz
    {:else if nextMode}
      Next: {nextMode}
      <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
    {:else}
      Next
      <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
    {/if}
  </button>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    max-width: 700px;
    margin: 0 auto;
    width: 100%;
    animation: slideInUp var(--duration-dramatic) var(--ease-standard);
  }

  @keyframes slideInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  h2 {
    font-size: 1.875rem;
    font-weight: 700;
    color: white;
    margin: 0;
    text-align: center;
    background: linear-gradient(
      135deg,
      var(--type-color, var(--theme-accent, #22d3ee)) 0%,
      color-mix(
          in srgb,
          var(--type-color, var(--theme-accent, #22d3ee)) 70%,
          transparent
        )
        100%
    );
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .mode-intro {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 1.5rem;
    border-radius: 16px;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--type-color) 10%, transparent) 0%,
      transparent 100%
    );
    border: 1px solid color-mix(in srgb, var(--type-color) 25%, transparent);
  }

  .mode-icon {
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: color-mix(in srgb, var(--type-color) 20%, transparent);
    color: var(--type-color);
    font-size: 1.5rem;
  }

  .mode-description {
    font-size: 1.25rem;
    font-weight: 500;
    color: var(--type-color);
    text-align: center;
    margin: 0;
  }

  .visualizer-section {
    display: flex;
    justify-content: center;
  }

  .next-button {
    align-self: center;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    padding: 1rem 2.5rem;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 30%, transparent) 0%,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 30%, transparent) 100%
    );
    border: 2px solid
      color-mix(in srgb, var(--theme-accent, #22d3ee) 50%, transparent);
    border-radius: 12px;
    color: white;
    font-size: 1.0625rem;
    font-weight: 700;
    cursor: pointer;
    transition:
      background var(--duration-emphasis),
      border-color var(--duration-emphasis),
      transform var(--duration-emphasis);
    min-height: 54px;
    margin-top: 0.5rem;
  }

  .next-button:hover {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 40%, transparent) 0%,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 40%, transparent) 100%
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #22d3ee) 80%,
      transparent
    );
    transform: translateY(-2px);
  }

  @media (max-width: 600px) {
    h2 {
      font-size: 1.5rem;
    }

    .next-button {
      width: 100%;
      max-width: 300px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .page {
      animation: none;
    }
  }
</style>
