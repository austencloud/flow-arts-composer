<!--
  BentoPropGrid.svelte - Family-first prop selection grid

  Base props render under the picker section headers. Families with several
  builds drill one level down: tapping Club replaces the grid with Club /
  Classic Club / Torch at full tile size behind a back bar, so those choices
  never scatter across sections and never shrink into a popover.

  Variants:
  - "panel" (default): has border/background for standalone use (e.g. Settings tab)
  - "inline": no border/background, used inside drawers that already provide a container
  - flat: drop the section labels and pack every prop into one dense auto-fill
    grid. For tight contexts (the mobile dock) where maximizing visible count
    beats grouping.
-->
<script lang="ts">
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import {
    PROP_PICKER_SECTIONS,
    getAllVariations,
    getBasePropType,
    hasBigVariant,
    isBigVariant,
    toggleBigVariant,
    getFamilyTileDisplayProp,
    getPropTypeDisplayInfo,
    isPropActive,
    isPremiumCosmeticProp,
  } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
  import { tick } from "svelte";
  import { growFade } from "$lib/shared/transitions/motion";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import PropGridButton from "./PropGridButton.svelte";
  import type { PropLook } from "$lib/shared/pictograph/prop/domain/prop-look";
  import type { CompositionRecipe } from "$lib/shared/pictograph/prop/domain/prop-composition-recipes";
  import PropChiralityRow from "./PropChiralityRow.svelte";
  import FanStyleOptionsCore from "./FanStyleOptionsCore.svelte";
  import {
    fanBuildPreviewOptions,
    isFanPropType,
    normalizeFanAppearance,
  } from "$lib/shared/pictograph/prop/domain/fan-appearance";
  import type { FanAppearance } from "$lib/shared/pictograph/prop/domain/fan-appearance";
  import type { PropChiralitySeam } from "./prop-chirality-seam";
  import { isBuugengFamilyProp } from "$lib/shared/pictograph/prop/domain/enums/prop-classification";
  import type { Snippet } from "svelte";
  import type { ViewerCustomColorPair } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";

  let {
    selectedPropType,
    color = "blue",
    title = "Select Prop",
    onSelect,
    variant = "panel",
    flat = false,
    tileDensity = "compact",
    layout = "grid",
    heading,
    actions,
    scrollMode = "internal",
    fill = false,
    includeBareHands = false,
    chirality,
    allowedProps,
    accessMode = "standard",
    fluidSections = false,
    showAppearance = true,
    fanAppearance,
    onFanAppearanceChange,
    isUnlocked = () => true,
    premiumVisible = false,
    premiumAllowed = false,
    premiumBadge,
    premiumNudge,
    propLook,
    recipeOverrides,
    colors,
  } = $props<{
    selectedPropType: PropType | null;
    color?: "blue" | "red" | (string & {});
    title?: string;
    onSelect: (propType: PropType) => void;
    variant?: "panel" | "inline";
    /**
     * Flat mode: drop the section labels and pack every prop into one dense
     * auto-fill grid. For tight contexts (the viewer's props pill on any
     * screen, the mobile dock) where every prop on screen without a
     * scrollbar beats grouping.
     */
    flat?: boolean;
    /** Larger scrolling cards when the live preview shares the screen. */
    tileDensity?: "compact" | "comfortable";
    /** A bounded, sideways-scrolling catalogue beneath a compact toolbar. */
    layout?: "grid" | "rail";
    heading?: Snippet;
    actions?: Snippet;
    /**
     * Drawers own a bounded internal scroller. Embedded inspectors already
     * scroll the whole tab, so their picker contributes its natural height and
     * lets that host remain the only vertical scroll owner.
     */
    scrollMode?: "internal" | "host";
    /**
     * The host bounds the internal scroller to a definite height (the Change
     * Prop drawer, the phone sheet, the wide sidebar). A drilled view then
     * claims that whole height and sizes its tiles to share it, and so does
     * the flat grid. Only a host with a definite height may opt in: in an
     * auto-height host the measurement would feed back into the content it
     * measures.
     */
    fill?: boolean;
    /** Adds the scene-only no-prop choice using the same canonical card. */
    includeBareHands?: boolean;
    /**
     * Buugeng chirality seam. Absent means the picker renders no chirality
     * row, so hosts that should never expose it (the deck releaser renders
     * canonical print cards) are unaffected by omission rather than by an
     * opt-out. `hands` names the hands this picker governs: one for a
     * per-hand picker, both for a picker that sets the pair — chirality is
     * never shared between hands the way prop type is.
     */
    chirality?: PropChiralitySeam;
    /** Optional host-owned capability filter. The canonical registry still
     *  owns labels, ordering, active-state, and access rules. */
    allowedProps?: readonly PropType[];
    /** Educational instruments may select ordinary play-earned props directly
     *  and include Poi. Premium cosmetics retain their subscription gate. */
    accessMode?: "standard" | "educational";
    /** Let a roomy host use all available width for each family row. */
    fluidSections?: boolean;
    /** Collection metadata chooses a type without editing account appearance. */
    showAppearance?: boolean;
    fanAppearance: FanAppearance;
    onFanAppearanceChange: (appearance: FanAppearance) => void;
    isUnlocked?: (prop: PropType) => boolean;
    premiumVisible?: boolean;
    premiumAllowed?: boolean;
    premiumBadge?: Snippet;
    premiumNudge?: Snippet<[{ dismiss: () => void }]>;
    propLook?: PropLook;
    recipeOverrides?: Partial<Record<PropType, CompositionRecipe>>;
    colors?: ViewerCustomColorPair | null;
  }>();

  const allowedPropSet = $derived(
    allowedProps ? new Set<PropType>(allowedProps) : null
  );

  const pickerSections = $derived([
    ...PROP_PICKER_SECTIONS,
    ...(includeBareHands ? [{ label: "Scene", props: [PropType.HAND] }] : []),
  ]);

  function canShowProp(prop: PropType): boolean {
    if (prop === PropType.HAND && includeBareHands) return true;
    if (allowedPropSet && !allowedPropSet.has(prop)) return false;
    if (isPremiumCosmeticProp(prop)) return premiumVisible;
    return isPropActive(prop);
  }

  const selectableProps = $derived(
    pickerSections
      .flatMap((section) => section.props)
      .filter((prop) => canShowProp(prop))
  );
  const selectablePropSet = $derived(new Set(selectableProps));

  // Preserve the curated base-prop ordering while letting each base own its
  // variants. A family stays in the section where its base was authored, so a
  // Big Chicken entry cannot move the Chicken family out of Novelty. The
  // chooser then gets only variants that the curated picker actually allows,
  // so internal-only Staff builds stay internal.
  const sections = $derived.by(() => {
    const seen = new Set<PropType>();
    return pickerSections
      .map((section) => {
        const bases: PropType[] = [];
        for (const prop of section.props) {
          if (!canShowProp(prop)) continue;
          const base = isPremiumCosmeticProp(prop)
            ? prop
            : getBasePropType(prop);
          if (prop !== base) continue;
          if (seen.has(base)) continue;
          seen.add(base);
          bases.push(base);
        }
        return { label: section.label, bases };
      })
      .filter((section) => section.bases.length > 0);
  });

  const allBases = $derived(sections.flatMap((section) => section.bases));
  const selectedBase = $derived(
    selectedPropType === null ? null : getBasePropType(selectedPropType)
  );

  function familyChoices(base: PropType): PropType[] {
    return getAllVariations(base).filter(
      (prop) => selectablePropSet.has(prop) && !isBigVariant(prop)
    );
  }

  function familyCount(base: PropType): number | undefined {
    const count = familyChoices(base).length;
    return count > 1 ? count : undefined;
  }

  function familyDisplayProp(base: PropType): PropType {
    if (selectedPropType === null) return base;
    return getFamilyTileDisplayProp(base, selectedPropType);
  }

  // One picker, one level down. A family tile or the fan look chip swaps the
  // grid for that choice's tiles at the grid's own tile size behind a back
  // bar. `null` is the all-props grid. Picking stays one level down so the
  // styles can be compared against the live preview; Back or Escape returns.
  type Drill = { kind: "family"; base: PropType } | { kind: "fan-look" };
  let drill = $state<Drill | null>(null);
  let rootEl = $state<HTMLDivElement | null>(null);

  const drillKey = $derived(
    drill === null
      ? "all"
      : drill.kind === "family"
        ? `family:${drill.base}`
        : "fan-look"
  );
  const drillTitle = $derived(
    drill === null
      ? ""
      : drill.kind === "family"
        ? `${getPropTypeDisplayInfo(drill.base).label} styles`
        : "Fan look"
  );

  async function openDrill(next: Drill): Promise<void> {
    drill = next;
    await tick();
    rootEl?.querySelector<HTMLElement>(".drill-back")?.focus();
  }

  async function closeDrill(): Promise<void> {
    const previous = drill;
    drill = null;
    await tick();
    const selector =
      previous?.kind === "family"
        ? `[data-family-tile="${previous.base}"]`
        : '[data-testid="fan-look-chip"]';
    rootEl?.querySelector<HTMLElement>(selector)?.focus();
  }

  // How much room the drilled view may claim in a `fill` host: a zero-width
  // float with `height: 100%` reports the scroller's inner height, minus
  // nothing the content contributes, so the drilled view can be exactly
  // that tall. The probe only exists when the host opted in.
  let probeEl = $state<HTMLDivElement | null>(null);
  let tilesEl = $state<HTMLDivElement | null>(null);
  let fillHeight = $state(0);
  let tilesBox = $state({ width: 0, height: 0 });

  $effect(() => {
    if (!probeEl) return;
    const probe = probeEl;
    const measure = () => (fillHeight = probe.offsetHeight);
    const observer = new ResizeObserver(measure);
    observer.observe(probe);
    measure();
    return () => observer.disconnect();
  });

  $effect(() => {
    if (!tilesEl) return;
    const tiles = tilesEl;
    const measure = () =>
      (tilesBox = { width: tiles.clientWidth, height: tiles.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(tiles);
    measure();
    return () => observer.disconnect();
  });

  // The flat grid's own width in a `fill` host, for the same reason as the
  // drilled tiles: its height is the scroller's, its width is its own.
  let flatEl = $state<HTMLDivElement | null>(null);
  let flatWidth = $state(0);

  $effect(() => {
    if (!flatEl) return;
    const grid = flatEl;
    const measure = () => (flatWidth = grid.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    measure();
    return () => observer.disconnect();
  });

  const FLAT_GAP = 8;
  /* A tile never grows past this: a wall-sized pane gets a composed block
     with margins rather than tiles the size of playing cards. */
  const FLAT_MAX_TILE = 288;
  /* Below this the dense grid and its scrollbar read better than tiles
     squeezed to fit a short host. */
  const FLAT_MIN_TILE = 52;
  /**
   * Tile grid for the flat picker in a bounded host: the column count that
   * makes the largest tile once the rows must share the height, so the grid
   * fills its page instead of huddling in the top third of it. Tiles sit on
   * doubled tracks, as the drilled ones do, so a short last row can start one
   * track in and centre itself. Null means the host is not bounded, a family
   * is drilled open, or the host is too short, and the dense grid stands.
   */
  const flatLayout = $derived.by(() => {
    if (!flat || drill !== null) return null;
    const n = allBases.length;
    const width = flatWidth;
    const height = fillHeight;
    if (n === 0 || width === 0 || height === 0) return null;
    let best: {
      cols: number;
      colWidth: number;
      rowHeight: number;
      size: number;
    } | null = null;
    for (let cols = 2; cols <= Math.min(n, 10); cols += 1) {
      const rows = Math.ceil(n / cols);
      const colWidth = Math.min(
        (width - FLAT_GAP * (cols - 1)) / cols,
        FLAT_MAX_TILE
      );
      const rowHeight = Math.min(
        (height - FLAT_GAP * (rows - 1)) / rows,
        colWidth * 1.15
      );
      const size = Math.min(colWidth, rowHeight / 1.15);
      if (best === null || size > best.size + 0.5) {
        best = { cols, colWidth, rowHeight, size };
      }
    }
    if (best === null || best.size < FLAT_MIN_TILE) return null;
    const orphans = n % best.cols;
    return {
      cols: best.cols,
      halfTrack: Math.floor((best.colWidth - FLAT_GAP) / 2),
      rowHeight: Math.floor(best.rowHeight),
      orphanIndex: orphans === 0 ? -1 : n - orphans,
      orphanStart: best.cols - orphans + 1,
    };
  });

  const DRILL_GAP = 10;
  const drillTileCount = $derived(
    drill?.kind === "family" ? familyChoices(drill.base).length : 0
  );
  /**
   * Tile grid for a drilled family in a bounded host: as many columns as the
   * family warrants, rows sharing the height so the tiles own the space,
   * capped so a two-prop family gets two generous cards rather than two
   * towers. Null means the host is not bounded and the tiles keep their
   * ordinary size.
   */
  const drillLayout = $derived.by(() => {
    const n = drillTileCount;
    const { width, height } = tilesBox;
    if (n === 0 || fillHeight === 0 || width === 0 || height === 0) return null;
    const phone = width < 440;
    const cols = n <= 2 ? n : phone || n <= 4 ? 2 : n <= 9 ? 3 : 4;
    const rows = Math.ceil(n / cols);
    const colWidth = (width - DRILL_GAP * (cols - 1)) / cols;
    const rowHeight = Math.floor(
      Math.min((height - DRILL_GAP * (rows - 1)) / rows, colWidth * 1.25)
    );
    // The tiles sit on a doubled track grid (two tracks each) so a short
    // last row can start one track in and centre itself.
    const orphans = n % cols;
    return {
      cols,
      rowHeight,
      orphanIndex: orphans === 0 ? -1 : n - orphans,
      orphanStart: cols - orphans + 1,
    };
  });

  function handleDrillKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    void closeDrill();
  }

  // A drilled view whose subject leaves (the host filters props, or the
  // current prop stops being a fan) returns to the grid on its own.
  $effect(() => {
    if (drill?.kind === "fan-look" && !showFanLook) drill = null;
    if (drill?.kind === "family" && !allBases.includes(drill.base)) {
      drill = null;
    }
  });

  // The fan look (build + cover) is a setting on top of the Fan / Big Fan
  // tile, not a family of tiles. It docks as one chip once a fan is current,
  // the same way Buugeng chirality docks, and drills into the full chooser.
  const showFanLook = $derived(
    showAppearance &&
      selectedPropType !== null &&
      isFanPropType(selectedPropType)
  );

  // Size is a property of the current prop, not a prop of its own. Every big
  // prop is reached from here, which is why the grid can fold them away.
  const showSize = $derived(
    selectedPropType !== null &&
      selectablePropSet.has(selectedPropType) &&
      hasBigVariant(selectedPropType)
  );
  const sizeIsBig = $derived(
    selectedPropType !== null && isBigVariant(selectedPropType)
  );
  function chooseSize(big: boolean) {
    if (selectedPropType === null || sizeIsBig === big) return;
    onSelect(toggleBigVariant(selectedPropType));
  }
  const normalizedFanAppearance = $derived(
    normalizeFanAppearance(fanAppearance)
  );
  const fanLook = $derived(
    fanBuildPreviewOptions(normalizedFanAppearance).find(
      (option) => option.id === normalizedFanAppearance.build
    )
  );

  // Track which locked prop (if any) is showing its inline earn tip.
  let lockedTipFor = $state<PropType | null>(null);
  // Track which paid prop (if any) is showing its upgrade nudge.
  let premiumNudgeFor = $state<PropType | null>(null);

  /**
   * Central click router for all tiles. The decision itself lives in
   * routePropTileClick so the ordering it encodes — premium before
   * play-earned — is pinned by a test rather than by this component.
   * - select: delegates to the parent onSelect callback.
   * - premium-nudge: toggles the upgrade callout; never calls onSelect.
   * - earn-tip: toggles the inline earn tip; never calls onSelect.
   */
  function handleTileClick(prop: PropType) {
    if (prop === PropType.HAND && includeBareHands) {
      lockedTipFor = null;
      premiumNudgeFor = null;
      onSelect(prop);
      return;
    }

    const premium = isPremiumCosmeticProp(prop);
    if (accessMode === "educational" && !premium) {
      lockedTipFor = null;
      premiumNudgeFor = null;
      onSelect(prop);
      return;
    }
    const route = premium
      ? premiumAllowed
        ? "select"
        : "premium-nudge"
      : isUnlocked(prop)
        ? "select"
        : "earn-tip";

    if (route === "select") {
      lockedTipFor = null;
      premiumNudgeFor = null;
      onSelect(prop);
      return;
    }

    if (route === "premium-nudge") {
      lockedTipFor = null;
      premiumNudgeFor = premiumNudgeFor === prop ? null : prop;
      return;
    }

    premiumNudgeFor = null;
    lockedTipFor = lockedTipFor === prop ? null : prop;
  }
</script>

<div
  bind:this={rootEl}
  class="prop-grid-root"
  class:panel={variant === "panel"}
  class:inline={variant === "inline"}
  class:flat
  class:rail={layout === "rail"}
  class:host-scroll={scrollMode === "host"}
  class:fluid-sections={fluidSections}
>
  {#snippet sizeControl()}
    <div class="size-toggle" role="group" aria-label="Prop size">
      <button
        type="button"
        class="size-option"
        class:active={!sizeIsBig}
        aria-pressed={!sizeIsBig}
        onclick={() => chooseSize(false)}>Standard</button
      >
      <button
        type="button"
        class="size-option"
        class:active={sizeIsBig}
        aria-pressed={sizeIsBig}
        onclick={() => chooseSize(true)}>Big</button
      >
    </div>
  {/snippet}
  {#snippet fanControl()}
    <button
      type="button"
      class="look-chip"
      data-testid="fan-look-chip"
      aria-label={`Fan look: ${fanLook?.label ?? normalizedFanAppearance.build}. Change`}
      onclick={() => void openDrill({ kind: "fan-look" })}
    >
      {#if fanLook}
        <img class="look-thumb" src={fanLook.image} alt="" draggable="false" />
      {/if}
      <span class="look-name"
        >{fanLook?.label ?? normalizedFanAppearance.build}</span
      >
      <i class="fas fa-chevron-right look-caret" aria-hidden="true"></i>
    </button>
  {/snippet}
  {#if layout === "rail"}
    <header class="rail-toolbar">
      {#if drill !== null}
        <button
          type="button"
          class="drill-back"
          aria-label="Back to all props"
          onclick={() => void closeDrill()}
        >
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
        </button>
        <div class="rail-heading">
          <strong class="drill-title">{drillTitle}</strong>
        </div>
        {#if drill.kind === "fan-look" && fanLook?.id === "flat-grip" && fanLook.designCredit}
          <a
            class="rail-credit"
            href={fanLook.designCredit.sourceUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Forged Creations source"
          >
            <span class="credit-long">{fanLook.designCredit.originator}</span>
            <span class="credit-short" aria-hidden="true">Forged</span>
            <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
          </a>
        {/if}
      {:else}
        <div class="rail-heading">{@render heading?.()}</div>
        {#if showSize}{@render sizeControl()}{/if}
        {#if showFanLook}{@render fanControl()}{/if}
      {/if}
      <div class="rail-actions">{@render actions?.()}</div>
    </header>
  {/if}
  {#if variant === "panel"}
    <header class="grid-header">
      <h4 class="grid-title">{title}</h4>
    </header>
  {/if}

  {#snippet tile(prop: PropType, columnStart?: number)}
    <!--
      Each tile is wrapped in a relative-positioned container so the lock glyph,
      crown and earn-tip can be positioned over / below the button. The click
      is always routed through handleTileClick (via PropTypeButton's onSelect
      prop).

      A paid cosmetic wears a crown and never the play-earned lock or the
      "Earn by creating" tip — those two states mean different things and
      showing both would tell the user to spin their way to something that is
      only for sale.
    -->
    {@const premium = isPremiumCosmeticProp(prop)}
    <div
      class="tile-wrapper"
      style:grid-column-start={columnStart}
      class:premium
      class:locked={prop !== PropType.HAND && !premium && !isUnlocked(prop)}
    >
      <PropGridButton
        propType={prop}
        selected={selectedPropType === prop}
        {color}
        onSelect={() => handleTileClick(prop)}
        fanAppearance={normalizedFanAppearance}
        {propLook}
        {recipeOverrides}
        {colors}
        previewPair={showAppearance}
        singleHand={chirality?.hands.length === 1
          ? chirality.hands[0]?.hand
          : undefined}
        leftFlipped={chirality?.hands.find((state) => state.hand === "left")
          ?.flipped}
        rightFlipped={chirality?.hands.find((state) => state.hand === "right")
          ?.flipped}
      />
      {#if premium && premiumBadge}
        <span class="crown-glyph">
          {@render premiumBadge()}
        </span>
      {:else if prop !== PropType.HAND && !isUnlocked(prop)}
        <i class="fas fa-lock lock-glyph" aria-hidden="true"></i>
        {#if lockedTipFor === prop}
          <span class="earn-tip">Earn by creating</span>
        {/if}
      {/if}
    </div>
  {/snippet}

  {#snippet familyTile(base: PropType, columnStart?: number)}
    {@const choices = familyChoices(base)}
    {#if choices.length <= 1}
      {@render tile(choices[0] ?? base, columnStart)}
    {:else}
      <PropGridButton
        propType={familyDisplayProp(base)}
        selected={selectedBase === base}
        badge={familyCount(base)}
        actionLabel={`Choose ${getPropTypeDisplayInfo(base).label} style`}
        buttonProps={{
          "aria-expanded": drill?.kind === "family" && drill.base === base,
          "data-family-tile": base,
          style: columnStart ? `grid-column-start: ${columnStart}` : undefined,
        }}
        onSelect={() => void openDrill({ kind: "family", base })}
        {color}
        fanAppearance={normalizedFanAppearance}
        {propLook}
        {recipeOverrides}
        {colors}
        previewPair={showAppearance}
        singleHand={chirality?.hands.length === 1
          ? chirality.hands[0]?.hand
          : undefined}
        leftFlipped={chirality?.hands.find((state) => state.hand === "left")
          ?.flipped}
        rightFlipped={chirality?.hands.find((state) => state.hand === "right")
          ?.flipped}
      />
    {/if}
  {/snippet}

  <div class="grid-scroll themed-scrollbar">
    {#if fill}
      <div class="fill-probe" bind:this={probeEl} aria-hidden="true"></div>
    {/if}
    <!-- The sequential decision-screen swap: the grid steps out, the drilled
         view steps in from the right, and back runs the other way. -->
    <Crossfade
      key={drillKey}
      mode="swap"
      motion="step"
      direction={drill === null ? -1 : 1}
      animateHeight={layout !== "rail"}
      fill={layout === "rail"}
    >
      {#if drill !== null}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <section
          class="drill-view"
          class:fill={fillHeight > 0}
          class:fan-look-drill={drill.kind === "fan-look"}
          style:height={fillHeight > 0 ? `${fillHeight}px` : undefined}
          aria-label={drillTitle}
          data-escape-shortcut-local
          onkeydown={handleDrillKeydown}
        >
          {#if layout !== "rail"}
            <div class="drill-bar">
              <button
                type="button"
                class="drill-back"
                aria-label="Back to all props"
                onclick={() => void closeDrill()}
              >
                <i class="fas fa-arrow-left" aria-hidden="true"></i>
              </button>
              <span class="drill-title">{drillTitle}</span>
            </div>
          {/if}
          {#if drill.kind === "fan-look"}
            <FanStyleOptionsCore
              fill={fillHeight > 0 && layout !== "rail"}
              horizontal={layout === "rail"}
              appearance={normalizedFanAppearance}
              onchange={onFanAppearanceChange}
            />
          {:else}
            <div
              class="drill-tiles"
              style:--family-count={familyChoices(drill.base).length}
              class:comfortable={tileDensity === "comfortable"}
              class:fill={drillLayout !== null}
              class:flat-grid={flat && drillLayout === null}
              class:section-buttons={!flat && drillLayout === null}
              style:--drill-cols={drillLayout?.cols}
              style:--drill-row={drillLayout
                ? `${drillLayout.rowHeight}px`
                : undefined}
              bind:this={tilesEl}
            >
              {#each familyChoices(drill.base) as prop, index (prop)}
                {@render tile(
                  prop,
                  drillLayout && index === drillLayout.orphanIndex
                    ? drillLayout.orphanStart
                    : undefined
                )}
              {/each}
            </div>
          {/if}
        </section>
      {:else if flat}
        <div
          class="flat-grid"
          class:comfortable={tileDensity === "comfortable"}
          class:fill={flatLayout !== null}
          style:height={flatLayout ? `${fillHeight}px` : undefined}
          style:--flat-cols={flatLayout?.cols}
          style:--flat-half={flatLayout
            ? `${flatLayout.halfTrack}px`
            : undefined}
          style:--flat-row={flatLayout
            ? `${flatLayout.rowHeight}px`
            : undefined}
          bind:this={flatEl}
        >
          {#each allBases as base, index (base)}
            {@render familyTile(
              base,
              flatLayout && index === flatLayout.orphanIndex
                ? flatLayout.orphanStart
                : undefined
            )}
          {/each}
        </div>
      {:else}
        <div class="grid-content">
          {#each sections as section, i}
            <div class="prop-section" class:primary={i === 0}>
              <div class="section-label" class:first={i === 0}>
                {section.label}
              </div>
              <div
                class="section-buttons"
                class:single={section.bases.length === 1}
              >
                {#each section.bases as base (base)}
                  {@render familyTile(base)}
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </Crossfade>
  </div>

  {#if showSize && drill === null && layout !== "rail"}
    <div class="look-dock size-dock" transition:growFade={{ axis: "y" }}>
      <span class="look-label">Size</span>
      {@render sizeControl()}
    </div>
  {/if}

  {#if showFanLook && drill === null && layout !== "rail"}
    <div class="look-dock" transition:growFade={{ axis: "y" }}>
      <span class="look-label">Fan look</span>
      {@render fanControl()}
    </div>
  {/if}

  {#if chirality && selectedPropType !== null && isBuugengFamilyProp(selectedPropType)}
    <div class="chirality-dock" transition:growFade={{ axis: "y" }}>
      <PropChiralityRow
        propType={selectedPropType}
        hands={chirality.hands}
        {colors}
        {propLook}
        onChange={chirality.onChange}
      />
    </div>
  {/if}

  {#if premiumNudgeFor && premiumNudge}
    <div class="premium-nudge-dock">
      {@render premiumNudge({ dismiss: () => (premiumNudgeFor = null) })}
    </div>
  {/if}
</div>

<style>
  .rail-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem 0.625rem;
    padding: 0.375rem 0.75rem;
    flex: 0 0 auto;
  }
  .rail-heading {
    flex: 1;
    min-width: 3rem;
  }
  .rail-actions {
    flex: 0 0 auto;
    margin-left: auto;
  }
  .rail-credit {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.3rem;
    min-height: var(--min-touch-target, 44px);
    margin-left: 0.25rem;
    color: var(--theme-accent, #8b6cff);
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
    text-decoration: none;
  }
  .rail-credit:hover,
  .rail-credit:focus-visible {
    text-decoration: underline;
  }
  .credit-short {
    display: none;
  }
  @media (max-width: 480px) {
    .rail-toolbar {
      column-gap: 0.375rem;
    }
    .rail-credit {
      margin-left: 0.1rem;
    }
    .credit-long {
      display: none;
    }
    .credit-short {
      display: inline;
    }
  }
  .rail-toolbar .size-toggle {
    padding: 0;
    gap: 0;
  }
  .rail-toolbar .size-option {
    min-height: 44px;
    padding-inline: 0.625rem;
  }
  .rail-toolbar .look-chip {
    max-width: 100%;
    width: max-content;
    flex: 0 0 auto;
  }
  .rail-toolbar .look-name {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .rail-toolbar .look-thumb {
    width: 40px;
  }
  .rail .grid-scroll {
    overflow: hidden;
    padding: 0.25rem 0.5rem 0.5rem;
    container: prop-rail / size;
  }
  .rail .flat-grid {
    height: 100%;
    grid-template-columns: none;
    grid-template-rows: repeat(2, minmax(0, 1fr));
    grid-auto-flow: column;
    grid-auto-columns: clamp(8.5rem, 24cqw, 12rem);
    gap: 0.5rem;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0.25rem;
    scroll-snap-type: x proximity;
    scroll-padding-inline: 0.25rem;
    overscroll-behavior-x: contain;
    scrollbar-width: thin;
  }
  .rail .flat-grid > :global(*) {
    min-height: 0;
    scroll-snap-align: start;
  }
  .rail .flat-grid :global(.prop-button) {
    height: 100%;
    min-height: 0;
    aspect-ratio: auto;
  }
  .rail .drill-view {
    height: 100%;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0.375rem;
  }
  /* Fan Look has no inner back bar or modifier row. Give its one choice rail
     the entire drilled area instead of preserving the family drill's auto row. */
  .rail .drill-view.fan-look-drill {
    grid-template-rows: minmax(0, 1fr);
  }
  .rail .drill-view.fan-look-drill > :global(.fan-style-options) {
    height: 100%;
  }
  .rail .drill-tiles.flat-grid {
    grid-template-columns: repeat(var(--family-count), minmax(8.5rem, 1fr));
    grid-template-rows: minmax(0, 1fr);
  }
  .rail .drill-view > :global(.fan-style-options) {
    flex: 1;
    min-height: 0;
  }
  @container prop-rail (max-height: 15rem) {
    .rail .flat-grid {
      grid-template-rows: minmax(0, 1fr);
    }
  }
  @container prop-grid (max-width: 500px) {
    .rail-toolbar .look-chip {
      order: 1;
      margin-left: auto;
    }
  }
  .prop-grid-root {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0;
    width: 100%;
    height: 100%;
    min-height: 0;
    flex: 1;
    container-type: inline-size;
    container-name: prop-grid;
  }

  .prop-grid-root.panel {
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
  }

  .prop-grid-root.inline {
    background: transparent;
    border: none;
    border-radius: 0;
  }

  .prop-grid-root.host-scroll {
    height: auto;
    flex: none;
  }

  .prop-grid-root.host-scroll .grid-scroll {
    flex: none;
    overflow: visible;
  }

  .grid-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 12px 0;
    flex-shrink: 0;
  }

  .grid-title {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-dim);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .grid-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 14px 18px 20px;
    scrollbar-width: thin;
  }

  /* The flat picker is a dense dock; it does not need the drawer's
     roomy bottom padding. */
  .prop-grid-root.flat .grid-scroll {
    padding-bottom: 10px;
  }

  .grid-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* The wrapper is inert for existing pickers. Roomy hosts opt into an
     authored section layout below without changing the registry or tiles. */
  .prop-section {
    display: contents;
  }

  /* Flat mode: one dense grid, no sections — maximize visible prop count. */
  .flat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
    gap: 6px;
    padding: 0 2px;
  }
  .flat-grid :global(.prop-button) {
    width: 100%;
    padding: 6px 3px 5px;
    gap: 3px;
    border-radius: 10px;
    aspect-ratio: 1 / 1.15;
  }
  .flat-grid :global(.prop-label) {
    font-size: var(--font-size-compact, 12px);
  }
  .flat-grid :global(.prop-image-container .prop-composition-preview) {
    width: 75%;
    max-height: 75%;
  }

  /* A desktop sidebar has room for readable tiles: five per row at ~85px
     keeps every prop in view in a 750px-tall panel with no scrollbar. */
  @container prop-grid (min-width: 440px) {
    .flat-grid {
      grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
      gap: 8px;
    }
  }

  /* A bounded host (the wide sidebar) hands the flat grid its whole page and
     the tiles share it: the column count that makes the largest tile, rows
     sized to land on the floor, on doubled tracks so a short last row can
     start one track in and centre itself. See flatLayout. */
  .flat-grid.fill {
    grid-template-columns: repeat(calc(var(--flat-cols) * 2), var(--flat-half));
    grid-auto-rows: var(--flat-row);
    gap: 8px;
    padding: 0;
    align-content: center;
    justify-content: center;
  }

  .flat-grid.fill > :global(*) {
    grid-column-end: span 2;
    min-height: 0;
  }

  .flat-grid.fill :global(.prop-button) {
    height: 100%;
    aspect-ratio: auto;
  }

  /* One level down there are only a handful of tiles, so even the phone
     dock can afford the readable size: three per row with whole names. */
  .drill-view .flat-grid {
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 8px;
  }

  .flat-grid.comfortable {
    grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
    gap: 0.6rem;
  }
  .flat-grid.comfortable :global(.prop-button) {
    min-height: 6.75rem;
    aspect-ratio: 1.25;
    padding: 0.5rem;
  }
  .flat-grid.comfortable :global(.prop-label) {
    font-size: var(--font-size-min, 0.875rem);
    white-space: normal;
  }

  .section-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    color: var(--theme-text-dim);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 16px 2px 8px;
    text-align: left;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .section-label.first {
    border-top: none;
    padding-top: 2px;
  }

  .section-buttons {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 124px));
    gap: 10px;
    justify-content: center;
    padding: 0 2px;
  }
  .prop-grid-root.fluid-sections .section-buttons {
    grid-template-columns: repeat(auto-fit, minmax(8.75rem, 10.5rem));
    justify-content: center;
  }

  .prop-grid-root.fluid-sections .grid-content {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px 20px;
  }

  .prop-grid-root.fluid-sections .prop-section {
    display: block;
    min-width: 0;
  }

  .section-buttons.single {
    grid-template-columns: minmax(0, 124px);
  }

  .section-buttons :global(.prop-button) {
    width: 100%;
  }

  /* Reports the scroller's bounded height to script; see fillHeight. */
  .fill-probe {
    float: left;
    width: 0;
    height: 100%;
    pointer-events: none;
  }

  /* One level down: a family's styles or the fan look behind a back bar. In
     a bounded host the view is exactly the scroller's height and its tiles
     share that room; elsewhere it hugs tiles at the grid's own size. */
  .drill-view {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    box-sizing: border-box;
  }

  .drill-tiles {
    min-width: 0;
  }

  .drill-tiles.fill {
    display: grid;
    flex: 1;
    min-height: 0;
    grid-template-columns: repeat(
      calc(var(--drill-cols, 3) * 2),
      minmax(0, 1fr)
    );
    grid-auto-rows: var(--drill-row, auto);
    gap: 10px;
    align-content: center;
  }

  .drill-tiles.fill .tile-wrapper {
    /* End-only, so an inline column start on the orphan keeps its span. */
    grid-column-end: span 2;
    min-height: 0;
  }

  .drill-tiles.fill :global(.prop-button) {
    height: 100%;
    aspect-ratio: auto;
  }

  .drill-view.fill > :global(.fan-style-options) {
    flex: 1;
    min-height: 0;
  }

  .drill-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .drill-back {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    padding: 0;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.16));
    border-radius: 999px;
    background: var(--theme-card-bg, rgba(0, 0, 0, 0.5));
    color: var(--theme-text);
    font-size: 14px;
    cursor: pointer;
    transition:
      border-color var(--transition-fast, 150ms ease),
      background-color var(--transition-fast, 150ms ease);
  }

  .drill-back .fas {
    width: auto;
  }

  .drill-back:hover {
    border-color: color-mix(in srgb, var(--theme-accent, #8b6cff) 70%, white);
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b6cff) 14%,
      var(--theme-card-bg, rgba(0, 0, 0, 0.5))
    );
  }

  .drill-back:focus-visible {
    outline: 2px solid var(--theme-accent, #8b6cff);
    outline-offset: 2px;
  }

  .drill-title {
    min-width: 0;
    overflow: hidden;
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* One chip for the selected fan's look. It sits where Buugeng chirality
     sits: below the grid in the drawer, above it in the flat mobile dock. */
  .look-dock {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
    margin: 0 12px 12px;
    padding: 8px 8px 8px 14px;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.14));
    border-radius: 16px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b6cff) 8%,
      var(--theme-card-bg, rgba(0, 0, 0, 0.75))
    );
  }

  .size-toggle {
    display: flex;
    flex: 0 0 auto;
    gap: 4px;
    padding: 3px;
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(0, 0, 0, 0.55));
  }

  .size-option {
    padding: 6px 14px;
    border: none;
    border-radius: 9px;
    background: transparent;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.65));
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    cursor: pointer;
  }

  .size-option.active {
    background: var(--theme-accent, #8b6cff);
    color: #fff;
  }

  .look-label {
    flex: 0 0 auto;
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
  }

  .look-chip {
    display: inline-flex;
    flex: 0 1 auto;
    align-items: center;
    gap: 10px;
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    padding: 4px 12px 4px 4px;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.16));
    border-radius: 999px;
    background: var(--theme-card-bg, rgba(0, 0, 0, 0.5));
    color: var(--theme-text);
    font: inherit;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
    transition:
      border-color var(--transition-fast, 150ms ease),
      background-color var(--transition-fast, 150ms ease);
  }

  .look-chip:hover {
    border-color: color-mix(in srgb, var(--theme-accent, #8b6cff) 70%, white);
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b6cff) 14%,
      var(--theme-card-bg, rgba(0, 0, 0, 0.5))
    );
  }

  .look-chip:focus-visible {
    outline: 2px solid var(--theme-accent, #8b6cff);
    outline-offset: 2px;
  }

  .look-thumb {
    flex: 0 0 auto;
    width: 64px;
    height: 32px;
    border-radius: 999px;
    object-fit: cover;
    background: #070911;
  }

  .look-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .look-caret {
    flex: 0 0 auto;
    width: auto;
    color: var(--theme-text-dim);
    font-size: 11px;
  }

  @media (prefers-reduced-motion: reduce) {
    .look-chip,
    .drill-back {
      transition: none;
    }
  }

  .chirality-dock {
    flex: 0 0 auto;
    min-width: 0;
  }

  /* The flat picker is the compact/mobile drawer. Chirality is part of
     choosing Buugeng, so surface it before the prop catalogue instead of
     making the user scroll through every prop to find the A/B controls. */
  .prop-grid-root.flat .chirality-dock {
    order: -1;
  }

  .prop-grid-root.flat .look-dock {
    order: -1;
  }

  @container prop-grid (min-width: 360px) {
    .section-buttons:not(.single) {
      grid-template-columns: repeat(3, minmax(0, 124px));
    }
  }

  @container prop-grid (min-width: 550px) {
    .section-buttons:not(.single) {
      grid-template-columns: repeat(4, minmax(0, 118px));
    }
  }

  @container prop-grid (min-width: 700px) {
    .section-buttons:not(.single) {
      grid-template-columns: repeat(6, minmax(0, 112px));
    }

    .prop-grid-root.fluid-sections .grid-content {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .prop-grid-root.fluid-sections .prop-section.primary {
      grid-column: 1 / -1;
    }
  }

  @container prop-grid (min-width: 850px) {
    .section-buttons:not(.single) {
      grid-template-columns: repeat(8, minmax(0, 112px));
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .grid-scroll {
      scroll-behavior: auto;
    }
  }

  /* ─── Tile wrapper: lock / earn-tip overlay system ─── */

  /*
    The wrapper is a transparent pass-through for unlocked tiles (width/height
    match the inner button). For locked tiles it becomes a positioned container
    that carries the lock glyph + earn-tip.
  */
  .tile-wrapper {
    position: relative;
    /* Match sizing of PropTypeButton in each grid context — the button already
       sizes itself; the wrapper just needs to be as wide/tall as its child. */
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }

  .tile-wrapper.locked :global(.prop-button) {
    opacity: 0.4;
  }

  .tile-wrapper.locked:hover :global(.prop-button) {
    opacity: 0.55;
  }

  .lock-glyph {
    position: absolute;
    bottom: 4px;
    right: 4px;
    font-size: 0.7rem;
    opacity: 0.8;
    pointer-events: none;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .earn-tip {
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%) translateY(calc(100% + 4px));
    font-size: 0.65rem;
    opacity: 0.85;
    white-space: nowrap;
    background: var(--theme-card-bg, rgba(18, 18, 28, 0.95));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 4px;
    padding: 2px 6px;
    pointer-events: none;
    z-index: 20;
  }

  /* ─── Paid cosmetic: crown + upgrade nudge ─── */

  /* Top-left, not bottom-right where the play-earned lock sits: the crown is
     permanent rather than a transient state, and down there it lands on top of
     the prop name and eats the last letters of "Energy Saber". Top-right is the
     selection checkmark's corner; top-left is free in this grid. */
  .crown-glyph {
    position: absolute;
    top: 6px;
    left: 6px;
    line-height: 1;
    pointer-events: none;
    z-index: 10;
  }

  /* The nudge belongs to the picker, not one 79px tile. Docking it inside the
     picker shell keeps it clear of the scroll clip and avoids a layout shift. */
  .premium-nudge-dock {
    position: absolute;
    right: 12px;
    bottom: 12px;
    left: 12px;
    display: flex;
    justify-content: center;
    pointer-events: none;
    z-index: 30;
  }

  .premium-nudge-dock :global(.nudge-callout) {
    width: min(280px, 100%);
    box-sizing: border-box;
    pointer-events: auto;
  }
</style>
