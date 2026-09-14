<script lang="ts">
  // Nav + cosmic background come from +layout.svelte. The product is loaded in
  // +page.ts so the detail renders data-ready and the view-transition morph lands
  // cleanly (no loading-state flash mid-transition).
  import ProductDetailPage from "$lib/features/store/ProductDetailPage.svelte";

  let { data } = $props();

  const p = $derived(data.product);
  const title = $derived(p?.name ? `${p.name} | Flow Arts Composer Shop` : "Shop | Flow Arts Composer");
  const description = $derived(
    p?.description
      ? String(p.description).slice(0, 160)
      : "Flow arts choreography card decks and learning materials from The Kinetic Alphabet."
  );
  const canonical = $derived(`https://tkaflowarts.com/shop/${data.productId}`);
  // Product model (src/lib/features/store/domain/models/product.ts): price is
  // in cents, image comes from coverImageUrl (fallback previewImageUrls[0]).
  const image = $derived(p?.coverImageUrl ?? p?.previewImageUrls?.[0] ?? null);
  const priceUsd = $derived(typeof p?.price === "number" ? (p.price / 100).toFixed(2) : null);
  const isNoindex = $derived(p != null && p.status !== "active");
  const jsonLd = $derived(
    p
      ? JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Product",
          name: p.name,
          description,
          ...(image ? { image: [image] } : {}),
          url: canonical,
          brand: { "@type": "Brand", name: "Flow Arts Composer" },
          ...(priceUsd != null
            ? {
                offers: {
                  "@type": "Offer",
                  price: priceUsd,
                  priceCurrency: "USD",
                  availability:
                    p.status === "active"
                      ? "https://schema.org/InStock"
                      : p.status === "sold-out"
                        ? "https://schema.org/SoldOut"
                        : "https://schema.org/PreOrder",
                  itemCondition: "https://schema.org/NewCondition",
                  url: canonical,
                },
              }
            : {}),
        }).replace(/</g, "\\u003c")
      : null
  );
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonical} />
  {#if isNoindex}
    <meta name="robots" content="noindex" />
  {/if}
  <meta property="og:type" content="product" />
  <meta property="og:site_name" content="Flow Arts Composer" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={canonical} />
  {#if image}
    <meta property="og:image" content={image} />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content={image} />
  {:else}
    <meta name="twitter:card" content="summary" />
  {/if}
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  {#if jsonLd}
    {@html `<script type="application/ld+json">${jsonLd}</script>`}
  {/if}
</svelte:head>

<ProductDetailPage productId={data.productId} initialProduct={data.product} />
