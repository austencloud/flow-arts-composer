<!--
  MorphChipGroup.svelte - Container for morphing chip components

  Manages expansion state and provides context to child MorphChips.
  Uses spring animation for smooth morph transitions.
  ResizeObserver triggers re-measurement when container changes.
-->
<script lang="ts">
  import { spring } from "svelte/motion";
  import { onMount, onDestroy } from "svelte";
  import { setMorphChipContext } from "./morph-chip-context.svelte.ts";
  import type { MorphChipGroupProps, MorphChipContext } from "./types";

  let {
    expandedId = $bindable(null),
    gap = 8,
    expandedHeight = 108,
    springConfig = { stiffness: 0.3, damping: 0.8 },
    children,
    onExpandedChange,
  }: MorphChipGroupProps = $props();

  // Spring for morph animation progress
  const morphSpring = spring(0, { stiffness: 0.3, damping: 0.8 });

  // Keep spring options in sync with springConfig prop
  $effect(() => {
    morphSpring.stiffness = springConfig.stiffness;
    morphSpring.damping = springConfig.damping;
  });

  // Track registered chips: order and per-chip expanded heights
  let chipRegistry = $state<Map<string, number>>(new Map());
  let chipHeights = $state<Map<string, number>>(new Map());
  let nextIndex = $state(0);

  // Auto-measured height for the currently expanded chip (scalar for reliable reactivity)
  let currentMeasuredHeight = $state<number | null>(null);

  // Container element for child measurement
  let containerEl = $state<HTMLElement | null>(null);

  // ResizeObserver callback registry
  let resizeCallbacks = new Set<() => void>();
  let observer: ResizeObserver | undefined;

  onMount(() => {
    if (!containerEl) return;
    observer = new ResizeObserver(() => {
      for (const cb of resizeCallbacks) cb();
    });
    observer.observe(containerEl);
  });

  onDestroy(() => observer?.disconnect());

  function onResize(callback: () => void): () => void {
    resizeCallbacks.add(callback);
    return () => resizeCallbacks.delete(callback);
  }

  // Expose spring value as readonly
  let morphProgress = $derived($morphSpring);

  function expand(id: string) {
    expandedId = id;
    morphSpring.set(1);
    onExpandedChange?.(id);
  }

  function collapse() {
    currentMeasuredHeight = null;
    expandedId = null;
    morphSpring.set(0);
    onExpandedChange?.(null);
  }

  // Reset spring when expandedId is externally set to null (e.g. parent backdrop click)
  $effect(() => {
    if (expandedId === null && $morphSpring !== 0) {
      currentMeasuredHeight = null;
      morphSpring.set(0);
    }
  });

  function reportMeasuredHeight(id: string, height: number) {
    if (expandedId === id) {
      currentMeasuredHeight = height;
    }
  }

  function registerChip(id: string, chipExpandedHeight?: number): number {
    if (chipRegistry.has(id)) {
      return chipRegistry.get(id)!;
    }
    const index = nextIndex;
    chipRegistry.set(id, index);
    if (chipExpandedHeight != null) {
      chipHeights.set(id, chipExpandedHeight);
    }
    nextIndex++;
    return index;
  }

  // Check if expanded chip is in auto-measure mode (no explicit height)
  let expandedChipIsAutoMeasure = $derived(
    expandedId != null && !chipHeights.has(expandedId)
  );

  function unregisterChip(id: string) {
    chipRegistry.delete(id);
    chipHeights.delete(id);
  }

  // Active expanded height: measured > per-chip override > group default
  let activeExpandedHeight = $derived(
    expandedId != null
      ? (currentMeasuredHeight ?? chipHeights.get(expandedId) ?? expandedHeight)
      : expandedHeight
  );

  let isExpanded = $derived(expandedId !== null);

  // Build context object
  const context: MorphChipContext = {
    get expandedId() {
      return expandedId;
    },
    get morphProgress() {
      return morphProgress;
    },
    get chipCount() {
      return chipRegistry.size;
    },
    get gap() {
      return gap;
    },
    get expandedHeight() {
      return expandedHeight;
    },
    get containerEl() {
      return containerEl;
    },
    expand,
    collapse,
    registerChip,
    unregisterChip,
    onResize,
    reportMeasuredHeight,
  };

  setMorphChipContext(context);
</script>

<div
  bind:this={containerEl}
  class="morph-chip-group"
  class:has-expanded={isExpanded && !expandedChipIsAutoMeasure}
  style:--chip-gap="{gap}px"
  style:--expanded-height="{expandedHeight}px"
  style:--active-expanded-height="{activeExpandedHeight}px"
>
  {@render children()}
</div>

<style>
  .morph-chip-group {
    display: flex;
    flex-wrap: wrap;
    gap: var(--chip-gap, 8px);
    position: relative;
    min-height: 56px;
    transition: min-height var(--duration-dramatic) var(--ease-spring);
  }

  /* Group grows to contain the expanded chip */
  .morph-chip-group.has-expanded {
    min-height: var(--active-expanded-height, 108px);
  }

  @media (prefers-reduced-motion: reduce) {
    .morph-chip-group {
      transition: none;
    }
  }
</style>
