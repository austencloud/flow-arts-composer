<!--
  ExploreVisualsPanel.svelte — the public Explore > Visuals destination
  (Browse Phase 3 for tunnels, Phase 5A for mandalas).

  Lists approved public artifacts from the guest-readable projection and opens a
  live detail view for one. Everything shown here has passed moderation by
  construction: envelopes exist only while approved, so this panel can never
  surface private or withdrawn work.

  Composition follows the gallery's own language: a titled shelf per artifact
  type, artwork on a plinth, one centered wall. There is deliberately NO type
  picker — the supply is small enough to show whole, and a two-option segmented
  control floating over an empty canvas was the thing this replaced. A type
  still survives in the URL for deep links, and there it reads as a filter with
  a way back to everything.

  The list never scrolls (one-screen-per-step.md). The wall is measured and
  laid out at whichever arrangement shows the artwork largest; once that would
  shrink the pieces below a judgeable size, each type becomes one door that
  opens its own screen, and only that screen's wall pans.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { Component } from "svelte";
  import { getBrowseNavigationContext } from "#lib/shared/browse/context/browse-navigation-context.js";
  import type { BrowseVisualType } from "#lib/shared/browse/navigation/browse-route-resolver.js";
  import {
    listPublicArtifacts,
    getPublicArtifactDetail,
  } from "#lib/shared/artifact-revisions/services/public-artifact-loader.js";
  import type {
    PublicArtifactEnvelope,
    PublicArtifactType,
  } from "#lib/shared/artifact-revisions/domain/public-artifact.js";
  import {
    collectedTunnelFromPublicArtifact,
    type TunnelPublicPayload,
  } from "#lib/features/tunnel-collection/domain/tunnel-public-revision.js";
  import type { MandalaPublicPayload } from "#lib/features/mandala/tabs/collection/domain/mandala-public-revision.js";
  import type { CollectedTunnel } from "#lib/features/tunnel-collection/domain/tunnel-collection-types.js";
  import PanelSpinner from "#lib/shared/components/panel/PanelSpinner.svelte";
  import TkaLabel from "#lib/shared/components/TkaLabel.svelte";
  import {
    fitVisualsWall,
    panColumns,
    type WallMetrics,
  } from "../domain/visuals-wall-fit.js";

  const browseNavigation = getBrowseNavigationContext();

  /** The visual types with a shipped publication adapter today. Scenes join
   *  when Phase 5B gives them one. */
  type PublishedVisualType = Extract<BrowseVisualType, "tunnels" | "mandalas">;

  interface TypeMeta {
    readonly route: PublishedVisualType;
    readonly artifactType: PublicArtifactType;
    readonly label: string;
    readonly blurb: string;
  }

  const TYPES: readonly TypeMeta[] = [
    {
      route: "tunnels",
      artifactType: "tunnel",
      label: "Tunnels",
      blurb:
        "Save a tunnel and share it publicly — it shows up here for everyone.",
    },
    {
      route: "mandalas",
      artifactType: "mandala",
      label: "Mandalas",
      blurb:
        "Save a mandala and share it publicly — it shows up here for everyone.",
    },
  ];

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

  /** Shelves actually rendered: the filtered type, or every type that has work
   *  in it. A type with nothing published contributes no empty shelf. */
  const shelves = $derived.by(() => {
    const visible = filterType
      ? TYPES.filter((meta) => meta.route === filterType)
      : TYPES;
    return visible
      .map((meta) => ({ meta, items: byType[meta.artifactType] ?? [] }))
      .filter((shelf) => filterType !== undefined || shelf.items.length > 0);
  });

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
    /** `shelves`: every piece on screen. `doors`: one card per type, each
     *  opening that type's screen. `pan`: one type too full to fit whole, so
     *  its wall pans inside its own area. */
    readonly mode: "shelves" | "doors" | "pan";
    readonly direction: "row" | "column";
    readonly columns: readonly number[];
    readonly plinth: number;
  }

  let galleryBody = $state<HTMLElement | null>(null);
  let wall = $state<WallLayout | null>(null);
  /** The shelf heading is absent while doors show, so its last height is kept
   *  for deciding when the full wall fits again. */
  let headHeight = 0;

  function gapOf(element: Element | null, axis: "rowGap" | "columnGap") {
    return element ? parseFloat(getComputedStyle(element)[axis]) || 0 : 0;
  }

  function measureWall() {
    const body = galleryBody;
    const card = body?.querySelector<HTMLElement>(".art-card");
    const plinth = card?.querySelector<HTMLElement>(".art-plinth");
    if (!body || !card || !plinth) return;
    const head = body.querySelector<HTMLElement>(".shelf-head");
    if (head)
      headHeight = head.offsetHeight + gapOf(head.parentElement, "rowGap");

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
      headHeight,
      wallGap: gapOf(body.querySelector(".art-wall"), "columnGap"),
      shelfGap: gapOf(body, "columnGap"),
    };

    const full = fitVisualsWall(
      shelves.map((shelf) => shelf.items.length),
      metrics
    );
    if (full.plinth >= MIN_PLINTH) {
      wall = { mode: "shelves", ...full };
      return;
    }
    if (shelves.length > 1) {
      wall = {
        mode: "doors",
        ...fitVisualsWall([shelves.length], { ...metrics, headHeight: 0 }),
      };
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

  // ---- detail state ---------------------------------------------------------

  // Both preview renderers are heavy; load one only when a detail opens, and
  // pick which from the envelope's own artifactType rather than from the URL —
  // that is what lets the list drop its type segment entirely.
  let TunnelDetailPreview = $state<Component<{
    tunnel: CollectedTunnel;
  }> | null>(null);
  let MandalaDetailPreview = $state<Component<{
    payload: MandalaPublicPayload;
  }> | null>(null);

  let detailTunnel = $state<CollectedTunnel | null>(null);
  let detailMandala = $state<MandalaPublicPayload | null>(null);
  let detailEnvelope = $state<PublicArtifactEnvelope | null>(null);
  let detailLoading = $state(false);
  let detailError = $state("");
  let detailToken = 0;

  function clearDetail() {
    detailTunnel = null;
    detailMandala = null;
    detailEnvelope = null;
  }

  $effect(() => {
    const artifactId = detailArtifactId;
    const token = ++detailToken;
    if (!artifactId) {
      clearDetail();
      detailError = "";
      detailLoading = false;
      return;
    }
    detailLoading = true;
    detailError = "";
    void (async () => {
      try {
        const detail = await getPublicArtifactDetail<
          TunnelPublicPayload | MandalaPublicPayload
        >(artifactId);
        if (token !== detailToken) return;
        if (!detail) {
          detailError = t("browse_verified_visual_not_public");
          clearDetail();
          return;
        }

        if (detail.envelope.artifactType === "mandala") {
          if (!MandalaDetailPreview) {
            const loaded = await import("./MandalaDetailPreview.svelte");
            if (token !== detailToken) return;
            MandalaDetailPreview = loaded.default;
          }
          detailEnvelope = detail.envelope;
          detailTunnel = null;
          detailMandala = detail.revision.payload as MandalaPublicPayload;
          return;
        }

        // The publication adapter validates the revision, upgrades snapshots
        // published before saved colors, and keeps the authored cast.
        const tunnel = collectedTunnelFromPublicArtifact(
          detail.envelope,
          detail.revision.payload as TunnelPublicPayload
        );
        if (!tunnel) {
          detailError = t("browse_verified_visual_load_failed");
          clearDetail();
          return;
        }
        if (!TunnelDetailPreview) {
          const loaded =
            await import("#lib/features/tunnel-collection/components/TunnelDetailPreview.svelte");
          if (token !== detailToken) return;
          TunnelDetailPreview = loaded.default;
        }
        detailEnvelope = detail.envelope;
        detailMandala = null;
        detailTunnel = tunnel;
      } catch (cause) {
        console.warn("[ExploreVisuals] Detail load failed:", cause);
        if (token === detailToken) {
          detailError = t("browse_verified_visual_load_failed");
          clearDetail();
        }
      } finally {
        if (token === detailToken) detailLoading = false;
      }
    })();
  });

  function openDetail(envelope: PublicArtifactEnvelope) {
    browseNavigation.navigateTo({
      primary: "explore",
      section: "visuals",
      view: "detail",
      contextId: envelope.artifactId,
      ...(filterType !== undefined && { visualType: filterType }),
    });
  }

  function backToList() {
    browseNavigation.navigateTo({
      primary: "explore",
      section: "visuals",
      view: "list",
      ...(filterType !== undefined && { visualType: filterType }),
    });
  }

  function showEverything() {
    browseNavigation.navigateTo({
      primary: "explore",
      section: "visuals",
      view: "list",
    });
  }

  function formatPublished(timestamp: unknown): string {
    if (!timestamp) return "";
    const date =
      timestamp instanceof Date
        ? timestamp
        : ((timestamp as { toDate?: () => Date }).toDate?.() ??
          new Date(timestamp as string));
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
</script>

<div class="visuals-panel">
  {#if detailArtifactId}
    <div class="detail-shell">
      <header class="detail-header">
        <button type="button" class="pill-btn" onclick={backToList}>
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
          <span>{t("browse_ui_all_visuals")}</span>
        </button>
        {#if detailEnvelope}
          <div class="detail-title">
            <h2>
              <TkaLabel
                text={detailEnvelope.title}
                darkMode
                fitToParent={false}
              />
            </h2>
            <p class="detail-byline">
              {t("browse_verified_by_creator", {
                name: detailEnvelope.ownerDisplayName,
              })}
              {#if formatPublished(detailEnvelope.publishedAt)}
                · {t("browse_verified_published_date", {
                  date: formatPublished(detailEnvelope.publishedAt),
                })}
              {/if}
            </p>
          </div>
        {/if}
      </header>

      <div class="detail-preview">
        {#if detailLoading}
          <div class="panel-status" role="status">
            <PanelSpinner size={10} />
            <span>{t("browse_verified_loading_visual")}</span>
          </div>
        {:else if detailError}
          <div class="panel-status error" role="alert">
            <span>{detailError}</span>
            <button type="button" class="pill-btn" onclick={backToList}>
              <i class="fas fa-arrow-left" aria-hidden="true"></i>
              <span>{t("browse_ui_back_to_visuals")}</span>
            </button>
          </div>
        {:else if detailTunnel && TunnelDetailPreview}
          <TunnelDetailPreview tunnel={detailTunnel} />
        {:else if detailMandala && MandalaDetailPreview}
          <MandalaDetailPreview payload={detailMandala} />
        {/if}
      </div>
    </div>
  {:else}
    <div class="list-shell">
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
      {:else}
        {#if filterType}
          <div class="filter-row">
            <button type="button" class="pill-btn" onclick={showEverything}>
              <i class="fas fa-arrow-left" aria-hidden="true"></i>
              <span>{t("browse_ui_all_visuals")}</span>
            </button>
          </div>
        {/if}

        <div
          class="gallery-body"
          class:fitted={wall !== null}
          class:pan={wall?.mode === "pan"}
          class:stacked={wall?.direction === "column"}
          style:--plinth={wall ? `${wall.plinth}px` : undefined}
          bind:this={galleryBody}
        >
          {#if wall?.mode === "doors"}
            <div class="art-wall" style:--wall-cols={wall.columns[0]}>
              {#each shelves as shelf (shelf.meta.route)}
                {@const cover = shelf.items[0]}
                <button
                  type="button"
                  class="art-card"
                  onclick={() => openShelf(shelf.meta.route)}
                >
                  <span class="art-plinth">
                    {#if cover?.posterUrl}
                      <img
                        src={cover.posterUrl}
                        alt=""
                        loading="lazy"
                        draggable="false"
                      />
                    {/if}
                  </span>
                  <span class="art-meta">
                    <span class="art-title">{shelf.meta.label}</span>
                    <span class="art-byline"
                      >{shelf.items.length === 1
                        ? "1 piece"
                        : `${shelf.items.length} pieces`}</span
                    >
                  </span>
                </button>
              {/each}
            </div>
          {:else}
            {#each shelves as shelf, shelfIndex (shelf.meta.route)}
              <section class="shelf">
                <header class="shelf-head">
                  <h2>{shelf.meta.label}</h2>
                  <span class="shelf-count">{shelf.items.length}</span>
                </header>

                {#if shelf.items.length === 0}
                  <p class="shelf-empty">{shelf.meta.blurb}</p>
                {:else}
                  <div
                    class="art-wall themed-scrollbar"
                    style:--wall-cols={wall?.columns[shelfIndex] ??
                      shelf.items.length}
                  >
                    {#each shelf.items as envelope (envelope.artifactId)}
                      <button
                        type="button"
                        class="art-card"
                        onclick={() => openDetail(envelope)}
                      >
                        <span class="art-plinth">
                          {#if envelope.posterUrl}
                            <img
                              src={envelope.posterUrl}
                              alt=""
                              loading="lazy"
                              draggable="false"
                            />
                          {:else}
                            <span class="art-pending" aria-hidden="true">
                              <i class="fas fa-circle-notch"></i>
                            </span>
                          {/if}
                        </span>
                        <span class="art-meta">
                          <span class="art-title">
                            <TkaLabel text={envelope.title} darkMode />
                          </span>
                          <span class="art-byline"
                            >By {envelope.ownerDisplayName}</span
                          >
                        </span>
                      </button>
                    {/each}
                  </div>
                {/if}
              </section>
            {/each}
          {/if}
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
    gap: clamp(14px, 1.4cqi, 24px);
    padding: clamp(20px, 2.4cqi, 44px);
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

  .gallery-body.stacked {
    flex-direction: column;
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
  }

  .filter-row {
    display: flex;
    justify-content: center;
  }

  .shelf {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: clamp(14px, 1.4cqi, 24px);
  }

  .shelf-head {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 0.6rem;
  }

  .shelf-head h2 {
    margin: 0;
    font-size: clamp(1.2rem, 1.15vw + 0.55rem, 2.6rem);
    font-weight: 800;
    letter-spacing: -0.01em;
    color: var(--theme-text, #e8edf6);
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

  .art-card {
    display: flex;
    flex-direction: column;
    gap: clamp(0.7rem, 0.35vw + 0.45rem, 1.4rem);
    padding: clamp(0.7rem, 0.35vw + 0.45rem, 1.4rem);
    padding-bottom: clamp(0.85rem, 0.4vw + 0.55rem, 1.7rem);
    border-radius: clamp(16px, 0.7vw + 8px, 32px);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #e8edf6);
    text-align: left;
    cursor: pointer;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard);
  }

  @media (hover: hover) {
    .art-card:hover {
      border-color: color-mix(
        in srgb,
        var(--theme-accent, #6366f1) 55%,
        transparent
      );
      transform: translateY(-2px);
      box-shadow: 0 14px 34px
        color-mix(in srgb, var(--theme-accent, #6366f1) 18%, transparent);
    }
  }

  .art-card:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  /* The posters are bright strokes rendered on solid black. Dropped straight
     onto a dark panel they read as holes, which is exactly how they looked
     before. `screen` blending drops the black out so the artwork sits ON the
     plinth and keeps its own glow. */
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
    border-radius: clamp(12px, 0.55vw + 5px, 24px);
    overflow: hidden;
    background:
      radial-gradient(
        118% 118% at 50% 22%,
        color-mix(in srgb, var(--theme-accent, #6366f1) 20%, transparent),
        transparent 68%
      ),
      linear-gradient(
        170deg,
        rgba(255, 255, 255, 0.07),
        rgba(255, 255, 255, 0.02)
      );
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07);
  }

  .art-plinth img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    mix-blend-mode: screen;
  }

  .art-pending {
    color: var(--theme-text-muted, #9aa6b8);
    font-size: 1.4rem;
    opacity: 0.7;
  }

  .art-meta {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    width: var(--plinth, 12rem);
    max-width: 100%;
    padding: 0 0.25rem;
    min-width: 0;
  }

  .art-title {
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

  @media (prefers-reduced-motion: reduce) {
    .art-card {
      transition: none;
    }
    .art-card:hover {
      transform: none;
    }
  }

  .detail-shell {
    display: flex;
    flex: 1;
    min-height: 0;
    flex-direction: column;
  }

  .detail-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px clamp(16px, 2cqi, 32px);
    border-bottom: 1px solid
      color-mix(in srgb, var(--theme-text, #fff) 8%, transparent);
    flex-wrap: wrap;
  }

  .detail-title {
    min-width: 0;
  }

  .detail-title h2 {
    margin: 0;
    color: var(--theme-text, white);
    font-size: clamp(16px, 1.6cqi, 22px);
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .detail-byline {
    margin: 2px 0 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 12px);
  }

  .detail-preview {
    display: flex;
    flex: 1;
    min-height: 0;
    align-items: center;
    justify-content: center;
    padding: clamp(12px, 1.6cqi, 28px);
    container-type: size;
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
