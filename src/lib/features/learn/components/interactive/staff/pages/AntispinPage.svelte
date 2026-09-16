<!--
AntispinPage - Page 4: Antispin rotation + summary comparison
-->
<script lang="ts">
  import { ANTISPIN_EXAMPLES } from "../../../../domain/constants/staff-examples";
  import StaffPlacementVisualizer from "../StaffPlacementVisualizer.svelte";

  let {
    onNext,
    hapticService,
  }: {
    onNext: () => void;
    hapticService?: { trigger: (type: string) => void };
  } = $props();

  let demoIndex = $state(0);
  const currentExample = $derived(ANTISPIN_EXAMPLES[demoIndex]!);

  function cycleExample() {
    demoIndex = (demoIndex + 1) % ANTISPIN_EXAMPLES.length;
    hapticService?.trigger("selection");
  }
</script>

<div class="page">
  <h2>Antispin Rotation</h2>

  <div class="concept-intro antispin-intro">
    <div class="concept-icon">
      <i class="fa-solid fa-retweet" aria-hidden="true"></i>
    </div>
    <p class="concept-summary">
      The prop rotates in the <strong>opposite direction</strong> of the handpath
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
      rotationType="antispin"
    />
    <div class="example-description">
      {currentExample.description}
    </div>
    <button class="cycle-button" onclick={cycleExample}>
      <i class="fa-solid fa-play" aria-hidden="true"></i>
      Show Motion Step
    </button>
  </div>

  <div class="explanation antispin-explanation">
    <h3>Antispin = Thumb Swap</h3>
    <ul>
      <li>
        The prop rotates <strong>against</strong> your hand's direction
      </li>
      <li>Thumb orientation <strong>swaps</strong> during the motion</li>
      <li>If you start with thumbs IN, you end with thumbs OUT</li>
      <li>A 90° antispin is the base unit of antispin motion</li>
    </ul>
  </div>

  <div class="rotation-formula">
    <div class="formula-item">
      <span class="formula-label">Start</span>
      <span class="formula-value">Thumb In</span>
    </div>
    <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
    <div class="formula-item antispin-item">
      <span class="formula-label">Antispin</span>
      <i class="fa-solid fa-retweet" aria-hidden="true"></i>
    </div>
    <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
    <div class="formula-item">
      <span class="formula-label">End</span>
      <span class="formula-value">Thumb Out</span>
    </div>
  </div>

  <div class="summary-section">
    <h3>Pro vs Anti Summary</h3>
    <div class="comparison-cards">
      <div class="comparison-card prospin">
        <i class="fa-solid fa-sync-alt" aria-hidden="true"></i>
        <span class="card-title">Prospin</span>
        <ul>
          <li>Same direction</li>
          <li>Thumb stays same</li>
          <li>Like an isolation</li>
        </ul>
      </div>
      <div class="comparison-card antispin">
        <i class="fa-solid fa-retweet" aria-hidden="true"></i>
        <span class="card-title">Antispin</span>
        <ul>
          <li>Opposite direction</li>
          <li>Thumb swaps</li>
          <li>In becomes Out</li>
        </ul>
      </div>
    </div>
  </div>

  <button class="next-button" onclick={onNext}>
    <i class="fa-solid fa-graduation-cap" aria-hidden="true"></i>
    Take the Quiz
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

  .antispin-intro {
    --section-color: var(--semantic-warning, #f97316);
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
    background: color-mix(in srgb, var(--semantic-warning, #f97316) 20%, transparent);
    color: var(--semantic-warning, #f97316);
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

  .antispin-explanation {
    border-color: color-mix(in srgb, var(--semantic-warning, #f97316) 15%, transparent);
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

  .antispin-item {
    background: color-mix(in srgb, var(--semantic-warning, #f97316) 15%, transparent);
    color: var(--semantic-warning, #f97316);
  }

  .formula-item i {
    font-size: 1.25rem;
  }

  .summary-section {
    padding: 1.25rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 12px;
  }

  .comparison-cards {
    display: flex;
    gap: 1rem;
    margin-top: 1rem;
    flex-wrap: wrap;
  }

  .comparison-card {
    flex: 1;
    min-width: 152px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    border-radius: 12px;
  }

  .comparison-card.prospin {
    background: color-mix(in srgb, var(--theme-accent, #22d3ee) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-accent, #22d3ee) 25%, transparent);
    color: var(--theme-accent, #22d3ee);
  }

  .comparison-card.antispin {
    background: color-mix(in srgb, var(--semantic-warning, #f97316) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--semantic-warning, #f97316) 25%, transparent);
    color: var(--semantic-warning, #f97316);
  }

  .comparison-card i {
    font-size: 1.5rem;
  }

  .card-title {
    font-weight: 700;
    font-size: 1rem;
  }

  .comparison-card ul {
    margin: 0;
    padding-left: 1rem;
    text-align: left;
    width: 100%;
  }

  .comparison-card li {
    font-size: 0.8125rem;
    color: var(--theme-text-dim);
    margin-bottom: 0.25rem;
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

  .next-button i {
    font-size: 1rem;
  }

  @media (max-width: 600px) {
    h2 {
      font-size: 1.5rem;
    }

    .rotation-formula {
      gap: 0.5rem;
    }

    .comparison-cards {
      flex-direction: column;
    }

    .comparison-card {
      min-width: auto;
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
