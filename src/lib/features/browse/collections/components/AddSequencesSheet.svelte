<!--
AddSequencesSheet.svelte

Build a collection from inside it. A Drawer — slide-up bottom sheet on
mobile, right-side drawer on desktop (the app's standard panel pattern) —
hosting the full Browse experience: the same GalleryDrill front door the
gallery uses ("hunt for what you're looking for"), handing off to
BrowsePanel's filtered grid of real pictograph cards. Tapping a card
toggles it in and out of the target collection immediately — cards already
in the collection wear the selected outline, and the header count ticks
live so every tap has visible feedback.

While the sheet is up the app navigation hides (browseScrollState drives
both the bottom nav and the sidebar): picking sequences is a focused task,
and the chrome behind the scrim is just noise.

Membership writes go through collections-state (cap guard + latency
compensation), so the detail view behind this sheet updates on its own.
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import { createBrowseEngine } from "$lib/shared/browse/engine/create-browse-engine.svelte";
  import BrowsePanel from "$lib/shared/browse/components/BrowsePanel.svelte";
  import GalleryDrill from "$lib/features/browse/gallery-home/GalleryDrill.svelte";
  import GalleryFilterSheet from "$lib/features/browse/gallery-home/GalleryFilterSheet.svelte";
  import FilterRuleStrip from "$lib/shared/browse/components/FilterRuleStrip.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
  import CollectionChipsRow from "$lib/features/library/components/collection-picker/CollectionChipsRow.svelte";
  import { collectionsState } from "$lib/features/library/state/collections-state.svelte";
  import { browseScrollState } from "$lib/shared/browse/state/browse-scroll-state.svelte";
  import { responsiveLayoutManager } from "$lib/shared/create/services/responsive-layout-manager";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { getCollectionCollaborationManager } from "$lib/shared/library/get-collection-collaboration-manager";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";

  let {
    collectionId,
    collectionOwnerId = null,
    collectionName,
    initialMemberIds = [],
    onClose,
  }: {
    collectionId: string;
    /** Owner of a shared collection. Null means the signed-in user's collection. */
    collectionOwnerId?: string | null;
    collectionName?: string;
    initialMemberIds?: readonly string[];
    onClose: () => void;
  } = $props();
  const collaborationManager = getCollectionCollaborationManager();

  $effect(() => {
    collectionsState.ensureStarted();
  });

  // Live view of the target collection: name for the title, member ids for
  // the selected outlines and the ticking count.
  const target = $derived(
    collectionsState.collections.find((c) => c.id === collectionId) ?? null
  );
  const memberIds = $derived(new Set(target?.sequenceIds ?? initialMemberIds));
  let pendingSequenceIds = $state<Set<string>>(new Set());

  // Guests need the public catalog before they have saved any work of their
  // own. Full accounts start in their library; either source stays available.
  const engine = createBrowseEngine({
    persistKey: null,
    initialSource: authState.isFullAccount ? "my-library" : "community",
    minColumns: 2,
  });
  const sourceTitle = $derived(
    engine.source === "community"
      ? "Add from Gallery"
      : "Add from your saved sequences"
  );

  // The parent mounts this component on demand, so the Drawer starts closed
  // and opens a frame later — that's what makes the slide-in animate.
  let drawerOpen = $state(false);

  // Bottom sheet on mobile, right drawer on desktop (CollectionPickerSheet's
  // exact placement logic).
  let isSideBySide = $state(false);
  let layoutUnsubscribe: (() => void) | null = null;
  const placement = $derived(isSideBySide ? "right" : "bottom");

  onMount(() => {
    engine.initialize();

    isSideBySide = responsiveLayoutManager.shouldUseSideBySideLayout();
    layoutUnsubscribe = responsiveLayoutManager.onLayoutChange(() => {
      isSideBySide = responsiveLayoutManager.shouldUseSideBySideLayout();
    });

    // Focus mode: hide the bottom nav / sidebar while picking.
    browseScrollState.hideUI();

    requestAnimationFrame(() => {
      drawerOpen = true;
    });

    return () => {
      engine.destroy();
      browseScrollState.showUI();
    };
  });

  onDestroy(() => layoutUnsubscribe?.());

  // Let the Drawer's slide-out finish before the parent unmounts us.
  const CLOSE_ANIMATION_MS = 300;
  function requestClose() {
    if (!drawerOpen) return;
    drawerOpen = false;
    setTimeout(onClose, CLOSE_ANIMATION_MS);
  }

  // Same two-stage flow as the gallery tab: drill first, grid after.
  let view = $state<"drill" | "grid">("drill");

  // Grid view carries the gallery's Filters pill → the shared drill filter
  // sheet (stacked drawer; the Drawer stack handles z-order and Escape).
  let filterSheetOpen = $state(false);

  function backToDrill() {
    // Back to the WORKSPACE, rule intact — the strip shows and edits it
    // there (mirrors BrowseModule). Only transient search resets.
    engine.setSearch("");
    view = "drill";
  }

  // Workspace wiring — the same toggle-in-place contract the gallery and
  // the Smart Collection builder use (unified filter workspace spec).
  const loopKeyByValue = $derived(
    new Map(
      [...engine.activeFilters]
        .filter(([, f]) => f.type === BrowseFilterType.LOOP_TYPE && !f.locked)
        .map(([key, f]) => [String(f.value), key])
    )
  );
  const activeLoopValues = $derived(new Set(loopKeyByValue.keys()));
  const familyKeyByValue = $derived(
    new Map(
      [...engine.activeFilters]
        .filter(([, f]) => f.type === BrowseFilterType.TND_FAMILY && !f.locked)
        .map(([key, f]) => [String(f.value), key])
    )
  );
  const activeFamilyValues = $derived(new Set(familyKeyByValue.keys()));
  const appliedValueKeys = $derived(
    new Set(
      [...engine.activeFilters.values()]
        .filter((f) => !f.locked)
        .map((f) => `${f.type}:${String(f.value)}`)
    )
  );

  // Strip chip body = edit: remount the drill on that filter's own editor.
  type WorkspaceSection =
    | "level"
    | "length"
    | "letter"
    | "placement"
    | "gridmode"
    | "author"
    | "performance"
    | "loop"
    | "family"
    | "max_turn_intensity";
  const SECTION_FOR_FILTER_TYPE: Partial<Record<string, WorkspaceSection>> = {
    [BrowseFilterType.DIFFICULTY]: "level",
    [BrowseFilterType.LENGTH]: "length",
    [BrowseFilterType.STARTING_LETTER]: "letter",
    [BrowseFilterType.STARTING_PLACEMENT]: "placement",
    [BrowseFilterType.GRID_MODE]: "gridmode",
    [BrowseFilterType.OWNER]: "author",
    [BrowseFilterType.PERFORMANCE_AVAILABILITY]: "performance",
    [BrowseFilterType.RECENT_PERFORMANCE]: "performance",
    [BrowseFilterType.LOOP_TYPE]: "loop",
    [BrowseFilterType.TND_FAMILY]: "family",
    [BrowseFilterType.MAX_TURN_INTENSITY]: "max_turn_intensity",
  };
  let drillSeed = $state<{ section?: WorkspaceSection }>({});

  async function handleSelect(seq: SequenceData) {
    if (pendingSequenceIds.has(seq.id)) return;
    getHapticFeedback()?.trigger("selection");
    if (!collectionOwnerId) {
      void collectionsState.toggle(seq.id, collectionId);
      return;
    }

    pendingSequenceIds = new Set([...pendingSequenceIds, seq.id]);
    try {
      if (memberIds.has(seq.id)) {
        await collaborationManager.mutate(collectionOwnerId, collectionId, {
          type: "remove",
          sequenceIds: [seq.id],
        });
      } else {
        const ownerId = seq.ownerId || authState.effectiveUserId;
        if (!ownerId) throw new Error("Sequence owner is unavailable");
        await collaborationManager.mutate(collectionOwnerId, collectionId, {
          type: "add",
          members: [{ sequenceId: seq.id, ownerId }],
        });
      }
    } catch (error) {
      console.error(
        "[AddSequencesSheet] Shared collection update failed:",
        error
      );
      toast.error("The collection wasn’t updated. Try again.");
    } finally {
      pendingSequenceIds = new Set(
        [...pendingSequenceIds].filter((id) => id !== seq.id)
      );
    }
  }

  function countLabel(n: number): string {
    return `${n} ${n === 1 ? "sequence" : "sequences"}`;
  }
</script>

<Drawer
  isOpen={drawerOpen}
  {placement}
  closeOnBackdrop={true}
  closeOnEscape={true}
  dismissible={true}
  showHandle={placement === "bottom"}
  ariaLabel={sourceTitle}
  class="add-sequences-drawer"
  onOpenChange={(open) => {
    if (!open) requestClose();
  }}
>
  <div class="sheet-content">
    <header class="panel-header">
      <div class="header-text">
        <h2 class="panel-title">
          {sourceTitle}
        </h2>
        <span class="panel-count">
          {target?.name ?? collectionName ?? "Collection"} · {countLabel(
            memberIds.size
          )} inside
        </span>
      </div>
      <button
        type="button"
        class="done-btn"
        aria-label="Done"
        onclick={requestClose}
      >
        <i class="fas fa-check" aria-hidden="true"></i>
        <span>Done</span>
      </button>
    </header>

    <div class="panel-body">
      {#if view === "drill"}
        {#if engine.hasActiveFilters}
          <div class="sheet-rule-strip" aria-label="Current filters">
            <span class="strip-count" aria-live="polite">
              {engine.resultCount}
              {engine.resultCount === 1 ? "match" : "matches"}
            </span>
            <FilterRuleStrip
              filters={engine.allFilterChips.filter((c) => !c.locked)}
              connectives={engine.connectives}
              onEditFilter={(type) =>
                (drillSeed = { section: SECTION_FOR_FILTER_TYPE[type] })}
              onRemoveFilter={(key) => engine.removeFilter(key)}
            />
            <div class="strip-actions">
              <PanelButton variant="primary" onclick={() => (view = "grid")}>
                View {engine.resultCount} results
              </PanelButton>
            </div>
          </div>
        {/if}
        <div class="drill-host">
          {#key drillSeed}
            <GalleryDrill
              pool={engine.allSequences}
              adaptiveValueLayout
              initialSection={drillSeed.section}
              getCount={(type, value) => engine.getFilteredCount(type, value)}
              isValueApplied={(type, value) =>
                appliedValueKeys.has(`${type}:${String(value)}`)}
              onApply={(type, value, label, color) =>
                engine.addFilter(type, value, label, color ?? "#6aa0ff")}
              onToggleValue={(type, value, label, color, nowActive) => {
                if (nowActive) {
                  engine.addFilter(type, value, label, color ?? "#6aa0ff");
                } else {
                  engine.removeFilter(`${type}:${String(value)}`);
                }
              }}
              {activeLoopValues}
              loopConnective={engine.connectives[
                String(BrowseFilterType.LOOP_TYPE)
              ] ?? "any"}
              onLoopConnectiveChange={(connective) =>
                engine.setConnective(BrowseFilterType.LOOP_TYPE, connective)}
              onToggleLoop={(value, label, color, nowActive) => {
                if (nowActive) {
                  engine.addFilter(
                    BrowseFilterType.LOOP_TYPE,
                    value,
                    label,
                    color
                  );
                } else {
                  const key = loopKeyByValue.get(value);
                  if (key) engine.removeFilter(key);
                }
              }}
              {activeFamilyValues}
              familyConnective={engine.connectives[
                String(BrowseFilterType.TND_FAMILY)
              ] ?? "any"}
              onFamilyConnectiveChange={(connective) =>
                engine.setConnective(BrowseFilterType.TND_FAMILY, connective)}
              onToggleFamily={(familyId, label, color, nowActive) => {
                if (nowActive) {
                  engine.addFilter(
                    BrowseFilterType.TND_FAMILY,
                    familyId,
                    label,
                    color
                  );
                } else {
                  const key = familyKeyByValue.get(familyId);
                  if (key) engine.removeFilter(key);
                }
              }}
              onShowAll={() => (view = "grid")}
              onSearch={(q) => {
                engine.setSearch(q);
                view = "grid";
              }}
            />
          {/key}
        </div>
      {:else}
        <!-- Collections lead the grid as chips (yours on My Library,
				     followed on Community) — pull from one collection into
				     another without leaving the sheet. -->
        <CollectionChipsRow {engine} />
        <BrowsePanel
          {engine}
          layout="compact"
          showSourceToggle
          selectedIds={memberIds}
          onSelect={handleSelect}
          onBack={backToDrill}
          backLabel="Start here"
          hideToolbarSearch
          onOpenFilters={() => (filterSheetOpen = true)}
        />
      {/if}
    </div>

    <GalleryFilterSheet
      {engine}
      bind:isOpen={filterSheetOpen}
      isMobile={placement === "bottom"}
    />
  </div>
</Drawer>

<style>
  /* Near-full-height bottom sheet: the browse grid needs room, and a fixed
	   height (not content-sized) lets the panel body flex-fill. */
  :global(.add-sequences-drawer[data-placement="bottom"]) {
    height: 92dvh;
    --sheet-max-height: 92dvh;
  }

  :global(.add-sequences-drawer[data-placement="right"]) {
    --sheet-width: min(760px, 94vw);
  }

  .sheet-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  /* The workspace rule strip: count, grouped sentence, View results. */
  .sheet-rule-strip {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.9rem;
    padding: 0.55rem 16px;
    flex: 0 0 auto;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .sheet-rule-strip .strip-count {
    font-size: 0.85rem;
    font-weight: 700;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .strip-actions {
    display: flex;
    gap: 0.5rem;
    margin-left: auto;
    flex: 0 0 auto;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 16px 12px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .header-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .panel-title {
    margin: 0;
    font-size: var(--font-size-lg, 18px);
    font-weight: 700;
    color: var(--theme-text, white);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .panel-count {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-variant-numeric: tabular-nums;
  }

  .done-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 44px;
    padding: 0 18px;
    flex-shrink: 0;
    border: 1px solid color-mix(in srgb, var(--theme-accent) 45%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--theme-accent) 22%, transparent);
    color: var(--theme-text, white);
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    cursor: pointer;
    transition: background var(--duration-fast, 150ms) ease;
  }

  .done-btn:hover {
    background: color-mix(in srgb, var(--theme-accent) 34%, transparent);
  }

  .done-btn:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .panel-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  /* BrowsePanel's root is height:100%; the drill scrolls on its own. */
  .panel-body > :global(*) {
    flex: 1;
    min-height: 0;
  }

  /* Chips hug their content — the grid below takes the rest (overrides the
	   flex-fill default above). */
  .panel-body > :global(.collection-chips-row) {
    flex: 0 0 auto;
  }

  /* The rule strip hugs too; the drill below takes the rest. */
  .panel-body > .sheet-rule-strip {
    flex: 0 0 auto;
  }

  .drill-host {
    overflow-y: auto;
    padding: 12px;
  }

  @media (prefers-reduced-motion: reduce) {
    .done-btn {
      transition: none;
    }
  }
</style>
