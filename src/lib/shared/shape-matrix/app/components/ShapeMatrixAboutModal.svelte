<script lang="ts">
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalHeader from "$lib/shared/foundation/ui/modal/ModalHeader.svelte";
  import { getShapeMatrixAppContext } from "../context/shape-matrix-app-context";
  import {
    SHAPE_MATRIX_LEVELS,
    SHAPE_MATRIX_LEVEL_DESCRIPTIONS,
  } from "../shape-matrix-levels";
  import {
    KINETIC_SHAPE_ENGINE_AUTHOR,
    KINETIC_SHAPE_ENGINE_NAME,
    ORIGINAL_SHAPE_MATRIX_URL,
    ORIGINAL_SHAPE_MATRIX_VTG_RATIOS,
    SPIN_SCIENCE_URL,
  } from "../shape-engine-identity";

  /* Named for what it is rather than `state`: a binding called `state` makes
     `$state` in this file a store read of it, which is how this modal came to
     throw store_invalid_shape the moment it gained a rune. */
  const appState = getShapeMatrixAppContext();

  let levelsSection = $state<HTMLElement | null>(null);

  /* Opened from the difficulty strip's question mark, About is being asked one
     question rather than being browsed, so it goes to the answer. The modal
     mounts its body on open, hence the frame's wait for the node. */
  $effect(() => {
    if (appState.aboutFocus !== "levels" || !appState.aboutOpen) return;
    const frame = requestAnimationFrame(() => {
      levelsSection?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  });
</script>

{#snippet header()}
  <ModalHeader
    id="shape-matrix-about-title"
    title={`About ${KINETIC_SHAPE_ENGINE_NAME}`}
    subtitle="Vulcan Tech Gospel, Lorq’s matrix, and Austen’s Shape Engine"
    icon="fa-table-cells-large"
    iconColor="#d9901a"
    onClose={appState.closeAbout}
  />
{/snippet}

<BaseModal
  open={appState.aboutOpen}
  onclose={appState.closeAbout}
  size="xl"
  labelledBy="shape-matrix-about-title"
  {header}
>
  <div class="about-copy">
    <p>
      {KINETIC_SHAPE_ENGINE_NAME} is an independent exploration tool by
      {KINETIC_SHAPE_ENGINE_AUTHOR}. It is part of
      <a href="/composer">Flow Arts Composer</a>, also available as a standalone
      app.
    </p>
    <div class="about-columns">
      <section>
        <span class="section-kicker">Notation in this app</span>
        <h2>VTG ratios and TKA turns</h2>
        <p>
          Vulcan Tech Gospel (VTG) was developed by Noel Yee and spinners at the
          Vulcan Lofts in Oakland. The Level Matrix uses TKA turn values. The
          Ratio Playground uses exact whole-number spin ratios, including the
          VTG families {ORIGINAL_SHAPE_MATRIX_VTG_RATIOS}.
        </p>
      </section>

      <section bind:this={levelsSection} class="levels-section">
        <span class="section-kicker">Organising by difficulty</span>
        <h2>What the levels are</h2>
        <p>
          Levels are a Kinetic Alphabet idea, and they are cumulative: each one
          keeps everything the level below it had and adds finer turn
          increments, so the grid gains rows and columns rather than trading
          them. A higher level does not make every pattern in it harder — it
          offers more to choose from.
        </p>
        <ol class="level-list">
          {#each SHAPE_MATRIX_LEVELS as level (level)}
            <li>
              <span class="level-numeral">{level}</span>
              <span class="level-copy">
                <strong>{SHAPE_MATRIX_LEVEL_DESCRIPTIONS[level].name}</strong>
                <span>{SHAPE_MATRIX_LEVEL_DESCRIPTIONS[level].blurb}</span>
              </span>
            </li>
          {/each}
        </ol>
      </section>

      <section>
        <span class="section-kicker">Source inspiration</span>
        <h2>Lorq Nichols’ 144 Shape Matrix</h2>
        <p>
          Lorq Nichols, publishing as
          <a href={SPIN_SCIENCE_URL} target="_blank" rel="noopener noreferrer"
            >Spin Science</a
          >, created the original matrix. It pairs twelve driving styles for
          each hand into 144 combinations. Shape Engine takes inspiration from
          that row-and-column format.
        </p>
        <p>
          Austen built this app independently, including its prop selection,
          relationship solving, live animation, and pictograph readouts. It is
          not an official Spin Science release.
        </p>
      </section>
    </div>
    <div class="source-links">
      <a href="/guide/ratios">
        Read ratios in TKA
        <i class="fas fa-arrow-right" aria-hidden="true"></i>
      </a>
      <a href="/history#archive-record-vtg">
        The Vulcan Tech Gospel record
        <i class="fas fa-arrow-right" aria-hidden="true"></i>
      </a>
      <a href="/history#archive-record-lorq">
        The Lorq Nichols record
        <i class="fas fa-arrow-right" aria-hidden="true"></i>
      </a>
      <a
        href={ORIGINAL_SHAPE_MATRIX_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        View Lorq Nichols’ 144 Shape Matrix
        <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
      </a>
    </div>
  </div>
</BaseModal>

<style>
  .about-copy {
    display: grid;
    gap: 1.5rem;
    padding: clamp(1rem, 2.2vw, 2rem);
    color: var(--theme-text-dim, rgb(255 255 255 / 0.72));
    font-size: 0.98rem;
    line-height: 1.65;
  }

  .about-columns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: clamp(1.5rem, 4vw, 4rem);
  }

  section {
    display: grid;
    align-content: start;
    gap: 0.8rem;
  }

  /* The one section a reader can be sent to directly, so it spans the columns
     rather than being half a row someone has to find. */
  .levels-section {
    grid-column: 1 / -1;
  }

  .level-list {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .level-list li {
    display: flex;
    align-items: baseline;
    gap: 0.65rem;
  }

  .level-numeral {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.6rem;
    height: 1.6rem;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.16));
    border-radius: 8px;
    color: var(--theme-text, #fff);
    font-size: 0.85rem;
    font-weight: 700;
  }

  .level-copy {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.4rem;
    min-width: 0;
  }

  .level-copy strong {
    color: var(--theme-text, #fff);
  }

  p {
    margin: 0;
    max-inline-size: var(--measure-prose, 68ch);
  }

  p a {
    color: #f4b54c;
    text-underline-offset: 0.2em;
  }

  h2 {
    color: var(--theme-text, #fff);
  }

  .section-kicker {
    color: #f4b54c;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 750;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  h2 {
    margin: -0.25rem 0 0;
    font-size: clamp(1.2rem, 1.8vw, 1.55rem);
    line-height: 1.2;
    letter-spacing: -0.02em;
  }

  .source-links {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
    margin-top: 0.25rem;
  }

  .source-links a {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0.55rem 0.8rem;
    border: 1px solid rgb(245 158 11 / 0.42);
    border-radius: 12px;
    background: rgb(245 158 11 / 0.08);
    color: var(--theme-text, #fff);
    font-weight: 600;
    text-align: center;
    text-decoration: none;
  }

  .source-links a:hover {
    background: rgb(245 158 11 / 0.14);
    border-color: rgb(245 158 11 / 0.7);
  }

  .source-links a:focus-visible {
    outline: 2px solid #f59e0b;
    outline-offset: 2px;
  }

  @media (max-width: 52rem) {
    .about-columns {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 36rem) {
    .source-links {
      grid-template-columns: 1fr;
    }

    .about-copy {
      padding: 1rem;
    }
  }
</style>
