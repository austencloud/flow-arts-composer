<script lang="ts">
  import Seo from "$lib/shared/components/Seo.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import TimingDirectionAtlas from "./_components/TimingDirectionAtlas.svelte";
  import TimingDirectionModeCard from "./_components/TimingDirectionModeCard.svelte";
  import { TIMING_DIRECTION_ARTICLES } from "./_data/timing-direction-articles";

  const TITLE = "Timing and Direction in Flow Arts: All 6 Modes";
  const DESCRIPTION =
    "Together, split, and quarter timing crossed with same or opposite direction. See all six flow-arts modes with animations, definitions, history, and TKA examples.";
  const URL = "https://tkaflowarts.com/timing-and-direction";

  const sources = [
    {
      date: "August 2002",
      title: "How do you define a weave?",
      preview:
        "Spinners compare split and non-split timing, same and opposite direction, and how those combinations show up in weaves and butterflies.",
      href: "https://www.homeofpoi.com/en/community/forums/topics/120838/How-do-you-define-a-weave",
    },
    {
      date: "November 2002",
      title: "Quarter-time butterflies",
      preview:
        "Jez names quarter-time butterflies in a discussion about concept moves and plane transitions. An early written use of quarter timing.",
      href: "https://www.homeofpoi.com/en/community/forums/topics/122222/Concept-moves-and-why-make-lists",
    },
    {
      date: "May 2009",
      title: "Prop transitioning",
      preview:
        "Noel Yee separates timing from direction and works through transitions between the four original combinations.",
      href: "https://www.homeofpoi.com/fr/community/forums/topics/887635/X-Post-Prop-Transitioning-Article",
    },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: "Timing and Direction in Flow Arts",
        headline: TITLE,
        description: DESCRIPTION,
        url: URL,
        inLanguage: "en-US",
        author: {
          "@type": "Person",
          name: "Austen Cloud",
          url: "https://tkaflowarts.com/about",
        },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: TIMING_DIRECTION_ARTICLES.length,
          itemListElement: TIMING_DIRECTION_ARTICLES.map((article, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: article.name,
            url: `${URL}/${article.slug}`,
          })),
        },
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
            name: "Timing and Direction",
            item: URL,
          },
        ],
      },
    ],
  };
</script>

<Seo title={TITLE} description={DESCRIPTION} canonical={URL}>
  {@html `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}<\/script>`}
</Seo>

<div class="timing-page">
  <header class="page-header">
    <h1>Timing and Direction</h1>
    <p class="page-subtitle">
      These relationships apply to hands, props, and prop ends.
    </p>
  </header>

  <TimingDirectionAtlas />

  <nav class="mode-guides" aria-labelledby="mode-guides-title">
    <h2 id="mode-guides-title">Mode guides</h2>
    <div class="guide-links">
      {#each TIMING_DIRECTION_ARTICLES as article (article.code)}
        <TimingDirectionModeCard {article} />
      {/each}
    </div>
  </nav>

  <section class="history-sources" aria-labelledby="history-title">
    <h2 id="history-title">History & sources</h2>
    <p class="history-intro">
      Read the community discussions behind the terminology.
    </p>
    <ul class="source-cards">
      {#each sources as source (source.href)}
        <li>
          <PanelButton href={source.href} fullWidth>
            <span class="source-content">
              <span class="source-meta">
                <span
                  ><i class="fa-regular fa-comments" aria-hidden="true"></i> Home
                  of Poi</span
                >
                <span>{source.date}</span>
              </span>
              <strong class="source-title">{source.title}</strong>
              <span class="source-preview">{source.preview}</span>
              <span class="source-action"
                >Read discussion <i
                  class="fa-solid fa-arrow-up-right-from-square"
                  aria-hidden="true"
                ></i></span
              >
            </span>
          </PanelButton>
        </li>
      {/each}
    </ul>
    <nav aria-label="More about timing and direction">
      <PanelButton href="/history"
        ><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>Explore
        the history</PanelButton
      >
      <PanelButton href="/history#archive-record-vtg"
        ><i class="fa-solid fa-box-archive" aria-hidden="true"></i>VTG history
        record</PanelButton
      >
      <PanelButton href="/learn/concepts"
        ><i class="fa-solid fa-graduation-cap" aria-hidden="true"
        ></i>Interactive lessons</PanelButton
      >
    </nav>
  </section>
</div>

<style>
  .timing-page {
    position: relative;
    margin: 0 auto;
    font-family: inherit;
    max-width: min(var(--shell-w), 80rem);
    padding: 88px 1.5rem 1.5rem;
  }

  .page-header {
    margin: 0.5rem 0 1.5rem;
    text-align: center;
  }

  h1 {
    margin: 0 0 0.6rem;
    color: var(--theme-text);
    font-size: clamp(1.875rem, 1.5rem + 1vw, 2.5rem);
    font-weight: 720;
    letter-spacing: -0.025em;
    line-height: 1.1;
  }

  .page-subtitle {
    margin: 0 auto;
    color: var(--theme-text-dim);
    font-size: 1rem;
    line-height: 1.5;
  }

  .history-sources {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--theme-stroke);
    text-align: center;
  }

  .history-sources h2,
  .mode-guides h2 {
    margin: 0 0 0.5rem;
    color: var(--theme-text);
    font-size: 1.25rem;
  }

  .history-intro {
    margin: 0 auto;
    color: var(--theme-text-dim);
    font-size: 1rem;
    line-height: 1.5;
  }

  .mode-guides {
    margin-top: 1.5rem;
    text-align: center;
  }

  .guide-links {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
  }

  .guide-links :global(.panel-btn) {
    min-width: 0;
    white-space: normal;
  }

  @media (min-width: 1100px) {
    .guide-links {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
  }

  .source-cards {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem;
    padding: 0;
    margin: 1rem 0;
    list-style: none;
  }

  .source-cards li {
    min-width: 0;
  }

  .source-meta {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.25rem 0.75rem;
    color: var(--theme-text-dim);
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
  }

  .source-cards :global(.panel-btn) {
    height: 100%;
    align-items: stretch;
    padding: 1rem;
    text-align: left;
    background: var(--theme-card-bg);
    border-radius: var(--radius-lg, 0.75rem);
    white-space: normal;
  }

  .source-content {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }

  .source-title {
    font-size: 1.125rem;
    line-height: 1.35;
    font-weight: 650;
  }

  .source-preview {
    color: var(--theme-text-dim);
    font-size: 1rem;
    line-height: 1.5;
    font-weight: 400;
  }

  .source-action {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-top: auto;
    padding-top: 0.5rem;
    font-size: 1rem;
  }

  .history-sources i {
    font-size: 0.875rem;
  }

  .history-sources nav {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
    font-size: 0.875rem;
  }

  @media (max-width: 760px) {
    .source-cards {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 600px) {
    .guide-links {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .timing-page {
      max-width: 100%;
      padding: 76px 1rem 2rem;
    }

    .page-header {
      margin: 0 0 1rem;
    }

    .page-subtitle {
      font-size: 0.875rem;
    }
  }
</style>
