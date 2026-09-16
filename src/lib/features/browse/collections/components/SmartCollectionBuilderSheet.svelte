<!--
SmartCollectionBuilderSheet.svelte

The historical filename remains because several collection entry points import
it, but the surface itself is now a focused modal workspace. The rule stays in
one rail while the live matching grid gets the rest of the canvas.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalHeader from "$lib/shared/foundation/ui/modal/ModalHeader.svelte";
  import { createBrowseEngine } from "$lib/shared/browse/engine/create-browse-engine.svelte";
  import { loadCanonicalTnDSequences } from "$lib/features/browse/gallery-home/canonical-tnd-pool";
  import BrowsePanel from "$lib/shared/browse/components/BrowsePanel.svelte";
  import GalleryDrill from "$lib/features/browse/gallery-home/GalleryDrill.svelte";
  import { getGalleryPrefetcher } from "$lib/features/browse/shared/get-gallery-prefetcher";
  import { collectionsState } from "$lib/features/library/state/collections-state.svelte";
  import {
    applySpecToEngine,
    buildFilterSpecFromEngine,
  } from "$lib/shared/browse/services/smart-filter-spec";
  import { suggestSmartCollectionName } from "$lib/shared/browse/services/smart-collection-name";
  import type { SmartFilterSpec } from "$lib/shared/library/domain/models/collection";
  import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import PanelState from "$lib/shared/components/panel/PanelState.svelte";
  import FilterRuleStrip from "$lib/shared/browse/components/FilterRuleStrip.svelte";
  import SmartCollectionNameField from "$lib/features/library/components/SmartCollectionNameField.svelte";

  type FilterPickerSection =
    | "chooser"
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

  let {
    mode,
    editCollectionId,
    initialSpec,
    initialFilterSection,
    onClose,
  }: {
    mode: "create" | "edit";
    /** Required in edit mode: the collection whose rule is being changed. */
    editCollectionId?: string;
    /** Edit mode: seed the engine with the existing rule. */
    initialSpec?: SmartFilterSpec;
    /** Design-review entry point for opening a real filter drill directly. */
    initialFilterSection?: FilterPickerSection;
    onClose: () => void;
  } = $props();

  // New Smart Collections search the full community catalog. A creator filter
  // covers the useful personal-library case without making everyone choose a
  // source before they can define the rule. Existing library-scoped rules keep
  // their saved source while editing so opening one never broadens it silently.
  const engine = createBrowseEngine({
    persistKey: null,
    initialSource: initialSpec?.source ?? "community",
    minColumns: 2,
    extraCommunitySequences: loadCanonicalTnDSequences,
  });

  let modalOpen = $state(false);
  let drillSection = $state<FilterPickerSection | "more">("chooser");
  // Remount seed for the picker drill: editing an applied chip reopens the
  // picker ON that filter's editor instead of the chooser.
  let pickerSeed = $state<{ section?: FilterPickerSection }>({
    section: initialFilterSection,
  });
  // The engine reports isLoading=false after the IndexedDB warm while the
  // network sync is still revising counts — showing that interim number
  // produced a confident wrong total that silently corrected itself (audit
  // X-1). Hold the "Counting matches" treatment until initialize() resolves.
  let countSettled = $state(false);
  let name = $state("");
  let usingSuggestedName = $state(true);
  let saving = $state(false);
  let hasCommitted = $state(false);
  let filterPickerOpen = $state(
    Boolean(initialFilterSection) || !initialSpec?.filters.length
  );
  let mobilePreviewOpen = $state(false);
  let discardConfirmOpen = $state(false);
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  let closeScheduled = false;

  const currentSpec = $derived.by(() => buildFilterSpecFromEngine(engine));
  const suggestedName = $derived(
    suggestSmartCollectionName(
      currentSpec,
      collectionsState.collections.map((collection) => collection.name)
    )
  );
  const currentSpecSignature = $derived(JSON.stringify(currentSpec));
  const initialSpecSignature = JSON.stringify(initialSpec ?? null);
  const isDirty = $derived(
    !hasCommitted &&
      (mode === "create"
        ? engine.hasActiveFilters || !usingSuggestedName
        : currentSpecSignature !== initialSpecSignature)
  );
  const canSave = $derived(engine.hasActiveFilters && !saving);
  const countPending = $derived(!countSettled || engine.isLoading);
  const matchStatus = $derived(
    engine.error
      ? "Matches unavailable"
      : countPending
        ? "Counting matches"
        : `${engine.resultCount} ${engine.resultCount === 1 ? "match" : "matches"}`
  );

  const SECTION_FOR_FILTER_TYPE: Partial<
    Record<BrowseFilterType, FilterPickerSection>
  > = {
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

  /** Chip body action: reopen the picker on that filter's own editor. */
  function editFilter(filterType: BrowseFilterType) {
    pickerSeed = { section: SECTION_FOR_FILTER_TYPE[filterType] ?? "chooser" };
    filterPickerOpen = true;
    mobilePreviewOpen = false;
  }

  function openFilterChooser() {
    pickerSeed = { section: undefined };
    filterPickerOpen = true;
    mobilePreviewOpen = false;
  }
  const loopKeyByValue = $derived(
    new Map(
      [...engine.activeFilters]
        .filter(
          ([, filter]) =>
            filter.type === BrowseFilterType.LOOP_TYPE && !filter.locked
        )
        .map(([key, filter]) => [String(filter.value), key])
    )
  );
  const activeLoopValues = $derived(new Set(loopKeyByValue.keys()));
  const familyKeyByValue = $derived(
    new Map(
      [...engine.activeFilters]
        .filter(
          ([, filter]) =>
            filter.type === BrowseFilterType.TND_FAMILY && !filter.locked
        )
        .map(([key, filter]) => [String(filter.value), key])
    )
  );
  const activeFamilyValues = $derived(new Set(familyKeyByValue.keys()));

  // Every applied (type, value) pair, so re-entered editors can show the
  // current selection instead of rendering all options unselected.
  const appliedValueKeys = $derived(
    new Set(
      [...engine.activeFilters.values()]
        .filter((filter) => !filter.locked)
        .map((filter) => `${filter.type}:${String(filter.value)}`)
    )
  );

  // The drill's footer guidance must match the ACTIVE editor's interaction
  // model — a "choose one option" line under a multi-select editor was a
  // recurring audit blocker.
  const firstFilterHint = $derived.by(() => {
    switch (drillSection) {
      case "loop":
        return "LOOPs apply as you tap them. Combine several.";
      case "family":
        return "Families apply as you tap them. Combine several.";
      case "max_turn_intensity":
        return "Slide to a limit, then apply it.";
      case "chooser":
        return "Choose a filter to start.";
      default:
        return "Options apply as you tap them. Pick any that fit.";
    }
  });

  onMount(() => {
    let destroyed = false;
    if (initialSpec) applySpecToEngine(engine, initialSpec);
    requestAnimationFrame(() => (modalOpen = true));

    // Give the shared IndexedDB cache first refusal before the engine starts a
    // Firestore read. The chooser is already interactive while this resolves.
    void getGalleryPrefetcher()
      .prefetch({ skipNetworkSync: true })
      .catch((error: unknown) =>
        console.warn("[SmartCollectionBuilder] Gallery warm failed:", error)
      )
      .then(() => (destroyed ? undefined : engine.initialize()))
      .finally(() => {
        if (!destroyed) countSettled = true;
      });

    return () => {
      destroyed = true;
      engine.destroy();
      if (closeTimer !== null) clearTimeout(closeTimer);
    };
  });

  const CLOSE_ANIMATION_MS = 220;
  function finishClose() {
    if (closeScheduled) return;
    closeScheduled = true;
    modalOpen = false;
    closeTimer = setTimeout(onClose, CLOSE_ANIMATION_MS);
  }

  function requestClose() {
    if (isDirty) {
      discardConfirmOpen = true;
      return;
    }
    finishClose();
  }

  function discardAndClose() {
    discardConfirmOpen = false;
    hasCommitted = true;
    finishClose();
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape" || !modalOpen || discardConfirmOpen) return;
    if (filterPickerOpen && engine.hasActiveFilters) {
      event.preventDefault();
      filterPickerOpen = false;
      return;
    }
    if (!isDirty) return;
    event.preventDefault();
    discardConfirmOpen = true;
  }

  async function save() {
    const trimmed = name.trim() || suggestedName;
    if (!engine.hasActiveFilters) {
      toast.error("Add at least one filter to define the rule.");
      return;
    }
    if (saving) return;
    saving = true;
    const matchCount = engine.resultCount;
    let ok = false;
    if (mode === "edit" && editCollectionId) {
      ok = await collectionsState.updateFilterSpec(
        editCollectionId,
        currentSpec,
        matchCount
      );
    } else {
      ok = !!(await collectionsState.createSmart(
        trimmed,
        currentSpec,
        matchCount
      ));
    }
    saving = false;
    if (ok) {
      hasCommitted = true;
      toast.success(
        mode === "edit"
          ? "Rule updated."
          : `Smart Collection "${trimmed}" saved.`
      );
      finishClose();
    }
  }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<BaseModal
  bind:open={modalOpen}
  size="full"
  animation="pop"
  closeOnBackdrop={false}
  closeOnEscape={!isDirty}
  labelledBy="smart-builder-title"
  class="smart-builder-modal"
  onclose={finishClose}
>
  {#snippet header()}
    <ModalHeader
      id="smart-builder-title"
      title={mode === "edit" ? "Edit Smart Collection" : "New Smart Collection"}
      subtitle={mode === "edit"
        ? "Change the rule and review the matches."
        : "Pick filters. Review the matches."}
      icon="fa-wand-magic-sparkles"
      iconColor="var(--theme-accent, #8b6cff)"
      onClose={requestClose}
    />
  {/snippet}

  <div
    class="workspace-shell"
    class:first-filter-focus={!engine.hasActiveFilters}
    class:filter-picker-open={filterPickerOpen}
    class:mobile-preview-open={mobilePreviewOpen}
  >
    <aside class="rule-pane" aria-label="Smart Collection rule">
      {#if mode === "create" && engine.hasActiveFilters}
        <div class="identity-setup">
          <SmartCollectionNameField
            inputId="smart-builder-name"
            {suggestedName}
            bind:name
            bind:usingSuggestion={usingSuggestedName}
            onEnter={() => {
              if (canSave) void save();
            }}
          />
        </div>
      {/if}

      <div class="rule-work-area">
        {#if filterPickerOpen || !engine.hasActiveFilters}
          <div class="filter-picker-shell">
            {#if engine.hasActiveFilters}
              <!-- The rule never disappears while refining it: applied chips
                   stay readable (and editable) beside every editor. Audit
                   D-8/X-11/C-17. -->
              <div class="picker-rule-strip" aria-label="Current rule">
                <span class="strip-count" aria-live="polite">{matchStatus}</span
                >
                <div class="strip-chips">
                  <FilterRuleStrip
                    filters={currentSpec.filters}
                    connectives={engine.connectives}
                    onEditFilter={(type) =>
                      editFilter(type as BrowseFilterType)}
                    onRemoveFilter={(key) => {
                      engine.removeFilter(key);
                      if (!engine.hasActiveFilters) {
                        filterPickerOpen = true;
                        mobilePreviewOpen = false;
                      }
                    }}
                  />
                </div>
              </div>
            {/if}
            <div class="filter-picker-content">
              {#key pickerSeed}
                <GalleryDrill
                  variant="sheet"
                  pool={engine.allSequences}
                  persistSection={false}
                  showCollections={false}
                  showAll={false}
                  fluidWideCanvas
                  unifiedFilterChooser
                  adaptiveValueLayout
                  persistentDesktopCatalog
                  initialSection={pickerSeed.section}
                  onSectionChange={(section) => (drillSection = section)}
                  isValueApplied={(type, value) =>
                    appliedValueKeys.has(`${type}:${String(value)}`)}
                  chooserTitle={engine.hasActiveFilters
                    ? "Add a filter"
                    : "What should this collection match?"}
                  chooserHint={engine.hasActiveFilters
                    ? "The current rule stays applied."
                    : "Pick one filter to start. You can add more next."}
                  getCount={(type, value) =>
                    engine.getFilteredCount(type, value)}
                  onApply={(type, value, label, color) => {
                    // The composer never bounces: the strip and preview
                    // update in place; the user leaves via Return to rule /
                    // Save.
                    engine.addFilter(type, value, label, color ?? "#6aa0ff");
                  }}
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
                    engine.setConnective(
                      BrowseFilterType.LOOP_TYPE,
                      connective
                    )}
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
                    engine.setConnective(
                      BrowseFilterType.TND_FAMILY,
                      connective
                    )}
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
                />
              {/key}
            </div>
          </div>
        {:else}
          <section
            class="rule-summary"
            aria-labelledby="smart-filter-step-title"
          >
            <div class="rule-copy">
              <h3 id="smart-filter-step-title">Filters</h3>
              <p>Sequences must match every category.</p>
            </div>

            <div class="applied-filters" aria-label="Applied filters">
              <!-- Chip body EDITS (opens that filter's editor); the split ×
                   removes. A chip whose whole surface deletes was audit
                   X-7/D-9/C-7. The strip groups values per category with
                   their connective word (or / and). -->
              <FilterRuleStrip
                filters={currentSpec.filters}
                connectives={engine.connectives}
                onEditFilter={(type) => editFilter(type as BrowseFilterType)}
                onRemoveFilter={(key) => {
                  engine.removeFilter(key);
                  if (!engine.hasActiveFilters) {
                    filterPickerOpen = true;
                    mobilePreviewOpen = false;
                  }
                }}
              />
            </div>

            <div class="rule-actions">
              <PanelButton
                variant="secondary"
                fullWidth
                onclick={openFilterChooser}
              >
                <i class="fas fa-plus" aria-hidden="true"></i>
                Add filter
              </PanelButton>

              <div class="mobile-preview-action">
                <PanelButton
                  variant="secondary"
                  fullWidth
                  ariaLabel={`Preview ${engine.resultCount} ${engine.resultCount === 1 ? "match" : "matches"}`}
                  onclick={() => (mobilePreviewOpen = true)}
                >
                  <i class="fas fa-eye" aria-hidden="true"></i>
                  Preview {engine.resultCount}
                </PanelButton>
              </div>
            </div>
          </section>
        {/if}
      </div>
    </aside>

    <section class="preview-pane" aria-labelledby="smart-preview-title">
      <header class="preview-head">
        <div class="mobile-preview-back">
          <PanelButton
            variant="secondary"
            ariaLabel="Back to filters"
            onclick={() => (mobilePreviewOpen = false)}
          >
            <i class="fas fa-arrow-left" aria-hidden="true"></i>
            Filters
          </PanelButton>
        </div>
        <div class="preview-title">
          <span class="step-label">Live preview</span>
          <h3 id="smart-preview-title" aria-live="polite">{matchStatus}</h3>
        </div>
        <div
          class="preview-mode"
          aria-label="Sequence cards are a preview only"
        >
          <i class="fas fa-eye" aria-hidden="true"></i>
          <span>Preview only</span>
        </div>
      </header>

      <div class="preview-content">
        {#if engine.error}
          <PanelState
            type="error"
            title="Couldn't update the matches"
            message="Check your connection, then try again."
            onretry={() => engine.refresh()}
          />
        {:else if countPending}
          <PanelState
            type="loading"
            title="Counting matches"
            message="The preview will update when the sequences are ready."
          />
        {:else if engine.resultCount === 0}
          <PanelState
            type="info"
            icon={engine.hasActiveFilters
              ? "fa-filter-circle-xmark"
              : "fa-filter"}
            title={engine.hasActiveFilters
              ? "No sequences match"
              : "Choose a filter to start"}
            message={engine.hasActiveFilters
              ? "Remove a filter or choose a different value."
              : "Matching sequences will appear here."}
          />
        {:else}
          <BrowsePanel
            {engine}
            layout="compact"
            showToolbar={false}
            showFilterBar={false}
          />
        {/if}
      </div>
    </section>
  </div>

  {#snippet footer()}
    <footer
      class="save-footer"
      class:first-filter-focus={!engine.hasActiveFilters}
      class:filter-picker-active={filterPickerOpen && engine.hasActiveFilters}
    >
      {#if filterPickerOpen && engine.hasActiveFilters}
        <div class="return-to-rule-action">
          <PanelButton
            variant="secondary"
            fullWidth
            onclick={() => (filterPickerOpen = false)}
          >
            <i class="fas fa-arrow-left" aria-hidden="true"></i>
            Return to rule
          </PanelButton>
        </div>
      {:else}
        <div class="cancel-action">
          <PanelButton variant="secondary" onclick={requestClose}>
            Cancel
          </PanelButton>
        </div>
        <p class="save-status">
          {#if !engine.hasActiveFilters}
            {firstFilterHint}
          {/if}
        </p>
        {#if engine.hasActiveFilters}
          <div class="save-action">
            <PanelButton
              variant="primary"
              disabled={!canSave}
              onclick={() => void save()}
            >
              <i
                class={`fas ${saving ? "fa-circle-notch fa-spin" : "fa-wand-magic-sparkles"}`}
                aria-hidden="true"
              ></i>
              {saving
                ? "Saving"
                : mode === "edit"
                  ? "Save rule"
                  : "Save Smart Collection"}
            </PanelButton>
          </div>
        {/if}
      {/if}
    </footer>
  {/snippet}
</BaseModal>

<BaseModal
  bind:open={discardConfirmOpen}
  size="sm"
  animation="pop"
  closeOnBackdrop={true}
  closeOnEscape={true}
  labelledBy="discard-smart-builder-title"
  class="smart-builder-discard-modal"
  onclose={() => (discardConfirmOpen = false)}
>
  {#snippet header()}
    <ModalHeader
      id="discard-smart-builder-title"
      title={mode === "edit" ? "Discard changes?" : "Discard this draft?"}
      icon="fa-triangle-exclamation"
      iconColor="var(--semantic-warning, #f59e0b)"
      showClose={false}
    />
  {/snippet}

  <p class="discard-message">
    {mode === "edit"
      ? "The rule will return to its last saved version."
      : "The filters and any name changes in this draft will be lost."}
  </p>

  {#snippet footer()}
    <div class="discard-actions">
      <PanelButton
        variant="secondary"
        onclick={() => (discardConfirmOpen = false)}
      >
        Keep editing
      </PanelButton>
      <PanelButton variant="primary" onclick={discardAndClose}>
        Discard
      </PanelButton>
    </div>
  {/snippet}
</BaseModal>

<style>
  :global(dialog.base-modal.smart-builder-modal[data-size="full"]) {
    width: min(94vw, 175rem);
    height: min(
      92dvh,
      calc(
        var(--viewport-height, 100dvh) - 2rem - env(safe-area-inset-top, 0px) -
          env(safe-area-inset-bottom, 0px)
      )
    );
    max-height: min(
      92dvh,
      calc(
        var(--viewport-height, 100dvh) - 2rem - env(safe-area-inset-top, 0px) -
          env(safe-area-inset-bottom, 0px)
      )
    );
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: clamp(1rem, 1.2vw, 1.5rem);
  }

  :global(dialog.smart-builder-modal .modal-content-wrapper) {
    height: 100%;
  }

  :global(dialog.smart-builder-modal .modal-body) {
    min-height: 0;
  }

  :global(dialog.smart-builder-modal .modal-body) {
    display: flex;
    overflow: hidden;
  }

  .workspace-shell {
    display: grid;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    grid-template-columns: clamp(22rem, 28%, 30rem) minmax(0, 1fr);
    overflow: hidden;
    background: var(--theme-panel-bg, #11131a);
    container-type: inline-size;
    container-name: smart-builder;
  }

  .rule-pane,
  .preview-pane {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex-direction: column;
    overflow: hidden;
  }

  .rule-pane {
    border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: color-mix(
      in srgb,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04)) 48%,
      var(--theme-panel-bg, #11131a)
    );
  }

  /* Before a rule exists there is nothing meaningful to preview. Give the
     first decision the full workspace; the split editor arrives with the
     first result set. */
  .workspace-shell.first-filter-focus {
    grid-template-columns: minmax(0, 1fr);
  }

  .workspace-shell.first-filter-focus .rule-pane {
    border-right: 0;
  }

  .workspace-shell.first-filter-focus .preview-pane {
    display: none;
  }

  .identity-setup {
    display: grid;
    flex: 0 0 auto;
    gap: 1rem;
    padding: 1rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #11131a) 94%,
      transparent
    );
  }

  /* Adding a filter is its own decision. The name remains unchanged but leaves
     the canvas until the user returns to the rule. */
  .workspace-shell.filter-picker-open:not(.first-filter-focus) .identity-setup {
    display: none;
  }

  .rule-work-area,
  .filter-picker-shell,
  .filter-picker-content {
    flex: 1;
    min-height: 0;
  }

  .rule-work-area,
  .filter-picker-shell {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* The applied rule stays readable beside/above every editor while the
     picker is open (audit D-8/X-11/C-17). */
  .picker-rule-strip {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #11131a) 94%,
      transparent
    );
  }

  .strip-count {
    color: var(--theme-text, white);
    font-size: var(--font-size-sm, 14px);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    white-space: nowrap;
  }

  .strip-chips {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-wrap: wrap;
    gap: var(--settings-spacing-sm, 8px);
  }

  .filter-picker-content {
    overflow: hidden;
  }

  .workspace-shell.first-filter-focus
    .filter-picker-content
    :global(.drill-screen.screen-chooser) {
    justify-content: safe center;
  }

  .rule-summary {
    display: flex;
    height: 100%;
    min-height: 0;
    flex-direction: column;
    gap: 1rem;
    padding: 1.25rem 1rem;
    overflow-y: auto;
    overscroll-behavior-y: contain;
  }

  .rule-copy {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.625rem;
  }

  .step-label {
    display: block;
    margin-bottom: 0.125rem;
    color: var(--theme-accent, #8b6cff);
    font-size: var(--font-size-compact, 12px);
    font-weight: 750;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .rule-copy h3,
  .preview-head h3 {
    margin: 0;
    color: var(--theme-text, white);
    font-size: var(--font-size-base, 16px);
    font-weight: 700;
  }

  .rule-copy p {
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-size: var(--font-size-sm, 14px);
    line-height: 1.4;
  }

  .applied-filters {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: var(--settings-spacing-sm, 8px);
  }

  .rule-actions {
    display: grid;
    gap: var(--settings-spacing-sm, 8px);
    padding-top: 0.25rem;
  }

  .mobile-preview-action,
  .mobile-preview-back {
    display: none;
  }

  .preview-pane {
    background: color-mix(in srgb, var(--theme-panel-bg, #11131a) 97%, black);
  }

  .preview-head {
    display: flex;
    min-height: 4rem;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b6cff) 5%,
      var(--theme-panel-bg, #11131a)
    );
  }

  .preview-head h3,
  .save-status {
    font-variant-numeric: tabular-nums;
  }

  .preview-title {
    min-width: 0;
  }

  .preview-mode {
    display: inline-flex;
    min-height: 2rem;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.65rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 999px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-size: var(--font-size-compact, 12px);
    font-weight: 650;
    white-space: nowrap;
  }

  .preview-mode i {
    color: var(--theme-accent, #8b6cff);
  }

  .preview-content {
    display: flex;
    flex: 1;
    width: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .preview-content > :global(.browse-panel),
  .preview-content > :global(.panel-state) {
    width: 100%;
    min-height: 0;
    flex: 1;
  }

  .save-footer {
    display: grid;
    grid-template-columns: auto minmax(8rem, 1fr) auto;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #11131a) 96%,
      transparent
    );
  }

  .save-footer.first-filter-focus {
    grid-template-columns: auto minmax(8rem, 1fr);
  }

  .save-footer.filter-picker-active {
    display: flex;
    justify-content: flex-start;
  }

  .return-to-rule-action {
    display: flex;
    width: min(100%, 14rem);
  }

  .save-status {
    min-width: 0;
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-size: var(--font-size-sm, 14px);
    line-height: 1.35;
    text-align: right;
  }

  .cancel-action,
  .save-action {
    display: flex;
  }

  .discard-message {
    margin: 0;
    padding: 1.5rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-sm, 14px);
    line-height: 1.55;
    text-align: center;
  }

  .discard-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .discard-actions :global(.panel-btn--primary) {
    border-color: var(--semantic-error, #ef4444);
    background: var(--semantic-error, #ef4444);
  }

  @media (max-width: 900px), (max-width: 1100px) and (max-height: 600px) {
    :global(dialog.base-modal.smart-builder-modal[data-size="full"]) {
      width: 100%;
      height: var(--viewport-height, 100dvh);
      max-height: var(--viewport-height, 100dvh);
      margin: 0;
      border: 0;
      border-radius: 0;
    }

    .workspace-shell {
      grid-template-columns: minmax(0, 1fr);
    }

    .rule-pane {
      border-right: 0;
    }

    .preview-pane {
      display: none;
    }

    .workspace-shell.mobile-preview-open .rule-pane {
      display: none;
    }

    .workspace-shell.mobile-preview-open .preview-pane {
      display: flex;
    }

    .mobile-preview-action,
    .mobile-preview-back {
      display: block;
    }
  }

  @media (max-width: 900px) {
    .rule-actions {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .mobile-preview-action :global(.panel-btn) {
      font-variant-numeric: tabular-nums;
    }
  }

  @media (min-width: 700px) and (max-width: 900px) and (min-height: 720px) {
    .workspace-shell:not(.first-filter-focus):not(.filter-picker-open) {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
    }

    .workspace-shell:not(.first-filter-focus):not(.filter-picker-open)
      .rule-pane {
      display: flex;
      grid-row: 1;
      overflow: visible;
      border-right: 0;
      border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    }

    .workspace-shell:not(.first-filter-focus):not(.filter-picker-open)
      .rule-work-area {
      flex: 0 0 auto;
      overflow: visible;
    }

    .workspace-shell:not(.first-filter-focus):not(.filter-picker-open)
      .rule-summary {
      display: grid;
      height: auto;
      grid-template-columns: auto minmax(0, 1fr) minmax(11rem, 14rem);
      align-items: center;
      gap: 1rem;
      padding: 0.75rem 1rem;
      overflow: visible;
    }

    .workspace-shell:not(.first-filter-focus):not(.filter-picker-open)
      .rule-actions {
      display: block;
      padding-top: 0;
    }

    .workspace-shell:not(.first-filter-focus):not(.filter-picker-open)
      .mobile-preview-action,
    .workspace-shell:not(.first-filter-focus):not(.filter-picker-open)
      .mobile-preview-back {
      display: none;
    }

    .workspace-shell:not(.first-filter-focus):not(.filter-picker-open)
      .preview-pane {
      display: flex;
      min-height: 0;
      grid-row: 2;
    }
  }

  /* Phones with usable height get the same rule-over-results stacking as the
     fold tier above — a "results" state that renders zero results behind a
     button was audit C-2. The rule keeps its vertical layout (the 3-column
     rule bar needs ≥700px). */
  @media (max-width: 699.98px) and (min-height: 640px) {
    .workspace-shell:not(.first-filter-focus):not(.filter-picker-open) {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
    }

    .workspace-shell:not(.first-filter-focus):not(.filter-picker-open)
      .rule-pane {
      display: flex;
      grid-row: 1;
      overflow: visible;
      border-right: 0;
      border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    }

    .workspace-shell:not(.first-filter-focus):not(.filter-picker-open)
      .rule-work-area {
      flex: 0 0 auto;
      overflow: visible;
    }

    .workspace-shell:not(.first-filter-focus):not(.filter-picker-open)
      .rule-summary {
      height: auto;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      overflow: visible;
    }

    .workspace-shell:not(.first-filter-focus):not(.filter-picker-open)
      .preview-pane {
      display: flex;
      min-height: 0;
      grid-row: 2;
    }

    /* Inline preview is already on screen — "back to filters" belongs to the
       full-screen preview mode only. The "Preview N" action stays as the
       door to that full-screen mode. */
    .workspace-shell:not(.first-filter-focus):not(.filter-picker-open):not(
        .mobile-preview-open
      )
      .mobile-preview-back {
      display: none;
    }
  }

  /* Short landscape (Z Fold cover, 960×412): stack sideways instead — the
     rule takes a bounded left column and the results use the rest. Vertical
     stacking would leave the preview a letterbox. */
  @media (min-width: 700px) and (max-width: 1100px) and (max-height: 600px) {
    .workspace-shell:not(.first-filter-focus):not(.filter-picker-open) {
      grid-template-columns: minmax(18rem, 24rem) minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
    }

    .workspace-shell:not(.first-filter-focus):not(.filter-picker-open)
      .rule-pane {
      border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    }

    .workspace-shell:not(.first-filter-focus):not(.filter-picker-open)
      .rule-summary {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      overflow-y: auto;
    }

    .workspace-shell:not(.first-filter-focus):not(.filter-picker-open)
      .rule-actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
    }

    .workspace-shell:not(.first-filter-focus):not(.filter-picker-open)
      .preview-pane {
      display: flex;
      min-height: 0;
    }

    .workspace-shell:not(.first-filter-focus):not(.filter-picker-open)
      .mobile-preview-action,
    .workspace-shell:not(.first-filter-focus):not(.filter-picker-open)
      .mobile-preview-back {
      display: none;
    }
  }

  /* Once the canvas is genuinely desktop-sized, adding a filter becomes a
     two-dimensional composer instead of being squeezed back into the rule
     rail. At 1440 the decision canvas gets the full modal. From 1920 upward,
     the catalog/editor stays capped and the live results absorb the surplus. */
  @media (min-width: 1100px) and (max-width: 1679.98px) and (min-height: 650px) {
    .workspace-shell.filter-picker-open:not(.first-filter-focus) {
      grid-template-columns: minmax(0, 1fr);
    }

    .workspace-shell.filter-picker-open:not(.first-filter-focus) .rule-pane {
      border-right: 0;
    }

    .workspace-shell.filter-picker-open:not(.first-filter-focus) .preview-pane {
      display: none;
    }
  }

  @media (min-width: 1680px) and (min-height: 650px) {
    .workspace-shell.first-filter-focus,
    .workspace-shell.filter-picker-open:not(.first-filter-focus) {
      grid-template-columns: clamp(72rem, 68%, 82rem) minmax(0, 1fr);
    }

    .workspace-shell.first-filter-focus .rule-pane {
      border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    }

    .workspace-shell.first-filter-focus .preview-pane {
      display: flex;
    }
  }

  @media (min-width: 780px) and (max-width: 1100px) and (max-height: 600px) {
    .rule-summary {
      display: grid;
      grid-template-columns:
        minmax(10rem, 14rem) minmax(0, 1fr)
        minmax(12rem, 15rem);
      align-items: center;
      gap: 1rem;
      padding: 0.75rem 1rem;
      overflow: hidden;
    }

    .rule-actions {
      align-content: center;
      align-self: stretch;
      margin-top: 0;
      padding-top: 0;
    }

    .filter-picker-content :global(.drill.sheet) {
      gap: 0.5rem;
      padding: 0.25rem 1rem 0.5rem;
    }

    .filter-picker-content :global(.drill-screen) {
      gap: 0.5rem;
    }

    .filter-picker-content :global(.drill-head h2) {
      font-size: 1.15rem;
    }

    /* Short-height density hides header hints EXCEPT on the multi-select
       screens — "tap several" is the only signal those editors stack, and it
       must survive exactly where the footer once said "choose one" (audit
       C-1). */
    .filter-picker-content
      :global(.drill-screen:not(.screen-loop, .screen-family) .drill-head p) {
      display: none;
    }

    .filter-picker-content :global(.screen-loop .drill-head p),
    .filter-picker-content :global(.screen-family .drill-head p) {
      font-size: var(--font-size-compact, 12px);
    }

    .filter-picker-content :global(.choice-tile) {
      height: 5.5rem;
      min-height: 5.5rem;
      max-height: 5.5rem;
      padding: 0.6rem 2rem 0.6rem 1rem;
      border-radius: 0.875rem;
    }
  }

  @media (min-width: 700px) and (max-width: 1100px) and (max-height: 520px) {
    :global(dialog.smart-builder-modal .modal-header) {
      gap: 0.625rem;
      padding: 0.5rem 0.75rem;
    }

    :global(dialog.smart-builder-modal .header-subtitle) {
      display: none;
    }

    :global(dialog.smart-builder-modal .header-title) {
      font-size: 1.1rem;
    }

    .filter-picker-content :global(.drill.sheet) {
      gap: 0.5rem;
      padding: 0.375rem 1rem 0.5rem;
    }

    .filter-picker-content :global(.choice-tile) {
      height: 6.5rem;
      min-height: 6.5rem;
      max-height: 6.5rem;
    }

    .save-footer,
    .save-footer.first-filter-focus {
      min-height: 3.5rem;
      padding: 0.375rem 0.75rem;
    }
  }

  @media (max-width: 560px) {
    :global(dialog.smart-builder-modal .close-btn) {
      width: var(--min-touch-target, 44px);
      height: var(--min-touch-target, 44px);
      min-width: var(--min-touch-target, 44px);
      min-height: var(--min-touch-target, 44px);
    }

    .identity-setup {
      gap: 0.75rem;
      padding: 0.75rem;
    }

    .identity-setup {
      gap: 0.625rem;
      padding: 0.625rem 0.75rem 0.25rem;
      border-bottom: 0;
      background: transparent;
    }

    .workspace-shell.first-filter-focus
      .filter-picker-content
      :global(.drill.sheet) {
      padding: 0.375rem 0.75rem 0.625rem;
    }

    .workspace-shell.first-filter-focus
      .filter-picker-content
      :global(.drill-screen) {
      gap: 0.625rem;
    }

    .workspace-shell.first-filter-focus
      .filter-picker-content
      :global(.drill-head h2) {
      font-size: 1.15rem;
    }

    .workspace-shell.first-filter-focus
      .filter-picker-content
      :global(.drill-head p) {
      font-size: 0.8rem;
    }

    .workspace-shell.first-filter-focus
      .filter-picker-content
      :global(.choice-tile) {
      min-height: 96px;
      padding-block: 0.625rem;
    }

    .workspace-shell.filter-picker-open:not(.first-filter-focus)
      .filter-picker-content
      :global(.drill.sheet) {
      gap: 0.5rem;
      padding: 0.375rem 0.75rem 0.625rem;
    }

    .workspace-shell.filter-picker-open:not(.first-filter-focus)
      .filter-picker-content
      :global(.drill-screen) {
      gap: 0.625rem;
    }

    .workspace-shell.filter-picker-open:not(.first-filter-focus)
      .filter-picker-content
      :global(.drill-head h2) {
      font-size: 1.1rem;
    }

    .workspace-shell.filter-picker-open:not(.first-filter-focus)
      .filter-picker-content
      :global(.drill-head p) {
      font-size: var(--font-size-compact, 12px);
    }

    .rule-summary {
      gap: 0.75rem;
      padding: 0.75rem;
    }

    .preview-head {
      padding-inline: 0.75rem;
    }

    .preview-mode {
      display: none;
    }

    .save-footer,
    .save-footer.first-filter-focus {
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 0.625rem;
      padding: 0.625rem 0.75rem
        calc(0.625rem + env(safe-area-inset-bottom, 0px));
    }

    .save-footer:not(.first-filter-focus) .save-status {
      display: none;
    }

    .cancel-action {
      grid-column: 1;
      grid-row: 1;
    }

    .save-action {
      min-width: 0;
      grid-column: 2;
      grid-row: 1;
    }

    .save-footer.first-filter-focus .save-status {
      grid-column: 2;
      grid-row: 1;
      font-size: var(--font-size-compact, 12px);
      text-align: right;
    }

    .save-footer.filter-picker-active {
      display: flex;
      padding: 0.5rem 0.75rem calc(0.5rem + env(safe-area-inset-bottom, 0px));
    }

    .return-to-rule-action {
      width: 100%;
    }

    .cancel-action :global(.panel-btn),
    .save-action :global(.panel-btn) {
      width: 100%;
    }

    .save-action :global(.panel-btn) {
      white-space: nowrap;
    }

    .discard-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .discard-actions :global(.panel-btn) {
      width: 100%;
    }
  }

  @media (min-width: 2600px) and (min-height: 720px) {
    :global(dialog.base-modal.smart-builder-modal[data-size="full"]) {
      width: 94vw;
      max-width: none;
      border-radius: 2rem;
      --font-size-compact: clamp(14px, 0.42vw, 18px);
      --font-size-min: clamp(16px, 0.46vw, 20px);
      --font-size-sm: clamp(17px, 0.48vw, 21px);
      --font-size-base: clamp(18px, 0.52vw, 22px);
      --font-size-lg: clamp(20px, 0.58vw, 25px);
      --min-touch-target: clamp(56px, 1.7vw, 68px);
    }

    .workspace-shell {
      --font-size-compact: clamp(14px, 0.42vw, 18px);
      --font-size-sm: clamp(17px, 0.48vw, 21px);
      --font-size-base: clamp(18px, 0.52vw, 22px);
      --font-size-md: var(--font-size-base);
      --font-size-lg: clamp(20px, 0.58vw, 25px);
      --font-size-xl: clamp(25px, 0.72vw, 30px);
      --font-size-2xl: clamp(30px, 0.86vw, 36px);
      --min-touch-target: clamp(56px, 1.7vw, 68px);
      grid-template-columns: 34rem minmax(0, 1fr);
    }

    .workspace-shell.first-filter-focus,
    .workspace-shell.filter-picker-open:not(.first-filter-focus) {
      grid-template-columns: clamp(84rem, 46vw, 104rem) minmax(0, 1fr);
    }

    :global(dialog.smart-builder-modal .modal-header) {
      gap: 1.25rem;
      padding: 1.7rem 2rem;
    }

    :global(dialog.smart-builder-modal .header-icon),
    :global(dialog.smart-builder-modal .close-btn) {
      width: 4rem;
      height: 4rem;
      min-width: 4rem;
      min-height: 4rem;
      border-radius: 1rem;
    }

    :global(dialog.smart-builder-modal .header-title) {
      font-size: 1.75rem;
    }

    :global(dialog.smart-builder-modal .header-subtitle) {
      margin-top: 0.3rem;
      font-size: var(--font-size-min, 18px);
    }

    .identity-setup,
    .rule-summary {
      padding: 1.5rem;
    }

    .preview-head,
    .save-footer {
      padding-inline: 2rem;
    }

    .save-footer {
      padding-block: 1.1rem;
    }

    .workspace-shell.first-filter-focus
      .filter-picker-content
      :global(.drill-head h2) {
      font-size: clamp(2rem, 1.15vw, 2.75rem);
    }

    .workspace-shell.first-filter-focus
      .filter-picker-content
      :global(.drill-head p) {
      font-size: clamp(1.1rem, 0.58vw, 1.4rem);
    }
  }
</style>
