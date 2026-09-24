<script lang="ts">
  // Nav + cosmic background come from the (public)/shop +layout.svelte.
  // The configurator renders on the server too, seeded with the catalog
  // snapshot (+page.server.ts): a crawler reading the HTML gets the real
  // product page, not a loading line. See +page.ts.
  import LoopDeckConfiguratorPage from "$lib/features/store/LoopDeckConfiguratorPage.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const DESCRIPTION =
    "54 flow sequences printed as playing cards. Pick a transformation flavor and build your LOOP deck.";
  const CANONICAL = "https://tkaflowarts.com/shop/loop-deck";

  // Product schema. The page is a configurator: standard packs from $35 (preorder),
  // bespoke Architect builds up to $55 (regular). lowPrice = lowest current price,
  // highPrice = highest post-cutoff price, spanning the preorder→regular swap — keep
  // in sync with the shop catalog (listings "loop-deck" / "loop-deck-architect")
  // and the preorder cutoff. Preorder until ship.
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    name: "LOOP Deck",
    description: DESCRIPTION,
    brand: { "@type": "Brand", name: "Flow Arts Composer" },
    url: CANONICAL,
    image: "https://tkaflowarts.com/branding/og-image.png",
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: "35",
      highPrice: "55",
      availability: "https://schema.org/PreOrder",
      itemCondition: "https://schema.org/NewCondition",
      url: CANONICAL,
    },
  }).replace(/</g, "\\u003c");
</script>

<svelte:head>
  <title>LOOP Deck | Flow Arts Composer</title>
  <meta name="description" content={DESCRIPTION} />
  <link rel="canonical" href={CANONICAL} />
  <meta property="og:type" content="product" />
  <meta property="og:site_name" content="Flow Arts Composer" />
  <meta property="og:title" content="LOOP Deck | Flow Arts Composer" />
  <meta property="og:description" content={DESCRIPTION} />
  <meta property="og:url" content={CANONICAL} />
  <meta property="og:image" content="https://tkaflowarts.com/branding/og-image.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="LOOP Deck | Flow Arts Composer" />
  <meta name="twitter:description" content={DESCRIPTION} />
  <meta name="twitter:image" content="https://tkaflowarts.com/branding/og-image.png" />
  {@html `<script type="application/ld+json">${jsonLd}</script>`}
</svelte:head>

<LoopDeckConfiguratorPage seedProducts={data.products} />
