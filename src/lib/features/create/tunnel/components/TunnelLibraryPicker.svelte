<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { flip } from "svelte/animate";
  import PanelHeader from "#lib/shared/create/components/PanelHeader.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import PanelSpinner from "#lib/shared/components/panel/PanelSpinner.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { flipDuration } from "#lib/shared/transitions/motion.js";
  import type { PublicArtifactEnvelope } from "#lib/shared/artifact-revisions/domain/public-artifact.js";
  import type { CollectedTunnel } from "#lib/features/tunnel-collection/domain/tunnel-collection-types.js";
  import { needsTunnelPosterRefresh } from "#lib/features/tunnel-collection/domain/tunnel-artifact-migration.js";
  import {
    describeTunnelForDiscovery,
    matchesTunnelDiscoveryQuery,
    sortTunnelDiscovery,
    tunnelDiscoverySavedAt,
    type TunnelDiscoverySort,
  } from "#lib/features/tunnel-collection/domain/tunnel-discovery.js";
  import { refreshTunnelPoster } from "#lib/features/tunnel-collection/services/tunnel-poster-refresh.js";
  import {
    hydratePublicTunnelDiscovery,
    listPublicTunnelDiscovery,
    type PublicTunnelDiscoveryEntry,
  } from "#lib/features/tunnel-collection/services/tunnel-public-discovery.js";
  import TunnelDiscoveryCard from "./TunnelDiscoveryCard.svelte";

  type TunnelSource = "mine" | "explore";
  type PosterState = "queued" | "refreshing" | "failed";

  let {
    items,
    active = false,
    loading = false,
    activeTunnelId = null,
    onSelect,
    onOpenPublic,
    onNew,
    onManage,
    onClose,
  }: {
    items: readonly CollectedTunnel[];
    active?: boolean;
    loading?: boolean;
    activeTunnelId?: string | null;
    onSelect: (tunnel: CollectedTunnel) => void;
    onOpenPublic: (envelope: PublicArtifactEnvelope) => void;
    onNew: () => void;
    onManage: () => void;
    onClose: () => void;
  } = $props();

  let source = $state<TunnelSource>("mine");
  let query = $state("");
  let sort = $state<TunnelDiscoverySort>("recent");
  let publicEntries = $state<PublicTunnelDiscoveryEntry[]>([]);
  let publicLoading = $state(false);
  let publicAttempted = $state(false);
  let publicError = $state<string | null>(null);
  let publicGeneration = 0;
  let posterStates = $state<Record<string, PosterState>>({});
  const scheduledPosterKeys = new Set<string>();
  let posterQueue: Promise<void> = Promise.resolve();

  const sourceOptions = $derived([
    {
      value: "mine" as const,
      label: t("tunnel_library_mine"),
      ariaLabel: t("tunnel_library_mine_count", { count: items.length }),
      count: items.length,
      id: "tunnel-source-mine",
      controls: "tunnel-library-results",
    },
    {
      value: "explore" as const,
      label: t("tunnel_library_explore"),
      ariaLabel: publicAttempted
        ? t("tunnel_library_explore_count", { count: publicEntries.length })
        : t("tunnel_library_explore_public_tunnels"),
      count: publicAttempted ? publicEntries.length : null,
      id: "tunnel-source-explore",
      controls: "tunnel-library-results",
    },
  ]);

  const visibleItems = $derived(
    sortTunnelDiscovery(
      items.filter((item) => matchesTunnelDiscoveryQuery(item, query)),
      sort
    )
  );

  const visiblePublicEntries = $derived.by(() => {
    const needle = query.trim().toLocaleLowerCase();
    const filtered = publicEntries.filter((entry) => {
      const detail = entry.tunnel
        ? describeTunnelForDiscovery(entry.tunnel).searchText
        : "";
      return (
        !needle ||
        [entry.envelope.title, entry.envelope.ownerDisplayName, detail]
          .join(" ")
          .toLocaleLowerCase()
          .includes(needle)
      );
    });

    return [...filtered].sort((a, b) => {
      const aSummary = a.tunnel ? describeTunnelForDiscovery(a.tunnel) : null;
      const bSummary = b.tunnel ? describeTunnelForDiscovery(b.tunnel) : null;
      switch (sort) {
        case "name":
          return a.envelope.title.localeCompare(b.envelope.title, undefined, {
            sensitivity: "base",
          });
        case "performers":
          return (
            (bSummary?.authoredCount ?? -1) - (aSummary?.authoredCount ?? -1) ||
            publicTimestamp(b.envelope.updatedAt) -
              publicTimestamp(a.envelope.updatedAt)
          );
        case "instances":
          return (
            (bSummary?.renderedCount ?? -1) - (aSummary?.renderedCount ?? -1) ||
            publicTimestamp(b.envelope.updatedAt) -
              publicTimestamp(a.envelope.updatedAt)
          );
        case "recent":
        default:
          return (
            publicTimestamp(b.envelope.updatedAt) -
            publicTimestamp(a.envelope.updatedAt)
          );
      }
    });
  });

  const failedPosterCount = $derived(
    Object.values(posterStates).filter((state) => state === "failed").length
  );

  function localPosterKey(tunnel: CollectedTunnel): string {
    return [
      tunnel.id,
      tunnel.currentRevisionId ?? "legacy",
      tunnel.currentContentDigest ?? "unknown",
      tunnel.currentRevisionCreatedAt ?? tunnel.createdAt,
    ].join(":");
  }

  function setPosterState(id: string, state: PosterState | null): void {
    if (state) {
      posterStates = { ...posterStates, [id]: state };
      return;
    }
    const next = { ...posterStates };
    delete next[id];
    posterStates = next;
  }

  function schedulePosterRefresh(tunnel: CollectedTunnel): void {
    const key = localPosterKey(tunnel);
    if (scheduledPosterKeys.has(key)) return;
    scheduledPosterKeys.add(key);
    setPosterState(tunnel.id, "queued");

    const refresh = async () => {
      if (!active || source !== "mine") {
        scheduledPosterKeys.delete(key);
        setPosterState(tunnel.id, null);
        return;
      }
      setPosterState(tunnel.id, "refreshing");
      const result = await refreshTunnelPoster(tunnel);
      if (result === "failed" || result === "unavailable") {
        setPosterState(tunnel.id, "failed");
      } else {
        setPosterState(tunnel.id, null);
      }
    };
    posterQueue = posterQueue.then(refresh, refresh);
  }

  function retryFailedPosters(): void {
    for (const tunnel of items) {
      if (posterStates[tunnel.id] !== "failed") continue;
      scheduledPosterKeys.delete(localPosterKey(tunnel));
      setPosterState(tunnel.id, null);
      schedulePosterRefresh(tunnel);
    }
  }

  function publicTimestamp(value: unknown): number {
    if (value instanceof Date) return value.getTime();
    if (typeof value === "number") return value;
    if (typeof value === "string") return Date.parse(value) || 0;
    if (value && typeof value === "object") {
      if ("toMillis" in value && typeof value.toMillis === "function") {
        return value.toMillis();
      }
      if ("toDate" in value && typeof value.toDate === "function") {
        const date = value.toDate();
        return date instanceof Date ? date.getTime() : 0;
      }
    }
    return 0;
  }

  function dateLabel(prefix: string, timestamp: number): string {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return prefix;
    return `${prefix} ${new Date(timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;
  }

  async function loadPublicTunnels(force = false): Promise<void> {
    if (publicLoading || (publicAttempted && !force)) return;
    const generation = ++publicGeneration;
    publicAttempted = true;
    publicLoading = true;
    publicError = null;
    try {
      const entries = await listPublicTunnelDiscovery();
      if (generation !== publicGeneration) return;
      publicEntries = entries;
      publicLoading = false;

      void hydratePublicTunnelDiscovery(entries, (entry, index) => {
        if (generation !== publicGeneration) return;
        publicEntries = publicEntries.map((current, currentIndex) =>
          currentIndex === index ? entry : current
        );
      }).catch(() => {
        // Individual detail failures preserve their envelope card. The service
        // already isolates them; this catch only guards an unexpected worker
        // failure from becoming an unhandled rejection.
      });
    } catch {
      if (generation !== publicGeneration) return;
      publicEntries = [];
      publicError = t("tunnel_library_public_tunnels_could_not_be_loaded");
      publicLoading = false;
    }
  }

  function retryPublicTunnels(): void {
    void loadPublicTunnels(true);
  }

  $effect(() => {
    if (!active || source !== "mine") return;
    for (const tunnel of items) {
      if (needsTunnelPosterRefresh(tunnel)) schedulePosterRefresh(tunnel);
    }
  });

  $effect(() => {
    if (active && source === "explore" && !publicAttempted) {
      void loadPublicTunnels();
    }
  });
</script>

<section class="tunnel-library" aria-label={t("create_ui_tunnels")}>
  <PanelHeader
    title={t("create_ui_tunnels")}
    subtitle={source === "mine"
      ? t("tunnel_library_saved_count", { count: items.length })
      : t("tunnel_library_published_by_the_community")}
    {onClose}
  />

  <div class="source-switcher">
    <SegmentedControl
      options={sourceOptions}
      value={source}
      onchange={(value) => (source = value)}
      color="accent"
      size="sm"
      density="compact"
      ariaLabel={t("tunnel_library_tunnel_source")}
      semantics="tabs"
    />
  </div>

  <div class="library-toolbar">
    <label class="search-field">
      <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
      <span class="sr-only"
        >{t("create_ui_search_tunnels_by_name_prop_or_formation")}</span
      >
      <input
        id="tunnel-library-search"
        name="tunnel-library-search"
        type="search"
        bind:value={query}
        placeholder={t("create_ui_name_prop_or_formation")}
        autocomplete="off"
      />
      {#if query}
        <button
          type="button"
          class="clear-search"
          onclick={() => (query = "")}
          aria-label={t("create_ui_clear_tunnel_search")}
        >
          <i class="fas fa-xmark" aria-hidden="true"></i>
        </button>
      {/if}
    </label>

    <label class="sort-field">
      <span class="sr-only">{t("create_ui_sort_tunnels")}</span>
      <i class="fas fa-arrow-down-wide-short" aria-hidden="true"></i>
      <select
        id="tunnel-library-sort"
        name="tunnel-library-sort"
        bind:value={sort}
        aria-label={t("create_ui_sort_tunnels")}
      >
        <option value="recent">{t("sort_recent")}</option>
        <option value="name">{t("create_ui_name")}</option>
        <option value="performers">{t("create_ui_most_authored")}</option>
        <option value="instances">{t("create_ui_most_on_stage")}</option>
      </select>
    </label>

    <PanelButton
      variant="primary"
      onclick={onNew}
      ariaLabel={t("tunnel_library_start_a_new_tunnel")}
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span class="new-label">{t("create_ui_new_tunnel")}</span>
    </PanelButton>
  </div>

  <div
    class="library-scroll themed-scrollbar"
    id="tunnel-library-results"
    role="tabpanel"
    aria-labelledby={source === "mine"
      ? "tunnel-source-mine"
      : "tunnel-source-explore"}
  >
    {#if source === "mine"}
      {#if loading && items.length === 0}
        <div class="library-state" role="status">
          <PanelSpinner size={12} />
          <strong>{t("create_ui_loading_your_tunnels")}</strong>
        </div>
      {:else if items.length === 0}
        <div class="library-state">
          <i class="fas fa-fan state-icon" aria-hidden="true"></i>
          <strong>{t("create_ui_no_saved_tunnels_yet")}</strong>
          <p>
            {t("create_ui_build_one_here_open_it_in_the_viewer_then_save_it")}
          </p>
        </div>
      {:else if visibleItems.length === 0}
        <div class="library-state" role="status">
          <i class="fas fa-magnifying-glass state-icon" aria-hidden="true"></i>
          <strong>{t("create_ui_no_matching_tunnels")}</strong>
          <p>{t("create_ui_try_a_name_prop_effect_or_formation")}</p>
        </div>
      {:else}
        <div
          class="library-grid"
          aria-label={t("create_ui_your_saved_tunnels")}
        >
          {#each visibleItems as tunnel (tunnel.id)}
            <div animate:flip={{ duration: flipDuration() }}>
              <TunnelDiscoveryCard
                name={tunnel.name}
                poster={tunnel.poster}
                summary={describeTunnelForDiscovery(tunnel)}
                dateLabel={dateLabel(t("tunnel_library_saved"), tunnelDiscoverySavedAt(tunnel))}
                active={tunnel.id === activeTunnelId}
                posterState={posterStates[tunnel.id] ?? null}
                actionLabel={tunnel.id === activeTunnelId
                  ? t("tunnel_library_currently_editing")
                  : t("tunnel_library_edit")}
                onclick={() => onSelect(tunnel)}
              />
            </div>
          {/each}
        </div>
      {/if}
    {:else if publicLoading && publicEntries.length === 0}
      <div class="library-state" role="status">
        <PanelSpinner size={12} />
        <strong>{t("create_ui_finding_public_tunnels")}</strong>
        <p>{t("create_review_loading_the_community_s_current_published_artifacts")}</p>
      </div>
    {:else if publicError}
      <div class="library-state" role="alert">
        <i class="fas fa-cloud-arrow-down state-icon" aria-hidden="true"></i>
        <strong>{publicError}</strong>
        <PanelButton
          variant="secondary"
          onclick={retryPublicTunnels}
          ariaLabel={t("tunnel_library_retry_loading_public_tunnels")}
        >
          <i class="fas fa-arrows-rotate" aria-hidden="true"></i>
          {t("create_review_retry")}
        </PanelButton>
      </div>
    {:else if publicEntries.length === 0}
      <div class="library-state">
        <i class="fas fa-earth-americas state-icon" aria-hidden="true"></i>
        <strong>{t("create_ui_no_public_tunnels_yet")}</strong>
        <p>{t("create_ui_published_tunnel_artifacts_will_appear_here")}</p>
      </div>
    {:else if visiblePublicEntries.length === 0}
      <div class="library-state" role="status">
        <i class="fas fa-magnifying-glass state-icon" aria-hidden="true"></i>
        <strong>{t("create_ui_no_matching_public_tunnels")}</strong>
        <p>{t("create_ui_try_a_name_creator_prop_effect_or_formation")}</p>
      </div>
    {:else}
      <div class="library-grid" aria-label={t("create_ui_public_tunnels")}>
        {#each visiblePublicEntries as entry (entry.envelope.artifactId)}
          <div animate:flip={{ duration: flipDuration() }}>
            <TunnelDiscoveryCard
              name={entry.envelope.title}
              poster={entry.envelope.posterUrl ?? entry.tunnel?.poster}
              summary={entry.tunnel
                ? describeTunnelForDiscovery(entry.tunnel)
                : null}
              eyebrow={t("tunnel_library_by", { name: entry.envelope.ownerDisplayName })}
              dateLabel={dateLabel(
                t("tunnel_library_published"),
                publicTimestamp(entry.envelope.updatedAt)
              )}
              actionLabel={t("tunnel_library_view_public_tunnel")}
              onclick={() => onOpenPublic(entry.envelope)}
            />
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <footer class="library-footer">
    {#if source === "mine"}
      <div class="footer-actions">
        <PanelButton
          variant="secondary"
          onclick={onManage}
          ariaLabel={t("tunnel_library_manage_tunnels_in_browse")}
        >
          <i class="fas fa-table-cells-large" aria-hidden="true"></i>
          {t("create_review_manage_in_browse")}
        </PanelButton>
        {#if failedPosterCount > 0}
          <PanelButton
            variant="secondary"
            onclick={retryFailedPosters}
            ariaLabel={t("tunnel_library_retry_count", { count: failedPosterCount })}
          >
            <i class="fas fa-arrows-rotate" aria-hidden="true"></i>
            {t("create_review_retry_previews")}
          </PanelButton>
        {/if}
      </div>
      <p>
        {t("create_review_preview_upgrades_change_presentation_only_never_choreography_or_revisions")}
      </p>
    {:else}
      <p>
        {t("create_review_public_tunnels_open_in_browse_so_the_published_revision_and_creator_stay_explicit")}
      </p>
    {/if}
  </footer>
</section>

<style>
  .tunnel-library {
    container: tunnel-library / inline-size;
    display: grid;
    grid-template-rows: auto auto auto minmax(0, 1fr) auto;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    color: var(--theme-text);
    background: var(--theme-panel-bg);
  }

  .source-switcher {
    padding: 10px var(--settings-spacing-md, 14px) 8px;
    background: var(--theme-card-bg);
  }

  .library-toolbar,
  .library-footer {
    display: flex;
    align-items: center;
    gap: var(--settings-spacing-sm, 8px);
    padding: 8px var(--settings-spacing-md, 14px) 10px;
    border-bottom: 1px solid var(--theme-stroke);
    background: var(--theme-card-bg);
  }

  .library-toolbar :global(.panel-btn) {
    flex: 0 0 auto;
  }

  .search-field,
  .sort-field {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    padding-inline: 12px 4px;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--settings-radius-sm, 10px);
    color: var(--theme-text-dim);
    background: var(--theme-panel-bg);
  }

  .search-field {
    flex: 1 1 auto;
  }

  .sort-field {
    grid-template-columns: auto minmax(0, 1fr);
    flex: 0 1 9.5rem;
    padding-right: 8px;
  }

  .search-field:focus-within,
  .sort-field:focus-within {
    border-color: var(--theme-accent);
    box-shadow: 0 0 0 2px
      color-mix(in srgb, var(--theme-accent) 22%, transparent);
  }

  .search-field input,
  .sort-field select {
    width: 100%;
    min-width: 0;
    height: 100%;
    padding: 0 10px;
    border: 0;
    outline: 0;
    color: var(--theme-text);
    background: transparent;
    font: inherit;
    font-size: var(--font-size-min, 14px);
  }

  .sort-field select {
    padding-right: 0;
    cursor: pointer;
  }

  .sort-field select option {
    color: var(--theme-text);
    background: var(--theme-panel-bg);
  }

  .search-field input::placeholder {
    color: var(--theme-text-dim);
  }

  .clear-search {
    display: grid;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: var(--settings-radius-sm, 8px);
    color: var(--theme-text-dim);
    background: transparent;
    cursor: pointer;
  }

  .clear-search:hover {
    color: var(--theme-text);
    background: var(--theme-card-hover-bg);
  }

  .clear-search:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .library-scroll {
    min-width: 0;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .library-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .library-state {
    display: grid;
    align-content: center;
    justify-items: center;
    gap: var(--settings-spacing-sm, 8px);
    min-height: 18rem;
    padding: var(--settings-spacing-xl, 28px);
    color: var(--theme-text-dim);
    text-align: center;
  }

  .library-state strong {
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
  }

  .library-state p,
  .library-footer p {
    margin: 0;
  }

  .state-icon {
    font-size: 2rem;
    opacity: 0.75;
  }

  .library-footer {
    align-items: flex-start;
    flex-direction: column;
    border-top: 1px solid var(--theme-stroke);
    border-bottom: 0;
  }

  .library-footer p {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.35;
  }

  .footer-actions {
    display: flex;
    gap: var(--settings-spacing-sm, 8px);
    width: 100%;
  }

  .footer-actions :global(.panel-btn) {
    flex: 1 1 0;
  }

  @container tunnel-library (min-width: 46rem) {
    .library-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container tunnel-library (max-width: 32rem) {
    .new-label {
      display: none;
    }
  }

  @container tunnel-library (max-width: 25rem) {
    .library-toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .search-field {
      grid-column: 1 / -1;
    }

    .sort-field {
      width: 100%;
    }

    .footer-actions {
      flex-direction: column;
    }
  }
</style>
