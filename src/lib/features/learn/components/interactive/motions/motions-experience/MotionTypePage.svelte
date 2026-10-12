<!--
MotionTypePage - Displays a single motion type with visualizer
-->
<script lang="ts">
  import MotionVisualizer from "../MotionVisualizer.svelte";
  import MotionTypeHeader from "./MotionTypeHeader.svelte";
  import MotionKeyPoint from "./MotionKeyPoint.svelte";
  import MotionTypeSummary from "./MotionTypeSummary.svelte";
  import type {
    MotionExample,
    MotionInfo,
  } from "../../../../domain/constants/motion-experience-data";

  let {
    typeNum,
    info,
    example,
    showSummary,
    onCycleExample,
    onNext,
    isLastType,
  }: {
    typeNum: number;
    info: MotionInfo;
    example: MotionExample;
    showSummary: boolean;
    onCycleExample: () => void;
    onNext: () => void;
    isLastType: boolean;
  } = $props();
</script>

<div class="page">
  <h2 style="--type-color: {info.color}">
    Type {typeNum}: {info.name}
  </h2>

  <MotionTypeHeader {info} />

  <div class="visualizer-section">
    <MotionVisualizer
      leftStart={example.leftStart}
      leftEnd={example.leftEnd}
      rightStart={example.rightStart}
      rightEnd={example.rightEnd}
      leftMotion={example.leftMotion}
      rightMotion={example.rightMotion}
      motionType={typeNum as 1 | 2 | 3 | 4 | 5 | 6}
      showLabels={true}
      showMotionType={false}
    />
    <button
      class="cycle-button"
      onclick={onCycleExample}
      aria-label="Next example"
    >
      <i class="fa-solid fa-shuffle" aria-hidden="true"></i>
      Show Another Example
    </button>
  </div>

  <MotionKeyPoint text={info.key} color={info.color} />

  {#if showSummary}
    <MotionTypeSummary />
  {/if}

  <button class="next-button" onclick={onNext}>
    {#if isLastType}
      <i class="fa-solid fa-graduation-cap" aria-hidden="true"></i>
      Take the Quiz
    {:else}
      Next: Type {typeNum + 1}
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

  .visualizer-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .cycle-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 8px;
    color: var(--theme-text-dim);
    font-size: 0.875rem;
    cursor: pointer;
    transition:
      background var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard);
  }

  .cycle-button:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    color: var(--theme-text, white);
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

  .next-button i {
    font-size: 0.9375rem;
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
