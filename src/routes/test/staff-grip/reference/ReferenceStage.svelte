<!--
  Each reference video over the 3D view aimed the same way. The clock video
  plays natively; the others are pulled back into step whenever they drift
  more than a couple of frames, and every video is seeked while paused.
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
  const DRIFT_SECONDS = 0.08;

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
        if (Math.abs(element.currentTime - target) > DRIFT_SECONDS)
          element.currentTime = Math.max(0, target);
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
