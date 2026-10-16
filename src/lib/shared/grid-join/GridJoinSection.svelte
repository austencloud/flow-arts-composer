<!--
  The viewer's Grids section: one grid, or each hand on its own grid with red's
  grid one or two hand points across from blue's. Every choice is shown as the
  sequence's own start position drawn that way, so the picture is the control.

  Uses the surrounding GridJoinController by default, or a controlled join
  and callback when a 3D performer owns the choice. The choices come from
  grid-join-choices. All nine options are one native radio group: arrow keys
  move through them.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { onDestroy } from "svelte";
  import type { GridJoin } from "@tka/tka-types";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import type { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import { getAnimationVisibilityContext } from "#lib/shared/animation-engine/state/animation-visibility-context.js";
  import { followGridJoin } from "./grid-join-follower.svelte";
  import {
    gridJoinSelection,
    offeredGridJoinDirections,
    type JoinSteps,
  } from "./grid-join-choices";
  import GridJoinPreview from "./GridJoinPreview.svelte";

  let {
    pictograph,
    leftPropType,
    rightPropType,
    fill = false,
    compact = false,
    join = null,
    gridMode: controlledGridMode,
    onChange,
    mixed = false,
    embedded = false,
  }: {
    /** The pose every preview draws: the sequence's start position. */
    pictograph: PictographData | null;
    leftPropType?: PropType;
    rightPropType?: PropType;
    /** Take the host's whole height and size the pictures to it. */
    fill?: boolean;
    /** Short tray (the phone dock): no hints, smaller one-grid row. */
    compact?: boolean;
    /** A performer can own its join independently of the surrounding viewer. */
    join?: GridJoin | null;
    gridMode?: GridMode;
    onChange?: (join: GridJoin | null) => void;
    mixed?: boolean;
    embedded?: boolean;
  } = $props();

  const follower = followGridJoin();
  const controller = follower.controller;

  const vm = getAnimationVisibilityContext() ?? getAnimationVisibilityManager();
  let darkMode = $state(vm.isDarkMode());
  const syncTheme = () => (darkMode = vm.isDarkMode());
  vm.registerObserver(syncTheme);
  onDestroy(() => vm.unregisterObserver(syncTheme));

  const gridMode = $derived.by(() => {
    void follower.version();
    return onChange
      ? controlledGridMode
      : ((controller?.gridMode() ?? undefined) as GridMode | undefined);
  });
  const selection = $derived.by(() => {
    void follower.version();
    return gridJoinSelection(
      onChange ? join : (controller?.current() ?? null),
      gridMode
    );
  });
  const directions = $derived(offeredGridJoinDirections(gridMode));

  const DISTANCES: readonly {
    steps: JoinSteps;
    label: () => string;
    hint: () => string;
  }[] = [
    {
      steps: 1,
      label: () => t("animation_menu_grid_join_one_point"),
      hint: () => t("viewer_ui_grid_join_one_point_hint"),
    },
    {
      steps: 2,
      label: () => t("animation_menu_grid_join_two_points"),
      hint: () => t("viewer_ui_grid_join_two_points_hint"),
    },
  ];

  function isChosen(join: GridJoin | null): boolean {
    if (mixed) return false;
    const current = selection.current;
    if (!join || !current) return !join && !current;
    return current.toward === join.toward && current.steps === join.steps;
  }

  function choose(join: GridJoin | null): void {
    if (onChange) onChange(join);
    else controller?.set(join);
  }

  const groupName = `grid-join-${Math.random().toString(36).slice(2, 10)}`;
</script>

{#if (controller || onChange) && pictograph}
  <div class="join-host" class:fill class:embedded>
    <div
      class="join-page"
      class:fill
      class:compact
      role="radiogroup"
      aria-label={t("animation_menu_grid_join")}
    >
      <label class="one-card" class:chosen={isChosen(null)}>
        <input
          type="radio"
          name={groupName}
          checked={isChosen(null)}
          onchange={() => choose(null)}
        />
        <span class="one-art">
          <GridJoinPreview
            {pictograph}
            join={null}
            {gridMode}
            {darkMode}
            {leftPropType}
            {rightPropType}
            size={embedded || fill ? 384 : 160}
          />
        </span>
        <span class="one-text">
          <span class="tile-name">{t("animation_menu_grid_join_one")}</span>
          {#if !compact}
            <span class="hint">{t("viewer_ui_grid_join_one_hint")}</span>
          {/if}
        </span>
      </label>

      <div class="groups">
        {#each DISTANCES as distance (distance.steps)}
          <div class="group">
            <div class="group-head">
              <span class="group-label">{distance.label()}</span>
              {#if !compact}
                <span class="hint">{distance.hint()}</span>
              {/if}
            </div>
            <div class="tile-grid">
              {#each directions as direction (direction.toward)}
                {@const join = {
                  toward: direction.toward,
                  steps: distance.steps,
                }}
                <label class="join-tile" class:chosen={isChosen(join)}>
                  <input
                    type="radio"
                    name={groupName}
                    aria-label={`${direction.label()}, ${distance.label()}`}
                    checked={isChosen(join)}
                    onchange={() => choose(join)}
                  />
                  <span class="tile-art">
                    <GridJoinPreview
                      {pictograph}
                      {join}
                      {gridMode}
                      {darkMode}
                      {leftPropType}
                      {rightPropType}
                      size={320}
                    />
                  </span>
                  <span class="tile-name" aria-hidden="true"
                    >{direction.label()}</span
                  >
                </label>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .join-host.embedded {
    container-type: inline-size;
  }

  .join-host.fill {
    container: grid-join-choices / size;
  }

  .embedded .join-page {
    padding: 0;
  }

  @container (max-width: 360px) {
    .embedded .tile-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  input[type="radio"] {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
    margin: 0;
    pointer-events: none;
  }

  .join-host.fill {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .join-page {
    --tile-gap: 8px;
    /* Tile chrome around the picture: padding, gap and the one-line name. */
    --tile-pad: 6px;
    --tile-name: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 8px 16px 20px;
  }

  /* Given the host's height, the groups take what the one-grid row leaves and
     the pictures are sized from that box (below). */
  .join-page.fill {
    flex: 1 1 0;
    min-height: 0;
  }

  .join-page.compact {
    gap: 10px;
    padding: 4px 12px 8px;
  }

  /* ── Tiles ── */
  .one-card,
  .join-tile {
    position: relative;
    display: flex;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 14px;
    color: var(--theme-text);
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .one-card:hover,
  .join-tile:hover {
    border-color: var(--theme-stroke-strong);
    background: var(--theme-card-hover-bg);
  }

  .one-card:has(input:focus-visible),
  .join-tile:has(input:focus-visible) {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  /* Chosen: the whole tile. */
  .one-card.chosen,
  .join-tile.chosen {
    border-color: color-mix(in srgb, var(--theme-accent) 75%, transparent);
    background: color-mix(
      in srgb,
      var(--theme-accent) 16%,
      var(--theme-card-bg)
    );
    box-shadow: 0 0 0 1px
      color-mix(in srgb, var(--theme-accent) 55%, transparent);
  }

  .tile-name {
    font-size: var(--font-size-sm);
    font-weight: 600;
    line-height: 1.2;
    white-space: nowrap;
  }

  .hint {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
    line-height: 1.3;
  }

  .one-card {
    flex: none;
    align-items: center;
    gap: 14px;
    padding: 6px 16px 6px 6px;
  }

  .one-art {
    flex: none;
    width: 4rem;
  }

  /* With room (a panel, or a host it fills), one grid is a full-size choice
     alongside the joined previews. Keep the short standalone tray at its
     original scale. */
  :is(.embedded, .fill) .one-card {
    gap: clamp(14px, 2cqw, 24px);
    padding: clamp(10px, 1.5cqw, 18px);
  }

  .embedded .one-art {
    width: clamp(5rem, 30cqw, 10rem);
  }

  :is(.embedded, .fill) .one-text {
    gap: clamp(4px, 0.7cqw, 8px);
  }

  :is(.embedded, .fill) .one-card .tile-name {
    font-size: clamp(1.125rem, 2.5cqw, 1.5rem);
  }

  /* Four tiles across a narrow phone: the name eases down a little rather
     than wrapping onto a second line. */
  .compact .join-tile .tile-name {
    font-size: clamp(0.75rem, 3.7vw, var(--font-size-sm));
  }

  .compact .one-card {
    padding-block: 4px;
  }

  .compact .one-art {
    width: 2.75rem;
  }

  .one-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .groups {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .group-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 10px;
    row-gap: 2px;
  }

  .group-label {
    font-size: var(--font-size-min, 0.75rem);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--theme-text-dim);
  }

  .tile-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--tile-gap);
  }

  .join-tile {
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: var(--tile-pad) var(--tile-pad) calc(var(--tile-pad) + 2px);
  }

  .tile-art {
    display: block;
    width: 100%;
    max-width: var(--art, 9rem);
  }

  .one-card:not(.chosen) .one-art,
  .join-tile:not(.chosen) .tile-art {
    opacity: 0.78;
    transition: opacity var(--transition-fast);
  }

  .one-card:hover .one-art,
  .join-tile:hover .tile-art {
    opacity: 1;
  }

  /* All nine choices share the available panel height. Artwork fits inside
     its allotted row, so choosing a larger standard grid never hides a join. */
  .join-host.fill .join-page {
    display: grid;
    grid-template-rows: minmax(56px, 1fr) minmax(0, 2.8fr);
    gap: clamp(8px, 2cqh, 20px);
  }

  .join-host.fill .one-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    min-height: 0;
    gap: 14px;
    padding: clamp(6px, 1cqh, 14px);
  }

  .join-host.fill .one-art,
  .join-host.fill .tile-art {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    max-width: none;
  }

  .join-host.fill :global(.grid-join-preview) {
    position: absolute;
    inset: 0;
    height: 100%;
    aspect-ratio: auto;
  }

  .join-host.fill :global(.grid-join-preview img) {
    object-fit: contain;
  }

  .join-host.fill .groups {
    display: grid;
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: clamp(10px, 2cqh, 24px);
    overflow: visible;
    container-type: normal;
  }

  .join-host.fill .group {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-height: 0;
    gap: 6px;
  }

  .join-host.fill .group-head {
    flex-direction: row;
    align-items: baseline;
    text-align: left;
  }

  .join-host.fill .tile-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-auto-rows: minmax(0, 1fr);
    min-height: 0;
  }

  .join-host.fill .join-tile {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    justify-items: center;
    min-height: 0;
  }

  @container grid-join-choices (min-height: 700px) and (aspect-ratio < 0.85) {
    .join-host.fill .tile-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container grid-join-choices (max-height: 420px) {
    .join-host.fill .group-head .hint {
      display: none;
    }

    .join-host.fill .join-tile {
      padding: 4px;
    }

    .join-host.fill .tile-name {
      font-size: 14px;
    }
  }

  @container grid-join-choices (max-width: 360px) {
    .join-host.fill .tile-grid {
      gap: 4px;
    }

    .join-host.fill .join-tile .tile-name {
      white-space: normal;
      text-align: center;
    }
  }

  @container grid-join-choices (max-height: 340px) and (min-width: 360px) {
    .join-host.fill .join-page {
      grid-template-columns: minmax(0, 1fr) minmax(0, 3fr);
      grid-template-rows: minmax(0, 1fr);
    }

    .join-host.fill .one-card {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr) auto;
      gap: 6px;
    }

    .join-host.fill .one-text {
      text-align: center;
    }
  }

  @container grid-join-choices (max-height: 340px) and (360px <= width < 450px) {
    .join-host.fill .groups {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: minmax(0, 1fr);
      gap: 8px;
    }

    .join-host.fill .tile-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px;
    }

    .join-host.fill .join-tile .tile-name {
      white-space: normal;
      text-align: center;
    }
  }

  @container grid-join-choices (max-height: 240px) and (min-width: 450px) {
    .join-host.fill .join-tile {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
      gap: 4px;
    }

    .join-host.fill .join-tile .tile-name {
      white-space: normal;
      text-align: left;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .one-card,
    .join-tile,
    .one-art,
    .tile-art {
      transition: none;
    }
  }
</style>
