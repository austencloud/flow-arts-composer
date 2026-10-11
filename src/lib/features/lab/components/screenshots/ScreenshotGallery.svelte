<!--
  ScreenshotGallery - Orchestrator for the module-organized gallery.

  Subscribes to Firestore via ScreenshotLoader for real-time updates.
  Delegates state management to:
  - gallery-tag-filter-state (tag filtering, sidebar, long-press)
  - gallery-selection-state (batch selection, bulk tagging)
  - gallery-capture-state (capture + upload pipeline)
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { DeviceCategory } from "../../services/types";
  import type { ScreenshotMetadata } from "../../services/types";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import type { ScreenshotTagController } from "../../services/screenshot-tag-controller";
  import type { GalleryItem } from "../../services/types";
  import { getScreenshotOrchestrator } from "../../get-screenshot-orchestrator";
  import { getScreenshotUploadOrchestrator } from "../../get-screenshot-upload-orchestrator";
  import { getScreenshotTagController } from "../../get-screenshot-tag-controller";
  import { getScreenshotLoader } from "../../get-screenshot-loader";
  import { toMediaItems } from "../../services/gallery-item-adapter";
  import { onMount } from "svelte";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import {
    MediaSpotlight,
    type MediaItem as SpotlightMediaItem,
    type SpotlightConfig,
  } from "@austencloud/media-spotlight";
  import {
    TagCreatorModal,
    TagPickerPanel,
  } from "@austencloud/media-tagging-ui";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import GalleryGrid from "./GalleryGrid.svelte";
  import CaptureProgress from "./CaptureProgress.svelte";
  import UploadProgressCard from "./UploadProgress.svelte";
  import SelectionToolbar from "#lib/shared/components/selection/SelectionToolbar.svelte";
  import TagSidebar from "./TagSidebar.svelte";
  import TagContextPanel from "./TagContextPanel.svelte";
  import { createGalleryTagFilterState } from "./state/gallery-tag-filter-state.svelte";
  import { createGallerySelectionState } from "./state/gallery-selection-state.svelte";
  import { createGalleryCaptureState } from "./state/gallery-capture-state.svelte";

  let hapticService: HapticFeedback | null = $state(null);
  let tagController: ScreenshotTagController | null = $state(null);


  const tagFilter = createGalleryTagFilterState({
    getHapticService: () => hapticService,
    getTagController: () => tagController,
  });

  const selection = createGallerySelectionState({
    getHapticService: () => hapticService,
    getTagController: () => tagController,
    getFlatItems: () => flatItems,
  });

  const capture = createGalleryCaptureState({
    getOrchestrator: () => getScreenshotOrchestrator(),
    getUploadOrchestrator: () => getScreenshotUploadOrchestrator(),
  });

  onMount(() => {
    hapticService = getHapticFeedback();
    tagController = getScreenshotTagController();
  });

  // ─── Auth-gated Firestore subscription ──────────────────────────────────────

  let screenshots = $state<ScreenshotMetadata[]>([]);
  let isLoading = $state(true);
  let errorMessage = $state<string | null>(null);
  let screenshotUnsubscribe: (() => void) | null = null;

  $effect(() => {
    const user = authState.user;
    const initialized = authState.initialized;

    if (!initialized || !user) {
      screenshotUnsubscribe?.();
      screenshotUnsubscribe = null;
      tagFilter.unsubscribeTags();
      screenshots = [];
      isLoading = !initialized;
      return;
    }

    loadScreenshots();
    tagFilter.loadTags();

    // Tear down the Firestore subscription when the effect re-runs or the
    // component is destroyed, so the listener doesn't leak past unmount.
    return () => {
      screenshotUnsubscribe?.();
      screenshotUnsubscribe = null;
      tagFilter.unsubscribeTags();
    };
  });

  function loadScreenshots() {
    screenshotUnsubscribe?.();
    screenshotUnsubscribe = null;
    isLoading = true;
    errorMessage = null;

    try {
      const loader = getScreenshotLoader();
      screenshotUnsubscribe = loader.subscribeToScreenshots(
        (data: ScreenshotMetadata[]) => {
          screenshots = data;
          isLoading = false;
        },
        (err: Error) => {
          errorMessage = err.message;
          isLoading = false;
        }
      );
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      isLoading = false;
    }
  }


  type FilterCategory = "all" | DeviceCategory;

  const SIZE_PRESETS = [
    { label: "S", value: 200 },
    { label: "M", value: 340 },
    { label: "L", value: 520 },
  ] as const;

  let activeFilter = $state<FilterCategory>("all");
  let columnMin = $state(280);
  let collapsedModules = $state<Record<string, boolean>>({});
  let spotlightOpen = $state(false);
  let spotlightIndex = $state(0);
  let galleryElement = $state<HTMLDivElement | null>(null);

  const activePreset = $derived.by(() => {
    for (const preset of SIZE_PRESETS) {
      if (Math.abs(columnMin - preset.value) <= 30) return preset.label;
    }
    return null;
  });

  // SegmentedControl options for the size selector. `value` is the preset label;
  // when columnMin is custom (no preset within range) activePreset is null, so
  // no segment shows selected and the indicator slides off — the intended
  // "none active" state for a fine-tuned size.
  const SIZE_OPTIONS = SIZE_PRESETS.map((p) => ({
    value: p.label,
    label: p.label,
  }));
  const sizeValue = $derived(activePreset ?? "");

  function setPresetByLabel(label: string) {
    const preset = SIZE_PRESETS.find((p) => p.label === label);
    if (preset) setPreset(preset.value);
  }

  function toGalleryItem(s: ScreenshotMetadata): GalleryItem {
    return {
      id: s.id,
      filename: s.filename,
      routeLabel: s.routeLabel,
      module: s.module,
      deviceSlug: s.deviceSlug,
      deviceCategory: s.deviceCategory,
      deviceName: s.deviceName,
      width: s.width,
      height: s.height,
      imageUrl: s.downloadUrl,
      tagIds: s.tagIds,
      capturedAt: s.capturedAt,
    };
  }

  const galleryItems = $derived(screenshots.map(toGalleryItem));
  const hasItems = $derived(galleryItems.length > 0);

  const moduleGroups = $derived.by(() => {
    const groups = new Map<string, Map<string, GalleryItem[]>>();
    for (const item of galleryItems) {
      if (!groups.has(item.module)) groups.set(item.module, new Map());
      const routeMap = groups.get(item.module)!;
      if (!routeMap.has(item.routeLabel)) routeMap.set(item.routeLabel, []);
      routeMap.get(item.routeLabel)!.push(item);
    }
    return groups;
  });

  const filteredModuleGroups = $derived.by(() => {
    if (activeFilter === "all") return moduleGroups;

    const filtered = new Map<string, Map<string, GalleryItem[]>>();
    for (const [moduleId, routeMap] of moduleGroups) {
      const filteredRoutes = new Map<string, GalleryItem[]>();
      for (const [route, items] of routeMap) {
        const matching = items.filter((c) => c.deviceCategory === activeFilter);
        if (matching.length > 0) filteredRoutes.set(route, matching);
      }
      if (filteredRoutes.size > 0) filtered.set(moduleId, filteredRoutes);
    }
    return filtered;
  });

  const tagFilteredModuleGroups = $derived.by(() => {
    const filtered = new Map<string, Map<string, GalleryItem[]>>();
    for (const [moduleId, routeMap] of filteredModuleGroups) {
      const filteredRoutes = new Map<string, GalleryItem[]>();
      for (const [route, items] of routeMap) {
        const matching = tagFilter.applyTagFilter(items);
        if (matching.length > 0) filteredRoutes.set(route, matching);
      }
      if (filteredRoutes.size > 0) filtered.set(moduleId, filteredRoutes);
    }
    return filtered;
  });

  const flatItems = $derived.by(() => {
    const result: GalleryItem[] = [];
    for (const [, routeMap] of tagFilteredModuleGroups) {
      for (const [, items] of routeMap) {
        result.push(...items);
      }
    }
    return result;
  });

  const mediaItems = $derived(toMediaItems(galleryItems));
  const filteredMediaItems = $derived(toMediaItems(flatItems));

  const selectedMediaItems = $derived(
    toMediaItems(flatItems.filter((item) => selection.selectedIds.has(item.id)))
  );

  const spotlightItems: SpotlightMediaItem[] = $derived(
    flatItems.map((item) => ({
      id: item.id,
      url: item.imageUrl,
      type: "image" as const,
      alt: `${formatRouteLabel(item.routeLabel)} on ${item.deviceName}`,
      name: `${item.deviceName} - ${formatRouteLabel(item.routeLabel)}`,
      width: item.width || undefined,
      height: item.height || undefined,
    }))
  );

  const spotlightConfig: SpotlightConfig = {
    showFilmstrip: true,
    showArrows: true,
    showClose: true,
    enableSwipeNav: true,
    enableSwipeDismiss: true,
    enablePinchZoom: true,
    enableDoubleTapZoom: true,
    loop: false,
  };

  const stats = $derived({
    totalScreenshots: galleryItems.length,
    routeCount: new Set(galleryItems.map((c) => c.routeLabel)).size,
    deviceCount: new Set(galleryItems.map((c) => c.deviceSlug)).size,
  });

  const FILTERS: { value: FilterCategory; label: string }[] = [
    { value: "all", label: "All" },
    { value: "phone", label: "Phone" },
    { value: "tablet", label: "Tablet" },
    { value: "desktop", label: "Desktop" },
  ];

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function formatRouteLabel(label: string): string {
    return label
      .replace(/--/g, " / ")
      .replace(/(^|\s)\w/g, (c) => c.toUpperCase());
  }

  // Svelte action: move focus to the dialog when it mounts so keyboard users
  // land inside the modal and the Escape handler is live immediately.
  function focusOnMount(node: HTMLElement) {
    node.focus();
  }

  function openSpotlight(item: GalleryItem) {
    const idx = flatItems.findIndex((c) => c.id === item.id);
    spotlightIndex = idx >= 0 ? idx : 0;
    spotlightOpen = true;
  }

  function handleWheel(e: WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 20 : -20;
    columnMin = Math.max(180, Math.min(600, columnMin + delta));
  }

  function setPreset(value: number) {
    hapticService?.trigger("selection");
    columnMin = value;
  }

  function toggleModuleCollapse(moduleId: string) {
    collapsedModules = {
      ...collapsedModules,
      [moduleId]: !collapsedModules[moduleId],
    };
  }

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────

  function handleGlobalKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "t") {
      e.preventDefault();
      tagFilter.toggleSidebar();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "a" && selection.selectionMode) {
      e.preventDefault();
      selection.selectAll();
      return;
    }

    if (e.key === "Escape") {
      if (tagFilter.showTagPicker) {
        tagFilter.closeTagPicker();
      } else if (selection.selectionMode) {
        selection.exitSelectionMode();
      }
    }
  }

  // ─── Lifecycle cleanup ──────────────────────────────────────────────────────

  $effect(() => {
    return () => {
      tagFilter.cancelLongPress();
    };
  });
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="gallery-layout"
  class:sidebar-open={tagFilter.sidebarOpen}
  bind:this={galleryElement}
  onwheel={handleWheel}
>
  <!-- Main gallery content -->
  <div class="gallery-main">
    <!-- Header -->
    <header class="gallery-header">
      <div class="header-left">
        <h3>Gallery</h3>
        {#if !isLoading && hasItems}
          <span class="stats">
            {stats.totalScreenshots} screenshots, {stats.routeCount} routes, {stats.deviceCount}
            devices
          </span>
        {/if}
      </div>

      <div class="header-right">
        <!-- Capture button -->
        <button
          class="header-btn capture-btn"
          onclick={capture.startCapture}
          disabled={capture.capturePhase !== "idle"}
          title="Capture screenshots and upload to cloud"
        >
          <i class="fas fa-camera"></i>
          Capture
        </button>

        <!-- Selection mode toggle -->
        {#if hasItems && !isLoading}
          <button
            class="header-btn"
            class:active={selection.selectionMode}
            onclick={selection.selectionMode
              ? selection.exitSelectionMode
              : selection.enterSelectionMode}
          >
            <i class="fas fa-check-square"></i>
            {selection.selectionMode ? "Exit Select" : "Select"}
          </button>
        {/if}

        <!-- Sidebar toggle -->
        <button
          class="header-btn"
          class:active={tagFilter.sidebarOpen}
          onclick={tagFilter.toggleSidebar}
          title="Toggle tag sidebar (Ctrl+T)"
        >
          <i class="fas fa-tags"></i>
          Tags
        </button>
      </div>
    </header>

    <!-- Selection Toolbar -->
    {#if selection.selectionMode}
      <SelectionToolbar
        selectedCount={selection.selectedIds.size}
        totalCount={flatItems.length}
        primaryLabel="Tag"
        primaryIcon="fa-tags"
        onPrimaryAction={tagFilter.openTagPicker}
        onSelectAll={selection.selectAll}
        onClearSelection={selection.clearSelection}
        onExitSelection={selection.exitSelectionMode}
      />
    {/if}

    <!-- Capture / Upload Progress -->
    {#if capture.capturePhase === "capturing"}
      <CaptureProgress
        jobId={capture.captureJobId}
        orchestrator={getScreenshotOrchestrator()}
        onPollStatus={capture.handleCaptureStatusUpdate}
        onComplete={capture.handleCaptureComplete}
      />
    {:else if capture.capturePhase === "uploading" && capture.uploadProgress}
      <UploadProgressCard
        progress={capture.uploadProgress}
        onRetry={capture.uploadProgress.phase === "failed"
          ? capture.retryUpload
          : undefined}
      />
    {/if}

    <!-- Controls -->
    {#if !isLoading && hasItems}
      <div class="controls">
        <div class="filter-segment" aria-label="Filter by device category">
          <SegmentedControl
            options={FILTERS}
            value={activeFilter}
            onchange={(value) => {
              hapticService?.trigger("selection");
              activeFilter = value;
            }}
            color="accent"
            size="sm"
          />
        </div>

        <div class="size-presets">
          <div class="size-segment" aria-label="Card size preset">
            <SegmentedControl
              options={SIZE_OPTIONS}
              value={sizeValue}
              onchange={setPresetByLabel}
              color="accent"
              size="sm"
            />
          </div>
          <span class="size-hint" title="Ctrl+Scroll to fine-tune">
            {columnMin}px
          </span>
        </div>
      </div>
    {/if}

    <!-- Content -->
    {#if isLoading}
      <div class="state-message">
        <i class="fas fa-circle-notch fa-spin"></i>
        <span>Loading screenshots...</span>
      </div>
    {:else if errorMessage}
      <div class="state-message error">
        <i class="fas fa-exclamation-triangle"></i>
        <span>Failed to load screenshots: {errorMessage}</span>
      </div>
    {:else if !hasItems}
      <div class="state-message empty">
        <i class="fas fa-camera"></i>
        <h4>No screenshots in cloud storage</h4>
        <p>
          Run the migration script or capture new screenshots to populate cloud
          storage.
        </p>
      </div>
    {:else if tagFilteredModuleGroups.size === 0}
      <div class="state-message empty">
        <i class="fas fa-filter"></i>
        <h4>No matches</h4>
        <p>No screenshots match the current tag filters.</p>
        <button class="clear-filters-btn" onclick={tagFilter.clearTags}>
          Clear filters
        </button>
      </div>
    {:else}
      <GalleryGrid
        moduleGroups={tagFilteredModuleGroups}
        {collapsedModules}
        {columnMin}
        allTags={tagFilter.allTags}
        selectionMode={selection.selectionMode}
        selectedIds={selection.selectedIds}
        onOpenSpotlight={openSpotlight}
        onOpenTagPanel={tagFilter.openTagPanel}
        onToggleModuleCollapse={toggleModuleCollapse}
        onToggleSelection={selection.toggleSelection}
        onStartLongPress={tagFilter.startLongPress}
        onCancelLongPress={tagFilter.cancelLongPress}
      />
    {/if}
  </div>

  <!-- Tag Sidebar -->
  <TagSidebar
    open={tagFilter.sidebarOpen}
    tags={tagFilter.allTags}
    {mediaItems}
    {filteredMediaItems}
    activeTagIds={tagFilter.activeTagIds}
    excludeTagIds={tagFilter.excludeTagIds}
    tagMode={tagFilter.tagMode}
    untaggedOnly={tagFilter.untaggedOnly}
    onToggle={tagFilter.toggleSidebar}
    onToggleTag={tagFilter.toggleTag}
    onExcludeTag={tagFilter.excludeTag}
    onSetTagMode={tagFilter.setTagMode}
    onSetUntaggedOnly={tagFilter.setUntaggedOnly}
    onClearTags={tagFilter.clearTags}
    onCreateTag={() => {
      tagFilter.showTagCreator = true;
    }}
  />
</div>

<!-- Tag context panel (right-click on card) -->
{#if tagFilter.tagPanelTarget}
  <TagContextPanel
    target={tagFilter.tagPanelTarget}
    allTags={tagFilter.allTags}
    position={tagFilter.tagPanelPosition}
    onToggleTag={tagFilter.toggleTagOnScreenshot}
    onCreateTag={() => {
      tagFilter.showTagCreator = true;
    }}
    onClose={tagFilter.closeTagPanel}
  />
{/if}

<!-- Tag Picker Panel (batch tagging modal) -->
{#if tagFilter.showTagPicker}
  <!-- Backdrop: click-to-close is a deliberate modal-dismiss affordance; the
       keyboard path (Escape) lives on the focused dialog below, not here. -->
  <!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
  <div
    class="tag-picker-backdrop"
    role="presentation"
    onclick={tagFilter.closeTagPicker}
  >
    <div
      class="tag-picker-container"
      role="dialog"
      aria-modal="true"
      aria-label="Apply tags to selected screenshots"
      tabindex="-1"
      use:focusOnMount
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => {
        if (e.key === "Escape") tagFilter.closeTagPicker();
      }}
    >
      <TagPickerPanel
        allTags={tagFilter.allTags}
        selectedItems={selectedMediaItems}
        onApplyTag={selection.bulkApplyTag}
        onRemoveTag={selection.bulkRemoveTag}
        onClose={tagFilter.closeTagPicker}
      />
    </div>
  </div>
{/if}

<!-- Tag creator modal -->
{#if tagFilter.showTagCreator}
  <TagCreatorModal
    tags={tagFilter.allTags}
    categoryLabels={{}}
    onCreate={tagFilter.createTag}
    onClose={() => {
      tagFilter.showTagCreator = false;
    }}
  />
{/if}

<!-- MediaSpotlight Viewer -->
<MediaSpotlight
  items={spotlightItems}
  bind:currentIndex={spotlightIndex}
  bind:open={spotlightOpen}
  config={spotlightConfig}
  callbacks={{
    onclose: () => {
      spotlightOpen = false;
    },
  }}
/>

<style>
  /* Layout: gallery + sidebar */
  .gallery-layout {
    display: grid;
    grid-template-columns: 1fr 0px;
    width: 100%;
    height: 100%;
    overflow: hidden;
    transition: grid-template-columns 300ms var(--ease-out, ease-out);
  }

  .gallery-layout.sidebar-open {
    grid-template-columns: 1fr 280px;
  }

  .gallery-main {
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
    padding: 16px;
  }

  /* Header */
  .gallery-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 8px;
  }

  .header-left {
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .gallery-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--theme-text, #fff);
  }

  .stats {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  /* Header buttons */
  .header-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    min-height: 32px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    font-family: inherit;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) var(--ease-out, ease-out);
  }

  .header-btn i {
    font-size: 10px;
  }

  .header-btn:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text, #fff);
    background: rgba(255, 255, 255, 0.06);
  }

  .header-btn.active {
    background: color-mix(
      in srgb,
      var(--theme-accent, #3b82f6) 20%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #3b82f6) 40%,
      transparent
    );
    color: var(--theme-text, #fff);
  }

  .header-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #3b82f6);
    outline-offset: 2px;
  }

  .capture-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Controls */
  .controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
  }

  /* Segmented filter sizes to its content rather than stretching full-width */
  .filter-segment {
    width: auto;
  }

  .filter-segment :global(.segmented-control) {
    width: auto;
  }

  /* Size presets */
  .size-presets {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .size-segment {
    width: auto;
    min-width: 132px;
  }

  .size-segment :global(.segmented-control) {
    width: auto;
  }

  .size-hint {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.3));
    margin-left: 4px;
    font-variant-numeric: tabular-nums;
    cursor: help;
  }

  /* State messages */
  .state-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 200px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-min, 14px);
  }

  .state-message i {
    font-size: 28px;
  }

  .state-message.error {
    color: var(--semantic-error, #ef4444);
  }

  .state-message.empty h4 {
    margin: 0;
    font-size: 14px;
    color: var(--theme-text, #fff);
  }

  .state-message.empty p {
    margin: 0;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
  }

  .clear-filters-btn {
    padding: 8px 16px;
    border-radius: 8px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #fff);
    font-size: var(--font-size-compact, 12px);
    font-family: inherit;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) var(--ease-out, ease-out);
  }

  .clear-filters-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
  }

  /* Tag Picker Modal */
  .tag-picker-backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .tag-picker-container {
    width: 100%;
    max-width: 600px;
  }

  /* Mobile adjustments */
  @media (max-width: 768px) {
    .gallery-layout,
    .gallery-layout.sidebar-open {
      grid-template-columns: 1fr;
    }

    .gallery-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .header-right {
      width: 100%;
      justify-content: flex-start;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .gallery-layout {
      transition: none;
    }
    .header-btn,
    .clear-filters-btn {
      transition: none;
    }
  }
</style>
