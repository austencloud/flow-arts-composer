<script lang="ts">
  import { effectUiLabel } from "./effect-ui-label";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { claimedViewTransitionName } from "$lib/shared/transitions/claimed-view-transition-name";
  import type { Snippet } from "svelte";
  import { EFFECTS, type EffectMeta } from "./effect-registry";
  import {
    CATALOG_CAPTION_HEIGHT,
    CATALOG_INNER_GAP,
    CATALOG_TILE_PAD,
    MAX_LIST_ROW,
    type EffectCatalogFit,
  } from "$lib/shared/animation-engine/domain/effect-catalog-fit";

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
  }: Props = $props();

  function morphPart(part: string, effectId: string) {
    return {
      name: morphName ? `${morphName}-${part}-${effectId}` : "",
      enabled: !!morphName,
    };
  }

  const showCatalog = $derived(!!catalog);
  const showPortraits = $derived(
    !!catalog && catalog.portrait > 0 && !!portrait
  );

  const effects = $derived(
    availableEffects
      ? EFFECTS.filter((effect) => availableEffects.includes(effect.id))
      : EFFECTS
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
  class:fill={catalog?.fill}
>
  <div
    class="effect-selector"
    class:tray={layout === "tray"}
    class:catalog={showCatalog}
    class:fill={catalog?.fill}
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
    role="radiogroup"
    aria-label={t("effect_deep_select_effect")}
  >
    {#each effects as effect (effect.id)}
      {@const isActive = activeEffect === effect.id}
      <button
        type="button"
        class="effect-btn"
        class:active={isActive}
        role="radio"
        aria-checked={isActive}
        {disabled}
        aria-label={isActive && activeAction === "tune"
          ? getActiveLabel(effect)
          : effectUiLabel(effect.label)}
        title={isActive ? getActiveLabel(effect) : effectUiLabel(effect.label)}
        style:--effect-color={effect.color}
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
        {#if showCatalog}
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
            <span
              class="effect-label"
              use:claimedViewTransitionName={morphPart("name", effect.id)}
              >{effectUiLabel(effect.label)}</span
            >
          </span>
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
        {#if isActive && activeAction === "tune"}
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
    .effect-selector:not(.tray, .catalog) {
      grid-template-columns: repeat(3, minmax(0, 1fr));
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
      background var(--duration-fast, 100ms) ease,
      border-color var(--duration-fast, 100ms) ease,
      color var(--duration-fast, 100ms) ease;
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
</style>
