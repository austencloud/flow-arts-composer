<!--
LOOPGlyph.svelte - 4-quadrant pie chart glyph for LOOP component visualization

Used in:
1. Download Cards (badge in header) - static display
2. Generator panel (interactive picker) - clickable quadrants
3. Sequence cards (badge overlay) - static display

Quadrant Layout (clockwise from top-right):
  ┌───┬───┐
  │ I │ R │   I = INVERTED (orange #eb7d00)
  ├───┼───┤   R = ROTATED (blue #36c3ff)
  │ S │ M │   M = MIRRORED (purple #6F2DA8)
  └───┴───┘   S = SWAPPED (emerald #2ecc71)

Filled quadrant = LOOP component is active
Empty quadrant = not present (freeform)
-->
<script lang="ts">
  import { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";

  interface Props {
    activeComponents: Set<LOOPComponent>;
    size?: number;
    interactive?: boolean;
    darkMode?: boolean;
    onToggle?: (component: LOOPComponent) => void;
  }

  let {
    activeComponents,
    size = 32,
    interactive = false,
    darkMode = true,
    onToggle,
  }: Props = $props();

  // Quadrant definitions (clockwise from top-right)
  // Each quadrant covers 90 degrees, starting from the top-center
  const quadrants = [
    {
      component: LOOPComponent.ROTATED,
      color: "#36c3ff",
      label: "Rotated",
      // Top-right quadrant: 0° to 90° (from 12 o'clock to 3 o'clock)
      startAngle: -90,
      endAngle: 0,
    },
    {
      component: LOOPComponent.MIRRORED,
      color: "#6F2DA8",
      label: "Mirrored",
      // Bottom-right quadrant: 90° to 180° (from 3 o'clock to 6 o'clock)
      startAngle: 0,
      endAngle: 90,
    },
    {
      component: LOOPComponent.SWAPPED,
      color: "#2ecc71",
      label: "Swapped",
      // Bottom-left quadrant: 180° to 270° (from 6 o'clock to 9 o'clock)
      startAngle: 90,
      endAngle: 180,
    },
    {
      component: LOOPComponent.INVERTED,
      color: "#eb7d00",
      label: "Inverted",
      // Top-left quadrant: 270° to 360° (from 9 o'clock to 12 o'clock)
      startAngle: 180,
      endAngle: 270,
    },
  ];

  // Calculate SVG path for a quadrant (pie slice)
  function getQuadrantPath(
    startAngle: number,
    endAngle: number,
    radius: number,
    centerX: number,
    centerY: number
  ): string {
    // Convert angles to radians
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    // Calculate start and end points on the arc
    const x1 = centerX + radius * Math.cos(startRad);
    const y1 = centerY + radius * Math.sin(startRad);
    const x2 = centerX + radius * Math.cos(endRad);
    const y2 = centerY + radius * Math.sin(endRad);

    // Large arc flag is 0 for quadrants (90° is less than 180°)
    const largeArcFlag = 0;

    // Create path: move to center, line to start of arc, arc to end, close path
    return `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
  }

  // Handle quadrant click
  function handleQuadrantClick(component: LOOPComponent) {
    if (interactive && onToggle) {
      onToggle(component);
    }
  }

  // Keyboard handler for accessibility
  function handleKeyDown(event: KeyboardEvent, component: LOOPComponent) {
    if (interactive && onToggle && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      onToggle(component);
    }
  }

  // Calculate dimensions
  const center = $derived(size / 2);
  const radius = $derived((size / 2) * 0.9); // 90% of half size for padding
  const strokeWidth = $derived(Math.max(1, size * 0.02));

  // Colors based on theme
  const emptyColor = $derived(
    darkMode ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)"
  );
  const strokeColor = $derived(
    darkMode ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.15)"
  );
</script>

<svg
  width={size}
  height={size}
  viewBox={`0 0 ${size} ${size}`}
  class="loop-glyph"
  class:interactive
  role={interactive ? "group" : "img"}
  aria-label={interactive
    ? "LOOP component selector"
    : `LOOP components: ${Array.from(activeComponents).join(", ") || "none"}`}
>
  {#each quadrants as quadrant}
    {@const isActive = activeComponents.has(quadrant.component)}
    {@const fillColor = isActive ? quadrant.color : emptyColor}
    {@const path = getQuadrantPath(
      quadrant.startAngle,
      quadrant.endAngle,
      radius,
      center,
      center
    )}

    {#if interactive}
      <path
        d={path}
        fill={fillColor}
        stroke={strokeColor}
        stroke-width={strokeWidth}
        class="quadrant interactive"
        class:active={isActive}
        role="button"
        tabindex="0"
        aria-pressed={isActive}
        aria-label={`${quadrant.label}: ${isActive ? "active" : "inactive"}`}
        onclick={() => handleQuadrantClick(quadrant.component)}
        onkeydown={(e) => handleKeyDown(e, quadrant.component)}
      >
        <title>{quadrant.label}</title>
      </path>
    {:else}
      <path
        d={path}
        fill={fillColor}
        stroke={strokeColor}
        stroke-width={strokeWidth}
        class="quadrant"
        class:active={isActive}
      >
        <title>{quadrant.label}</title>
      </path>
    {/if}
  {/each}

  <!-- Center circle for visual polish -->
  <circle
    cx={center}
    cy={center}
    r={radius * 0.15}
    fill={darkMode ? "rgba(0, 0, 0, 0.4)" : "rgba(255, 255, 255, 0.6)"}
    stroke={strokeColor}
    stroke-width={strokeWidth}
  />
</svg>

<style>
  .loop-glyph {
    display: block;
    flex-shrink: 0;
  }

  .quadrant {
    transition: fill 0.15s ease, opacity 0.15s ease;
  }

  .quadrant.active {
    filter: drop-shadow(0 0 2px currentColor);
  }

  /* Interactive mode styles */
  .loop-glyph.interactive .quadrant {
    cursor: pointer;
  }

  .loop-glyph.interactive .quadrant:hover {
    opacity: 0.85;
  }

  .loop-glyph.interactive .quadrant:focus {
    outline: none;
  }

  .loop-glyph.interactive .quadrant:focus-visible {
    filter: drop-shadow(0 0 3px white);
  }

  .loop-glyph.interactive .quadrant.active:hover {
    opacity: 0.95;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .quadrant {
      transition: none;
    }
  }
</style>
