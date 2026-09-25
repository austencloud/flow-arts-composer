<script lang="ts">
  import { tick } from "svelte";
  import { PUBLIC_GOOGLE_MAPS_API_KEY } from "$lib/shared/maps/google-maps-api-key";
  import {
    scanNotificationTargetState,
    takeScanNotificationTarget,
  } from "$lib/features/choreo-card/state/scan-notification-target.svelte";
  import { getScanActivityContext } from "$lib/features/choreo-card/context/scan-activity-context";
  import GlobalUserMap from "$lib/features/community/components/GlobalUserMap.svelte";
  import AdminActionButton from "$lib/shared/admin/components/AdminActionButton.svelte";
  import ExpandableSearchBar from "$lib/shared/browse/components/ExpandableSearchBar.svelte";
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import PanelGroup from "$lib/shared/panels/PanelGroup.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { growFade } from "$lib/shared/transitions/motion";
  import RecentScansList from "./RecentScansList.svelte";
  import ScanCardPeek from "./ScanCardPeek.svelte";
  import ScanCellWarmControls from "./ScanCellWarmControls.svelte";
  import type { ScanCellWarmState } from "$lib/features/choreo-card/state/scan-cell-warm-state.svelte";

  interface Props {
    cellWarmState: ScanCellWarmState;
  }

  let { cellWarmState }: Props = $props();

  const { state: scanState } = getScanActivityContext();
  const apiKey = $derived(PUBLIC_GOOGLE_MAPS_API_KEY ?? "");
  const hasApiKey = $derived(
    Boolean(apiKey) && apiKey !== "your-google-maps-api-key"
  );

  const scopeOptions: Array<{
    value: "all" | "mine";
    label: string;
  }> = [
    { value: "all", label: "All cards" },
    { value: "mine", label: "Owned cards" },
  ];

  let notificationFocus = $state<{ lat: number; lng: number } | null>(null);
  let operatorToolsOpen = $state(false);
  let workspaceWidth = $state(0);
  let panelSizes = $state<number[]>([1.8, 0.72]);

  const mapPins = $derived(
    scanState.mapPins.map((pin) => ({
      ...pin,
      selected: pin.id === scanState.selectedEventId,
    }))
  );

  const center = $derived.by(() => {
    if (notificationFocus) return notificationFocus;
    const selected = scanState.visibleEvents.find(
      (event) => event.id === scanState.selectedEventId
    );
    if (selected && selected.lat !== null && selected.lng !== null) {
      return { lat: selected.lat, lng: selected.lng };
    }
    const newest = mapPins[0];
    return newest ? { lat: newest.lat, lng: newest.lng } : null;
  });

  const connectionLabel = $derived.by(() => {
    switch (scanState.status) {
      case "connecting":
        return "Connecting";
      case "live":
        return "Live";
      case "error":
        return "Connection lost";
      default:
        return "Not connected";
    }
  });

  const compactWorkspace = $derived(
    workspaceWidth > 0 && workspaceWidth < (scanState.selectedCode ? 1180 : 720)
  );

  const filterDescription = $derived.by(() => {
    const parts: string[] = [];
    if (scanState.search.trim())
      parts.push(`search “${scanState.search.trim()}”`);
    if (scanState.cityFilter) parts.push(scanState.cityFilter);
    return parts.join(" and ");
  });

  $effect(() => {
    const target = scanNotificationTargetState.target;
    if (!target) return;
    takeScanNotificationTarget();
    scanState.selectCode(target.code);
    notificationFocus =
      target.lat !== null && target.lng !== null
        ? { lat: target.lat, lng: target.lng }
        : null;
  });

  // Active maintenance must stay visible. Once it is visible, the operator can
  // still collapse completed output without the effect immediately reopening it.
  $effect(() => {
    if (
      cellWarmState.running ||
      cellWarmState.error ||
      cellWarmState.progress
    ) {
      operatorToolsOpen = true;
    }
  });

  function selectEvent(eventId: string): void {
    notificationFocus = null;
    scanState.selectEvent(eventId);
  }

  function selectCity(city: string, eventId: string): void {
    notificationFocus = null;
    scanState.selectEvent(eventId);
    scanState.filterToCity(city);
  }

  function wordFor(code: string): string | undefined {
    return (
      scanState.codes.find((entry) => entry.code === code)?.word || undefined
    );
  }

  async function closeInspector(): Promise<void> {
    const eventId = scanState.selectedEventId;
    scanState.clearSelection();
    await tick();
    if (eventId) document.getElementById(`scan-event-${eventId}`)?.focus();
  }
</script>

<section class="shell" aria-labelledby="scan-activity-title">
  <header class="atlas-bar">
    <div class="identity">
      <div class="title-row">
        <span class="atlas-mark" aria-hidden="true">
          <i class="fas fa-location-dot"></i>
        </span>
        <h2 id="scan-activity-title">Scan Atlas</h2>
        <div
          class="connection"
          class:connecting={scanState.status === "connecting"}
          class:live={scanState.status === "live"}
          class:error={scanState.status === "error"}
          role="status"
          aria-live="polite"
        >
          <span aria-hidden="true"></span>
          {connectionLabel}
        </div>
      </div>

      <div class="summary" aria-label="Scan summary for the current view">
        <span><strong>{scanState.summary.visibleCount}</strong> scans</span>
        <span><strong>{scanState.summary.locatedCount}</strong> mapped</span>
        <span><strong>{scanState.summary.cardCount}</strong> cards</span>
        <span><strong>{scanState.summary.cityCount}</strong> cities</span>
      </div>
    </div>

    <div class="atlas-actions">
      <div class="scope-control" aria-label="Card ownership scope">
        <SegmentedControl
          options={scopeOptions}
          value={scanState.scope}
          onchange={scanState.setScope}
          color="accent"
          size="sm"
        />
      </div>

      {#if scanState.cityFilter}
        <FilterChipBase
          label="Clear {scanState.cityFilter}"
          icon="fas fa-xmark"
          mode="action"
          active
          emphasis="solid"
          onclick={scanState.clearCityFilter}
        />
      {/if}

      <ExpandableSearchBar
        value={scanState.search}
        name="scan-activity-search"
        placeholder="Search card, code, city, or country"
        onSearch={scanState.setSearch}
        onClear={() => scanState.setSearch("")}
        expansionAnchor="end"
      />

      {#if scanState.status === "error"}
        <AdminActionButton
          variant="secondary"
          icon="fa-rotate-right"
          onclick={scanState.retry}
        >
          Retry
        </AdminActionButton>
      {/if}

      <button
        class="operator-toggle"
        class:active={operatorToolsOpen}
        type="button"
        aria-label={operatorToolsOpen
          ? "Close operator tools"
          : "Open operator tools"}
        aria-expanded={operatorToolsOpen}
        aria-controls="scan-operator-tools"
        onclick={() => (operatorToolsOpen = !operatorToolsOpen)}
      >
        <i class="fas fa-sliders" aria-hidden="true"></i>
        <span>Operator tools</span>
        <i class="fas fa-chevron-down disclosure-icon" aria-hidden="true"></i>
      </button>
    </div>
  </header>

  {#if scanState.error}
    <div class="error-banner" role="alert">
      <strong>Live updates paused.</strong>
      <span>{scanState.error} Cached activity remains available.</span>
    </div>
  {/if}

  {#if scanState.detailsError}
    <div class="details-error-banner" role="alert">
      <span>Card details could not load. Scan events are still available.</span>
      <AdminActionButton
        variant="secondary"
        icon="fa-rotate-right"
        onclick={scanState.retryDetails}
      >
        Retry card details
      </AdminActionButton>
    </div>
  {/if}

  {#if operatorToolsOpen}
    <div id="scan-operator-tools" class="operator-panel" transition:growFade>
      <ScanCellWarmControls
        state={cellWarmState}
        selectedCode={scanState.selectedCode}
      />
    </div>
  {/if}

  {#snippet mapPanel()}
    <div class="map-panel">
      {#if hasApiKey}
        <GlobalUserMap
          {apiKey}
          locations={[]}
          userLocation={center}
          scanMarkers={mapPins}
          onScanMarkerClick={selectEvent}
          showEmptyState={false}
          size="full"
        />

        {#if scanState.loading}
          <div class="map-skeleton" aria-hidden="true">
            <span class="skeleton-pin pin-one"></span>
            <span class="skeleton-pin pin-two"></span>
            <span class="skeleton-pin pin-three"></span>
          </div>
        {:else if mapPins.length === 0 && scanState.status !== "error"}
          <div class="map-empty">
            <strong>No mapped scans in this view</strong>
            {#if scanState.summary.unlocatedCount > 0}
              <span>
                {scanState.summary.unlocatedCount} scan{scanState.summary
                  .unlocatedCount === 1
                  ? ""
                  : "s"} remain visible without a location.
              </span>
            {:else if filterDescription}
              <span>No scans match {filterDescription}.</span>
            {:else}
              <span>Pins appear when a card is scanned with location data.</span
              >
            {/if}
          </div>
        {/if}
      {:else}
        <div class="map-notice">
          <span class="notice-icon" aria-hidden="true">
            <i class="fas fa-map-location-dot"></i>
          </span>
          <h3>Map unavailable</h3>
          <p>
            Add <code>PUBLIC_GOOGLE_MAPS_API_KEY</code> to load scan locations. Recent
            activity remains available.
          </p>
        </div>
      {/if}
    </div>
  {/snippet}

  {#snippet activityPanel()}
    <aside
      class="activity-panel themed-scrollbar"
      aria-labelledby="recent-scans-title"
    >
      <div class="panel-heading">
        <div>
          <span class="eyebrow">Activity</span>
          <h3 id="recent-scans-title">Recent scans</h3>
        </div>
        <span class="result-count">{scanState.summary.visibleCount}</span>
      </div>
      <RecentScansList
        events={scanState.visibleEvents}
        selectedEventId={scanState.selectedEventId}
        onEventClick={selectEvent}
        onCityClick={selectCity}
        {wordFor}
        loading={scanState.loading}
        limit={100}
      />
    </aside>
  {/snippet}

  {#snippet inspectorPanel()}
    <aside
      class="inspector-panel themed-scrollbar"
      aria-label="Selected scan details"
    >
      {#if scanState.selectedCode}
        <ScanCardPeek
          code={scanState.selectedCode}
          entry={scanState.selectedCard}
          event={scanState.selectedEvent}
          relatedEvents={scanState.relatedEvents}
          onSelectEvent={selectEvent}
          onClose={closeInspector}
        />
      {/if}
    </aside>
  {/snippet}

  <div
    class="workspace"
    class:compact={compactWorkspace}
    class:has-inspector={Boolean(scanState.selectedCode)}
    bind:clientWidth={workspaceWidth}
  >
    <PanelGroup
      direction="horizontal"
      bind:sizes={panelSizes}
      gap={compactWorkspace ? 0 : 10}
      flattened={compactWorkspace}
      panels={[
        {
          id: "scan-map",
          content: mapPanel,
          defaultSize: 1.8,
          minSize: 360,
        },
        {
          id: "scan-activity",
          content: activityPanel,
          defaultSize: 0.72,
          minSize: 280,
          maxSize: scanState.selectedCode ? 420 : 520,
        },
        ...(scanState.selectedCode
          ? [
              {
                id: "scan-inspector",
                content: inspectorPanel,
                defaultSize: 0.82,
                minSize: 340,
                maxSize: 520,
                resizable: false,
              },
            ]
          : []),
      ]}
    />
  </div>
</section>

<style>
  .shell {
    container: scan-atlas / inline-size;
    display: flex;
    flex: 1;
    flex-direction: column;
    width: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--border-radius-lg, 12px);
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
  }

  .atlas-bar {
    position: relative;
    z-index: 4;
    display: flex;
    align-items: center;
    gap: var(--spacing-md, 16px);
    min-height: 70px;
    padding: 10px var(--spacing-md, 16px);
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
  }

  .identity {
    display: grid;
    flex: 1 1 auto;
    gap: 5px;
    min-width: 240px;
  }

  .title-row,
  .connection,
  .summary,
  .atlas-actions,
  .operator-toggle,
  .panel-heading,
  .error-banner,
  .details-error-banner {
    display: flex;
    align-items: center;
  }

  .title-row {
    gap: 8px;
  }

  .atlas-mark,
  .notice-icon {
    display: grid;
    place-items: center;
    color: var(--theme-accent, #34d399);
  }

  .atlas-mark {
    width: 28px;
    height: 28px;
    border: 1px solid color-mix(in srgb, var(--theme-accent) 30%, transparent);
    border-radius: var(--border-radius-md, 8px);
    background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
    font-size: var(--font-size-sm, 14px);
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  h2 {
    color: var(--theme-text, #fff);
    font-size: var(--font-size-lg, 18px);
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  .connection {
    gap: 6px;
    min-width: 6.5rem;
    color: var(--theme-text-dim, #8b93a7);
    font-size: var(--font-size-compact, 12px);
    font-weight: 650;
  }

  .connection > span {
    width: 8px;
    height: 8px;
    flex: 0 0 8px;
    border-radius: 50%;
    background: var(--theme-text-dim, #8b93a7);
  }

  .connection.connecting > span {
    background: var(--semantic-warning, #f59e0b);
    animation: status-pulse 1.2s infinite;
  }

  .connection.live > span {
    background: var(--semantic-success, #10b981);
    box-shadow: 0 0 8px
      color-mix(in srgb, var(--semantic-success) 65%, transparent);
  }

  .connection.error > span {
    background: var(--semantic-error, #ef4444);
  }

  .summary {
    flex-wrap: wrap;
    gap: 4px 12px;
    color: var(--theme-text-dim, #8b93a7);
    font-size: var(--font-size-compact, 12px);
    font-variant-numeric: tabular-nums;
  }

  .summary span {
    white-space: nowrap;
  }

  .summary strong {
    color: var(--theme-text, #fff);
    font-weight: 700;
  }

  .atlas-actions {
    justify-content: flex-end;
    gap: var(--spacing-sm, 8px);
    min-width: 0;
  }

  .scope-control {
    width: 244px;
    min-width: 220px;
  }

  .operator-toggle {
    justify-content: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
    padding: 8px 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--border-radius-md, 8px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim, #8b93a7);
    font: inherit;
    font-size: var(--font-size-sm, 14px);
    font-weight: 650;
    cursor: pointer;
    transition:
      border-color var(--transition-fast),
      background var(--transition-fast),
      color var(--transition-fast);
  }

  .operator-toggle:hover,
  .operator-toggle.active {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, #fff);
  }

  .operator-toggle:focus-visible {
    outline: 2px solid var(--theme-accent, #34d399);
    outline-offset: 2px;
  }

  .disclosure-icon {
    font-size: var(--font-size-compact, 12px);
    transition: transform var(--transition-fast);
  }

  .operator-toggle.active .disclosure-icon {
    transform: rotate(180deg);
  }

  .error-banner,
  .details-error-banner {
    justify-content: space-between;
    gap: var(--spacing-md, 16px);
    padding: 9px var(--spacing-md, 16px);
    border-bottom: 1px solid
      color-mix(in srgb, var(--semantic-error) 30%, transparent);
    background: color-mix(in srgb, var(--semantic-error) 9%, transparent);
    color: var(--semantic-error, #ef4444);
    font-size: var(--font-size-sm, 14px);
  }

  .error-banner span {
    flex: 1;
    color: var(--theme-text-dim, #8b93a7);
  }

  .operator-panel {
    position: relative;
    z-index: 3;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
  }

  .workspace {
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
    padding: 10px;
    background: color-mix(in srgb, var(--theme-panel-bg, #12121c) 94%, black);
  }

  .workspace.compact {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    gap: 10px;
    overflow-y: auto;
  }

  .map-panel,
  .activity-panel,
  .inspector-panel {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--border-radius-lg, 12px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .map-panel {
    position: relative;
  }

  .activity-panel,
  .inspector-panel {
    overflow-y: auto;
  }

  .activity-panel {
    padding: 10px;
  }

  .inspector-panel {
    container-type: inline-size;
  }

  .panel-heading {
    position: sticky;
    z-index: 2;
    top: -10px;
    justify-content: space-between;
    gap: var(--spacing-sm, 8px);
    min-height: 52px;
    margin: -10px -10px 6px;
    padding: 10px 12px 8px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(18, 18, 28, 0.98));
  }

  .panel-heading > div {
    display: grid;
    gap: 1px;
  }

  .eyebrow {
    color: var(--theme-accent, #34d399);
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .panel-heading h3,
  .map-notice h3 {
    color: var(--theme-text, #fff);
    font-size: var(--font-size-sm, 14px);
    font-weight: 700;
  }

  .result-count {
    display: grid;
    min-width: 28px;
    height: 28px;
    place-items: center;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 999px;
    color: var(--theme-text-dim, #8b93a7);
    font-size: var(--font-size-compact, 12px);
    font-variant-numeric: tabular-nums;
  }

  .map-skeleton {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      110deg,
      var(--theme-card-bg) 15%,
      var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08)) 35%,
      var(--theme-card-bg) 55%
    );
    background-size: 250% 100%;
    animation: map-shimmer 1.8s infinite;
    pointer-events: none;
  }

  .skeleton-pin {
    position: absolute;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--theme-accent) 55%, transparent);
  }

  .pin-one {
    top: 30%;
    left: 24%;
  }

  .pin-two {
    top: 48%;
    left: 64%;
  }

  .pin-three {
    top: 68%;
    left: 42%;
  }

  .map-empty {
    position: absolute;
    inset: auto 12px 12px;
    display: grid;
    gap: 3px;
    max-width: 32rem;
    padding: 12px 14px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--border-radius-md, 8px);
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    box-shadow: var(--shadow-md, 0 8px 24px rgba(0, 0, 0, 0.2));
    color: var(--theme-text, #fff);
    pointer-events: none;
  }

  .map-empty strong {
    font-size: var(--font-size-sm, 14px);
  }

  .map-empty span,
  .map-notice p {
    color: var(--theme-text-dim, #8b93a7);
    font-size: var(--font-size-sm, 14px);
  }

  .map-notice {
    display: flex;
    height: 100%;
    min-height: 220px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm, 8px);
    padding: 24px;
    text-align: center;
  }

  .notice-icon {
    width: 48px;
    height: 48px;
    border: 1px solid color-mix(in srgb, var(--theme-accent) 30%, transparent);
    border-radius: 50%;
    background: color-mix(in srgb, var(--theme-accent) 10%, transparent);
    font-size: 20px;
  }

  .map-notice code {
    color: var(--theme-text, #fff);
    font-family: monospace;
  }

  .workspace.compact .map-panel {
    min-height: clamp(220px, 38vh, 320px);
  }

  .workspace.compact .activity-panel {
    max-height: min(52vh, 480px);
  }

  .workspace.compact .inspector-panel {
    max-height: none;
    overflow: visible;
  }

  @keyframes status-pulse {
    50% {
      opacity: 0.35;
    }
  }

  @keyframes map-shimmer {
    from {
      background-position: 200% 0;
    }
    to {
      background-position: -100% 0;
    }
  }

  @container scan-atlas (max-width: 1040px) {
    .atlas-bar {
      align-items: stretch;
      flex-wrap: wrap;
    }

    .identity {
      min-width: 0;
    }

    .atlas-actions {
      flex: 1 1 100%;
    }

    .scope-control {
      margin-right: auto;
    }
  }

  @container scan-atlas (max-width: 720px) {
    .atlas-bar {
      gap: var(--spacing-sm, 8px);
      padding: 8px 10px;
    }

    .identity,
    .atlas-actions {
      flex: 1 1 100%;
    }

    .atlas-actions {
      justify-content: flex-start;
      flex-wrap: wrap;
    }

    .scope-control {
      width: min(100%, 260px);
      min-width: 200px;
    }

    .operator-toggle {
      margin-left: auto;
    }

    .workspace {
      padding: 8px;
    }

    .error-banner,
    .details-error-banner {
      align-items: stretch;
      flex-direction: column;
      gap: 4px;
    }
  }

  @container scan-atlas (max-width: 430px) {
    .connection {
      min-width: 0;
    }

    .summary {
      gap: 4px 10px;
    }

    .scope-control {
      order: 1;
      width: 100%;
    }

    .operator-toggle {
      order: 2;
      flex: 1;
      margin-left: 0;
    }

    .atlas-actions :global(.search-container) {
      order: 3;
    }

    .workspace.compact .activity-panel {
      max-height: 440px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .connection.connecting > span,
    .map-skeleton {
      animation: none;
    }

    .operator-toggle,
    .disclosure-icon {
      transition: none;
    }
  }
</style>
