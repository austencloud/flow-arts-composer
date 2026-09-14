<script lang="ts">
  // Nav + cosmic background come from the (public)/shop +layout.svelte.
  // The trilogy widget is browser-only (canvas + workers + firebase), so it
  // loads behind {#if browser}; the server renders the SEO head + a crawlable
  // shell only.
  import { browser } from "$app/environment";

  const DESCRIPTION =
    "The TKA teaching trilogy: three printed decks, every card color-coded by its timing and direction family.";
  const CANONICAL = "https://tkaflowarts.com/shop/tnd-trilogy";

  // Product schema. One listing over three volume SKUs, each $30 as of
  // 2026-07 (Firestore products tka-1/2/3, all price: 3000); keep the
  // AggregateOffer in sync with the "tnd-trilogy" catalog.
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Timing & Direction Trilogy",
    description: DESCRIPTION,
    brand: { "@type": "Brand", name: "Flow Arts Composer" },
    url: CANONICAL,
    image: "https://tkaflowarts.com/branding/og-image.png",
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: "30",
      highPrice: "30",
      offerCount: 3,
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      url: CANONICAL,
    },
  }).replace(/</g, "\\u003c");
</script>

<svelte:head>
  <title>Timing &amp; Direction Trilogy | Flow Arts Composer</title>
  <meta name="description" content={DESCRIPTION} />
  <link rel="canonical" href={CANONICAL} />
  <meta property="og:type" content="product" />
  <meta property="og:site_name" content="Flow Arts Composer" />
  <meta property="og:title" content="Timing & Direction Trilogy | Flow Arts Composer" />
  <meta property="og:description" content={DESCRIPTION} />
  <meta property="og:url" content={CANONICAL} />
  <meta property="og:image" content="https://tkaflowarts.com/branding/og-image.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Timing & Direction Trilogy | Flow Arts Composer" />
  <meta name="twitter:description" content={DESCRIPTION} />
  <meta name="twitter:image" content="https://tkaflowarts.com/branding/og-image.png" />
  {@html `<script type="application/ld+json">${jsonLd}</script>`}
</svelte:head>

{#if browser}
  {#await import("$lib/features/store/TnDTrilogyPage.svelte") then { default: TnDTrilogyPage }}
    <TnDTrilogyPage />
  {/await}
{:else}
  <div class="seo-shell">
    <h1>Timing &amp; Direction Trilogy</h1>
    <p>{DESCRIPTION}</p>
  </div>
{/if}

<style>
  .seo-shell {
    max-width: 760px;
    margin: 0 auto;
    padding: 120px 24px;
    text-align: center;
    color: #ece9f5;
  }
  .seo-shell h1 {
    font-size: clamp(2rem, 5vw, 3rem);
    margin: 0 0 16px;
  }
  .seo-shell p {
    font-size: 1.1rem;
    line-height: 1.6;
    color: rgba(236, 233, 245, 0.7);
  }
</style>
