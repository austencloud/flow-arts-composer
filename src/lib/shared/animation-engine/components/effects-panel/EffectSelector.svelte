<script lang="ts">
  import { effectUiLabel } from "./effect-ui-label";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { claimedViewTransitionName } from "#lib/shared/transitions/claimed-view-transition-name.js";
  import type { Snippet } from "svelte";
  import { EFFECTS, type EffectMeta } from "./effect-registry";
  import { effectInk } from "./effect-ink";
  import EffectHandDot from "./EffectHandDot.svelte";
  import { getThemeMode } from "#lib/shared/theme/state/theme-mode-state.svelte.js";
  import {
    CATALOG_CAPTION_HEIGHT,
    CATALOG_INNER_GAP,
    CATALOG_TILE_PAD,
    MAX_LIST_ROW,
    type EffectCatalogFit,
    type EffectPictureFit,
  } from "#lib/shared/animation-engine/domain/effect-catalog-fit.js";

  interface Props {
    activeEffect: string;
    onSelect: (effect: string) => void;
    disabled?: boolean;
    /** Hover/press intent — fires before the click commits so the canvas can warm
     *  the effect's webgl renderer ahead of activation (kills the switch freeze). */
    onPrewarm?: (effect: string) => void;
    /** Trays recompose from 4 to 8 columns when their own width allows it. */
    layout?: "panel" | "tray";
    /** Share a bounded chooser's space without compressing labels. */
    fit?: boolean;
    /** In the tray, tapping the selected effect opens its tuning screen. */
    activeAction?: "disable" | "tune";
    /** Restrict the roster to the effects this host can actually draw. A host
     *  with its own renderer (the shape-matrix theory stage) supports a subset;
     *  offering a chip that renders nothing is worse than not offering it.
     *  Omit for the full roster. */
    availableEffects?: readonly string[];
    /** Show each effect as a picture of its look: `portrait` beside or above
     *  its name, in the arrangement `fitEffectCatalog` or `fitEffectRoster`
     *  chose. The picture stands in for the icon. The list arrangement keeps
     *  the icons. A `fill` arrangement fills its parent, so the parent needs a
     *  definite height; the others take the height their tiles need. */
    catalog?: EffectCatalogFit | null;
    portrait?: Snippet<[string]>;
    /** While the host carries this grid from one arrangement to another, the
     *  prefix under which each tile's box, picture, icon, name and badge claim
     *  view-transition names, so each travels as its own piece. Null the rest
     *  of the time, which keeps the names out of every other transition. */
    morphName?: string | null;
    /** Off as the grid's first tile, for a host whose box holds nothing else.
     *  It takes up whatever the last row leaves empty, so no hole remains. */
    onOff?: () => void;
    /** A phone dock under the player: four one-line tiles across, icon beside
     *  name, 36px tall. Ignores `catalog`. */
    dock?: boolean;
    /** Which effect each prop wears, for a host that sets them apart. `null`
     *  while the two wear the same one (the lit tile is named "both props");
     *  an object while they differ, which puts one dot per hand on the tile it
     *  wears. Omit for a host with one effect for everything. */
    pair?: { left: string; right: string } | null;
    /** A host whose pane is the effects page alone: four across, each tile
     *  its picture over a 14px name, the rows sharing the height the parent
     *  gives the grid (`fitEffectPictures`). Takes the place of `catalog`;
     *  needs `portrait`. */
    pictures?: EffectPictureFit | null;
  }

  const {
    activeEffect,
    onSelect,
    disabled = false,
    onPrewarm,
    layout = "panel",
    fit = false,
    activeAction = "disable",
    availableEffects,
    catalog = null,
    portrait,
    morphName = null,
    onOff,
    dock = false,
    pair,
    pictures = null,
  }: Props = $props();

  // With two props every tile keeps both dot slots mounted, so a dot fades
  // in and out on the fast transition instead of mounting already visible.
  const hasPair = $derived(pair !== undefined);
  const dotPair = $derived(pair ?? null);
  const dotsOn = $derived(!!pair);

  function tileHandLabel(effect: EffectMeta): string | null {
    if (pair === undefined) return null;
    const effectName = effectUiLabel(effect.label);
    if (pair === null) {
      return activeEffect === effect.id
        ? t("effect_deep_tile_both_props", { effect: effectName })
        : null;
    }
    if (pair.left === effect.id) {
      return t("effect_deep_tile_left_prop", { effect: effectName });
    }
    if (pair.right === effect.id) {
      return t("effect_deep_tile_right_prop", { effect: effectName });
    }
    return null;
  }

  function morphPart(part: string, effectId: string) {
    return {
      name: morphName ? `${morphName}-${part}-${effectId}` : "",
      enabled: !!morphName,
    };
  }

  const pictureGrid = $derived(!!pictures && !!portrait);
  const showCatalog = $derived(!!catalog && !pictureGrid);
  const showPortraits = $derived(
    !!catalog && catalog.portrait > 0 && !!portrait
  );
  /** The phone tray (86x49 tiles, no catalog): the tile-format picture of the
   *  effect's look stands over its name where an icon did, in a box that is
   *  always 74x27 so nothing moves when the pictures arrive. */
  const trayPictures = $derived(
    layout === "tray" && !catalog && !dock && !!portrait
  );

  const effects = $derived(
    availableEffects
      ? EFFECTS.filter((effect) => availableEffects.includes(effect.id))
      : EFFECTS
  );

  const namesShown = $derived(catalog?.orientation !== "icons");
  const offSpan = $derived(
    catalog ? catalog.cols * catalog.rows - (effects.length + 1) + 1 : 1
  );

  function getActiveLabel(effect: EffectMeta): string {
    return activeAction === "tune"
      ? t("effect_deep_tune_effect", { effect: effectUiLabel(effect.label) })
      : t("effect_deep_click_disable", { effect: effectUiLabel(effect.label) });
  }
</script>

<div
  class="effect-selector-shell"
  class:fit
  class:catalog={showCatalog}
  class:fill={(showCatalog && catalog?.fill) || pictureGrid}
>
  <div
    class="effect-selector"
    class:tray={layout === "tray"}
    class:pictures={trayPictures}
    class:catalog={showCatalog}
    class:fill={showCatalog && catalog?.fill}
    class:picture-grid={pictureGrid}
    style:--fx-picture-cols={pictureGrid ? pictures?.cols : undefined}
    style:--fx-picture-rows={pictureGrid ? pictures?.rows : undefined}
    style:--fx-picture-gap={pictureGrid ? `${pictures?.gap}px` : undefined}
    class:dock
    class:fixed-tile={!!catalog?.tile}
    data-orientation={catalog?.orientation}
    style:--fx-cols={catalog?.cols}
    style:--fx-rows={catalog?.rows}
    style:--fx-row-max={catalog?.orientation === "list"
      ? `${MAX_LIST_ROW}px`
      : undefined}
    style:--fx-portrait={showPortraits ? `${catalog?.portrait}px` : undefined}
    style:--fx-gap={catalog ? `${catalog.gap}px` : undefined}
    style:--fx-pad={showCatalog ? `${CATALOG_TILE_PAD}px` : undefined}
    style:--fx-inner-gap={showCatalog ? `${CATALOG_INNER_GAP}px` : undefined}
    style:--fx-caption-h={showCatalog
      ? `${CATALOG_CAPTION_HEIGHT}px`
      : undefined}
    style:--fx-icon={catalog?.icon ? `${catalog.icon}px` : undefined}
    style:--fx-tile-h={catalog?.tile ? `${catalog.tile}px` : undefined}
    role="radiogroup"
    aria-label={t("effect_deep_select_effect")}
  >
    {#if onOff}
      <button
        type="button"
        class="effect-btn off-tile"
        class:active={activeEffect === "none"}
        role="radio"
        aria-checked={activeEffect === "none"}
        aria-label={t("effect_deep_off")}
        title={t("effect_deep_off")}
        style:grid-column={offSpan > 1 ? `span ${offSpan}` : undefined}
        {disabled}
        onclick={onOff}
      >
        <span class="effect-caption">
          <i class="fas effect-icon fa-ban" aria-hidden="true"></i>
          {#if namesShown}
            <span class="effect-label">{t("effect_deep_off")}</span>
          {/if}
        </span>
      </button>
    {/if}
    {#each effects as effect (effect.id)}
      {@const isActive = activeEffect === effect.id}
      <button
        type="button"
        class="effect-btn"
        class:active={isActive}
        role="radio"
        aria-checked={isActive}
        {disabled}
        aria-label={tileHandLabel(effect) ??
          (isActive && activeAction === "tune"
            ? getActiveLabel(effect)
            : effectUiLabel(effect.label))}
        title={isActive ? getActiveLabel(effect) : effectUiLabel(effect.label)}
        style:--effect-color={effectInk(effect.color, getThemeMode())}
        data-ghost="safe"
        data-ghost-kind="effect"
        data-ghost-id={effect.id}
        data-ghost-active={isActive || undefined}
        data-ghost-label={effectUiLabel(effect.label)}
        onclick={() => onSelect(effect.id)}
        onpointerenter={() => !disabled && onPrewarm?.(effect.id)}
        onpointerdown={() => !disabled && onPrewarm?.(effect.id)}
        use:claimedViewTransitionName={morphPart("tile", effect.id)}
      >
        {#if pictureGrid && portrait}
          <span
            class="effect-portrait page-picture"
            class:whole={!pictures?.cover}
            aria-hidden="true"
          >
            {@render portrait(effect.id)}
          </span>
          <span class="effect-label">{effectUiLabel(effect.label)}</span>
        {:else if showCatalog}
          {#if showPortraits && portrait}
            <span
              class="effect-portrait"
              aria-hidden="true"
              use:claimedViewTransitionName={morphPart("picture", effect.id)}
            >
              {@render portrait(effect.id)}
            </span>
          {/if}
          <span class="effect-caption">
            {#if !showPortraits}
              <i
                class="fas effect-icon {effect.icon}"
                aria-hidden="true"
                use:claimedViewTransitionName={morphPart("icon", effect.id)}
              ></i>
            {/if}
            {#if namesShown}
              <span
                class="effect-label"
                use:claimedViewTransitionName={morphPart("name", effect.id)}
                >{effectUiLabel(effect.label)}</span
              >
            {/if}
          </span>
        {:else if trayPictures && portrait}
          <span class="effect-portrait tray-portrait" aria-hidden="true">
            {@render portrait(effect.id)}
          </span>
          <span
            class="effect-label"
            use:claimedViewTransitionName={morphPart("name", effect.id)}
            >{effectUiLabel(effect.label)}</span
          >
        {:else}
          <i
            class="fas effect-icon {effect.icon}"
            aria-hidden="true"
            use:claimedViewTransitionName={morphPart("icon", effect.id)}
          ></i>
          <span
            class="effect-label"
            use:claimedViewTransitionName={morphPart("name", effect.id)}
            >{effectUiLabel(effect.label)}</span
          >
        {/if}
        {#if hasPair}
          <span class="hand-dot-slot left"
            ><EffectHandDot
              hand="left"
              visible={dotsOn && dotPair?.left === effect.id}
            /></span
          >
          <span class="hand-dot-slot right"
            ><EffectHandDot
              hand="right"
              visible={dotsOn && dotPair?.right === effect.id}
            /></span
          >
        {/if}
        {#if isActive && activeAction === "tune" && !dock && !pictureGrid}
          <span
            class="tune-badge"
            aria-hidden="true"
            use:claimedViewTransitionName={morphPart("badge", effect.id)}
          >
            <i class="fas fa-sliders"></i>
          </span>
        {/if}
      </button>
    {/each}
  </div>
</div>

<style>
  .effect-selector-shell.fit {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  .fit .effect-selector.tray {
    flex: 1;
    grid-template-columns: repeat(auto-fit, minmax(min(96px, 100%), 1fr));
    grid-auto-rows: minmax(72px, 1fr);
    gap: 8px;
  }
  .fit .effect-label {
    font-size: var(--font-size-min, 14px);
    line-height: 1.25;
    white-space: normal;
  }
  .fit .effect-btn i {
    font-size: 24px;
  }
  .effect-selector-shell {
    container: effect-selector / inline-size;
  }

  /* Tray with pictures: the same 86x49 tile. A 74x27 picture, the name at its
     12px floor, and 2px of padding keep the height the icon version had. */
  .effect-selector.tray.pictures .effect-btn {
    padding: 2px 4px;
    gap: 3px;
  }
  /* The name takes the tile's whole inner width less 1px each side: the tile
     less its 1.5px borders, less 2px (75px tile: 75 - 3 - 2 = 70px). The 4px
     button padding is taken back with a negative margin, so the picture keeps
     its size. Font size and tile size are unchanged. */
  .effect-selector.tray.pictures .effect-btn .effect-label {
    align-self: stretch;
    box-sizing: border-box;
    max-width: none;
    margin-inline: -4px;
    padding-inline: 1px;
    text-align: center;
  }
  .tray-portrait {
    flex: none;
    width: min(74px, 100%);
    height: 27px;
    border-radius: 5px;
    overflow: hidden;
  }
  .effect-portrait.tray-portrait > :global(div) {
    border: 0;
    border-radius: 5px;
  }
  .effect-selector.tray.pictures .off-tile {
    justify-content: center;
  }

  .effect-selector {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }

  /* A wide tray gets two complete rows instead of stretching six buttons
     across the screen and stranding four on a third row. The width cap keeps
     the buttons at the same visual scale as the four-column panel version. */
  .effect-selector.tray {
    width: 100%;
    max-width: 68rem;
    margin-inline: auto;
  }

  /* Four columns leave a narrow rail (an unfolded Fold's settings column is
     about 195px) 34px per label, which clips "Sparkle" and "Bubbles". Three
     columns keep every name whole. */
  @container effect-selector (max-width: 15.5rem) {
    .effect-selector:not(.tray, .catalog, .dock) {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  /* ── Phone dock ──
     4 x 36px rows with 6px gaps = 162px. The active tile keeps its tint and
     full ink border; the tune badge goes, since the Tune button under the
     grid names the active effect. A body of 300px or more has the room for
     icon over name, at 52px (the panel is the size container). */
  .effect-selector.dock {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-auto-rows: var(--alt-touch-target, 36px);
    gap: 6px;
  }

  .effect-selector.dock .effect-btn {
    min-height: 0;
    flex-direction: row;
    gap: 5px;
    padding: 0 4px;
    border-radius: 8px;
  }

  .effect-selector.dock .effect-btn.active {
    border-width: 2px;
    background: color-mix(in srgb, var(--effect-color) 22%, transparent);
  }

  .effect-selector.dock .effect-btn i {
    flex: none;
  }

  @container effects-panel (min-height: 18.75rem) {
    .effect-selector.dock {
      grid-auto-rows: 52px;
    }

    .effect-selector.dock .effect-btn {
      flex-direction: column;
      gap: 4px;
    }
  }

  @container effect-selector (min-width: 44rem) {
    .effect-selector.tray {
      grid-template-columns: repeat(8, minmax(0, 1fr));
    }
  }

  .effect-btn {
    min-height: 48px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 8px 4px;
    border-radius: 10px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    position: relative;
    cursor: pointer;
    font-size: inherit;
    -webkit-tap-highlight-color: transparent;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard);
    /* view-transitions.css: the box stretches between arrangements while the
       parts inside it keep their own proportions. */
    view-transition-class: fx-roster-box;
  }

  .effect-portrait,
  .effect-icon,
  .effect-label {
    view-transition-class: fx-roster-part;
  }

  .tune-badge {
    view-transition-class: fx-roster-swap;
  }

  /* The hand dots: 4px in from the tile's own edge (inside its 1.5px border),
     the left hand's top left and the right hand's top right, the same on every
     tile size. They sit out of flow, so they never move the name or picture. */
  .hand-dot-slot {
    position: absolute;
    top: calc(4px - 1.5px);
    display: block;
    width: 6px;
    height: 6px;
    pointer-events: none;
  }
  .hand-dot-slot.left {
    left: calc(4px - 1.5px);
  }
  .hand-dot-slot.right {
    right: calc(4px - 1.5px);
  }

  .effect-btn.active {
    border-color: var(--effect-color);
    background: color-mix(in srgb, var(--effect-color) 14%, transparent);
    color: var(--effect-color);
  }

  @media (prefers-reduced-motion: reduce) {
    .effect-btn {
      transition: none;
    }
  }

  .effect-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .effect-btn:hover:not(.active, :disabled) {
    background: color-mix(
      in srgb,
      var(--theme-text, white) 6%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04))
    );
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .effect-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .effect-btn i {
    font-size: 14px;
    color: var(--effect-color);
    line-height: 1;
    pointer-events: none;
  }

  .effect-label {
    font-size: var(--font-size-compact, 12px);
    line-height: 1;
    pointer-events: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  /* The name clips sideways only. Its line box is as tall as the type (12px),
     so a full clip cut the tails of p, g and y about 2px short. A browser
     without `clip` keeps the full clip. */
  @supports (overflow: clip) {
    .effect-label {
      overflow-x: clip;
      overflow-y: visible;
    }
  }

  /* ── Catalog and roster: pictures of each effect's look ── */
  /* Every value that decides the tile's size arrives from
     effect-catalog-fit.ts as a custom property, so the fit's arithmetic and
     the rendered tile use the same numbers. */
  .effect-selector.catalog {
    grid-template-columns: repeat(var(--fx-cols), minmax(0, 1fr));
    gap: var(--fx-gap);
  }

  /* Fill: the parent gives the shell a height and the grid divides it into
     rows. */
  .effect-selector-shell.fill {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .effect-selector.fill {
    flex: 1 1 0;
    min-height: 0;
    /* The list caps its rows (--fx-row-max); the picture tiles share the
       whole height. */
    grid-template-rows: repeat(
      var(--fx-rows),
      minmax(0, var(--fx-row-max, 1fr))
    );
  }

  .catalog .effect-btn {
    min-height: 0;
    padding: var(--fx-pad);
    gap: var(--fx-inner-gap);
  }

  .catalog:is([data-orientation="row"], [data-orientation="list"]) .effect-btn {
    flex-direction: row;
    justify-content: flex-start;
  }

  /* The frame the looks cards use (EffectPresetsSection .preview-area), so an
     effect's picture here and its look in the dock have the same shape. The
     height is set outright rather than by aspect-ratio: a 102px frame let the
     pictures inside stretch it to 48px (their own 15:7), which made every
     roster row taller than the fit had room for. */
  .effect-portrait {
    flex: none;
    width: var(--fx-portrait);
    height: calc(var(--fx-portrait) * 3 / 8);
    overflow: hidden;
    pointer-events: none;
  }

  .effect-portrait :global(.look-preview) {
    height: 100%;
    aspect-ratio: auto;
  }

  .effect-caption {
    min-width: 0;
    min-height: var(--fx-caption-h);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    pointer-events: none;
  }

  .catalog:is([data-orientation="row"], [data-orientation="list"])
    .effect-caption {
    flex: 1 1 auto;
  }

  .catalog[data-orientation="stack"] .effect-caption {
    max-width: 100%;
    justify-content: center;
  }

  /* A picker that holds every effect in a small box: the tile gives up its
     padding, and the icon sits over the name so the name keeps the width.
     No side padding: on a 344px phone the tile is 72.67px, 70px inside its
     borders, and the longest names ("Blütenblätter" 68.4px, "Scintillement"
     68.2px) need all of it to stay whole. */
  .catalog:is([data-orientation="dense"], [data-orientation="icons"])
    .effect-btn {
    padding: 2px 0;
    gap: 0;
    border-radius: 8px;
    overflow: hidden;
  }

  .catalog:is([data-orientation="dense"], [data-orientation="icons"])
    .effect-caption {
    flex-direction: column;
    gap: 3px;
    min-height: 0;
    max-width: 100%;
    justify-content: center;
  }

  .catalog:is([data-orientation="dense"], [data-orientation="icons"])
    .effect-btn
    i.effect-icon {
    font-size: var(--fx-icon, 14px);
  }

  /* The phone's dense tile has a fixed height (34px: border, padding, a 12px
     icon, a 3px gap and the name), so four rows come to what the fit counted. */
  .effect-selector.catalog.fixed-tile {
    grid-auto-rows: var(--fx-tile-h);
  }

  /* Off carries no picture, so it centres its icon and name in a picture grid. */
  .catalog:is(
      [data-orientation="row"],
      [data-orientation="stack"],
      [data-orientation="list"]
    )
    .off-tile {
    flex-direction: row;
    justify-content: center;
  }

  .off-tile {
    --effect-color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
  }

  .catalog:is([data-orientation="dense"], [data-orientation="icons"])
    .tune-badge {
    top: 2px;
    right: 2px;
    width: 14px;
    height: 14px;
  }

  .tune-badge {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(
      in srgb,
      var(--effect-color) 30%,
      var(--theme-panel-bg, rgba(20, 22, 32, 0.9))
    );
    box-shadow: 0 0 6px color-mix(in srgb, var(--effect-color) 60%, transparent);
    pointer-events: none;
  }

  .tune-badge i {
    font-size: 9px;
  }

  /* ── The pictures page (`pictures`) ──
     The grid divides the height its parent gives it into rows; inside a tile
     the name keeps its one line and the picture takes the rest, so nothing in
     the tile has a fixed height. The numbers are effect-catalog-fit.ts's
     PICTURE_* constants. */
  .effect-selector.picture-grid {
    flex: 1 1 0;
    min-height: 0;
    grid-template-columns: repeat(var(--fx-picture-cols), minmax(0, 1fr));
    grid-template-rows: repeat(var(--fx-picture-rows), minmax(0, 1fr));
    gap: var(--fx-picture-gap);
  }

  .picture-grid .effect-btn {
    min-height: 0;
    justify-content: flex-start;
    gap: 6px;
    padding: 4.5px;
    border-radius: 12px;
    color: var(--theme-text, white);
  }

  .effect-portrait.page-picture {
    flex: 1 1 0;
    width: 100%;
    height: auto;
    min-height: 0;
    border-radius: 8px;
  }

  .page-picture > :global(*) {
    width: 100%;
    height: 100%;
  }

  /* The painting is never stretched: it fills a box near its own shape, and
     sits whole in one that is not (the tiles of an effects-off page). */
  .page-picture :global(canvas) {
    object-fit: cover;
  }

  .page-picture.whole :global(canvas) {
    object-fit: contain;
  }

  .picture-grid .effect-label {
    flex: none;
    height: 22px;
    line-height: 22px;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
  }

  /* Selected: the whole ring and a tint of the effect's ink. */
  .picture-grid .effect-btn.active {
    border-width: 2px;
    padding: 4px;
    background: color-mix(in srgb, var(--effect-color) 16%, transparent);
  }
</style>
