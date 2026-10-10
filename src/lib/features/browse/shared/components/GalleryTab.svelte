<script lang="ts">
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { CollaborativeVideo } from "$lib/shared/video-collaboration/domain/collaborative-video";
  import type { BrowseEngine } from "$lib/shared/browse/engine/types";

  import BrowsePanel from "$lib/shared/browse/components/BrowsePanel.svelte";
  import GalleryFilterSheet from "$lib/features/browse/gallery-home/GalleryFilterSheet.svelte";
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import DrawerHeader from "$lib/shared/foundation/ui/DrawerHeader.svelte";
  import InviteCollaboratorsPanel from "$lib/shared/video-collaboration/components/InviteCollaboratorsPanel.svelte";
  import SortJumpSheet from "../../sequences/navigation/components/SortJumpSheet.svelte";
  import { sequencePanelManager } from "$lib/shared/browse/state/sequence-panel-state.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte";

  interface Props {
    isMobile: boolean;
    drawerWidth: string;
    engine: BrowseEngine;
    error: string | null;
    onSequenceAction: (
      action: string,
      sequence: SequenceData,
      variations?: SequenceData[]
    ) => Promise<void>;
    /** Back to the drill chooser — rendered as a leading pill in the toolbar. */
    onBackToStart?: () => void;
    /** Grid warm-up: show the skeleton and skip the filtered-set reads for one
     * frame so a drill pick paints the layout instantly (the compute runs after). */
    warming?: boolean;
    /** Passthrough to the filter bar's "Save as Smart Collection" action. */
    onSaveSmart?: () => void;
    /** Desktop Filters pill target: the in-page filter workspace (the drill
     * with the rule strip). Phone keeps the bottom sheet for now — its fate
     * is settled by feel on a real phone (spec decision 3). */
    onOpenWorkspace?: () => void;
  }

  let {
    isMobile,
    drawerWidth,
    engine,
    error,
    onSequenceAction,
    onBackToStart,
    warming = false,
    onSaveSmart,
    onOpenWorkspace,
  }: Props = $props();

  // State for sub-sheets
  let isFilterSheetOpen = $state(false);
  let isInvitePanelOpen = $state(false);
  let inviteVideo = $state<CollaborativeVideo | null>(null);

  function handleInviteCollaborators(video: CollaborativeVideo) {
    inviteVideo = video;
    isInvitePanelOpen = true;
  }

  function handleCloseInvitePanel() {
    isInvitePanelOpen = false;
    inviteVideo = null;
  }

  // Variation picker

  // Derived: available sections for SortJumpSheet. Skipped while warming so the
  // instant-tap frame doesn't trigger the section compute before the skeleton paints.
  const availableNavigationSections = $derived(
    warming ? [] : engine.sections.map((s) => s.title)
  );
</script>

<div class="sequences-main">
  <BrowsePanel
    {engine}
    layout="fullpage"
    onSelect={(sequence, variations) =>
      onSequenceAction("view-detail", sequence, variations)}
    onBack={onBackToStart}
    backLabel={t("site_start_here")}
    hideToolbarSearch
    onOpenFilters={() => {
      if (!isMobile && onOpenWorkspace) onOpenWorkspace();
      else isFilterSheetOpen = true;
    }}
    {warming}
    {onSaveSmart}
  />
</div>

<!-- Filter Sheet — the drill's categories as a bottom sheet. Phone-only now:
     desktop's Filters pill routes to the in-page workspace instead.
     TODO(phone-sheet-feel): the phone sheet's fate is settled by feel on a
     real phone during unified-workspace verification (spec decision 3). -->
{#if isMobile || !onOpenWorkspace}
  <GalleryFilterSheet {engine} bind:isOpen={isFilterSheetOpen} {isMobile} />
{/if}

<!-- Sort & Jump Sheet (Mobile) -->
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
      onSectionClick={(sectionId) => {
        sequencePanelManager.close();
      }}
    />
  </Drawer>
{/if}

<!-- Invite Collaborators Panel -->
{#if inviteVideo}
  <div
    style:--drawer-width={isMobile ? "min(720px, 95vw)" : "min(520px, 45vw)"}
  >
    <InviteCollaboratorsPanel
      show={isInvitePanelOpen}
      placement={isMobile ? "bottom" : "right"}
      video={inviteVideo}
      onClose={handleCloseInvitePanel}
    />
  </div>
{/if}

<style>
  .sequences-main {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-width: 0;
    height: 100%;
  }

  /*
   * Drawer skin routed through the Drawer.svelte --sheet-* token API instead
   * of !important property overrides.
   */
  :global(.invite-collaborators-panel.drawer-content) {
    --sheet-bg: var(--theme-panel-bg);
    --sheet-border: none;
    --sheet-border-strong: 1px solid var(--theme-stroke);
    --sheet-radius-large: 0;
    --sheet-border-radius-top-left: 16px;
    --sheet-border-radius-top-right: 16px;
    --sheet-transition:
      transform 350ms cubic-bezier(0.32, 0.72, 0, 1),
      opacity 350ms cubic-bezier(0.32, 0.72, 0, 1);
    --sheet-width: var(--drawer-width, min(520px, 45vw));
    --sheet-max-height: 90vh;
  }
</style>
