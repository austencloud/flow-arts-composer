<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import Seo from "$lib/shared/components/Seo.svelte";

  let { data } = $props();

  /**
   * SvelteKit reuses a page component across same-route parameter changes, and
   * the viewer resolves its sequence once, on mount. Navigating from one share
   * link to another — `goto` from the nearby-sync banner or an inbox
   * notification, or the back button across two `/sequence` entries — left the
   * previously resolved sequence on screen under the new URL. Keying the child
   * on the route id makes that a real remount, which is also what re-runs the
   * viewer's registration and scan-attribution bootstrap.
   *
   * The key sits inside the `browser` guard and inside the `await`, so SSR
   * still renders the head shell alone and the module is imported once.
   */
  const routeId = $derived(page.params.id);

  const seo = $derived(data.seo);
  const sequenceJsonLd = $derived(
    seo.jsonLd ? JSON.stringify(seo.jsonLd).replace(/</g, "\\u003c") : null
  );
  // oEmbed discovery: lets a site that only knows how to paste a link (Slack,
  // WordPress, Notion, ...) auto-embed the player by fetching this endpoint,
  // instead of requiring the hand-copied <iframe> snippet from Share > Embed.
  const oembedUrl = $derived(
    `https://tkaflowarts.com/oembed?format=json&url=${encodeURIComponent(seo.canonical)}`
  );
</script>

<Seo
  title={seo.title}
  description={seo.description}
  canonical={seo.canonical}
  ogImage={seo.ogImage}
  ogImageAlt={seo.ogImageAlt}
  noindex={!seo.indexable}
>
  <link
    rel="alternate"
    type="application/json+oembed"
    href={oembedUrl}
    title={seo.title}
  />
  {#if sequenceJsonLd}
    {@html `<script type="application/ld+json">${sequenceJsonLd}</script>`}
  {/if}
</Seo>

{#if browser}
  {#await import("./SequenceViewerPage.svelte") then { default: SequenceViewerPage }}
    {#key routeId}
      <SequenceViewerPage {data} />
    {/key}
  {/await}
{/if}

{#if seo.indexable}
  <!--
    Server-rendered, crawlable detail block for a curated deck card. The
    interactive viewer above is client-only (`{#if browser}`), so without
    this a curated page's HTML response carried no visible word, letters,
    deck, creator, or step count — only the <head> tags declared it
    indexable. Firestore data only, no written copy, per the no-ghostwritten-
    copy house rule.
  -->
  <section class="sequence-card-details panel-glass text-primary">
    <h1>{seo.heading}</h1>
    {#if data.meta.thumbnailUrl}
      <img
        class="sequence-card-details__image"
        src={data.meta.thumbnailUrl}
        alt={seo.ogImageAlt}
        loading="lazy"
      />
    {/if}
    <dl class="sequence-card-details__facts">
      {#if data.meta.word}
        <div>
          <dt class="text-secondary">Word</dt>
          <dd>{data.meta.word}</dd>
        </div>
      {/if}
      {#if data.meta.deckName}
        <div>
          <dt class="text-secondary">Deck</dt>
          <dd>{data.meta.deckName}</dd>
        </div>
      {/if}
      {#if data.meta.creator}
        <div>
          <dt class="text-secondary">Creator</dt>
          <dd>{data.meta.creator}</dd>
        </div>
      {/if}
      {#if data.meta.stepCount}
        <div>
          <dt class="text-secondary">Steps</dt>
          <dd>{data.meta.stepCount}</dd>
        </div>
      {/if}
    </dl>
    {#if data.meta.letters && data.meta.letters.length > 0}
      <p class="sequence-card-details__letters text-secondary">
        Letters: {data.meta.letters.join(" ")}
      </p>
    {/if}
  </section>
{/if}

<style>
  .sequence-card-details {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin: 1.5rem 1.5rem 0;
    padding: 1.25rem 1.5rem;
  }

  .sequence-card-details h1 {
    margin: 0;
    font-size: 1.25rem;
  }

  .sequence-card-details__image {
    width: 100%;
    height: auto;
    border-radius: 8px;
  }

  .sequence-card-details__facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.5rem;
    margin: 0;
  }

  .sequence-card-details__facts dt {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin: 0;
  }

  .sequence-card-details__facts dd {
    margin: 0;
    font-size: 1rem;
  }

  .sequence-card-details__letters {
    margin: 0;
  }
</style>

