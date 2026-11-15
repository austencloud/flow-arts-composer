<!-- packages/shape-engine/src/app/components/ShapeMatrixDifficultyControl.svelte
  Difficulty, in the header's instrument band beside Notation.

  It stood on a strip of its own above the grid for a while, so the press and
  the change were one glance apart. The strip cost the Matrix a whole row the
  Ratio Playground never has, and switching between the two surfaces made the
  Matrix's pane read as the busier one. So the control is back in the band
  with the other setting that shapes the whole surface, as one bento cell in
  the shell's grammar: a caption over its control.

  The lesson from the strip stays. Pressing a bare numeral changed the grid
  and said nothing, and only the pressed level was ever named. So each badge
  now carries the same small picture the phone's tiles show (how much of a
  turn one step adds) and its level's name beneath, and the four read side by
  side before anyone presses. They stay within the cell's old width: the
  picture sits beside the numeral and the name wraps under both. Levels are a
  Kinetic Alphabet idea and most people who open this page have never met
  one; the question mark opens the full four-level explanation in About,
  where the rest of the vocabulary already lives. -->
<script lang="ts">
  import { s as t } from "../../strings.svelte.js";
  import LevelSelector from "#lib/shared/components/LevelSelector.svelte";
  import { getShapeMatrixAppContext } from "../context/shape-matrix-app-context";
  import { localizedLevelTileDescription } from "../../services/shape-matrix-display";
  import { SHAPE_MATRIX_LEVELS } from "../shape-matrix-levels";
  import TurnStepGlyph from "./TurnStepGlyph.svelte";

  const appState = getShapeMatrixAppContext();
</script>

<!-- .control-cell and .control-label are the band's own grammar, styled by
     the shell for every cell in the band. -->
<div class="control-cell difficulty-control">
  <span class="control-label" id="shape-matrix-difficulty-label"
    >{t("shape_engine_difficulty")}</span
  >
  <div class="control-row">
    <LevelSelector
      value={appState.level}
      levels={SHAPE_MATRIX_LEVELS}
      describe={localizedLevelTileDescription}
      onchange={appState.setLevel}
      tiles={true}
      ariaLabel={t("shape_engine_difficulty_level")}
    >
      {#snippet glyph(level)}<TurnStepGlyph {level} />{/snippet}
    </LevelSelector>
    <button
      type="button"
      class="control-info"
      aria-label={t("shape_engine_difficulty_help")}
      title={t("shape_engine_difficulty_help")}
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

  .control-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  /* LevelSelector's tiles stack picture, numeral and name for a phone
     popover with height to spare. The band has width to spare instead, so
     the picture and numeral share the top line and the name takes the line
     (or two) under them. Columns are fixed, so pressing never resizes. */
  .control-row :global(.level-selector.tiles) {
    grid-template-columns: repeat(var(--level-count, 4), 4.25rem);
    gap: 0.3rem;
  }

  .control-row :global(.level-selector.tiles .lvl) {
    display: grid;
    grid-template-columns: auto auto;
    grid-template-areas:
      "glyph numeral"
      "name name";
    justify-content: center;
    align-content: start;
    align-items: center;
    gap: 0.15rem 0.25rem;
    padding: 0.3rem 0.2rem 0.35rem;
  }

  .control-row :global(.level-selector.tiles .glyph) {
    grid-area: glyph;
    width: 1.45rem;
    height: 1.45rem;
  }

  .control-row :global(.level-selector.tiles .numeral) {
    grid-area: numeral;
    width: 1.2rem;
    height: 1.2rem;
    font-size: var(--font-size-compact, 0.75rem);
  }

  .control-row :global(.level-selector.tiles .name) {
    grid-area: name;
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.1;
    overflow-wrap: anywhere;
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
    transition: color var(--duration-fast) var(--ease-standard);
  }

  .control-info:hover,
  .control-info:focus-visible {
    color: var(--theme-accent, #f59e0b);
  }

  .control-info:focus-visible {
    outline: 2px solid var(--theme-accent, #f59e0b);
    outline-offset: 2px;
  }

  /* Small laptops, the shell's tightest wide tier: the band only just fits,
     so the question mark steps out. About stays in the top actions and opens
     the same explanation. */
  @container shape-matrix-app (75rem <= width < 84.5rem) and (height >= 42rem) {
    .control-info {
      display: none;
    }
  }
</style>
