<script lang="ts">
  // /shop — the catalog front door, open to everyone.
  //
  // This page used to be a gate: an admin saw the shop, everyone else saw
  // "Coming soon", decided by a Firebase custom claim and a cookie that seeded
  // SSR. The gate is gone. The shop can't take money yet, and that's said on
  // the page instead of hidden behind a locked door.
  //
  // Chrome (nav + cosmic background) comes from +layout.svelte.
  import ShopFrontDoor from "$lib/features/store/components/front-door/ShopFrontDoor.svelte";
  import { deriveCatalogEntries } from "$lib/features/store/domain/catalog-listings";
  import { SALES_LIVE } from "$lib/features/store/domain/purchase-state";
  import type { Product } from "$lib/features/store/domain/models/product";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  // The server load returns raw Firestore fields; they ARE the Product shape,
  // minus the cover cards it deliberately leaves behind (see +page.server.ts).
  const products = $derived((data.products ?? []) as unknown as Product[]);
  const entries = $derived(deriveCatalogEntries(products));

  const SITE = "https://tkaflowarts.com";
  const DESCRIPTION =
    "Choreo card decks, the Timing & Direction trilogy, and the printed guide from The Kinetic Alphabet. Every card is a sequence you can scan and play.";

  // Structured data for the catalog. Offers are attached only once the shop can
  // actually take an order — advertising a price we can't charge would be the
  // same lie the status chips exist to prevent.
  //
  // The serialized JSON is injected with {@html}, so a "<" anywhere in product
  // copy would close the script tag early. "<" is the same character to a
  // JSON parser and inert to an HTML tokenizer.
  const jsonLd = $derived(
    JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Flow Arts Composer Shop",
      description: DESCRIPTION,
      url: `${SITE}/shop`,
      numberOfItems: entries.length,
      itemListElement: entries.map((entry, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "Product",
          name: entry.name,
          description: entry.blurb,
          url: `${SITE}${entry.href}`,
          ...(SALES_LIVE
            ? {
                offers: {
                  "@type": "Offer",
                  price: (entry.priceCents / 100).toFixed(2),
                  priceCurrency: "USD",
                  availability: entry.offer.preorder
                    ? "https://schema.org/PreOrder"
                    : "https://schema.org/InStock",
                  url: `${SITE}${entry.href}`,
                },
              }
            : {}),
        },
      })),
    }).replace(/</g, "\\u003c")
  );
</script>

<svelte:head>
  <title>Shop | Flow Arts Composer</title>
  <meta name="description" content={DESCRIPTION} />
  <link rel="canonical" href="https://tkaflowarts.com/shop" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Flow Arts Composer" />
  <meta property="og:title" content="Shop | Flow Arts Composer" />
  <meta property="og:description" content={DESCRIPTION} />
  <meta property="og:url" content="https://tkaflowarts.com/shop" />
  <meta property="og:image" content="https://tkaflowarts.com/branding/og-image.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="The Kinetic Alphabet" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="Shop | Flow Arts Composer" />
  <meta name="twitter:description" content={DESCRIPTION} />
  <meta name="twitter:image" content="https://tkaflowarts.com/branding/og-image.png" />
  {@html `<script type="application/ld+json">${jsonLd}</script>`}
</svelte:head>

<ShopFrontDoor {products} />
