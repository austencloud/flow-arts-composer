<script lang="ts">
  import { dev } from "$app/env";
  import Seo from "#lib/shared/components/Seo.svelte";
  import LazyMount from "#lib/shared/components/LazyMount.svelte";
  import CopyText from "#lib/shared/copy-edit/CopyText.svelte";
  import { createPageCopy } from "#lib/shared/copy-edit/page-copy.svelte";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import SequenceHeroDemo from "#lib/shared/landing/components/SequenceHeroDemo.svelte";
  import { NOTATION_LOOP_TEASER_SEQUENCE } from "#lib/shared/loop-explorer/domain/notation-loop-teaser.js";
  import CapsAssembly from "./_components/CapsAssembly.svelte";
  import CapTrace from "./_components/CapTrace.svelte";
  import HandTile from "#lib/shared/guide-topics/components/HandTile.svelte";
  import { buildCapSequence } from "./_components/yuta-cap-sequence";
  import {
    CAP_HAND_PATHS,
    capStrip,
  } from "#lib/shared/guide-topics/caps-topic.js";
  import { stripToSequence } from "#lib/shared/guide-topics/strip-to-sequence.js";
  import {
    DEFAULT_TRAIL_SETTINGS,
    TrackingMode,
    TrailMode,
    type TrailSettings,
  } from "#lib/shared/animation-engine/domain/types/trail-types.js";
  import "#lib/shared/landing/styles/public-editorial.css";
  import copyJson from "./copy.json";

  const copy = createPageCopy({
    file: "src/routes/(public)/notation/caps/copy.json",
    initial: copyJson,
  });

  // Suffix is deliberately NOT "| The Kinetic Alphabet". CAPs are not TKA's,
  // and a brand suffix on a title is the strongest ownership signal a reader
  // or an indexer sees: it reads exactly like "Hooks | React".
  const TITLE =
    "CAPs: Continuous Assembly Patterns | Flow Arts Notation Archive";
  const DESCRIPTION =
    "What a CAP is, where in the circle you reverse, how Gage DeMello catalogued the two-hand version, and how CAPs differ from LOOPs, with links to the original sources.";
  const URL = "https://tkaflowarts.com/notation/caps";

  const THREAD_URL =
    "https://www.homeofpoi.com/en/community/forums/topics/891193/What-are-CAP-s";
  const MATH_URL = "https://drexfactor.com/reference/math_caps";
  const CCAP_URL =
    "https://drexfactor.com/index.php?q=weirdscience%2F2012%2F08%2F21%2Fbasic_poi_dancing_tutorial_c_caps";
  const PLAYPOI_URL =
    "https://playpoi.com/learn/learning-caps-capped-antispin-patterns/";

  const SOURCES: { href: string; label: string }[] = [
    { href: THREAD_URL, label: "What are CAP's? Home of Poi, 2009" },
    { href: MATH_URL, label: "The Math of CAPs, preserved by DrexFactor" },
    {
      href: "https://www.youtube.com/watch?v=DyK42suXQUk",
      label: "Tech Poi Blog #213: What is a CAP? 2011",
    },
    { href: CCAP_URL, label: "Basic Poi Dancing Tutorial: C-CAPs, 2012" },
    {
      href: PLAYPOI_URL,
      label: "Learning CAPs (Capped Antispin Patterns), PlayPoi, 2016",
    },
    { href: "https://spiroanim.com/", label: "SpiroAnim, by Mentive" },
  ];

  // Three settings of the same two curves, played in step by one recipe.
  const TRACES = [
    {
      quarters: 1 as const,
      captionKey: "trace-1",
      artKey: "cap-quarter",
    },
    {
      quarters: 2 as const,
      captionKey: "trace-2",
      artKey: "yuta-cap",
    },
    {
      quarters: 3 as const,
      captionKey: "trace-3",
      artKey: "cap-three-quarter",
    },
  ].map((trace) => ({ ...trace, sequence: buildCapSequence(trace.quarters) }));

  // The two-hand figure is the middle tile of the Eight Step page's header:
  // the first CAP on the first hand path, both hands drawing their paths.
  const firstCap = CAP_HAND_PATHS[0]!.caps[0]!;
  const twoHands = stripToSequence(capStrip(firstCap), {
    word: firstCap.word,
    name: firstCap.id,
  });
  const HAND_TRAIL: TrailSettings = {
    ...DEFAULT_TRAIL_SETTINGS,
    mode: TrailMode.LOOP_CLEAR,
    trackingMode: TrackingMode.HAND,
  };
</script>

<Seo title={TITLE} description={DESCRIPTION} canonical={URL} ogType="article">
  {@html `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "CAPs: Continuous Assembly Patterns",
    "url": "${URL}",
    "description": "${DESCRIPTION}",
    "inLanguage": "en-US",
    "author": { "@type": "Person", "name": "Austen Cloud", "url": "https://tkaflowarts.com/about" },
    "publisher": { "@type": "Organization", "name": "The Kinetic Alphabet", "url": "https://tkaflowarts.com/" },
    "about": {
      "@type": "CreativeWork",
      "name": "Continuous Assembly Patterns",
      "alternateName": "CAPs",
      "dateCreated": "2009",
      "creator": { "@type": "Person", "name": "Damien", "alternateName": "French_Saltimbanque" },
      "contributor": [
        { "@type": "Person", "name": "Gage DeMello" },
        { "@type": "Person", "name": "Nick Woolsey" },
        { "@type": "Person", "name": "Ben Drexler" }
      ]
    },
    "citation": [
      { "@type": "CreativeWork", "name": "What are CAPs? Home of Poi forums, 2009", "url": "${THREAD_URL}" },
      { "@type": "CreativeWork", "name": "The mathematics of CAPs, preserved by DrexFactor", "url": "${MATH_URL}" }
    ]
  }
  </script>`}
  {@html `<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://tkaflowarts.com/" },
      { "@type": "ListItem", "position": 2, "name": "CAPs", "item": "${URL}" }
    ]
  }
  </script>`}
</Seo>

{#snippet homeOfPoiChip()}
  <LinkChip size="inline" href={THREAD_URL}>Home of Poi in 2009</LinkChip>
{/snippet}
{#snippet extensionLine()}
  <code>1 0 ; 1 3/4 ; 1/2</code>
{/snippet}
{#snippet antispinLine()}
  <code>-1 4 ; 1 3/4 ; 1/2</code>
{/snippet}
{#snippet level1Chip()}
  <LinkChip size="inline" href="/guide/level-1/permutations"
    >Level 1 guide</LinkChip
  >
{/snippet}
{#snippet handCaption()}
  <CopyText {copy} key="hand-caption" />
{/snippet}
{#snippet loopNote()}
  <CopyText {copy} key="loop-note" />
{/snippet}

<div class="editorial caps-page">
  <header class="editorial-header center">
    <h1 class="page-title"><CopyText {copy} key="title" /></h1>
    <p class="page-subtitle">
      <CopyText {copy} key="lede" />
    </p>
  </header>

  <section id="what-is" class="editorial-section">
    <div class="text-and-figure">
      <div class="prose">
        <h2 class="section-title center">
          <CopyText {copy} key="what-heading" />
        </h2>
        <p>
          <CopyText {copy} key="what-1" />
        </p>
        <p>
          <CopyText {copy} key="what-2" islands={[homeOfPoiChip]} />
        </p>
        <p>
          <CopyText {copy} key="what-3" />
        </p>
      </div>
      <figure class="figure assembly-figure">
        <div class="assembly-frame"><CapsAssembly tight /></div>
      </figure>
    </div>
  </section>

  <section id="reverse" class="editorial-section">
    <div class="prose">
      <h2 class="section-title center">
        <CopyText {copy} key="reverse-heading" />
      </h2>
      <p>
        <CopyText {copy} key="reverse-1" />
      </p>
      <p>
        <CopyText
          {copy}
          key="reverse-2"
          islands={[extensionLine, antispinLine]}
        />
      </p>
      <p>
        <CopyText {copy} key="reverse-3" />
      </p>
    </div>
    <div class="trace-row">
      {#each TRACES as trace (trace.quarters)}
        <figure class="figure trace-figure">
          <div class="cap-frame">
            <CapTrace
              sequence={trace.sequence}
              artKey={trace.artKey}
              poster={trace.poster}
            />
          </div>
          <figcaption><CopyText {copy} key={trace.captionKey} /></figcaption>
        </figure>
      {/each}
    </div>
  </section>

  <section id="two-hands" class="editorial-section">
    <div class="text-and-figure">
      <div class="prose">
        <h2 class="section-title center">
          <CopyText {copy} key="hands-heading" />
        </h2>
        <p>
          <CopyText {copy} key="hands-1" />
        </p>
        <p>
          <CopyText {copy} key="hands-2" />
        </p>
        <p class="credit">
          <CopyText {copy} key="credit" />
        </p>
        <div class="chip-row">
          <LinkChip href="/guide/eight-step">Eight Hand Paths</LinkChip>
        </div>
      </div>
      <div class="figure hand-figure">
        <HandTile
          sequence={twoHands}
          hand="both"
          captionContent={handCaption}
          trail={HAND_TRAIL}
          stepNumbers
        />
      </div>
    </div>
  </section>

  <section id="loops" class="editorial-section">
    <div class="text-and-figure">
      <div class="prose">
        <h2 class="section-title center">
          <CopyText {copy} key="loops-heading" />
        </h2>
        <p>
          <CopyText {copy} key="loops-1" />
        </p>
        <p>
          <CopyText {copy} key="loops-2" islands={[level1Chip]} />
        </p>
      </div>
      <div class="figure loop-figure">
        <SequenceHeroDemo
          sequence={NOTATION_LOOP_TEASER_SEQUENCE}
          leftPropType="club"
          rightPropType="club"
          noteContent={loopNote}
        />
      </div>
    </div>
  </section>

  <section id="sources" class="editorial-section">
    <h2 class="section-title center">
      <CopyText {copy} key="sources-heading" />
    </h2>
    <ul class="sources" role="list">
      {#each SOURCES as source (source.href)}
        <li><LinkChip href={source.href} wrap>{source.label}</LinkChip></li>
      {/each}
    </ul>
    <p class="print-note">
      <CopyText {copy} key="print-note" />
    </p>
  </section>
</div>

{#if dev}
  <LazyMount
    loader={() => import("#lib/shared/copy-edit/CopyEditBar.svelte")}
    active={dev}
    debugName="copy edit bar"
  />
{/if}

<style>
  .text-and-figure {
    display: grid;
    gap: clamp(1.5rem, 1rem + 2vw, 3rem);
    align-items: center;
  }

  .figure {
    margin: 0;
    min-inline-size: 0;
  }

  /* Each figure carries its own width cap, and from 960px the figure column
     is sized by that cap, so the prose takes the rest of the row. */
  .assembly-figure {
    --figure-w: 30rem;
  }

  .hand-figure {
    --figure-w: 20rem;
  }

  .loop-figure {
    --figure-w: 26rem;
    --hero-demo-max-width: 100%;
    --hero-demo-wide-max-width: 100%;
  }

  .assembly-figure,
  .hand-figure,
  .loop-figure {
    inline-size: min(100%, var(--figure-w));
    margin-inline: auto;
  }

  .assembly-frame {
    inline-size: 100%;
  }

  .loop-figure :global(.hero-demo) {
    margin-block-start: 0;
  }

  /* The three traces share one track width so they read as one comparison:
     a column on phones, three across from 960px. */
  .trace-row {
    --trace-w: min(20rem, 100%);
    display: grid;
    grid-template-columns: var(--trace-w);
    justify-content: center;
    gap: clamp(1.5rem, 1rem + 2vw, 3rem);
    margin-block-start: clamp(1.5rem, 1rem + 1vw, 2.5rem);
  }

  .credit {
    font-style: italic;
    color: oklch(0.62 0.02 270);
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
  }

  .cap-frame {
    overflow: hidden;
    border: 1px solid oklch(0.4 0.04 270 / 0.14);
    border-radius: 18px;
    background: oklch(0.14 0.006 270);
  }

  .trace-figure figcaption {
    text-align: center;
    margin-block-start: 0.8rem;
    font-size: clamp(0.85rem, 0.8rem + 0.12vw, 1rem);
    font-style: italic;
    color: oklch(0.6 0.02 270);
  }

  .sources {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.6rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .print-note {
    margin: 1.2rem 0 0;
    text-align: center;
    font-size: clamp(0.9rem, 0.85rem + 0.12vw, 1.05rem);
    color: oklch(0.62 0.02 270);
  }

  @media (min-width: 960px) {
    .text-and-figure {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .text-and-figure > .figure {
      inline-size: var(--figure-w);
    }

    .trace-row {
      grid-template-columns: repeat(3, minmax(0, 20rem));
    }
  }
</style>
