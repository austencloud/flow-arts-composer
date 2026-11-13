<!--
  MandalaLevels: the By mandala screen. Six levels, simple to complex, with
  pictures of the mandalas sequences at the chosen level draw, and one button
  that shows those sequences.

  A fixed frame: the heading row, the pictures, and the controls under them.
  Nothing scrolls. The pictures keep one size on every level: the grid has as
  many places as the level with the fewest mandalas fills
  (`steadyPictureCount`), as many whole rows as fit (`fitLevelPictures`).
  Each picture is a real sequence's mandala at that level (`levelExamples`),
  drawn in the hands' colours, and a tap on one opens that sequence.

  The slider's stops are pictures too: each level's own face (`levelFace`, a
  typical mandala from the middle of the level) stands over its stop, so the
  six levels read at a glance. A tap on a face goes to its level; the track
  under the faces takes drags and keys. On a wide screen each face carries
  its level's name; on a narrow one the chosen level's name sits above.
  The pictures change with a crossfade.
-->
<script lang="ts">
  import { t, type TranslationKey } from "#lib/shared/i18n/i18n.svelte.js";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import MandalaStill from "#lib/shared/mandala/components/MandalaStill.svelte";
  import ShimmerBlock from "#lib/shared/components/loading/ShimmerBlock.svelte";
  import ValueSlider from "#lib/shared/ui/components/ValueSlider.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import type { MandalaPaths } from "#lib/shared/mandala/domain/mandala-types.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
  import { stripWordNotation } from "#lib/shared/foundation/utils/word-notation.js";
  import { MANDALA_LEVEL_COUNT } from "#lib/shared/browse/services/sequence-density.js";
  import {
    fitLevelPictures,
    levelExamples,
    levelFace,
    steadyPictureCount,
    type MandalaLevel,
  } from "./mandala-levels";

  interface Props {
    /** Every level, simplest first; empty until `ready`. */
    levels: readonly MandalaLevel[];
    /** The level the slider rests on. */
    level: number;
    /** False while the pool is measured: placeholders hold the frame. */
    ready: boolean;
    /** The source has no sequences at all. */
    empty: boolean;
    pathsOf: (key: string) => MandalaPaths | undefined;
    onLevel: (level: number) => void;
    onShow: () => void;
    /** Open one sequence, from a tap on its mandala. */
    onOpen: (sequence: SequenceData) => void;
    onBack: () => void;
  }

  let {
    levels,
    level,
    ready,
    empty,
    pathsOf,
    onLevel,
    onShow,
    onOpen,
    onBack,
  }: Props = $props();

  /** A picture's least width: 148px, growing to 232px with the area (9% of
   *  its width) so a wide screen gets bigger pictures, not just more; a
   *  phone gets at least three across. The wall's sizes, chosen by eye. */
  const MIN_BOX_PX = 148;
  const MAX_MIN_BOX_PX = 232;
  const GAP_PX = 10;
  /** The widths stills are drawn for, so a resize does not redraw every one. */
  const STILL_SIZES = [128, 160, 200, 256, 320] as const;
  /** One drawing serves every face. */
  const FACE_STILL_PX = 160;
  /** From this column width the button stands beside the picture stops. */
  const WIDE_DOCK_PX = 640;
  const BUTTON_COL_PX = 240;
  /** The stops have room for every level's name from this width. */
  const NAMED_SCALE_PX = 640;
  const STOPS = Array.from({ length: MANDALA_LEVEL_COUNT }, (_, i) => i + 1);
  /** Each level's name, by how its mandalas look. */
  const LEVEL_NAMES: readonly TranslationKey[] = [
    "browse_mandala_level_name_1",
    "browse_mandala_level_name_2",
    "browse_mandala_level_name_3",
    "browse_mandala_level_name_4",
    "browse_mandala_level_name_5",
    "browse_mandala_level_name_6",
  ];

  let areaWidth = $state(0);
  let areaHeight = $state(0);
  let dockWidth = $state(0);

  /**
   * The controls, sized from their own column's width alone. The pictures
   * are fitted to the height the controls leave, so sizing the controls by
   * the pictures would let each keep resizing the other. A face is as big as
   * six fit across with their gaps, 36px up to 96px (4% of the column on a
   * very wide screen).
   */
  const dock = $derived.by(() => {
    const width = Math.max(0, dockWidth);
    const wide = width >= WIDE_DOCK_PX;
    const columnGap = wide
      ? Math.round(Math.min(48, Math.max(24, width * 0.03)))
      : 0;
    const scale = wide ? width - BUTTON_COL_PX - columnGap : width;
    const faceGap = Math.round(Math.min(16, Math.max(6, scale * 0.015)));
    const most = Math.max(96, width * 0.04);
    const face = Math.floor(
      Math.min(most, Math.max(36, (scale - 5 * faceGap) / 6))
    );
    const need =
      6 * face + 5 * faceGap + (wide ? BUTTON_COL_PX + columnGap : 0);
    return {
      wide,
      columnGap,
      faceGap,
      face,
      named: scale >= NAMED_SCALE_PX,
      need,
    };
  });

  /** The area's own places: as many boxes of its smallest size as fit. */
  const areaLayout = $derived.by(() => {
    const width = Math.max(0, areaWidth);
    const height = Math.max(0, areaHeight);
    const least = Math.min(
      Math.min(MAX_MIN_BOX_PX, Math.max(MIN_BOX_PX, width * 0.09)),
      (width - 2 * GAP_PX) / 3
    );
    let cols = Math.max(
      1,
      Math.floor((width + GAP_PX) / (Math.max(1, least) + GAP_PX))
    );
    let box = (width - (cols - 1) * GAP_PX) / cols;
    // A short area still gets one whole row, and the room the smaller
    // pictures leave across it takes more of them.
    if (box > height) {
      box = height;
      cols = Math.max(
        cols,
        Math.floor((width + GAP_PX) / (Math.max(1, box) + GAP_PX))
      );
    }
    const rows = Math.max(
      1,
      Math.floor((height + GAP_PX) / (Math.max(1, box) + GAP_PX))
    );
    return { cols, rows, box: Math.max(0, Math.floor(box)) };
  });
  const current = $derived(levels[level - 1]);
  const count = $derived(current?.count ?? 0);
  const total = $derived(levels.reduce((sum, entry) => sum + entry.count, 0));
  /** One set of places for every level, so the grid holds still as he slides. */
  const places = $derived(steadyPictureCount(levels));
  const layout = $derived(
    ready && places > 0
      ? fitLevelPictures(
          Math.max(0, areaWidth),
          Math.max(0, areaHeight),
          GAP_PX,
          places,
          areaLayout
        )
      : areaLayout
  );
  const gridWidth = $derived(
    layout.cols * layout.box + (layout.cols - 1) * GAP_PX
  );
  /** The controls span the pictures' width, so their edges line up with the
   *  grid's, unless the stops need more room. Only their width follows. */
  const footWidth = $derived(
    Math.min(dockWidth, Math.max(gridWidth, dock.need, 320))
  );
  const stillSize = $derived(
    STILL_SIZES.find((size) => size >= layout.box) ??
      STILL_SIZES[STILL_SIZES.length - 1]
  );
  const examples = $derived(
    current ? levelExamples(current.shapes, layout.cols * layout.rows) : []
  );
  const faces = $derived(
    STOPS.map((stop) => levelFace(levels[stop - 1]?.shapes ?? []))
  );

  function levelName(at: number): string {
    return t(LEVEL_NAMES[at - 1] ?? LEVEL_NAMES[0]!);
  }
  function levelNumber(at: number): string {
    return t("browse_mandala_level_of", {
      level: at,
      total: MANDALA_LEVEL_COUNT,
    });
  }
  function countText(n: number): string {
    return n === 1
      ? t("browse_ui_mandala_one_sequence")
      : t("browse_ui_mandala_sequences", { count: n.toLocaleString() });
  }
  function spoken(at: number): string {
    const stop = Math.round(at);
    const entry = levels[stop - 1];
    const named = `${levelNumber(stop)}, ${levelName(stop)}`;
    return entry ? `${named}, ${countText(entry.count)}` : named;
  }
  const showLabel = $derived(
    count === 1
      ? t("browse_mandala_show_one")
      : t("browse_mandala_show_many", { count: count.toLocaleString() })
  );

  /** The word a picture's sequence goes by, plain letters for a small label. */
  function wordOf(sequence: SequenceData | undefined): string {
    if (!sequence) return "";
    return stripWordNotation(
      simplifyRepeatedWord(sequence.word ?? sequence.name ?? "")
    );
  }

  function trackArea(node: HTMLElement) {
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      areaWidth = entry.contentRect.width;
      areaHeight = entry.contentRect.height;
    });
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }

  function trackDock(node: HTMLElement) {
    const observer = new ResizeObserver(([entry]) => {
      if (entry) dockWidth = entry.contentRect.width;
    });
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }

  function choose(next: number): void {
    const at = Math.min(MANDALA_LEVEL_COUNT, Math.max(1, Math.round(next)));
    if (at !== level) onLevel(at);
  }
</script>

<div class="mandala-levels" style:--gap="{GAP_PX}px">
  <header class="levels-head">
    <button
      class="place-box"
      type="button"
      aria-label={t("common_back")}
      onclick={onBack}
    >
      <i class="fas fa-arrow-left" aria-hidden="true"></i>
    </button>
    <div class="levels-words">
      <h2 tabindex="-1">{t("browse_mandala_wall_title")}</h2>
      <p>{t("browse_mandala_levels_hint")}</p>
    </div>
  </header>

  <div class="levels-area" use:trackArea aria-busy={!ready}>
    {#if empty}
      <p class="levels-note" role="status">{t("browse_ui_no_mandalas")}</p>
    {:else if !ready}
      <div
        class="levels-grid"
        aria-hidden="true"
        style:--box="{areaLayout.box}px"
        style:--cols={areaLayout.cols}
      >
        {#each { length: areaLayout.cols * areaLayout.rows } as _, i (i)}
          <span class="level-picture placeholder">
            <ShimmerBlock height="100%" borderRadius="0" />
          </span>
        {/each}
      </div>
    {:else if total === 0}
      <p class="levels-note" role="status">
        {t("browse_mandala_levels_no_match")}
      </p>
    {:else}
      <Crossfade key={level} duration={DURATION.fast} fill>
        {#if examples.length > 0}
          <!-- Each level's grid carries its own sizes, so the one fading out
               keeps its look while the next level's pictures come in. -->
          <ul
            class="levels-grid"
            aria-label={t("browse_mandala_examples_name", {
              level: levelName(level),
            })}
            style:--box="{layout.box}px"
            style:--cols={layout.cols}
          >
            {#each examples as shape (shape.key)}
              {@const paths = pathsOf(shape.key)}
              {@const sequence = shape.sequences[0]}
              {@const word = wordOf(sequence)}
              <li class="level-picture">
                <button
                  type="button"
                  class="picture-open"
                  aria-label={t("browse_mandala_open_example", { word })}
                  disabled={!sequence}
                  onclick={() => sequence && onOpen(sequence)}
                >
                  {#if paths}
                    <span class="level-still">
                      <MandalaStill key={shape.key} {paths} size={stillSize} />
                    </span>
                  {/if}
                  {#if word}
                    <span class="picture-word" aria-hidden="true">{word}</span>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="levels-note" role="status">
            {t("browse_mandala_level_none")}
          </p>
        {/if}
      </Crossfade>
    {/if}
  </div>

  <div class="levels-dock" use:trackDock>
    <div
      class="levels-foot"
      class:wide={dock.wide}
      style:width={dockWidth > 0 ? `${footWidth}px` : undefined}
      style:--face="{dock.face}px"
      style:--face-gap="{dock.faceGap}px"
      style:--foot-gap="{dock.columnGap}px"
    >
      <div class="levels-scale" class:named={dock.named}>
        <div class="scale-body">
          <p class="levels-readout" aria-hidden="true">
            <span class="readout-name">{levelName(level)}</span>
            <span class="readout-number">{levelNumber(level)}</span>
          </p>
          <!-- The faces are the stops, for the eye and the pointer; the slider
             under them is the control a keyboard or screen reader uses. -->
          <div class="scale-faces" aria-hidden="true">
            {#each STOPS as stop (stop)}
              {@const face = faces[stop - 1]}
              {@const paths = face ? pathsOf(face.key) : undefined}
              <button
                type="button"
                class="scale-face"
                class:on={ready && stop === level}
                tabindex="-1"
                disabled={!ready || !face}
                onclick={() => choose(stop)}
              >
                {#if !ready}
                  <ShimmerBlock height="100%" borderRadius="0" />
                {:else if face && paths}
                  <span class="face-still">
                    <MandalaStill key={face.key} {paths} size={FACE_STILL_PX} />
                  </span>
                {/if}
              </button>
            {/each}
          </div>
          <div class="scale-track">
            <ValueSlider
              label={t("browse_ui_simple_to_complex")}
              value={level}
              min={1}
              max={MANDALA_LEVEL_COUNT}
              step={1}
              marks={STOPS}
              ends={[
                t("browse_ui_mandala_simple"),
                t("browse_ui_mandala_complex"),
              ]}
              valueText={spoken}
              disabled={!ready || empty || total === 0}
              onchange={choose}
            />
          </div>
          <div class="scale-names" aria-hidden="true">
            {#each STOPS as stop (stop)}
              <span class="scale-name" class:on={stop === level}
                >{levelName(stop)}</span
              >
            {/each}
          </div>
        </div>
      </div>
      <div class="levels-show">
        <PanelButton
          variant="primary"
          fullWidth
          disabled={!ready || count === 0}
          onclick={onShow}
        >
          {ready ? showLabel : t("browse_mandala_show_many", { count: "…" })}
        </PanelButton>
      </div>
    </div>
  </div>
</div>

<style>
  /* A fixed frame: heading, the pictures, the controls. Nothing scrolls. */
  .mandala-levels {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 0.75rem;
    width: 100%;
    height: 100%;
    padding: 0.75rem clamp(0.75rem, 2cqi, 1.5rem) 0.9rem;
    box-sizing: border-box;
    overflow: hidden;
  }

  .levels-head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }
  .levels-words {
    min-width: 0;
  }
  .levels-words h2 {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: 800;
    color: var(--theme-text, #e8edf6);
  }
  .levels-words h2:focus {
    outline: none;
  }
  .levels-words p {
    margin: 0.1rem 0 0;
    font-size: var(--font-size-sm);
    color: var(--theme-text-muted, #9aa6b8);
  }

  .levels-area {
    position: relative;
    min-height: 0;
    min-width: 0;
  }
  /* Whole rows of square pictures, centred in the area both ways; a level
     with fewer mandalas than places centres its last row too, so nothing
     sits in a corner. */
  .levels-grid {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-content: center;
    gap: var(--gap);
    max-width: calc(var(--cols) * var(--box) + (var(--cols) - 1) * var(--gap));
    height: 100%;
    margin: 0 auto;
    padding: 0;
    list-style: none;
  }
  /* A mandala sits on the pictograph's own ground, dark or light with the
     drawing, so the hands' colours read as they do on a card. */
  .level-picture {
    flex: none;
    width: var(--box);
    height: var(--box);
    position: relative;
  }
  .level-picture.placeholder {
    overflow: hidden;
    border-radius: 16px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }
  .picture-open {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 16px;
    background: var(--dm-pictograph-bg, #0a0a0f);
    color: inherit;
    font: inherit;
    cursor: pointer;
    transition:
      border-color var(--transition-fast),
      box-shadow var(--transition-fast),
      transform var(--transition-fast);
  }
  .picture-open:disabled {
    cursor: default;
  }
  .picture-open:active:not(:disabled) {
    transform: scale(0.97);
  }
  .picture-open:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }
  .level-still {
    position: absolute;
    inset: 6%;
  }
  /* The sequence's word, on hover or focus: what a tap opens. */
  .picture-word {
    position: absolute;
    left: 50%;
    bottom: 0.5rem;
    max-width: calc(100% - 1rem);
    padding: 0.2rem 0.6rem;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.78);
    color: #fff;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
    letter-spacing: 0.02em;
    white-space: nowrap;
    text-overflow: ellipsis;
    opacity: 0;
    transform: translateX(-50%);
    transition: opacity var(--transition-fast);
    pointer-events: none;
  }
  .picture-open:focus-visible .picture-word {
    opacity: 1;
  }
  @media (hover: hover) {
    .picture-open:hover:not(:disabled) {
      border-color: var(--theme-text, #e8edf6);
      box-shadow: 0 0 0 1px var(--theme-text, #e8edf6);
    }
    .picture-open:hover .picture-word {
      opacity: 1;
    }
  }
  .levels-note {
    display: grid;
    place-items: center;
    height: 100%;
    margin: 0;
    padding: 1rem;
    text-align: center;
    font-size: var(--font-size-base);
    color: var(--theme-text-muted, #9aa6b8);
  }

  /* The controls (their width and --face come from the script): the picture
     stops over the button on a narrow screen, beside it on a wide one. */
  .levels-dock {
    display: grid;
    min-width: 0;
  }
  .levels-foot {
    display: grid;
    gap: 0.75rem;
    width: 100%;
    max-width: 100%;
    justify-self: center;
  }
  .levels-foot.wide {
    grid-template-columns: minmax(0, 1fr) 15rem;
    align-items: center;
    column-gap: var(--foot-gap);
  }
  .levels-scale {
    min-width: 0;
  }
  /* The track under the faces runs from the first face's centre to the
     last's: it is inset by half a face, less half the slider's 1.25rem
     thumb, whose centre travels half a thumb in from each end
     (ValueSlider). */
  .scale-body {
    --slider-thumb: 1.25rem;
    display: grid;
    min-width: 0;
  }
  /* One line always, so the controls never change height with the words. */
  .levels-readout {
    display: flex;
    justify-content: center;
    align-items: baseline;
    column-gap: 0.6rem;
    min-width: 0;
    margin: 0 0 0.5rem;
    white-space: nowrap;
    color: var(--theme-text, #e8edf6);
  }
  .readout-name {
    flex: none;
    font-size: var(--font-size-lg, 1.125rem);
    font-weight: 800;
  }
  .readout-number {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: var(--font-size-sm);
    font-variant-numeric: tabular-nums;
    color: var(--theme-text-muted, #9aa6b8);
  }
  .scale-faces {
    display: flex;
    justify-content: space-between;
    padding-top: 0.25rem;
  }
  .scale-face {
    position: relative;
    flex: none;
    width: var(--face);
    height: var(--face);
    margin: 0;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 12px;
    background: var(--dm-pictograph-bg, #0a0a0f);
    cursor: pointer;
    opacity: 0.72;
    transition:
      opacity var(--transition-fast),
      transform var(--transition-fast),
      box-shadow var(--transition-fast),
      border-color var(--transition-fast);
  }
  .scale-face:disabled {
    cursor: default;
    opacity: 0.35;
  }
  .scale-face.on {
    opacity: 1;
    border-color: var(--theme-text, #e8edf6);
    box-shadow:
      0 0 0 1px var(--theme-text, #e8edf6),
      0 0 0 5px var(--theme-accent-glow, rgba(125, 116, 224, 0.4));
    transform: scale(1.08);
  }
  @media (hover: hover) {
    .scale-face:hover:not(:disabled):not(.on) {
      opacity: 1;
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
    }
  }
  .face-still {
    position: absolute;
    inset: 6%;
  }
  .scale-track {
    margin: -0.375rem calc((var(--face) - var(--slider-thumb)) / 2) 0;
  }
  .scale-names {
    display: none;
    justify-content: space-between;
    margin-top: -0.25rem;
  }
  .scale-name {
    display: flex;
    justify-content: center;
    flex: none;
    width: var(--face);
    white-space: nowrap;
    font-size: var(--font-size-sm);
    color: var(--theme-text-muted, #9aa6b8);
    transition: color var(--transition-fast);
  }
  .scale-name.on {
    color: var(--theme-text, #e8edf6);
    font-weight: 800;
  }
  /* Room for every name under its face: the names replace the readout and
     the slider's two end words. */
  .levels-scale.named .levels-readout {
    display: none;
  }
  .levels-scale.named .scale-track :global(.ends) {
    display: none;
  }
  .levels-scale.named .scale-names {
    display: flex;
  }

  .levels-show {
    width: 100%;
    max-width: 24rem;
    justify-self: center;
  }
  .levels-foot.wide .levels-show {
    max-width: none;
  }
  /* A short frame (a small phone): the hint gives its line to the pictures. */
  @container (max-height: 560px) {
    .mandala-levels {
      row-gap: 0.5rem;
    }
    .levels-words p {
      display: none;
    }
  }
  /* Short and wide (a phone held sideways): the controls stand in a column
     beside the pictures, which then get the whole height. */
  @container (max-height: 520px) and (min-width: 640px) {
    .mandala-levels {
      grid-template-columns: minmax(0, 1fr) minmax(16rem, 18rem);
      grid-template-rows: auto minmax(0, 1fr);
      column-gap: 1.25rem;
    }
    .levels-head {
      grid-column: 1 / -1;
    }
    .levels-dock {
      align-self: center;
    }
    .levels-show {
      max-width: none;
    }
  }

  .place-box {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    flex: 0 0 auto;
    padding: 0;
    border-radius: 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #e8edf6);
    font-size: var(--font-size-base);
    cursor: pointer;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      background-color var(--duration-fast) var(--ease-standard);
  }
  .place-box:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }
  .place-box:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }
  .place-box i:dir(rtl) {
    transform: scaleX(-1);
  }

  @media (prefers-reduced-motion: reduce) {
    .place-box,
    .picture-open,
    .picture-word,
    .scale-face,
    .scale-name {
      transition: none;
    }
    .picture-open:active:not(:disabled),
    .scale-face.on {
      transform: none;
    }
  }
</style>
