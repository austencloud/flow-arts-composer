<!--
ProspinPage - Page 3: Prospin rotation concept
-->
<script lang="ts">
  import { PROSPIN_EXAMPLES } from "../../../../domain/constants/staff-examples";
  import StaffPlacementVisualizer from "../StaffPlacementVisualizer.svelte";

  let {
    onNext,
    hapticService,
  }: {
    onNext: () => void;
    hapticService?: { trigger: (type: string) => void };
  } = $props();

  let demoIndex = $state(0);
  const currentExample = $derived(PROSPIN_EXAMPLES[demoIndex]!);

  function cycleExample() {
    demoIndex = (demoIndex + 1) % PROSPIN_EXAMPLES.length;
    hapticService?.trigger("selection");
  }
</script>

<div class="page">
  <h2>Prospin Rotation</h2>

  <div class="concept-intro prospin-intro">
    <div class="concept-icon">
      <i class="fa-solid fa-sync-alt" aria-hidden="true"></i>
    </div>
    <p class="concept-summary">
      The prop rotates in the <strong>same direction</strong> as the handpath
    </p>
  </div>

  <div class="visualizer-section">
    <StaffPlacementVisualizer
      leftPosition={currentExample.leftPos}
      rightPosition={currentExample.rightPos}
      leftThumbOrientation={currentExample.leftThumb}
      rightThumbOrientation={currentExample.rightThumb}
      showLabels={true}
      showRotationPath={true}
      rotationType="prospin"
    />
    <div class="example-description">
      {currentExample.description}
    </div>
    <button class="cycle-button" onclick={cycleExample}>
      <i class="fa-solid fa-play" aria-hidden="true"></i>
      Show Motion Step
    </button>
  </div>

  <div class="explanation prospin-explanation">
    <h3>Prospin = 90° Isolation</h3>
    <ul>
      <li>
        Think of it as an <strong>isolation</strong>: the prop follows the hand
      </li>
      <li>Thumb orientation <strong>stays the same</strong> throughout</li>
      <li>If you start with thumbs IN, you end with thumbs IN</li>
      <li>The staff "rotates with" your hand movement</li>
    </ul>
  </div>

  <div class="rotation-formula">
    <div class="formula-item">
      <span class="formula-label">Start</span>
      <span class="formula-value">Thumb In</span>
    </div>
    <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
    <div class="formula-item prospin-item">
      <span class="formula-label">Prospin</span>
      <i class="fa-solid fa-sync-alt" aria-hidden="true"></i>
    </div>
    <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
    <div class="formula-item">
      <span class="formula-label">End</span>
      <span class="formula-value">Thumb In</span>
    </div>
  </div>

  <button class="next-button" onclick={onNext}>
    Next: Antispin Rotation
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

  .prospin-intro {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 10%, transparent) 0%,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 2%, transparent) 100%
    );
    border: 1px solid color-mix(in srgb, var(--theme-accent, #22d3ee) 20%, transparent);
  }

  .concept-icon {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-size: 1.5rem;
    background: color-mix(in srgb, var(--theme-accent, #22d3ee) 20%, transparent);
    color: var(--theme-accent, #22d3ee);
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

  .example-description {
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

  .prospin-explanation {
    border-color: color-mix(in srgb, var(--theme-accent, #22d3ee) 15%, transparent);
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

  .rotation-formula {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 1rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border-radius: 12px;
    flex-wrap: wrap;
  }

  .rotation-formula > i {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-size: 0.875rem;
  }

  .formula-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 1rem;
    background: var(--theme-card-bg);
    border-radius: 8px;
  }

  .formula-label {
    font-size: 0.75rem;
    color: var(--theme-text-dim);
    text-transform: uppercase;
  }

  .formula-value {
    font-size: 0.875rem;
    font-weight: 600;
    color: white;
  }

  .prospin-item {
    background: color-mix(in srgb, var(--theme-accent, #22d3ee) 15%, transparent);
    color: var(--theme-accent, #22d3ee);
  }

  .formula-item i {
    font-size: 1.25rem;
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

    .rotation-formula {
      gap: 0.5rem;
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
