<!-- src/lib/shared/shape-matrix/app/components/ShapeMatrixDifficultyStrip.svelte
  Difficulty, standing with the grid it reshapes.

  It used to sit in the page header among the settings that describe the whole
  app, which put the cause several inches from the effect: pressing 3 changed
  the grid and said nothing, because the selector was showing bare numerals and
  keeping the level's name in a tooltip. Here the press changes the grid
  directly below it and the caption underneath names what changed.

  Levels are a Kinetic Alphabet idea, and most people who open this page have
  never met one. The caption carries what this level adds; the question mark
  opens the full four-level explanation in About, which is where the rest of
  the vocabulary already lives. -->
<script lang="ts">
  import LevelSelector from "$lib/shared/components/LevelSelector.svelte";
  import { flyFade } from "$lib/shared/transitions/motion";
  import { getShapeMatrixAppContext } from "../context/shape-matrix-app-context";
  import {
    SHAPE_MATRIX_LEVELS,
    SHAPE_MATRIX_LEVEL_DESCRIPTIONS,
  } from "../shape-matrix-levels";

  const appState = getShapeMatrixAppContext();

  const current = $derived(SHAPE_MATRIX_LEVEL_DESCRIPTIONS[appState.level]);
</script>

<div class="difficulty-strip">
  <div class="strip-row">
    <span class="strip-label" id="shape-matrix-difficulty-label"
      >Difficulty</span
    >
    <LevelSelector
      value={appState.level}
      levels={SHAPE_MATRIX_LEVELS}
      describe={(level) => SHAPE_MATRIX_LEVEL_DESCRIPTIONS[level]}
      onchange={appState.setLevel}
      compact={true}
      ariaLabel="Difficulty level"
    />
    <button
      type="button"
      class="strip-info"
      aria-label="What the difficulty levels mean"
      title="What the difficulty levels mean"
      onclick={() => appState.openAbout("levels")}
    >
      <i class="fas fa-circle-question" aria-hidden="true"></i>
    </button>
  </div>

  <!-- Keyed on the level so the caption visibly turns over on a press: the
       complaint was that clicking a number appeared to do nothing. -->
  {#key appState.level}
    <p class="strip-caption" aria-live="polite" in:flyFade={{ y: -4 }}>
      <strong>{current.name}</strong>
      <span class="caption-blurb">{current.blurb}</span>
    </p>
  {/key}
</div>

<style>
  .difficulty-strip {
    display: grid;
    gap: 0.2rem;
    padding: 0.6rem 0.75rem 0.5rem;
    border-bottom: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.1));
    min-width: 0;
  }

  .strip-row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    min-width: 0;
  }

  .strip-label {
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--theme-text-dim, rgb(255 255 255 / 0.62));
    white-space: nowrap;
  }

  .strip-info {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    /* .fas is a fixed 1.25em box; the UA's button padding would push it off
       centre in a control this small. */
    padding: 0;
    width: 1.75rem;
    height: 1.75rem;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--theme-text-dim, rgb(255 255 255 / 0.62));
    font-size: 0.95rem;
    cursor: pointer;
    transition: color var(--duration-fast, 0.15s) ease;
  }

  .strip-info:hover,
  .strip-info:focus-visible {
    color: var(--theme-accent, #f59e0b);
  }

  .strip-info:focus-visible {
    outline: 2px solid var(--theme-accent, #f59e0b);
    outline-offset: 2px;
  }

  /* The caption is one line that changes on every press. It sits in the
     selector's own column so the eye finds it where the press landed. */
  .strip-caption {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin: 0;
    font-size: var(--font-size-min, 0.875rem);
    color: var(--theme-text, #fff);
    min-height: 1.35em;
  }

  .strip-caption strong {
    font-weight: 650;
  }

  .caption-blurb {
    color: var(--theme-text-dim, rgb(255 255 255 / 0.62));
  }
</style>
