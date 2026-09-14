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
</script>

<Seo
  title={seo.title}
  description={seo.description}
  canonical={seo.canonical}
  ogImage={seo.ogImage}
  ogImageAlt={seo.ogImageAlt}
  noindex={!seo.indexable}
>
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
