<script lang="ts">
  import Seo from "$lib/shared/components/Seo.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { TND_BY_FAMILY } from "$lib/features/choreo-card/domain/tnd-element";
  import { MODE_FAMILY_ID } from "$lib/shared/shape-matrix/services/shape-matrix-realizations";
  import { TRICK_GROUPS, TRICK_NAMES } from "./_data/trick-names";
  import "$lib/shared/landing/styles/public-editorial.css";

  const TITLE = "Poi and Staff Trick Names: Weaves, Butterflies, Antispin";
  const DESCRIPTION =
    "Common poi and staff trick names explained: three-beat weave, butterfly, windmill, isolation, extension, antispin, flowers, and CAPs.";
  const URL = "https://tkaflowarts.com/tricks";

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "DefinedTermSet",
        "@id": `${URL}#terms`,
        name: "Poi and staff trick names",
        description: DESCRIPTION,
        url: URL,
        inLanguage: "en-US",
        hasDefinedTerm: TRICK_NAMES.map((trick) => ({
          "@type": "DefinedTerm",
          name: trick.name,
          description: [trick.usage, trick.detail].filter(Boolean).join(" "),
          url: `${URL}#${trick.id}`,
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
            name: "Trick names",
            item: URL,
          },
        ],
      },
    ],
  };

  function element(mode: keyof typeof MODE_FAMILY_ID | undefined) {
    return mode ? TND_BY_FAMILY[MODE_FAMILY_ID[mode]] : undefined;
  }
</script>

<Seo title={TITLE} description={DESCRIPTION} canonical={URL}>
  {@html `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}<\/script>`}
</Seo>

<div class="editorial tricks-page">
  <header class="editorial-header">
    <h1 class="page-title">Trick names</h1>
    <p class="page-subtitle">
      Common poi and staff trick names, and where each one is explained.
    </p>
  </header>

  <div class="groups">
    {#each TRICK_GROUPS as group (group.id)}
      <section class="editorial-section" aria-labelledby={group.id}>
        <h2 class="section-title" id={group.id}>{group.title}</h2>
        <ul class="trick-grid" class:six={group.tricks.length === 6}>
          {#each group.tricks as trick (trick.id)}
            {@const mode = element(trick.mode)}
            <li
              class="trick"
              class:timed={mode !== undefined}
              id={trick.id}
              style:--accent={mode?.accentColor}
            >
              <div class="trick-head">
                {#if mode}
                  <img src={mode.iconPath} alt="" width="40" height="40" />
                {/if}
                <div class="trick-name">
                  {#if trick.modeName}
                    <span class="trick-mode">{trick.modeName}</span>
                  {/if}
                  <h3>{trick.name}</h3>
                </div>
              </div>
              <p class="usage">{trick.usage}</p>
              {#if trick.detail}
                <p class="detail">{trick.detail}</p>
              {/if}
              <div class="trick-link">
                <!-- Several tricks share a destination, so the accessible
                     name adds the trick to keep a link list unambiguous. -->
                <PanelButton
                  href={trick.link.href}
                  accentColor={mode?.accentColor}
                  ariaLabel={`${trick.link.label}: ${trick.name}`}
                  >{trick.link.label}<i
                    class="fa-solid fa-arrow-right"
                    aria-hidden="true"
                  ></i></PanelButton
                >
              </div>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>
</div>

<style>
  .groups {
    container: tricks / inline-size;
  }

  .tricks-page .editorial-section:last-child {
    margin-bottom: 0;
  }

  .trick-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .trick {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
    padding: 1.25rem;
    background: oklch(0.16 0.018 270 / 0.5);
    border: 1px solid oklch(0.45 0.04 270 / 0.2);
    border-radius: 14px;
    scroll-margin-top: 96px;
  }

  .trick.timed {
    background: color-mix(
      in oklch,
      var(--accent) 9%,
      oklch(0.16 0.018 270 / 0.55)
    );
    border-color: color-mix(in oklch, var(--accent) 38%, transparent);
  }

  .trick-head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .trick-head img {
    flex-shrink: 0;
    object-fit: contain;
  }

  .trick-name {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .trick-mode {
    font-size: 0.8125rem;
    font-weight: 640;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: color-mix(in oklch, var(--accent) 62%, oklch(0.78 0.01 270));
  }

  h3 {
    margin: 0;
    font-size: clamp(1.15rem, 1.05rem + 0.3vw, 1.375rem);
    font-weight: 660;
    letter-spacing: -0.01em;
    line-height: 1.25;
    color: oklch(0.96 0.01 270);
  }

  .usage,
  .detail {
    margin: 0;
    font-size: 1rem;
    line-height: 1.6;
  }

  .usage {
    color: oklch(0.86 0.012 270);
  }

  .detail {
    color: oklch(0.7 0.012 270);
  }

  .trick-link {
    margin-top: auto;
    padding-top: 0.25rem;
  }

  .trick-link :global(.panel-btn) {
    white-space: normal;
    text-align: left;
  }

  .trick-link i {
    font-size: 0.875rem;
  }

  @container tricks (min-width: 34rem) {
    .trick-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container tricks (min-width: 56rem) {
    .trick-grid.six {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @container tricks (min-width: 90rem) {
    .trick-grid:not(.six) {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @container tricks (min-width: 128rem) {
    .trick-grid.six {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
  }
</style>
