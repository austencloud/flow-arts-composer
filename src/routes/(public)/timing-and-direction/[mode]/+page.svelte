<script lang="ts">
  import type { PageData } from "./$types";
  import { browser } from "$app/environment";
  import { TIMING_DIRECTION_MODES } from "$lib/features/learn/components/interactive/foundations/pictograph-foundation-content";
  import Seo from "$lib/shared/components/Seo.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import TransportControls from "$lib/shared/animation-engine/components/controls/TransportControls.svelte";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { DEFAULT_VIEWER_CUSTOM_COLORS } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";
  import { reducedMotion } from "$lib/shared/transitions/motion";
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
  let examplesLoading = $state(false);
  let examplesError = $state<string | null>(null);
  let examplesRetry = $state(0);
  let examplesRequest = 0;
  let examplePlayer: HTMLElement | undefined = $state();
  const exampleGroups = $derived([
    {
      title: "Diamond",
      examples: togetherOppositeExamples.filter(
        (example) => example.gridMode === GridMode.DIAMOND
      ),
    },
    {
      title: "Box",
      examples: togetherOppositeExamples.filter(
        (example) => example.gridMode === GridMode.BOX
      ),
    },
  ]);

  $effect(() => {
    if (article.code !== "TO") {
      examplesRequest += 1;
      selectedTogetherOppositeExample = null;
      togetherOppositeExamples = [];
      examplesError = null;
      examplesLoading = false;
      return;
    }
    examplesRetry;
    const request = ++examplesRequest;
    examplesLoading = true;
    examplesError = null;
    togetherOppositeExamples = [];
    void loadTogetherOppositeExamples()
      .then((examples) => {
        if (request !== examplesRequest || article.code !== "TO") return;
        if (examples.length === 0) {
          examplesError = "No matching pictographs are available yet.";
          return;
        }
        togetherOppositeExamples = examples;
        selectTogetherOppositeExample(examples[0]!);
      })
      .catch(() => {
        if (request !== examplesRequest || article.code !== "TO") return;
        examplesError = "Examples could not load. Try again.";
      })
      .finally(() => {
        if (request === examplesRequest) examplesLoading = false;
      });
  });

  function selectTogetherOppositeExample(
    example: TogetherOppositeExample,
    reveal = false
  ) {
    selectedTogetherOppositeExample = example.id;
    playback.selectExample(example.sequence, example.step);
    if (reveal && window.matchMedia("(max-width: 900px)").matches) {
      examplePlayer?.scrollIntoView({
        block: "center",
        behavior: reducedMotion() ? "instant" : "smooth",
      });
    }
  }

  function retryTogetherOppositeExamples() {
    examplesRetry += 1;
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

  {#if article.code === "TO"}
    <section class="to-reference" aria-labelledby="to-reference-title">
      <header class="to-header">
        <div class="mode-identity">
          <img src={mode.element.iconPath} alt="" width="44" height="44" />
          <span>{article.code} · {mode.element.element}</span>
        </div>
        <h1 id="to-reference-title">Together time, opposite direction</h1>
        <p class="definition">{article.definition}</p>
      </header>

      <div class="to-stage">
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
          <div
            class="demo-canvas"
            bind:this={examplePlayer}
            use:playback.registerTarget
          ></div>
          <figcaption>
            Drag the bar to follow the selected hand path.
          </figcaption>
        </figure>

        <section class="example-picker" aria-labelledby="example-picker-title">
          <div>
            <h2 id="example-picker-title">Matching pictographs</h2>
            <p>Same hand paths. Different prop rotations.</p>
          </div>
          <div
            class="example-options"
            aria-label="Together-Opposite examples"
            aria-busy={examplesLoading}
          >
            {#if examplesLoading}
              <p class="example-status">Loading matching pictographs…</p>
            {:else if examplesError}
              <div class="example-status">
                <p>{examplesError}</p>
                <PanelButton onclick={retryTogetherOppositeExamples}
                  >Try again</PanelButton
                >
              </div>
            {:else}
              {#each exampleGroups as group (group.title)}
                <section
                  class="example-group"
                  aria-labelledby={`${group.title}-examples`}
                >
                  <h3 id={`${group.title}-examples`}>{group.title}</h3>
                  <div class="example-grid">
                    {#each group.examples as example (example.id)}
                      <PanelButton
                        fullWidth
                        ariaPressed={selectedTogetherOppositeExample ===
                          example.id}
                        ariaLabel={`Show ${example.pictograph.letter} in ${example.gridMode} grid`}
                        onclick={() =>
                          selectTogetherOppositeExample(example, true)}
                      >
                        <span class="example-pictograph">
                          <PictographContainer
                            pictographData={example.pictograph}
                            gridMode={example.gridMode}
                            leftPropTypeOverride={PropType.STAFF}
                            rightPropTypeOverride={PropType.STAFF}
                            leftColorOverride={DEFAULT_VIEWER_CUSTOM_COLORS.left}
                            rightColorOverride={DEFAULT_VIEWER_CUSTOM_COLORS.right}
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
                      </PanelButton>
                    {/each}
                  </div>
                </section>
              {/each}
            {/if}
          </div>
        </section>
      </div>

      <div class="to-notes">
        <section>
          <h2>What stays the same</h2>
          <p>
            Both hands arrive on the same beat while their paths travel in
            opposite senses.
          </p>
        </section>
        <section>
          <h2>What can change</h2>
          <p>
            Letter, start position, grid, and prop rotation can change without
            changing that hand-path classification.
          </p>
        </section>
        <section>
          <h2>Practice</h2>
          <p>{article.example}</p>
        </section>
      </div>
    </section>
  {:else}
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
  {/if}

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
  .to-reference {
    max-width: 86rem;
  }
  .to-header {
    max-width: 100%;
    margin-bottom: 1.5rem;
  }
  .to-header h1 {
    margin-bottom: 0.75rem;
    text-wrap: balance;
  }
  .to-header .definition {
    max-width: 68ch;
    margin-bottom: 0;
  }
  .to-stage {
    display: grid;
    grid-template-columns: minmax(18rem, 32rem) minmax(0, 1fr);
    gap: clamp(1rem, 3vw, 2rem);
    align-items: start;
  }
  .to-stage .demonstration {
    grid-column: auto;
    grid-row: auto;
    width: min(100%, 32rem);
  }
  .to-notes {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem;
    margin-top: 1.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--theme-stroke);
  }
  .to-notes p {
    margin: 0;
    font-size: 1rem;
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
    min-width: 0;
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
    grid-template-columns: minmax(0, 1fr);
    gap: 1.5rem;
  }
  .example-group {
    min-width: 0;
  }
  .example-group h3 {
    margin: 0 0 0.625rem;
    font-size: 1rem;
    font-weight: 650;
  }
  .example-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
  }
  .example-options :global(.panel-btn) {
    min-width: 0;
    min-height: 0;
    padding: 0.375rem;
  }
  .example-options :global(.panel-btn[aria-pressed="true"]) {
    outline: 2px solid var(--mode-accent);
    outline-offset: -2px;
    background: color-mix(
      in srgb,
      var(--mode-accent) 10%,
      var(--theme-card-bg)
    );
  }
  .example-options :global(.panel-btn:focus-visible) {
    outline: 3px solid var(--theme-text);
    outline-offset: 2px;
  }
  .example-pictograph {
    display: block;
    aspect-ratio: 1;
  }
  .example-status {
    display: grid;
    gap: 0.5rem;
    grid-column: 1 / -1;
    min-height: 9rem;
    align-content: center;
  }
  .example-status p {
    margin: 0;
    font-size: 0.875rem;
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
  @media (min-width: 1600px) {
    .example-options {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: 1.5rem;
    }
  }
  @media (max-width: 900px) {
    .to-stage {
      grid-template-columns: minmax(0, 1fr);
    }
    .to-stage .demonstration {
      width: min(100%, 32rem);
      justify-self: center;
    }
  }
  @media (max-width: 800px) {
    .to-stage,
    .to-notes {
      grid-template-columns: minmax(0, 1fr);
    }
    .to-stage .demonstration {
      justify-self: center;
    }
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
