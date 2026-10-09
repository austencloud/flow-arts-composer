<!--
  The Reference video section: add up to three camera videos of a real
  performance, see how each one synced, and nudge or re-aim it.
-->
<script lang="ts">
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import LinkChip from "$lib/shared/ui/components/LinkChip.svelte";
  import ScrubbableNumber from "$lib/shared/ui/components/ScrubbableNumber.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";

  import LabSection from "../LabSection.svelte";

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

  /** Short labels for the angle grid; the full name stays the accessible one. */
  const SHORT_CAMERA_LABEL: Record<string, string> = {
    front: "Front",
    "quarter-left": "¾ left",
    left: "Left",
    "quarter-right": "¾ right",
    right: "Right",
    back: "Back",
    overhead: "Above",
  };

  const CAMERA_OPTIONS = REFERENCE_CAMERA_PRESETS.map((preset) => ({
    value: preset.id,
    label: SHORT_CAMERA_LABEL[preset.id] ?? preset.label,
    ariaLabel: preset.label,
  }));

  const summaryText = $derived(
    session.videos.length === 0
      ? "None yet"
      : `${session.videos.length} of ${MAX_REFERENCE_VIDEOS}${session.status === "ready" ? " · timed" : ""}`
  );

  function syncText(video: ReferenceVideo): string {
    if (video.key === session.timedVideoKey) return "Timed in Post Studio";
    if (video.clapState === "finding") return "Listening for the clap…";
    if (video.clapState === "none") return "No clap found; line it up by hand";
    return `Clap at ${video.clapSeconds!.toFixed(2)} s`;
  }
</script>

<LabSection
  id="lab-reference"
  title="Reference video"
  icon="fa-film"
  summary={summaryText}
>
  <p class="note">{statusText}</p>
  {#if session.status === "no-post" || session.status === "no-timing" || session.status === "stale"}
    <div class="actions">
      <LinkChip
        href={`/post?project=${encodeURIComponent(sequenceId)}`}
        target="_blank"
        rel="noopener">Open Post Studio</LinkChip
      >
      <FilterChipBase
        mode="action"
        icon="fa-rotate"
        label="Check again"
        size="sm"
        onclick={() => void session.findTimedTake(sequenceId)}
      />
    </div>
  {/if}

  {#each session.videos as video (video.key)}
    <div class="video-row">
      <div class="row">
        <span class="name" title={video.name}>{video.name}</span>
        <FilterChipBase
          mode="action"
          icon="fa-xmark"
          label="Remove"
          size="sm"
          ariaLabel={`Remove ${video.name}`}
          onclick={() => session.remove(video.key, sequenceId)}
        />
      </div>
      <span class="note">{syncText(video)}</span>
      <div class="field">
        <span class="field-label">Camera</span>
        <SegmentedControl
          options={CAMERA_OPTIONS}
          value={video.camera.presetId}
          density="tight"
          columns={4}
          ariaLabel={`Camera angle for ${video.name}`}
          onchange={(presetId) =>
            session.setCamera(video.key, { presetId, shot: null })}
        />
      </div>
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
    <div class="actions">
      <PanelButton onclick={() => input?.click()}>
        <i class="fa-solid fa-plus" aria-hidden="true"></i>
        {session.videos.length === 0 ? "Add videos" : "Add another video"}
      </PanelButton>
    </div>
  {/if}
</LabSection>

<style>
  .note,
  .field-label {
    margin: 0;
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
  }
  .video-row {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-top: 0.75rem;
    /* A neutral divider between videos, the theme stroke, not an accent. */
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    min-width: 0;
  }
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-sm, 0.875rem);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  .hidden {
    display: none;
  }
</style>
