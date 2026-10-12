<!--
  SourceVideoCard: a CSP-safe YouTube card. The site frame-src blocks YouTube
  embeds (hooks.server.ts), so we show the poster thumbnail (img-src https: is
  allowed) with a play affordance; clicking opens the video on YouTube in a new
  tab. Falls back to a labelled tile if the thumbnail 404s. Thumbnail technique
  mirrors festivals/portfolio/VideosSection.svelte.

  Promoted from notation/caps/_components/CapsVideoCard.svelte so the notation
  catalog and the CAPs page share one card (.claude/rules/never-hand-roll.md).
  `year` and `note` are optional — a catalog strip often knows the creator and
  the title but has no sourced year for an individual video, and per the
  catalog's sourcing rules an unsourced year is not invented to fill the slot.
-->
<script lang="ts">
  let {
    id,
    title,
    creator,
    year = "",
    note = "",
  }: {
    id: string;
    title: string;
    creator: string;
    year?: string;
    note?: string;
  } = $props();

  let thumbFailed = $state(false);
  const watchUrl = `https://www.youtube.com/watch?v=${id}`;
</script>

<figure class="cap-media">
  <a
    class="cap-media-thumb"
    href={watchUrl}
    target="_blank"
    rel="noopener"
    aria-label={`Watch on YouTube: ${title} by ${creator}`}
  >
    {#if !thumbFailed}
      <img
        src={`https://img.youtube.com/vi/${id}/hqdefault.jpg`}
        alt={`${title} by ${creator}`}
        loading="lazy"
        onerror={() => (thumbFailed = true)}
      />
    {:else}
      <span class="cap-media-fallback">{title}</span>
    {/if}
    <span class="cap-media-play" aria-hidden="true"
      ><i class="fas fa-play"></i></span
    >
  </a>
  <figcaption>
    <strong>{title}</strong>
    <span>{year ? `${creator} · ${year}` : creator}</span>
    {#if note}<span class="cap-media-note">{note}</span>{/if}
  </figcaption>
</figure>

<style>
  .cap-media {
    margin: 0;
  }
  .cap-media-thumb {
    position: relative;
    display: block;
    aspect-ratio: 16 / 9;
    border-radius: 8px;
    overflow: hidden;
    background: color-mix(in srgb, currentColor 8%, transparent);
  }
  .cap-media-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .cap-media-fallback {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 1rem;
    text-align: center;
    font-weight: 600;
    font-size: 0.95rem;
  }
  .cap-media-play {
    position: absolute;
    top: 50%;
    left: 50%;
    translate: -50% -50%;
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 1.1rem;
    transition:
      background var(--duration-normal) var(--ease-standard),
      scale var(--duration-normal) var(--ease-standard);
  }
  .cap-media-thumb:hover .cap-media-play,
  .cap-media-thumb:focus-visible .cap-media-play {
    background: var(--accent, #ed1c24);
    scale: 1.06;
  }
  .cap-media figcaption {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    margin-top: 0.5rem;
    font-size: 0.85rem;
  }
  .cap-media-note {
    opacity: 0.7;
  }
  @media (prefers-reduced-motion: reduce) {
    .cap-media-play {
      transition: none;
    }
  }
</style>
