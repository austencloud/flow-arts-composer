<script lang="ts">
  import { tick } from "svelte";
  import Seo from "$lib/shared/components/Seo.svelte";
  import SourceVideoCard from "$lib/shared/components/SourceVideoCard.svelte";
  import CapsHub from "./_components/CapsHub.svelte";
  import CapsAssembly from "./_components/CapsAssembly.svelte";
  import CurveAtlas from "./_components/CurveAtlas.svelte";
  import FocusedConstruction from "./_components/FocusedConstruction.svelte";
  import "$lib/shared/landing/styles/public-editorial.css";

  // Suffix is deliberately NOT "| The Kinetic Alphabet". CAPs are not TKA's,
  // and a brand suffix on a title is the strongest ownership signal a reader
  // or an indexer sees — it reads exactly like "Hooks | React".
  const TITLE =
    "CAPs: Continuous Assembly Patterns | Flow Arts Notation Archive";
  const DESCRIPTION =
    "The history and mathematics of Continuous Assembly Patterns, with reconstructed curves, geometric models, and original sources.";
  const URL = "https://tkaflowarts.com/notation/caps";
  const THREAD_URL =
    "https://www.homeofpoi.com/en/community/forums/topics/891193/What-are-CAP-s";
  const MATH_URL = "https://drexfactor.com/reference/math_caps";
  const MATHCURVE_URL = "https://mathcurve.com/";

  type MediaItem = {
    id: string;
    title: string;
    creator: string;
    year: string;
    note: string;
  };

  const MODERN_MEDIA: MediaItem[] = [
    {
      id: "DyK42suXQUk",
      title: "Tech Poi Blog #213: What is a CAP?",
      creator: "DrexFactor Poi",
      year: "2011",
      note: "A direct explanation of the term and the debate around it.",
    },
    {
      id: "B-o3E7Ix5uM",
      title: "Basic Poi Dancing Tutorial: C-CAPs",
      creator: "DrexFactor Poi",
      year: "2012",
      note: "A lesson on the extension and antispin pattern commonly called a C-CAP.",
    },
    {
      id: "UBx2IZVzSVA",
      title: "Poi Flowers: Learning CAPs (Capped Antispin Patterns)",
      creator: "Nick Woolsey · PlayPoi",
      year: "2016",
      note: "The PlayPoi lesson that uses the expansion Capped Antispin Patterns.",
    },
    {
      id: "Lh5wtTddhEE",
      title: "Charlie's 9-Square Theory for Poi #3",
      creator: "Charlie",
      year: "~2015",
      note: "Part three of Charlie's 9-Square Theory video series.",
    },
    {
      id: "dBn6kz_7huc",
      title: "How to do 8-Step CAPs for Poi: 1-minute tutorial",
      creator: "DrexFactor Poi",
      year: "2017",
      note: "An eight-step CAP taught in one minute.",
    },
    {
      id: "Chf9IAhqp7M",
      title: "Poi CAPs Tutorial: Basic C-CAPs",
      creator: "DrexFactor Poi",
      year: "2020",
      note: "A later lesson on the classic C-CAP pattern.",
    },
  ];

  let selectedCurveId = $state<string | null>("yuta-cap");

  async function selectCurve(id: string): Promise<void> {
    selectedCurveId = id;
    await tick();
    document.getElementById("focused-construction-title")?.focus();
  }

  function enterCustomState(): void {
    selectedCurveId = null;
  }
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
      { "@type": "CreativeWork", "name": "What are CAPs? — Home of Poi forums, 2009", "url": "${THREAD_URL}" },
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

<CapsHub />

<div class="editorial caps-editorial">
  <section
    id="what-is"
    class="editorial-section has-duo"
    style="--accent: #38bdf8"
  >
    <div class="section-duo demo-star definition-duo">
      <div class="duo-demo definition-demo">
        <CapsAssembly />
      </div>
      <div class="duo-copy definition-copy">
        <span class="section-kicker">Start with the path</span>
        <h2 class="section-title">What is a CAP?</h2>
        <div class="prose">
          <p>
            A CAP is a cyclic path assembled in time from two or more elementary
            patterns, each used one or more times. One prop traces every
            fragment and returns to its starting point.
          </p>
          <p class="cap-credit">
            Damien coined the term and published the construction while posting
            as Zaltymbunk and French_Saltimbanque on <a href={THREAD_URL}
              >Home of Poi in 2009</a
            >.
          </p>
        </div>

        <h3 id="breakdown" class="breakdown-title">How this CAP is built</h3>
        <ul class="bullet-list compact-list">
          <li>
            <strong>Extension:</strong> the hand carries the prop through half a cycle
            while the prop stays pointed away from center.
          </li>
          <li>
            <strong>Antispin:</strong> the hand returns while the prop rotates against
            the hand path, shaping the inner petals.
          </li>
          <li>
            <strong>The join:</strong> the hand and prop tip meet at the shared endpoint.
          </li>
          <li>
            <strong>The cycle:</strong> the final position and orientation match the
            start, so the curve can repeat.
          </li>
        </ul>
      </div>
    </div>
  </section>

  <section
    id="math"
    class="editorial-section math-section"
    style="--accent: #34d399"
  >
    <header class="math-heading">
      <div>
        <span class="section-kicker">The curve atlas</span>
        <h2 class="section-title">From elementary curves to assembled CAPs</h2>
      </div>
      <div class="prose">
        <p>
          Damien called the elementary families rosettes and cycloids. In
          standard curve language they belong to the centered trochoid family;
          his cycloid cases are the cusp-forming epicycloids or hypocycloids.
          The clean plots below are reconstructed from his published parameters.
        </p>
        <p class="atlas-credit">
          The animated reference illustrations Damien linked were by
          <a href={MATHCURVE_URL}
            >Robert Ferréol, Encyclopédie des formes mathématiques remarquables</a
          >. Those archival GIFs are credited here and not republished.
        </p>
      </div>
    </header>

    <CurveAtlas selectedId={selectedCurveId} onselect={selectCurve} />
    <FocusedConstruction
      selectedId={selectedCurveId}
      oncustom={enterCustomState}
    />
  </section>

  <section id="origin" class="editorial-section" style="--accent: #f472b6">
    <span class="section-kicker">Origin chronology</span>
    <h2 class="section-title">From Burning Man to Home of Poi</h2>
    <ol class="chronology">
      <li>
        <time>2007</time>
        <div>
          <h3>Ideas at Burning Man</h3>
          <p>
            Alien Jon described the OMCC group pulling apart complex poi
            patterns with Noel, Greg, Jordan, and Zan. Damien joined them with
            his own CAP explorations.
          </p>
        </div>
      </li>
      <li>
        <time>2009</time>
        <div>
          <h3>The name and the model</h3>
          <p>
            In a Home of Poi thread about Yuta's spinning, Alien Jon wrote, “I
            got the term from Damien.” Damien then set out the O/M/E model,
            notation, feasibility rules, and worked CAP examples.
          </p>
        </div>
      </li>
      <li>
        <time>2011–2017</time>
        <div>
          <h3>Lessons spread the idea</h3>
          <p>
            Drex documented the definition and C-CAP technique. Nick Woolsey
            taught Capped Antispin Patterns. Drex's eight-step lesson credited
            Charlie's 9-Square Theory.
          </p>
        </div>
      </li>
      <li>
        <time>Today</time>
        <div>
          <h3>What survives</h3>
          <p>
            The forum discussion survives, but old playlists and image hosts
            have disappeared. This exhibit keeps the mathematics readable while
            sending visitors back to the remaining originals.
          </p>
        </div>
      </li>
    </ol>
  </section>

  <section id="credits" class="editorial-section" style="--accent: #38bdf8">
    <span class="section-kicker">The people</span>
    <h2 class="section-title">People behind CAPs</h2>
    <div class="credits-layout">
      <article class="credit-primary">
        <span class="credit-role">Term, notation, and mathematics</span>
        <h3>Damien</h3>
        <p class="alias">Posting as Zaltymbunk and French_Saltimbanque</p>
        <p>
          Coined Continuous Assembly Patterns and published the elementary
          curves, O/M/E notation, rosettes, cycloids, wrap fractions,
          feasibility rules, and composite examples shown on this page.
        </p>
        <div class="credit-links">
          <a href={THREAD_URL}>Origin thread</a>
          <a href={MATH_URL}>The Math of CAPs</a>
        </div>
      </article>

      <div class="credit-support">
        <article>
          <h3>Alien Jon</h3>
          <p>
            Carried Damien's term into wider use and framed CAPs as a way to
            think about movement rather than the name of one move.
          </p>
        </article>
        <article>
          <h3>Nick Woolsey <span>PlayPoi</span></h3>
          <p>
            Taught CAPs to a broad learner audience in 2016 and used the
            expansion “Capped Antispin Patterns.”
          </p>
          <a
            href="https://playpoi.com/learn/learning-caps-capped-antispin-patterns/"
            >PlayPoi lesson</a
          >
        </article>
        <article>
          <h3>Charlie</h3>
          <p>
            Developed 9-Square Theory and the eight-step CAP approach credited
            in Drex's double staff lesson.
          </p>
          <a
            href="https://www.drexfactor.com/weirdscience/2016/09/27/tutorial_double_staff_8_step_cap_recipe"
            >Eight-step lesson</a
          >
        </article>
        <article>
          <h3>Drex <span>DrexFactor</span></h3>
          <p>
            Documented CAPs across the Tech Poi Blog, tutorials, and the
            preserved copy of Damien's mathematical framework.
          </p>
          <a
            href="https://drexfactor.com/index.php?q=weirdscience%2F2012%2F08%2F21%2Fbasic_poi_dancing_tutorial_c_caps"
            >C-CAP lesson</a
          >
        </article>
      </div>
    </div>
    <p class="credit-footnote">
      Also in the room at Burning Man 2007: Noel, Greg, Jordan, and Zan of the
      OMCC crew.
    </p>
  </section>

  <section
    id="relationship"
    class="editorial-section"
    style="--accent: #22d3ee"
  >
    <span class="section-kicker">Two ways to close a pattern</span>
    <h2 class="section-title">CAPs and LOOPs start from different units</h2>
    <div class="relationship-grid">
      <article>
        <span>CAPs</span>
        <h3>A path for one prop</h3>
        <p>
          CAPs serially assemble elementary paths for one prop. Each hand's
          trajectory is defined independently, then two-hand movement can be
          overlaid.
        </p>
      </article>
      <article>
        <span>LOOPs</span>
        <h3>A letter for both hands</h3>
        <p>
          Each TKA letter records both hands at one step. LOOP transformations
          combine those letters into speakable words that return to their start.
        </p>
      </article>
    </div>
    <p class="relationship-note">
      Both describe repeatable patterns using different units.
    </p>
  </section>

  <section id="watch" class="editorial-section" style="--accent: #a78bfa">
    <span class="section-kicker">See it in motion</span>
    <h2 class="section-title">CAPs on video, 2009 to now</h2>
    <div class="cap-media-grid">
      {#each MODERN_MEDIA as media (media.id)}
        <SourceVideoCard
          id={media.id}
          title={media.title}
          creator={media.creator}
          year={media.year}
          note={media.note}
        />
      {/each}
    </div>
    <p class="media-footnote">
      Charlie's series continues in the <a
        href="https://www.youtube.com/playlist?list=PLDE05D5E593C54AED"
        >full 9-Square Theory playlist</a
      >. Alien Jon's pattern playlist from the origin thread no longer resolves.
    </p>
  </section>

  <section id="sources" class="editorial-section" style="--accent: #94a3b8">
    <span class="section-kicker">Sources</span>
    <h2 class="section-title">Read the originals</h2>
    <ol class="sources-grid">
      <li>
        <span>Origin discussion</span>
        <a href={THREAD_URL}>“What are CAP's?”</a>
        <p>
          Home of Poi, ca. 2009. Coinage attribution, the OMCC account, Damien's
          framework, and the community debate.
        </p>
      </li>
      <li>
        <span>Mathematical framework</span>
        <a href={MATH_URL}>The Math of CAPs</a>
        <p>Damien's model and notation, preserved by DrexFactor.</p>
      </li>
      <li>
        <span>Curve references</span>
        <a href={MATHCURVE_URL}
          >Encyclopédie des formes mathématiques remarquables</a
        >
        <p>
          Robert Ferréol's mathematical curve encyclopedia supplied the animated
          illustrations Damien linked.
        </p>
      </li>
      <li>
        <span>C-CAP lesson</span>
        <a
          href="https://drexfactor.com/index.php?q=weirdscience%2F2012%2F08%2F21%2Fbasic_poi_dancing_tutorial_c_caps"
          >Basic Poi Dancing Tutorial: C-CAPs</a
        >
        <p>DrexFactor, 2012.</p>
      </li>
      <li>
        <span>Learner lesson</span>
        <a
          href="https://playpoi.com/learn/learning-caps-capped-antispin-patterns/"
          >Learning CAPs (Capped Antispin Patterns)</a
        >
        <p>Nick Woolsey, PlayPoi, 2016.</p>
      </li>
      <li>
        <span>Print reference</span>
        <strong>Encyclo-poi-dia Vol. 2</strong>
        <p>A print-era CAP chapter referenced in the origin thread.</p>
      </li>
    </ol>
  </section>
</div>

<style>
  .caps-editorial {
    --caps-surface: color-mix(
      in oklch,
      var(--theme-card-bg, #11151f) 92%,
      #0b1324
    );
  }

  :global(.caps-editorial code) {
    padding: 0.08em 0.35em;
    border-radius: 0.3rem;
    background: color-mix(in srgb, currentColor 8%, transparent);
    font-variant-numeric: tabular-nums;
  }

  #what-is,
  #math,
  #origin,
  #credits,
  #relationship,
  #watch,
  #sources,
  #breakdown {
    scroll-margin-top: 6rem;
  }

  .definition-duo {
    align-items: stretch;
  }

  .definition-demo {
    display: grid;
    place-items: center;
    min-width: 0;
    padding: clamp(1rem, 2.6vw, 2rem);
    border: 1px solid
      color-mix(in srgb, var(--accent) 25%, rgb(255 255 255 / 0.08));
    border-radius: clamp(1rem, 1rem + 0.6vw, 1.6rem);
    background:
      radial-gradient(
        circle at 50% 44%,
        rgb(56 189 248 / 0.12),
        transparent 56%
      ),
      var(--caps-surface);
  }

  .definition-demo :global(.assembly) {
    min-height: clamp(24rem, 46vw, 42rem);
  }

  .definition-copy {
    align-self: center;
  }

  .cap-credit,
  .atlas-credit {
    color: color-mix(in srgb, var(--theme-text-dim, #aab4c3) 86%, transparent);
    font-size: 0.88em;
  }

  .breakdown-title {
    margin: clamp(1.5rem, 2.4vw, 2.25rem) 0 0.75rem;
    color: var(--theme-text, #f8fafc);
    font-size: clamp(1.15rem, 1rem + 0.35vw, 1.5rem);
    letter-spacing: -0.015em;
  }

  .compact-list {
    margin-block: 0;
  }

  .compact-list li {
    margin-bottom: 0.55rem;
    font-size: clamp(0.92rem, 0.88rem + 0.16vw, 1.08rem);
    line-height: 1.5;
  }

  .math-heading {
    display: grid;
    grid-template-columns: minmax(0, 0.72fr) minmax(0, 1.28fr);
    align-items: start;
    gap: clamp(2rem, 5vw, 6rem);
    margin-bottom: clamp(2rem, 3.5vw, 3.75rem);
  }

  .math-heading .section-title {
    margin-bottom: 0;
  }

  .chronology {
    display: grid;
    gap: 0;
    margin: clamp(1.5rem, 2.5vw, 2.5rem) 0 0;
    padding: 0;
    list-style: none;
  }

  .chronology li {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.5rem;
    padding: clamp(1rem, 1.6vw, 1.5rem) 0;
    border-top: 1px solid rgb(255 255 255 / 0.08);
  }

  .chronology time {
    color: color-mix(in srgb, var(--accent) 76%, white);
    font-size: clamp(1rem, 0.9rem + 0.3vw, 1.3rem);
    font-weight: 760;
    font-variant-numeric: tabular-nums;
  }

  .chronology h3 {
    margin: 0 0 0.35rem;
    color: var(--theme-text, #f8fafc);
    font-size: clamp(1.05rem, 0.96rem + 0.24vw, 1.28rem);
  }

  .chronology p {
    margin: 0;
    color: var(--theme-text-dim, #aab4c3);
    font-size: clamp(0.92rem, 0.88rem + 0.14vw, 1.08rem);
    line-height: 1.6;
  }

  .credits-layout {
    display: grid;
    gap: clamp(1rem, 1.8vw, 1.5rem);
    margin-top: clamp(1.5rem, 2.4vw, 2.5rem);
  }

  .credit-primary,
  .credit-support article,
  .relationship-grid article,
  .sources-grid li {
    border: 1px solid rgb(255 255 255 / 0.09);
    background: color-mix(in oklch, var(--caps-surface) 94%, transparent);
  }

  .credit-primary {
    padding: clamp(1.25rem, 2.4vw, 2.25rem);
    border-color: color-mix(
      in srgb,
      var(--accent) 32%,
      rgb(255 255 255 / 0.08)
    );
    border-radius: 1rem;
    background:
      radial-gradient(circle at 0% 0%, rgb(56 189 248 / 0.12), transparent 44%),
      var(--caps-surface);
  }

  .credit-role,
  .sources-grid li > span,
  .relationship-grid article > span {
    color: color-mix(in srgb, var(--accent) 72%, white);
    font-size: 0.75rem;
    font-weight: 720;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .credit-primary h3 {
    margin: 0.35rem 0 0;
    color: var(--theme-text, #f8fafc);
    font-size: clamp(2rem, 1.5rem + 1.5vw, 3.6rem);
    letter-spacing: -0.04em;
  }

  .credit-primary .alias {
    margin: 0.1rem 0 1rem;
    color: color-mix(in srgb, var(--accent) 65%, white);
    font-size: 0.82rem;
  }

  .credit-primary > p:last-of-type,
  .credit-support p,
  .relationship-grid p,
  .sources-grid p {
    color: var(--theme-text-dim, #aab4c3);
    line-height: 1.58;
  }

  .credit-primary > p:last-of-type {
    margin: 0;
    font-size: clamp(0.95rem, 0.9rem + 0.16vw, 1.1rem);
  }

  .credit-links,
  .credit-support article {
    display: flex;
  }

  .credit-links {
    flex-wrap: wrap;
    gap: 0.55rem;
    margin-top: 1.25rem;
  }

  .credit-links a,
  .credit-support a {
    color: color-mix(in srgb, var(--accent) 72%, white);
    text-decoration: none;
  }

  .credit-links a {
    align-items: center;
    min-height: 44px;
    padding: 0.45rem 0.85rem;
    border: 1px solid rgb(255 255 255 / 0.14);
    border-radius: 999px;
    background: rgb(255 255 255 / 0.04);
  }

  .credit-support {
    display: grid;
    grid-template-columns: 1fr;
    gap: clamp(0.8rem, 1.2vw, 1.15rem);
  }

  .credit-support article {
    flex-direction: column;
    min-width: 0;
    padding: clamp(1rem, 1.6vw, 1.5rem);
    border-radius: 0.9rem;
  }

  .credit-support h3 {
    margin: 0 0 0.5rem;
    color: var(--theme-text, #f8fafc);
    font-size: clamp(1rem, 0.92rem + 0.22vw, 1.22rem);
  }

  .credit-support h3 span {
    color: var(--theme-text-dim, #aab4c3);
    font-size: 0.72em;
    font-weight: 500;
  }

  .credit-support p {
    margin: 0;
    font-size: clamp(0.86rem, 0.82rem + 0.12vw, 0.98rem);
  }

  .credit-support a {
    width: fit-content;
    margin-top: auto;
    padding-top: 0.8rem;
    font-size: 0.82rem;
    text-decoration: underline;
    text-underline-offset: 0.2rem;
  }

  .credit-footnote,
  .relationship-note,
  .media-footnote {
    margin: 1.25rem 0 0;
    color: var(--theme-text-dim, #aab4c3);
    font-size: clamp(0.88rem, 0.84rem + 0.12vw, 1rem);
    line-height: 1.55;
  }

  .relationship-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: clamp(0.85rem, 1.5vw, 1.35rem);
    margin-top: clamp(1.5rem, 2.4vw, 2.5rem);
  }

  .relationship-grid article {
    padding: clamp(1.15rem, 2vw, 2rem);
    border-radius: 1rem;
  }

  .relationship-grid h3 {
    margin: 0.35rem 0 0.6rem;
    color: var(--theme-text, #f8fafc);
    font-size: clamp(1.2rem, 1rem + 0.5vw, 1.7rem);
  }

  .relationship-grid p {
    margin: 0;
    font-size: clamp(0.92rem, 0.88rem + 0.14vw, 1.06rem);
  }

  .cap-media-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: clamp(1rem, 1.5vw, 1.5rem);
    margin-top: clamp(1.5rem, 2.4vw, 2.5rem);
  }

  .media-footnote a {
    color: color-mix(in srgb, var(--accent) 74%, white);
  }

  .sources-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: clamp(0.8rem, 1.2vw, 1.1rem);
    margin: clamp(1.5rem, 2.4vw, 2.5rem) 0 0;
    padding: 0;
    list-style: none;
    counter-reset: sources;
  }

  .sources-grid li {
    position: relative;
    min-width: 0;
    padding: clamp(1rem, 1.5vw, 1.4rem);
    border-radius: 0.85rem;
    counter-increment: sources;
  }

  .sources-grid li::after {
    content: counter(sources, decimal-leading-zero);
    position: absolute;
    top: 0.75rem;
    right: 0.85rem;
    color: rgb(255 255 255 / 0.12);
    font-size: 1.5rem;
    font-weight: 760;
    font-variant-numeric: tabular-nums;
  }

  .sources-grid a,
  .sources-grid strong {
    display: block;
    width: fit-content;
    max-width: calc(100% - 2rem);
    margin-top: 0.45rem;
    color: var(--theme-text, #f8fafc);
    font-size: clamp(0.94rem, 0.9rem + 0.12vw, 1.06rem);
    font-weight: 680;
  }

  .sources-grid a {
    text-decoration-color: color-mix(in srgb, var(--accent) 48%, transparent);
    text-underline-offset: 0.22rem;
  }

  .sources-grid p {
    margin: 0.5rem 0 0;
    font-size: clamp(0.82rem, 0.79rem + 0.1vw, 0.93rem);
  }

  @media (min-width: 48rem) {
    .credit-support,
    .sources-grid,
    .relationship-grid,
    .cap-media-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 68rem) {
    .math-heading {
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }
  }

  @media (min-width: 105rem) {
    .chronology li {
      grid-template-columns: 8rem minmax(0, 1fr);
      gap: clamp(2rem, 4vw, 5rem);
      align-items: baseline;
    }

    .credits-layout {
      grid-template-columns: minmax(24rem, 0.78fr) minmax(0, 1.52fr);
    }

    .cap-media-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 37.5rem) {
    .definition-demo {
      padding: 0.75rem;
    }

    .definition-demo :global(.assembly) {
      min-height: 22rem;
    }
  }
</style>
