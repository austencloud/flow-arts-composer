<script lang="ts">
  import type { Snippet } from "svelte";

  import TransportControls from "#lib/shared/animation-engine/components/controls/TransportControls.svelte";
  import { getFilmDirectorContext } from "../_lib/film-director-context";
  import FilmTimeline from "./FilmTimeline.svelte";

  // The host's film panel. It lives in this row because the row renders at
  // every width, unlike the scene control rail, which the compact layout
  // replaces wholesale.
  let { trailing }: { trailing?: Snippet } = $props();

  const director = getFilmDirectorContext();

  // The scene control rail has to sit clear of this bar. What it needs is not
  // the height but the reserve: the distance from the bottom of the stage to
  // the top of the transport, which folds in the bottom inset and the borders.
  let transportEl = $state<HTMLElement | null>(null);
  let measuredHeight = $state(0);
  $effect(() => {
    void measuredHeight;
    const stage = transportEl?.offsetParent as HTMLElement | null;
    if (!transportEl || !stage) return;
    document.documentElement.style.setProperty(
      "--director-transport-reserve",
      `${stage.clientHeight - transportEl.offsetTop}px`
    );
  });

  function formatTime(seconds: number): string {
    const whole = Math.max(0, Math.floor(seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
  }

  /**
   * While a scene is soloed the playhead never leaves it, so film time over the
   * film's length would read as a film stuck near one mark. The clock becomes
   * the scene's instead: elapsed within the loop, over the loop.
   */
  const clock = $derived.by(() => {
    const index = director.soloSceneIndex;
    const scene = index === null ? null : director.film.scenes[index];
    if (!scene) {
      return {
        elapsed: director.playheadSeconds,
        total: director.film.durationSeconds,
      };
    }
    return {
      elapsed: Math.max(0, director.playheadSeconds - scene.startSeconds),
      total: scene.durationSeconds,
    };
  });
</script>

<div
  class="transport"
  aria-label="Film playback controls"
  bind:this={transportEl}
  bind:clientHeight={measuredHeight}
>
  <!-- wantsToPlay, not isPlaying: the director suspends isPlaying during scene
       preparation and transition holds while intent stays true, so isPlaying
       would show Play during a hold and the click would cancel playback the
       user already asked for. -->
  <TransportControls
    isPlaying={director.wantsToPlay}
    onPlaybackToggle={director.togglePlayback}
    onStepFullBeatBackward={director.previousScene}
    onStepFullBeatForward={director.nextScene}
  />

  <div class="timeline-cell"><FilmTimeline /></div>

  <!-- Below 60rem the shortest bands are too narrow to carry their titles, so
       the scene the film is actually in gets its own line rather than going
       unsaid. The timecode rides along instead of being dropped. A film with
       many more scenes would cross that threshold while still wide; the seam
       is a width because the alternative is measuring every band at runtime. -->
  <div class="compact-head">
    <span class="scene-name">{director.frame.scene.title}</span>

    <span class="timecode">
      <span class="sizer" aria-hidden="true">00:00 / 00:00</span>
      <span class="live">
        {formatTime(clock.elapsed)} / {formatTime(clock.total)}
      </span>
    </span>
  </div>

  {#if trailing}{@render trailing()}{/if}
</div>

<style>
  .transport {
    position: absolute;
    right: max(0.75rem, env(safe-area-inset-right));
    bottom: max(0.75rem, env(safe-area-inset-bottom));
    left: max(0.75rem, env(safe-area-inset-left));
    z-index: 70;
    display: grid;
    grid-template-columns: auto minmax(8rem, 1fr) auto auto;
    align-items: center;
    gap: 0.65rem;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 1rem;
    color: var(--theme-text, #fff);
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #10111b) 94%,
      transparent
    );
    box-shadow: 0 1rem 3.5rem rgba(0, 0, 0, 0.38);
  }

  /* The elapsed half changes every frame and the total changes per film, so the
     cell is sized to the widest value rather than to whatever is showing —
     otherwise crossing 0:59 shoves the film button. */
  .timecode {
    display: inline-grid;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .timecode .sizer,
  .timecode .live {
    grid-area: 1 / 1;
  }

  .timecode .sizer {
    visibility: hidden;
  }

  .timeline-cell {
    min-width: 0;
  }

  .compact-head {
    display: contents;
  }

  .scene-name {
    display: none;
  }

  @media (max-width: 60rem) {
    .transport {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem 0.5rem;
      padding: 0.5rem 0.6rem;
    }

    .timeline-cell {
      flex: 1 1 4rem;
    }

    /* Its own full-width line, which is also what forces the controls row to
       wrap under it. */
    .compact-head {
      display: flex;
      order: -1;
      flex: 1 0 100%;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.5rem;
      padding: 0 0.15rem;
    }

    .scene-name {
      display: block;
      min-width: 0;
      overflow: hidden;
      color: var(--theme-text, #fff);
      font-size: var(--font-size-compact, 0.75rem);
      font-weight: 700;
      letter-spacing: 0.04em;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
    }
  }
</style>
