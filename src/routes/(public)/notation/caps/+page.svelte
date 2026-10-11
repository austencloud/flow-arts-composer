<script lang="ts">
  import Seo from "#lib/shared/components/Seo.svelte";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import SequenceHeroDemo from "#lib/shared/landing/components/SequenceHeroDemo.svelte";
  import { NOTATION_LOOP_TEASER_SEQUENCE } from "#lib/shared/loop-explorer/domain/notation-loop-teaser.js";
  import CapsAssembly from "./_components/CapsAssembly.svelte";
  import YutaCapLiveDemo from "./_components/YutaCapLiveDemo.svelte";
  import "#lib/shared/landing/styles/public-editorial.css";

  // Suffix is deliberately NOT "| The Kinetic Alphabet". CAPs are not TKA's,
  // and a brand suffix on a title is the strongest ownership signal a reader
  // or an indexer sees — it reads exactly like "Hooks | React".
  const TITLE =
    "CAPs: Continuous Assembly Patterns | Flow Arts Notation Archive";
  const DESCRIPTION =
    "What a CAP is, where Continuous Assembly Patterns came from, and how they differ from LOOPs, with links to the original sources.";
  const URL = "https://tkaflowarts.com/notation/caps";

  const THREAD_URL =
    "https://www.homeofpoi.com/en/community/forums/topics/891193/What-are-CAP-s";
  const MATH_URL = "https://drexfactor.com/reference/math_caps";
  const CCAP_URL =
    "https://drexfactor.com/index.php?q=weirdscience%2F2012%2F08%2F21%2Fbasic_poi_dancing_tutorial_c_caps";
  const PLAYPOI_URL =
    "https://playpoi.com/learn/learning-caps-capped-antispin-patterns/";
  const EIGHT_STEP_URL =
    "https://www.drexfactor.com/weirdscience/2016/09/27/tutorial_double_staff_8_step_cap_recipe";

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
    { href: EIGHT_STEP_URL, label: "Double staff 8-step CAP recipe, 2016" },
    {
      href: "https://www.youtube.com/playlist?list=PLDE05D5E593C54AED",
      label: "Charlie's 9-Square Theory playlist",
    },
  ];
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
        { "@type": "Person", "name": "Alien Jon" },
        { "@type": "Person", "name": "Nick Woolsey" },
        { "@type": "Person", "name": "Ben Drexler" },
        { "@type": "Person", "name": "Charlie Cushing" }
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
      { "@type": "ListItem", "position": 2, "name": "Flow Arts History", "item": "https://tkaflowarts.com/history" },
      { "@type": "ListItem", "position": 3, "name": "CAPs", "item": "${URL}" }
    ]
  }
  </script>`}
</Seo>

<div class="editorial caps-page">
  <header class="editorial-header">
    <h1 class="page-title">CAPs: Continuous Assembly Patterns</h1>
    <p class="page-subtitle">
      What a CAP is, where the idea came from, and how it differs from a LOOP.
    </p>
  </header>

  <section id="what-is" class="editorial-section">
    <div class="text-and-figure">
      <div class="prose">
        <h2 class="section-title">What a CAP is</h2>
        <p>
          A CAP is the path of one prop, built from two or more simple curves
          joined end to end. A curve can be used more than once. The prop
          traces every piece in turn and comes back to where it started, so
          the whole path can repeat.
        </p>
        <p>
          Damien coined the term and published the construction on <LinkChip
            size="inline"
            href={THREAD_URL}>Home of Poi in 2009</LinkChip
          >, posting as Zaltymbunk and French_Saltimbanque.
        </p>
        <p>
          The CAP drawn here has two halves. In the first, the hand carries the
          prop through half a circle while the prop keeps pointing away from
          the center. That is an extension. In the second, the hand comes back
          while the prop turns against it, which draws the inner petals. That
          is antispin. The halves meet at a shared point, and the prop ends in
          the same place and direction it started, so the path closes.
        </p>
      </div>
      <figure class="figure">
        <div class="assembly-frame"><CapsAssembly /></div>
      </figure>
    </div>
  </section>

  <section id="origin" class="editorial-section">
    <div class="prose">
      <h2 class="section-title">Where the idea came from</h2>
      <p>
        Alien Jon described sessions at Burning Man in 2007 where the OMCC
        group, with Noel, Greg, Jordan and Zan, took complex poi patterns apart
        to see how they worked. Damien joined them with his own CAP
        explorations.
      </p>
      <p>
        The name reached a wider audience in 2009, in a <LinkChip
          size="inline"
          href={THREAD_URL}>Home of Poi thread</LinkChip
        > about Yuta's spinning. Alien Jon wrote that he got the term from Damien.
        Damien then set out his model in the thread: the O/M/E notation, rules
        for which combinations can be spun, and worked examples. His framework
        survives in <LinkChip size="inline" href={MATH_URL}
          >The Math of CAPs</LinkChip
        >, preserved by DrexFactor. Some playlists and images linked from the
        thread are gone.
      </p>
      <p>
        Lessons carried the idea from there. Drex documented the definition and
        the <LinkChip size="inline" href={CCAP_URL}>C-CAP</LinkChip> from 2011
        on. Nick Woolsey taught CAPs on <LinkChip
          size="inline"
          href={PLAYPOI_URL}>PlayPoi</LinkChip
        > in 2016 as Capped Antispin Patterns. Drex's <LinkChip
          size="inline"
          href={EIGHT_STEP_URL}>eight-step double staff lesson</LinkChip
        > credits Charlie's 9-Square Theory.
      </p>
    </div>
  </section>

  <section id="loops" class="editorial-section">
    <div class="prose">
      <h2 class="section-title">CAPs and LOOPs</h2>
      <p>
        A CAP starts from one prop. Its path is built from simple curves, and
        each hand's path is worked out on its own. A two-hand pattern comes from
        putting two of those paths together.
      </p>
      <p>
        A LOOP starts from both hands at once. Each letter of the Kinetic
        Alphabet records where both hands and props go on one beat, and a LOOP
        is a word made of those letters that comes back to its starting
        position. The first Kinetic Alphabet guide called these CAPs too, which
        is why the two names get mixed up. They are covered in the <LinkChip
          size="inline"
          href="/guide/level-1/permutations">Level 1 guide</LinkChip
        >.
      </p>
    </div>
    <div id="comparison" class="comparison">
      <figure class="figure cap-figure">
        <div class="cap-frame"><YutaCapLiveDemo /></div>
        <figcaption>a CAP: one club, one path</figcaption>
      </figure>
      <div class="figure">
        <SequenceHeroDemo
          sequence={NOTATION_LOOP_TEASER_SEQUENCE}
          leftPropType="club"
          rightPropType="club"
          note="a LOOP: both hands, turning a quarter each time it repeats"
        />
      </div>
    </div>
  </section>

  <section id="sources" class="editorial-section">
    <h2 class="section-title">Sources</h2>
    <ul class="sources" role="list">
      {#each SOURCES as source (source.href)}
        <li><LinkChip href={source.href} wrap>{source.label}</LinkChip></li>
      {/each}
    </ul>
    <p class="print-note">
      Print: Encyclo-poi-dia Vol. 2 has a CAP chapter, referenced in the
      original thread.
    </p>
  </section>
</div>

<style>
  .caps-page .prose {
    max-inline-size: 68ch;
  }

  .text-and-figure {
    display: grid;
    gap: clamp(1.5rem, 1rem + 2vw, 3rem);
    align-items: center;
  }

  .figure {
    margin: 0;
    min-inline-size: 0;
  }

  .assembly-frame {
    inline-size: min(100%, 30rem);
    aspect-ratio: 1 / 1.2;
    margin-inline: auto;
  }

  .comparison {
    --pair-w: min(26rem, 100%);
    --hero-demo-max-width: var(--pair-w);
    --hero-demo-wide-max-width: var(--pair-w);
    display: grid;
    gap: clamp(1.5rem, 1rem + 2vw, 3rem);
    margin-block-start: clamp(1.5rem, 1rem + 1vw, 2.5rem);
    align-items: start;
  }

  /* Same width and stage as the LOOP demo beside it, so the pair reads as
     one comparison. */
  .cap-figure {
    inline-size: var(--pair-w);
    margin-inline: auto;
  }

  .comparison :global(.hero-demo) {
    margin-block-start: 0;
  }

  .cap-frame {
    border: 1px solid oklch(0.4 0.04 270 / 0.14);
    border-radius: 18px;
    background: oklch(0.14 0.006 270);
  }

  .cap-figure figcaption {
    margin-block-start: 0.8rem;
    font-size: clamp(0.85rem, 0.8rem + 0.12vw, 1rem);
    font-style: italic;
    color: oklch(0.6 0.02 270);
  }

  .sources {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .print-note {
    margin: 1.2rem 0 0;
    font-size: clamp(0.9rem, 0.85rem + 0.12vw, 1.05rem);
    color: oklch(0.62 0.02 270);
  }

  @media (min-width: 960px) {
    .text-and-figure {
      grid-template-columns: minmax(0, 68ch) minmax(0, 1fr);
    }

    .comparison {
      grid-template-columns: repeat(2, var(--pair-w));
      justify-content: center;
      column-gap: clamp(3rem, 2rem + 3vw, 6rem);
    }
  }
</style>
