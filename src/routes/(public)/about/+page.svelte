<script lang="ts">
  import Seo from "$lib/shared/components/Seo.svelte";
  import SequenceHeroDemo from "$lib/shared/landing/components/SequenceHeroDemo.svelte";
  import demoJson from "$lib/shared/landing/data/demo-sequence.json";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import "$lib/shared/landing/styles/public-editorial.css";

  const TITLE = "About The Kinetic Alphabet";
  const DESCRIPTION =
    "The Kinetic Alphabet (TKA) is a pictographic notation system for flow arts choreography. Flow Arts Composer is the browser app for using it.";
  const URL = "https://tkaflowarts.com/about";
  const PERSON_ID = `${URL}#austen-cloud`;
  const demoSequence = demoJson as unknown as SequenceData;

  const pageJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "AboutPage",
        "@id": `${URL}#about-page`,
        name: TITLE,
        url: URL,
        description: DESCRIPTION,
        inLanguage: "en-US",
        mainEntity: { "@id": "https://tkaflowarts.com/#tka" },
        isPartOf: { "@id": "https://tkaflowarts.com/#website" },
      },
      // The one node a summarizer quotes when asked "what is the Kinetic
      // Alphabet." It has to say what TKA is built around in TKA's own terms —
      // absent that, models synthesize an answer out of the site's nav, which
      // is how "built around the Shape Matrix and CAPs notation" happened. The
      // description is the notation catalog's own sourced TKA line
      // ($lib/shared/notation/notation-catalog.ts, entry `tka`).
      {
        "@type": "Thing",
        "@id": "https://tkaflowarts.com/#tka",
        name: "The Kinetic Alphabet",
        alternateName: "TKA",
        description:
          "A pictographic notation system for flow arts choreography. Each picture records a movement step; together they record a sequence.",
        disambiguatingDescription:
          "Created by Austen Cloud in 2022. The Kinetic Alphabet is its own system and is not built on, derived from, or an extension of the other flow arts notations documented on this site. The Shape Matrix, CAPs, the Vulcan Tech Gospel, QFT Notation and the rest are separate works by other authors, archived and credited at /history.",
        dateCreated: "2022",
        creator: { "@id": PERSON_ID },
      },
      {
        "@type": "Person",
        "@id": PERSON_ID,
        name: "Austen Cloud",
        url: `${URL}#austen-cloud`,
        award: "2024–25 Seed Fund grant recipient for The Kinetic Alphabet",
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${URL}#breadcrumb`,
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
            name: "About",
            item: URL,
          },
        ],
      },
    ],
  }).replace(/</g, "\\u003c");
</script>

<Seo
  title={TITLE}
  description={DESCRIPTION}
  canonical={URL}
  ogType="article"
  ogImageAlt="The Kinetic Alphabet pictographs"
>
  {@html `<script type="application/ld+json">${pageJsonLd}</script>`}
</Seo>

<main class="about-page" id="main-content">
  <header class="about-hero">
    <div class="hero-copy">
      <span class="eyebrow">About the project</span>
      <h1>What is The Kinetic Alphabet?</h1>
      <p class="hero-lede">
        The Kinetic Alphabet is a way to write flow arts choreography in
        pictures.
      </p>
      <p class="hero-body">
        Each picture records a movement step. Put them together to record a
        sequence. Flow Arts Composer is the browser app for composing, playing,
        and sharing sequences in this notation.
      </p>
      <a class="resource-chip hero-link" href="/composer">
        Explore Flow Arts Composer
      </a>
    </div>

    <div id="how-it-reads" class="artifact-shell">
      <span class="proof-label">A sequence in TKA notation</span>
      <SequenceHeroDemo
        sequence={demoSequence}
        note="Select play to watch the sequence."
        showNotationStrip={true}
        preserveNotationStrip={true}
        autoPlay={false}
        cornerToggle={true}
        showCaption={false}
        loadPriority="immediate"
      />
      <p class="artifact-caption">
        Press play to see the movement beside its notation.
      </p>
    </div>
  </header>

  <section class="reading-band" aria-labelledby="reading-heading">
    <div class="reading-copy">
      <span class="section-kicker">Purpose</span>
      <h2 id="reading-heading">Keep the structure close at hand.</h2>
      <p>
        A video can show a performance. TKA gives a sequence a form you can
        return to, change, compare, and pass along.
      </p>
      <p>
        Keep a phrase you want to practice, then change a step in Composer and
        watch how the sequence changes.
      </p>
    </div>

    <div class="scope-copy">
      <span class="section-kicker">Scope</span>
      <h2>Built around double staves.</h2>
      <p>
        TKA also applies to paired static props such as fans, clubs, and
        buugeng. Tosses, contact rolling, grip changes, and momentum-based props
        are outside that core scope. A prop visual in Composer does not mean
        every sequence can be performed with it.
      </p>
      <div class="resource-row scope-links">
        <a href="/faq" class="resource-chip">Read common questions</a>
        <a href="/history" class="quiet-link">Read the notation history</a>
      </div>
    </div>
  </section>

  <section
    id="austen-cloud"
    class="creator-band"
    aria-labelledby="creator-heading"
  >
    <div class="creator-copy">
      <span class="section-kicker">Creator and project</span>
      <h2 id="creator-heading">Created by Austen Cloud in 2022.</h2>
      <p>
        The Kinetic Alphabet and Flow Arts Composer are developed by Austen
        Cloud. The project received a 2024–25 Seed Fund grant from Fund the Flow
        Arts.
      </p>
    </div>
    <div class="resource-row creator-links">
      <a
        href="https://fundtheflowarts.org/announcing-2024-25-seed-fund-grant-recipients/"
        class="resource-chip"
        rel="noopener noreferrer">Seed Fund announcement</a
      >
      <a href="mailto:support@tkaflowarts.com" class="resource-chip"
        >Email support</a
      >
    </div>
  </section>

  <section class="composer-endcap" aria-labelledby="composer-heading">
    <div>
      <span class="section-kicker">Next step</span>
      <h2 id="composer-heading">See what Flow Arts Composer can do.</h2>
      <p>
        Tour the tools, learn the notation, or open the app when you are ready.
      </p>
    </div>
    <div class="next-links">
      <a href="/composer" class="resource-chip composer-link"
        >Explore Flow Arts Composer</a
      >
      <a href="/guide" class="resource-chip">Read the Guide</a>
      <a href="/create" class="quiet-link" data-sveltekit-reload>Open the app</a
      >
    </div>
  </section>
</main>

<style>
  .about-page {
    --about-text: var(--theme-text, oklch(0.96 0.01 275));
    --about-muted: var(--theme-text-secondary, oklch(0.71 0.025 275));
    --about-stroke: var(--theme-stroke, oklch(0.78 0.02 275 / 0.16));
    --about-surface: color-mix(
      in oklch,
      var(--theme-card-bg, oklch(0.15 0.025 275)) 82%,
      transparent
    );
    --about-accent: oklch(0.72 0.16 285);
    container: about-page / inline-size;
    width: min(var(--shell-w, 107.5rem), calc(100% - 1.25rem));
    margin: 0 auto;
    padding: 5.25rem 0 0;
    color: var(--about-text);
  }

  .about-hero {
    display: grid;
    gap: 2rem;
    align-items: center;
    padding: 2.5rem 0 3.5rem;
    border-bottom: 1px solid var(--about-stroke);
  }

  .hero-copy {
    padding-inline: 0.35rem;
  }

  .eyebrow,
  .section-kicker,
  .proof-label {
    display: block;
    color: var(--about-muted);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 720;
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }

  .about-hero h1 {
    max-width: 12ch;
    margin: 0.55rem 0 1rem;
    font-family: var(--page-title-font, "Fraunces", Georgia, serif);
    font-size: clamp(2.75rem, 2.1rem + 3vw, 6rem);
    font-style: italic;
    font-variation-settings:
      "opsz" 144,
      "wght" 700,
      "SOFT" 0,
      "WONK" 1;
    font-weight: 700;
    letter-spacing: -0.045em;
    line-height: 0.95;
    text-wrap: balance;
  }

  .hero-lede {
    margin: 0;
    color: var(--about-text);
    font-family: var(
      --landing-heading-font,
      "Playfair Display",
      Georgia,
      serif
    );
    font-size: clamp(1.35rem, 1.15rem + 0.65vw, 2rem);
    line-height: 1.25;
  }

  .hero-body,
  .reading-copy p,
  .scope-copy p,
  .creator-copy p,
  .composer-endcap p {
    color: var(--about-muted);
    font-size: clamp(1rem, 0.96rem + 0.12vw, 1.12rem);
    line-height: 1.65;
  }

  .hero-body {
    margin: 1rem 0 1.5rem;
  }

  .about-page :global(.resource-chip) {
    min-height: var(--min-touch-target, 44px);
  }

  .hero-link {
    width: fit-content;
  }

  .artifact-shell {
    min-width: 0;
    padding: 0.35rem;
  }

  .artifact-shell :global(.hero-demo) {
    --hero-demo-max-width: min(32rem, 100%);
    margin-top: 0.65rem;
  }

  .artifact-caption {
    margin: 0.5rem 0 0;
    color: var(--about-muted);
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.5;
    text-align: center;
  }

  .reading-band,
  .creator-band,
  .composer-endcap {
    display: grid;
    gap: 2rem;
    padding: 3.5rem 0;
    border-bottom: 1px solid var(--about-stroke);
  }

  .reading-band {
    scroll-margin-top: 5rem;
  }

  .reading-copy,
  .scope-copy,
  .creator-copy {
    padding-inline: 0.35rem;
  }

  .reading-copy h2,
  .scope-copy h2,
  .creator-copy h2,
  .composer-endcap h2 {
    max-width: 16ch;
    margin: 0.55rem 0 1rem;
    font-family: var(
      --landing-heading-font,
      "Playfair Display",
      Georgia,
      serif
    );
    font-size: clamp(2rem, 1.7rem + 0.9vw, 3.25rem);
    font-weight: 500;
    letter-spacing: -0.035em;
    line-height: 1.04;
  }

  .reading-copy p,
  .scope-copy p,
  .creator-copy p {
    margin: 0;
  }

  .creator-band {
    align-items: end;
  }

  .creator-links {
    align-content: end;
    margin: 0;
  }

  .scope-links {
    align-items: center;
    margin-bottom: 0;
  }

  .composer-endcap {
    align-items: center;
    padding-bottom: 1.25rem;
    border-bottom: 0;
  }

  .composer-endcap h2 {
    margin-bottom: 0.7rem;
  }

  .composer-endcap p {
    margin: 0;
  }

  .next-links {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
  }

  .quiet-link {
    min-height: var(--min-touch-target, 44px);
    padding: 0.55rem 0.25rem;
    color: var(--about-muted);
    font-size: var(--font-size-min, 0.875rem);
  }

  .about-page :global(.composer-link) {
    width: fit-content;
    justify-content: center;
    padding-inline: 1.25rem;
    border-color: color-mix(in oklch, var(--about-accent) 62%, transparent);
    background: color-mix(
      in oklch,
      var(--about-accent) 24%,
      var(--about-surface)
    );
    color: var(--about-text);
    font-weight: 720;
  }

  @container about-page (min-width: 48rem) {
    .about-hero {
      grid-template-columns: minmax(0, 0.78fr) minmax(28rem, 1.22fr);
      gap: clamp(3rem, 6cqw, 7rem);
      min-height: min(46rem, calc(100svh - 4rem));
      padding: 4rem clamp(1rem, 2.5cqw, 3rem);
    }

    .reading-band,
    .creator-band,
    .composer-endcap {
      grid-template-columns: minmax(0, 0.9fr) minmax(22rem, 1.1fr);
      gap: clamp(3rem, 7cqw, 8rem);
      padding: clamp(4rem, 6cqw, 7rem) clamp(1rem, 2.5cqw, 3rem);
    }

    .creator-links {
      justify-content: flex-start;
    }

    .composer-endcap {
      grid-template-columns: minmax(0, 1fr) minmax(20rem, max-content);
    }

    .composer-link {
      justify-self: end;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .about-page :global(.resource-chip) {
      transition: none;
    }
  }
</style>
