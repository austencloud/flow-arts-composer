<script lang="ts">
  import SequenceHeroDemo from "$lib/shared/landing/components/SequenceHeroDemo.svelte";
  import LinkChip from "$lib/shared/ui/components/LinkChip.svelte";
  import demoJson from "$lib/shared/landing/data/demo-sequence.json";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

  const demoSequence = demoJson as unknown as SequenceData;

  const composerChapters = [
    { label: "Construct", copy: "Place each beat yourself." },
    { label: "Generate", copy: "Set the constraints and draw a sequence." },
    { label: "Multiply", copy: "Turn one pattern into a group composition." },
    { label: "Learn", copy: "Read the alphabet through play." },
  ];

  const referenceGroups = [
    {
      label: "Read",
      entries: [
        {
          href: "/learn/staff-spinning-choreography",
          title: "Staff choreography",
          copy: "A written introduction to building phrases with a staff.",
        },
        {
          href: "/about",
          title: "About TKA",
          copy: "Who made the project and why it exists.",
        },
      ],
    },
    {
      label: "Explore",
      entries: [
        {
          href: "/shape-engine",
          title: "The 144 shape matrix",
          copy: "Lorq Nichols charted every even-petaled flower pairing in 2012. TKA draws the table live.",
        },
        {
          href: "/atlas",
          title: "Glossary",
          copy: "Positions, motions, letter types, and the rest of the vocabulary.",
        },
        {
          href: "/shop",
          title: "Choreography cards",
          copy: "Put the notation on the table for practice or teaching.",
        },
      ],
    },
  ];
</script>

<main class="front-page" id="main-content">
  <header class="front-masthead">
    <div class="masthead-copy">
      <span class="eyebrow">The Kinetic Alphabet</span>
      <h1>A language for writing flow arts down.</h1>
      <p>
        TKA puts movement on the page and plays it back. Spinners can record
        what they made and build from it together. Start with the notation or
        open the tool that writes it.
      </p>
      <div class="masthead-actions">
        <a class="door-button primary" href="/notation">Read the notation</a>
        <a class="door-button" href="/composer">Meet the Composer</a>
      </div>
    </div>

    <div class="masthead-index" aria-label="On this page">
      <span class="index-rule"></span>
      <span>Notation</span>
      <span>Composer</span>
      <span>Origins</span>
      <span>Reference</span>
    </div>
  </header>

  <section class="feature-band notation-band" aria-labelledby="front-notation">
    <div class="feature-copy">
      <span class="chapter-number">01</span>
      <span class="section-kicker">Notation</span>
      <h2 id="front-notation">See the movement and the score together.</h2>
      <p>
        The notation article follows the ideas that shaped TKA, shows what each
        symbol records, and places a written sequence beside its animation.
      </p>
      <div class="feature-links">
        <a class="door-button primary" href="/notation"
          >Explore Flow Arts Notation</a
        >
        <LinkChip class="inline-link" href="/shape-engine"
          >See the 144 shape matrix</LinkChip
        >
      </div>
    </div>

    <div class="live-proof" aria-label="A real TKA sequence player">
      <span class="proof-label">Live notation</span>
      <SequenceHeroDemo
        sequence={demoSequence}
        note="pictographs beside the animation"
      />
    </div>
  </section>

  <section class="feature-band composer-band" aria-labelledby="front-composer">
    <div class="feature-copy composer-copy">
      <span class="chapter-number">02</span>
      <span class="section-kicker">Flow Arts Composer</span>
      <h2 id="front-composer">
        The place where the alphabet becomes choreography.
      </h2>
      <p>
        Build beat by beat, generate within a set of constraints, unfold a
        phrase across a group, or learn the language through the games already
        inside the app.
      </p>
      <a class="door-button primary" href="/composer">Read about the Composer</a
      >
    </div>

    <ol class="composer-chapters" aria-label="Composer article chapters">
      {#each composerChapters as chapter, index}
        <li>
          <span class="chapter-step">0{index + 1}</span>
          <div>
            <strong>{chapter.label}</strong>
            <span>{chapter.copy}</span>
          </div>
        </li>
      {/each}
    </ol>
  </section>

  <section class="origins-band" aria-labelledby="front-origins">
    <div class="origins-heading">
      <span class="chapter-number">03</span>
      <span class="section-kicker">Origins</span>
      <h2 id="front-origins">No notation system starts from nothing.</h2>
    </div>
    <div class="origins-copy">
      <p>
        TKA sits in a longer conversation about timing, direction, position,
        music, juggling, and the software people built before this Composer.
      </p>
      <div class="origin-actions">
        <a class="door-button" href="/notation"
          >Read the history inside Notation</a
        >
        <a class="door-button" href="/roots/software"
          >Follow the software lineage</a
        >
      </div>
    </div>
  </section>

  <section class="reference-section" aria-labelledby="front-reference">
    <div class="reference-heading">
      <span class="chapter-number">04</span>
      <div>
        <span class="section-kicker">Keep going</span>
        <h2 id="front-reference">The rest of the shelf.</h2>
      </div>
    </div>

    <div class="reference-groups">
      {#each referenceGroups as group}
        <div class="reference-group">
          <span class="group-label">{group.label}</span>
          <div class="reference-list">
            {#each group.entries as reference}
              <a href={reference.href}>
                <span>
                  <strong>{reference.title}</strong>
                  <small>{reference.copy}</small>
                </span>
                <span class="reference-arrow" aria-hidden="true">↗</span>
              </a>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </section>
</main>

<style>
  .front-page {
    --front-text: var(--theme-text, oklch(0.97 0.01 275));
    --front-muted: var(--theme-text-secondary, oklch(0.72 0.02 275));
    --front-stroke: var(--theme-stroke, oklch(0.76 0.02 275 / 0.18));
    --front-surface: color-mix(
      in oklch,
      var(--theme-card-bg, oklch(0.15 0.025 275)) 72%,
      transparent
    );
    --front-purple: oklch(0.7 0.17 285);
    --front-cyan: oklch(0.76 0.14 210);
    --front-gold: oklch(0.8 0.13 80);
    width: min(112rem, calc(100% - 3rem));
    margin: 0 auto;
    padding-bottom: clamp(5rem, 8vw, 9rem);
    color: var(--front-text);
    container-type: inline-size;
  }

  .front-masthead {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(14rem, 0.32fr);
    gap: clamp(3rem, 7vw, 9rem);
    align-items: end;
    min-height: min(68vh, 48rem);
    padding: clamp(5rem, 9vh, 8rem) clamp(1rem, 3vw, 4rem)
      clamp(4rem, 7vh, 6rem);
    border-bottom: 1px solid var(--front-stroke);
  }

  .masthead-copy {
    max-width: 68rem;
  }

  .eyebrow,
  .section-kicker,
  .proof-label,
  .group-label {
    display: block;
    color: var(--front-muted);
    font-size: clamp(0.76rem, 0.72rem + 0.1vw, 0.88rem);
    font-weight: 720;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .front-masthead h1 {
    max-width: 13ch;
    margin: 0.55rem 0 1.2rem;
    font-family: var(--page-title-font, "Fraunces", Georgia, serif);
    font-size: clamp(3.5rem, 2.7rem + 2.7vw, 6.7rem);
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

  .front-masthead p,
  .feature-copy p,
  .origins-copy p {
    max-width: 53ch;
    margin: 0;
    color: var(--front-muted);
    font-size: clamp(1.05rem, 0.98rem + 0.22vw, 1.28rem);
    line-height: 1.65;
  }

  .masthead-actions,
  .feature-links,
  .origin-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    margin-top: 1.8rem;
  }

  .door-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 46px;
    padding: 0.72rem 1.15rem;
    border: 1px solid var(--front-stroke);
    border-radius: 10px;
    background: color-mix(in oklch, var(--front-surface) 82%, transparent);
    color: var(--front-text);
    font-size: 0.95rem;
    font-weight: 680;
    text-decoration: none;
    transition:
      border-color 160ms ease,
      background 160ms ease,
      transform 160ms ease;
  }

  .door-button:hover {
    border-color: color-mix(in oklch, var(--front-purple) 55%, transparent);
    background: color-mix(
      in oklch,
      var(--front-purple) 12%,
      var(--front-surface)
    );
    transform: translateY(-1px);
  }

  .door-button.primary {
    border-color: color-mix(in oklch, var(--front-purple) 58%, transparent);
    background: color-mix(
      in oklch,
      var(--front-purple) 22%,
      var(--front-surface)
    );
  }

  .masthead-index {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
    padding-bottom: 0.4rem;
    color: var(--front-muted);
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .index-rule {
    width: 100%;
    height: 1px;
    margin-bottom: 0.5rem;
    background: linear-gradient(90deg, var(--front-purple), transparent);
  }

  .feature-band {
    display: grid;
    grid-template-columns: minmax(0, 0.82fr) minmax(22rem, 1.18fr);
    gap: clamp(3rem, 7vw, 9rem);
    align-items: center;
    min-height: clamp(38rem, 66vh, 56rem);
    padding: clamp(4rem, 7vw, 8rem) clamp(1rem, 3vw, 4rem);
    border-bottom: 1px solid var(--front-stroke);
  }

  .feature-copy {
    position: relative;
    max-width: 40rem;
  }

  .chapter-number {
    display: block;
    margin-bottom: 1.25rem;
    color: color-mix(in oklch, var(--front-muted) 58%, transparent);
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    letter-spacing: 0.14em;
  }

  .feature-copy h2,
  .origins-band h2,
  .reference-heading h2 {
    max-width: 16ch;
    margin: 0.55rem 0 1.15rem;
    font-family: var(
      --landing-heading-font,
      "Playfair Display",
      Georgia,
      serif
    );
    font-size: clamp(2.4rem, 1.9rem + 1.25vw, 4rem);
    font-weight: 500;
    letter-spacing: -0.035em;
    line-height: 1.04;
  }

  .notation-band .section-kicker {
    color: color-mix(in oklch, var(--front-purple) 78%, white);
  }

  .live-proof {
    position: relative;
    width: min(100%, 48rem);
    justify-self: center;
    padding: clamp(1rem, 2vw, 1.8rem);
    border: 1px solid color-mix(in oklch, var(--front-purple) 28%, transparent);
    border-radius: 24px;
    background:
      radial-gradient(
        circle at 80% 12%,
        oklch(0.56 0.18 285 / 0.16),
        transparent 42%
      ),
      var(--front-surface);
    box-shadow: 0 28px 80px oklch(0.04 0.04 285 / 0.3);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
  }

  .proof-label {
    margin: 0.2rem 0 1rem;
    color: color-mix(in oklch, var(--front-purple) 70%, white);
  }

  .live-proof :global(.hero-demo) {
    margin-top: 0;
  }

  .composer-band {
    grid-template-columns: minmax(22rem, 1.04fr) minmax(0, 0.96fr);
  }

  .composer-copy {
    order: 2;
  }

  .composer-band .section-kicker {
    color: color-mix(in oklch, var(--front-cyan) 74%, white);
  }

  .composer-chapters {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1px;
    margin: 0;
    padding: 1px;
    list-style: none;
    background: var(--front-stroke);
    border: 1px solid var(--front-stroke);
    border-radius: 18px;
    overflow: hidden;
  }

  .composer-chapters li {
    min-height: 12rem;
    padding: clamp(1.25rem, 2vw, 2rem);
    background: color-mix(
      in oklch,
      var(--front-surface) 92%,
      oklch(0.12 0.02 260)
    );
  }

  .chapter-step {
    display: block;
    margin-bottom: 2.5rem;
    color: color-mix(in oklch, var(--front-cyan) 58%, var(--front-muted));
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  .composer-chapters div {
    display: grid;
    gap: 0.4rem;
  }

  .composer-chapters strong {
    font-family: var(
      --landing-heading-font,
      "Playfair Display",
      Georgia,
      serif
    );
    font-size: clamp(1.35rem, 1.15rem + 0.35vw, 1.7rem);
    font-weight: 500;
  }

  .composer-chapters div span {
    color: var(--front-muted);
    font-size: 0.92rem;
    line-height: 1.45;
  }

  .origins-band {
    display: grid;
    grid-template-columns: minmax(0, 0.86fr) minmax(0, 1.14fr);
    gap: clamp(3rem, 8vw, 10rem);
    padding: clamp(5rem, 8vw, 9rem) clamp(1rem, 3vw, 4rem);
    border-bottom: 1px solid var(--front-stroke);
  }

  .origins-band .section-kicker {
    color: color-mix(in oklch, var(--front-gold) 72%, white);
  }

  .origins-copy {
    align-self: end;
  }

  .reference-section {
    display: grid;
    grid-template-columns: minmax(18rem, 0.55fr) minmax(0, 1.45fr);
    gap: clamp(3rem, 7vw, 9rem);
    padding: clamp(5rem, 8vw, 8rem) clamp(1rem, 3vw, 4rem) 0;
  }

  .reference-heading {
    display: flex;
    gap: 1.25rem;
  }

  .reference-heading .chapter-number {
    padding-top: 0.2rem;
  }

  .reference-heading h2 {
    font-size: clamp(2rem, 1.7rem + 0.8vw, 3rem);
  }

  .reference-group + .reference-group {
    margin-top: 2.6rem;
  }

  .group-label {
    margin-bottom: 0.6rem;
  }

  .reference-list {
    border-top: 1px solid var(--front-stroke);
  }

  .reference-list a {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    min-height: 92px;
    padding: 1.1rem 0.35rem;
    border-bottom: 1px solid var(--front-stroke);
    color: var(--front-text);
    text-decoration: none;
    transition:
      color 160ms ease,
      padding-inline 160ms ease;
  }

  .reference-list a:hover {
    padding-inline: 0.8rem;
    color: color-mix(in oklch, var(--front-purple) 68%, white);
  }

  .reference-list a > span:first-child {
    display: grid;
    gap: 0.28rem;
  }

  .reference-list strong {
    font-size: 1.05rem;
  }

  .reference-list small {
    max-width: 62ch;
    color: var(--front-muted);
    font-size: 0.88rem;
    line-height: 1.45;
  }

  .reference-arrow {
    display: grid;
    flex: 0 0 44px;
    width: 44px;
    height: 44px;
    place-items: center;
    border: 1px solid var(--front-stroke);
    border-radius: 50%;
  }

  @container (max-width: 780px) {
    .front-masthead,
    .feature-band,
    .composer-band,
    .origins-band,
    .reference-section {
      grid-template-columns: 1fr;
    }

    .front-masthead {
      min-height: 0;
      gap: 3rem;
    }

    .masthead-index {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .index-rule {
      grid-column: 1 / -1;
    }

    .feature-band {
      min-height: 0;
    }

    .composer-copy {
      order: 0;
    }

    .composer-chapters {
      order: 2;
    }

    .reference-section {
      gap: 2rem;
    }
  }

  @media (max-width: 640px) {
    .front-page {
      width: calc(100% - 1.25rem);
    }

    .front-masthead,
    .feature-band,
    .origins-band,
    .reference-section {
      padding-inline: 0.35rem;
    }

    .front-masthead h1 {
      font-size: clamp(3rem, 16vw, 4.3rem);
    }

    .composer-chapters {
      grid-template-columns: 1fr;
    }

    .composer-chapters li {
      min-height: 9rem;
    }

    .chapter-step {
      margin-bottom: 1.5rem;
    }

    .reference-list a {
      min-height: 104px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .door-button,
    .reference-list a {
      transition: none;
    }

    .door-button:hover {
      transform: none;
    }
  }
</style>
