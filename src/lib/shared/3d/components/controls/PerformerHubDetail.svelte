<script lang="ts">
  import { onDestroy } from "svelte";
  import { type PropBuild } from "@austencloud/scene-3d";
  import {
    CHARACTER_DEFINITIONS,
    getCharacterModelPath,
    prepareCharacterForDisplay,
    type CharacterId,
  } from "$lib/shared/3d/domain/character-model";
  import { getViewer3DContext } from "../../context/viewer-3d-context";
  import { getPerformerColor } from "../../constants/performer-colors";
  import { getErrorHandler } from "$lib/shared/application/get-error-handler";
  import PerformerPropSizeSlider from "./PerformerPropSizeSlider.svelte";
  import CharacterSelectWorkspace from "./character-select/CharacterSelectWorkspace.svelte";
  import { resolveCharacterPreviewPerformer } from "./character-select/character-preview-source";
  import ConfirmDialog from "$lib/shared/foundation/ui/ConfirmDialog.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import PerformerSequencePanel from "./PerformerSequencePanel.svelte";
  import PerformerIdentityHeader from "./PerformerIdentityHeader.svelte";
  import EffortPalette from "$lib/shared/phrase-effort-lab/components/EffortPalette.svelte";
  import EffectsSettingsPanel from "./EffectsSettingsPanel.svelte";
  import PlanesPopover from "../PlanesPopover.svelte";
  import ScenePropPicker from "./ScenePropPicker.svelte";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { EffortId } from "$lib/shared/effort/domain/effort-types";
  import {
    reportViewerControlChange,
    type ViewerControlSink,
  } from "$lib/shared/sequence-viewer/domain/viewer-control-analytics";
  import type {
    PerformerEditSink,
    PerformerHubEdit,
    PerformerHubTab,
  } from "./performer-hub-types";
  import { resolvePerformerHubEmptyScope } from "./performer-hub-empty-scope";

  interface Props {
    onSettingChange?: ViewerControlSink;
    /**
     * Supplied by a host that owns performer state (the Director, whose
     * performers are a projection of its film document). When present the hub
     * routes parameter changes here instead of writing them onto the manager.
     */
    onPerformerEdit?: PerformerEditSink;
    activeTab?: PerformerHubTab;
    showTabBar?: boolean;
  }
  let {
    onSettingChange,
    onPerformerEdit,
    activeTab = $bindable("prop"),
    showTabBar = true,
  }: Props = $props();

  const viewer = getViewer3DContext();
  const allPerformers = $derived(viewer.performerManager.performers);
  const selectedIndices = $derived(viewer.selectedPerformerIndices);
  const selectedPerformers = $derived(
    selectedIndices.flatMap((index) => {
      const selected = allPerformers[index];
      return selected ? [selected] : [];
    })
  );
  const isAllMode = $derived(viewer.isAllPerformersSelected);
  const isMultiMode = $derived(selectedPerformers.length > 1 && !isAllMode);
  const performer = $derived(
    viewer.primaryPerformerIndex !== null
      ? (allPerformers[viewer.primaryPerformerIndex] ?? null)
      : null
  );
  const previewPerformer = $derived(
    resolveCharacterPreviewPerformer(
      allPerformers,
      viewer.primaryPerformerIndex
    )
  );
  const previewPerformerNumber = $derived(
    previewPerformer
      ? Math.max(1, allPerformers.indexOf(previewPerformer) + 1)
      : 1
  );

  const performerColor = $derived(
    viewer.primaryPerformerIndex !== null
      ? getPerformerColor(viewer.primaryPerformerIndex)
      : "var(--theme-accent)"
  );
  const canRemove = $derived(
    selectedPerformers.length > 0 &&
      selectedPerformers.length < allPerformers.length
  );

  const characterDefinition = $derived(
    CHARACTER_DEFINITIONS.find((item) => item.id === performer?.characterId) ??
      CHARACTER_DEFINITIONS[0]
  );
  // Resolved performer name: user-assigned override falls back to the character
  // model's name. This is what the editable header field shows.
  const performerName = $derived(
    isMultiMode || isAllMode
      ? `${selectedPerformers.length} performers`
      : (performer?.displayName ?? characterDefinition?.name ?? "—")
  );

  const sequence = $derived.by(() => {
    const first = selectedPerformers[0]?.loadedSequence ?? null;
    return selectedPerformers.every(
      (item) => item.loadedSequence?.id === first?.id
    )
      ? first
      : null;
  });
  const hasAnySequence = $derived(
    selectedPerformers.some((item) => item.loadedSequence !== null)
  );
  const sequenceWord = $derived(
    sequence?.word ??
      sequence?.name ??
      (hasAnySequence ? "Mixed sequences" : null)
  );
  const sequenceSteps = $derived(sequence?.steps?.length ?? null);

  const currentCharacterId = $derived.by<CharacterId | null>(() => {
    const first = selectedPerformers[0]?.characterId;
    if (!first) return null;

    return selectedPerformers.every((item) => item.characterId === first)
      ? first
      : null;
  });

  async function pickCharacter(id: CharacterId): Promise<void> {
    cancelCharacterSelectionIntent();
    if (pendingCharacterId === id) return;
    if (currentCharacterId === id) {
      characterSelectionRequest++;
      pendingCharacterId = null;
      return;
    }

    const selectionRequest = ++characterSelectionRequest;
    pendingCharacterId = id;
    try {
      await prepareCharacterSelection(id);
      if (selectionRequest !== characterSelectionRequest) return;
      pendingCharacterId = null;

      const previous = currentCharacterId;
      const applied = onPerformerEdit
        ? onPerformerEdit({
            performerIndex: viewer.primaryPerformerIndex,
            performerIndices: selectedIndices,
            field: "characterId",
            value: id,
          })
        : viewer.setCharacterScoped(id);
      if (!applied) return;
      reportViewerControlChange(
        onSettingChange,
        "viewer_3d_performer",
        "character",
        previous,
        id
      );
    } catch (caught) {
      if (selectionRequest !== characterSelectionRequest) return;
      pendingCharacterId = null;
      const failure =
        caught instanceof Error ? caught : new Error(String(caught));
      getErrorHandler().showUserError({
        message:
          "That character could not load. Your current character is still active.",
        technicalDetails: failure.message,
        error: failure,
        severity: "warning",
        context: {
          module: "3d",
          tab: "performer-character",
          action: "loadCharacter",
        },
      });
    }
  }

  let pendingCharacterId = $state<CharacterId | null>(null);
  let characterSelectionRequest = 0;
  let characterIntentTimer: ReturnType<typeof setTimeout> | null = null;

  function prepareCharacterSelection(id: CharacterId): Promise<void> {
    return prepareCharacterForDisplay(getCharacterModelPath(id));
  }

  function queueCharacterSelectionIntent(id: CharacterId): void {
    cancelCharacterSelectionIntent();
    characterIntentTimer = setTimeout(() => {
      characterIntentTimer = null;
      void prepareCharacterSelection(id).catch(() => {
        // Prewarming is opportunistic. A real click reports an earned failure.
      });
    }, 120);
  }

  function cancelCharacterSelectionIntent(): void {
    if (characterIntentTimer === null) return;
    clearTimeout(characterIntentTimer);
    characterIntentTimer = null;
  }

  onDestroy(() => {
    cancelCharacterSelectionIntent();
    characterSelectionRequest++;
  });

  // ─── Tabs ───
  const ALL_TABS: { id: PerformerHubTab; label: string; icon: string }[] = [
    { id: "character", label: "Character", icon: "fa-user" },
    { id: "sequence", label: "Sequence", icon: "fa-film" },
    { id: "prop", label: "Prop", icon: "fa-shapes" },
    { id: "planes", label: "Planes", icon: "fa-layer-group" },
    { id: "effort", label: "Effort", icon: "fa-gauge-high" },
    { id: "effects", label: "Effects", icon: "fa-wand-sparkles" },
  ];

  const TABS = ALL_TABS;
  const tabIndex = $derived(TABS.findIndex((t) => t.id === activeTab));

  // None is a real selection state. Scoped writes drop every edit then, so the
  // header says so and the hub locks the tabs that would otherwise swallow
  // clicks.
  const emptyScope = $derived(
    resolvePerformerHubEmptyScope(activeTab, selectedPerformers.length)
  );

  function selectAllFromEmptyScope(): void {
    viewer.selectAllPerformers();
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_performer",
      "scope",
      "none",
      "all"
    );
  }

  function selectTab(tab: PerformerHubTab): void {
    const previous = activeTab;
    activeTab = tab;
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_performer",
      "tab",
      previous,
      tab
    );
  }

  function handleTabKeydown(e: KeyboardEvent) {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (tabIndex + dir + TABS.length) % TABS.length;
    const nextTab = TABS[next];
    if (nextTab) {
      selectTab(nextTab.id);
      const btn = (e.currentTarget as HTMLElement).querySelector<HTMLElement>(
        `#hub-tab-${nextTab.id}`
      );
      btn?.focus();
    }
  }

  // ─── Prop ───
  const currentProp = $derived.by<PropType | null>(() => {
    const first = selectedPerformers[0]?.effectiveProp;
    if (!first) return viewer.defaultSettings.prop;

    return selectedPerformers.every((item) => item.effectiveProp === first)
      ? first
      : null;
  });

  const currentPropBuild = $derived.by<PropBuild | undefined>(() => {
    const first = selectedPerformers[0]?.effectivePropBuild;
    if (!first) return undefined;
    const serialized = JSON.stringify(first);
    return selectedPerformers.every(
      (item) => JSON.stringify(item.effectivePropBuild) === serialized
    )
      ? first
      : undefined;
  });
  const propSizeMixed = $derived.by(() => {
    const first = selectedPerformers[0]?.settings.staffLengthCm ?? 81;
    return selectedPerformers.some(
      (item) => (item.settings.staffLengthCm ?? 81) !== first
    );
  });

  /**
   * Routes one parameter change to the host when it owns performer state, and
   * to the manager otherwise. Returns false when the host rejected the edit,
   * so the caller skips reporting a change that did not happen.
   */
  function writeParameter(
    edit: Omit<PerformerHubEdit, "performerIndex">,
    applyDirect: () => boolean
  ): boolean {
    if (onPerformerEdit) {
      return onPerformerEdit({
        ...edit,
        performerIndex: viewer.primaryPerformerIndex,
        performerIndices: selectedIndices,
      } as PerformerHubEdit);
    }
    return applyDirect();
  }

  function handlePropSelect(propType: PropType): void {
    const previous = currentProp;
    if (
      !writeParameter({ field: "prop", value: propType }, () =>
        viewer.setPropScoped(propType)
      )
    )
      return;
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_performer",
      "prop_type",
      previous,
      propType
    );
  }

  function handlePropBuildChange(patch: Partial<PropBuild>): void {
    writeParameter({ field: "propBuild", value: patch }, () =>
      viewer.mergePropBuildScoped(patch)
    );
  }

  // ─── Effort ───
  const currentEffort = $derived.by<EffortId | null>(() => {
    const first = selectedPerformers[0]?.effectiveEffortId;
    if (!first) return viewer.defaultSettings.effortId;

    // All Performers writes an override to every performer. The palette must
    // read those effective values too; reading the viewer default left Linear
    // highlighted while every performer visibly used another effort.
    return selectedPerformers.every((item) => item.effectiveEffortId === first)
      ? first
      : null;
  });

  function handleEffortSelect(effortId: EffortId) {
    const previous = currentEffort;
    if (
      !writeParameter({ field: "effort", value: effortId }, () =>
        viewer.setEffortScoped(effortId)
      )
    )
      return;
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_performer",
      "effort",
      previous,
      effortId
    );
  }

  function handlePropSizeChange(cm: number) {
    writeParameter({ field: "staffLengthCm", value: cm }, () =>
      viewer.setStaffLengthScoped(cm)
    );
  }

  function removePerformer(): void {
    const previous = allPerformers.length;
    viewer.removePerformerFromUI();
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_performer",
      "performer_count",
      previous,
      viewer.performerManager.performers.length
    );
  }

  let removeConfirmOpen = $state(false);

  function chooseSequence(sequenceData: SequenceData): void {
    const previous = sequenceWord ?? null;
    viewer.loadSequenceScoped(sequenceData);
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_performer",
      "sequence_loaded",
      previous,
      sequenceData.word ?? sequenceData.name
    );
  }

  function clearSequence(): void {
    viewer.clearSequenceScoped();
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_performer",
      "sequence_loaded",
      true,
      false
    );
  }
</script>

<div
  class="hub-detail"
  style:--performer-color={performerColor}
  style:--pop-accent={performerColor}
>
  <div class="accent-strip" aria-hidden="true"></div>

  <PerformerIdentityHeader
    {performer}
    performerCount={allPerformers.length}
    selectedCount={selectedPerformers.length}
    {isAllMode}
    {performerColor}
    {sequenceWord}
    {sequenceSteps}
    {canRemove}
    onRemove={() => (removeConfirmOpen = true)}
    emptyHint={emptyScope?.message ?? null}
    onSelectAll={selectAllFromEmptyScope}
    {onSettingChange}
  />

  <div class="header-divider" aria-hidden="true"></div>

  <div class="tab-content">
    <div
      class="scoped-panes"
      class:locked={emptyScope?.locksTab}
      inert={emptyScope?.locksTab ?? false}
    >
      {#if activeTab === "character"}
        <div
          id="hub-panel-character"
          class="tab-pane active"
          role="tabpanel"
          aria-labelledby="hub-tab-character"
        >
          <div class="character-section">
            <CharacterSelectWorkspace
              {currentCharacterId}
              {pendingCharacterId}
              {performerColor}
              {previewPerformer}
              {previewPerformerNumber}
              onIntent={queueCharacterSelectionIntent}
              onCancelIntent={cancelCharacterSelectionIntent}
              onSelect={(id) => void pickCharacter(id)}
            />
          </div>
        </div>
      {/if}

      {#if activeTab === "sequence"}
        <div
          id="hub-panel-sequence"
          class="tab-pane active"
          role="tabpanel"
          aria-labelledby="hub-tab-sequence"
        >
          <PerformerSequencePanel
            {performerName}
            {sequenceWord}
            {sequenceSteps}
            hasSequence={hasAnySequence}
            onSelect={chooseSequence}
            onClear={clearSequence}
          />
        </div>
      {/if}

      {#if activeTab === "prop"}
        <div
          id="hub-panel-prop"
          class="tab-pane active"
          role="tabpanel"
          aria-labelledby="hub-tab-prop"
        >
          <div class="prop-section">
            <ScenePropPicker
              {currentProp}
              build={currentPropBuild}
              onBuildChange={handlePropBuildChange}
              accentColor={performerColor}
              onSelect={handlePropSelect}
            />

            <!-- The slider reads its displayed size from one performer; in
               All-Performers mode that is the first. Writing always goes
               through handlePropSizeChange so the scope and the host sink
               apply in both modes. -->
            {#if performer ?? selectedPerformers[0]}
              <PerformerPropSizeSlider
                performer={performer ?? selectedPerformers[0]!}
                mixed={propSizeMixed}
                onSizeChange={handlePropSizeChange}
                {onSettingChange}
              />
            {/if}
          </div>
        </div>
      {/if}

      {#if activeTab === "planes"}
        <div
          id="hub-panel-planes"
          class="tab-pane active"
          role="tabpanel"
          aria-labelledby="hub-tab-planes"
        >
          <div class="planes-section">
            <PlanesPopover {onSettingChange} />
          </div>
        </div>
      {/if}

      {#if activeTab === "effort"}
        <div
          id="hub-panel-effort"
          class="tab-pane active"
          role="tabpanel"
          aria-labelledby="hub-tab-effort"
        >
          <div class="effort-section">
            <EffortPalette
              selectedEffort={currentEffort}
              onSelect={handleEffortSelect}
            />
          </div>
        </div>
      {/if}

      {#if activeTab === "effects"}
        <div
          id="hub-panel-effects"
          class="tab-pane active"
          role="tabpanel"
          aria-labelledby="hub-tab-effects"
        >
          <div class="effects-section">
            <EffectsSettingsPanel
              performer={selectedPerformers.length === 1 ? performer : null}
              performers={selectedPerformers.length > 1
                ? selectedPerformers
                : null}
              presentation="performer-hub"
              onEffectEdit={(effect) =>
                writeParameter({ field: "effect", value: effect }, () =>
                  viewer.setEffectScoped(effect)
                )}
              {onSettingChange}
            />
          </div>
        </div>
      {/if}
    </div>
  </div>

  {#if showTabBar}
    <div class="tab-divider" aria-hidden="true"></div>

    <!-- ─── Tab bar (bottom-anchored) ─── -->
    <div
      class="tab-bar"
      role="tablist"
      tabindex="-1"
      aria-label="Performer controls"
      style:--active-index={tabIndex}
      style:--tab-count={TABS.length}
      onkeydown={handleTabKeydown}
    >
      <div class="tab-indicator" aria-hidden="true"></div>
      {#each TABS as tab}
        <button
          id="hub-tab-{tab.id}"
          class="tab-btn"
          class:active={activeTab === tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          tabindex={activeTab === tab.id ? 0 : -1}
          aria-controls="hub-panel-{tab.id}"
          onclick={() => selectTab(tab.id)}
        >
          <i class="fas {tab.icon}" aria-hidden="true"></i>
          <span class="tab-label">{tab.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<ConfirmDialog
  bind:isOpen={removeConfirmOpen}
  title={selectedPerformers.length > 1
    ? `Remove ${selectedPerformers.length} performers?`
    : `Remove ${performerName}?`}
  message={selectedPerformers.length > 1
    ? "This removes the selected performers from the scene. You can undo the change from the viewer."
    : "This removes the performer from the scene. You can undo the change from the viewer."}
  confirmText={selectedPerformers.length > 1
    ? "Remove performers"
    : "Remove performer"}
  cancelText={selectedPerformers.length > 1
    ? "Keep performers"
    : "Keep performer"}
  variant="danger"
  onConfirm={removePerformer}
  onCancel={() => (removeConfirmOpen = false)}
/>

<style>
  .hub-detail {
    width: 100%;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    container-type: inline-size;
    /* Fills whatever surface mounts it — the inspector panel or the mobile
       sheet — so .tab-content has a bounded height to scroll inside. The hub
       owns the only scroller on this axis; its host must not add a second. */
    flex: 1 1 auto;
    max-height: 100%;
    min-height: 0;
  }

  .accent-strip {
    height: 2px;
    background: linear-gradient(
      90deg,
      var(--performer-color),
      color-mix(in srgb, var(--performer-color) 20%, transparent)
    );
  }

  .header-divider {
    height: 1px;
    margin: 0 14px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--performer-color) 22%, transparent),
      color-mix(in srgb, var(--theme-text) 4%, transparent)
    );
  }

  .tab-divider {
    height: 1px;
    margin: 0 14px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--theme-text) 6%, transparent),
      color-mix(in srgb, var(--theme-text) 2%, transparent)
    );
  }

  /* ─── Tab bar (6 columns) ─── */
  .tab-bar {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--tab-count, 6), 1fr);
    margin: 0 10px 8px;
    padding: 3px;
    background: var(--surface-inset-deep);
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--theme-text) 4%, transparent);
  }

  .tab-indicator {
    position: absolute;
    top: 3px;
    bottom: 3px;
    width: calc((100% - 6px) / var(--tab-count, 6));
    left: calc(3px + var(--active-index) * (100% - 6px) / var(--tab-count, 6));
    border-radius: 7px;
    background: color-mix(
      in srgb,
      var(--performer-color) 20%,
      var(--theme-card-bg)
    );
    box-shadow:
      0 1px 4px var(--surface-inset-deep),
      0 0 16px color-mix(in srgb, var(--performer-color) 12%, transparent);
    transition: left var(--transition-normal);
    pointer-events: none;
    z-index: 0;
  }

  .tab-btn {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: 44px;
    padding: 8px 2px;
    border-radius: 7px;
    border: none;
    background: transparent;
    color: var(--theme-text-dim);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition:
      color var(--transition-fast),
      transform var(--transition-fast);
    -webkit-tap-highlight-color: transparent;
  }

  .tab-btn:hover:not(.active) {
    color: var(--theme-text);
  }

  .tab-btn.active {
    color: var(--performer-color);
  }

  .tab-btn i {
    font-size: 14px;
  }

  .tab-label {
    letter-spacing: 0.02em;
  }

  .tab-content {
    flex: 1 1 auto;
    padding: 12px 14px 14px;
    overflow-y: auto;
    min-height: 0;
    overscroll-behavior: contain;
  }

  .accent-strip,
  .header-divider,
  .tab-divider,
  .tab-bar,
  .hub-detail > :global(.header) {
    flex: none;
  }

  .scoped-panes.locked {
    opacity: 0.4;
    filter: saturate(0.4);
  }

  .tab-pane {
    animation: pane-in var(--duration-fast) var(--ease-out);
  }

  @keyframes pane-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .section-label {
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: color-mix(in srgb, var(--theme-text-dim) 72%, transparent);
    margin-bottom: 8px;
  }

  .character-section {
    container-type: inline-size;
  }

  .prop-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    container-type: inline-size;
  }

  .planes-section :global(.cascade-badge) {
    display: none;
  }

  .effort-section {
    --min-touch-target: 44px;
  }

  .effort-section :global(.effort-palette) {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }

  .effort-section :global(.palette-btn) {
    min-width: 0;
  }

  .effects-section {
    --theme-card-bg: transparent;
    --min-touch-target: 44px;
    container-type: inline-size;
  }

  .effects-section :global(.effects-settings) {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 0;
    background: transparent;
    border: none;
  }

  .effects-section :global(h3) {
    display: none;
  }

  .effects-section :global(.effect-chips) {
    order: initial;
  }

  .effects-section :global(.sub-control),
  .effects-section :global(.intensity-control),
  .effects-section :global(.active-count) {
    margin-top: 0;
  }

  /* ─── Focus-visible ─── */
  button:focus-visible {
    outline: 2px solid var(--performer-color, var(--theme-accent));
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .tab-indicator {
      transition: none;
    }
    .tab-pane {
      animation: none;
    }
  }

  /* Six side-by-side icon + label pairs overflow their 1/6 column below this
     width ("Character" ran into the Sequence icon), so stack them. */
  @container (max-width: 620px) {
    .tab-btn {
      flex-direction: column;
      gap: 2px;
      padding: 6px 2px;
    }

    .tab-label {
      font-size: 12px;
      letter-spacing: 0;
    }
  }

  @container (max-width: 460px) {
    .tab-label {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .tab-btn i {
      font-size: 17px;
    }
  }
</style>
