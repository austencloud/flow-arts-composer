<!--
AllLibraryView.svelte

The "All" shelf: your whole library, with the newest saves visible first.

The full grid is the front door. Filters open the shared FilterWorkspace on
demand, so Gallery and Library keep one filtering system without making a
discovery chooser stand between someone and the sequence they just saved.

The engine is created here (not shared with the gallery): its persisted state
is a separate localStorage record, so your library's sort/filters don't fight
the gallery's, and the source is pinned to my-library with no toggle.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { createBrowseEngine } from "$lib/shared/browse/engine/create-browse-engine.svelte";
  import { BrowseSortMethod } from "$lib/shared/browse/domain/enums/browse-enums";
  import BrowsePanel from "$lib/shared/browse/components/BrowsePanel.svelte";
  import LibraryEmptyState from "./LibraryEmptyState.svelte";
  import { flyFade } from "$lib/shared/transitions/motion";
  import SmartCollectionSaveDialog from "$lib/features/library/components/SmartCollectionSaveDialog.svelte";
  import FilterWorkspace from "$lib/features/browse/gallery-home/FilterWorkspace.svelte";
  import { getCollectionOptions } from "$lib/features/browse/gallery-home/collection-options.svelte";
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import DrawerHeader from "$lib/shared/foundation/ui/DrawerHeader.svelte";
  import SortJumpSheet from "../../sequences/navigation/components/SortJumpSheet.svelte";
  import { sequencePanelManager } from "$lib/shared/browse/state/sequence-panel-state.svelte";
  import { openSequenceViewer } from "$lib/shared/sequence-viewer/services/sequence-viewer-navigator";
  import { browseScrollState } from "$lib/shared/browse/state/browse-scroll-state.svelte";
  import { responsiveLayoutManager } from "$lib/shared/create/services/responsive-layout-manager";
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import { navigationState } from "$lib/shared/navigation/state/navigation-state.svelte";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { authDrawerState } from "$lib/shared/auth/state/auth-drawer-state.svelte";
  import { loadSoloLibrarySequences } from "$lib/features/browse/shared/services/solo-library-sequence-loader";
  import { createMultiSelectionState } from "$lib/shared/selection/state/create-multi-selection-state.svelte";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { openCollectionPickerForSequences } from "$lib/features/library/state/collection-picker-state.svelte";
  import ConfirmDialog from "$lib/shared/foundation/ui/ConfirmDialog.svelte";
  import { getLibraryRepository } from "$lib/shared/library/get-library-repository";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import { userPreviewState } from "$lib/shared/debug/state/user-preview-state.svelte";

  // The desktop split view keeps the collection rail visible, so it passes no
  // onBack — BrowsePanel then omits the back pill entirely.
  let { onBack }: { onBack?: () => void } = $props();
  const previewReadOnly = $derived(userPreviewState.isActive);

  const engine = createBrowseEngine({
    persistKey: "tka-browse-library-all",
    initialSource: "my-library",
    initialSort: BrowseSortMethod.DATE_ADDED,
    sources: ["my-library"],
    sections: true,
    loadSoloLibrarySequences,
  });

  const selectionState = createMultiSelectionState({
    getAllIds: () => engine.sequences.map((sequence) => sequence.id),
    onModeChange: () => getHapticFeedback()?.trigger("selection"),
  });

  // BrowsePanel owns the shared toolbar/card wiring; this view owns the one
  // library-specific outcome: filing the selected sequence ids together.
  const selection = {
    get active() {
      return selectionState.active;
    },
    get selectedIds() {
      return selectionState.selectedIds;
    },
    enter(sequence?: SequenceData) {
      selectionState.enter(sequence?.id);
    },
    toggle(sequence: SequenceData) {
      selectionState.toggle(sequence.id);
      getHapticFeedback()?.trigger("selection");
    },
    selectAll() {
      selectionState.selectAll();
      getHapticFeedback()?.trigger("selection");
    },
    clear() {
      selectionState.clear();
      getHapticFeedback()?.trigger("selection");
    },
    exit() {
      selectionState.exit();
    },
    openPrimaryAction() {
      if (selectionState.selectedCount === 0) return;
      openCollectionPickerForSequences({
        sequenceIds: [...selectionState.selectedIds],
        onComplete: () => selectionState.exit(),
      });
    },
    openDangerAction() {
      if (selectionState.selectedCount === 0) return;
      deleteTargets = [...selectionState.selectedIds];
      deleteConfirmOpen = true;
    },
  };

  let deleteConfirmOpen = $state(false);
  let deleteTargets = $state<string[]>([]);
  let isDeleting = $state(false);

  const deleteTitle = $derived(
    deleteTargets.length === 1
      ? "Permanently delete this sequence?"
      : `Permanently delete ${deleteTargets.length} sequences?`
  );
  const deleteMessage = $derived(
    deleteTargets.length === 1
      ? "This removes the sequence from your library, this device, and the community gallery. It can't be undone."
      : "This removes the selected sequences from your library, this device, and the community gallery. It can't be undone."
  );

  async function deleteSelectedSequences(): Promise<void> {
    if (isDeleting || deleteTargets.length === 0) return;
    const ids = [...deleteTargets];
    isDeleting = true;

    try {
      await getLibraryRepository().deleteSequences(ids);
      toast.success(
        ids.length === 1
          ? "Sequence permanently deleted"
          : `${ids.length} sequences permanently deleted`
      );
      selectionState.exit();
      deleteTargets = [];
    } catch (error) {
      console.error("[AllLibraryView] Permanent delete failed:", error);
      toast.error(
        ids.length === 1
          ? "Sequence wasn't deleted. Try again."
          : "Some sequences weren't deleted. Try again."
      );
    } finally {
      isDeleting = false;
    }
  }

  function cancelDelete(): void {
    deleteConfirmOpen = false;
    deleteTargets = [];
  }

  let isSideBySide = $state(false);
  const isMobile = $derived(!isSideBySide);

  onMount(() => {
    engine.initialize();
    isSideBySide = responsiveLayoutManager.shouldUseSideBySideLayout();
    const unsubscribe = responsiveLayoutManager.onLayoutChange(() => {
      isSideBySide = responsiveLayoutManager.shouldUseSideBySideLayout();
    });
    return () => {
      unsubscribe();
      engine.destroy();
    };
  });

  // All opens on the collection itself. The filter workspace is a focused
  // supporting task entered from the grid's Filters control.
  let libraryView = $state<"workspace" | "grid">("grid");
  let gridWarming = $state(false);
  let smartSaveOpen = $state(false);

  const collectionOptions = $derived.by(() => getCollectionOptions());

  function ejectToGrid(mutate: () => void) {
    libraryView = "grid";
    gridWarming = true;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        mutate();
        gridWarming = false;
      })
    );
  }

  function openViewer(sequence: SequenceData, variations?: SequenceData[]) {
    openSequenceViewer(sequence, {
      source: "browse_library",
      returnPath: "/browse/library",
      returnLabel: "Library",
      scrollY: browseScrollState.lastScrollY,
      handPathMode: engine.viewMode.subject === "hands",
      variations,
    });
  }

  // A card click always opens the viewer, variations or not. The viewer's own
  // strip handles switching between them.
  function handleSelect(sequence: SequenceData, variations?: SequenceData[]) {
    openViewer(sequence, variations);
  }

  const availableNavigationSections = $derived(
    engine.sections.map((s) => s.title)
  );

  const emptyAction = {
    label: "Browse Gallery",
    onClick: () => {
      navigationState.setActiveTab("explore");
    },
  };
  const showEmptyLibrary = $derived(
    !previewReadOnly &&
      engine.sectionsReady &&
      !engine.isLoading &&
      !engine.error &&
      engine.allSequences.length === 0 &&
      !engine.hasActiveFilters &&
      !engine.searchQuery
  );
  const emptyState = $derived({
    message: "Your saved sequences and collections appear here.",
    description: "Browse the Gallery to find something to save.",
    secondaryAction:
      !authState.isFullAccount && !previewReadOnly
        ? {
            label: "Create account",
            description:
              "Create a free account to access your collections on other devices.",
            onClick: () => authDrawerState.show("signup", "sync-library"),
          }
        : undefined,
  });
</script>

<!-- The workspace's results column. Its own BrowsePanel, so selection mode,
     the empty-library CTA and the viewer hand-off stay library-owned; only the
     filtering chrome is shared. -->
{#snippet resultsPane()}
  <BrowsePanel
    {engine}
    layout="compact"
    eager={false}
    showFilterBar={false}
    hideFilterChips
    onSelect={handleSelect}
    emptyAction={previewReadOnly ? undefined : emptyAction}
    emptyState={previewReadOnly ? undefined : emptyState}
    selection={previewReadOnly ? undefined : selection}
  />
{/snippet}

<div class="all-library" class:workspace={libraryView === "workspace"}>
  {#if showEmptyLibrary}
    <div class="empty-library-frame" transition:flyFade>
      <LibraryEmptyState
        {onBack}
        onBrowse={emptyAction.onClick}
        onCreateAccount={!authState.isFullAccount
          ? () => authDrawerState.show("signup", "sync-library")
          : undefined}
      />
    </div>
  {:else if libraryView === "workspace"}
    <FilterWorkspace
      {engine}
      collections={collectionOptions}
      {resultsPane}
      onSaveSmart={() => (smartSaveOpen = true)}
      onEject={ejectToGrid}
      onClose={() => ejectToGrid(() => {})}
    />
  {:else}
    <BrowsePanel
      {engine}
      layout="fullpage"
      onSelect={handleSelect}
      {onBack}
      backLabel="Collections"
      hideToolbarSearch
      warming={gridWarming || (!engine.sectionsReady && !engine.error)}
      showToolbar={engine.sectionsReady || !!engine.error}
      showFilterBar={engine.sectionsReady || !!engine.error}
      onOpenFilters={() => (libraryView = "workspace")}
      onSaveSmart={() => (smartSaveOpen = true)}
      {emptyAction}
      emptyState={previewReadOnly ? undefined : emptyState}
      {selection}
    />
  {/if}
</div>

<SmartCollectionSaveDialog {engine} bind:show={smartSaveOpen} />

{#if isMobile}
  <Drawer
    isOpen={sequencePanelManager.isSortJumpOpen}
    placement="bottom"
    onOpenChange={(open) => {
      if (!open) sequencePanelManager.close();
    }}
  >
    <DrawerHeader
      title={t("browse_sort_navigate")}
      onClose={() => sequencePanelManager.close()}
    />
    <SortJumpSheet
      currentSortMethod={engine.sortMethod}
      availableSections={availableNavigationSections}
      onSortMethodChange={(method) => {
        engine.setSort(method, "asc");
        sequencePanelManager.close();
      }}
      onSectionClick={() => {
        sequencePanelManager.close();
      }}
    />
  </Drawer>
{/if}

<ConfirmDialog
  bind:isOpen={deleteConfirmOpen}
  title={deleteTitle}
  message={deleteMessage}
  confirmText="Delete permanently"
  cancelText="Keep"
  variant="danger"
  onConfirm={deleteSelectedSequences}
  onCancel={cancelDelete}
/>

<style>
  .all-library {
    position: relative;
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-width: 0;
    height: 100%;
  }

  .empty-library-frame {
    position: absolute;
    inset: 0;
    z-index: 1;
  }

  /* The workspace owns its own scrolling panes (catalog, editor, results), so
     the shell must not add a second scroll container around them. */
  .all-library.workspace {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
</style>
