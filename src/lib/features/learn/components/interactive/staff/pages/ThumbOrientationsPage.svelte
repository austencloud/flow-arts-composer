<!--
ThumbOrientationsPage - Page 2: Thumb In/Out orientations
-->
<script lang="ts">
  import { THUMB_EXAMPLES } from "../../../../domain/constants/staff-examples";
  import StaffPlacementVisualizer from "../StaffPlacementVisualizer.svelte";

  let {
    onNext,
    hapticService,
  }: {
    onNext: () => void;
    hapticService?: { trigger: (type: string) => void };
  } = $props();

  let exampleIndex = $state(0);
  const currentExample = $derived(THUMB_EXAMPLES[exampleIndex]!);

  function cycleExample() {
    exampleIndex = (exampleIndex + 1) % THUMB_EXAMPLES.length;
    hapticService?.trigger("selection");
  }
</script>

<div class="page">
  <h2>Thumb Orientations</h2>

  <div class="concept-intro thumb-intro">
    <div class="concept-icon">
      <i class="fa-solid fa-hand-point-up" aria-hidden="true"></i>
    </div>
    <p class="concept-summary">
      <strong>Thumbs In</strong> or <strong>Thumbs Out</strong> affects the staff's
      orientation
    </p>
  </div>

  <div class="visualizer-section">
    <StaffPlacementVisualizer
      leftPosition={currentExample.leftPos}
      rightPosition={currentExample.rightPos}
      leftThumbOrientation={currentExample.leftThumb}
      rightThumbOrientation={currentExample.rightThumb}
      showLabels={true}
    />
    <div class="example-label">{currentExample.label}</div>
    <button class="cycle-button" onclick={cycleExample}>
      <i class="fa-solid fa-shuffle" aria-hidden="true"></i>
      Show Another Example
    </button>
  </div>

  <div class="explanation">
    <h3>Understanding Thumb Orientation</h3>
    <ul>
      <li>
        <strong>Thumbs In</strong>: Thumb ends point toward the center
      </li>
      <li>
        <strong>Thumbs Out</strong>: Thumb ends point away from center
      </li>
      <li>
        Mixed orientations: <strong>(in/out)</strong> or
        <strong>(out/in)</strong>
      </li>
      <li>
        Most sequences start with <strong>thumbs in</strong> for consistency
      </li>
    </ul>
  </div>

  <div class="thumb-cards">
    <div class="thumb-card in">
      <i class="fa-solid fa-compress-alt" aria-hidden="true"></i>
      <span>Thumbs In</span>
      <small>Pointing toward center</small>
    </div>
    <div class="thumb-card out">
      <i class="fa-solid fa-expand-alt" aria-hidden="true"></i>
      <span>Thumbs Out</span>
      <small>Pointing away from center</small>
    </div>
  </div>

  <button class="next-button" onclick={onNext}> Next: Prospin Rotation </button>
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

  .thumb-intro {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--semantic-info, #3b82f6) 10%, transparent) 0%,
      color-mix(in srgb, var(--semantic-info, #3b82f6) 2%, transparent) 100%
    );
    border: 1px solid color-mix(in srgb, var(--semantic-info, #3b82f6) 20%, transparent);
  }

  .concept-icon {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-size: 1.5rem;
    background: color-mix(in srgb, var(--semantic-info, #3b82f6) 20%, transparent);
    color: var(--semantic-info);
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

  .example-label {
    font-size: 0.9375rem;
    color: var(--theme-text-dim);
    padding: 0.5rem 1rem;
    background: var(--theme-card-bg);
    border-radius: 8px;
  }

  .cycle-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    color: var(--theme-text-dim);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .cycle-button:hover {
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: white;
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

  .thumb-cards {
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  .thumb-card {
    flex: 1;
    min-width: 140px;
    max-width: 200px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1.25rem;
    border-radius: 12px;
  }

  .thumb-card.in {
    background: color-mix(in srgb, var(--semantic-info, #3b82f6) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--semantic-info, #3b82f6) 25%, transparent);
    color: var(--semantic-info);
  }

  .thumb-card.out {
    --out-color: #a855f7;
    background: color-mix(in srgb, var(--out-color) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--out-color) 25%, transparent);
    color: var(--out-color);
  }

  .thumb-card i {
    font-size: 1.5rem;
  }

  .thumb-card span {
    font-weight: 600;
    font-size: 1rem;
  }

  .thumb-card small {
    font-size: 0.75rem;
    opacity: 0.7;
    color: var(--theme-text-dim);
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

    .thumb-cards {
      flex-direction: column;
    }

    .thumb-card {
      min-width: auto;
      max-width: none;
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
