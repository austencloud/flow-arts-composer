<script lang="ts">
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import NotationRosetta from "./NotationRosetta.svelte";
  import NotationShapeMatrix from "./NotationShapeMatrix.svelte";
  import NotationSequenceStage from "./NotationSequenceStage.svelte";
  import LinkChip from "$lib/shared/ui/components/LinkChip.svelte";

  type LayoutMode = "atlas" | "cinematic";

  let {
    layoutMode,
    sequence,
  }: {
    layoutMode: LayoutMode;
    sequence: SequenceData;
  } = $props();

  const firstBeat = $derived(sequence.steps[0]);

  const sources = {
    vtg: "https://noelyee.com/instruction/vulcan-tech-gospel",
    qft: "https://www.drexfactor.com/weirdscience/2011/05/18/beginners_guide_poi_qft_notation",
    lorq: "https://sirlorq.wordpress.com/2014/07/16/144-shape-matrix-even-petaled-flowers-rework/",
    poiNotation: "https://github.com/tiffanyfong/PoiNotation",
  };
</script>

<main class="study-container">
  <article class="notation-study" data-layout={layoutMode}>
    <header class="study-hero">
      <div class="hero-title">
        <p class="eyebrow">A movement language</p>
        <h1>Flow Arts Notation</h1>
        <p class="subtitle">The family of systems for writing movement down</p>
      </div>

      <div class="hero-thesis">
        <p>
          Writing down what a body does with two spinning props is an old
          problem, and more than one craft has taken a run at it.
        </p>
        <p>
          This study compares what each system puts on the page and where The
          Kinetic Alphabet sits among them.
        </p>
      </div>

      <nav class="system-index" aria-label="Notation study sections">
        <a href="#rosetta"><span>Position</span><strong>QFT</strong></a>
        <a href="#lineage"><span>Relationship</span><strong>VTG</strong></a>
        <a href="#matrix"><span>Combinations</span><strong>144</strong></a>
        <a href="#sequence"><span>Readable score</span><strong>TKA</strong></a>
      </nav>
    </header>

    <section class="study-section rosetta-section" id="rosetta">
      <header class="section-heading">
        <span class="section-kicker">Three notation languages, three views</span
        >
        <h2>What each system puts on the page</h2>
        <p>
          They point at the same slippery target: where the props are and how
          they move. They disagree on what deserves ink.
        </p>
      </header>

      {#if firstBeat}
        <NotationRosetta pictograph={firstBeat} />
      {/if}
    </section>

    <section class="study-section lineage-section" id="lineage">
      <header class="section-heading">
        <span class="section-kicker">How spinners mapped it</span>
        <h2>Four takes on the same problem</h2>
        <p>
          Each system holds a different slice of the movement. Read together,
          they show how the field learned to name, map, chart, and execute flow.
        </p>
      </header>

      <div class="lineage-grid">
        <article class="lineage-chapter chapter-vtg">
          <span class="chapter-mark" aria-hidden="true">01</span>
          <div>
            <p class="chapter-axis">Relationship</p>
            <h3>Vulcan Tech Gospel</h3>
            <p>
              VTG gave poi a shared vocabulary: together time against split
              time, same direction against opposite. It describes how two hand
              paths relate.
            </p>
            <LinkChip href={sources.vtg}>Noel Yee on VTG</LinkChip>
          </div>
        </article>

        <article class="lineage-chapter chapter-qft">
          <span class="chapter-mark" aria-hidden="true">02</span>
          <div>
            <p class="chapter-axis">Position</p>
            <h3>Quantized Field Theory</h3>
            <p>
              Charlie Cushing mapped absolute position around a numbered circle,
              then carried the idea onto a three by three grid.
            </p>
            <LinkChip href={sources.qft}>Beginner's guide to QFT</LinkChip>
          </div>
        </article>

        <article class="lineage-chapter chapter-lorq">
          <span class="chapter-mark" aria-hidden="true">03</span>
          <div>
            <p class="chapter-axis">Combinations</p>
            <h3>The 144 Shape Matrix</h3>
            <p>
              Lorq Nichols charted twelve left-hand driving styles against
              twelve right-hand styles, laying out 144 pairings.
            </p>
          </div>
        </article>

        <article class="lineage-chapter chapter-code">
          <span class="chapter-mark" aria-hidden="true">04</span>
          <div>
            <p class="chapter-axis">Executable notation</p>
            <h3>PoiNotation</h3>
            <p>
              PoiNotation treated a move as properties and a sequence as moves
              joined by operators that rendered into two poi simulators.
            </p>
            <LinkChip href={sources.poiNotation}>PoiNotation on GitHub</LinkChip
            >
          </div>
        </article>
      </div>
    </section>

    <section class="study-section matrix-section" id="matrix">
      <div class="matrix-artifact">
        <NotationShapeMatrix />
      </div>
      <div class="matrix-copy">
        <span class="section-kicker">A field of combinations</span>
        <h2>The 144 Shape Matrix</h2>
        <p>
          Matched styles sit on the diagonal. Every off-diagonal cell combines
          two different driving styles into a hybrid.
        </p>
        <p>
          It does what a simulator does: lays the space out so you can find what
          you have not tried.
        </p>
        <LinkChip href={sources.lorq}>144 Shape Matrix, Sir Lorq</LinkChip>
      </div>
    </section>

    <section class="study-section synthesis-section">
      <span class="section-kicker">Where TKA fits</span>
      <h2>What The Kinetic Alphabet adds</h2>
      <div class="synthesis-copy">
        <p>
          TKA draws a pictograph for every beat on a grid of up to nine points,
          so one image holds position, timing, and direction at once.
        </p>
        <p>
          String the beats together and they spell a word another spinner can
          read back without watching the move first.
        </p>
      </div>
    </section>

    <section class="study-section sequence-section" id="sequence">
      <header class="section-heading">
        <span class="section-kicker">Read it, then play it</span>
        <h2>A sequence on the page and in motion</h2>
        <p>
          The score and animation use the same sequence data. Read each beat,
          then watch the movement connect.
        </p>
      </header>
      <NotationSequenceStage {sequence} />
    </section>

    <section class="cta-card">
      <div>
        <p class="section-kicker">Take the next beat</p>
        <h2>Build a sequence of your own</h2>
        <p>Flow Arts Composer turns each choice into a readable pictograph.</p>
      </div>
      <a href="/create" data-sveltekit-reload>
        Open Flow Arts Composer <span aria-hidden="true">→</span>
      </a>
    </section>
  </article>
</main>

<style>
  .study-container {
    container: notation-study / inline-size;
    width: 100%;
  }

  .notation-study {
    --settings-study-measure: 46rem;
    --settings-study-gutter: clamp(1.1rem, 2.8vw, 5rem);
    --semantic-notation-violet: #a855f7;
    --semantic-notation-amber: #f59e0b;
    --semantic-notation-teal: #14b8a6;
    --theme-study-muted: var(--theme-text-dim, #aaa5bc);

    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: clamp(4.5rem, 7vw, 9rem);
    width: min(100%, 176rem);
    margin: 0 auto;
    padding: clamp(2.5rem, 5vw, 7rem) var(--settings-study-gutter)
      clamp(5rem, 8vw, 10rem);
    color: var(--theme-text, #f4f1ff);
    font-family: "Inter", system-ui, sans-serif;
  }

  .study-hero,
  .study-section,
  .cta-card {
    min-width: 0;
  }

  .study-hero {
    display: grid;
    gap: clamp(2rem, 5vw, 5.5rem);
    min-height: min(74vh, 56rem);
    align-content: center;
  }

  .eyebrow,
  .section-kicker,
  .chapter-axis {
    margin: 0;
    color: color-mix(
      in oklch,
      var(--semantic-notation-violet) 70%,
      var(--theme-study-muted)
    );
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 680;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  h1 {
    max-width: 12ch;
    margin: 0.55rem 0 0.7rem;
    font-family: "Fraunces", Georgia, serif;
    font-size: clamp(3.1rem, 2rem + 3.6vw, 5rem);
    font-style: italic;
    font-variation-settings:
      "opsz" 144,
      "wght" 700,
      "SOFT" 0,
      "WONK" 1;
    font-weight: 700;
    letter-spacing: -0.025em;
    line-height: 0.98;
  }

  .subtitle {
    max-width: 34rem;
    margin: 0;
    color: var(--theme-study-muted);
    font-size: clamp(var(--font-size-min, 0.875rem), 0.82rem + 0.35vw, 1.25rem);
    line-height: 1.5;
  }

  .hero-thesis {
    max-width: var(--settings-study-measure);
    align-self: center;
  }

  .hero-thesis p {
    margin: 0 0 1rem;
    color: color-mix(in oklch, var(--theme-text, #f4f1ff) 78%, transparent);
    font-size: clamp(1.05rem, 0.96rem + 0.38vw, 1.35rem);
    line-height: 1.7;
  }

  .system-index {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }

  .system-index a {
    display: flex;
    min-width: 0;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.7rem;
    padding: 0.9rem 0.65rem;
    color: var(--theme-study-muted);
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    text-decoration: none;
  }

  .system-index span {
    overflow: hidden;
    font-size: var(--font-size-compact, 0.75rem);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .system-index strong {
    color: var(--theme-text, #f4f1ff);
    font-size: var(--font-size-min, 0.875rem);
  }

  .study-section {
    scroll-margin-top: 8rem;
    padding-top: clamp(1.8rem, 3vw, 3rem);
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }

  .section-heading {
    max-width: var(--settings-study-measure);
    margin-bottom: clamp(1.8rem, 3.5vw, 3.8rem);
  }

  h2 {
    margin: 0.5rem 0 1rem;
    font-size: clamp(1.7rem, 1.28rem + 1.15vw, 2.7rem);
    font-variation-settings: "opsz" 24;
    font-weight: 680;
    letter-spacing: -0.025em;
    line-height: 1.12;
  }

  h3 {
    margin: 0.2rem 0 0.7rem;
    font-size: clamp(1.12rem, 1rem + 0.35vw, 1.45rem);
    font-weight: 650;
    letter-spacing: -0.015em;
  }

  .section-heading p,
  .matrix-copy p,
  .synthesis-copy p,
  .cta-card p {
    max-width: var(--settings-study-measure);
    margin: 0 0 1rem;
    color: var(--theme-study-muted);
    font-size: clamp(var(--font-size-min, 0.875rem), 0.82rem + 0.22vw, 1.1rem);
    line-height: 1.7;
  }

  .lineage-grid {
    display: grid;
    gap: 0;
  }

  .lineage-chapter {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 1rem;
    padding: clamp(1.25rem, 2.5vw, 2.2rem) 0;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }

  .chapter-mark {
    color: color-mix(in oklch, var(--theme-study-muted) 42%, transparent);
    font-family: "SFMono-Regular", "Cascadia Code", monospace;
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
  }

  .lineage-chapter p:not(.chapter-axis) {
    max-width: 36rem;
    margin: 0 0 0.9rem;
    color: var(--theme-study-muted);
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.65;
  }

  .matrix-section {
    display: grid;
    gap: clamp(2rem, 4vw, 4.5rem);
    align-items: center;
  }

  .matrix-artifact {
    min-width: 0;
    padding: clamp(1rem, 2vw, 2rem);
    background: var(--theme-panel-bg, rgba(9, 11, 24, 0.82));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-lg, 1rem);
  }

  .matrix-copy {
    max-width: var(--settings-study-measure);
  }

  .synthesis-section {
    max-width: 70rem;
  }

  .synthesis-copy {
    display: grid;
    gap: 0 2.5rem;
  }

  .sequence-section > .section-heading {
    margin-inline: auto;
    text-align: center;
  }

  .cta-card {
    display: grid;
    gap: 1.5rem;
    align-items: center;
    padding: clamp(1.5rem, 3vw, 3rem);
    background: var(--theme-panel-bg, rgba(9, 11, 24, 0.86));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-lg, 1rem);
  }

  .cta-card h2 {
    margin-bottom: 0.55rem;
  }

  .cta-card a {
    display: inline-flex;
    min-height: var(--min-touch-target, 44px);
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    padding: 0.75rem 1.25rem;
    color: var(--theme-text-on-accent, white);
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 680;
    background: var(--theme-accent, #7c5cff);
    border-radius: var(--radius-md, 0.65rem);
    text-decoration: none;
  }

  .notation-study a:focus-visible {
    outline: 2px solid var(--theme-text, white);
    outline-offset: 4px;
  }

  @container notation-study (min-width: 44rem) {
    .system-index {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .system-index a:not(:last-child) {
      border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    }

    .synthesis-copy,
    .cta-card {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container notation-study (min-width: 72rem) {
    .matrix-section {
      grid-template-columns: minmax(0, 7fr) minmax(20rem, 5fr);
    }
  }

  @container notation-study (min-width: 96rem) {
    .notation-study {
      grid-template-columns: repeat(12, minmax(0, 1fr));
      column-gap: clamp(1.25rem, 1.7cqi, 3rem);
      row-gap: clamp(6rem, 7cqi, 10rem);
    }

    .study-hero,
    .study-section,
    .cta-card {
      grid-column: 1 / -1;
    }

    [data-layout="atlas"] .study-hero {
      grid-row: 1;
      grid-template-columns: minmax(0, 4fr) minmax(0, 8fr);
    }

    [data-layout="atlas"] .hero-title {
      align-self: center;
    }

    [data-layout="atlas"] .hero-thesis {
      max-width: 52rem;
      align-self: center;
      justify-self: center;
    }

    [data-layout="atlas"] .system-index {
      grid-column: 1 / -1;
    }

    [data-layout="atlas"] .rosetta-section {
      grid-row: 2;
    }

    [data-layout="atlas"] .lineage-section {
      grid-column: 1 / 7;
      grid-row: 3;
    }

    [data-layout="atlas"] .lineage-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: clamp(1.5rem, 2cqi, 3rem);
    }

    [data-layout="atlas"] .matrix-section {
      grid-column: 7 / 13;
      grid-row: 3;
      grid-template-columns: minmax(0, 1fr);
      align-content: start;
    }

    [data-layout="atlas"] .synthesis-section {
      grid-column: 2 / 8;
      grid-row: 4;
    }

    [data-layout="atlas"] .sequence-section {
      grid-row: 5;
    }

    [data-layout="atlas"] .cta-card {
      grid-column: 3 / 11;
      grid-row: 6;
    }

    [data-layout="cinematic"] .study-hero {
      grid-column: 3 / 11;
      grid-row: 1;
      min-height: min(86vh, 68rem);
      text-align: center;
    }

    [data-layout="cinematic"] .hero-title,
    [data-layout="cinematic"] .hero-thesis {
      margin-inline: auto;
    }

    [data-layout="cinematic"] h1 {
      max-width: none;
    }

    [data-layout="cinematic"] .system-index {
      text-align: left;
    }

    [data-layout="cinematic"] .rosetta-section {
      grid-row: 2;
    }

    [data-layout="cinematic"] .rosetta-section > .section-heading,
    [data-layout="cinematic"] .sequence-section > .section-heading {
      margin-inline: auto;
      text-align: center;
    }

    [data-layout="cinematic"] .lineage-section {
      grid-column: 4 / 10;
      grid-row: 3;
    }

    [data-layout="cinematic"] .matrix-section {
      grid-row: 4;
      grid-template-columns: minmax(0, 8fr) minmax(22rem, 4fr);
      min-height: min(76vh, 60rem);
      padding: clamp(2rem, 3cqi, 5rem);
      background: var(--theme-panel-bg, rgba(9, 11, 24, 0.82));
    }

    [data-layout="cinematic"] .matrix-artifact {
      background: transparent;
      border: 0;
    }

    [data-layout="cinematic"] .synthesis-section {
      grid-column: 4 / 10;
      grid-row: 5;
    }

    [data-layout="cinematic"] .sequence-section {
      grid-row: 6;
      padding: clamp(2rem, 3cqi, 5rem);
      background: var(--theme-panel-bg, rgba(9, 11, 24, 0.82));
    }

    [data-layout="cinematic"] .cta-card {
      grid-column: 4 / 10;
      grid-row: 7;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .notation-study,
    .study-hero,
    .study-section {
      scroll-behavior: auto;
      transition: none;
    }
  }
</style>
