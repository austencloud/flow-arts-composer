<!--
  ExploreVisualsPanel.svelte — the public Explore > Visuals destination
  (Browse Phase 3 for tunnels, Phase 5A for mandalas).

  Lists approved public artifacts from the guest-readable projection and opens a
  live detail view for one. Everything shown here has passed moderation by
  construction: envelopes exist only while approved, so this panel can never
  surface private or withdrawn work.

  With no type named it is the front page (VisualsFront): a piece already
  playing, and a door per type. With a type named (a door, or a deep link) it
  is that type's wall: every piece of the type, laid out at the size that shows
  the artwork largest, and panning inside its own area once the pieces would
  shrink below a judgeable size.

  The list never scrolls (one-screen-per-step.md); only a full wall pans.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
    import { getBrowseNavigationContext } from "#lib/shared/browse/context/browse-navigation-context.js";
    import {
    listPublicArtifacts,
    getPublicArtifactDetail,
  } from "#lib/shared/artifact-revisions/services/public-artifact-loader.js";
  import type { PublicArtifactEnvelope } from "#lib/shared/artifact-revisions/domain/public-artifact.js";
  import PanelSpinner from "#lib/shared/components/panel/PanelSpinner.svelte";
  import TkaLabel from "#lib/shared/components/TkaLabel.svelte";
  import BrowseHeaderSlot from "#lib/features/browse/shared/components/BrowseHeaderSlot.svelte";
  import {
    fitVisualsWall,
    panColumns,
    type WallMetrics,
  } from "../domain/visuals-wall-fit.js";
  import { wallShowsMakerNames } from "../domain/visuals-makers.js";
  import { buildStagePlaylist } from "../domain/visuals-playlist.js";
  import {
    VISUAL_TYPES as TYPES,
    type PublishedVisualType,
  } from "../domain/visuals-types.js";
  import { createVisualPieceLoader } from "../services/visual-piece-loader.js";
  import VisualStill from "./VisualStill.svelte";
  import VisualPiecePage from "./VisualPiecePage.svelte";
  import VisualsFront from "./VisualsFront.svelte";

  const browseNavigation = getBrowseNavigationContext();

  const location = $derived(browseNavigation.currentLocation);
  const inVisuals = $derived(
    location?.primary === "explore" && location.section === "visuals"
  );

  /** Present only when a deep link names one type. Absent means show them all. */
  const filterType = $derived.by((): PublishedVisualType | undefined => {
    if (!inVisuals) return undefined;
    const named = location?.visualType;
    return TYPES.some((meta) => meta.route === named)
      ? (named as PublishedVisualType)
      : undefined;
  });

  const detailArtifactId = $derived(
    inVisuals && location?.view === "detail" ? location.contextId : undefined
  );

  let byType = $state<Record<string, PublicArtifactEnvelope[]>>({});
  let listLoading = $state(true);
  let listError = $state("");
  let listToken = 0;

  async function loadList() {
    const token = ++listToken;
    listLoading = true;
    listError = "";
    try {
      const results = await Promise.all(
        TYPES.map(
          async (meta) =>
            [
              meta.artifactType,
              await listPublicArtifacts(meta.artifactType),
            ] as const
        )
      );
      if (token !== listToken) return;
      byType = Object.fromEntries(results);
    } catch (cause) {
      console.warn("[ExploreVisuals] List load failed:", cause);
      if (token === listToken) {
        listError = t("browse_verified_visuals_load_failed");
      }
    } finally {
      if (token === listToken) listLoading = false;
    }
  }

  $effect(() => {
    void loadList();
  });

  /** The types that have work, in display order (the front page's doors). */
  const groups = $derived(
    TYPES.map((meta) => ({ meta, items: byType[meta.artifactType] ?? [] })).filter(
      (group) => group.items.length > 0
    )
  );

  /** The wall's one shelf: the named type, even when it is empty. */
  const shelves = $derived(
    TYPES.filter((meta) => meta.route === filterType).map((meta) => ({
      meta,
      items: byType[meta.artifactType] ?? [],
    }))
  );

  // The stage plays tunnels first, then mandalas; the loader keeps what it has
  // fetched for as long as this panel lives.
  const playlist = $derived(
    buildStagePlaylist(byType["tunnel"] ?? [], byType["mandala"] ?? [])
  );
  const loader = createVisualPieceLoader(getPublicArtifactDetail);

  /** Every listed piece, for the piece page's step control. */
  const allPieces = $derived(TYPES.flatMap((meta) => byType[meta.artifactType] ?? []));

  const totalCount = $derived(
    TYPES.reduce(
      (sum, meta) => sum + (byType[meta.artifactType]?.length ?? 0),
      0
    )
  );

  // ---- wall fit -------------------------------------------------------------

  /** Below this the artwork is a thumbnail, and the wall drills down instead. */
  const MIN_PLINTH = 150;

  interface WallLayout {
    /** `wall`: every piece on screen. `pan`: too full to fit whole, so the
     *  wall pans inside its own area. */
    readonly mode: "wall" | "pan";
    readonly direction: "row" | "column";
    readonly columns: readonly number[];
    readonly plinth: number;
  }

  let galleryBody = $state<HTMLElement | null>(null);
  let wall = $state<WallLayout | null>(null);
  function gapOf(element: Element | null, axis: "rowGap" | "columnGap") {
    return element ? parseFloat(getComputedStyle(element)[axis]) || 0 : 0;
  }

  function measureWall() {
    const body = galleryBody;
    const card = body?.querySelector<HTMLElement>(".art-card");
    const plinth = card?.querySelector<HTMLElement>(".art-plinth");
    if (shelves[0]?.items.length === 0) {
      // A named type with nothing published: no wall to fit.
      wall = { mode: "wall", direction: "row", columns: [0], plinth: 0 };
      return;
    }
    if (!body || !card || !plinth) return;
    // Read from the card's own box, not from its rendered width: a card
    // squeezed by the last fit would report less chrome than it has.
    const cardStyle = getComputedStyle(card);
    const chromeX = [
      "paddingLeft",
      "paddingRight",
      "borderLeftWidth",
      "borderRightWidth",
    ].reduce(
      (sum, side) =>
        sum +
        (parseFloat(cardStyle[side as keyof CSSStyleDeclaration] as string) ||
          0),
      0
    );

    const metrics: WallMetrics = {
      width: body.clientWidth,
      height: body.clientHeight,
      chromeX,
      chromeY: card.offsetHeight - plinth.offsetHeight,
      headHeight: 0,
      wallGap: gapOf(body.querySelector(".art-wall"), "columnGap"),
      shelfGap: gapOf(body, "columnGap"),
    };

    const full = fitVisualsWall(
      shelves.map((shelf) => shelf.items.length),
      metrics
    );
    if (full.plinth >= MIN_PLINTH) {
      wall = { mode: "wall", ...full };
      return;
    }
    const pan = panColumns(metrics, MIN_PLINTH);
    wall = {
      mode: "pan",
      direction: "column",
      columns: [pan.columns],
      plinth: pan.plinth,
    };
  }

  $effect(() => {
    const body = galleryBody;
    if (!body) return;
    measureWall();
    const observer = new ResizeObserver(() => measureWall());
    observer.observe(body);
    return () => observer.disconnect();
  });

  function openShelf(route: PublishedVisualType) {
    browseNavigation.navigateTo({
      primary: "explore",
      section: "visuals",
      view: "list",
      visualType: route,
    });
  }

  function openDetail(envelope: PublicArtifactEnvelope) {
    browseNavigation.navigateTo({
      primary: "explore",
      section: "visuals",
      view: "detail",
      contextId: envelope.artifactId,
      ...(filterType !== undefined && { visualType: filterType }),
    });
  }

  /** The count for the one type on screen. The bar already names that type and
   *  has the way back, so the count is all the wall has left to say. */
  const filteredCount = $derived(
    filterType && !detailArtifactId && !listLoading && !listError
      ? (shelves[0]?.items.length ?? 0)
      : null
  );
</script>

{#snippet countAction()}
  <span class="shelf-count">{filteredCount}</span>
{/snippet}

{#if filteredCount}
  <BrowseHeaderSlot actions={countAction} />
{/if}

<div class="visuals-panel">
  {#if detailArtifactId}
    <VisualPiecePage
      artifactId={detailArtifactId}
      pieces={allPieces}
      {loader}
      onStep={openDetail}
    />
  {:else}
    <div class="list-shell" class:padded={filterType !== undefined}>
      {#if listLoading}
        <div class="panel-status" role="status">
          <PanelSpinner size={10} />
          <span>{t("browse_verified_loading_community_visuals")}</span>
        </div>
      {:else if listError}
        <div class="panel-status error" role="alert">
          <span>{listError}</span>
          <button
            type="button"
            class="pill-btn"
            onclick={() => void loadList()}
          >
            <i class="fas fa-rotate-right" aria-hidden="true"></i>
            <span>{t("action_retry")}</span>
          </button>
        </div>
      {:else if totalCount === 0}
        <div class="panel-status">
          <i class="fas fa-wand-magic-sparkles empty-icon" aria-hidden="true"
          ></i>
          <span>{t("browse_ui_no_public_visuals_yet")}</span>
          <p class="empty-hint">
            Share a tunnel or a mandala publicly and it shows up here for
            everyone.
          </p>
        </div>
      {:else if !filterType}
        <VisualsFront
          {groups}
          {playlist}
          {loader}
          active={!detailArtifactId}
          onOpenPiece={openDetail}
          onOpenType={openShelf}
        />
      {:else}
        <div
          class="gallery-body"
          class:fitted={wall !== null}
          class:pan={wall?.mode === "pan"}
          style:--plinth={wall ? `${wall.plinth}px` : undefined}
          bind:this={galleryBody}
        >
          {#each shelves as shelf (shelf.meta.route)}
            <section class="shelf">
              {#if shelf.items.length === 0}
                <p class="shelf-empty">{t(shelf.meta.blurbKey)}</p>
              {:else}
                <div
                  class="art-wall themed-scrollbar"
                  style:--wall-cols={wall?.columns[0] ?? shelf.items.length}
                >
                  {#each shelf.items as envelope (envelope.artifactId)}
                    <button
                      type="button"
                      class="art-card"
                      onclick={() => openDetail(envelope)}
                    >
                      <span class="art-plinth">
                        <VisualStill
                          src={envelope.posterUrl}
                          kind={shelf.meta.artifactType}
                        />
                      </span>
                      <span class="art-meta">
                        <span class="art-title">
                          <TkaLabel text={envelope.title} darkMode />
                        </span>
                        {#if wallShowsMakerNames(shelf.items)}
                          <span class="art-byline"
                            >{envelope.ownerDisplayName}</span
                          >
                        {/if}
                      </span>
                    </button>
                  {/each}
                </div>
              {/if}
            </section>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .visuals-panel {
    display: flex;
    flex: 1;
    min-height: 0;
    min-width: 0;
    flex-direction: column;
  }

  .panel-status {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    flex: 1;
    min-height: 240px;
    padding: 2rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-min, 14px);
    text-align: center;
  }

  .panel-status.error {
    color: var(--semantic-error, #ef4444);
  }

  .empty-icon {
    font-size: 2.5rem;
    opacity: 0.5;
  }

  .empty-hint {
    margin: 0;
    max-width: 34rem;
    font-size: var(--font-size-compact, 12px);
    opacity: 0.8;
  }

  .list-shell {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .list-shell.padded {
    gap: clamp(14px, 1.4cqi, 24px);
    padding: clamp(12px, 1.6cqi, 28px);
  }

  /* The area the wall is fitted to. It never grows with its content, so what
     measureWall() reads is the space left on screen. The wall stays hidden
     until its first fit, so it never paints at a guessed size. */
  .gallery-body {
    --art-wall-gap: clamp(16px, 1.8cqi, 32px);
    flex: 1;
    min-height: 0;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(28px, 3cqi, 56px);
    overflow: hidden;
    visibility: hidden;
  }

  .gallery-body.fitted {
    visibility: visible;
  }

  /* One type too full to fit whole: its wall pans, and the heading and the
     way back stay where they are. */
  .gallery-body.pan {
    align-items: stretch;
    justify-content: flex-start;
  }

  .gallery-body.pan .shelf {
    flex: 1;
    min-height: 0;
  }

  .gallery-body.pan .art-wall {
    min-height: 0;
    overflow-y: auto;
    align-content: start;
    /* Rows keep their cards' full height. Left as auto, they shrink to fit the
       wall's height and it never pans. */
    grid-auto-rows: max-content;
  }

  .shelf {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: clamp(14px, 1.4cqi, 24px);
  }

  .shelf-count {
    min-width: 1.75em;
    padding: 0.1em 0.55em;
    border-radius: 999px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text-muted, #9aa6b8);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-align: center;
    font-size: clamp(0.8rem, 0.32vw + 0.62rem, 1.25rem);
  }

  .shelf-empty {
    margin: 0;
    text-align: center;
    color: var(--theme-text-muted, #9aa6b8);
    font-size: var(--font-size-min, 14px);
  }

  /* Column count and artwork size both come from the fit. */
  .art-wall {
    display: grid;
    grid-template-columns: repeat(var(--wall-cols, 1), auto);
    justify-content: center;
    gap: var(--art-wall-gap);
  }

  /* The tile is the card's frame: it carries the hairline and the rounding. */
  .art-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0;
    border: none;
    border-radius: 12px;
    background: none;
    color: var(--theme-text, #e8edf6);
    text-align: center;
    cursor: pointer;
  }

  .art-card:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: -2px;
  }

  /* The poster sits on its own dark tile (VisualStill). */
  .art-plinth {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    /* Capped at its card, so artwork never spills past the frame, even for
       the frame between a resize and the next fit. */
    width: var(--plinth, 12rem);
    max-width: 100%;
    aspect-ratio: 1;
    /* A squeezed card would otherwise give up the artwork before anything else. */
    flex-shrink: 0;
  }

  /* The hover lifts the artwork's own brightness (see VisualStill). */
  @media (hover: hover) {
    .art-card:hover .art-plinth {
      --still-lift: 1.2;
    }
  }

  .art-meta {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    width: var(--plinth, 12rem);
    max-width: 100%;
    min-width: 0;
  }

  /* Stays the full width of the column and centers the word inside. A title
     box sized by its word would feed back into the word's fit-to-width, so it
     would ratchet smaller on every resize and never grow back. */
  .art-title {
    --tka-label-justify: safe center;
    font-size: clamp(1rem, 0.55vw + 0.62rem, 1.9rem);
    font-weight: 700;
    letter-spacing: 0.01em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .art-byline {
    font-size: clamp(0.82rem, 0.4vw + 0.5rem, 1.35rem);
    color: var(--theme-text-muted, #9aa6b8);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pill-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 8px 16px;
    border-radius: 999px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text, white);
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
    cursor: pointer;
    transition: border-color var(--duration-fast) var(--ease-standard);
  }

  @media (hover: hover) {
    .pill-btn:hover {
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    }
  }

  .pill-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }
</style>
