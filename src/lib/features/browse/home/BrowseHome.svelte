<!--
  Browse's home screen, the sibling of Create's "How do you want to create?"
  board. Opening the Browse module lands here; each tile opens one place:
  Explore by content type, or your own library. The visuals tile carries
  chips for its types so a named type is one tap away without becoming a
  peer tile of its own.

  Each tile shows its place at work, the way Create's method cards do, and
  through Create's own machinery: the preview box (CreateMethodPreview), the
  arrival wave that brings every card in together (createMethodPreviewReveal),
  the turns the cards take (createMethodPreviewTurns), the hover and focus
  hold (methodPreviewHold), the boot-screen hold, and the render gate that
  pauses turns off screen. The scenes are Browse's own (previews/).
-->
<script module lang="ts">
  import type { BrowseVisualType } from "#lib/shared/browse/navigation/browse-route-resolver.js";

  export type BrowseHomeDestination =
    | { kind: "sequences" }
    | { kind: "collections" }
    | { kind: "visuals"; visualType?: BrowseVisualType }
    | { kind: "you" };
</script>

<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
  import {
    bootScreenCovers,
    holdBootScreen,
    runAfterBootScreen,
  } from "#lib/shared/application/services/boot-screen.js";
  import {
    createRenderActivityGate,
    renderGateTarget,
  } from "#lib/shared/render-gating/render-activity-gate.js";
  import { runAfterNamedRouteMorphIdle } from "#lib/shared/transitions/named-route-morph-state.svelte.js";
  import CreateMethodPreview from "#lib/features/create/shared/components/method-previews/CreateMethodPreview.svelte";
  import { methodPreviewHold } from "#lib/features/create/shared/components/method-previews/method-preview-hold.js";
  import { createMethodPreviewReveal } from "#lib/features/create/shared/state/method-preview-reveal.svelte.js";
  import { createMethodPreviewTurns } from "#lib/features/create/shared/state/method-preview-turns.svelte.js";
  import { BROWSE_HOME_SCENES } from "./previews/browse-home-scenes";

  let {
    visualsVisible,
    onSelect,
  }: {
    /** Explore > Visuals is promotion-gated; its tile follows the gate. */
    visualsVisible: boolean;
    onSelect: (destination: BrowseHomeDestination) => void;
  } = $props();

  interface Tile {
    id: "sequences" | "collections" | "visuals" | "you";
    labelKey: TranslationKey;
    descKey: TranslationKey;
    icon: string;
    color: string;
  }

  const ALL_TILES: readonly Tile[] = [
    {
      id: "sequences",
      labelKey: "browse_home_sequences",
      descKey: "browse_home_sequences_desc",
      icon: "fa-table-cells-large",
      color: "#a855f7",
    },
    {
      id: "collections",
      labelKey: "browse_home_collections",
      descKey: "browse_home_collections_desc",
      icon: "fa-folder-open",
      color: "#6366f1",
    },
    {
      id: "visuals",
      labelKey: "browse_home_visuals",
      descKey: "browse_home_visuals_desc",
      icon: "fa-palette",
      color: "#ec4899",
    },
    {
      id: "you",
      labelKey: "tab_browse_you",
      descKey: "tab_desc_browse_you",
      icon: "fa-user",
      color: "#14b8a6",
    },
  ];

  /** The published visual types, in the order the visuals wall lists them. */
  const VISUAL_TYPES: ReadonlyArray<{
    type: BrowseVisualType;
    labelKey: TranslationKey;
    icon: string;
  }> = [
    { type: "tunnels", labelKey: "browse_home_tunnels", icon: "fa-fan" },
    {
      type: "mandalas",
      labelKey: "browse_home_mandalas",
      icon: "fa-dharmachakra",
    },
  ];

  const tiles = $derived(
    ALL_TILES.filter((tile) => tile.id !== "visuals" || visualsVisible)
  );

  const sceneOrder = (): string[] => tiles.map((tile) => tile.id);

  // The tiles arrive together, then take turns, exactly as Create's board
  // does (CreateFrontDoor): the turns wait for the boot screen, then the
  // route morph, then the arrival wave.
  const reveal = createMethodPreviewReveal({
    order: sceneOrder,
    onReveal: (id) => turns.notifyReady(id),
    covered: bootScreenCovers,
  });

  const turns = createMethodPreviewTurns({
    order: sceneOrder,
    isReady: (id) => reveal.isRevealed(id),
    defer: (go) => {
      let cancelMorphIdle = (): void => {};
      let cancelWave = (): void => {};
      const cancelBoot = runAfterBootScreen(() => {
        cancelMorphIdle = runAfterNamedRouteMorphIdle(() => {
          cancelWave = reveal.afterWave(go);
        });
      });
      return () => {
        cancelBoot();
        cancelMorphIdle();
        cancelWave();
      };
    },
  });

  // When Browse's home is the visit's first view, the boot screen waits
  // for every tile's first picture, so none is an empty tint when it leaves.
  let releasePreviewHold = (): void => {};
  let cancelLeavingReveal = (): void => {};
  const settledPreviews = new Set<string>();

  function settlePreview(id: string): void {
    settledPreviews.add(id);
    if (sceneOrder().every((tileId) => settledPreviews.has(tileId))) {
      void tick().then(() => releasePreviewHold());
    }
  }

  function handleReady(id: string): void {
    reveal.notifyReady(id);
    settlePreview(id);
  }

  function handleFailed(id: string): void {
    reveal.notifyFailed(id);
    settlePreview(id);
  }

  const previewGate = createRenderActivityGate({
    name: "browse-home-previews",
  });

  // The system setting reports changes through its media query.
  let systemMotion = $state(0);
  const appReducedMotion = $derived(getSettings().reducedMotion ?? false);

  onMount(() => {
    if (bootScreenCovers()) {
      releasePreviewHold = holdBootScreen("browse-home-previews");
      cancelLeavingReveal = runAfterBootScreen(() => reveal.revealNow());
    }
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotionChange = (): void => {
      systemMotion += 1;
    };
    motionQuery.addEventListener("change", onMotionChange);
    turns.setActive(previewGate.active);
    const unsubscribe = previewGate.subscribe((value) =>
      turns.setActive(value)
    );
    return () => {
      releasePreviewHold();
      cancelLeavingReveal();
      motionQuery.removeEventListener("change", onMotionChange);
      unsubscribe();
      previewGate.dispose();
      turns.dispose();
      reveal.dispose();
    };
  });

  // The home is mounted only while open, so the turns start with it. A
  // change to either reduce-motion setting starts over, as on Create's
  // board, so the turns stop at once when motion is reduced.
  $effect(() => {
    void systemMotion;
    void appReducedMotion;
    untrack(() => turns.start());
  });

  function choose(
    destination: BrowseHomeDestination,
    trigger: HTMLElement
  ): void {
    trigger.blur();
    // Choosing a place ends the turns; the home fades out behind it.
    turns.stop();
    onSelect(destination);
  }
</script>

<section class="browse-home" aria-labelledby="browse-home-title">
  <div class="browse-home-inner">
    <header class="browse-home-header">
      <h1 id="browse-home-title">{t("browse_home_title")}</h1>
    </header>

    <div
      class="tile-index"
      role="list"
      aria-label={t("browse_home_destinations")}
      data-tile-count={tiles.length}
      data-playing-tile={turns.playingId}
      use:renderGateTarget={previewGate}
    >
      {#each tiles as tile (tile.id)}
        <div
          class="tile"
          class:has-chips={tile.id === "visuals"}
          data-tile-id={tile.id}
          role="listitem"
          style:--tile-color={tile.color}
        >
          <button
            type="button"
            class="tile-main"
            data-browse-home-tile={tile.id}
            onclick={(event) => choose({ kind: tile.id }, event.currentTarget)}
            use:methodPreviewHold={{ turns, id: tile.id }}
          >
            <span class="tile-stage" aria-hidden="true">
              <CreateMethodPreview
                methodId={tile.id}
                loader={BROWSE_HOME_SCENES[tile.id]}
                color={tile.color}
                revealed={reveal.isRevealed(tile.id)}
                instant={reveal.isInstant(tile.id)}
                playing={turns.playingId === tile.id}
                turn={turns.turn}
                onready={handleReady}
                onfailed={handleFailed}
              />
            </span>
            <span class="tile-copy">
              <span class="tile-name"
                ><i class="fas {tile.icon} tile-glyph" aria-hidden="true"
                ></i>{t(tile.labelKey)}</span
              >
              <span class="tile-description">{t(tile.descKey)}</span>
            </span>
          </button>

          {#if tile.id === "visuals"}
            <div
              class="tile-chips"
              role="group"
              aria-label={t("browse_home_visual_types")}
            >
              {#each VISUAL_TYPES as visual (visual.type)}
                <button
                  type="button"
                  class="tile-chip"
                  data-browse-home-chip={visual.type}
                  onclick={(event) =>
                    choose(
                      { kind: "visuals", visualType: visual.type },
                      event.currentTarget
                    )}
                >
                  <i class="fas {visual.icon}" aria-hidden="true"></i>
                  {t(visual.labelKey)}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</section>

<style>
  .browse-home {
    width: 100%;
    height: 100%;
    overflow: auto;
    container: browse-home / size;
  }

  .browse-home-inner {
    width: calc(100% - clamp(20px, 3cqi, 80px));
    min-height: 100%;
    margin: 0 auto;
    padding-block: clamp(20px, 4cqh, 52px);
    box-sizing: border-box;
    display: grid;
    grid-template-rows: auto auto;
    align-content: start;
    gap: clamp(16px, 2.5cqh, 24px);
  }

  h1 {
    margin: 0;
    color: var(--theme-text);
    font-size: var(--font-size-3xl, 1.875rem);
    font-weight: 720;
    line-height: 1.08;
    letter-spacing: -0.025em;
    text-wrap: balance;
  }

  /* One column on a phone: each tile's preview strip sits above its words,
     the strip shape Create's preview box composes its widest scenes for. */
  .tile-index {
    --stage-height: clamp(64px, 10cqh, 88px);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    padding-top: 4px;
  }

  .tile {
    position: relative;
    min-width: 0;
    display: grid;
    grid-template-rows: 1fr auto;
    border: 1px solid
      color-mix(in srgb, var(--tile-color) 30%, var(--theme-stroke));
    border-radius: var(--radius-2026-md, 14px);
    background: color-mix(in srgb, var(--tile-color) 11%, var(--theme-card-bg));
    transition:
      background-color var(--transition-normal),
      border-color var(--transition-normal);
  }
  .tile:has(.tile-main:hover) {
    background: color-mix(in srgb, var(--tile-color) 18%, var(--theme-card-bg));
    border-color: color-mix(
      in srgb,
      var(--tile-color) 58%,
      var(--theme-stroke-strong)
    );
  }
  .tile:has(.tile-main:active) {
    background: color-mix(in srgb, var(--tile-color) 22%, var(--theme-card-bg));
  }

  .tile-main {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto;
    align-content: start;
    gap: 12px;
    padding: 12px 14px 14px;
    border: 0;
    border-radius: inherit;
    background: transparent;
    color: var(--theme-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .tile-main:focus-visible,
  .tile-chip:focus-visible {
    outline: 3px solid
      color-mix(in srgb, var(--tile-color) 76%, var(--theme-text));
    outline-offset: 2px;
  }

  /* The preview box fills the stage; the stage sets its size. */
  .tile-stage {
    position: relative;
    min-width: 0;
    height: var(--stage-height);
    border-radius: var(--radius-2026-sm, 10px);
  }

  .tile-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .tile-name {
    color: var(--theme-text);
    font-size: var(--font-size-lg, 1.125rem);
    font-weight: 720;
    line-height: 1.15;
  }
  /* The place's icon stays beside its name, as on Create's board. */
  .tile-glyph {
    display: inline-block;
    margin-inline-end: 0.4em;
    color: var(--tile-color);
    font-size: 0.9em;
  }
  .tile-description {
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
    line-height: 1.42;
    text-wrap: pretty;
  }

  /* Chips sit under the words, aligned with them. */
  .tile-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 0 14px 14px;
  }
  .tile-chip {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    border: 1px solid
      color-mix(in srgb, var(--tile-color) 40%, var(--theme-stroke));
    border-radius: 999px;
    background: color-mix(in srgb, var(--tile-color) 14%, var(--theme-card-bg));
    color: var(--theme-text);
    font: inherit;
    font-size: var(--font-size-min, 14px);
    font-weight: 620;
    cursor: pointer;
    transition:
      background-color var(--transition-normal),
      border-color var(--transition-normal);
  }
  .tile-chip i {
    color: var(--tile-color);
  }
  .tile-chip:hover {
    background: color-mix(in srgb, var(--tile-color) 26%, var(--theme-card-bg));
    border-color: color-mix(
      in srgb,
      var(--tile-color) 62%,
      var(--theme-stroke-strong)
    );
  }

  /* Two columns once a tile has room for a strip and a readable line. An
     odd count lets the last tile (You) take the full row. */
  @container browse-home (min-width: 600px) {
    .browse-home-inner {
      width: calc(100% - 28px);
    }
    .tile-index {
      --stage-height: clamp(76px, 13cqh, 128px);
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .tile-index[data-tile-count="3"] .tile:last-child {
      grid-column: 1 / -1;
    }
    /* Tiles side by side share two rows, words then chips, so a tile with
       chips keeps its preview and title level with its neighbours. */
    .tile {
      grid-row: span 2;
      grid-template-rows: subgrid;
      row-gap: 0;
    }
    .tile-main {
      grid-row: 1;
      gap: 14px;
      padding: 16px 18px 18px;
    }
    .tile-chips {
      grid-row: 2;
      padding: 0 18px 18px;
    }
    .tile-name {
      font-size: clamp(1.125rem, 2.6cqi, 1.5rem);
    }
    .tile-description {
      font-size: clamp(14px, 1.8cqi, 1rem);
      /* Two lines reserved so a short description keeps titles level. */
      min-height: 2lh;
    }
  }

  /* A short wide board (a phone on its side) keeps every tile in view: the
     preview square sits beside the words, as on Create's short board. */
  @container browse-home (min-width: 760px) and (max-height: 640px) {
    .tile-index {
      --stage-side: clamp(56px, 22cqh, 104px);
    }
    .tile-main {
      grid-template-columns: var(--stage-side) minmax(0, 1fr);
      grid-template-rows: auto;
      align-items: center;
      padding: 12px 14px;
    }
    .tile-stage {
      width: var(--stage-side);
      height: auto;
      aspect-ratio: 1;
    }
    .tile-chips {
      padding: 0 14px 12px calc(14px + var(--stage-side) + 14px);
    }
  }

  /* A tall two-column board (a portrait tablet) fills its height the way
     Create's board does: tall tiles whose preview takes the room above the
     words. */
  @container browse-home (min-width: 600px) and (min-height: 760px) {
    .tile-main {
      min-height: clamp(240px, 32cqh, 380px);
      grid-template-rows: minmax(0, 1fr) auto;
      gap: 18px;
      padding: 20px 22px 22px;
    }
    .tile-stage {
      height: auto;
      min-height: var(--stage-height);
    }
    .tile-chips {
      padding: 0 22px 22px;
    }
  }

  /* A wide board puts every tile in one row, preview above words, centred
     in the height like Create's board. */
  @container browse-home (min-width: 1100px) {
    .browse-home-inner {
      width: calc(100% - clamp(48px, 6cqi, 160px));
      max-width: 1600px;
      align-content: center;
      gap: 28px;
      padding-block: 40px;
    }
    /* Text grows with very large screens so a 4K board reads like Create's. */
    h1 {
      font-size: clamp(1.875rem, 1.3cqi, 3rem);
    }
    .tile-name {
      font-size: clamp(1.5rem, 0.9cqi, 2.25rem);
    }
    .tile-description,
    .tile-chip {
      font-size: clamp(1rem, 0.5cqi, 1.25rem);
    }
    .tile-index {
      --stage-height: clamp(110px, 16cqh, 280px);
      grid-template-columns: repeat(var(--tile-columns, 4), minmax(0, 1fr));
      gap: 16px;
    }
    .tile-index[data-tile-count="3"] {
      --tile-columns: 3;
    }
    .tile-index[data-tile-count="3"] .tile:last-child {
      grid-column: auto;
    }
    .tile-main {
      min-height: clamp(240px, 36cqh, 560px);
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr) auto;
      gap: 18px;
      padding: 20px 22px 22px;
    }
    .tile-stage {
      width: auto;
      height: auto;
      aspect-ratio: auto;
      min-height: var(--stage-height);
    }
    .tile-chips {
      padding: 0 22px 22px;
    }
  }
</style>
