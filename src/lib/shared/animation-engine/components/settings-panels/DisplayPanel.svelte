<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { onDestroy, onMount } from "svelte";
  import DisplayTilePreview from "./DisplayTilePreview.svelte";
  import { getAnimationVisibilityManager } from "../../state/animation-visibility-state.svelte";
  import type { AnimationVisibilityStateManager } from "../../state/animation-visibility-state.svelte";
  import { getAnimationVisibilityContext } from "../../state/animation-visibility-context";
  import { getAnimationScopeContext } from "../../state/animation-scope-context";
  import { animationSettings } from "../../state/animation-settings-state.svelte";
  import type { AnimationSettingsState } from "../../state/animation-settings-state.svelte";
  import {
    resolveEffectivePropsVisibility,
    toggleEffectivePropsVisibility,
  } from "../../state/effective-prop-visibility";
  import { tryGetViewerVisibilityContext } from "$lib/shared/sequence-viewer/context/viewer-visibility-context";
  import type { ViewerControlSink } from "$lib/shared/sequence-viewer/domain/viewer-control-analytics";
  import { reportViewerControlChange } from "$lib/shared/sequence-viewer/domain/viewer-control-analytics";
  import {
    COMPACT_MAX_ART,
    compactDisplayArt,
    compactDisplayColumns,
    fitDisplayGrid,
  } from "../../domain/display-grid-fit";

  let {
    /** Show per-color prop (Left/Right) chips. Only surfaces without a header
     *  motion-visibility control set this (landing spinner). When true and the
     *  viewer-visibility context is present, the two prop chips replace the
     *  master "Props" toggle. */
    showMotionVisibility = false,
    /** The loaded sequence, so the word, glyph, and mandala tiles preview THIS
     *  sequence rather than a stand-in. Hosts without one still get every
     *  other tile; those three fall back to representative content. */
    sequence = null,
    /** Current prop type, so the Props tile shows the pair actually on canvas. */
    propType,
    /** The host gives this panel a definite height. The desktop sidebar does;
     *  the mobile dock's tray is capped by max-height and sized by its content,
     *  so it does not. Where the height is real the grid picks its columns and
     *  its picture size from the box's SHAPE — a tall narrow column gets two
     *  columns of big pictures rather than four columns of small ones with a
     *  third of the column empty underneath. Where it is not, the width-only
     *  rules below apply unchanged. */
    fill = false,
    /** With `fill`: the box is bounded by something else on screen (the
     *  motion-path studio's card matches the canvas beside it), not a rail
     *  as tall as the window. The pictures then take the room the box has
     *  instead of the short-side share that keeps a free-standing rail's
     *  toggles modest, so the grid spends the card rather than sitting in
     *  the middle of it. */
    grow = false,
    /** The host scrolls this panel inside a box it does not size (Post
     *  Studio's tool panel body), so there is no definite height to fit to.
     *  The tiles become short, in two rows where the width allows, and the
     *  picture size is chosen so that everything the scroller holds fits its
     *  visible height. Where it cannot (a very short window) the pictures stop
     *  at a size that still reads and the host scrolls. Ignored with `fill` or
     *  the per-hand chips. */
    compact = false,
    /** The four edge marks (TKA glyph, element, step number, word) describe a
     *  realized sequence. A host animating something that has no letter and no
     *  steps — the shape-matrix theory stage traces a bare spin ratio — turns
     *  them off rather than offering four tiles that toggle nothing. */
    showSequenceMarks = true,
    /** The word header is drawn by the host, not the canvas. A host that
     *  never shows one (a fill-mode player on a single transition) leaves the
     *  Word tile out rather than offering a toggle that changes nothing. */
    showWordToggle = true,
    onSettingChange,
    visibilityManagerOverride,
    animationSettingsOverride,
  }: {
    showMotionVisibility?: boolean;
    sequence?: {
      word?: string | null;
      steps?: ReadonlyArray<{ letter?: string | null }> | null;
    } | null;
    propType?: string;
    fill?: boolean;
    grow?: boolean;
    compact?: boolean;
    showSequenceMarks?: boolean;
    showWordToggle?: boolean;
    onSettingChange?: ViewerControlSink;
    visibilityManagerOverride?: AnimationVisibilityStateManager;
    animationSettingsOverride?: AnimationSettingsState;
  } = $props();

  const animationScope = getAnimationScopeContext();
  const vm =
    visibilityManagerOverride ??
    animationScope?.visibility ??
    getAnimationVisibilityContext() ??
    getAnimationVisibilityManager();
  const trailOnlyState =
    animationSettingsOverride ?? animationScope?.settings ?? animationSettings;
  const viewerVis = tryGetViewerVisibilityContext();
  const showPropChips = $derived(showMotionVisibility && viewerVis !== null);

  let gridVisible = $state(vm.isGridVisible());
  let tkaGlyph = $state(vm.getVisibility("tkaGlyph"));
  let elementalGlyph = $state(vm.getVisibility("elementalGlyph"));
  let propElementalGlyph = $state(vm.getVisibility("propElementalGlyph"));
  let stepNumbers = $state(vm.getVisibility("stepNumbers"));
  let progressBar = $state(vm.getVisibility("progressBar"));
  let propsVisibilityEnabled = $state(vm.getVisibility("props"));
  const propsVisible = $derived(
    resolveEffectivePropsVisibility(
      propsVisibilityEnabled,
      trailOnlyState.trail.hideProps
    )
  );
  let wordHeader = $state(vm.getVisibility("wordHeader"));
  let mandala = $state(vm.getVisibility("mandala"));
  let pathLines = $state(
    vm.getVisibility("leftPathLines") || vm.getVisibility("rightPathLines")
  );
  // Read for the previews, not toggled here: each tile draws the layer as the
  // canvas is currently configured to draw it.
  let gridMode = $state(vm.getGridMode());
  let pathShape = $state(vm.getPathShape());
  let motionAware = $state(vm.getMotionAwarePaths());
  let darkMode = $state(vm.isDarkMode());

  function handleVisibilityChange(): void {
    gridVisible = vm.isGridVisible();
    tkaGlyph = vm.getVisibility("tkaGlyph");
    elementalGlyph = vm.getVisibility("elementalGlyph");
    propElementalGlyph = vm.getVisibility("propElementalGlyph");
    stepNumbers = vm.getVisibility("stepNumbers");
    progressBar = vm.getVisibility("progressBar");
    propsVisibilityEnabled = vm.getVisibility("props");
    wordHeader = vm.getVisibility("wordHeader");
    mandala = vm.getVisibility("mandala");
    pathLines =
      vm.getVisibility("leftPathLines") || vm.getVisibility("rightPathLines");
    gridMode = vm.getGridMode();
    pathShape = vm.getPathShape();
    motionAware = vm.getMotionAwarePaths();
    darkMode = vm.isDarkMode();
  }

  // One color-agnostic toggle for both hands' path-line overlays. Per-color
  // Blue/Red chips used to sit here, but they split by color in an otherwise
  // color-agnostic grid; the per-color state keys survive underneath (this
  // chip just sets both). Which SHAPE the paths follow is behavior, not
  // visibility — that lives in PathShapePanel.
  function togglePathLines(): void {
    const next = !pathLines;
    vm.updateSettings({ leftPathLines: next, rightPathLines: next });
  }

  vm.registerObserver(handleVisibilityChange);
  onDestroy(() => vm.unregisterObserver(handleVisibilityChange));

  function toggleGrid(): void {
    vm.setGridMode(gridVisible ? "none" : "8point");
  }

  // One unified list of visibility chips so they render as a single cohesive
  // grid (the panel's native .rt-chip vocabulary). `accent` tints the active
  // fill (prop + path chips echo the blue/red prop colors).
  interface Chip {
    id: string;
    label: string;
    /** Which layer this tile draws a preview of. */
    preview?:
      | "grid"
      | "props"
      | "paths"
      | "mandala"
      | "tkaGlyph"
      | "element"
      | "stepNumber"
      | "progress"
      | "word";
    accent?: string;
    tone?: "blue" | "red";
    hand?: "left" | "right";
    active: () => boolean;
    toggle: () => void;
  }

  // Left/Right carry their prop identity before and after selection, matching
  // MotionColorChips instead of relying on the active fill alone.
  const propChips: Chip[] = [
    {
      id: "left",
      label: t("viewer_ui_left"),
      preview: "props",
      hand: "left",
      accent: "var(--prop-blue, #2196f3)",
      tone: "blue",
      active: () => viewerVis!.leftMotion,
      toggle: () => viewerVis!.toggleLeft(),
    },
    {
      id: "right",
      label: t("viewer_ui_right"),
      preview: "props",
      hand: "right",
      accent: "var(--prop-red, #f44336)",
      tone: "red",
      active: () => viewerVis!.rightMotion,
      toggle: () => viewerVis!.toggleRight(),
    },
  ];

  const masterPropsChip: Chip = {
    id: "props",
    label: t("viewer_ui_props"),
    preview: "props",
    active: () => propsVisible,
    toggle: () => toggleEffectivePropsVisibility(vm, trailOnlyState),
  };

  // The four layers that live INSIDE the pictograph square, drawn at one shared
  // scale so the props land where they would land on that grid.
  const fieldChips: Chip[] = [
    {
      id: "grid",
      label: t("playback_audit_visual_grid"),
      preview: "grid",
      active: () => gridVisible,
      toggle: toggleGrid,
    },
    {
      id: "pathLines",
      label: t("animation_display_hand_paths"),
      preview: "paths",
      active: () => pathLines,
      toggle: togglePathLines,
    },
    {
      id: "mandala",
      label: t("share_mandala"),
      preview: "mandala",
      active: () => mandala,
      toggle: () => vm.toggleVisibility("mandala"),
    },
  ];

  // The four marks drawn at the canvas EDGES. Staging these in the square would
  // misdescribe where they go, so they render as the bare artifact.
  const markChips: Chip[] = [
    {
      id: "tkaGlyph",
      label: t("animation_menu_tka_glyph"),
      preview: "tkaGlyph",
      active: () => tkaGlyph,
      toggle: () => vm.toggleVisibility("tkaGlyph"),
    },
    {
      id: "elementalGlyph",
      label: t("animation_menu_hand_tnd"),
      preview: "element",
      active: () => elementalGlyph,
      toggle: () => vm.toggleVisibility("elementalGlyph"),
    },
    {
      id: "propElementalGlyph",
      label: t("viewer_detail_prop_tnd"),
      preview: "element",
      active: () => propElementalGlyph,
      toggle: () => vm.toggleVisibility("propElementalGlyph"),
    },
    {
      id: "stepNumbers",
      label: t("animation_display_step_number"),
      preview: "stepNumber",
      active: () => stepNumbers,
      toggle: () => vm.toggleVisibility("stepNumbers"),
    },
    {
      id: "wordHeader",
      label: t("viewer_ui_word"),
      preview: "word",
      active: () => wordHeader,
      toggle: () => vm.toggleVisibility("wordHeader"),
    },
    {
      id: "progressBar",
      label: t("animation_menu_progress_bar"),
      preview: "progress",
      active: () => progressBar,
      toggle: () => vm.toggleVisibility("progressBar"),
    },
  ];

  const chips: Chip[] = $derived([
    ...(showPropChips ? propChips : [masterPropsChip]),
    ...fieldChips,
    ...(showSequenceMarks
      ? markChips.filter((chip) => showWordToggle || chip.id !== "wordHeader")
      : []),
  ]);

  // Fitted to the box's shape by fitDisplayGrid, from the rendered chip's own
  // metrics, so this file never duplicates the host's CSS.
  let shellEl = $state<HTMLElement | null>(null);
  let gridEl = $state<HTMLElement | null>(null);
  // 0 means "not measured" — the CSS ladder applies and nothing is overridden.
  let fitCols = $state(0);
  let fitArt = $state(0);
  let fitTile = $state(0);
  const fitted = $derived(fitCols > 0);

  function measureFit(): void {
    if (!fill || !shellEl || !gridEl) return;
    const width = shellEl.clientWidth;
    const height = shellEl.clientHeight;
    const chip = gridEl.firstElementChild as HTMLElement | null;
    if (width <= 0 || height <= 0 || !chip) return;

    const chipStyle = getComputedStyle(chip);
    const padX =
      parseFloat(chipStyle.paddingLeft) + parseFloat(chipStyle.paddingRight);
    const labelH = Math.max(
      ...Array.from(
        gridEl.children,
        (tile) =>
          (tile.querySelector(".chip-label") as HTMLElement | null)
            ?.offsetHeight ?? 0
      )
    );
    const chromeY =
      parseFloat(chipStyle.paddingTop) +
      parseFloat(chipStyle.paddingBottom) +
      (parseFloat(chipStyle.rowGap) || 0) +
      labelH;
    const gridStyle = getComputedStyle(gridEl);
    const gapX = parseFloat(gridStyle.columnGap) || 0;
    const gapY = parseFloat(gridStyle.rowGap) || 0;

    const fit = fitDisplayGrid({
      width,
      height,
      padX,
      chromeY,
      gapX,
      gapY,
      count: chips.length,
      grow,
      groupBoundary: showPropChips ? null : 4,
    });
    fitCols = fit?.cols ?? 0;
    fitArt = fit?.art ?? 0;
    fitTile = fit?.tile ?? 0;
  }

  onMount(() => {
    if (!fill) return;
    measureFit();
    const observer = new ResizeObserver(() => measureFit());
    if (shellEl) observer.observe(shellEl);
    return () => observer.disconnect();
  });

  // The picture size is bound by the row height, and the rows are fractions of
  // a definite box, so re-measuring after a chip count change settles in one
  // pass rather than chasing its own output.
  $effect(() => {
    void chips.length;
    void fill;
    void grow;
    measureFit();
  });

  // The compact layout is written straight to the grid's custom properties
  // rather than through state: fitting it takes two layouts in one pass (draw
  // at the largest picture, see how far the scroller overflows, then shrink),
  // and the second needs the first's result before anything paints.
  const compactMode = $derived(compact && !fill && !showPropChips);

  function scrollerOf(el: HTMLElement): HTMLElement | null {
    for (let node = el.parentElement; node; node = node.parentElement) {
      const { overflowY } = getComputedStyle(node);
      if (overflowY === "auto" || overflowY === "scroll") return node;
    }
    return null;
  }

  function fitCompact(): void {
    if (!compactMode || !shellEl || !gridEl) return;
    const width = shellEl.clientWidth;
    if (width <= 0) return;

    const cols = compactDisplayColumns({
      width,
      count: chips.length,
      gap: parseFloat(getComputedStyle(gridEl).columnGap) || 0,
    });
    gridEl.style.setProperty("--vis-cols", String(cols));
    gridEl.style.setProperty("--compact-art", `${COMPACT_MAX_ART}px`);

    const scroller = scrollerOf(shellEl);
    if (!scroller) return;
    const probeArt =
      (gridEl.querySelector(".art") as HTMLElement | null)?.offsetHeight ??
      COMPACT_MAX_ART;
    const art = compactDisplayArt({
      probeArt,
      rows: Math.ceil(chips.length / cols),
      overflow: scroller.scrollHeight - scroller.clientHeight,
    });
    gridEl.style.setProperty("--compact-art", `${art}px`);
  }

  // Everything from the grid up to its scroller can change size without the
  // scroller's own box moving (a button appearing under the panel pushes the
  // content, not the viewport), so each of them is watched. One frame's
  // notifications are coalesced into one fit.
  $effect(() => {
    if (!compactMode || !shellEl) return;
    fitCompact();
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fitCompact);
    });
    observer.observe(shellEl);
    const scroller = scrollerOf(shellEl);
    for (
      let node: HTMLElement | null = shellEl.parentElement;
      node;
      node = node.parentElement
    ) {
      observer.observe(node);
      if (node === scroller) break;
    }
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  });

  function toggleChip(chip: Chip): void {
    const previous = chip.active();
    chip.toggle();
    reportViewerControlChange(
      onSettingChange,
      "display",
      chip.id,
      previous,
      !previous
    );
  }
</script>

<div class="vis-grid-shell" class:fill bind:this={shellEl}>
  <div
    class:motion-grid={showPropChips}
    class:ten-tiles={showPropChips && chips.length === 10}
    class:fitted
    class:compact={compactMode}
    class="vis-grid"
    bind:this={gridEl}
    style={fitted
      ? `--vis-cols: ${fitCols}; --vis-tile: ${fitTile}px; --tile-art: ${fitArt}px;`
      : undefined}
  >
    {#each chips as chip, index (chip.id)}
      <button
        class="rt-chip"
        class:group-row={!showPropChips &&
          fitted &&
          fitCols < chips.length &&
          index >= 4 &&
          index < 4 + fitCols}
        class:group-inline={!showPropChips &&
          fitted &&
          fitCols >= chips.length &&
          index === 4}
        type="button"
        aria-pressed={chip.active()}
        data-tone={chip.tone}
        style={chip.accent ? `--rail-accent: ${chip.accent};` : undefined}
        onclick={() => toggleChip(chip)}
      >
        {#if chip.preview}
          <DisplayTilePreview
            kind={chip.preview}
            hand={chip.hand}
            {gridMode}
            {propType}
            {pathShape}
            {motionAware}
            {darkMode}
            {sequence}
          />
        {/if}
        <span class="chip-label">{chip.label}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .vis-grid-shell {
    container-type: inline-size;
  }

  /* Given a real height, take all of it. The grid's rows are then fractions of
     a box the content does not set, which is what makes measuring the tile and
     sizing the picture from it settle in one pass. */
  .vis-grid-shell.fill {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
  }

  /* A box too small to fit (MIN_FIT_ART in display-grid-fit) keeps the
     width-only grid at its own height, across the whole box, and the page
     scrolls. */
  .vis-grid-shell.fill > .vis-grid:not(.fitted) {
    flex: 1 1 auto;
    min-width: 0;
    align-self: flex-start;
  }

  /* Four columns as soon as there is room for them, two below that. Eight tiles
     divide evenly either way, so the four square-field layers always occupy
     whole rows and never interleave with the four edge marks — and there is
     never a row of one.

     The picture is square and capped, so widening the panel adds margin around
     each picture rather than stretching it. That is what makes four columns
     right here where two were wrong: two columns across a 830px inspector meant
     400px-wide tiles holding an 80px picture, which is the same dead rail the
     4K rule bans on a page, one level down. */
  .vis-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  @container (min-width: 24rem) {
    .vis-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
    }
  }

  /* Intrinsic Left/Right variants use three columns for nine tiles and five
     for ten, keeping complete rows before a bounded host supplies its fit. */
  .vis-grid.motion-grid:not(.fitted) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .vis-grid.motion-grid.ten-tiles:not(.fitted) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @container (min-width: 36rem) {
    .vis-grid.motion-grid.ten-tiles:not(.fitted) {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
  }

  /* A breath between the layers that live in the square and the marks drawn at
     its edges, so the grouping is visible without a heading for each. Skipped
     on the landing variant, where the group boundary falls mid-row. */
  .vis-grid:not(.motion-grid):not(.fitted):not(.compact) > :nth-child(n + 5) {
    margin-top: 10px;
  }

  /* The measured layout. Columns and picture size come from the box's shape, so
     every width query below is overridden by the inline custom properties and
     the rows share the height evenly instead of stacking to their content. */
  .vis-grid.fitted {
    flex: 1 1 0;
    min-width: 0;
    min-height: 0;
    grid-template-columns: repeat(var(--vis-cols), var(--vis-tile));
    grid-auto-rows: auto;
    place-content: center;
  }

  /* Square, at the size the fit chose. Stretching the tiles to swallow the box
     is what made a 4K rail carry 390px toggles; the grid sits in the middle of
     whatever room is left instead. */
  .vis-grid.fitted .rt-chip {
    aspect-ratio: 1;
  }

  /* Same breath between the two groups, placed on whichever axis the boundary
     actually falls on: a row edge when the grid stacks, the gap between the
     fourth and fifth tile when one row holds all eight. Only the first row of
     the second group carries it, so every row keeps the same height. */
  .vis-grid.fitted > .group-row {
    margin-top: 10px;
  }

  .vis-grid.fitted > .group-inline {
    margin-left: 10px;
  }

  /* Picture over label at every width — the picture is the control. No
     min-height and no fixed tile height: the tile is exactly its picture plus
     its label plus padding, so nothing has slack to rattle around in and
     nothing is squeezed. `--tile-art` caps the picture; the tile itself takes
     whatever width the column gives it. */
  .vis-grid .rt-chip {
    flex-direction: column;
    justify-content: center;
    gap: 7px;
    height: auto;
    padding: 12px 10px;
  }

  /* The width-only ladder. It is the whole story where the host gives no
     height, and is skipped entirely once the measured fit sets --tile-art on
     the grid — a cap declared on the chip would win over the inherited one. */
  .vis-grid:not(.fitted):not(.compact) .rt-chip {
    --tile-art: 6rem;
  }

  /* The cap is set from the widths that actually occur, not from a round
     number: the viewer sidebar is 39.4rem, so a 46rem step never fired there
     and left a 5rem picture inside a 9.5rem tile. Above the four-column seam
     the picture takes 7rem, which spends the tile on the picture instead of on
     padding, and below it the column itself is the binding constraint. */
  @container (min-width: 24rem) {
    .vis-grid:not(.fitted):not(.compact) .rt-chip {
      --tile-art: 7rem;
    }
  }

  /* The 3840 inspector again: 195px tiles were still carrying a 7rem picture. */
  @container (min-width: 46rem) {
    .vis-grid:not(.fitted):not(.compact) .rt-chip {
      --tile-art: 8.5rem;
    }
  }

  /* The compact layout. Short tiles, picture over label, in as few rows as the
     width allows. The column count and the picture cap are set by fitCompact
     from the scroller the panel sits in; the values here only hold until it
     has run, and where the host has no scroller they are the whole story. The
     columns stay 1fr, so a wider host spreads the tiles instead of stretching
     the pictures (the picture is capped, square, and centred in its tile). */
  .vis-grid.compact {
    grid-template-columns: repeat(var(--vis-cols, 5), minmax(0, 1fr));
    gap: 6px;
  }

  .vis-grid.compact .rt-chip {
    --tile-art: var(--compact-art, 4rem);
    gap: 3px;
    padding: 4px 3px;
  }

  .vis-grid.compact .chip-label {
    font-size: 11px;
    text-wrap: balance;
  }

  /* The picture carries recognition; the label names it. Dimming the inactive
     tile's picture rather than swapping it keeps the preview honest in both
     states — same as the prop-type tiles. */
  .vis-grid .rt-chip:not([aria-pressed="true"]) :global(.art) {
    opacity: 0.4;
  }

  .vis-grid .chip-label {
    font-size: 0.8em;
    line-height: 1.1;
    text-align: center;
  }

  .vis-grid .rt-chip[data-tone]:not([aria-pressed="true"]) {
    border-color: color-mix(in srgb, var(--rail-accent) 28%, transparent);
    color: color-mix(in srgb, var(--rail-accent) 72%, var(--theme-text, #fff));
  }
</style>
