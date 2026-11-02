<script lang="ts">
  import { tick, untrack } from "svelte";
  import { browser } from "$app/env";
  import { afterNavigate, replaceState } from "$app/navigation";
  import { page } from "$app/state";
  import Seo from "#lib/shared/components/Seo.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import TimingDirectionIntro from "#lib/features/learn/components/interactive/motions/TimingDirectionIntro.svelte";
  import { isConceptExperienceAvailable } from "#lib/features/learn/domain/concept-experience-registry.js";
  import TimingDirectionModeExplorer from "./_components/TimingDirectionModeExplorer.svelte";
  import { getTimingDirectionState } from "./_state/timing-direction-state.svelte";
  import {
    getTimingDirectionArticle,
    getTimingDirectionArticleByPair,
    type DirectionValue,
    type TimingValue,
    TIMING_DIRECTION_ARTICLES,
    TIMING_DIRECTION_DISCUSSIONS,
    TIMING_DIRECTION_READING,
    TIMING_DIRECTION_SEQUENCES_ID,
    timingDirectionModeHref,
  } from "./_data/timing-direction-articles";

  const TITLE = "Timing and Direction in Flow Arts: All 6 Modes";
  const DESCRIPTION =
    "Together, split, and quarter timing crossed with same or opposite direction. See all six flow-arts modes with animations, definitions, history, and TKA examples.";
  const CANONICAL = "https://tkaflowarts.com/timing-and-direction";

  const sources = TIMING_DIRECTION_DISCUSSIONS;
  // The discussions already have cards above the reading list.
  const reading = TIMING_DIRECTION_READING.filter(
    (source) => !sources.some((discussion) => discussion.href === source.url)
  );

  // This is the one timing-and-direction page (Austen, 2026-10-31). The
  // basics, the mode grid and the player below it all show one mode, and the
  // address carries it (?mode=) so a link can open any of the six. The query
  // is read after each navigation: the page is prerendered, and a link that
  // changes only ?mode keeps this page mounted.
  const playback = getTimingDirectionState();
  const selectedSlug = $derived(playback.selected.article.slug);
  let addressReady = $state(false);
  let openedOn = "";
  afterNavigate(({ to }) => {
    if (!to) return;
    const requested = to.url.searchParams.get("mode");
    if (
      requested &&
      getTimingDirectionArticle(requested) &&
      requested !== playback.selected.article.slug
    ) {
      playback.select(requested);
    }
    openedOn = playback.selected.article.slug;
    addressReady = true;
    if (to.url.hash === `#${TIMING_DIRECTION_SEQUENCES_ID}`) {
      // The basics can settle taller after hydration; land on the
      // sequences again once they have.
      void tick().then(() =>
        document
          .getElementById(TIMING_DIRECTION_SEQUENCES_ID)
          ?.scrollIntoView({ block: "start", behavior: "instant" })
      );
    }
  });

  // The basics name timing and direction in lower case.
  const basicsTiming = $derived(
    playback.selected.article.timing.toLowerCase() as
      | "together"
      | "split"
      | "quarter"
  );
  const basicsDirection = $derived(
    playback.selected.article.direction.toLowerCase() as "same" | "opposite"
  );
  function selectFromBasics(timing: string, direction: string): void {
    const article = getTimingDirectionArticleByPair(
      (timing[0]!.toUpperCase() + timing.slice(1)) as TimingValue,
      (direction[0]!.toUpperCase() + direction.slice(1)) as DirectionValue
    );
    playback.select(article.slug);
  }
  $effect(() => {
    if (!addressReady) return;
    const slug = selectedSlug;
    untrack(() => {
      const url = new URL(page.url);
      if (url.searchParams.get("mode") === slug) return;
      // A plain visit keeps its plain address until a mode is chosen.
      if (!url.searchParams.has("mode") && slug === openedOn) return;
      url.searchParams.set("mode", slug);
      replaceState(url, page.state);
    });
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: "Timing and Direction in Flow Arts",
        headline: TITLE,
        description: DESCRIPTION,
        url: CANONICAL,
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
            url: `https://tkaflowarts.com${timingDirectionModeHref(article.slug)}`,
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
            item: CANONICAL,
          },
        ],
      },
    ],
  };
</script>

<Seo title={TITLE} description={DESCRIPTION} canonical={CANONICAL}>
  {@html `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}<\/script>`}
</Seo>

<div class="timing-page">
  <header class="page-header">
    <h1>Timing and Direction</h1>
    <p class="page-subtitle">
      These relationships apply to hands, props, and prop ends.
    </p>
  </header>

  <section
    id="timing-basics"
    class="basics"
    aria-label="Timing and direction basics"
  >
    <!-- The animation engine is stubbed out of the production SSR build, so
         the basics mount client-only. -->
    {#if browser}
      <TimingDirectionIntro
        selectedTiming={basicsTiming}
        selectedDirection={basicsDirection}
        onselect={selectFromBasics}
      />
    {/if}
    <!-- The lesson link follows the published registry, so it disappears
         while the lesson is withdrawn instead of leading to a 404. -->
    {#if isConceptExperienceAvailable("timing-and-direction")}
      <div class="lesson-link">
        <PanelButton href="/learn/concepts/timing-and-direction">
          <i class="fa-solid fa-graduation-cap" aria-hidden="true"></i>
          Open full lesson
        </PanelButton>
      </div>
    {/if}
  </section>
</div>

<TimingDirectionModeExplorer
  slug={selectedSlug}
  onSelectMode={(slug) => playback.select(slug)}
/>

<div class="timing-page timing-page--end">
  <section class="history-sources" aria-labelledby="history-title">
    <h2 id="history-title">History & sources</h2>
    <p class="history-intro">
      Timing and direction come from the geometry of two hands sharing a circle.
      Nobody invented them, and spinners used them long before they had names.
      Noel Yee's Vulcan Tech Gospel standardized the names used here. It sorts
      two-hand patterns by timing, together or split, and by direction, same or
      opposite. Quarter time sits between together and split, with the hands a
      quarter cycle apart.
    </p>
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
    <h3 id="reading-title">Further reading</h3>
    <ul class="reading-list" aria-labelledby="reading-title">
      {#each reading as source (source.url)}
        <li><LinkChip href={source.url} wrap>{source.label}</LinkChip></li>
      {/each}
    </ul>
    <nav aria-label="More about timing and direction">
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

  /* Two rows, the basics then the lesson link. The basics fill their own
     row (their root is height: 100%), so the link stays under them. */
  .basics {
    container-type: inline-size;
    display: grid;
    grid-template-rows: auto auto;
    width: min(100%, 96rem);
    margin-inline: auto;
  }

  .lesson-link {
    display: flex;
    justify-content: center;
    margin-top: 1rem;
  }

  .history-sources {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--theme-stroke);
    text-align: center;
  }

  .timing-page--end {
    padding-top: 0;
  }

  .history-sources h2 {
    margin: 0 0 0.5rem;
    color: var(--theme-text);
    font-size: 1.25rem;
  }

  .history-intro {
    max-width: 44rem;
    margin: 0 auto 0.75rem;
    color: var(--theme-text-dim);
    font-size: 1rem;
    line-height: 1.5;
  }

  .history-sources h3 {
    margin: 1.5rem 0 0.75rem;
    color: var(--theme-text-dim);
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .reading-list {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
    margin: 0 0 1.5rem;
    padding: 0;
    list-style: none;
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
    .timing-page {
      max-width: 100%;
      padding: 76px 1rem 2rem;
    }

    .timing-page--end {
      padding-top: 0;
    }

    .page-header {
      margin: 0 0 1rem;
    }

    .page-subtitle {
      font-size: 0.875rem;
    }
  }
</style>
