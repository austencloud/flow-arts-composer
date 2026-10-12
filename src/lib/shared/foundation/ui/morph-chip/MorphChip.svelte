<!--
  MorphChip.svelte - Individual morphing chip component

  Renders a chip that morphs between collapsed (label + value) and
  expanded (label + options) states. Uses measurement-based positioning
  (FLIP-inspired) over a placeholder to enable smooth expansion in any
  flexbox layout. Spring physics via CSS linear() curves.
-->
<script lang="ts" generics="T = string">
  import { onMount, onDestroy } from "svelte";
  import { getMorphChipContext } from "./morph-chip-context.svelte.ts";
  import type { MorphChipProps } from "./types";

  let {
    id,
    label,
    expandedLabel,
    value = $bindable(),
    options,
    onchange,
    collapseDelay = 150,
    expandedContent,
    displayValue,
    expandedHeight,
  }: MorphChipProps<T> = $props();

  // Display value: use override, or convert value to string
  let chipDisplayValue = $derived(displayValue ?? String(value));

  const ctx = getMorphChipContext();

  let chipEl: HTMLElement | null = $state(null);
  let placeholderEl: HTMLElement | null = $state(null);

  // Measurement state
  let measuredLeft = $state(0);
  let measuredTop = $state(0);
  let measuredWidth = $state(0);
  let hasMeasured = $state(false);

  let unsubResize: (() => void) | undefined;

  function measurePlaceholder() {
    if (!placeholderEl) return;
    measuredLeft = placeholderEl.offsetLeft;
    measuredTop = placeholderEl.offsetTop;
    measuredWidth = placeholderEl.offsetWidth;
    hasMeasured = true;
  }

  onMount(() => {
    ctx.registerChip(id, expandedHeight);
    // Use rAF to ensure layout is complete before first measurement
    requestAnimationFrame(() => {
      measurePlaceholder();
    });
    unsubResize = ctx.onResize(measurePlaceholder);
  });

  onDestroy(() => {
    ctx.unregisterChip(id);
    unsubResize?.();
  });

  // Derived state
  let isExpanding = $derived(ctx.expandedId === id);
  let isFaded = $derived(ctx.expandedId !== null && !isExpanding);

  // Use expanded label if provided, otherwise fall back to label
  let displayLabel = $derived(expandedLabel ?? label);

  // Local morph progress (only applies to expanding chip)
  let localMorphProgress = $derived(isExpanding ? ctx.morphProgress : 0);

  // Staggered border progress - stays blue longer during collapse
  let staggeredBorderProgress = $derived(
    isExpanding || localMorphProgress > 0.3 ? 1 : localMorphProgress / 0.3
  );

  // Effective expanded height: per-chip override or group default
  let effectiveExpandedHeight = $derived(expandedHeight ?? ctx.expandedHeight);

  // Auto-measure when no explicit expandedHeight is provided
  let autoMeasure = $derived(expandedHeight == null);

  // Measure content height after expansion renders and report to group
  $effect(() => {
    if (!isExpanding || !chipEl || !autoMeasure) return;
    requestAnimationFrame(() => {
      if (!chipEl || !isExpanding) return;
      ctx.reportMeasuredHeight(id, chipEl.offsetHeight);
    });
  });

  function handleChipClick() {
    if (isExpanding) {
      ctx.collapse();
    } else if (!ctx.expandedId) {
      ctx.expand(id);
    }
  }

  function handleOptionSelect(e: MouseEvent, optionValue: T) {
    e.stopPropagation();
    value = optionValue;
    onchange?.(optionValue);
    setTimeout(() => ctx.collapse(), collapseDelay);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && isExpanding) {
      e.stopPropagation();
      ctx.collapse();
      chipEl?.focus();
    } else if (e.key === "Enter" && !isExpanding) {
      handleChipClick();
    }
  }

  // Focus first interactive element when expansion completes
  $effect(() => {
    if (isExpanding && localMorphProgress > 0.8) {
      const firstFocusable = chipEl?.querySelector<HTMLElement>(
        'button, [tabindex="0"]'
      );
      firstFocusable?.focus();
    }
  });
</script>

<!-- Placeholder maintains layout space -->
<div class="chip-placeholder" bind:this={placeholderEl}></div>

<!-- The actual chip - measurement-based absolute positioning -->
<div
  bind:this={chipEl}
  class="chip"
  class:expanding={isExpanding}
  class:faded={isFaded}
  class:measured={hasMeasured}
  class:auto-height={autoMeasure}
  style:--morph-progress={localMorphProgress}
  style:--border-progress={staggeredBorderProgress}
  style:--expanded-height={autoMeasure
    ? undefined
    : `${effectiveExpandedHeight}px`}
  style:left="{measuredLeft}px"
  style:top="{measuredTop}px"
  style:width="{measuredWidth}px"
  onclick={handleChipClick}
  onkeydown={handleKeydown}
  role="button"
  tabindex={isFaded ? -1 : 0}
  aria-expanded={isExpanding}
  aria-label={isExpanding
    ? `${displayLabel}, expanded. Press Escape to collapse.`
    : `${label}: ${chipDisplayValue}`}
>
  <!-- Collapsed content: label + value, centered with flexbox -->
  <div class="chip-content">
    <span class="chip-label">
      {label}
    </span>
    <span class="chip-value" style:opacity={1 - localMorphProgress}>
      {chipDisplayValue}
    </span>
  </div>

  <!-- Custom expanded content or default options-row -->
  {#if expandedContent}
    <div
      class="custom-content"
      role="presentation"
      style:opacity={localMorphProgress}
      style:pointer-events={isExpanding && localMorphProgress > 0.5
        ? "auto"
        : "none"}
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      {@render expandedContent({
        collapse: ctx.collapse,
        morphProgress: localMorphProgress,
      })}
    </div>
  {:else}
    <div class="options-row" style:opacity={localMorphProgress}>
      {#each options as option}
        <button
          class="option-btn"
          class:selected={value === option.value}
          onclick={(e) => handleOptionSelect(e, option.value)}
          tabindex={isExpanding ? 0 : -1}
          style:pointer-events={isExpanding && localMorphProgress > 0.5
            ? "auto"
            : "none"}
        >
          {option.label}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* Placeholder maintains layout space */
  .chip-placeholder {
    flex: 1;
    min-height: 56px;
    pointer-events: none;
  }

  /* The actual chip - measurement-based absolute positioning */
  .chip {
    position: absolute;
    z-index: 1;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-radius: 18px;
    color: var(--theme-text, #fff);
    overflow: hidden;
    cursor: pointer;
    min-height: 56px;

    /* Border color - uses staggered progress so it stays blue longer during collapse */
    border: 1.5px solid
      color-mix(
        in srgb,
        var(--theme-stroke, rgba(255, 255, 255, 0.1))
          calc(100% - var(--border-progress, 0) * 100%),
        var(--theme-accent, #6366f1) calc(var(--border-progress, 0) * 100%)
      );

    /* Fallback: cubic-bezier overshoot for browsers without linear() */
    transition:
      left var(--duration-dramatic) var(--ease-spring),
      top var(--duration-dramatic) var(--ease-spring),
      width var(--duration-dramatic) var(--ease-spring),
      min-height var(--duration-dramatic) var(--ease-spring),
      opacity var(--duration-normal) var(--ease-standard),
      box-shadow var(--duration-normal) var(--ease-standard);
  }

  /* Invisible until JS measures placeholder position */
  .chip:not(.measured) {
    opacity: 0;
  }

  .chip.expanding {
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    height: 100%;
    min-height: var(--expanded-height, 108px);
    z-index: 10;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    box-shadow:
      0 4px 20px
        color-mix(in srgb, var(--theme-accent, #6366f1) 15%, transparent),
      0 0 0 1px
        color-mix(in srgb, var(--theme-accent, #6366f1) 10%, transparent);
  }

  /* Auto-height mode: size to content instead of being constrained by group */
  .chip.expanding.auto-height {
    height: auto;
    min-height: var(--min-touch-target);
  }

  /* Hide the collapsed label/value when expanded in auto-height mode */
  .chip.expanding.auto-height .chip-content {
    display: none;
  }

  .chip.faded {
    opacity: 0;
    pointer-events: none;
  }

  /* Content container - padding sized so total content height (5+18+4+21+5=53px)
	   fits within the chip's border-box content area (56px - ~3px border = ~53px).
	   This keeps the chip at exactly 56px, matching the placeholder. */
  .chip-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 5px 12px;
    pointer-events: none;
  }

  /* Label - color morphs smoothly */
  .chip-label {
    white-space: nowrap;
    font-size: 12px;
    font-weight: 500;
    color: color-mix(
      in srgb,
      var(--theme-text-muted, rgba(255, 255, 255, 0.6))
        calc(100% - var(--morph-progress, 0) * 100%),
      var(--theme-accent, #6366f1) calc(var(--morph-progress, 0) * 100%)
    );
    transition: color var(--duration-emphasis) var(--ease-standard);
  }

  /* Value - fades out when expanded */
  .chip-value {
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    color: var(--theme-text, #fff);
    transition: opacity var(--duration-normal) var(--ease-standard);
  }

  /* Options row */
  .options-row {
    position: absolute;
    bottom: 8px;
    left: 8px;
    right: 8px;
    display: flex;
    gap: 4px;
    transition: opacity var(--duration-normal) var(--ease-standard);
    pointer-events: none;
  }

  .chip:not(.expanding) .options-row {
    bottom: -100px;
    opacity: 0;
  }

  .option-btn {
    flex: 1;
    min-height: var(--min-touch-target);
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.6));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    font-weight: 600;
    font-size: 14px;
  }

  .option-btn:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text, #fff);
  }

  .option-btn.selected {
    background: color-mix(
      in srgb,
      var(--theme-accent) 25%,
      var(--theme-card-bg)
    );
    border-color: var(--theme-accent, #6366f1);
    color: var(--theme-text, #fff);
  }

  /* Custom expanded content container */
  .custom-content {
    padding: 0 8px 8px;
    transition: opacity var(--duration-normal) var(--ease-standard);
  }

  /* When expanding, custom content fills remaining space and centers children */
  .chip.expanding .custom-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: 0;
  }

  /* Auto-measured: natural sizing, no flex stretch */
  .chip.expanding.auto-height .custom-content {
    flex: none;
  }

  .chip:not(.expanding) .custom-content {
    opacity: 0;
    pointer-events: none;
    height: 0;
    overflow: hidden;
    padding: 0;
  }

  /* Respect reduced motion preferences */
  @media (prefers-reduced-motion: reduce) {
    .chip,
    .chip-label,
    .options-row,
    .custom-content {
      transition: none !important;
    }
  }
</style>
