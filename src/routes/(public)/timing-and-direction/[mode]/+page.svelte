<script lang="ts">
  import type { PageData } from "./$types";
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import { TIMING_DIRECTION_MODES } from "$lib/features/learn/components/interactive/foundations/pictograph-foundation-content";
  import Seo from "$lib/shared/components/Seo.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import TransportControls from "$lib/shared/animation-engine/components/controls/TransportControls.svelte";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { getTimingDirectionState } from "../_state/timing-direction-state.svelte";
  import TimingDirectionModeCard from "../_components/TimingDirectionModeCard.svelte";
  import {
    getTimingDirectionArticle,
    TIMING_DIRECTION_ARTICLES,
  } from "../_data/timing-direction-articles";
  import {
    loadTogetherOppositeExamples,
    type TogetherOppositeExample,
  } from "../_data/together-opposite-examples";

  let { data }: { data: PageData } = $props();

  const playback = getTimingDirectionState();

  const article = $derived(getTimingDirectionArticle(data.mode)!);
  const mode = $derived(
    TIMING_DIRECTION_MODES.find(
      (candidate) =>
        candidate.timing === article.timing &&
        candidate.direction === article.direction
    ) ?? TIMING_DIRECTION_MODES[0]!
  );
  const relatedArticles = $derived(
    TIMING_DIRECTION_ARTICLES.filter(
      (candidate) => candidate.code !== article.code
    )
  );
  const canonical = $derived(
    `https://tkaflowarts.com/timing-and-direction/${article.slug}`
  );
  const lessonHref = $derived(
    article.timing === "Quarter"
      ? "/learn/concepts/gamma-motion"
      : "/learn/concepts/dual-shifts-alpha-beta"
  );
  let togetherOppositeExamples = $state<TogetherOppositeExample[]>([]);
  let selectedTogetherOppositeExample = $state<string | null>(null);

  onMount(() => {
    let active = true;
    void loadTogetherOppositeExamples().then((examples) => {
      if (!active) return;
      togetherOppositeExamples = examples;
      const first = examples[0];
      if (article.code === "TO" && first) {
        selectedTogetherOppositeExample = first.id;
        playback.focusExample();
      }
    });
    return () => {
      active = false;
    };
  });

  $effect(() => {
    if (article.code !== "TO") {
      selectedTogetherOppositeExample = null;
    }
  });

  function selectTogetherOppositeExample(example: TogetherOppositeExample) {
    selectedTogetherOppositeExample = example.id;
    playback.focusExample();
  }
  const jsonLd = $derived({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${canonical}#article`,
        mainEntityOfPage: canonical,
        headline: article.name,
        name: article.name,
        description: article.metaDescription,
        url: canonical,
        inLanguage: "en-US",
        citation: article.sources.map((source) => ({
          "@type": "CreativeWork",
          name: source.label,
          url: source.url,
        })),
        author: {
          "@type": "Person",
          name: "Austen Cloud",
          url: "https://tkaflowarts.com/about",
        },
        isPartOf: {
          "@type": "CollectionPage",
          name: "Timing and Direction in Flow Arts",
          url: "https://tkaflowarts.com/timing-and-direction",
        },
        about: {
          "@type": "DefinedTerm",
          name: article.name,
          alternateName: article.aliases,
          description: article.definition,
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
            item: "https://tkaflowarts.com/timing-and-direction",
          },
          {
            "@type": "ListItem",
            position: 3,
            name: article.name,
            item: canonical,
          },
        ],
      },
    ],
  });
</script>

<Seo
  title={`${article.name}: Flow Arts Timing & Direction`}
  description={article.metaDescription}
  {canonical}
  ogType="article"
>
  {@html `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}<\/script>`}
</Seo>

<article class="mode-page" style:--mode-accent={mode.element.accentColor}>
  <nav class="page-nav" aria-label="Timing and direction">
    <PanelButton href="/timing-and-direction">
      <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
      All six modes
    </PanelButton>
  </nav>

  <div class="mode-overview">
    <div class="mode-copy">
      <header>
        <div class="mode-identity">
          <img src={mode.element.iconPath} alt="" width="44" height="44" />
          <span>{article.code} · {mode.element.element}</span>
        </div>
        <h1>
          {article.timing} time <span>{article.direction} direction</span>
        </h1>
        <p class="definition">{article.definition}</p>
      </header>
      <p>{article.watchFor}</p>
      {#if article.code === "TO"}
        <section class="example-picker" aria-labelledby="example-picker-title">
          <div>
            <h2 id="example-picker-title">Choose a matching pictograph</h2>
            <p>
              Each option is classified from its hand-path geometry. The player
              shows those hands; the pictograph keeps the selected prop rotation
              visible.
            </p>
          </div>
          <div class="example-options" aria-label="Together-Opposite examples">
            {#each togetherOppositeExamples as example (example.id)}
              <button
                type="button"
                class:selected={selectedTogetherOppositeExample === example.id}
                aria-pressed={selectedTogetherOppositeExample === example.id}
                on:click={() => selectTogetherOppositeExample(example)}
              >
                <span class="example-pictograph">
                  <PictographContainer
                    pictographData={example.pictograph}
                    gridMode={example.gridMode}
                    leftPropTypeOverride={PropType.HAND}
                    rightPropTypeOverride={PropType.HAND}
                    showGrid={true}
                    showTKA={true}
                    showElemental={true}
                    showPositions={true}
                    showReversals={false}
                    showNonRadialPoints={false}
                    showHandPoints={true}
                    disableTransitions
                  />
                </span>
                <span>{example.label}</span>
              </button>
            {/each}
          </div>
        </section>
      {/if}
      <PanelButton
        href="/learn/concepts/timing-and-direction"
        accentColor={mode.element.accentColor}
      >
        <i class="fa-solid fa-graduation-cap" aria-hidden="true"></i>
        Try timing and direction
      </PanelButton>
    </div>
    <div class="mode-notes">
      <section class="practice" aria-labelledby="practice-title">
        <h2 id="practice-title">In practice</h2>
        <p>{article.example}</p>
      </section>
      <section aria-labelledby="distinction-title">
        <h2 id="distinction-title">
          {article.timing === "Quarter"
            ? "Timing and placement"
            : "Timing and direction"}
        </h2>
        <p>{article.commonMistake}</p>
      </section>
      <section aria-labelledby="tka-title">
        <h2 id="tka-title">In TKA</h2>
        <p>{article.tkaConnection}</p>
        <PanelButton href={lessonHref} accentColor={mode.element.accentColor}>
          <i class="fa-solid fa-graduation-cap" aria-hidden="true"></i>
          Explore this in TKA
        </PanelButton>
      </section>
    </div>

    <figure class="demonstration">
      <div class="demo-toolbar">
        <span>Hand paths</span>
        {#if browser}
          <TransportControls
            isPlaying={playback.playing}
            onPlaybackToggle={() => (playback.playing = !playback.playing)}
          />
        {/if}
      </div>
      <div class="demo-canvas" use:playback.registerTarget></div>
      <figcaption>
        Drag the bar to follow the hands through the cycle.
      </figcaption>
    </figure>
  </div>

  <section class="history" aria-labelledby="learning-title">
    <h2 id="learning-title">Learn from other spinners</h2>
    <ul class="sources">
      {#each article.learningResources as resource (resource.url)}
        <li>
          <PanelButton href={resource.url} fullWidth>
            <span class="source-copy">
              <strong>{resource.label}</strong>
              <span>{resource.detail}</span>
            </span>
            <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"
            ></i>
          </PanelButton>
        </li>
      {/each}
    </ul>
  </section>

  <section class="history" aria-labelledby="history-title">
    <h2 id="history-title">History & sources</h2>
    <p>{article.history}</p>
    <p class="source-note">
      These are dated examples of public use, not claims of invention.
    </p>
    <ul class="sources">
      {#each article.sources as source}
        <li>
          <PanelButton href={source.url} fullWidth>
            <span class="source-copy">
              <strong>{source.label}</strong>
              <span>{source.detail}</span>
            </span>
            <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"
            ></i>
          </PanelButton>
        </li>
      {/each}
    </ul>
  </section>

  <nav class="related" aria-label="Other timing and direction modes">
    <h2>Other modes</h2>
    <div class="related-modes">
      {#each relatedArticles as related (related.code)}
        <TimingDirectionModeCard article={related} />
      {/each}
    </div>
  </nav>
</article>

<style>
  .mode-page {
    --sequence-seek-target-size: 48px;
    position: relative;
    max-width: min(var(--shell-w), 100rem);
    margin: 0 auto;
    padding: 88px 1.5rem 3rem;
    color: var(--theme-text);
    background: var(--theme-panel-bg);
  }
  .page-nav {
    margin-bottom: 1.5rem;
  }
  .mode-overview {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    grid-template-rows: auto 1fr;
    gap: clamp(1.5rem, 4vw, 4rem);
    align-items: start;
  }
  .mode-copy,
  .mode-notes {
    min-width: 0;
    max-width: 65ch;
  }
  .mode-notes {
    grid-column: 1;
  }
  .mode-identity {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 0.75rem;
    font-size: 1rem;
    font-weight: 650;
    text-transform: capitalize;
    color: var(--theme-text);
  }
  .mode-identity img {
    object-fit: contain;
  }
  h1 {
    margin: 0 0 1.25rem;
    font-size: clamp(2rem, 1.5rem + 1.5vw, 3rem);
    line-height: 1.12;
    letter-spacing: -0.025em;
    font-weight: 720;
  }
  h1 span {
    display: block;
  }
  h2 {
    margin: 0 0 0.5rem;
    font-size: 1.125rem;
    line-height: 1.3;
    font-weight: 650;
  }
  p {
    margin: 0 0 1.5lh;
    font-size: 1.125rem;
    line-height: 1.6;
    color: var(--theme-text);
  }
  .definition {
    color: var(--theme-text);
    font-size: 1.125rem;
    line-height: 1.55;
  }
  .mode-notes section + section {
    margin-top: 1.5rem;
  }
  .example-picker {
    margin: 1.5rem 0;
    padding: 1rem;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-lg, 0.75rem);
    background: var(--theme-card-bg);
  }
  .example-picker h2 {
    margin-bottom: 0.25rem;
  }
  .example-picker p {
    margin-bottom: 0.75rem;
    font-size: 1rem;
  }
  .example-options {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.5rem;
  }
  .example-options button {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
    min-height: 44px;
    padding: 0.35rem;
    color: inherit;
    font: inherit;
    font-size: 0.75rem;
    line-height: 1.25;
    text-align: left;
    cursor: pointer;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-md, 0.5rem);
    background: var(--theme-panel-bg);
  }
  .example-options button.selected {
    outline: 2px solid var(--mode-accent);
    outline-offset: -2px;
    background: color-mix(
      in srgb,
      var(--mode-accent) 10%,
      var(--theme-card-bg)
    );
  }
  .example-options button:focus-visible {
    outline: 3px solid var(--theme-text);
    outline-offset: 2px;
  }
  .example-pictograph {
    display: block;
    aspect-ratio: 1;
  }
  .demonstration {
    grid-column: 2;
    grid-row: 1 / span 2;
    min-width: 0;
    margin: 0;
  }
  .demo-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0 0 0.75rem;
    font-size: 1rem;
    font-weight: 600;
  }
  .demo-canvas {
    width: 100%;
    aspect-ratio: 1;
  }
  .demo-toolbar :global(.transport-controls) {
    margin: 0;
  }
  figcaption {
    padding: 0.75rem 1rem 1rem;
    color: var(--theme-text);
    font-size: 1rem;
    line-height: 1.5;
  }
  .history,
  .related {
    margin-top: 2.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--theme-stroke);
  }
  .history > p {
    max-width: 68ch;
  }
  .source-note {
    font-size: 1rem;
  }
  .sources {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
    padding: 0;
    margin: 1rem 0 0;
    list-style: none;
  }
  .sources li {
    min-width: 0;
  }
  .sources :global(.panel-btn) {
    height: 100%;
    justify-content: space-between;
    text-align: left;
  }
  .source-copy {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
  }
  .source-copy strong {
    font-size: 1rem;
    font-weight: 600;
  }
  .source-copy > span {
    font-size: 1rem;
    font-weight: 400;
    color: var(--theme-text);
    line-height: 1.5;
  }
  .sources i {
    flex-shrink: 0;
    font-size: 0.875rem;
  }
  .related-modes {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  .mode-page :global(.panel-btn) {
    font-size: 1rem;
    min-height: 48px;
  }
  .mode-page :global(.panel-btn:focus-visible),
  .mode-page :global(.progress-bar-container.interactive:focus-visible) {
    outline: 3px solid var(--theme-text);
    outline-offset: -3px;
  }
  @media (max-width: 800px) {
    .mode-overview {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto;
    }
    .mode-notes {
      grid-row: 3;
    }
    .demonstration {
      grid-column: 1;
      grid-row: 2;
      width: min(100%, 34rem);
      justify-self: center;
    }
    .sources {
      grid-template-columns: minmax(0, 1fr);
    }
    .example-options {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  @media (max-width: 600px) {
    .mode-page {
      max-width: 100%;
      padding: 76px 1rem 2rem;
    }
    .page-nav {
      margin-bottom: 1rem;
    }
    .example-options {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
