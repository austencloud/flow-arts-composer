<!--
  Browse's home screen, the sibling of Create's "How do you want to create?"
  board. Opening Browse lands on direct Community destinations and compact
  links to the corresponding shelves in Your library. The visuals tile carries
  chips for its types so a named type is one tap away.

  Each tile shows its place at work, the way Create's method cards do, and
  through Create's own machinery: the preview box (CreateMethodPreview), the
  arrival wave that brings every card in together (createMethodPreviewReveal),
  the turns the cards take (createMethodPreviewTurns), the hover and focus
  hold (methodPreviewHold), the boot-screen hold, and the render gate that
  pauses turns off screen. The scenes are Browse's own (previews/).
-->
<script module lang="ts">
  import type {
    BrowseVisualType,
    BrowseDestination,
  } from "#lib/shared/browse/navigation/browse-route-resolver.js";

  export type BrowseHomeDestination = {
    kind: BrowseDestination;
    visualType?: BrowseVisualType;
  };
</script>

<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
  import type { Section } from "#lib/shared/navigation/domain/types.js";
  import { BROWSE_GROUPS } from "#lib/shared/navigation/config/tab-definitions.js";
  import {
    bootScreenCovers,
    FIRST_VIEW_WAIT_MS,
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
  import {
    BROWSE_HOME_SCENES,
    warmBrowseHomeScenes,
  } from "./previews/browse-home-scenes";

  let {
    destinations,
    onSelect,
  }: {
    destinations: Section[];
    onSelect: (destination: BrowseHomeDestination) => void;
  } = $props();

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

  const community = BROWSE_GROUPS[0]!;
  const library = BROWSE_GROUPS[1]!;
  const tiles = $derived(
    destinations.filter((section) => section.groupId === community.id) as Array<
      Section & { id: "sequences" | "collections" | "visuals"; color: string }
    >
  );
  const libraryLinks = $derived(
    destinations.filter((section) => section.groupId === library.id)
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

  // When Browse's home is the visit's first view, the boot screen waits for
  // every tile's first picture (or its failure), so none is an empty tint
  // when it leaves. The hold may run to FIRST_VIEW_WAIT_MS after `ready`, the
  // limit Create's own first view uses; past that the screen leaves anyway,
  // the tiles that are ready arrive with it and the rest fade in later.
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
    // The scene code starts downloading now; the boxes mount it later.
    warmBrowseHomeScenes(sceneOrder());
    if (bootScreenCovers()) {
      releasePreviewHold = holdBootScreen(
        "browse-home-previews",
        FIRST_VIEW_WAIT_MS
      );
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

    <section
      class="destination-group community-group"
      aria-labelledby="community-title"
    >
      <div class="group-heading">
        <h2 id="community-title">{t(community.labelKey)}</h2>
        <p>{t("browse_home_community_desc")}</p>
      </div>
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
              onclick={(event) =>
                choose({ kind: tile.id }, event.currentTarget)}
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
                  loadBehindBootScreen
                />
              </span>
              <span class="tile-copy">
                <span class="tile-name"
                  ><span class="tile-glyph" aria-hidden="true"
                    >{@html tile.icon}</span
                  >{t(tile.labelKey)}</span
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
    </section>

    {#if libraryLinks.length > 0}
      <section class="destination-group" aria-labelledby="library-title">
        <div class="group-heading">
          <h2 id="library-title">{t(library.labelKey)}</h2>
          <p>{t("browse_home_your_library_desc")}</p>
        </div>
        <div class="library-links">
          {#each libraryLinks as link (link.id)}
            <button
              type="button"
              class="library-link"
              data-browse-library-link={link.id}
              onclick={(event) =>
                choose(
                  { kind: link.id as BrowseDestination },
                  event.currentTarget
                )}
            >
              <span class="library-icon" aria-hidden="true"
                >{@html link.icon}</span
              >
              <span class="library-copy"
                ><strong>{t(link.labelKey)}</strong><small
                  >{t(link.descKey)}</small
                ></span
              >
              <i class="fas fa-arrow-right library-arrow" aria-hidden="true"
              ></i>
            </button>
          {/each}
        </div>
      </section>
    {/if}
  </div>
</section>

<style>
  /* The home is a fitted frame at every size: the frame is the height of
     its box, Community takes what the question and Your library leave, and
     each tile's preview takes what is left inside its tile. */
  .browse-home {
    width: 100%;
    height: 100%;
    /* scrolls: only in a box shorter than the frame's floor (200% zoom, a tiny window), so every door stays in reach */
    overflow: auto;
    container: browse-home / size;
  }

  .browse-home-inner {
    --home-floor: 470px;
    width: calc(100% - clamp(20px, 3cqi, 80px));
    height: max(100%, var(--home-floor));
    margin: 0 auto;
    padding-block: clamp(20px, 4cqh, 52px);
    box-sizing: border-box;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
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

  .destination-group {
    display: grid;
    gap: 12px;
    min-width: 0;
  }
  .community-group {
    grid-template-rows: auto minmax(0, 1fr);
    min-height: 0;
  }
  .group-heading h2 {
    margin: 0;
    color: var(--theme-text);
    font-size: clamp(1.25rem, 2.2cqi, 1.6rem);
    line-height: 1.2;
  }
  .group-heading p {
    margin: 4px 0 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
  }

  .library-links {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }
  .library-link {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 64px;
    padding: 10px 14px;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-2026-sm, 10px);
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .library-link:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
  }
  .library-link:focus-visible {
    outline: 3px solid var(--theme-text);
    outline-offset: 2px;
  }
  .library-icon {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    flex: 0 0 auto;
    border-radius: 10px;
    background: color-mix(in srgb, #14b8a6 16%, var(--theme-card-bg));
    color: #14b8a6;
  }
  .library-copy {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .library-copy strong {
    font-size: var(--font-size-min, 14px);
  }
  .library-copy small {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
  }
  .library-arrow {
    margin-inline-start: auto;
    color: var(--theme-text-dim);
  }

  .tile-index {
    --stage-height: clamp(64px, 10cqh, 88px);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    min-height: 0;
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

  /* A phone: the three Community tiles share the group's height, each one
     row with its preview a square beside its name; the square's side comes
     from the tile's height. The group blurbs step aside, and Your library is
     two columns of one-line buttons with the fifth door across both. */
  @container browse-home (max-width: 599px) {
    .browse-home-inner {
      padding-block: 10px;
      gap: 12px;
    }
    h1 {
      font-size: var(--font-size-xl, 1.25rem);
      line-height: 1.18;
    }
    .destination-group {
      gap: 8px;
    }
    .group-heading h2 {
      font-size: var(--font-size-lg, 1.125rem);
    }
    .group-heading p,
    .has-chips .tile-description,
    .library-copy small,
    .library-arrow {
      display: none;
    }
    .tile-index {
      container: tiles / size;
      grid-template-rows: repeat(3, minmax(0, 1fr));
      gap: 8px;
      padding-top: 0;
    }
    .tile {
      --side: clamp(48px, calc((100cqh - 16px) / 3 - 18px), 128px);
      display: block;
      min-height: 0;
    }
    .tile-main {
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      grid-template-columns: var(--side) minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
      align-items: center;
      align-content: center;
      column-gap: 12px;
      padding: 8px;
      padding-inline-end: 12px;
    }
    .tile-stage {
      width: var(--side);
      height: var(--side);
    }
    .tile-copy {
      gap: 4px;
    }
    .tile-description {
      line-height: 1.35;
    }
    /* The chips sit under the Visuals name, beside its picture. */
    .has-chips .tile-copy {
      padding-bottom: 44px;
    }
    .has-chips .tile-chips {
      position: absolute;
      inset-inline: calc(8px + var(--side) + 12px) 12px;
      top: calc(50% + 2px);
      flex-wrap: nowrap;
      gap: 6px;
      padding: 0;
    }
    .tile-chip {
      min-height: var(--alt-touch-target, 36px);
      padding: 0 12px;
    }
    .library-links {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px 8px;
    }
    .library-link {
      min-height: 40px;
      gap: 8px;
      padding: 4px 10px;
      padding-inline-start: 6px;
    }
    .library-link:last-child:nth-child(odd) {
      grid-column: 1 / -1;
    }
    .library-icon {
      width: 28px;
      height: 28px;
      border-radius: 8px;
    }
    .library-copy strong {
      line-height: 1.15;
    }
  }

  /* Under 400px the two library columns are too narrow for an icon and a
     long name (German and Russian): the name alone, two lines at most. */
  @container browse-home (max-width: 399px) {
    .library-icon {
      display: none;
    }
    .library-link {
      padding-inline: 10px;
    }
  }

  /* Tiles too short for a whole description: name and picture only. */
  @container tiles (max-width: 599px) and (max-height: 387px) {
    .tile-description {
      display: none;
    }
  }

  /* The narrowest phones: a smaller picture and name keep the longest tile
     name whole, and the Visuals chips drop their icons to sit side by side. */
  @container tiles (max-width: 339px) {
    .tile {
      --side: clamp(
        48px,
        min(calc((100cqh - 16px) / 3 - 18px), 22cqw),
        128px
      );
    }
    .tile-name {
      font-size: var(--font-size-md, 1rem);
    }
    .tile-chip i {
      display: none;
    }
  }

  /* Short phones: the question steps aside for the eye and stays for screen
     readers; the top bar already says Browse. */
  @container browse-home (max-width: 599px) and (max-height: 559px) {
    .browse-home-header {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .browse-home-inner {
      --home-floor: 452px;
      grid-template-rows: minmax(0, 1fr) auto;
      gap: 10px;
      padding-block: 8px;
    }
    .library-link {
      min-height: var(--alt-touch-target, 36px);
    }
  }

  /* Two columns once a Community tile has room for its preview and copy.
     The tiles share one set of rows (preview, words, chips) through subgrid,
     so every tile in a row is the same size, the previews shrink and grow
     together and the names line up. */
  @container browse-home (min-width: 600px) {
    .browse-home-inner {
      --home-floor: 520px;
      width: calc(100% - 28px);
    }
    .tile-index {
      --stage-height: clamp(76px, 13cqh, 128px);
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: minmax(0, 1fr) auto auto;
      column-gap: 12px;
      row-gap: 0;
    }
    .library-links {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .tile {
      grid-row: span 3;
      grid-template-rows: subgrid;
      row-gap: 0;
    }
    .tile-main {
      grid-row: 1 / span 2;
      grid-template-rows: subgrid;
      row-gap: 14px;
      padding: 16px 18px 18px;
    }
    .tile-stage {
      grid-row: 1;
      height: auto;
      min-height: 0;
    }
    .tile-copy {
      grid-row: 2;
    }
    .tile-chips {
      grid-row: 3;
      padding: 0 18px 18px;
    }
    .tile-name {
      font-size: clamp(1.125rem, 2.6cqi, 1.5rem);
    }
    .tile-description {
      font-size: clamp(14px, 1.8cqi, 1rem);
    }
  }

  /* Two across: the third choice takes its own full-width row under the
     first two, its preview beside its words. */
  @container browse-home (min-width: 600px) and (max-width: 1099px) {
    .tile-index {
      grid-template-rows: minmax(0, 1fr) auto auto auto;
    }
    .tile.has-chips {
      --visual-preview-width: clamp(120px, 22cqi, 200px);
      grid-column: 1 / -1;
      grid-row: 4;
      grid-template-rows: auto auto;
      margin-top: 12px;
    }
    .has-chips .tile-main {
      grid-row: 1;
      grid-template-columns: var(--visual-preview-width) minmax(0, 1fr);
      grid-template-rows: auto;
      align-items: center;
      column-gap: 14px;
    }
    .has-chips .tile-stage {
      grid-row: 1;
      width: var(--visual-preview-width);
      height: var(--stage-height);
      min-height: 0;
    }
    .has-chips .tile-copy {
      grid-row: 1;
    }
    .has-chips .tile-chips {
      grid-row: 2;
      padding-inline-start: calc(18px + var(--visual-preview-width) + 14px);
    }
  }

  /* Two across in a frame under 900px tall (the Fold, 1024x768): the first
     two tiles turn on their side above Visuals, their picture a square from
     the frame's height; the Visuals chips move up beside its picture, and
     the library buttons keep one line. */
  @container browse-home (min-width: 600px) and (max-width: 1099px) and (min-height: 481px) and (max-height: 899px) {
    .tile-index {
      --side: clamp(64px, 15cqh, 128px);
      grid-template-rows: minmax(0, 1fr) auto;
      row-gap: 12px;
    }
    .tile:not(.has-chips) {
      grid-row: 1;
      display: block;
      min-height: 0;
    }
    .tile:not(.has-chips) .tile-main {
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      grid-row: auto;
      grid-template-columns: var(--side) minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
      align-items: center;
      align-content: center;
      column-gap: 14px;
      padding: 12px 14px;
    }
    .tile:not(.has-chips) .tile-stage {
      grid-row: auto;
      width: var(--side);
      height: var(--side);
    }
    .tile:not(.has-chips) .tile-copy {
      grid-row: auto;
    }
    .tile:not(.has-chips) .tile-name {
      font-size: var(--font-size-lg, 1.125rem);
    }
    .tile.has-chips {
      grid-row: 2;
      margin-top: 0;
    }
    .has-chips .tile-description,
    .library-copy small {
      display: none;
    }
    .has-chips .tile-copy {
      padding-bottom: 52px;
    }
    .has-chips .tile-chips {
      grid-row: auto;
      position: absolute;
      inset-inline: calc(18px + var(--visual-preview-width) + 14px) 18px;
      top: calc(50% + 2px);
      flex-wrap: nowrap;
      padding: 0;
    }
    .library-link {
      min-height: var(--min-touch-target, 44px);
      padding-block: 4px;
    }
    .library-icon {
      width: 32px;
      height: 32px;
    }
  }

  /* On short wide screens, put each preview beside its copy. */
  @container browse-home (min-width: 760px) and (max-height: 640px) {
    .tile-index {
      --stage-side: clamp(56px, 22cqh, 104px);
    }
    .tile-main {
      grid-template-columns: var(--stage-side) minmax(0, 1fr);
      align-items: center;
      column-gap: 14px;
      padding: 12px 14px;
    }
    .tile-stage {
      grid-row: 1 / span 2;
      width: var(--stage-side);
      height: auto;
      min-height: 0;
      aspect-ratio: 1;
    }
    .tile-copy {
      grid-row: 1 / span 2;
    }
    .tile-chips {
      padding: 0 14px 12px calc(14px + var(--stage-side) + 14px);
    }
  }

  /* A wide layout puts all three Community tiles in one row. */
  @container browse-home (min-width: 1100px) {
    .browse-home-inner {
      width: calc(100% - clamp(48px, 6cqi, 160px));
      max-width: 2400px;
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
    .browse-home-inner {
      --home-floor: 540px;
    }
    /* The tiles judge their arrangement by the height they share. */
    .tile-index {
      container: tiles / size;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      column-gap: 16px;
    }
    .library-links {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .tile-main {
      grid-template-columns: minmax(0, 1fr);
      padding: 16px 18px 18px;
    }
    .tile-stage {
      grid-row: 1;
      width: auto;
      aspect-ratio: auto;
      min-height: 0;
    }
    .tile-copy {
      grid-row: 2;
    }
    .tile-chips {
      padding: 0 18px 18px;
    }
  }

  /* Three across in a short frame (1280x720, 1366x650): tiles under 260px
     tall turn on their side, the picture a square from the tile's height
     and the Visuals chips beside it under the name. */
  @container tiles (min-width: 600px) and (max-height: 259px) {
    .tile {
      --side: min(calc(100cqh - 24px), calc((100cqw - 32px) * 0.12));
      display: block;
    }
    .tile-copy {
      gap: 4px;
    }
    .tile-name {
      font-size: var(--font-size-lg, 1.125rem);
    }
    .tile-description {
      line-height: 1.35;
    }
    .tile-main {
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      grid-template-columns: var(--side) minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
      align-items: center;
      align-content: center;
      column-gap: 14px;
      padding: 12px;
      padding-inline-end: 16px;
    }
    .tile-stage,
    .tile-copy {
      grid-row: 1;
    }
    .tile-stage {
      width: var(--side);
      height: var(--side);
    }
    .has-chips .tile-description,
    .tile-chip i {
      display: none;
    }
    .has-chips .tile-copy {
      padding-bottom: 52px;
    }
    .has-chips .tile-chips {
      position: absolute;
      inset-inline: calc(12px + var(--side) + 14px) 16px;
      top: calc(50% + 2px);
      flex-wrap: nowrap;
      gap: 6px;
      padding: 0;
    }
    .tile-chip {
      padding: 0 12px;
    }
  }

  /* Tiles under 130px tall: name and picture only. */
  @container tiles (min-width: 600px) and (max-height: 129px) {
    .tile-description {
      display: none;
    }
  }

  /* A phone held sideways (the Fold's cover on its side leaves about 280px
     under the top bar). The top bar already says Browse, so the question
     and the group blurbs step aside; the three Community tiles sit in one
     row with their previews beside their names, and Your library becomes a
     single row of five buttons. Nothing scrolls. */
  @container browse-home (min-width: 700px) and (max-height: 480px) {
    .browse-home-inner {
      width: calc(100% - 24px);
      height: auto;
      min-height: 100%;
      grid-template-rows: auto auto;
      align-content: center;
      gap: 10px;
      padding-block: 8px;
    }
    .browse-home-header {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .destination-group {
      gap: 6px;
    }
    .group-heading h2 {
      font-size: var(--font-size-lg, 1.125rem);
    }
    .group-heading p,
    .tile-description,
    .library-copy small,
    .library-arrow {
      display: none;
    }
    .tile-index {
      --stage-side: clamp(48px, 20cqh, 88px);
      container-type: normal;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      grid-template-rows: none;
      column-gap: 10px;
      padding-top: 0;
    }
    .tile,
    .tile.has-chips {
      display: flex;
      flex-direction: column;
      grid-column: auto;
      grid-row: auto;
      margin-top: 0;
    }
    .tile-main,
    .has-chips .tile-main {
      flex: 1;
      grid-row: auto;
      grid-template-columns: var(--stage-side) minmax(0, 1fr);
      grid-template-rows: auto;
      align-items: center;
      align-content: center;
      column-gap: 10px;
      padding: 8px 10px;
    }
    .tile-stage,
    .has-chips .tile-stage {
      grid-row: auto;
      width: var(--stage-side);
      height: var(--stage-side);
      min-height: 0;
      aspect-ratio: 1;
    }
    .tile-copy,
    .has-chips .tile-copy {
      grid-row: auto;
    }
    .tile-name {
      font-size: var(--font-size-lg, 1.125rem);
    }
    .tile-chips,
    .has-chips .tile-chips {
      flex-wrap: nowrap;
      gap: 6px;
      padding: 0 10px 8px;
    }
    .tile-chip {
      min-height: 36px;
      padding: 0 10px;
    }
    .library-links {
      grid-template-columns: none;
      grid-auto-flow: column;
      grid-auto-columns: minmax(0, 1fr);
      gap: 8px;
    }
    .library-link {
      min-height: 44px;
      gap: 8px;
      padding: 6px 10px;
    }
  }
</style>
