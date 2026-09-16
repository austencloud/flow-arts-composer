<!-- PlacementGroupGrid.svelte - Renders a group of pictographs (Alpha, Beta, or Gamma) -->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import { getLetterBorderColorSafe } from "$lib/shared/pictograph/shared/utils/letter-border-utils";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";

  const {
    pictographs,
    selectedPictograph = null,
    groupClass,
    startIndex = 0,
    shouldAnimate,
    isTransitioning,
    onSelect,
    onAnimationEnd,
  }: {
    pictographs: PictographData[];
    selectedPictograph?: PictographData | null;
    groupClass: string;
    startIndex?: number;
    shouldAnimate: (id: string) => boolean;
    isTransitioning: boolean;
    onSelect: (pictograph: PictographData) => void;
    onAnimationEnd: (id: string) => void;
  } = $props();

  const hapticService = getHapticFeedback();

  function handleSelect(pictograph: PictographData) {
    hapticService?.trigger("selection");
    onSelect(pictograph);
  }

  function handleKeydown(e: KeyboardEvent, pictograph: PictographData) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleSelect(pictograph);
    }
  }
</script>

{#each pictographs as pictographData, index (pictographData.id)}
  <div
    class="pictograph-container {groupClass}"
    class:selected={selectedPictograph?.id === pictographData.id}
    class:animate={shouldAnimate(pictographData.id)}
    class:transitioning={isTransitioning}
    role="button"
    tabindex="0"
    data-ghost="safe"
    data-ghost-kind="start-placement"
    style:--letter-border-color={getLetterBorderColorSafe(
      pictographData.letter
    )}
    style:--animation-delay="{(startIndex + index) * 30}ms"
    onclick={() => handleSelect(pictographData)}
    onkeydown={(e) => handleKeydown(e, pictographData)}
    onanimationend={() => onAnimationEnd(pictographData.id)}
  >
    <div class="pictograph-wrapper">
      <PictographContainer {pictographData} />
    </div>
  </div>
{/each}

<style>
  .pictograph-container {
    position: relative;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: visible; /* Allow wrapper effects to show */
    /* Size to fit content, not fill grid cell */
    width: fit-content;
    height: fit-content;
    max-width: 100%;
    max-height: 100%;
    min-width: 0; /* Allow shrinking below default minimums */
    min-height: 0;
    box-sizing: border-box;
  }

  .pictograph-container:focus-visible {
    outline: 2px solid rgba(100, 200, 255, 0.6);
    outline-offset: 2px;
  }

  .pictograph-container.animate {
    animation: slideInFade 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    animation-delay: var(--animation-delay, 0ms);
    opacity: 0;
  }

  .pictograph-container.transitioning .pictograph-wrapper {
    transition: all var(--duration-emphasis) ease;
  }

  .pictograph-wrapper {
    /* Let aspect-ratio control the dimensions */
    width: 100%;
    height: auto;
    /* Constrain to maintain square aspect ratio matching the SVG */
    aspect-ratio: 1 / 1;
    max-width: 100%;
    max-height: 100%;
    min-width: 0;
    min-height: 0;
    display: block; /* Use block instead of flex to avoid sizing conflicts */
    box-sizing: border-box;
    transition: all var(--duration-emphasis) cubic-bezier(0.4, 0, 0.2, 1);
    background: var(--row-tint, var(--theme-card-bg));
    border: 2px solid transparent;
    border-radius: 0px;
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.1),
      0 2px 4px rgba(0, 0, 0, 0.06);
  }

  /* Ensure the pictograph inside fills the wrapper exactly */
  .pictograph-wrapper :global(.pictograph) {
    width: 100%;
    height: 100%;
    display: block;
  }

  .pictograph-wrapper :global(.pictograph svg) {
    width: 100%;
    height: 100%;
    display: block;
  }

  /* Desktop hover - only on hover-capable devices */
  @media (hover: hover) {
    .pictograph-container:hover .pictograph-wrapper {
      background: var(--row-tint, rgba(255, 255, 255, 0.12));
      transform: scale(1.05);
      box-shadow:
        0 2px 4px rgba(0, 0, 0, 0.12),
        0 4px 8px rgba(0, 0, 0, 0.08),
        0 8px 16px rgba(0, 0, 0, 0.06);
      filter: brightness(1.05);
    }
  }

  /* Mobile/universal active state */
  .pictograph-container:active .pictograph-wrapper {
    transform: scale(0.97);
    transition: transform var(--duration-instant) cubic-bezier(0.4, 0, 0.2, 1);
  }

  .pictograph-container.selected .pictograph-wrapper {
    border-color: var(--letter-border-color, rgba(100, 200, 255, 0.8));
    background: var(--row-tint, rgba(255, 255, 255, 0.15));
    box-shadow:
      0 0 12px rgba(100, 200, 255, 0.3),
      0 2px 4px rgba(0, 0, 0, 0.12),
      0 4px 8px rgba(0, 0, 0, 0.08);
  }

  @keyframes slideInFade {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Visual grouping for placement rows */
  .pictograph-container.alpha-row {
    --row-tint: rgba(100, 150, 255, 0.05);
  }

  .pictograph-container.beta-row {
    --row-tint: rgba(150, 100, 255, 0.05);
  }

  .pictograph-container.gamma-row {
    --row-tint: rgba(100, 255, 150, 0.05);
  }

  /* Enhanced hover for row groups - only on hover-capable devices */
  @media (hover: hover) {
    .pictograph-container.alpha-row:hover,
    .pictograph-container.beta-row:hover,
    .pictograph-container.gamma-row:hover {
      background: var(--row-tint, rgba(255, 255, 255, 0.12));
    }
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .animate {
      animation: none;
    }
  }
</style>
