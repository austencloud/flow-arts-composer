<script lang="ts">
  /**
   * One concept, one screen.
   *
   * Charlie's restored animation and the computed model run from the same step
   * variable, so they cannot drift. The unit fills the viewport and snaps, so a
   * reader is always looking at one whole concept rather than the tail of one
   * and the head of the next.
   *
   * No narration. Labels state facts about the knob values that produce the move.
   */
  import {
    buildIncrements,
    buildPendulum,
    type QftKnobs
  } from "#lib/shared/notation/qft/qft-model.js";
  import QftStage from "#lib/shared/notation/qft/components/QftStage.svelte";
  import QftTable from "#lib/shared/notation/qft/components/QftTable.svelte";
  import QftFrames from "./QftFrames.svelte";

  interface Props {
    title: string;
    /** Extracted-frame directory name, e.g. "cateyeanimated". */
    stem: string;
    knobs: QftKnobs;
    pendulum?: boolean;
    /** Factual label: the knob values that produce this move. */
    spec: string;
    /** Below this width the notation collapses to the active step. */
    compact: boolean;
    /**
     * The extracted frame's own proportions, from the frame manifest.
     *
     * The crops are truthful to the drawings rather than squared — squaring
     * them was what kept dragging the source tables back into shot. Giving the
     * card the frame's own shape keeps the drawing filling it, instead of a
     * small figure marooned in a white field.
     */
    aspect: string;
  }

  let { title, stem, knobs, pendulum = false, spec, compact, aspect }: Props = $props();

  const increments = $derived(pendulum ? buildPendulum() : buildIncrements(knobs, "drex"));

  let cursor = $state(0);
  $effect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      cursor = (cursor + (now - last) / 1100) % 8;
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  const step = $derived(Math.floor(cursor) % 8);
</script>

<section class="unit">
  <header>
    <h2>{title}</h2>
    <p class="spec">{spec}</p>
  </header>

  <div class="pair">
    <figure>
      <div class="box original" style={`--aspect: ${aspect}; aspect-ratio: ${aspect}`}>
        <QftFrames {stem} {step} alt={`${title}, as published in 2011`} />
      </div>
      <figcaption>Home of Poi, 2011</figcaption>
    </figure>

    <figure>
      <div class="box stage">
        <QftStage {knobs} {increments} {cursor} {pendulum} />
      </div>
      <figcaption>computed from the same rules</figcaption>
    </figure>
  </div>

  <div class="notation">
    <QftTable {increments} activeStep={step} {compact} />
  </div>
</section>

<style>
  /*
   * One concept per screen. dvh rather than vh so a phone's collapsing address
   * bar does not leave the unit taller than the space it actually has.
   */
  .unit {
    min-height: 100dvh;
    scroll-snap-align: start;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: clamp(1rem, 2.5vh, 2rem);
    padding-block: clamp(1.5rem, 4vh, 4rem);
  }

  header {
    text-align: center;
  }

  h2 {
    margin: 0;
    font-size: clamp(1.5rem, 1.1rem + 1.4vw, 2.4rem);
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .spec {
    margin: 0.5rem 0 0;
    font-size: 0.9rem;
    color: var(--semantic-text-secondary, rgb(255 255 255 / 0.6));
    font-variant-numeric: tabular-nums;
  }

  /*
   * Two content-sized columns, centred. Stretching each half to half the page
   * band strands them against opposite edges with a canyon between; sizing to
   * the pair keeps them readable as one comparison. Height is the real
   * constraint here, so the box is driven by available height and only capped
   * by width.
   */
  .pair {
    display: grid;
    grid-template-columns: repeat(2, auto);
    justify-content: center;
    align-items: center;
    gap: clamp(1rem, 3vw, 3rem);
  }

  figure {
    margin: 0;
  }

  /*
   * Height is the shared measure, so the two halves line up regardless of the
   * original's proportions. The stage stays square; the archive card takes
   * whatever shape its frames actually have.
   */
  .box {
    height: var(--box-h);
    aspect-ratio: 1;
  }

  .pair {
    --box-h: clamp(9rem, 34vh, 26rem);
  }

  /*
   * Driven by width, not height, so a wide drawing (triquetra is 421x265) does
   * not balloon across the row when the shared height grows. The cap keeps the
   * pair from crowding out the notation beside it.
   */
  .box.original {
    height: auto;
    width: min(calc(var(--box-h) * var(--aspect)), calc(var(--box-h) * 1.15));
  }

  .stage {
    display: grid;
    place-items: center;
  }

  figcaption {
    margin-top: 0.6rem;
    text-align: center;
    font-size: 0.8rem;
    color: var(--semantic-text-secondary, rgb(255 255 255 / 0.5));
  }

  .notation {
    display: flex;
    justify-content: center;
  }

  .notation > :global(*) {
    width: 100%;
  }

  /*
   * Big screens use both axes. Stacking title, pair and table down the middle
   * leaves a narrow island in a tall dark field — the arrangement reads as a
   * phone layout that happened to be opened on a monitor. Side by side, with
   * the animations scaled to the height available, the concept fills the screen
   * it was given.
   */
  @media (min-width: 105rem) and (min-height: 50rem) {
    .unit {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      grid-template-areas: "head head" "pair notation";
      align-content: center;
      justify-content: center;
      column-gap: clamp(2rem, 4vw, 5rem);
      row-gap: 1.5rem;
    }

    header {
      grid-area: head;
      margin-bottom: 1rem;
    }

    .pair {
      grid-area: pair;
      align-self: center;
    }

    .notation {
      grid-area: notation;
      align-self: end;
    }

    .pair {
      --box-h: clamp(16rem, 42vh, 34rem);
    }
  }

  /* Wide and short — the fold-open landscape case. Pair beside the notation. */
  @media (min-width: 48rem) and (max-height: 34rem) {
    .unit {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      grid-template-areas: "head head" "pair notation";
      align-content: center;
      column-gap: 2rem;
    }

    header {
      grid-area: head;
    }

    .pair {
      grid-area: pair;
    }

    .notation {
      grid-area: notation;
    }
  }

  /* Portrait phones: one animation at a time would halve the comparison, so
     both stay side by side and the notation collapses instead. */
  @media (max-width: 30rem) {
    .pair {
      --box-h: clamp(7rem, 34vw, 12rem);
    }
  }
</style>
