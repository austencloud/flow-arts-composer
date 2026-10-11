<script lang="ts">
  import PropCompositionPreview from "#lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";
  import SequenceMandala from "#lib/shared/mandala/components/SequenceMandala.svelte";
  import { getLetterImagePath } from "#lib/shared/pictograph/tka-glyph/utils/letter-image-getter.js";
  import {
    ElementalType,
    getElementImagePath,
  } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
  import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { MandalaPathShape } from "#lib/shared/mandala/domain/mandala-types.js";

  /**
   * The picture inside a Display toggle: the layer the toggle governs, drawn
   * with the layer's own asset and the sequence's own content.
   *
   * ONE square field, 100 x 100, for every kind. That single decision is what
   * makes the panel cohere: eight tiles reading as eight views of the same
   * canvas with a different layer lit, instead of eight unrelated pictures each
   * at its own scale. A viewBox scales to fit its box and cannot spill out of
   * it, so no preview can overflow its tile or collide with its label, and
   * because every kind shares the field, none can arrive twice the size of its
   * neighbour.
   *
   * The compositions inside the field mirror where the layer actually lands:
   * grid, props, paths and mandala fill it, and the four edge marks are drawn
   * at the modest scale the canvas draws them, not blown up to fill a square
   * they never occupy.
   */
  type PreviewKind =
    | "grid"
    | "props"
    | "paths"
    | "mandala"
    | "tkaGlyph"
    | "element"
    | "stepNumber"
    | "progress"
    | "word";

  interface PreviewSequence {
    word?: string | null;
    steps?: ReadonlyArray<{ letter?: string | null }> | null;
  }

  let {
    kind,
    hand,
    gridMode = "8point",
    propType,
    pathShape = "arc",
    motionAware = false,
    darkMode = true,
    sequence = null,
  }: {
    kind: PreviewKind;
    hand?: "left" | "right";
    gridMode?: string;
    propType?: string;
    pathShape?: Exclude<MandalaPathShape, "hybrid">;
    motionAware?: boolean;
    darkMode?: boolean;
    sequence?: PreviewSequence | null;
  } = $props();

  // The grid asset the canvas would actually draw. Toggling the chip off sets
  // the mode to "none", so fall back to the mode the toggle turns back ON
  // rather than rendering an empty square while the layer is hidden.
  const gridAsset = $derived(
    `/images/grid/${gridMode && gridMode !== "none" ? gridMode : "8point"}_grid.svg`
  );

  /**
   * The grid asset is a 950-unit square whose visible points span 150..800 —
   * 30% of it is margin. Drawn to the field verbatim it becomes a scatter of
   * specks in the middle of nothing. These numbers crop to the points: the
   * source region 150..800 is mapped onto the field's full 0..100.
   */
  const GRID_CROP = { origin: 150, extent: 650, source: 950 };
  const gridScale = 100 / GRID_CROP.extent;
  const gridSize = GRID_CROP.source * gridScale;
  const gridInset = -GRID_CROP.origin * gridScale;

  const firstLetter = $derived(
    (sequence?.steps ?? []).map((s) => s?.letter).find(Boolean) ?? "A"
  );

  // LOOP words repeat by construction, so the raw word is the common case, not
  // the edge case. What the user sees is always the smallest form.
  const previewWord = $derived(
    simplifyRepeatedWord(sequence?.word || "AB") || "AB"
  );

  /**
   * Size the run to the field instead of stretching it to fit: font-size falls
   * as the word lengthens so a long word stays inside 88 units at its natural
   * proportions, and `textLength` then holds it there whatever the TKA font's
   * real advance widths turn out to be. Setting a big font-size and letting
   * textLength squeeze it would fit too, and would render condensed glyphs.
   */
  const wordFontSize = $derived(
    Math.min(38, 88 / (Math.max(previewWord.length, 1) * 0.62))
  );
  const wordLength = $derived(
    Math.min(88, previewWord.length * wordFontSize * 0.62)
  );

  const ELEMENTS = [
    ElementalType.WATER,
    ElementalType.FIRE,
    ElementalType.EARTH,
    ElementalType.AIR,
    ElementalType.SUN,
    ElementalType.MOON,
  ];

  // Six in a 3 x 2 block, centred in the field, so the family reads as a set
  // rather than as six specks.
  const ELEMENT_CELLS = ELEMENTS.map((element, i) => ({
    element,
    x: 8 + (i % 3) * 29,
    y: 21 + Math.floor(i / 3) * 32,
  }));

  /**
   * Two chords between grid points, bowing the way the active path shape bows.
   * Same geometry language as PathShapePanel's option glyphs, at the field's
   * scale so the curves land where the hands would actually travel. "By Motion"
   * shows one of each, which is what it means.
   */
  function chord(
    from: [number, number],
    to: [number, number],
    shape: string
  ): string {
    const mx = (from[0] + to[0]) / 2;
    const my = (from[1] + to[1]) / 2;
    if (shape === "linear") return `M${from[0]} ${from[1]} L${to[0]} ${to[1]}`;
    const dx = mx - 50;
    const dy = my - 50;
    const len = Math.hypot(dx, dy) || 1;
    const k = shape === "concave" ? -22 : 22;
    return `M${from[0]} ${from[1]} Q${mx + (dx / len) * k} ${
      my + (dy / len) * k
    } ${to[0]} ${to[1]}`;
  }

  const leftPath = $derived(
    chord([16, 74], [74, 16], motionAware ? "arc" : pathShape)
  );
  const rightPath = $derived(
    chord([84, 26], [26, 84], motionAware ? "concave" : pathShape)
  );
  const mandalaPathShape = $derived<MandalaPathShape>(
    motionAware ? "hybrid" : pathShape
  );
</script>

{#if kind === "props"}
  <div class="art embed">
    {#if propType}
      <PropCompositionPreview
        propType={propType as PropType}
        pairedGlyph={!!hand}
        singleHand={hand}
        size={100}
        darkBackground={darkMode}
      />
    {/if}
  </div>
{:else if kind === "grid"}
  <!-- The asset is drawn for a light canvas in black; on a dark panel it
       vanishes. Inverting is what the canvas itself does to it. -->
  <svg class="art" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
    <image
      href={gridAsset}
      x={gridInset}
      y={gridInset}
      width={gridSize}
      height={gridSize}
      class:invert={darkMode}
    />
  </svg>
{:else if kind === "paths"}
  <svg class="art" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
    <path d={leftPath} class="path-line blue" />
    <path d={rightPath} class="path-line red" />
    <circle cx="16" cy="74" r="6" class="dot blue" />
    <circle cx="74" cy="16" r="6" class="dot blue" />
    <circle cx="84" cy="26" r="6" class="dot red" />
    <circle cx="26" cy="84" r="6" class="dot red" />
  </svg>
{:else if kind === "mandala"}
  <div class="art embed">
    {#if sequence?.steps?.length}
      <SequenceMandala
        {sequence}
        size={100}
        animate={false}
        {darkMode}
        pathShape={mandalaPathShape}
      />
    {:else}
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        {#each [0, 45, 90, 135] as angle}
          <ellipse
            cx="50"
            cy="50"
            rx="46"
            ry="17"
            class="rosette"
            transform="rotate({angle} 50 50)"
          />
        {/each}
      </svg>
    {/if}
  </div>
{:else if kind === "tkaGlyph"}
  <!-- Inset, not full-bleed. The glyph sits in a corner of the canvas at about
       this fraction of it; filling the field would make one mark shout over
       the seven layers beside it. -->
  <svg class="art" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
    <image
      href={getLetterImagePath(firstLetter as Letter)}
      x="26"
      y="26"
      width="48"
      height="48"
      preserveAspectRatio="xMidYMid meet"
      class:invert={darkMode}
    />
  </svg>
{:else if kind === "element"}
  <!-- All six, because the layer draws a different one on every step. No
       single symbol represents it honestly; the family does. -->
  <svg class="art" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
    {#each ELEMENT_CELLS as cell (cell.element)}
      <image
        href={getElementImagePath(cell.element)}
        x={cell.x}
        y={cell.y}
        width="26"
        height="26"
        preserveAspectRatio="xMidYMid meet"
      />
    {/each}
  </svg>
{:else if kind === "stepNumber"}
  <!-- The canvas draws these in Georgia bold; so does this. -->
  <svg class="art" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
    <text x="50" y="59" class="step-text" textLength="68" lengthAdjust="spacing"
      >1 2 3</text
    >
  </svg>
{:else if kind === "progress"}
  <svg class="art" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
    <rect
      x="8"
      y="47"
      width="84"
      height="6"
      rx="3"
      fill="currentColor"
      opacity="0.2"
    />
    <rect x="8" y="47" width="52" height="6" rx="3" fill="currentColor" />
  </svg>
{:else if kind === "word"}
  <svg class="art" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
    <text
      x="50"
      y="50"
      dominant-baseline="central"
      class="word-text"
      font-size={wordFontSize}
      textLength={wordLength}
      lengthAdjust="spacingAndGlyphs">{previewWord}</text
    >
  </svg>
{/if}

<style>
  /* One box for every preview: a square, centred, never wider than the tile and
     never wider than the cap. The viewBox does the fitting, so this never has
     to know what is inside it, and a tile that grows past the cap gets margin
     around its picture rather than a picture stretched into a banner. */
  .art {
    width: 100%;
    max-width: var(--tile-art, 4rem);
    aspect-ratio: 1;
    margin-inline: auto;
    display: block;
    flex: 0 0 auto;
    overflow: hidden;
  }

  /* Kinds that embed a component rather than draw their own SVG. Whatever the
     component's outermost element is gets forced to the box rather than trusted
     to size itself: SequenceMandala pins a wrapper div to an inline `size`px
     square, which overflowed the tile at 71px and underfilled it at 112px. The
     rule targets the direct child so it lands on that wrapper, and the inner
     rule covers a component that renders its svg bare. */
  .embed {
    display: grid;
    place-items: center;
  }

  .embed > :global(*) {
    width: 100% !important;
    height: 100% !important;
  }

  .embed :global(svg),
  .embed :global(canvas) {
    width: 100% !important;
    height: 100% !important;
    display: block;
  }

  .invert {
    filter: invert(1) brightness(1.6);
  }

  .step-text,
  .word-text {
    text-anchor: middle;
    fill: currentColor;
  }

  .step-text {
    font-family: Georgia, serif;
    font-weight: 700;
    font-size: 26px;
  }

  .word-text {
    font-family: "TKA Letters", Georgia, serif;
  }

  .path-line {
    fill: none;
    stroke-width: 7;
    stroke-linecap: round;
  }

  .path-line.blue {
    stroke: var(--prop-blue, #2196f3);
  }

  .path-line.red {
    stroke: var(--prop-red, #f44336);
  }

  .dot.blue {
    fill: var(--prop-blue, #2196f3);
  }

  .dot.red {
    fill: var(--prop-red, #f44336);
  }

  .rosette {
    fill: none;
    stroke: currentColor;
    stroke-width: 3;
    opacity: 0.55;
  }
</style>
