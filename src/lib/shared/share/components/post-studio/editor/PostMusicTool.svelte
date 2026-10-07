<script lang="ts">
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import TypeableValue from "$lib/shared/ui/components/TypeableValue.svelte";
  import ValueSlider from "$lib/shared/ui/components/ValueSlider.svelte";
  import {
    downbeatFromTaps,
    trackSecondsAt,
  } from "$lib/shared/media-composition/domain/music-grid";
  import {
    POST_MUSIC_MAX_BEATS_PER_BAR,
    POST_MUSIC_MAX_GAIN,
    POST_MUSIC_MAX_LICENSE,
    POST_MUSIC_MAX_TEXT,
    type PostMusic,
  } from "$lib/shared/media-composition/domain/post-music";
  import type { MusicPatch } from "$lib/shared/media-composition/domain/post-music-edits";

  /**
   * The music's settings: its level and fades, its beat grid, and the names
   * its credit and license need. Suggest BPM only shows what it heard; the
   * tempo changes when Use is pressed. Tapping along while the post plays
   * moves bar 1 onto the beat of the taps, to the beat nearest where bar 1
   * was, so the bar numbers stay where they were.
   */
  interface Props {
    music: PostMusic;
    playing: boolean;
    /** The playhead in post seconds, read as each tap lands. */
    playheadSeconds: () => number;
    /** `key` names the setting, so one slider drag makes one undo step. */
    onChange: (key: string, patch: MusicPatch) => void;
  }

  let { music, playing, playheadSeconds, onChange }: Props = $props();

  const id = $props.id();

  /** A pause longer than this between taps starts a new count. */
  const TAP_RESET_MS = 2000;

  let tapButton = $state<HTMLButtonElement | null>(null);
  let taps: number[] = [];
  let lastTapAt = Number.NEGATIVE_INFINITY;
  let tapCount = $state(0);
  let suggesting = $state(false);
  let suggestion = $state<{
    bpm: number;
    confidence: number;
    uncertain: boolean;
  } | null>(null);
  let suggestNote = $state("");
  // The file the suggestion or note came from. Either one shows only while
  // that file is still the music.
  let suggestedFor = $state<string | null>(null);
  const shownSuggestion = $derived(
    suggestedFor === music.url ? suggestion : null
  );
  const shownNote = $derived(suggestedFor === music.url ? suggestNote : "");

  const playingSeconds = $derived(
    music.sourceOutSeconds - music.sourceInSeconds
  );
  const percent = (value: number) => `${Math.round(value)}%`;
  const fadeSeconds = (value: number) => `${value.toFixed(2)} s`;
  const bpmText = (bpm: number) => `${Number(bpm.toFixed(2))} BPM`;

  function tap(): void {
    const grid = music.grid;
    if (!playing || !grid) return;
    const at = performance.now();
    if (at - lastTapAt > TAP_RESET_MS) taps = [];
    lastTapAt = at;
    taps = [...taps, trackSecondsAt(music, playheadSeconds())];
    tapCount = taps.length;
    const downbeat = downbeatFromTaps(taps, grid.bpm, grid.downbeatSeconds);
    if (downbeat !== null) onChange("downbeat", { downbeatSeconds: downbeat });
  }

  // A tap counts when the finger lands, not when it lifts: the lift comes a
  // tenth of a second later and would pull bar 1 late.
  $effect(() => {
    const button = tapButton;
    if (!button) return;
    button.addEventListener("pointerdown", tap);
    return () => button.removeEventListener("pointerdown", tap);
  });

  /** Enter or Space on the button taps; a pointer has tapped already. */
  function tapFromKeys(event: MouseEvent): void {
    if (event.detail === 0) tap();
  }

  async function suggestBpm(): Promise<void> {
    if (suggesting) return;
    const url = music.url;
    suggestedFor = url;
    suggesting = true;
    suggestion = null;
    suggestNote = "";
    try {
      const { analyzeAudioBpm } =
        await import("$lib/shared/audio/bpm-analyzer");
      const result = await analyzeAudioBpm(url);
      if (url !== music.url) return;
      if (result.confidence <= 0)
        suggestNote = "No steady beat found. Type the tempo in.";
      else
        suggestion = {
          bpm: result.bpm,
          confidence: result.confidence,
          uncertain: result.isUncertain === true,
        };
    } catch {
      suggestNote = "Could not read the music file.";
    } finally {
      suggesting = false;
    }
  }

  function useSuggestion(): void {
    if (!shownSuggestion) return;
    onChange("bpm", { bpm: shownSuggestion.bpm });
    suggestion = null;
  }

  function setText(
    field: "label" | "artist" | "license",
    input: HTMLInputElement
  ): void {
    const text = input.value.trim();
    // The music always has a name; clearing it keeps the old one.
    if (field === "label" && !text) {
      input.value = music.label;
      return;
    }
    onChange(field, { [field]: text || null });
  }
</script>

<div class="music-tool">
  <ValueSlider
    label="Level"
    value={music.gain * 100}
    min={0}
    max={POST_MUSIC_MAX_GAIN * 100}
    step={1}
    origin={100}
    format={percent}
    onchange={(value) => onChange("gain", { gain: value / 100 })}
  />
  <ValueSlider
    label="Fade in"
    value={music.fadeInSeconds}
    min={0}
    max={Math.max(0, playingSeconds / 2)}
    step={0.05}
    format={fadeSeconds}
    onchange={(value) => onChange("fadeIn", { fadeInSeconds: value })}
  />
  <ValueSlider
    label="Fade out"
    value={music.fadeOutSeconds}
    min={0}
    max={Math.max(0, playingSeconds / 2)}
    step={0.05}
    format={fadeSeconds}
    onchange={(value) => onChange("fadeOut", { fadeOutSeconds: value })}
  />

  <section class="group" aria-labelledby="{id}-grid">
    <h4 class="group-title" id="{id}-grid">Beat grid</h4>
    <div class="pairs">
      <span class="pair-name" aria-hidden="true">Tempo</span>
      <TypeableValue
        label="Tempo"
        text={music.grid ? bpmText(music.grid.bpm) : "None"}
        draft={music.grid ? String(Number(music.grid.bpm.toFixed(2))) : ""}
        unit="BPM"
        oncommit={(bpm) => onChange("bpm", { bpm })}
      />
      {#if music.grid}
        <span class="pair-name" aria-hidden="true">Beats per bar</span>
        <TypeableValue
          label="Beats per bar"
          text={String(music.grid.beatsPerBar)}
          sizer={String(POST_MUSIC_MAX_BEATS_PER_BAR)}
          oncommit={(beats) => onChange("beatsPerBar", { beatsPerBar: beats })}
        />
        <span class="pair-name" aria-hidden="true">Bar 1 at</span>
        <TypeableValue
          label="Bar 1 at, in the song's own seconds"
          text={`${music.grid.downbeatSeconds.toFixed(3)} s`}
          oncommit={(seconds) =>
            onChange("downbeat", { downbeatSeconds: seconds })}
        />
      {/if}
    </div>
    {#if music.grid}
      <div class="actions">
        <PanelButton
          bind:ref={tapButton}
          onclick={tapFromKeys}
          disabled={!playing}
        >
          <i class="fa-solid fa-hand-pointer" aria-hidden="true"></i>
          Tap the beat
        </PanelButton>
        <PanelButton onclick={() => onChange("bpm", { bpm: null })}>
          Remove beat grid
        </PanelButton>
      </div>
      <p class="status" role="status">
        {#if !playing}
          Play the post to tap along. Bar 1 moves onto your taps.
        {:else if tapCount > 0}
          {tapCount} {tapCount === 1 ? "tap" : "taps"}
        {:else}
          Tap with the beat. Bar 1 moves onto your taps.
        {/if}
      </p>
    {/if}
    <div class="actions">
      <PanelButton onclick={() => void suggestBpm()} disabled={suggesting}>
        <i class="fa-solid fa-wave-square" aria-hidden="true"></i>
        {suggesting ? "Listening…" : "Suggest BPM"}
      </PanelButton>
      {#if shownSuggestion}
        <PanelButton onclick={useSuggestion}>
          Use {bpmText(shownSuggestion.bpm)}
        </PanelButton>
      {/if}
    </div>
    {#if shownSuggestion}
      <p class="status" role="status">
        About {bpmText(shownSuggestion.bpm)}, {Math.round(
          shownSuggestion.confidence * 100
        )}% sure.{shownSuggestion.uncertain
          ? " The beat is unclear; check it by ear."
          : ""}
      </p>
    {:else if shownNote}
      <p class="status" role="status">{shownNote}</p>
    {/if}
  </section>

  <section class="group" aria-labelledby="{id}-credit">
    <h4 class="group-title" id="{id}-credit">Credit</h4>
    <label class="text-row">
      <span class="pair-name">Name</span>
      <input
        class="field"
        value={music.label}
        maxlength={POST_MUSIC_MAX_TEXT}
        onchange={(event) => setText("label", event.currentTarget)}
      />
    </label>
    <label class="text-row">
      <span class="pair-name">Artist</span>
      <input
        class="field"
        value={music.artist ?? ""}
        maxlength={POST_MUSIC_MAX_TEXT}
        onchange={(event) => setText("artist", event.currentTarget)}
      />
    </label>
    <label class="text-row">
      <span class="pair-name">License</span>
      <input
        class="field"
        value={music.license ?? ""}
        placeholder="Library, license id and date"
        maxlength={POST_MUSIC_MAX_LICENSE}
        onchange={(event) => setText("license", event.currentTarget)}
      />
    </label>
  </section>
</div>

<style>
  .music-tool {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }

  .group {
    display: grid;
    gap: 0.75rem;
    min-width: 0;
  }

  .group-title {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: 0.875rem;
    font-weight: 600;
  }

  /* Each name beside a box that takes a typed value. */
  .pairs {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.5rem 0.75rem;
  }

  .pair-name {
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .status {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .text-row {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
  }

  .field {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    padding: 0 0.625rem;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.5rem;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg);
    font: inherit;
    font-size: 1rem;
  }

  .field:focus-visible {
    outline: 2px solid var(--theme-accent, currentColor);
    outline-offset: 1px;
  }
</style>
