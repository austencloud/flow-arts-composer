<!--
  ActPlayer.svelte

  Inline docked player for the whole choreo sheet as one "act" sequence. Composes
  the existing AnimationPlayer (owns transport + BPM + progress bar) with the write
  feature's music player (getMusicPlayer service + MusicPlayer.svelte UI). v1 sync:
  BPM is the shared tempo; the two transports are independent (zero-drift audio-clock
  sync is a deferred v2 — see spec 2026-07-01-choreo-act-playback-design.md).
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { dockSlide } from "#lib/shared/transitions/dock-slide.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import AnimationPlayer from "#lib/shared/sequence-viewer/components/AnimationPlayer.svelte";
  import MusicPlayer from "../MusicPlayer.svelte";
  import { getMusicPlayer } from "../../get-music-player";
  import {
    createDefaultMusicPlayerState,
    type MusicPlayerState,
  } from "../../domain/types/write";

  let {
    sequence,
    stacked = false,
    playerFirst = false,
    constrainedHeight = false,
    wide = false,
    ultraWide = false,
    onClose,
    onStepChange,
  }: {
    sequence: SequenceData | null;
    stacked?: boolean;
    playerFirst?: boolean;
    constrainedHeight?: boolean;
    wide?: boolean;
    ultraWide?: boolean;
    onClose?: () => void;
    /**
     * The act's current step as it animates, 0-based into the concatenated act
     * sequence (null at the start position). The sheet uses it to highlight the
     * pictograph being played — AnimationPlayer already reports this for exactly
     * this purpose, so it is forwarded rather than re-derived from the clock.
     */
    onStepChange?: (stepIndex: number | null, isPlaying: boolean) => void;
  } = $props();

  const music = getMusicPlayer();
  let musicState = $state<MusicPlayerState>(createDefaultMusicPlayerState());
  let objectUrl: string | null = null;

  onMount(() => {
    music.onError(
      (m) => (musicState = { ...musicState, error: m, isLoading: false })
    );
    music.onLoadedMetadata(
      (durMs) =>
        (musicState = {
          ...musicState,
          duration: durMs,
          isLoaded: true,
          isLoading: false,
        })
    );
    music.onTimeUpdate(
      (curMs, durMs) =>
        (musicState = {
          ...musicState,
          currentTime: curMs,
          duration: durMs || musicState.duration,
        })
    );
    music.onEnded(
      () => (musicState = { ...musicState, isPlaying: false, currentTime: 0 })
    );
  });

  onDestroy(() => {
    music.onError(null);
    music.onTimeUpdate(null);
    music.onLoadedMetadata(null);
    music.onEnded(null);
    // Closing the dock must stop the loaded track. The player is a module-level
    // singleton, so removing callbacks alone leaves its audio playing after the
    // controls disappear.
    music.cleanup();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  });

  async function onFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);
    musicState = {
      ...musicState,
      isLoading: true,
      isLoaded: false,
      error: null,
      filename: file.name,
      currentTime: 0,
    };
    await music.load(objectUrl, file.name);
  }

  async function playMusic() {
    await music.playLoaded();
    musicState = { ...musicState, isPlaying: true };
  }
  async function pauseMusic() {
    await music.pause();
    musicState = { ...musicState, isPlaying: false };
  }
  async function stopMusic() {
    await music.stop();
    musicState = { ...musicState, isPlaying: false, currentTime: 0 };
  }
  function seekMusic(ms: number) {
    music.seek(ms);
    musicState = { ...musicState, currentTime: ms };
  }
</script>

<aside
  id="choreo-act-player"
  class="act-player"
  class:stacked
  class:player-first={playerFirst}
  class:constrained-height={constrainedHeight}
  class:wide
  class:ultra-wide={ultraWide}
  aria-labelledby="choreo-act-player-title"
  transition:dockSlide
>
  <div class="dock-head">
    <span id="choreo-act-player-title" class="dock-title">Play act</span>
    <button
      type="button"
      class="dock-close"
      aria-label="Close player"
      onclick={() => onClose?.()}
    >
      <i class="fa-solid fa-xmark" aria-hidden="true"></i>
    </button>
  </div>

  {#if sequence}
    <div class="player-host">
      <AnimationPlayer
        {sequence}
        {onStepChange}
        autoPlay={false}
        showControls={true}
        controlsLevel="full"
        layout="vertical"
        tapToToggle={true}
      />
    </div>
    <div class="music-host" class:compact={playerFirst || constrainedHeight}>
      <label
        class="load-music"
        aria-label={musicState.filename ? "Change music" : "Load music"}
      >
        <i class="fa-solid fa-music" aria-hidden="true"></i>
        <span class="load-text"
          >{musicState.filename ? "Change music" : "Load music"}</span
        >
        <input type="file" accept="audio/*" onchange={onFile} hidden />
      </label>
      <MusicPlayer
        playerState={musicState}
        compact={playerFirst || constrainedHeight}
        onPlayRequested={playMusic}
        onPauseRequested={pauseMusic}
        onStopRequested={stopMusic}
        onSeekRequested={seekMusic}
      />
    </div>
  {:else}
    <p class="empty">Add sequences to play the act.</p>
  {/if}
</aside>

<style>
  .act-player {
    --act-player-w: min(460px, 42vw);
    flex-shrink: 0;
    width: var(--act-player-w);
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--theme-panel-bg, #14141c);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 8px;
    overflow: hidden;
  }

  /* dockSlide perf contract: children pinned at final width so the glide is a
     pure clip-reveal (no per-frame relayout of the dock's contents). */
  .act-player > :global(*) {
    width: var(--act-player-w);
  }

  .act-player.wide {
    --act-player-w: min(520px, 34vw);
  }

  .act-player.ultra-wide {
    --act-player-w: min(640px, 30vw);
  }

  .act-player.stacked {
    width: 100%;
  }

  .act-player.stacked > :global(*) {
    width: auto;
  }

  .act-player.player-first {
    flex: 1 1 auto;
    min-height: 0;
  }

  .dock-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .dock-title {
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 600;
    color: var(--theme-text, #fff);
  }

  .dock-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    background: none;
    border: none;
    border-radius: 6px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    cursor: pointer;
  }

  .dock-close:hover {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.1));
    color: var(--theme-text, #fff);
  }

  .player-host {
    flex: 1;
    min-height: 280px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .act-player.constrained-height .player-host,
  .act-player.player-first .player-host {
    min-height: 0;
  }

  .music-host {
    flex-shrink: 0;
    padding: var(--spacing-sm) var(--spacing-md) var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .music-host.compact {
    display: grid;
    grid-template-columns: var(--min-touch-target, 44px) minmax(0, 1fr);
    align-items: center;
    padding: var(--spacing-xs);
  }

  .music-host.compact > :global(.music-player) {
    min-width: 0;
  }

  .load-music {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-xs);
    min-height: var(--min-touch-target, 44px);
    padding: 0 var(--spacing-md);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 8px;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-sm, 0.875rem);
    cursor: pointer;
    align-self: flex-start;
  }

  .load-music:hover {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.1));
  }

  .music-host.compact .load-music {
    width: var(--min-touch-target, 44px);
    padding: 0;
    justify-content: center;
  }

  .music-host.compact .load-text {
    display: none;
  }

  .empty {
    text-align: center;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-sm, 0.875rem);
    margin: var(--spacing-md);
  }
</style>
