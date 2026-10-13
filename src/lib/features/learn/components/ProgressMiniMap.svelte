<!--
ProgressMiniMap - Sleek segmented progress arc

Shows:
- Circular arc with category-colored segments
- Current progress in center
- Clean, minimal design
-->
<script lang="ts">
  import { CONCEPT_CATEGORIES } from "../domain/concepts";
  import { getAvailableConcepts } from "../domain/concept-experience-registry";
  import type { LearningProgress, ConceptCategory } from "../domain/types";

  let {
    progress,
  }: {
    progress: LearningProgress;
  } = $props();

  const availableConcepts = getAvailableConcepts();
  const totalConcepts = availableConcepts.length;
  const completedCount = $derived(
    availableConcepts.filter((concept) =>
      progress.completedConcepts.has(concept.id)
    ).length
  );
  // Category segments for the arc
  const categories: ConceptCategory[] = (
    ["foundation", "letters", "combinations", "advanced"] as const
  ).filter((category) =>
    availableConcepts.some((concept) => concept.category === category)
  );

  const categoryData = $derived(
    categories.map((cat) => {
      const concepts = availableConcepts.filter(
        (concept) => concept.category === cat
      );
      const completed = concepts.filter((c) =>
        progress.completedConcepts.has(c.id)
      ).length;
      return {
        key: cat,
        name: CONCEPT_CATEGORIES[cat].name,
        color: CONCEPT_CATEGORIES[cat].color,
        total: concepts.length,
        completed,
        percent:
          totalConcepts > 0 ? (concepts.length / totalConcepts) * 100 : 0,
      };
    })
  );

  // SVG arc calculations
  const size = 120;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  // Calculate arc segments
  const getArcPath = (startPercent: number, endPercent: number) => {
    const startAngle = (startPercent / 100) * 360 - 90;
    const endAngle = (endPercent / 100) * 360 - 90;
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = size / 2 + radius * Math.cos(startRad);
    const y1 = size / 2 + radius * Math.sin(startRad);
    const x2 = size / 2 + radius * Math.cos(endRad);
    const y2 = size / 2 + radius * Math.sin(endRad);

    const largeArc = endPercent - startPercent > 50 ? 1 : 0;

    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
  };

  // Build segments with cumulative percentages
  const segments = $derived(() => {
    let cumulative = 0;
    return categoryData.map((cat) => {
      const start = cumulative;
      cumulative += cat.percent;
      const completedPercent = (cat.completed / cat.total) * cat.percent;
      return {
        ...cat,
        startPercent: start,
        endPercent: cumulative,
        filledPercent: start + completedPercent,
      };
    });
  });
</script>

<div class="progress-arc-container">
  <svg class="progress-arc" viewBox="0 0 {size} {size}">
    <!-- Background track -->
    <circle
      cx={size / 2}
      cy={size / 2}
      r={radius}
      fill="none"
      stroke="var(--theme-card-bg)"
      stroke-width={strokeWidth}
    />

    <!-- Category segments (filled portions) -->
    {#each segments() as segment}
      {#if segment.completed > 0}
        <path
          d={getArcPath(segment.startPercent, segment.filledPercent)}
          fill="none"
          stroke={segment.color}
          stroke-width={strokeWidth}
          stroke-linecap="round"
          class="segment-fill"
        />
      {/if}
    {/each}

    <!-- Segment dividers (subtle lines) -->
    {#each segments() as segment, i}
      {#if i > 0}
        {@const angle = (segment.startPercent / 100) * 360 - 90}
        {@const rad = (angle * Math.PI) / 180}
        {@const x1 = size / 2 + (radius - strokeWidth / 2 - 2) * Math.cos(rad)}
        {@const y1 = size / 2 + (radius - strokeWidth / 2 - 2) * Math.sin(rad)}
        {@const x2 = size / 2 + (radius + strokeWidth / 2 + 2) * Math.cos(rad)}
        {@const y2 = size / 2 + (radius + strokeWidth / 2 + 2) * Math.sin(rad)}
        <line
          {x1}
          {y1}
          {x2}
          {y2}
          stroke="var(--theme-panel-bg, rgb(20, 20, 28))"
          stroke-width="3"
        />
      {/if}
    {/each}
  </svg>

  <!-- Center content -->
  <div class="center-content">
    <span class="progress-value">{completedCount}</span>
    <span class="progress-label">of {totalConcepts}</span>
  </div>

  <!-- Category legend (inline, compact) -->
  <div class="category-legend">
    {#each categoryData as cat}
      <div class="legend-item" class:has-progress={cat.completed > 0}>
        <div class="legend-dot" style="background: {cat.color}"></div>
        <span class="legend-count">{cat.completed}/{cat.total}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .progress-arc-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
  }

  .progress-arc {
    width: 120px;
    height: 120px;
    position: relative;
  }

  .segment-fill {
    filter: drop-shadow(0 0 6px currentColor);
    transition: stroke-dashoffset
      calc(var(--duration-dramatic) + var(--duration-fast)) var(--ease-standard);
  }

  .center-content {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    pointer-events: none;
  }

  .progress-value {
    font-size: 2rem;
    font-weight: 700;
    color: var(--theme-text);
    line-height: 1;
  }

  .progress-label {
    font-size: 0.8125rem;
    color: var(--theme-text-dim);
  }

  /* Position the SVG container relatively */
  .progress-arc-container {
    position: relative;
  }

  .progress-arc-container .center-content {
    position: absolute;
    top: calc(1rem + 60px);
    left: 50%;
  }

  .category-legend {
    display: flex;
    gap: 1rem;
    justify-content: center;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    opacity: 0.5;
    transition: opacity var(--duration-normal) var(--ease-standard);
  }

  .legend-item.has-progress {
    opacity: 1;
  }

  .legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .legend-count {
    font-size: 0.8125rem;
    color: var(--theme-text-dim);
    font-weight: 500;
  }

  @media (prefers-reduced-motion: reduce) {
    .segment-fill {
      transition: none;
    }
  }
</style>
