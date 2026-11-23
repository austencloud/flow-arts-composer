<script lang="ts">
  /**
   * One TKA glyph drawn large, from the app's own glyph parts: the letter
   * artwork (TKAGlyph), its turn numbers (TurnsColumn) and the same/opp dot
   * (DirectionDot), placed the way PictographRenderer places them in a
   * pictograph's corner. The figure the Glyphs / PADS section uses to show
   * how a glyph carries turns.
   */
  import TKAGlyph, {
    getLetterDimensions,
    preloadLetterDimensions,
  } from "#lib/shared/pictograph/tka-glyph/components/TKAGlyph.svelte";
  import TurnsColumn from "#lib/shared/pictograph/tka-glyph/components/TurnsColumn.svelte";
  import DirectionDot from "#lib/shared/pictograph/tka-glyph/components/DirectionDot.svelte";
  import { parseTurnsTuple } from "#lib/shared/pictograph/tka-glyph/utils/turn-tuple-parser";
  import { getTurnsColumnRightExtent } from "#lib/shared/pictograph/tka-glyph/utils/turn-position-calculator";
  import { turnsTupleGenerator } from "#lib/shared/pictograph/arrow/positioning/placement/services/turns-tuple-generator";
  import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

  let {
    data,
    label,
  }: {
    data: PictographData;
    /** Spoken description for assistive tech. */
    label: string;
  } = $props();

  const letter = $derived(data.letter ?? null);
  const turnsTuple = $derived.by(() => {
    try {
      return turnsTupleGenerator.generateTurnsTuple(data);
    } catch {
      return "(0, 0)";
    }
  });
  const parsed = $derived(parseTurnsTuple(turnsTuple));

  let loaded = $state({ width: 100, height: 100 });
  $effect(() => {
    const l = letter;
    if (!l) return;
    let stale = false;
    preloadLetterDimensions([l]).then(() => {
      if (!stale) loaded = getLetterDimensions(l);
    });
    return () => {
      stale = true;
    };
  });
  const dims = $derived.by(() => {
    if (!letter) return loaded;
    const cached = getLetterDimensions(letter);
    return cached.width !== 100 || cached.height !== 100 ? cached : loaded;
  });

  const settings = getSettings();
  const leftColor = $derived(settings.primaryPropColors?.left);
  const rightColor = $derived(settings.primaryPropColors?.right);

  // The glyph's own origin in a pictograph is (50, 800); frame it with room
  // for the turn numbers on the right and above/below the letter.
  const PAD_X = 24;
  const PAD_Y = 44;
  const extent = $derived(getTurnsColumnRightExtent(parsed));
  const vbX = 50 - PAD_X;
  const vbY = $derived(800 - PAD_Y);
  const vbW = $derived(dims.width + extent + PAD_X * 2);
  const vbH = $derived(dims.height + PAD_Y * 2);
</script>

<svg
  class="glyph-mark"
  viewBox="{vbX} {vbY} {vbW} {vbH}"
  role="img"
  aria-label={label}
>
  <TKAGlyph {letter} pictographData={data} darkMode={true} />
  <TurnsColumn
    leftColorOverride={leftColor}
    rightColorOverride={rightColor}
    darkMode={true}
    {turnsTuple}
    {letter}
    pictographData={data}
  />
  {#if letter}
    <DirectionDot
      direction={parsed.direction}
      {letter}
      letterDimensions={dims}
      darkMode={true}
    />
  {/if}
</svg>

<style>
  .glyph-mark {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
