<!--
  HandPathDetail.svelte

  Expanded detail panel for a selected hand path group.
  Shows the larger path visualization, path properties, and the list of
  sequences that use it.
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

  const sideColor = $derived.by(() => {
    const hasBoth = group.sides.has(HandSide.LEFT) && group.sides.has(HandSide.RIGHT);
    if (hasBoth) return "#a855f7";
    if (group.sides.has(HandSide.LEFT)) return "var(--prop-blue, #3b82f6)";
    return "var(--prop-red, #ef4444)";
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

  const sidesLabel = $derived.by(() => {
    const hasBoth = group.sides.has(HandSide.LEFT) && group.sides.has(HandSide.RIGHT);
    if (hasBoth) return "left + right";
    if (group.sides.has(HandSide.LEFT)) return "left only";
    return "right only";
  });

  function close() {
    state.selectPath(null);
  }

  function displayName(seq: { name: string; displayName?: string; intendedWord?: string; word: string }): string {
    return seq.displayName ?? seq.intendedWord ?? seq.word ?? seq.name ?? "-";
  }
</script>

<div class="detail">
  <div class="detail__header">
    <button class="detail__close" onclick={close} aria-label="Close detail">
      <i class="fas fa-times" aria-hidden="true"></i>
    </button>
    <span class="detail__title">{group.name}</span>
    <span class="detail__subtitle">{group.sequences.length} sequences · {sidesLabel}</span>
  </div>

  <div class="detail__body">
    <!-- Larger visualization -->
    <div class="detail__viz-wrapper">
      <div class="detail__viz">
        <PathMiniViz locations={group.handPath.locations} color={sideColor} dotRadius={7} />
      </div>
    </div>

    <!-- Path properties -->
    <div class="detail__props">
      <div class="detail__prop">
        <span class="detail__prop-label">Length</span>
        <span class="detail__prop-value">{group.handPath.length}</span>
      </div>
      <div class="detail__prop">
        <span class="detail__prop-label">Grid mode</span>
        <span class="detail__prop-value">{gridModeLabel}</span>
      </div>
      <div class="detail__prop">
        <span class="detail__prop-label">Closed loop</span>
        <span class="detail__prop-value">{group.handPath.isClosed ? "yes" : "no"}</span>
      </div>
      <div class="detail__prop">
        <span class="detail__prop-label">Unique points</span>
        <span class="detail__prop-value">{group.handPath.uniqueLocations.length}</span>
      </div>
      <div class="detail__prop detail__prop--full">
        <span class="detail__prop-label">Locations</span>
        <span class="detail__prop-value detail__prop-value--mono">
          {group.handPath.locations.join(" → ")}
        </span>
      </div>
    </div>

    <!-- Sequence list -->
    <div class="detail__sequences">
      <span class="detail__section-label">Sequences using this path</span>
      <ul class="detail__seq-list">
        {#each group.sequences as seq (seq.id)}
          <li class="detail__seq-item">
            {#if seq.thumbnails?.length}
              <img
                src={seq.thumbnails[0]}
                alt="Thumbnail for {displayName(seq)}"
                class="detail__thumb"
                loading="lazy"
              />
            {:else}
              <div class="detail__thumb detail__thumb--empty" aria-hidden="true">
                <i class="fas fa-image"></i>
              </div>
            {/if}
            <span class="detail__seq-name">{displayName(seq)}</span>
          </li>
        {/each}
      </ul>
    </div>
  </div>
</div>

<style>
  .detail {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .detail__header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .detail__close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: none;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s ease;
  }

  .detail__close:hover {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.12));
  }

  .detail__title {
    font-family: "Courier New", Courier, monospace;
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    color: var(--theme-text, #fff);
    flex: 1;
    min-width: 0;
    word-break: break-all;
  }

  .detail__subtitle {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    flex-shrink: 0;
  }

  .detail__body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, rgba(255, 255, 255, 0.2)) transparent;
  }

  .detail__viz-wrapper {
    display: flex;
    justify-content: center;
  }

  .detail__viz {
    width: 160px;
    height: 160px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  .detail__props {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .detail__prop {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
  }

  .detail__prop--full {
    grid-column: 1 / -1;
  }

  .detail__prop-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .detail__prop-value {
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text, #fff);
    font-weight: 500;
  }

  .detail__prop-value--mono {
    font-family: "Courier New", Courier, monospace;
    font-size: var(--font-size-compact, 12px);
    word-break: break-word;
  }

  .detail__section-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.05em;
    display: block;
    margin-bottom: 8px;
  }

  .detail__seq-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .detail__seq-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
  }

  .detail__thumb {
    width: 36px;
    height: 36px;
    border-radius: 6px;
    object-fit: cover;
    flex-shrink: 0;
  }

  .detail__thumb--empty {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.3));
    font-size: 14px;
  }

  .detail__seq-name {
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text, #fff);
    font-family: "Courier New", Courier, monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
