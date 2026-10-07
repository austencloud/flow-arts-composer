<!--
  Each reference video over the 3D view aimed the same way. The clock video
  plays natively. The others play a touch faster or slower until they sit
  exactly on their clap offset, and jump only when they are far off: a seek
  lands wherever the decoder can, which left them a frame out. Every video
  is seeked while paused.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  import type {
    ReferenceSession,
    ReferenceVideo,
  } from "./reference-session.svelte";

  let {
    session,
    pane,
  }: {
    session: ReferenceSession;
    pane: Snippet<[ReferenceVideo, number, number]>;
  } = $props();

  const elements: Record<string, HTMLVideoElement> = {};
  let paneWidths = $state<number[]>([]);
  let paneHeights = $state<number[]>([]);
  /** Past this a follower jumps; under it, its speed pulls it into step. */
  const SEEK_SECONDS = 0.25;
  /** Speed change per second of drift, and the most it may change. */
  const CATCH_UP_GAIN = 4;
  const MAX_CATCH_UP = 0.25;

  function aspectAt(index: number): number {
    const width = paneWidths[index] ?? 0;
    const height = paneHeights[index] ?? 0;
    return width > 0 && height > 0 ? width / height : 1;
  }

  $effect(() => {
    const playing = session.playing;
    const speed = session.speed;
    for (const video of session.videos) {
      const element = elements[video.key];
      if (!element) continue;
      element.playbackRate = speed;
      if (playing) void element.play().catch(() => (session.playing = false));
      else element.pause();
    }
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const clock = session.clockKey ? elements[session.clockKey] : undefined;
      if (clock) session.time = clock.currentTime;
      for (const video of session.videos) {
        const element = elements[video.key];
        if (!element || video.key === session.clockKey) continue;
        const target = session.videoSeconds(video);
        const drift = element.currentTime - target;
        if (Math.abs(drift) > SEEK_SECONDS) {
          element.currentTime = Math.max(0, target);
          element.playbackRate = session.speed;
        } else {
          const catchUp = Math.max(
            -MAX_CATCH_UP,
            Math.min(MAX_CATCH_UP, drift * CATCH_UP_GAIN)
          );
          element.playbackRate = session.speed * (1 - catchUp);
        }
      }
      if (clock?.ended) session.playing = false;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  });

  $effect(() => {
    if (session.playing) return;
    for (const video of session.videos) {
      const element = elements[video.key];
      if (!element) continue;
      const target = Math.max(0, session.videoSeconds(video));
      if (Math.abs(element.currentTime - target) > 1 / 120)
        element.currentTime = target;
    }
  });
</script>

<div class="reference" style:--columns={session.videos.length}>
  {#each session.videos as video, index (video.key)}
    <section class="pair" aria-label={`Reference ${index + 1}: ${video.name}`}>
      <div class="cell">
        <video
          bind:this={elements[video.key]}
          src={video.url}
          muted={video.key !== session.clockKey}
          playsinline
          preload="auto"
          onloadedmetadata={(event) =>
            session.setDuration(video.key, event.currentTarget.duration)}
        ></video>
        <span class="label">{video.name}</span>
      </div>
      <div
        class="cell pane"
        bind:clientWidth={paneWidths[index]}
        bind:clientHeight={paneHeights[index]}
      >
        {@render pane(video, index, aspectAt(index))}
      </div>
    </section>
  {/each}
</div>

<style>
  /* Phone: each video sits over its 3D view, one pair under another. */
  .reference {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1px;
    min-width: 0;
    min-height: 0;
  }

  .pair {
    display: grid;
    grid-template-rows: repeat(2, minmax(0, 36svh));
    gap: 1px;
    min-width: 0;
    min-height: 0;
  }

  .cell {
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--surface-inset, rgba(0, 0, 0, 0.2));
  }

  .pane :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
  }

  video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
  }

  .label {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    max-width: calc(100% - 1rem);
    overflow: hidden;
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    background: var(--surface-glass, rgba(0, 0, 0, 0.6));
    font-size: var(--font-size-compact, 0.75rem);
    text-overflow: ellipsis;
    white-space: nowrap;
    pointer-events: none;
  }

  /* Wider: the pairs stand side by side and share the stage's height. */
  @media (min-width: 40rem) {
    .reference {
      grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
    }

    .pair {
      grid-template-rows: repeat(2, minmax(0, 40svh));
    }
  }

  @media (min-width: 64rem), (min-width: 40rem) and (max-height: 34rem) {
    .reference {
      height: 100%;
    }

    .pair {
      grid-template-rows: repeat(2, minmax(0, 1fr));
    }
  }
</style>
