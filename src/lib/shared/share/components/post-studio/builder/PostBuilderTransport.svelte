<script lang="ts">
  import type { PostBuilderState } from "$lib/shared/media-composition/state/post-builder-state.svelte";
  import { formatPostClock } from "./post-builder-format";

  /**
   * Play, the clock and the act lane under the canvas. Each act is a block as
   * long as it plays; clicking one parks the playhead inside it and selects it
   * for the Acts step.
   */
  let { builder }: { builder: PostBuilderState } = $props();

  const duration = $derived(builder.durationSeconds);
  const acts = $derived(builder.compiled?.acts ?? []);
  const captions = $derived(builder.compiled?.captions ?? []);

  function share(seconds: number): string {
    return duration > 0 ? `${(seconds / duration) * 100}%` : "0%";
  }

  function scrub(event: Event): void {
    builder.pause();
    builder.seek(Number((event.currentTarget as HTMLInputElement).value));
  }

  function openAct(actId: string, startSeconds: number): void {
    builder.pause();
    builder.selectedActId = actId;
    // A hair in, so the frame shown belongs to this act, not the one before.
    builder.seek(startSeconds + 0.05);
  }
</script>

<div class="transport" aria-label="Playback">
  <div class="controls">
    <button
      type="button"
      class="play"
      onclick={builder.togglePlayback}
      disabled={duration <= 0}
      aria-label={builder.isPlaying ? "Pause" : "Play"}
    >
      <i
        class="fa-solid {builder.isPlaying ? 'fa-pause' : 'fa-play'}"
        aria-hidden="true"
      ></i>
    </button>
    <output class="clock" aria-label="Playhead">
      {formatPostClock(builder.previewSeconds)} / {formatPostClock(duration)}
    </output>
    {#if builder.currentAct}
      <span class="act-now">{builder.currentAct.label}</span>
    {/if}
  </div>

  <div class="lane" style:--playhead={share(builder.previewSeconds)}>
    <div class="acts">
      {#each acts as act (act.actId)}
        <button
          type="button"
          class="act act-{act.kind}"
          class:selected={builder.selectedActId === act.actId}
          aria-pressed={builder.selectedActId === act.actId}
          style:left={share(act.startSeconds)}
          style:width={share(act.endSeconds - act.startSeconds)}
          onclick={() => openAct(act.actId, act.startSeconds)}
        >
          <span>{act.label}</span>
          {#if act.speed !== 1}<small>{act.speed}×</small>{/if}
        </button>
      {/each}
    </div>
    {#if captions.length > 0}
      <div class="captions" aria-hidden="true">
        {#each captions as caption (caption.id)}
          <span
            class="caption"
            style:left={share(caption.startSeconds)}
            style:width={share(caption.endSeconds - caption.startSeconds)}
            title={caption.text}
          ></span>
        {/each}
      </div>
    {/if}
    <input
      class="scrubber"
      type="range"
      min="0"
      max={Math.max(duration, 0.01)}
      step="0.01"
      value={builder.previewSeconds}
      oninput={scrub}
      aria-label="Scrub the post"
      disabled={duration <= 0}
    />
    <span class="playhead" aria-hidden="true"></span>
  </div>
</div>

<style>
  .transport {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }
  .play {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    flex: none;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 50%;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg);
    cursor: pointer;
  }
  .play:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .play:focus-visible,
  .act:focus-visible {
    outline: 2px solid var(--theme-primary, currentColor);
    outline-offset: 2px;
  }
  .clock {
    color: var(--theme-text, #fff);
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .act-now {
    overflow: hidden;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lane {
    position: relative;
    display: grid;
    gap: 0.25rem;
    min-width: 0;
  }
  .acts {
    position: relative;
    height: 2.75rem;
  }
  .act {
    position: absolute;
    top: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
    padding: 0 0.5rem;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.375rem;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg);
    font: inherit;
    font-size: 0.8125rem;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }
  .act span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .act small {
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.75rem;
  }
  .act.selected {
    border-color: var(--theme-primary, #d4813a);
    box-shadow: inset 0 0 0 1px var(--theme-primary, #d4813a);
  }
  .act-card {
    background: color-mix(in srgb, var(--theme-card-bg) 70%, transparent);
  }
  .captions {
    position: relative;
    height: 0.375rem;
  }
  .caption {
    position: absolute;
    top: 0;
    bottom: 0;
    border-radius: 999px;
    background: var(--theme-text-secondary, #aaa);
  }
  .scrubber {
    width: 100%;
    min-height: 1.75rem;
    margin: 0;
    accent-color: var(--theme-primary, #d4813a);
  }
  .playhead {
    position: absolute;
    top: 0;
    bottom: 1.75rem;
    left: var(--playhead);
    width: 2px;
    background: var(--theme-text, #fff);
    pointer-events: none;
  }
</style>
