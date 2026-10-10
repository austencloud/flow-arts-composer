<!--
  MediaSequenceCard.svelte - Individual sequence card in media browser grid
-->
<script lang="ts">
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import TKAWordGlyph from "$lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

  interface Props {
    sequence: SequenceData;
    coverUrl?: string;
    isLoading?: boolean;
    disabled?: boolean;
    onclick: () => void;
    ondragstart: (e: DragEvent) => void;
  }

  let {
    sequence,
    coverUrl,
    isLoading = false,
    disabled = false,
    onclick,
    ondragstart,
  }: Props = $props();

  const hasVideo = $derived(!!sequence?.performanceVideoUrl);
  const displayName = $derived(sequence.word || sequence.name || "Unnamed");
  const stepCount = $derived(sequence.steps?.length);
</script>

<button
  class="sequence-item"
  class:loading={isLoading}
  {onclick}
  title="{displayName} - Click to preview, drag to timeline"
  {disabled}
  draggable="true"
  {ondragstart}
>
  <div class="item-thumb">
    {#if coverUrl}
      <img src={coverUrl} alt={displayName} loading="lazy" />
    {:else}
      <div class="placeholder-thumb">
        <i class="fas fa-film" aria-hidden="true"></i>
      </div>
    {/if}
    {#if hasVideo}
      <div class="video-badge">
        <i class="fas fa-video" aria-hidden="true"></i>
      </div>
    {/if}
    {#if isLoading}
      <div class="loading-overlay">
        <ProgressRing percent={-1} size={24} strokeWidth={2} />
      </div>
    {/if}
  </div>
  <span class="item-name">
    {#if sequence.word}
      <TKAWordGlyph word={sequence.word} height={12} darkMode />
    {:else}
      {displayName}
    {/if}
  </span>
  {#if stepCount}
    <span class="item-meta">{stepCount} steps</span>
  {/if}
</button>

<style>
  .sequence-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: center;
    transition: all var(--duration-normal) ease;
  }

  .sequence-item:hover:not(:disabled) {
    transform: translateY(-3px) scale(1.03);
  }

  .sequence-item:hover:not(:disabled) .item-thumb {
    border-color: var(--theme-accent);
  }

  .sequence-item:disabled {
    cursor: wait;
  }

  .sequence-item.loading {
    opacity: 0.6;
  }

  .item-thumb {
    position: relative;
    aspect-ratio: 1;
    border-radius: 12px;
    overflow: hidden;
    border: 2px solid var(--theme-stroke);
    transition: all var(--duration-normal) ease;
    background: var(--theme-card-bg);
  }

  .item-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .placeholder-thumb {
    width: 100%;
    height: 100%;
    background: var(--theme-panel-elevated-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--theme-text-dim);
    font-size: var(--font-size-2xl);
  }

  .video-badge {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: linear-gradient(
      135deg,
      rgba(239, 68, 68, 0.95) 0%,
      rgba(220, 38, 38, 0.9) 100%
    );
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-compact);
    color: white;
  }

  .loading-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }

  .item-name {
    font-size: var(--font-size-compact);
    color: var(--theme-text);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0 2px;
  }

  .item-meta {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
  }

  @media (prefers-reduced-motion: reduce) {
    .sequence-item,
    .item-thumb {
      transition: none;
    }

    .sequence-item:hover:not(:disabled) {
      transform: none;
    }
  }

  .sequence-item:focus-visible .item-thumb {
    outline: 2px solid var(--theme-accent, rgba(139, 92, 246, 0.8));
    outline-offset: 2px;
  }
</style>
