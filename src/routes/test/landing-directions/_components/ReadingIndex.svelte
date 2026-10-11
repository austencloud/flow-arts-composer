<script lang="ts">
  import SequenceHeroDemo from "#lib/shared/landing/components/SequenceHeroDemo.svelte";
  import demoJson from "#lib/shared/landing/data/demo-sequence.json";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  const demoSequence = demoJson as unknown as SequenceData;

  const indexEntries = [
    { number: "01", href: "#reading-notation", label: "Notation" },
    { number: "02", href: "#reading-composer", label: "Composer" },
    { number: "03", href: "#reading-origins", label: "Origins" },
    { number: "04", href: "#reading-library", label: "Library" },
  ];

  const libraryGroups = [
    {
      label: "Read",
      links: [
        {
          href: "/learn/staff-spinning-choreography",
          section: "Article",
          title: "Staff choreography",
          copy: "A practical introduction to phrases and transitions.",
        },
        {
          href: "/about",
          section: "Project",
          title: "About TKA",
          copy: "Who made the project and why it exists.",
        },
        {
          href: "/faq",
          section: "Reference",
          title: "Questions",
          copy: "Direct answers about TKA and Flow Arts Composer.",
        },
      ],
    },
    {
      label: "Explore",
      links: [
        {
          href: "/shape-engine",
          section: "Live table",
          title: "The 144 shape matrix",
          copy: "Lorq Nichols charted it in 2012. TKA draws every cell live.",
        },
        {
          href: "/atlas",
          section: "Reference",
          title: "Glossary",
          copy: "The vocabulary behind the notation and the app.",
        },
        {
          href: "/shop",
          section: "Physical",
          title: "Choreography cards",
          copy: "Hold the notation, arrange it, and teach from it.",
        },
      ],
    },
  ];
</script>

<main class="reading-page" id="main-content">
  <header class="reading-header">
    <span class="edition">TKA · Reading room</span>
    <h1>Start anywhere.<br />The system connects.</h1>
    <p>
      The Kinetic Alphabet is a notation system with its own Composer. It also
      keeps a record of the ideas that came before.
    </p>
  </header>

  <div class="reading-layout">
    <aside class="reading-nav">
      <span class="nav-title">Contents</span>
      <nav aria-label="Reading room contents">
        {#each indexEntries as entry}
          <a href={entry.href}>
            <span>{entry.number}</span>
            <strong>{entry.label}</strong>
          </a>
        {/each}
      </nav>
      <a class="open-button" href="/composer">Open the Composer</a>
    </aside>

    <div class="reading-content">
      <section
        class="lead-story"
        id="reading-notation"
        aria-labelledby="reading-notation-title"
      >
        <div class="story-copy">
          <span class="story-meta">01 · Notation</span>
          <h2 id="reading-notation-title">Movement can be read.</h2>
          <p class="story-deck">
            A pictograph records where the props begin and finish, plus the path
            between those points. Put the beats in order and a sequence becomes
            a score.
          </p>
          <a class="story-button" href="/notation">Read Flow Arts Notation</a>
        </div>

        <div class="story-demo">
          <SequenceHeroDemo
            sequence={demoSequence}
            note="the score playing back"
          />
        </div>
      </section>

      <section
        class="index-story composer-story"
        id="reading-composer"
        aria-labelledby="reading-composer-title"
      >
        <span class="story-meta">02 · Composer</span>
        <div class="index-story-grid">
          <h2 id="reading-composer-title">Write it and watch it move.</h2>
          <div>
            <p>
              Flow Arts Composer handles the bookkeeping around a sequence so
              the spinner can make choices. Build, generate, animate, multiply,
              save, and share from the same notation.
            </p>
            <a class="story-button" href="/composer">Meet Flow Arts Composer</a>
          </div>
        </div>
      </section>

      <section
        class="index-story origins-story"
        id="reading-origins"
        aria-labelledby="reading-origins-title"
      >
        <span class="story-meta">03 · Origins</span>
        <div class="index-story-grid">
          <h2 id="reading-origins-title">
            Built inside a longer conversation.
          </h2>
          <div>
            <p>
              Timing and direction came from spinner vocabulary. Position drew
              from earlier diagrams. Music and juggling offered other ways to
              think about a phrase. The software has a lineage of its own.
            </p>
            <div class="story-actions">
              <a class="story-button" href="/notation"
                >Read the notation history</a
              >
              <a class="story-button quiet" href="/roots/software"
                >See the software lineage</a
              >
            </div>
          </div>
        </div>
      </section>

      <section
        class="library"
        id="reading-library"
        aria-labelledby="reading-library-title"
      >
        <div class="library-heading">
          <span class="story-meta">04 · Library</span>
          <h2 id="reading-library-title">Keep going.</h2>
        </div>

        {#each libraryGroups as group}
          <div class="library-group">
            <h3 class="group-label">{group.label}</h3>
            <div class="library-grid">
              {#each group.links as link}
                <a href={link.href}>
                  <span class="library-type">{link.section}</span>
                  <strong>{link.title}</strong>
                  <small>{link.copy}</small>
                  <span class="library-arrow" aria-hidden="true">↗</span>
                </a>
              {/each}
            </div>
          </div>
        {/each}
      </section>
    </div>
  </div>
</main>

<style>
  .reading-page {
    --reading-text: var(--theme-text, oklch(0.97 0.01 275));
    --reading-muted: var(--theme-text-secondary, oklch(0.71 0.02 275));
    --reading-stroke: var(--theme-stroke, oklch(0.75 0.02 275 / 0.2));
    --reading-surface: color-mix(
      in oklch,
      var(--theme-card-bg, oklch(0.15 0.025 275)) 76%,
      transparent
    );
    --reading-accent: oklch(0.72 0.16 285);
    width: min(112rem, calc(100% - 3rem));
    margin: 0 auto;
    padding: clamp(4rem, 7vw, 8rem) clamp(1rem, 2.5vw, 3rem)
      clamp(5rem, 8vw, 9rem);
    color: var(--reading-text);
    container-type: inline-size;
  }

  .reading-header {
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(20rem, 0.55fr);
    column-gap: clamp(3rem, 7vw, 9rem);
    align-items: end;
    padding: clamp(2rem, 4vw, 4.5rem) 0 clamp(3rem, 5vw, 5rem);
    border-bottom: 1px solid var(--reading-stroke);
  }

  .edition {
    grid-column: 1 / -1;
    margin-bottom: 1.25rem;
    color: var(--reading-muted);
    font-size: 0.76rem;
    font-weight: 720;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .reading-header h1 {
    margin: 0;
    font-family: var(--page-title-font, "Fraunces", Georgia, serif);
    font-size: clamp(3.2rem, 2.3rem + 2.2vw, 5.8rem);
    font-style: italic;
    font-variation-settings:
      "opsz" 144,
      "wght" 700,
      "SOFT" 0,
      "WONK" 1;
    font-weight: 700;
    letter-spacing: -0.045em;
    line-height: 0.94;
  }

  .reading-header p {
    max-width: 42ch;
    margin: 0;
    color: var(--reading-muted);
    font-size: clamp(1rem, 0.96rem + 0.2vw, 1.2rem);
    line-height: 1.62;
  }

  .reading-layout {
    display: grid;
    grid-template-columns: minmax(13rem, 0.24fr) minmax(0, 0.76fr);
    gap: clamp(2.5rem, 6vw, 8rem);
    align-items: start;
  }

  .reading-nav {
    position: sticky;
    top: 160px;
    padding-top: clamp(2.5rem, 4vw, 4rem);
  }

  .nav-title,
  .story-meta,
  .library-type {
    color: var(--reading-muted);
    font-size: 0.73rem;
    font-variant-numeric: tabular-nums;
    font-weight: 720;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .reading-nav nav {
    margin: 0.75rem 0 1.5rem;
    border-top: 1px solid var(--reading-stroke);
  }

  .reading-nav nav a {
    display: grid;
    grid-template-columns: 2.2rem 1fr;
    align-items: center;
    min-height: 52px;
    border-bottom: 1px solid var(--reading-stroke);
    color: var(--reading-muted);
    text-decoration: none;
    transition:
      color 160ms ease,
      padding-left 160ms ease;
  }

  .reading-nav nav a:hover {
    padding-left: 0.35rem;
    color: var(--reading-text);
  }

  .reading-nav nav a span {
    font-size: 0.68rem;
    font-variant-numeric: tabular-nums;
  }

  .reading-nav nav a strong {
    font-size: 0.86rem;
    font-weight: 620;
  }

  .open-button,
  .story-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 46px;
    padding: 0.7rem 1rem;
    border: 1px solid
      color-mix(in oklch, var(--reading-accent) 48%, transparent);
    border-radius: 9px;
    background: color-mix(
      in oklch,
      var(--reading-accent) 18%,
      var(--reading-surface)
    );
    color: var(--reading-text);
    font-size: 0.9rem;
    font-weight: 680;
    text-decoration: none;
    transition:
      background 160ms ease,
      border-color 160ms ease,
      transform 160ms ease;
  }

  .open-button {
    width: 100%;
  }

  .open-button:hover,
  .story-button:hover {
    border-color: color-mix(in oklch, var(--reading-accent) 72%, transparent);
    background: color-mix(
      in oklch,
      var(--reading-accent) 27%,
      var(--reading-surface)
    );
    transform: translateY(-1px);
  }

  .reading-content {
    min-width: 0;
  }

  .lead-story {
    display: grid;
    grid-template-columns: minmax(0, 0.92fr) minmax(21rem, 1.08fr);
    gap: clamp(2.5rem, 5vw, 6rem);
    align-items: center;
    min-height: clamp(34rem, 60vh, 48rem);
    padding: clamp(3rem, 5vw, 5.5rem) 0;
    border-bottom: 1px solid var(--reading-stroke);
    scroll-margin-top: 10rem;
  }

  .story-copy h2,
  .index-story h2,
  .library-heading h2 {
    max-width: 13ch;
    margin: 0.7rem 0 1.2rem;
    font-family: var(
      --landing-heading-font,
      "Playfair Display",
      Georgia,
      serif
    );
    font-size: clamp(2.25rem, 1.8rem + 1vw, 3.5rem);
    font-weight: 500;
    letter-spacing: -0.035em;
    line-height: 1.04;
  }

  .story-deck,
  .index-story p {
    max-width: 50ch;
    margin: 0 0 1.6rem;
    color: var(--reading-muted);
    font-size: clamp(1rem, 0.96rem + 0.16vw, 1.15rem);
    line-height: 1.65;
  }

  .story-demo {
    width: min(100%, 36rem);
    justify-self: end;
  }

  .story-demo :global(.hero-demo) {
    margin-top: 0;
  }

  .index-story {
    padding: clamp(3.5rem, 5vw, 5.5rem) 0;
    border-bottom: 1px solid var(--reading-stroke);
    scroll-margin-top: 10rem;
  }

  .index-story-grid {
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(20rem, 1.1fr);
    gap: clamp(2.5rem, 6vw, 7rem);
    align-items: start;
  }

  .index-story h2 {
    margin-bottom: 0;
  }

  .story-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.7rem;
  }

  .story-button.quiet {
    border-color: var(--reading-stroke);
    background: var(--reading-surface);
  }

  .library {
    padding: clamp(3.5rem, 5vw, 5.5rem) 0 0;
    scroll-margin-top: 10rem;
  }

  .library-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 2rem;
    margin-bottom: 1.5rem;
  }

  .library-heading h2 {
    margin: 0;
    font-size: clamp(2rem, 1.7rem + 0.7vw, 2.8rem);
  }

  .library-group + .library-group {
    margin-top: 2.4rem;
  }

  .group-label {
    margin: 0 0 0.7rem;
    color: var(--reading-muted);
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .library-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border-top: 1px solid var(--reading-stroke);
    border-left: 1px solid var(--reading-stroke);
  }

  .library-grid a {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 14rem;
    padding: 1.3rem;
    border-right: 1px solid var(--reading-stroke);
    border-bottom: 1px solid var(--reading-stroke);
    background: color-mix(in oklch, var(--reading-surface) 58%, transparent);
    color: var(--reading-text);
    text-decoration: none;
    transition:
      background 160ms ease,
      color 160ms ease;
  }

  .library-grid a:hover {
    background: color-mix(
      in oklch,
      var(--reading-accent) 12%,
      var(--reading-surface)
    );
    color: color-mix(in oklch, var(--reading-accent) 68%, white);
  }

  .library-grid strong {
    margin-top: auto;
    font-family: var(
      --landing-heading-font,
      "Playfair Display",
      Georgia,
      serif
    );
    font-size: 1.35rem;
    font-weight: 500;
  }

  .library-grid small {
    margin-top: 0.5rem;
    color: var(--reading-muted);
    font-size: 0.84rem;
    line-height: 1.45;
  }

  .library-arrow {
    position: absolute;
    top: 1rem;
    right: 1rem;
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    border: 1px solid var(--reading-stroke);
    border-radius: 50%;
    font-size: 0.78rem;
  }

  @container (max-width: 880px) {
    .reading-header,
    .reading-layout,
    .lead-story,
    .index-story-grid {
      grid-template-columns: 1fr;
    }

    .reading-header {
      gap: 1.75rem;
    }

    .reading-nav {
      position: static;
      padding-top: 2rem;
    }

    .reading-nav nav {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .reading-nav nav a {
      grid-template-columns: 1fr;
      gap: 0.2rem;
      padding: 0.65rem;
      border-right: 1px solid var(--reading-stroke);
    }

    .open-button {
      width: auto;
    }

    .lead-story {
      min-height: 0;
    }

    .story-demo {
      justify-self: center;
    }

    .library-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .reading-page {
      width: calc(100% - 1.25rem);
      padding-inline: 0.35rem;
    }

    .reading-header h1 {
      font-size: clamp(2.9rem, 15vw, 4.2rem);
    }

    .reading-nav nav {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .library-grid {
      grid-template-columns: 1fr;
    }

    .library-grid a {
      min-height: 11rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .reading-nav nav a,
    .open-button,
    .story-button,
    .library-grid a {
      transition: none;
    }

    .open-button:hover,
    .story-button:hover {
      transform: none;
    }
  }
</style>
