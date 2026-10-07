<!--
  The Reference video card: add up to three camera videos of a real
  performance, see how each one synced, and nudge or re-aim it.
-->
<script lang="ts">
  import ScrubbableNumber from "$lib/shared/ui/components/ScrubbableNumber.svelte";

  import { REFERENCE_CAMERA_PRESETS } from "./reference-cameras";
  import {
    FRAME_SECONDS,
    MAX_REFERENCE_VIDEOS,
    type ReferenceSession,
    type ReferenceVideo,
  } from "./reference-session.svelte";

  let {
    session,
    sequenceId,
  }: { session: ReferenceSession; sequenceId: string } = $props();

  let input: HTMLInputElement | null = $state(null);

  const statusText = $derived(
    {
      empty:
        "Add up to three videos of yourself doing this sequence, started with one clap.",
      loading: "Reading your post…",
      "no-post":
        "This sequence has no Post Studio post yet. Add the videos there and map the timing on one of them.",
      "no-timing":
        "None of these videos has mapped timing in Post Studio, so the performer stays where the lab puts it.",
      stale:
        "The sequence changed after its timing was mapped. The performer follows the old landings.",
      ready: "The performer follows your timed video.",
    }[session.status]
  );

  function syncText(video: ReferenceVideo): string {
    if (video.key === session.timedVideoKey) return "Timed in Post Studio";
    if (video.clapState === "finding") return "Listening for the clap…";
    if (video.clapState === "none") return "No clap found; line it up by hand";
    return `Clap at ${video.clapSeconds!.toFixed(2)} s`;
  }
</script>

<section class="card" aria-label="Reference video">
  <h2 class="card-title">Reference video</h2>
  <p class="note">{statusText}</p>
  {#if session.status === "no-post" || session.status === "no-timing" || session.status === "stale"}
    <div class="row">
      <a
        class="link"
        href={`/post?project=${encodeURIComponent(sequenceId)}`}
        target="_blank"
        rel="noopener">Open Post Studio</a
      >
      <button
        type="button"
        class="link"
        onclick={() => void session.findTimedTake(sequenceId)}
        >Check again</button
      >
    </div>
  {/if}

  {#each session.videos as video (video.key)}
    <div class="video-row">
      <div class="row">
        <span class="name" title={video.name}>{video.name}</span>
        <button
          type="button"
          class="link"
          aria-label={`Remove ${video.name}`}
          onclick={() => session.remove(video.key, sequenceId)}>Remove</button
        >
      </div>
      <span class="note">{syncText(video)}</span>
      <label class="field">
        <span class="field-label">Camera</span>
        <select
          value={video.camera.presetId}
          onchange={(event) =>
            session.setCamera(video.key, {
              presetId: event.currentTarget.value,
              shot: null,
            })}
        >
          {#each REFERENCE_CAMERA_PRESETS as preset (preset.id)}
            <option value={preset.id}>{preset.label}</option>
          {/each}
        </select>
      </label>
      {#if !(video.key === session.timedVideoKey)}
        <ScrubbableNumber
          label="Offset"
          unit="s"
          value={video.manualOffsetSeconds}
          min={-5}
          max={5}
          step={FRAME_SECONDS}
          format={(value) => value.toFixed(3)}
          onchange={(value) => session.setManualOffset(video.key, value)}
        />
      {/if}
    </div>
  {/each}

  {#if session.videos.length < MAX_REFERENCE_VIDEOS}
    <input
      bind:this={input}
      class="hidden"
      type="file"
      accept="video/*"
      multiple
      onchange={(event) => {
        const files = event.currentTarget.files;
        if (files) void session.addFiles(files, sequenceId);
        event.currentTarget.value = "";
      }}
    />
    <button type="button" class="add" onclick={() => input?.click()}>
      {session.videos.length === 0 ? "Add videos" : "Add another video"}
    </button>
  {/if}
</section>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-width: 0;
    padding: 1rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
  }
  .card-title {
    margin: 0;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
  }
  .note,
  .field-label {
    margin: 0;
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
  }
  .video-row {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding-top: 0.6rem;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  select,
  .add {
    min-height: 44px;
    border-radius: 8px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: inherit;
    font: inherit;
    padding: 0 0.75rem;
  }
  .link {
    background: none;
    border: none;
    padding: 0.25rem 0;
    color: var(--theme-accent, #8ab4ff);
    font: inherit;
    cursor: pointer;
    min-height: 44px;
  }
  .hidden {
    display: none;
  }
</style>
