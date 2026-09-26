<script lang="ts">
  import { onMount } from "svelte";
  import { dev } from "$app/environment";
  import Seo from "$lib/shared/components/Seo.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import ShapeMatrixMandalaArt from "$lib/shared/shape-matrix/components/ShapeMatrixMandalaArt.svelte";
  import {
    flowerKey,
    ratioLabel,
    type Flower,
    type RotatingFlower,
  } from "$lib/shared/shape-matrix/domain/flower-signature";
  import {
    CLUB_ARTWORK_PAINTER,
    headerArtworkSrc,
  } from "$lib/shared/shape-matrix/services/shape-matrix-artwork";
  import {
    loadShapeMatrix,
    type ShapeMatrixData,
  } from "$lib/shared/shape-matrix/services/shape-matrix-flowers";
  import { FLOWER_NAMES } from "./_data/flower-names";
  import "$lib/shared/landing/styles/public-editorial.css";

  const TITLE = "Poi Flowers: Antispin, Inspin, Cat-Eye, Triquetra";
  const DESCRIPTION =
    "The cat-eye, triquetra, antispin flower, and inspin flower, each drawn from its spin ratio with the number of petals that ratio makes.";
  const URL = "https://tkaflowarts.com/flowers";

  function styleWord(flower: RotatingFlower): string {
    return flower.style === "pro" ? "Prospin" : "Antispin";
  }

  /** Ratio, style, and petals: the three facts the drawing is built from. */
  function facts(flower: RotatingFlower): string {
    return `${ratioLabel(flower.turns)} ${styleWord(flower).toLowerCase()}, ${flower.petals} petals`;
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "DefinedTermSet",
        "@id": `${URL}#terms`,
        name: "Poi and staff flower names",
        description: DESCRIPTION,
        url: URL,
        inLanguage: "en-US",
        hasDefinedTerm: FLOWER_NAMES.map((entry) => ({
          "@type": "DefinedTerm",
          name: entry.name,
          description: [entry.definition, `${facts(entry.flower)}.`]
            .filter(Boolean)
            .join(" "),
          url: `${URL}#${entry.id}`,
          inDefinedTermSet: `${URL}#terms`,
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: "https://tkaflowarts.com/",
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Flower names",
            item: URL,
          },
        ],
      },
    ],
  };

  let data = $state<ShapeMatrixData | null>(null);
  let loadFailed = $state(false);

  /** One end of the prop in blue hand ink, the Spin Ratios guide's painter. */
  function paintFlower(flower: Flower) {
    return (sizePx: number) =>
      data
        ? headerArtworkSrc(data, flower, "left", sizePx, CLUB_ARTWORK_PAINTER)
        : "";
  }

  onMount(async () => {
    try {
      data = await loadShapeMatrix();
    } catch {
      loadFailed = true;
    }
  });
</script>

<Seo title={TITLE} description={DESCRIPTION} canonical={URL}>
  {@html `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}<\/script>`}
</Seo>

<div class="editorial flowers-page">
  <header class="editorial-header">
    <h1 class="page-title">Flower names</h1>
    <p class="page-subtitle">
      Named flower patterns, each drawn from the spin ratio that makes it.
    </p>
  </header>

  {#if loadFailed}
    <p class="load-failed" role="status">The drawings could not load.</p>
  {/if}

  <div class="flowers">
    <ul class="flower-grid">
      {#each FLOWER_NAMES as entry (entry.id)}
        <li class="flower" id={entry.id}>
          <span class="still">
            <ShapeMatrixMandalaArt
              paint={paintFlower(entry.flower)}
              artKey={flowerKey(entry.flower)}
              alt={`${entry.name}: ${facts(entry.flower)}`}
            />
          </span>
          <div class="flower-text">
            <h2>{entry.name}</h2>
            <p class="facts">{facts(entry.flower)}</p>
            {#if entry.definition}
              <p class="definition">{entry.definition}</p>
            {:else if dev}
              <p class="definition pending">Definition to come</p>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  </div>

  <div class="guide-link">
    <PanelButton href="/guide/ratios"
      >How a ratio sets the petals<i
        class="fa-solid fa-arrow-right"
        aria-hidden="true"
      ></i></PanelButton
    >
  </div>
</div>

<style>
  .flowers {
    container: flowers / inline-size;
  }

  .flower-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* Narrow: the drawing beside its name, so a phone shows several flowers
     per screen. Wider containers stack each card, drawing on top. */
  .flower {
    display: grid;
    grid-template-columns: 7.5rem minmax(0, 1fr);
    align-items: center;
    gap: 1rem;
    min-width: 0;
    padding: 1.25rem;
    background: oklch(0.16 0.018 270 / 0.5);
    border: 1px solid oklch(0.45 0.04 270 / 0.2);
    border-radius: 14px;
    scroll-margin-top: 96px;
  }

  /* Reserved square: the engine loads after the page, and the box never
     changes size, so nothing moves when the drawing arrives. */
  .still {
    display: block;
    inline-size: 100%;
    aspect-ratio: 1;
  }

  .flower-text {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  h2 {
    margin: 0;
    font-size: clamp(1.15rem, 1.05rem + 0.3vw, 1.375rem);
    font-weight: 660;
    letter-spacing: -0.01em;
    line-height: 1.25;
    color: oklch(0.96 0.01 270);
  }

  .facts {
    margin: 0;
    font-size: 0.9375rem;
    font-variant-numeric: tabular-nums;
    color: oklch(0.72 0.012 270);
  }

  .definition {
    margin: 0.4rem 0 0;
    font-size: 1rem;
    line-height: 1.6;
    color: oklch(0.86 0.012 270);
  }

  .definition.pending {
    padding: 0.6rem 0.75rem;
    border: 1px dashed oklch(0.6 0.04 270 / 0.5);
    border-radius: 8px;
    color: oklch(0.66 0.012 270);
    font-style: italic;
  }

  .load-failed {
    margin: 0 0 1rem;
    color: oklch(0.78 0.012 270);
  }

  .guide-link {
    margin-top: 1.5rem;
  }

  .guide-link i {
    font-size: 0.875rem;
  }

  @container flowers (min-width: 30rem) {
    .flower-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .flower {
      grid-template-columns: minmax(0, 1fr);
      align-content: start;
    }
  }

  @container flowers (min-width: 46rem) {
    .flower-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
</style>
