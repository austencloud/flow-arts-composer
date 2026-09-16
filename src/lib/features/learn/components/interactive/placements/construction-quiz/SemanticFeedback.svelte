<!--
SemanticFeedback - Shows what the user built vs. what was requested.
Teaches WHY the answer was wrong with geometric explanations and visual comparison.
-->
<script lang="ts">
  import {
    PLACEMENT_TYPE_INFO,
    type PlacementType,
    type HandPosition,
  } from "../../../../domain/constants/placement-quiz-data";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import PlacementVisualizer from "../PlacementVisualizer.svelte";
  import PlacementGrid from "../PlacementGrid.svelte";

  interface Props {
    builtType: PlacementType;
    targetType: PlacementType;
    leftHand: HandPosition;
    rightHand: HandPosition;
    gridMode: GridMode;
  }

  let { builtType, targetType, leftHand, rightHand, gridMode }: Props =
    $props();

  const TYPE_COLORS: Record<PlacementType, string> = {
    alpha: "#22d3ee",
    beta: "#f59e0b",
    gamma: "#a78bfa",
  };

  const GEOMETRIC_EXPLANATIONS: Record<PlacementType, string> = {
    alpha: "Hands at opposite points \u2014 a straight line through center",
    beta: "Both hands at the same point",
    gamma: "Hands at adjacent points \u2014 a right angle",
  };

  // Example correct placements for guide line display
  const EXAMPLE_PLACEMENTS: Record<
    PlacementType,
    Record<string, { left: HandPosition; right: HandPosition }>
  > = {
    alpha: {
      diamond: { left: "N", right: "S" },
      box: { left: "NE", right: "SW" },
    },
    beta: {
      diamond: { left: "N", right: "N" },
      box: { left: "NE", right: "NE" },
    },
    gamma: {
      diamond: { left: "N", right: "E" },
      box: { left: "NE", right: "SE" },
    },
  };

  const builtInfo = $derived(PLACEMENT_TYPE_INFO[builtType]);
  const targetInfo = $derived(PLACEMENT_TYPE_INFO[targetType]);
  const builtColor = $derived(TYPE_COLORS[builtType]);
  const targetColor = $derived(TYPE_COLORS[targetType]);
  const targetExplanation = $derived(GEOMETRIC_EXPLANATIONS[targetType]);

  const gridKey = $derived(
    gridMode === GridMode.DIAMOND ? "diamond" : "box",
  );
  const examplePlacement = $derived(EXAMPLE_PLACEMENTS[targetType][gridKey]!);

  // No-op handler for the guide-only PlacementGrid
  function noop(_left: HandPosition, _right: HandPosition) {}
</script>

<div class="semantic-feedback" role="status" aria-live="polite">
  <div class="comparison">
    <!-- What you built -->
    <div class="comparison-panel built">
      <span class="panel-label">You built</span>
      <div class="visualizer-wrapper">
        <PlacementVisualizer
          {leftHand}
          {rightHand}
          {gridMode}
          showLetter={true}
        />
      </div>
      <span class="type-badge" style="--badge-color: {builtColor};">
        {builtInfo.symbol} {builtInfo.label}
      </span>
    </div>

    <!-- Divider -->
    <div class="divider">
      <span class="divider-icon" aria-hidden="true">&rarr;</span>
    </div>

    <!-- Target -->
    <div class="comparison-panel target">
      <span class="panel-label">Target</span>
      <div class="explanation-block">
        <span class="target-symbol" style="color: {targetColor};">
          {targetInfo.symbol}
        </span>
        <span class="target-name" style="color: {targetColor};">
          {targetInfo.label}
        </span>
        <p class="geometric-text">{targetExplanation}</p>
      </div>
    </div>
  </div>

  <!-- Guide line grid showing correct geometry -->
  <div class="guide-grid">
    <PlacementGrid
      {gridMode}
      onPlacementComplete={noop}
      disabled={true}
      showGuideLines={true}
      guideLineType={targetType}
      guideLinePoints={examplePlacement}
    />
  </div>
</div>

<style>
  .semantic-feedback {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    animation: slide-up 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes slide-up {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .comparison {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    max-width: 400px;
  }

  .comparison-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
  }

  .comparison-panel.built {
    border-color: var(--semantic-error, #ef4444);
    border-style: dashed;
  }

  .comparison-panel.target {
    border-color: var(--semantic-success, #22c55e);
  }

  .panel-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 600;
  }

  .visualizer-wrapper {
    width: 100%;
    max-width: 120px;
  }

  .type-badge {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--badge-color);
  }

  .divider {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .divider-icon {
    font-size: 1.25rem;
    color: var(--theme-text, rgba(255, 255, 255, 0.3));
  }

  .explanation-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    text-align: center;
  }

  .target-symbol {
    font-size: 2rem;
    line-height: 1;
    font-weight: 700;
  }

  .target-name {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .geometric-text {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text, rgba(255, 255, 255, 0.6));
    line-height: 1.4;
    max-width: 140px;
  }

  .guide-grid {
    width: 100%;
    max-width: 200px;
    opacity: 0.85;
  }

  @media (prefers-reduced-motion: reduce) {
    .semantic-feedback {
      animation: none;
    }
  }
</style>
