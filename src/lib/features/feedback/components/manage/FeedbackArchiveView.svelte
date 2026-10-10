<!-- FeedbackArchiveView - Archived feedback organized by version -->
<script lang="ts">
  import type { VersionState } from "#lib/shared/feedback/state/version-state.svelte.js";
  import type { FeedbackItem } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import { getFeedback } from "#lib/shared/feedback/services/feedback-querier.js";
  import { loadAllArchived } from "../../services/archive-loader";
  import type { AppVersion } from "#lib/shared/feedback/domain/models/version-models.js";
  import Drawer from "#lib/shared/foundation/ui/Drawer.svelte";
  import FeedbackDetailPanel from "./FeedbackDetailPanel.svelte";
  import VersionDetailContent from "#lib/shared/settings/components/tabs/release-notes/VersionDetailContent.svelte";

  // Extracted components
  import ArchiveViewToggle from "./archive/ArchiveViewToggle.svelte";
  import ArchiveSortControls from "./archive/ArchiveSortControls.svelte";
  import ArchiveEmptyState from "./archive/ArchiveEmptyState.svelte";
  import ArchiveLoadingState from "./archive/ArchiveLoadingState.svelte";
  import ArchivedItemCard from "./archive/ArchivedItemCard.svelte";
  import VersionGroup from "./archive/VersionGroup.svelte";

  const { versionState, onBack } = $props<{
    versionState: VersionState;
    onBack: () => void;
  }>();

  // View mode state
  let viewMode = $state<"releases" | "all">("releases");

  // All archived items (for "all" view)
  let allArchivedItems = $state<FeedbackItem[]>([]);
  let isLoadingAll = $state(false);
  let sortBy = $state<"date" | "type" | "title">("date");
  let sortOrder = $state<"asc" | "desc">("desc");

  // Version expansion state
  let expandedVersion = $state<string | null>(null);

  // Detail panel state
  let selectedItem = $state<FeedbackItem | null>(null);
  let isDetailOpen = $state(false);
  let isLoadingItem = $state(false);

  // Version detail drawer state (for editing changelog/contributors)
  let selectedVersion = $state<AppVersion | null>(null);
  let isVersionDetailOpen = $state(false);

  // Responsive state
  let isMobile = $state(false);

  // Load versions on mount
  $effect(() => {
    versionState.loadVersions();
  });

  // Load all archived items when switching to "all" view
  $effect(() => {
    if (viewMode === "all" && allArchivedItems.length === 0) {
      loadAllArchivedItems();
    }
  });

  // Mobile detection
  $effect(() => {
    const checkMobile = () => {
      isMobile = window.innerWidth < 768;
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  });

  async function loadAllArchivedItems() {
    isLoadingAll = true;
    allArchivedItems = await loadAllArchived();
    isLoadingAll = false;
  }

  function toggleVersion(version: string) {
    if (expandedVersion === version) {
      expandedVersion = null;
    } else {
      expandedVersion = version;
      versionState.loadVersionFeedback(version);
    }
  }

  async function openFeedbackDetail(feedbackId: string) {
    isLoadingItem = true;
    isDetailOpen = true;

    try {
      const item = await getFeedback(feedbackId);
      selectedItem = item;
    } catch (e) {
      console.error("Failed to load feedback item:", e);
      selectedItem = null;
    } finally {
      isLoadingItem = false;
    }
  }

  function closeDetail() {
    isDetailOpen = false;
    selectedItem = null;
  }

  function openVersionDetail(version: AppVersion) {
    selectedVersion = version;
    isVersionDetailOpen = true;
  }

  function closeVersionDetail() {
    isVersionDetailOpen = false;
    selectedVersion = null;
  }

  function handleVersionUpdated() {
    versionState.loadVersions();
  }

  // Sorted archived items
  const sortedArchivedItems = $derived.by(() => {
    const items = [...allArchivedItems];

    items.sort((a, b) => {
      let comparison = 0;

      if (sortBy === "date") {
        const aTime = a.archivedAt?.getTime() || a.createdAt?.getTime() || 0;
        const bTime = b.archivedAt?.getTime() || b.createdAt?.getTime() || 0;
        comparison = bTime - aTime;
      } else if (sortBy === "type") {
        comparison = a.type.localeCompare(b.type);
      } else if (sortBy === "title") {
        comparison = a.title.localeCompare(b.title);
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    return items;
  });
</script>

<div class="archive-view">
  <header class="archive-header">
    <div class="header-top">
      <button type="button" class="back-btn" onclick={onBack}>
        <i class="fas fa-arrow-left" aria-hidden="true"></i>
        <span>Back to Kanban</span>
      </button>

      <ArchiveViewToggle
        {viewMode}
        onViewModeChange={(mode) => (viewMode = mode)}
      />
    </div>

    <div class="header-content">
      <h2>
        <i class="fas fa-archive" aria-hidden="true"></i>
        {viewMode === "releases" ? "Release Archive" : "All Archived Feedback"}
      </h2>
      <p class="subtitle">
        {viewMode === "releases"
          ? "Feedback resolved in past releases"
          : `${allArchivedItems.length} archived items`}
      </p>
    </div>

    {#if viewMode === "all"}
      <ArchiveSortControls bind:sortBy bind:sortOrder />
    {/if}
  </header>

  <div class="archive-content">
    {#if viewMode === "all"}
      {#if isLoadingAll}
        <ArchiveLoadingState />
      {:else if sortedArchivedItems.length === 0}
        <ArchiveEmptyState
          title="No Archived Items"
          message="Archived feedback will appear here."
        />
      {:else}
        <div class="all-items-list">
          {#each sortedArchivedItems as item (item.id)}
            <ArchivedItemCard
              {item}
              onclick={() => openFeedbackDetail(item.id)}
            />
          {/each}
        </div>
      {/if}
    {:else if versionState.isLoading && versionState.versions.length === 0}
      <ArchiveLoadingState />
    {:else if versionState.versions.length === 0}
      <ArchiveEmptyState
        title="No Releases Yet"
        message="Completed feedback will appear here after preparing a release."
      />
    {:else}
      <div class="versions-list">
        {#each versionState.versions as version (version.version)}
          <VersionGroup
            {version}
            isExpanded={expandedVersion === version.version}
            isLoading={versionState.isLoading}
            feedbackItems={expandedVersion === version.version
              ? versionState.selectedVersionFeedback
              : []}
            onToggle={() => toggleVersion(version.version)}
            onItemClick={openFeedbackDetail}
            onEditRelease={() => openVersionDetail(version)}
          />
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- Feedback Detail Drawer -->
<Drawer
  bind:isOpen={isDetailOpen}
  placement={isMobile ? "bottom" : "right"}
  onclose={closeDetail}
>
  {#if isLoadingItem}
    <div class="detail-loading">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <span>Loading feedback...</span>
    </div>
  {:else if selectedItem}
    <FeedbackDetailPanel
      item={selectedItem}
      manageState={null}
      onClose={closeDetail}
      readOnly={true}
    />
  {:else}
    <div class="detail-error">
      <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
      <span>Failed to load feedback item</span>
      <button type="button" onclick={closeDetail}>Close</button>
    </div>
  {/if}
</Drawer>

<!-- Version Detail Drawer (changelog editing + contributor tagging) -->
<Drawer
  bind:isOpen={isVersionDetailOpen}
  placement={isMobile ? "bottom" : "right"}
  onclose={closeVersionDetail}
  ariaLabel={selectedVersion ? `Edit release v${selectedVersion.version}` : "Edit release"}
>
  {#if selectedVersion}
    <VersionDetailContent
      version={selectedVersion}
      onVersionUpdated={handleVersionUpdated}
      showCloseButton={true}
      onClose={closeVersionDetail}
    />
  {/if}
</Drawer>

<style>
  .archive-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: color-mix(in srgb, var(--theme-panel-bg) 80%, transparent);
  }

  .archive-header {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--theme-stroke);
    background: color-mix(in srgb, var(--theme-panel-bg) 90%, transparent);
  }

  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .header-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: var(--theme-card-hover-bg, var(--theme-card-bg));
    border: none;
    border-radius: 6px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-compact);
    cursor: pointer;
    transition: all var(--duration-normal);
    width: fit-content;
  }

  .back-btn:hover {
    background: var(--theme-stroke);
    color: var(--theme-text, var(--theme-text));
  }

  .archive-header h2 {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 8px 0 0 0;
    font-size: var(--font-size-xl);
    font-weight: 600;
    color: var(--theme-text);
  }

  .archive-header h2 i {
    color: var(--theme-text-dim);
  }

  .subtitle {
    margin: 0;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .archive-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .versions-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 800px;
    margin: 0 auto;
  }

  .all-items-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 900px;
    margin: 0 auto;
  }

  /* Drawer loading/error states */
  .detail-loading,
  .detail-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 100%;
    padding: 48px 24px;
    text-align: center;
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .detail-loading i,
  .detail-error i {
    font-size: var(--font-size-3xl);
    opacity: 0.6;
  }

  .detail-error i {
    color: var(--semantic-warning, var(--semantic-warning));
  }

  .detail-error button {
    margin-top: 8px;
    padding: 8px 16px;
    background: var(--theme-card-hover-bg);
    border: 1px solid var(--theme-stroke-strong);
    border-radius: 6px;
    color: var(--theme-text, var(--theme-text));
    font-size: var(--font-size-compact);
    cursor: pointer;
    transition: all var(--duration-normal);
  }

  .detail-error button:hover {
    background: var(--theme-stroke);
  }

  /* Responsive design */
  @media (max-width: 768px) {
    .header-top {
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }

    .all-items-list {
      gap: 8px;
    }
  }
</style>
