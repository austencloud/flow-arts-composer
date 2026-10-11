<!--
  LOOPRingButton.svelte

  Compact circular button showing 6 LOOP component segments as colored arcs.
  Full color = active in detected LOOP, faint = available for completion, gray = not possible.
  Tapping opens the LOOP completion popover.
-->
<script lang="ts">
  import { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
  import { LOOP_COMPONENT_MAP } from "#lib/features/create/generate/shared/domain/constants/loop-constants.js";

  interface Props {
    /** Components that are active (sequence already satisfies) */
    activeComponents: Set<LOOPComponent>;
    /** Components available for auto-completion */
    availableComponents: Set<LOOPComponent>;
    /** Whether the button is disabled (too few beats) */
    disabled?: boolean;
    onclick?: () => void;
  }

  let {
    activeComponents,
    availableComponents,
    disabled = false,
    onclick,
  }: Props = $props();

  // All 6 components in canonical display order
  const ALL_COMPONENTS: LOOPComponent[] = [
    LOOPComponent.ROTATED,
    LOOPComponent.MIRRORED,
    LOOPComponent.FLIPPED,
    LOOPComponent.SWAPPED,
    LOOPComponent.INVERTED,
    LOOPComponent.REWOUND,
  ];

  // SVG arc geometry: 6 segments in a ring
  const RING_RADIUS = 16;
  const RING_CENTER = 20;
  const RING_STROKE = 4;
  const SEGMENT_COUNT = 6;
  const GAP_ANGLE = 4; // degrees between segments
  const SEGMENT_ANGLE = (360 - GAP_ANGLE * SEGMENT_COUNT) / SEGMENT_COUNT;

  function arcPath(index: number): string {
    const startAngle = index * (SEGMENT_ANGLE + GAP_ANGLE) - 90;
    const endAngle = startAngle + SEGMENT_ANGLE;
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const x1 = RING_CENTER + RING_RADIUS * Math.cos(startRad);
    const y1 = RING_CENTER + RING_RADIUS * Math.sin(startRad);
    const x2 = RING_CENTER + RING_RADIUS * Math.cos(endRad);
    const y2 = RING_CENTER + RING_RADIUS * Math.sin(endRad);
    const largeArc = SEGMENT_ANGLE > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${RING_RADIUS} ${RING_RADIUS} 0 ${largeArc} 1 ${x2} ${y2}`;
  }

  function segmentColor(component: LOOPComponent): string {
    return LOOP_COMPONENT_MAP.get(component)?.color ?? "#666";
  }

  function segmentOpacity(component: LOOPComponent): number {
    if (activeComponents.has(component)) return 1;
    if (availableComponents.has(component)) return 0.35;
    return 0.1;
  }

  const hasAnyActivity = $derived(
    activeComponents.size > 0 || availableComponents.size > 0
  );

  const tooltip = $derived.by(() => {
    if (disabled) return "Add more steps to see LOOP options";
    if (activeComponents.size > 0) return "LOOP detected - tap for details";
    if (availableComponents.size > 0) return "LOOP completions available";
    return "No LOOP options for this sequence";
  });
</script>

<button
  class="loop-ring-button"
  class:has-activity={hasAnyActivity}
  {disabled}
  onclick={() => onclick?.()}
  title={tooltip}
  aria-label={tooltip}
>
  <svg
    viewBox="0 0 40 40"
    width="24"
    height="24"
    aria-hidden="true"
  >
    {#each ALL_COMPONENTS as component, i}
      <path
        d={arcPath(i)}
        fill="none"
        stroke={segmentColor(component)}
        stroke-width={RING_STROKE}
        stroke-linecap="round"
        opacity={segmentOpacity(component)}
      />
    {/each}
  </svg>
</button>

<style>
  .loop-ring-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .loop-ring-button.has-activity {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .loop-ring-button:hover:not(:disabled) {
    transform: scale(1.05);
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-accent, #6366f1);
  }

  .loop-ring-button:active:not(:disabled) {
    transform: scale(0.95);
    transition-duration: 50ms;
  }

  .loop-ring-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .loop-ring-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    .loop-ring-button {
      transition: none;
    }
  }
</style>
