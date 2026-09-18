<!-- src/lib/shared/shape-matrix/app/components/ShapeMatrixDifficultyControl.svelte
  Difficulty, in the header's instrument band beside Notation.

  It stood on a strip of its own above the grid for a while, so the press and
  the change were one glance apart. The strip cost the Matrix a whole row the
  Ratio Playground never has, and switching between the two surfaces made the
  Matrix's pane read as the busier one. So the control is back in the band
  with the other setting that shapes the whole surface, as one bento cell in
  the shell's grammar: a caption over its control.

  The lesson from the strip stays. Pressing a bare numeral changed the grid
  and said nothing, so the caption carries the level's name and turns over on
  every press. Levels are a Kinetic Alphabet idea and most people who open
  this page have never met one; the question mark opens the full four-level
  explanation in About, where the rest of the vocabulary already lives. -->
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

<!-- .control-cell and .control-label are the band's own grammar, styled by
     the shell for every cell in the band. -->
<div class="control-cell difficulty-control">
  <span class="control-caption">
    <span class="control-label" id="shape-matrix-difficulty-label"
      >Difficulty</span
    >
    <!-- The name changes width with the level. Every name sits hidden in the
         same cell as the live one, so the slot is always as wide as the
         widest and nothing beside it moves on a press. The live region is the
         stable slot, not the keyed name, so the announcement lands. -->
    <span class="level-name-slot" aria-live="polite">
      {#each SHAPE_MATRIX_LEVELS as level (level)}
        <span class="level-name ghost" aria-hidden="true"
          >{SHAPE_MATRIX_LEVEL_DESCRIPTIONS[level].name}</span
        >
      {/each}
      {#key appState.level}
        <span class="level-name" in:flyFade={{ y: -4 }}>{current.name}</span>
      {/key}
    </span>
  </span>
  <div class="control-row">
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
      class="control-info"
      aria-label="What the difficulty levels mean"
      title="What the difficulty levels mean"
      onclick={() => appState.openAbout("levels")}
    >
      <i class="fas fa-circle-question" aria-hidden="true"></i>
    </button>
  </div>
</div>

<style>
  .difficulty-control {
    flex: 0 0 auto;
  }

  .control-caption {
    display: flex;
    align-items: baseline;
    gap: 0.45rem;
    min-width: 0;
  }

  .level-name-slot {
    display: grid;
    min-width: 0;
  }

  .level-name-slot > * {
    grid-area: 1 / 1;
  }

  .level-name {
    color: var(--theme-text, #fff);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 650;
    letter-spacing: 0.01em;
    white-space: nowrap;
  }

  .level-name.ghost {
    visibility: hidden;
  }

  .control-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  /* The badges sit on the band's control height, like the segmented
     controls beside them, rather than LevelSelector's taller own. */
  .control-row :global(.lvl) {
    flex: 0 0 auto;
    min-width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
  }

  .control-info {
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

  .control-info:hover,
  .control-info:focus-visible {
    color: var(--theme-accent, #f59e0b);
  }

  .control-info:focus-visible {
    outline: 2px solid var(--theme-accent, #f59e0b);
    outline-offset: 2px;
  }
</style>
