<script lang="ts">
  import Seo from "$lib/shared/components/Seo.svelte";
  import PositionTrioGrid from "$lib/shared/landing/components/PositionTrioGrid.svelte";
  import "$lib/shared/landing/styles/public-editorial.css";

  const TITLE = "About The Kinetic Alphabet";
  const DESCRIPTION =
    "The Kinetic Alphabet (TKA) is a notation system for flow arts. Learn what TKA is, how it works, and why it exists.";
  const URL = "https://tkaflowarts.com/about";
  const PERSON_ID = `${URL}#austen-cloud`;

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
          "A pictographic notation system for flow arts choreography. Every pair of grid placements is given a letter, so a sequence of movement can be written down, read back, and searched as a word.",
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

  const pathways = [
    {
      label: "Guide",
      title: "Learn the notation",
      copy: "Start with the grid, hand placements, motions, letters, and words.",
      href: "/guide",
    },
    {
      label: "History",
      title: "Trace the notation",
      copy: "Read the sourced chronology of systems used to write flow arts down.",
      href: "/history",
    },
    {
      label: "Software",
      title: "Tour Flow Arts Composer",
      copy: "See the tools for building, generating, animating, saving, and sharing choreography.",
      href: "/composer",
    },
    {
      label: "Answers",
      title: "Read common questions",
      copy: "Get direct answers about learning TKA, supported props, sharing, and cost.",
      href: "/faq",
    },
  ];

  const pictographParts = [
    {
      term: "Position",
      description: "Where each hand begins and ends on the grid.",
    },
    {
      term: "Path",
      description: "How each hand moves between those points.",
    },
    {
      term: "Rotation",
      description: "How the props turn during the step.",
    },
  ];
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
      <span class="eyebrow">What is TKA?</span>
      <h1>The Kinetic Alphabet</h1>
      <p class="hero-lede">
        The Kinetic Alphabet is a notation system for flow arts.
      </p>
      <p class="hero-body">
        One pictograph keeps the hand positions, hand paths, and prop rotations
        for a movement step together. Put the pictographs in order and the
        choreography can be read again.
      </p>
      <a class="resource-chip hero-link" href="#how-it-reads">
        See how a pictograph reads
      </a>
    </div>

    <div class="placement-shell" aria-labelledby="placement-heading">
      <span class="proof-label">Start with placement</span>
      <h2 id="placement-heading">The relationship between the hands</h2>
      <p>
        Alpha places the hands opposite each other. Beta puts both hands at the
        same point. Gamma makes a right angle.
      </p>
      <PositionTrioGrid />
    </div>
  </header>

  <section
    id="how-it-reads"
    class="reading-band"
    aria-labelledby="reading-heading"
  >
    <div class="reading-copy">
      <span class="section-kicker">One step at a time</span>
      <h2 id="reading-heading">A pictograph keeps the movement together.</h2>
      <p>
        The grid and arrows carry the information that would otherwise be
        scattered across a video, a rehearsal note, and somebody's memory.
        Letters give common combinations a short name, but the picture remains
        readable on its own.
      </p>
    </div>

    <dl class="pictograph-parts">
      {#each pictographParts as part}
        <div>
          <dt>{part.term}</dt>
          <dd>{part.description}</dd>
        </div>
      {/each}
    </dl>
  </section>

  <section class="pathways" aria-labelledby="pathways-heading">
    <div class="pathways-heading">
      <span class="section-kicker">Choose what comes next</span>
      <h2 id="pathways-heading">Go straight to the part you need.</h2>
      <p>
        The rest of the site separates learning, history, software, and quick
        answers.
      </p>
    </div>

    <div class="pathway-grid">
      {#each pathways as pathway}
        <a class="resource-chip pathway-card" href={pathway.href}>
          <span class="pathway-label">{pathway.label}</span>
          <strong>{pathway.title}</strong>
          <span class="pathway-copy">{pathway.copy}</span>
        </a>
      {/each}
    </div>
  </section>

  <section
    id="austen-cloud"
    class="creator-band"
    aria-labelledby="creator-heading"
  >
    <div class="creator-copy">
      <span class="section-kicker">About the project</span>
      <h2 id="creator-heading">Built by Austen Cloud</h2>
      <p>
        The Kinetic Alphabet and Flow Arts Composer are developed by Austen
        Cloud. The project received a 2024–25 Seed Fund grant from Fund the Flow
        Arts.
      </p>
      <p class="project-date">Created in 2022. Development continues.</p>
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
      <span class="section-kicker">Make something</span>
      <h2 id="composer-heading">Open Composer in your browser.</h2>
      <p>Flow Arts Composer is free to use. No download required.</p>
    </div>
    <a href="/create" class="resource-chip composer-link" data-sveltekit-reload>
      Open Flow Arts Composer
    </a>
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
  .proof-label,
  .pathway-label {
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
    max-width: 32ch;
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
  .placement-shell p,
  .reading-copy p,
  .pathways-heading p,
  .creator-copy p,
  .composer-endcap p {
    color: var(--about-muted);
    font-size: clamp(1rem, 0.96rem + 0.12vw, 1.12rem);
    line-height: 1.65;
  }

  .hero-body {
    max-width: 54ch;
    margin: 1rem 0 1.5rem;
  }

  .about-page :global(.resource-chip) {
    min-height: var(--min-touch-target, 44px);
  }

  .hero-link {
    width: fit-content;
  }

  .placement-shell {
    min-width: 0;
    padding: 1.4rem;
    border: 1px solid var(--about-stroke);
    border-radius: 1.25rem;
    background: var(--about-surface);
  }

  .placement-shell h2 {
    max-width: 18ch;
    margin: 0.5rem 0 0.7rem;
    font-family: var(
      --landing-heading-font,
      "Playfair Display",
      Georgia,
      serif
    );
    font-size: clamp(1.65rem, 1.4rem + 0.65vw, 2.4rem);
    font-weight: 500;
    letter-spacing: -0.025em;
    line-height: 1.08;
  }

  .placement-shell p {
    max-width: 46ch;
    margin: 0;
  }

  .placement-shell :global(.position-grid) {
    width: 100%;
    margin: 1.5rem 0 0;
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
  .pathways-heading,
  .creator-copy {
    padding-inline: 0.35rem;
  }

  .reading-copy h2,
  .pathways-heading h2,
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
  .pathways-heading p,
  .creator-copy p {
    max-width: 58ch;
    margin: 0;
  }

  .pictograph-parts {
    margin: 0;
    border-top: 1px solid var(--about-stroke);
  }

  .pictograph-parts div {
    display: grid;
    gap: 0.4rem;
    padding: 1.15rem 0.35rem;
    border-bottom: 1px solid var(--about-stroke);
  }

  .pictograph-parts dt {
    color: var(--about-text);
    font-size: 1rem;
    font-weight: 700;
  }

  .pictograph-parts dd {
    margin: 0;
    color: var(--about-muted);
    font-size: 0.95rem;
    line-height: 1.5;
  }

  .pathways {
    padding: 3.5rem 0;
    border-bottom: 1px solid var(--about-stroke);
  }

  .pathways-heading {
    margin-bottom: 2rem;
  }

  .pathway-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .about-page :global(.pathway-card) {
    display: flex;
    min-height: 7.5rem;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    gap: 0.45rem;
    padding: 1rem;
    border-radius: 1rem;
    white-space: normal;
  }

  .pathway-card strong {
    margin-top: auto;
    color: var(--about-text);
    font-family: var(
      --landing-heading-font,
      "Playfair Display",
      Georgia,
      serif
    );
    font-size: 1.12rem;
    font-weight: 500;
    line-height: 1.15;
  }

  .pathway-copy {
    display: none;
    color: var(--about-muted);
    font-size: 0.9rem;
    line-height: 1.45;
  }

  .creator-band {
    align-items: end;
  }

  .project-date {
    margin-top: 1rem !important;
    font-size: 0.9rem !important;
  }

  .creator-links {
    align-content: end;
    margin: 0;
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

    .placement-shell {
      padding: clamp(1.5rem, 2.5cqw, 2.5rem);
    }

    .reading-band,
    .composer-endcap {
      grid-template-columns: minmax(0, 0.9fr) minmax(22rem, 1.1fr);
      gap: clamp(3rem, 7cqw, 8rem);
      padding: clamp(4rem, 6cqw, 7rem) clamp(1rem, 2.5cqw, 3rem);
    }

    .creator-band {
      padding: clamp(4rem, 6cqw, 7rem) clamp(1rem, 2.5cqw, 3rem);
    }

    .pictograph-parts {
      align-self: center;
    }

    .pictograph-parts div {
      grid-template-columns: minmax(7rem, 0.35fr) minmax(0, 0.65fr);
      align-items: baseline;
      gap: 1.25rem;
    }

    .pathways {
      padding: clamp(4rem, 6cqw, 7rem) clamp(1rem, 2.5cqw, 3rem);
    }

    .pathways-heading {
      display: grid;
      grid-template-columns: minmax(0, 0.85fr) minmax(20rem, 1.15fr);
      column-gap: clamp(3rem, 7cqw, 8rem);
      align-items: end;
    }

    .pathways-heading .section-kicker {
      grid-column: 1 / -1;
    }

    .pathways-heading h2 {
      margin-bottom: 0;
    }

    .pathway-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1rem;
    }

    .about-page :global(.pathway-card) {
      min-height: 10.5rem;
      padding: 1.25rem;
    }

    .pathway-card strong {
      font-size: 1.35rem;
    }

    .pathway-copy {
      display: block;
    }

    .creator-links {
      justify-content: flex-start;
    }

    .composer-endcap {
      grid-template-columns: minmax(0, 1fr) max-content;
    }

    .composer-link {
      justify-self: end;
    }
  }

  @container about-page (min-width: 64rem) {
    .creator-band {
      grid-template-columns: minmax(0, 0.9fr) minmax(22rem, 1.1fr);
      gap: clamp(3rem, 7cqw, 8rem);
    }
  }

  @container about-page (min-width: 90rem) {
    .pathway-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @media (min-width: 1680px) {
    .placement-shell :global(.position-grid) {
      width: 100%;
      margin: 2rem 0 0;
      gap: 1.5rem;
    }

    .placement-shell :global(.position-image-container) {
      max-width: 12rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .about-page :global(.resource-chip) {
      transition: none;
    }
  }
</style>
