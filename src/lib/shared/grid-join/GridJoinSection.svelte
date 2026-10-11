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

  // The pictures are sized in CSS from the groups box less the two heads.
  // A head's height depends on how its hint wraps, which CSS cannot read, so
  // it is measured. The heads span the full width, so their height does not
  // depend on the picture size and this settles in one pass.
  let groupsEl = $state<HTMLElement | null>(null);
  let headsHeight = $state(0);
  $effect(() => {
    const el = groupsEl;
    if (!el || !fill) return;
    const measure = () => {
      const heads = el.querySelectorAll<HTMLElement>(".group-head");
      const style = getComputedStyle(el);
      const groupGap = parseFloat(style.rowGap) || 0;
      let total = groupGap * Math.max(0, heads.length - 1);
      for (const head of heads) {
        const groupGapInner =
          parseFloat(getComputedStyle(head.parentElement!).rowGap) || 0;
        total += head.offsetHeight + groupGapInner;
      }
      headsHeight = Math.ceil(total);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.querySelectorAll(".group-head").forEach((head) =>
      observer.observe(head)
    );
    return () => observer.disconnect();
  });

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
            size={embedded ? 384 : 160}
          />
        </span>
        <span class="one-text">
          <span class="tile-name">{t("animation_menu_grid_join_one")}</span>
          {#if !compact}
            <span class="hint">{t("viewer_ui_grid_join_one_hint")}</span>
          {/if}
        </span>
      </label>

      <div
        class="groups"
        bind:this={groupsEl}
        style:--measured-heads={headsHeight ? `${headsHeight}px` : undefined}
      >
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

  .join-host.embedded.fill {
    container-type: size;
  }

  .embedded .join-page {
    --art-max: 100cqw;
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

  /* In the performer panel, one grid is a full-size choice alongside the
     joined previews. Keep the short standalone tray at its original scale. */
  .embedded .one-card {
    gap: clamp(14px, 2cqw, 24px);
    padding: clamp(10px, 1.5cqw, 18px);
  }

  .embedded .one-art {
    width: clamp(5rem, 30cqw, 10rem);
  }

  .embedded.fill .one-art {
    width: clamp(5rem, min(30cqw, 22cqh), 24rem);
  }

  .embedded .one-text {
    gap: clamp(4px, 0.7cqw, 8px);
  }

  .embedded .one-card .tile-name {
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

  .join-tile:not(.chosen) .tile-art {
    opacity: 0.78;
    transition: opacity var(--transition-fast);
  }

  .join-tile:hover .tile-art {
    opacity: 1;
  }

  /* ── Filling the host ──
     The groups box has a definite size, so each picture is the largest square
     both its column and its row allow. A wide box puts each group's four
     tiles in one row; a tall one gives each group two rows of two, which
     makes the pictures larger there. Below the smallest readable picture the
     box scrolls instead of shrinking further; the width always fits, so a
     narrow phone never scrolls sideways. */
  .fill .groups {
    flex: 1 1 0;
    min-height: 0;
    overflow-y: auto;
    container: join-groups / size;
    /* Both group heads and the gaps around them, measured (headsHeight);
       the fallback holds until the first measurement. */
    --heads: var(--measured-heads, 5rem);
    --chrome: calc(2 * var(--tile-pad) + 4px + var(--tile-name) + 2px);
  }

  /* Tiles hug their pictures and the grid sits centred under a centred
     head, rather than tiles stretching to the column and leaving the picture
     adrift inside. */
  .fill .group-head {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .fill .tile-grid {
    --art-w: calc(
      (100cqw - 3 * var(--tile-gap)) / 4 - 2 * var(--tile-pad) - 2px
    );
    --art: min(
      var(--art-w),
      max(
        5rem,
        min(
          var(--art-max, 14rem),
          (100cqh - var(--heads)) / 2 - var(--chrome) - 1px
        )
      )
    );
    grid-template-columns: repeat(
      4,
      minmax(0, calc(var(--art) + 2 * var(--tile-pad) + 2px))
    );
    justify-content: center;
  }

  /* The columns may give up a scrollbar's width, so the picture never
     outgrows its tile. */
  .fill .tile-art {
    width: min(var(--art), 100%);
  }

  @container join-groups (aspect-ratio < 1) {
    .fill .tile-grid {
      --art-w: calc((100cqw - var(--tile-gap)) / 2 - 2 * var(--tile-pad) - 2px);
      --art: min(
        var(--art-w),
        max(
          5rem,
          min(
            var(--art-max, 14rem),
            (100cqh - var(--heads) - 2 * var(--tile-gap)) / 4 - var(--chrome) -
              1px
          )
        )
      );
      grid-template-columns: repeat(
        2,
        minmax(0, calc(var(--art) + 2 * var(--tile-pad) + 2px))
      );
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .one-card,
    .join-tile,
    .tile-art {
      transition: none;
    }
  }
</style>
