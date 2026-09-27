<script lang="ts">
  import { onMount } from "svelte";
  import { dev } from "$app/environment";
  import Seo from "$lib/shared/components/Seo.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import ShapeMatrixMandalaArt from "$lib/shared/shape-matrix/components/ShapeMatrixMandalaArt.svelte";
  import { calculate as calculateMandalaGeometry } from "$lib/shared/mandala/services/mandala-geometry-calculator";
  import { getMandalaPathOptions } from "$lib/shared/mandala/services/mandala-path-options";
  import {
    flowerKey,
    ratioLabel,
  } from "$lib/shared/shape-matrix/domain/flower-signature";
  import {
    CLUB_ARTWORK_PAINTER,
    headerArtworkSrc,
  } from "$lib/shared/shape-matrix/services/shape-matrix-artwork";
  import {
    loadShapeMatrix,
    type ShapeMatrixData,
  } from "$lib/shared/shape-matrix/services/shape-matrix-flowers";
  import {
    NAMED_SHAPES,
    SHAPE_GROUPS,
    type NamedShape,
    type ShapeDrawing,
  } from "./_data/named-shapes";
  import "$lib/shared/landing/styles/public-editorial.css";

  const TITLE = "Poi Flowers and Linear Extension: Cat-Eye, Triquetra";
  const DESCRIPTION =
    "The cat-eye, triquetra, antispin flower, inspin flower, and linear extension, each drawn from the motion that makes it.";
  const URL = "https://tkaflowarts.com/flowers";

  /** What the drawing is built from: ratio, style, and petals for a flower. */
  function facts(drawing: ShapeDrawing): string {
    if (drawing.kind === "sequence") return drawing.facts;
    const { flower } = drawing;
    const style = flower.style === "pro" ? "prospin" : "antispin";
    return `${ratioLabel(flower.turns)} ${style}, ${flower.petals} petals`;
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "DefinedTermSet",
        "@id": `${URL}#terms`,
        name: "Poi and staff shape names",
        description: DESCRIPTION,
        url: URL,
        inLanguage: "en-US",
        hasDefinedTerm: NAMED_SHAPES.map((shape) => ({
          "@type": "DefinedTerm",
          name: shape.name,
          description: [`${facts(shape.drawing)}.`, shape.definition]
            .filter(Boolean)
            .join(" "),
          url: `${URL}#${shape.id}`,
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
            name: "Shape names",
            item: URL,
          },
        ],
      },
    ],
  };

  let data = $state<ShapeMatrixData | null>(null);
  let loadFailed = $state(false);

  /**
   * Blue hand ink at the Spin Ratios guide's scale, so every drawing on the
   * page shares one size. A flower is one end of the prop; a sequence traces
   * both ends, since a staff holds one end in pro and the other in anti.
   */
  function paint(drawing: ShapeDrawing) {
    return (sizePx: number) => {
      if (!data) return "";
      if (drawing.kind === "flower") {
        return headerArtworkSrc(
          data,
          drawing.flower,
          "left",
          sizePx,
          CLUB_ARTWORK_PAINTER
        );
      }
      const paths = calculateMandalaGeometry(
        drawing.steps,
        undefined,
        undefined,
        getMandalaPathOptions("arc", 2),
        data.tips.left
      );
      return CLUB_ARTWORK_PAINTER.header(
        paths,
        "left",
        Math.round(sizePx),
        data.clubTipDx
      );
    };
  }

  function artKey(shape: NamedShape): string {
    const { drawing } = shape;
    return drawing.kind === "flower" ? flowerKey(drawing.flower) : shape.id;
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

<div class="editorial shapes-page">
  <header class="editorial-header">
    <h1 class="page-title">Shape names</h1>
    <p class="page-subtitle">
      Named shapes, each drawn from the motion that makes it.
    </p>
  </header>

  {#if loadFailed}
    <p class="load-failed" role="status">The drawings could not load.</p>
  {/if}

  {#each SHAPE_GROUPS as group (group.id)}
    <section class="shapes" aria-labelledby={`${group.id}-heading`}>
      <h2 class="section-title" id={`${group.id}-heading`}>{group.title}</h2>
      <ul class="shape-grid">
        {#each group.shapes as shape (shape.id)}
          <li class="shape" id={shape.id}>
            <span class="still">
              <ShapeMatrixMandalaArt
                paint={paint(shape.drawing)}
                artKey={artKey(shape)}
                alt={`${shape.name}: ${facts(shape.drawing)}`}
              />
            </span>
            <div class="shape-text">
              <h3>{shape.name}</h3>
              <p class="facts">{facts(shape.drawing)}</p>
              {#if shape.definition}
                <p class="definition">{shape.definition}</p>
              {:else if dev}
                <p class="definition pending">Definition to come</p>
              {/if}
              {#if shape.link}
                <div class="shape-link">
                  <PanelButton
                    href={shape.link.href}
                    ariaLabel={`${shape.link.label}: ${shape.name}`}
                    >{shape.link.label}<i
                      class="fa-solid fa-arrow-right"
                      aria-hidden="true"
                    ></i></PanelButton
                  >
                </div>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/each}

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
  .shapes {
    container: shapes / inline-size;
  }

  .shapes + .shapes {
    margin-top: 2rem;
  }

  .shape-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* Narrow: the drawing beside its name, so a phone shows several shapes
     per screen. Wider containers stack each card, drawing on top. */
  .shape {
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

  .shape-text {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
  }

  h3 {
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

  .shape-link {
    margin-top: 0.6rem;
  }

  .shape-link :global(.panel-btn) {
    white-space: normal;
    text-align: left;
  }

  .load-failed {
    margin: 0 0 1rem;
    color: oklch(0.78 0.012 270);
  }

  .guide-link {
    margin-top: 2rem;
  }

  .shape-link i,
  .guide-link i {
    font-size: 0.875rem;
  }

  @container shapes (min-width: 30rem) {
    .shape-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .shape {
      grid-template-columns: minmax(0, 1fr);
      align-content: start;
    }
  }

  @container shapes (min-width: 46rem) {
    .shape-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
</style>
