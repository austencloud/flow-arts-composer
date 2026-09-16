<!--
StaffIntroPage - Page 1: Staff Positions Introduction
-->
<script lang="ts">
  import type {
    HandPosition,
    ThumbOrientation,
  } from "../../../../domain/constants/staff-examples";
  import StaffPlacementVisualizer from "../StaffPlacementVisualizer.svelte";

  let {
    onNext,
  }: {
    onNext: () => void;
  } = $props();

  // Demo positions
  const leftPos: HandPosition = "N";
  const rightPos: HandPosition = "S";
  const leftThumb: ThumbOrientation = "in";
  const rightThumb: ThumbOrientation = "in";
</script>

<div class="page">
  <h2>Staff Positions</h2>

  <div class="concept-intro staff-intro">
    <div class="concept-icon">
      <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
    </div>
    <p class="concept-summary">
      Staff positions show <strong>where your hands are</strong> and
      <strong>how the prop is oriented</strong>
    </p>
  </div>

  <div class="visualizer-section">
    <StaffPlacementVisualizer
      leftPosition={leftPos}
      rightPosition={rightPos}
      leftThumbOrientation={leftThumb}
      rightThumbOrientation={rightThumb}
      showLabels={true}
      highlightType="alpha"
    />
  </div>

  <div class="explanation">
    <h3>Key Concepts</h3>
    <ul>
      <li>
        <strong>The Thumb End</strong> is marked with a perpendicular line (T)
      </li>
      <li>
        One end of the staff is always at the <strong>center point</strong>
      </li>
      <li>The outer end points toward <strong>N, E, S, or W</strong></li>
      <li>
        Tracking the thumb helps you <strong>verify rotations</strong>
      </li>
    </ul>
  </div>

  <button class="next-button" onclick={onNext}>
    Next: Thumb Orientations
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
    animation: slideInUp var(--duration-dramatic) cubic-bezier(0.4, 0, 0.2, 1);
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
    margin: 0;
    text-align: center;
    background: linear-gradient(135deg, var(--theme-accent, #22d3ee) 0%, var(--theme-accent, #06b6d4) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  h3 {
    font-size: 1.125rem;
    font-weight: 600;
    color: white;
    margin: 0;
  }

  .concept-intro {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 1.5rem;
    border-radius: 16px;
  }

  .staff-intro {
    --section-color: #a855f7;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--section-color) 10%, transparent) 0%,
      color-mix(in srgb, var(--section-color) 2%, transparent) 100%
    );
    border: 1px solid color-mix(in srgb, var(--section-color) 20%, transparent);
  }

  .concept-icon {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-size: 1.5rem;
    background: color-mix(in srgb, var(--section-color) 20%, transparent);
    color: var(--section-color);
  }

  .concept-summary {
    font-size: 1.25rem;
    font-weight: 500;
    text-align: center;
    color: var(--theme-text, rgba(255, 255, 255, 0.85));
    margin: 0;
  }

  .visualizer-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .explanation {
    padding: 1.25rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 12px;
  }

  .explanation ul {
    margin: 0.75rem 0 0 0;
    padding-left: 1.25rem;
  }

  .explanation li {
    font-size: 1rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
    line-height: 1.6;
    margin-bottom: 0.5rem;
  }

  .explanation li:last-child {
    margin-bottom: 0;
  }

  .next-button {
    align-self: center;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    padding: 1rem 3rem;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 30%, transparent) 0%,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 30%, transparent) 100%
    );
    border: 2px solid color-mix(in srgb, var(--theme-accent, #22d3ee) 50%, transparent);
    border-radius: 12px;
    color: white;
    font-size: 1.125rem;
    font-weight: 700;
    cursor: pointer;
    transition: all var(--duration-emphasis);
    min-height: var(--min-touch-target);
    margin-top: 1rem;
  }

  .next-button:hover {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 40%, transparent) 0%,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 40%, transparent) 100%
    );
    border-color: color-mix(in srgb, var(--theme-accent, #22d3ee) 80%, transparent);
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
