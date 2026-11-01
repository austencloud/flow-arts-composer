<!--
  WhatsNewFeaturedStrip - the notes with an example clip or picture, one at a
  time in a strip to swipe or step through. The host renders each card
  through the `item` snippet; this owns only the track, the current slide
  and its buttons, so a catch-up sheet showing several releases gets one
  independent strip per release.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ChangelogEntry } from "#lib/shared/versioning/domain/models/version-models.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { reducedMotion } from "#lib/shared/transitions/motion.js";

  let {
    featured,
    item,
  }: {
    featured: ChangelogEntry[];
    item: Snippet<[ChangelogEntry]>;
  } = $props();

  let track = $state<HTMLElement | null>(null);
  let slide = $state(0);
  const still = reducedMotion();

  function showSlide(index: number) {
    if (!track) return;
    track.scrollTo({
      left: index * track.clientWidth,
      behavior: still ? "auto" : "smooth",
    });
  }

  function syncSlide() {
    if (track) slide = Math.round(track.scrollLeft / track.clientWidth);
  }
</script>

<section class="strip" aria-roledescription="carousel">
  <div class="strip-track" bind:this={track} onscroll={syncSlide}>
    {#each featured as entry, index}
      <div
        class="featured-item strip-card"
        aria-roledescription="slide"
        aria-label="{index + 1} / {featured.length}"
        inert={index !== slide}
      >
        {@render item(entry)}
      </div>
    {/each}
  </div>
  <div class="strip-nav">
    <button
      class="strip-btn"
      type="button"
      aria-label={t("action_back")}
      disabled={slide === 0}
      onclick={() => showSlide(slide - 1)}
    >
      <i class="fas fa-chevron-left" aria-hidden="true"></i>
    </button>
    <div class="strip-dots">
      {#each featured as entry, index}
        <button
          class="strip-dot"
          class:current={index === slide}
          type="button"
          aria-label={entry.media!.alt}
          aria-current={index === slide}
          onclick={() => showSlide(index)}
        ></button>
      {/each}
    </div>
    <span class="strip-count" aria-hidden="true">
      {slide + 1} / {featured.length}
    </span>
    <button
      class="strip-btn"
      type="button"
      aria-label={t("action_next")}
      disabled={slide === featured.length - 1}
      onclick={() => showSlide(slide + 1)}
    >
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
    </button>
  </div>
</section>

<style>
  /* The strip: one example at a time, swiped or stepped with the buttons.
     Every card is a full track wide, so a step is one track width. The
     cards themselves are styled by the host's `.featured-item` rules. */
  .strip {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .strip-track {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    overscroll-behavior-x: contain;
  }

  .strip-track::-webkit-scrollbar {
    display: none;
  }

  .strip-card {
    flex: 0 0 100%;
    max-inline-size: none;
    justify-content: center;
    scroll-snap-align: center;
  }

  .strip-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .strip-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 50%;
    color: var(--theme-text);
    cursor: pointer;
    transition:
      background var(--duration-normal),
      opacity var(--duration-normal);
  }

  .strip-btn:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }

  .strip-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .strip-dots {
    display: flex;
  }

  /* The dot is small; its button keeps a full touch target around it. */
  .strip-dot {
    display: grid;
    place-items: center;
    width: 28px;
    height: 44px;
    padding: 0;
    background: none;
    border: none;
    cursor: pointer;
  }

  .strip-dot::after {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--theme-text-dim);
    opacity: 0.5;
    transition:
      background var(--duration-normal),
      opacity var(--duration-normal),
      transform var(--duration-normal);
  }

  .strip-dot.current::after {
    background: var(--theme-accent);
    opacity: 1;
    transform: scale(1.3);
  }

  /* A phone has no room for a full touch target per dot, so it counts. */
  .strip-count {
    display: none;
    min-inline-size: 4ch;
    font-size: var(--font-size-sm);
    font-variant-numeric: tabular-nums;
    text-align: center;
    color: var(--theme-text-dim);
  }

  @container release-notes (max-width: 30rem) {
    .strip-dots {
      display: none;
    }

    .strip-count {
      display: block;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .strip-btn,
    .strip-dot::after {
      transition: none;
    }
  }
</style>
