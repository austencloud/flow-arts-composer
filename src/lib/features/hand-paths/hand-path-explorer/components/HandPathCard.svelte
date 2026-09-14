<!--
  HandPathCard.svelte

  Card showing one unique hand path: name, mini visualization, sequence count,
  and a badge indicating which performer side(s) use this path.
-->
<script lang="ts">
  import type { PathGroup } from "../state/explorer-state.svelte";
  import { getExplorerContext } from "../context/explorer-context";
  import PathMiniViz from "./PathMiniViz.svelte";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

  interface Props {
    group: PathGroup;
  }

  const { group }: Props = $props();
  const { state } = getExplorerContext();

  const isSelected = $derived(state.selectedHash === group.hash);

  // Pick a color based on which sides use the path.
  const sideColor = $derived.by(() => {
    const hasBoth = group.sides.has(HandSide.LEFT) && group.sides.has(HandSide.RIGHT);
    if (hasBoth) return "#a855f7"; // purple = both
    if (group.sides.has(HandSide.LEFT)) return "var(--prop-blue, #3b82f6)";
    return "var(--prop-red, #ef4444)"; // red
  });

  const sideBadgeLabel = $derived.by(() => {
    const hasBoth = group.sides.has(HandSide.LEFT) && group.sides.has(HandSide.RIGHT);
    if (hasBoth) return "both";
    if (group.sides.has(HandSide.LEFT)) return "left";
    return "right";
  });

  const gridModeLabel = $derived.by(() => {
    switch (group.handPath.impliedGridMode) {
      case GridMode.DIAMOND: return "diamond";
      case GridMode.BOX: return "box";
      case GridMode.SKEWED: return "skewed";
      case GridMode.CENTRIC: return "centric";
      default: return group.handPath.impliedGridMode;
    }
  });

  function handleClick() {
    state.selectPath(isSelected ? null : group.hash);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="card"
  class:card--selected={isSelected}
  onclick={handleClick}
  onkeydown={handleKeydown}
  role="button"
  tabindex="0"
  aria-pressed={isSelected}
  aria-label="Hand path {group.name}, used in {group.sequences.length} sequences"
>
  <div class="card__viz">
    <PathMiniViz locations={group.handPath.locations} color={sideColor} />
  </div>

  <div class="card__info">
    <span class="card__name">{group.name}</span>

    <div class="card__meta">
      <span class="card__count">{group.sequences.length} seq</span>
      <span
        class="card__badge"
        style:background-color="color-mix(in srgb, {sideColor} 13%, transparent)"
        style:color={sideColor}
        style:border-color="color-mix(in srgb, {sideColor} 33%, transparent)"
      >
        {sideBadgeLabel}
      </span>
      <span class="card__mode">{gridModeLabel}</span>
    </div>

    {#if group.handPath.isClosed}
      <span class="card__closed-tag">closed</span>
    {/if}
  </div>
</div>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      transform 0.1s ease;
    user-select: none;
  }

  .card:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.07));
  }

  .card:active {
    transform: scale(0.97);
  }

  .card--selected {
    border-color: var(--theme-accent, #a855f7);
    background: var(--theme-accent-subtle, rgba(168, 85, 247, 0.08));
  }

  .card__viz {
    width: 100%;
    aspect-ratio: 1;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  .card__info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .card__name {
    font-family: "Courier New", Courier, monospace;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, #fff);
    word-break: break-all;
    line-height: 1.2;
  }

  .card__meta {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }

  .card__count {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  .card__badge {
    font-size: var(--font-size-compact, 12px);
    padding: 1px 6px;
    border-radius: 100px;
    border: 1px solid transparent;
    font-weight: 500;
    text-transform: capitalize;
  }

  .card__mode {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    font-style: italic;
  }

  .card__closed-tag {
    font-size: var(--font-size-compact, 12px);
    color: var(--semantic-success, #22c55e);
  }
</style>
