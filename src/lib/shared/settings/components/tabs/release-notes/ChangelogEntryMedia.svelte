<!--
  ChangelogEntryMedia - the example picture or clip under a release note.

  The frame takes the file's own shape before anything loads, so the note
  below never jumps. A clip plays muted on a loop; with reduced motion it
  waits on its first frame with controls instead.
-->
<script lang="ts">
  import type { ChangelogMedia } from "#lib/shared/versioning/domain/models/version-models.js";
  import { reducedMotion } from "#lib/shared/transitions/motion.js";

  let { media }: { media: ChangelogMedia } = $props();

  const still = reducedMotion();

  // The autoplay attribute alone stays paused in Chrome when Svelte sets
  // muted as a property after the element is made; muting first and calling
  // play() is how the wall's loop clips start too.
  let clip = $state<HTMLVideoElement | null>(null);
  $effect(() => {
    if (!clip || still) return;
    clip.muted = true;
    void clip.play().catch(() => {});
  });
</script>

<figure
  class="entry-media"
  style="aspect-ratio: {media.width} / {media.height}; max-width: min(100%, {media.width}px);"
>
  {#if media.video}
    {#if still}
      <video
        src={media.video}
        muted
        loop
        playsinline
        controls
        preload="metadata"
        disablepictureinpicture
        aria-label={media.alt}
      ></video>
    {:else}
      <video
        bind:this={clip}
        src={media.video}
        poster={media.poster ?? media.image}
        autoplay
        muted
        loop
        playsinline
        preload="auto"
        disablepictureinpicture
        aria-label={media.alt}
      ></video>
    {/if}
  {:else}
    <img
      src={media.image}
      alt={media.alt}
      width={media.width}
      height={media.height}
      loading="lazy"
      decoding="async"
    />
  {/if}
</figure>

<style>
  .entry-media {
    width: 100%;
    margin: 8px 0 4px;
    overflow: hidden;
    border-radius: 10px;
    background: color-mix(in srgb, var(--theme-text) 6%, transparent);
  }

  .entry-media video,
  .entry-media img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
