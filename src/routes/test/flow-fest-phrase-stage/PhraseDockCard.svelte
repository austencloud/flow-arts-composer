<script lang="ts">
  /**
   * One spinner's card in the stage's sequence dock: who they are, what they
   * are doing, and the library sequence they are playing, drawn the way the
   * Composer draws it (the word, then the step grid with the current step
   * lit). The card is the proof that the spinner plays a real library
   * sequence, so the artifact carries its weight.
   *
   * Geometry is reserved: the step grid's box is two rows of a fixed cell
   * whatever the sequence's length, so a phrase change never resizes the dock
   * or the stage above it. The new sequence crossfades in.
   */
  import WordHeader from "#lib/shared/animation-engine/components/layers/WordHeader.svelte";
  import AnimationStepGrid from "#lib/shared/animation-engine/components/AnimationStepGrid.svelte";
  import TkaLabel from "#lib/shared/components/TkaLabel.svelte";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { ScheduledPhrase } from "#lib/features/flow-fest-sim/domain/flow-fest-phrase-brain.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { simplifyAndTruncate } from "#lib/shared/foundation/utils/word-simplifier.js";

  interface Props {
    name: string;
    /** One line: "Techer · clean". */
    personality: string;
    phrase: ScheduledPhrase | null;
    /** Which phrase this is, so the swap keys on the phrase, not the word. */
    phraseKey: string;
    /** The phrase's sequence, start placement first, as the step grid reads it. */
    sequence: SequenceData | null;
    /** The step playing now, 0 for the first. */
    stepIndex: number;
    nextWord: string | null;
  }

  let {
    name,
    personality,
    phrase,
    phraseKey,
    sequence,
    stepIndex,
    nextWord,
  }: Props = $props();

  const MODE_LABEL = {
    planted: "Planted",
    turning: "Turning",
    travelling: "Walking",
  } as const;
  const PLANE_LABEL = { wall: "Wall", wheel: "Wheel", floor: "Floor" } as const;

  // Each staff has its own plane per beat: one word when they agree, both
  // when they differ. The ghost holds the longest so the row never shifts.
  const planesLabel = $derived.by(() => {
    if (!phrase) return "";
    const n = phrase.beatPlanes.length;
    const planes = n ? phrase.beatPlanes[Math.min(stepIndex, n - 1)]! : null;
    if (!planes) return PLANE_LABEL[phrase.plane];
    if (planes.left === planes.right) return PLANE_LABEL[planes.left];
    return `Left ${planes.left}, right ${planes.right}`;
  });

  const playing = $derived(phrase !== null && !phrase.rest);
  const stepCount = $derived(Math.max(1, (sequence?.steps.length ?? 1) - 1));
  // Up to eight steps in one row, more in two even rows, so sixteen steps
  // read as two bars of eight rather than five, five, five and one.
  const columnsFor = (count: number) =>
    count <= 8 ? count : Math.ceil(count / 2);
  const columns = $derived(columnsFor(stepCount));

  // The truncation ellipsis is not a letter, so a word carrying it reads as
  // plain text to TkaLabel. Draw the kept letters as glyphs and the ellipsis
  // beside them.
  const nextShown = $derived(nextWord ? simplifyAndTruncate(nextWord, 8) : "");
  const nextCut = $derived(nextShown.endsWith("..."));
  const nextGlyphs = $derived(nextCut ? nextShown.slice(0, -3) : nextShown);
</script>

<article class="card" aria-label={`${name}: ${personality}`}>
  <div class="layout">
    <header class="who">
      <div class="identity">
        <h2>{name}</h2>
        <p class="personality">{personality}</p>
      </div>
      <p class="state" aria-live="polite">
        {#if phrase}
          <span>{phrase.rest ? "Resting" : MODE_LABEL[phrase.mode]}</span>
          <span aria-hidden="true">·</span>
          <span class="planes">
            <span class="ghost" aria-hidden="true">Left wheel, right wheel</span
            >
            <span>{planesLabel}</span>
          </span>
        {/if}
      </p>
    </header>

    <div class="word">
      <WordHeader
        word={sequence?.word ?? null}
        visible={sequence !== null}
        darkMode
        presentation="chrome"
        activeStepNumber={playing ? stepIndex + 1 : null}
      />
    </div>

    <div
      class="steps"
      style:--columns={columns}
      aria-label={sequence
        ? `Step ${stepIndex + 1} of ${stepCount}`
        : "Waiting for the first phrase"}
    >
      <Crossfade key={phraseKey} duration={DURATION.normal} fill>
        <AnimationStepGrid
          sequenceData={sequence}
          currentStep={stepIndex}
          isPlaying={playing}
          columns={columnsFor}
          cell="pictograph"
          propType={PropType.FIRE_DOUBLE_STAFF}
        />
      </Crossfade>
    </div>

    <p class="next">
      <span class="next-label">Next</span>
      <span class="next-word">
        {#if nextGlyphs}
          <TkaLabel text={nextGlyphs} darkMode fitToParent />
        {/if}
      </span>
      {#if nextCut}<span class="next-more" aria-hidden="true">…</span>{/if}
    </p>
  </div>
</article>

<style>
  .card {
    container: phrase-card / inline-size;
    padding: var(--phrase-card-pad, 12px);
    border-radius: 12px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    color: var(--theme-text);
    min-width: 0;
  }

  .layout {
    /* One cell size for every sequence length: the grid's box never changes.
       The step grid pads itself by 8px a side. */
    --gap: 4px;
    --grid-room: 100cqw;
    --cell: min(72px, calc((var(--grid-room) - 16px - 7 * var(--gap)) / 8));
    display: grid;
    grid-template-areas:
      "who"
      "word"
      "steps"
      "next";
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
  }

  .who {
    grid-area: who;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
  }

  .identity {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }

  h2 {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    white-space: nowrap;
  }

  .personality,
  .state {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim);
    white-space: nowrap;
  }

  .state {
    display: flex;
    gap: 6px;
    letter-spacing: 0.02em;
  }

  .planes {
    display: inline-grid;
  }

  .planes > * {
    grid-area: 1 / 1;
  }

  .ghost {
    visibility: hidden;
  }

  .word {
    grid-area: word;
    min-width: 0;
    min-height: 32px;
    display: flex;
    align-items: center;
  }

  .steps {
    grid-area: steps;
    position: relative;
    /* Two rows of cells plus the grid's own padding, whatever the length. */
    height: calc(2 * var(--cell) + var(--gap) + 16px);
    --step-grid-max-width: calc(
      var(--columns) * var(--cell) + (var(--columns) - 1) * var(--gap)
    );
  }

  .next {
    grid-area: next;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 20px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim);
  }

  .next-label {
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .next-word {
    flex: 0 1 auto;
    min-width: 0;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text);
    opacity: 0.85;
  }

  .next-more {
    flex: none;
    color: var(--theme-text);
  }

  /* A wide card puts the words beside the grid, so the dock stays short and
     the grid gets the width. */
  @container phrase-card (min-width: 520px) {
    .layout {
      --side: 11rem;
      --grid-room: calc(100cqw - var(--side) - 16px);
      grid-template-areas:
        "who steps"
        "word steps"
        "next steps";
      grid-template-columns: var(--side) minmax(0, 1fr);
      grid-template-rows: auto 1fr auto;
      column-gap: 16px;
    }

    .who {
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
    }

    .identity {
      flex-direction: column;
      gap: 0;
    }
  }
</style>
