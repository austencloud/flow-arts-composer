<script lang="ts">
  import { onMount, tick } from "svelte";
  import { motionDuration } from "$lib/shared/transitions/motion";
  import CreatePanelDrawer from "$lib/features/create/shared/components/CreatePanelDrawer.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import PanelState from "$lib/shared/components/panel/PanelState.svelte";
  import SequencePickerModal from "$lib/shared/components/sequence-picker/SequencePickerModal.svelte";
  import PanelHeader from "$lib/shared/create/components/PanelHeader.svelte";
  import GeneratePanel from "$lib/features/create/generate/components/GeneratePanel.svelte";
  import type { SetupSnapshot } from "$lib/features/create/generate/domain/setup-snapshot";
  import type { GenerationAnimationTarget } from "$lib/features/create/generate/state/generate-actions.svelte";
  import { createSequenceState } from "$lib/features/create/shared/state/sequence-state-orchestrator.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import TunnelArtSettings from "$lib/shared/sequence-viewer/components/art-settings/TunnelArtSettings.svelte";
  import TunnelArtView from "$lib/shared/sequence-viewer/tunnel/TunnelArtView.svelte";
  import {
    copyOpsLabel,
    type GeneratorTunnelSourceProvenance,
  } from "$lib/shared/sequence-viewer/tunnel/tunnel-composition";
  import { FOLD_OPTIONS } from "$lib/shared/sequence-viewer/tunnel/tunnel-config";
  import { TunnelViewController } from "$lib/shared/sequence-viewer/tunnel/tunnel-view-controller.svelte";
  import TkaLabel from "$lib/shared/components/TkaLabel.svelte";
  import { getTunnelCreatorContext } from "../context/tunnel-creator-context";
  import TunnelPerformerRoster from "./TunnelPerformerRoster.svelte";
  import TunnelRelationshipEditor from "./TunnelRelationshipEditor.svelte";
  import TunnelStageFormationSettings from "./TunnelStageFormationSettings.svelte";
  import ShapeMatrixTunnelSourcePicker from "./ShapeMatrixTunnelSourcePicker.svelte";
  import type { ModeRealization } from "$lib/shared/shape-matrix/services/build-mode-realizations";
  import type { SequenceSource } from "$lib/shared/browse/engine/types";
  import {
    canInlineTunnelInspector,
    resolveTunnelWorkspaceMode,
  } from "../domain/tunnel-workspace-layout";

  let {
    onOpenLibrary,
    collectionCount = 0,
  }: {
    onOpenLibrary: () => void;
    collectionCount?: number;
  } = $props();

  type TunnelInspector = "settings" | "pairing" | "generation";

  const creator = getTunnelCreatorContext();
  let syncingGenerationSequence = false;
  let syncedGenerationSource = $state<string | null>(null);
  let generateCurrentRecipe = $state<(() => Promise<void>) | null>(null);
  let captureCurrentSetup = $state<(() => SetupSnapshot) | null>(null);
  let applyGenerationSetup = $state<((setup: SetupSnapshot) => void) | null>(
    null
  );
  type GenerationCardRef = {
    prepareGenerationAnimation: (
      performerId: string,
      stepCount: number
    ) => void;
    clearGenerationAnimation: (performerId: string) => void;
  };
  let performerRoster: GenerationCardRef | undefined = $state();
  const generationSequenceState = createSequenceState({
    onCurrentSequenceChange(sequence) {
      if (syncingGenerationSequence || !sequence || !creator.generationTargetId)
        return;
      const setup = captureCurrentSetup?.();
      const provenance: GeneratorTunnelSourceProvenance | undefined = setup
        ? {
            kind: "generator-recipe",
            version: 1,
            setup: setup as unknown as GeneratorTunnelSourceProvenance["setup"],
          }
        : undefined;
      creator.setPerformerSequence(
        creator.generationTargetId,
        sequence,
        "generated",
        {
          sourceSequenceId: sequence.id,
          ...(provenance ? { provenance } : {}),
        }
      );
    },
  });
  let performerDisplays = $state<
    Record<
      string,
      {
        sequence: SequenceData | null;
        stageTransformLabel: string | null;
        generatedInstanceCount: number;
        stageArms: number[];
      }
    >
  >({});
  let activePerformerStepIndices = $state<Record<string, number>>({});
  const controller = new TunnelViewController({
    getSequence: () => creator.leadSequence,
    getComposition: () =>
      creator.previewCompositionWithFormation(creator.initialFormation),
    onLayersChange: (layers) => {
      const next: typeof performerDisplays = {};
      for (const layer of layers) {
        const current = next[layer.performerId];
        next[layer.performerId] = {
          sequence: current?.sequence ?? layer.performerSequence,
          stageTransformLabel:
            current?.stageTransformLabel ??
            (layer.formationOps.length
              ? copyOpsLabel(layer.formationOps)
              : null),
          generatedInstanceCount: (current?.generatedInstanceCount ?? 0) + 1,
          stageArms: [...(current?.stageArms ?? []), layer.arm],
        };
      }
      performerDisplays = next;
    },
    visibilityManager: creator.presentation.visibility,
    persistViewState: false,
  });
  creator.presentation.attachController(controller);

  let rootWidth = $state(1200);
  let rootHeight = $state(800);
  let reduceMotion = $state(false);
  let inspectorColumn = $state<TunnelInspector | null>(null);
  let shapeMatrixTarget = $state<string | null>(null);

  const compact = $derived(rootWidth < 720);
  const workspaceMode = $derived(
    resolveTunnelWorkspaceMode({ width: rootWidth, height: rootHeight })
  );
  const shortLandscape = $derived(workspaceMode === "short-landscape");
  const canInlineInspector = $derived(
    canInlineTunnelInspector({ width: rootWidth, height: rootHeight })
  );
  const settingsOpen = $derived(creator.activePanel === "settings");
  const pairingOpen = $derived(creator.activePanel === "pairing");
  const generationOpen = $derived(creator.activePanel === "generation");
  const activeInlineInspector: TunnelInspector | null = $derived(
    canInlineInspector
      ? settingsOpen
        ? "settings"
        : pairingOpen
          ? "pairing"
          : generationOpen
            ? "generation"
            : null
      : null
  );
  const generationTargetLabel = $derived(
    creator.performerSlots.find(
      (slot) => slot.id === creator.generationTargetId
    )?.label ?? "Performer"
  );
  const leftPropType = $derived(creator.presentation.leftPropType as PropType);
  const rightPropType = $derived(
    creator.presentation.rightPropType as PropType
  );
  const propType = $derived(leftPropType ? String(leftPropType) : "staff");
  const generationAnimationTarget: GenerationAnimationTarget = {
    clear() {
      const targetId = creator.generationTargetId;
      if (targetId) performerRoster?.clearGenerationAnimation(targetId);
    },
    prepare(stepCount) {
      const targetId = creator.generationTargetId;
      if (targetId) {
        performerRoster?.prepareGenerationAnimation(targetId, stepCount);
      }
    },
  };

  $effect(() => {
    controller.active = creator.leadSequence !== null;
  });

  $effect(() => {
    creator.setFormation(controller.config);
  });

  // Rehydrate the generator scratch sequence after draft restoration so the
  // reopened recipe belongs to the same performer and previews their source.
  $effect(() => {
    const targetId = creator.generationTargetId;
    if (!targetId) {
      syncedGenerationSource = null;
      return;
    }

    const performer = creator.performerSlots.find(
      (slot) => slot.id === targetId
    )?.performer;
    const sequence =
      performer?.source.kind === "independent"
        ? performer.source.sequence
        : null;
    const sourceKey = `${targetId}:${sequence?.id ?? "empty"}`;
    if (sourceKey === syncedGenerationSource) return;

    syncedGenerationSource = sourceKey;
    syncingGenerationSequence = true;
    generationSequenceState.setCurrentSequence(sequence);
    queueMicrotask(() => (syncingGenerationSequence = false));
  });

  $effect(() => {
    if (activeInlineInspector) {
      inspectorColumn = activeInlineInspector;
      return;
    }
    if (settingsOpen || pairingOpen || generationOpen) {
      inspectorColumn = null;
      return;
    }
    const timer = setTimeout(
      () => (inspectorColumn = null),
      motionDuration(280)
    );
    return () => clearTimeout(timer);
  });

  onMount(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => (reduceMotion = media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  });

  function openSettings(): void {
    creator.openWorkspacePanel("settings");
  }

  function openPairing(targetId: string): void {
    creator.openPairingPanel(targetId);
  }

  function generatorSetupFor(targetId: string): SetupSnapshot | null {
    const performer = creator.performerSlots.find(
      (slot) => slot.id === targetId
    )?.performer;
    if (performer?.source.kind !== "independent") return null;
    const provenance = performer.source.provenance;
    return provenance?.kind === "generator-recipe"
      ? (provenance.setup as unknown as SetupSnapshot)
      : null;
  }

  async function openGeneration(targetId: string): Promise<void> {
    if (!creator.openGenerationPanel(targetId)) return;
    await tick();
    const setup = generatorSetupFor(targetId);
    if (setup) applyGenerationSetup?.(setup);
  }

  async function generatePerformer(targetId: string): Promise<void> {
    if (!creator.selectGenerationTarget(targetId)) return;
    await tick();
    const setup = generatorSetupFor(targetId);
    if (setup) applyGenerationSetup?.(setup);
    await generateCurrentRecipe?.();
  }

  function selectPickedSequence(
    sequence: Parameters<typeof creator.setLeadSequence>[0],
    source: SequenceSource
  ): void {
    if (creator.pickerTarget) {
      creator.setPerformerSequence(creator.pickerTarget, sequence, "picked", {
        sourceSequenceId: sequence.id,
        provenance: {
          kind: "library-sequence",
          version: 1,
          sequenceId: sequence.id,
          scope: source === "my-library" ? "personal" : "public",
        },
      });
    }
  }

  function selectShapeMatrixRealization(realization: ModeRealization): void {
    if (!shapeMatrixTarget) return;
    creator.setPerformerSequence(
      shapeMatrixTarget,
      realization.source.sequence,
      "picked",
      {
        sourceSequenceId: realization.source.sourceSequenceId,
        provenance: realization.source.provenance,
      }
    );
  }

  function changeProp(prop: PropType): void {
    creator.presentation.setPropType(prop);
  }

  function changeCastCount(count: number): void {
    const projectedStageCount =
      creator.renderedInstanceCount +
      Math.max(0, count - creator.authoredPerformerCount);
    if (projectedStageCount > controller.formationSlotCount) {
      const multiplier =
        (controller.mirror ? 2 : 1) * (controller.flip ? 2 : 1);
      const nextFold = FOLD_OPTIONS.find(
        (fold) => fold * multiplier >= projectedStageCount
      );
      if (nextFold) controller.setFold(nextFold);
      creator.setFormation(controller.config);
    }
    creator.setPerformerCount(count);
  }
</script>

{#snippet stageFormationContent(dense: boolean)}
  <TunnelStageFormationSettings {creator} {controller} {dense} />
{/snippet}

{#snippet settingsPanel(isMobile: boolean, layout: "bottom" | "sidebar")}
  <div class="drawer-panel settings-panel">
    <PanelHeader
      title="Stage settings"
      subtitle="Formation, appearance, and playback"
      {isMobile}
      onClose={creator.closeWorkspacePanel}
    />
    <div class="drawer-scroll themed-scrollbar">
      <TunnelArtSettings
        {controller}
        {layout}
        bottomStartsOpen={isMobile}
        onExport={() => {}}
        showExport={false}
        showTitle={false}
        bpm={creator.presentation.bpm}
        playbackMode={creator.presentation.playbackMode}
        isPlaying={creator.presentation.playing}
        onBpmChange={creator.presentation.setBpm}
        onPlaybackModeChange={creator.presentation.setPlaybackMode}
        onPlaybackToggle={creator.presentation.togglePlaying}
        leftPropType={propType}
        onPropChange={changeProp}
        propChirality={creator.presentation.chirality}
        animationSettingsState={creator.presentation.animationSettings}
        exporting={false}
        {reduceMotion}
        formationContent={stageFormationContent}
        formationSummaryOverride={`${creator.renderedInstanceCount} on stage · ${controller.formationSlotCount} positions`}
        stageAware={true}
      />
    </div>
  </div>
{/snippet}

{#snippet pairingPanel(isMobile: boolean)}
  <div class="drawer-panel pairing-panel">
    <PanelHeader
      title={`${creator.pairingTarget?.label ?? "Performer"} source`}
      subtitle="Independent choreography or a derived relationship"
      {isMobile}
      onClose={creator.closeWorkspacePanel}
    />
    <TunnelRelationshipEditor />
  </div>
{/snippet}

{#snippet generationPanel(isMobile: boolean)}
  <div class="drawer-panel generation-panel">
    <PanelHeader
      title={`Generate ${generationTargetLabel}`}
      subtitle="Choose the complete two-prop recipe"
      {isMobile}
      onClose={creator.closeWorkspacePanel}
    />
    <div class="generation-recipe">
      <GeneratePanel
        sequenceState={generationSequenceState}
        isDesktop={!isMobile}
        {generationAnimationTarget}
        bind:generateCurrent={generateCurrentRecipe}
        bind:captureCurrentSetup
        bind:applySetup={applyGenerationSetup}
      />
    </div>
  </div>
{/snippet}

<div
  class="tunnel-container"
  bind:clientWidth={rootWidth}
  bind:clientHeight={rootHeight}
>
  <div
    class="tunnel-workspace themed-scrollbar"
    class:inline-inspector={activeInlineInspector !== null}
    class:short-landscape={shortLandscape}
    class:portrait-workspace={workspaceMode === "portrait"}
    class:split-workspace={workspaceMode === "split"}
  >
    <header class="workspace-header">
      <!-- Editing arrives here by a tab switch, which wipes every trace of the
           tunnel that was on screen a second ago. So the header stops being a
           title and becomes the tunnel's identity: its own poster, its own name
           in the alphabet it was written in. -->
      {#if creator.editingTunnel}
        <div class="title-block editing">
          {#if creator.editingTunnel.poster}
            <img
              class="editing-poster"
              src={creator.editingTunnel.poster}
              alt=""
            />
          {/if}
          <div class="editing-identity">
            <span class="editing-eyebrow">Editing saved tunnel</span>
            <h2 class="editing-name">
              <TkaLabel
                text={creator.editingTunnel.name}
                darkMode
                fitToParent={false}
              />
            </h2>
          </div>
        </div>
      {:else}
        <div class="title-block">
          <h2>Build a tunnel</h2>
          <p>
            Give each performer choreography, then arrange the cast on stage.
          </p>
        </div>
      {/if}

      <div class="workspace-actions">
        <div class="library-trigger">
          <PanelButton
            variant="secondary"
            onclick={onOpenLibrary}
            ariaLabel={`Open tunnels; ${collectionCount} saved`}
          >
            <i class="fas fa-folder-open" aria-hidden="true"></i>
            <span class="library-label">Tunnels</span>
            <span class="library-count" aria-hidden="true"
              >{collectionCount}</span
            >
          </PanelButton>
        </div>
      </div>
    </header>

    <div class="source-column">
      <TunnelPerformerRoster
        bind:this={performerRoster}
        displays={performerDisplays}
        activeStepIndices={activePerformerStepIndices}
        {leftPropType}
        {rightPropType}
        colorMode={controller.colorMode}
        customPropColors={controller.customPropColors}
        exactPropColors={controller.exactPropColors}
        renderedArms={controller.colorStage.map((row) => row.arm)}
        renderedInstanceCount={controller.performerCount}
        short={shortLandscape}
        onCastChange={changeCastCount}
        onChoose={(performerId) => creator.openPicker(performerId)}
        onChooseShapeMatrix={(performerId) => (shapeMatrixTarget = performerId)}
        onGenerateNow={(performerId) => void generatePerformer(performerId)}
        onEditGeneration={(performerId) => void openGeneration(performerId)}
        onEditRelationship={openPairing}
        onSelectPerformer={(performerId) =>
          controller.selectAuthoredPerformer(performerId)}
      />
    </div>

    <section class="preview-stage" aria-label="Tunnel preview">
      <header class="preview-heading">
        <div>
          <span>Stage</span>
          <h3>Preview</h3>
        </div>
        <div class="preview-summary">
          <p>
            {controller.performerCount}
            {controller.performerCount === 1 ? "performer" : "performers"} · {controller.propCount}
            props
          </p>
        </div>
      </header>

      <div class="frame-wrap" class:empty={!creator.leadSequence}>
        {#if creator.leadSequence}
          <TunnelArtView
            sequence={creator.leadSequence}
            {controller}
            bpm={creator.presentation.bpm}
            leftPropType={propType}
            rightPropType={propType}
            leftBuugengFlipped={creator.presentation.leftBuugengFlipped}
            rightBuugengFlipped={creator.presentation.rightBuugengFlipped}
            playing={creator.presentation.playing}
            onPlayingChange={creator.presentation.setPlaying}
            animationSettingsState={creator.presentation.animationSettings}
            visibilityManager={creator.presentation.visibility}
            stageFit="contain"
            onActivePerformerStepsChange={(stepIndices) =>
              (activePerformerStepIndices = { ...stepIndices })}
          />
          {#if !creator.ready}
            <div class="preview-guidance" role="status">
              <i class="fas fa-person-circle-plus" aria-hidden="true"></i>
              <span>
                <strong>Previewing the completed cards</strong>
                Finish every empty performer card before opening the viewer.
              </span>
            </div>
          {/if}
        {:else}
          <PanelState
            type="empty"
            title="Your tunnel will appear here"
            message="Choose a sequence in the first performer card to start the preview."
            icon="fa-people-arrows-left-right"
          />
        {/if}
      </div>

      <footer class="stage-controls">
        <div class="result-meta">
          <strong>{creator.presentation.bpm} BPM</strong>
          <span>
            · {controller.loopSteps}-step loop
          </span>
        </div>
        <div class="result-actions">
          <PanelButton variant="secondary" onclick={openSettings}>
            <i class="fas fa-sliders" aria-hidden="true"></i>
            Stage settings
          </PanelButton>
          <PanelButton
            variant="primary"
            disabled={!creator.ready || creator.opening}
            ariaBusy={creator.opening}
            onclick={() => void creator.openInViewer(controller.config)}
          >
            <i class="fas fa-expand" aria-hidden="true"></i>
            {creator.editingTunnel ? "Preview changes" : "Open viewer"}
          </PanelButton>
        </div>
      </footer>
    </section>

    {#if canInlineInspector}
      <aside
        class="inspector-column"
        class:open={activeInlineInspector !== null}
        aria-label={inspectorColumn
          ? inspectorColumn === "settings"
            ? "Stage settings"
            : inspectorColumn === "pairing"
              ? "Tunnel pairing"
              : `${generationTargetLabel} generation recipe`
          : undefined}
        aria-hidden={activeInlineInspector === null}
        inert={activeInlineInspector === null}
      >
        <div
          class="inspector-layer generation-layer"
          class:active={inspectorColumn === "generation"}
          aria-hidden={inspectorColumn !== "generation"}
          inert={inspectorColumn !== "generation"}
        >
          {@render generationPanel(false)}
        </div>
        {#if inspectorColumn === "settings"}
          <div class="inspector-layer active">
            {@render settingsPanel(false, "sidebar")}
          </div>
        {:else if inspectorColumn === "pairing"}
          <div class="inspector-layer active">
            {@render pairingPanel(false)}
          </div>
        {/if}
      </aside>
    {/if}
  </div>
</div>

{#if !canInlineInspector}
  <CreatePanelDrawer
    isOpen={settingsOpen}
    panelName="tunnel-settings"
    fullHeightOnMobile={true}
    closeOnBackdrop={false}
    ariaLabel="Stage settings"
    onClose={creator.closeWorkspacePanel}
  >
    {@render settingsPanel(compact, compact ? "bottom" : "sidebar")}
  </CreatePanelDrawer>

  <CreatePanelDrawer
    isOpen={pairingOpen}
    panelName="tunnel-pairing"
    fullHeightOnMobile={true}
    closeOnBackdrop={false}
    ariaLabel="Tunnel pairing"
    onClose={creator.closeWorkspacePanel}
  >
    {@render pairingPanel(compact)}
  </CreatePanelDrawer>

  <CreatePanelDrawer
    isOpen={generationOpen}
    panelName="tunnel-generation"
    fullHeightOnMobile={true}
    keepMounted={true}
    closeOnBackdrop={false}
    ariaLabel={`${generationTargetLabel} generation recipe`}
    onClose={creator.closeWorkspacePanel}
  >
    {@render generationPanel(compact)}
  </CreatePanelDrawer>
{/if}

<SequencePickerModal
  open={creator.pickerTarget !== null}
  onClose={creator.closePicker}
  onSelect={selectPickedSequence}
  title={`Choose ${creator.performerSlots.find((slot) => slot.id === creator.pickerTarget)?.label ?? "Performer 1"} Sequence`}
/>

{#if shapeMatrixTarget}
  <ShapeMatrixTunnelSourcePicker
    targetLabel={creator.performerSlots.find(
      (slot) => slot.id === shapeMatrixTarget
    )?.label ?? "Performer"}
    onSelect={selectShapeMatrixRealization}
    onClose={() => (shapeMatrixTarget = null)}
  />
{/if}

<style>
  .tunnel-container {
    --min-touch-target: 48px;
    container: tunnel / size;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--theme-page-bg, transparent);
  }

  .tunnel-workspace {
    --tunnel-gap: var(--settings-spacing-md, 12px);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: repeat(3, max-content);
    grid-template-areas:
      "header"
      "sources"
      "preview";
    align-content: start;
    gap: var(--tunnel-gap);
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: clamp(10px, 2.5cqw, 20px);
    overflow-x: hidden;
    overflow-y: auto;
  }

  .workspace-header {
    grid-area: header;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--settings-spacing-md, 14px);
    min-height: var(--min-touch-target, 48px);
    padding: var(--settings-spacing-sm, 8px) var(--settings-spacing-md, 14px);
    border: 1px solid var(--theme-stroke);
    border-radius: var(--settings-radius-lg, 20px);
    background: var(--theme-panel-bg);
  }

  .title-block {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  /* The identity keeps its natural width and the mode switch yields instead —
     it can shrink to its 12rem floor, and a squeezed title block wrapped the
     eyebrow onto two lines around 820px. */
  .title-block.editing {
    flex: 0 0 auto;
    grid-auto-flow: column;
    align-items: center;
    gap: var(--settings-spacing-sm, 8px);
  }

  .editing-poster {
    width: 48px;
    height: 48px;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--settings-radius-sm, 10px);
    background: var(--theme-surface-2, rgb(0 0 0 / 0.25));
    object-fit: cover;
  }

  .editing-identity {
    display: grid;
    gap: 1px;
    min-width: 0;
  }

  .editing-eyebrow {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  /* The glyph renderer is inline content inside the h2, so the line box has to
     stop reserving descender room or the name sits low against its poster. */
  .editing-name {
    display: flex;
    align-items: center;
    line-height: 1;
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  h2 {
    overflow: hidden;
    color: var(--theme-text);
    font-size: clamp(1.05rem, 2.2cqw, 1.35rem);
    font-weight: 750;
    letter-spacing: -0.02em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .title-block p {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
  }

  .workspace-actions {
    display: flex;
    align-items: center;
    flex: 0 1 auto;
    gap: var(--settings-spacing-sm, 8px);
    min-width: 0;
    margin-left: auto;
  }

  .library-trigger {
    flex: 0 1 auto;
    min-width: 0;
  }

  .library-count {
    display: inline-grid;
    min-width: 1.65rem;
    min-height: 1.65rem;
    padding-inline: 5px;
    place-items: center;
    border-radius: 999px;
    color: var(--theme-text);
    background: color-mix(
      in srgb,
      var(--theme-accent) 14%,
      var(--theme-panel-bg)
    );
    font-size: var(--font-size-compact, 12px);
    font-variant-numeric: tabular-nums;
    font-weight: 750;
  }

  .source-column {
    grid-area: sources;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .source-column > :global(.performer-roster) {
    height: 100%;
  }

  .preview-stage {
    grid-area: preview;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    min-width: 0;
    min-height: 31rem;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--settings-radius-lg, 20px);
    background: var(--theme-panel-bg);
  }

  .preview-heading,
  .stage-controls,
  .result-actions {
    display: flex;
    align-items: center;
  }

  .preview-heading {
    justify-content: space-between;
    gap: var(--settings-spacing-md, 14px);
    min-height: 4rem;
    padding: var(--settings-spacing-sm, 8px) var(--settings-spacing-md, 14px);
    border-bottom: 1px solid var(--theme-stroke);
  }

  .preview-heading > div:first-child {
    display: grid;
    gap: 2px;
  }

  .preview-heading p,
  .result-meta span {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
  }

  .preview-heading > div:first-child > span {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 750;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .preview-heading h3 {
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
  }

  .preview-summary {
    display: flex;
    align-items: flex-end;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }

  .preview-summary p {
    text-align: right;
  }

  .frame-wrap {
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: color-mix(in srgb, var(--theme-card-bg) 76%, black);
  }

  .frame-wrap.empty {
    display: grid;
    place-items: center;
  }

  .frame-wrap :global(.panel-state__message) {
    max-width: 28rem;
  }

  .preview-guidance {
    position: absolute;
    top: var(--settings-spacing-md, 14px);
    left: var(--settings-spacing-md, 14px);
    z-index: 2;
    display: flex;
    align-items: center;
    gap: var(--settings-spacing-sm, 8px);
    max-width: calc(100% - 2 * var(--settings-spacing-md, 14px));
    padding: var(--settings-spacing-sm, 8px) var(--settings-spacing-md, 14px);
    border: 1px solid var(--theme-stroke);
    border-radius: var(--settings-radius-md, 12px);
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.35;
    background: color-mix(in srgb, var(--theme-panel-bg) 94%, black);
    pointer-events: none;
  }

  .preview-guidance i {
    flex: 0 0 auto;
    color: var(--theme-accent);
    font-size: var(--font-size-min, 14px);
  }

  .preview-guidance span {
    display: grid;
    gap: 1px;
  }

  .preview-guidance strong {
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
  }

  .stage-controls {
    justify-content: space-between;
    gap: var(--settings-spacing-md, 14px);
    min-height: 4.5rem;
    padding: var(--settings-spacing-sm, 8px) var(--settings-spacing-md, 14px);
    border-top: 1px solid var(--theme-stroke);
  }

  .result-meta {
    display: flex;
    align-items: baseline;
    gap: 5px;
    min-width: 5rem;
  }

  .result-meta strong {
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
  }

  .result-actions {
    justify-content: flex-end;
    gap: var(--settings-spacing-sm, 8px);
  }

  .drawer-panel {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    background: var(--theme-panel-bg);
  }

  .inspector-column {
    grid-area: inspector;
    position: relative;
    display: flex;
    justify-content: flex-end;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    opacity: 0;
    transform: translateX(2rem);
    pointer-events: none;
    transition:
      opacity var(--duration-emphasis, 280ms)
        var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
      transform var(--duration-emphasis, 280ms)
        var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
  }

  .inspector-column.open {
    opacity: 1;
    transform: translateX(0);
    pointer-events: auto;
  }

  .inspector-layer {
    position: absolute;
    inset: 0;
    display: flex;
    justify-content: flex-end;
    min-width: 0;
    min-height: 0;
    visibility: hidden;
    opacity: 0;
    transform: translateX(1rem);
    pointer-events: none;
    transition:
      opacity var(--duration-normal, 180ms) ease,
      transform var(--duration-emphasis, 280ms)
        var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
      visibility 0s linear var(--duration-emphasis, 280ms);
  }

  .inspector-layer.active {
    visibility: visible;
    opacity: 1;
    transform: translateX(0);
    pointer-events: auto;
    transition-delay: 0s;
  }

  .inspector-column .drawer-panel {
    flex: 0 0 auto;
    width: var(--inspector-open-width, 30rem);
    min-width: 0;
  }

  .pairing-panel :global(.relationship) {
    flex: 1;
    min-height: 0;
  }

  .generation-recipe {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .drawer-scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  .drawer-scroll :global(.art-settings-panel) {
    width: 100%;
    min-height: 100%;
    border: 0;
    border-radius: 0;
  }

  :global(.drawer-content.tunnel-settings-panel-container),
  :global(.drawer-content.tunnel-pairing-panel-container),
  :global(.drawer-content.tunnel-generation-panel-container) {
    --sheet-bg: var(--theme-panel-bg);
    --sheet-filter: none;
    background: var(--theme-panel-bg);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  :global(
    .drawer-content.tunnel-settings-panel-container.side-by-side-layout[data-placement="right"]
  ),
  :global(
    .drawer-content.tunnel-pairing-panel-container.side-by-side-layout[data-placement="right"]
  ),
  :global(
    .drawer-content.tunnel-generation-panel-container.side-by-side-layout[data-placement="right"]
  ) {
    width: clamp(30rem, 34vw, 44rem);
    max-width: calc(100vw - var(--desktop-sidebar-width, 64px));
    border-radius: 0;
  }

  /* Portrait tablets keep the complete two-part story on one screen. Giving
     each half the full container width protects the choreography instead of
     crushing it into the 349px desktop rail seen at 820px. */
  .tunnel-workspace.portrait-workspace {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: max-content minmax(0, 0.95fr) minmax(0, 1.05fr);
    grid-template-areas:
      "header"
      "sources"
      "preview";
    align-content: stretch;
    overflow: hidden;
  }

  .portrait-workspace .source-column,
  .portrait-workspace .preview-stage {
    min-height: 0;
  }

  /* Desktop is the only ordinary side-by-side workspace. More width changes
     the allocation, never the visible controls or the number of open cards. */
  .tunnel-workspace.split-workspace {
    grid-template-columns: minmax(25rem, min(44%, 72rem)) minmax(0, 1fr);
    grid-template-rows: max-content minmax(0, 1fr);
    grid-template-areas:
      "header header"
      "sources preview";
    align-content: stretch;
    overflow: hidden;
  }

  .split-workspace .preview-stage {
    min-height: 0;
  }

  @container tunnel (max-width: 719px) {
    .tunnel-workspace {
      grid-template-rows: max-content minmax(26rem, auto) minmax(24rem, auto);
      padding-bottom: calc(5.5rem + env(safe-area-inset-bottom));
    }

    .tunnel-workspace .source-column {
      min-height: 26rem;
      overflow: visible;
    }

    .tunnel-workspace .preview-stage {
      min-height: 24rem;
    }

    .workspace-header {
      flex-wrap: wrap;
    }

    .workspace-actions {
      margin-left: auto;
    }
  }

  @container tunnel (max-width: 460px) {
    .tunnel-workspace {
      --tunnel-gap: var(--settings-spacing-sm, 8px);
      padding: var(--settings-spacing-sm, 8px);
    }

    .workspace-header {
      padding: 7px 8px;
    }

    .workspace-actions {
      gap: 4px;
    }

    .title-block p,
    .library-label {
      display: none;
    }

    .editing-poster {
      width: 32px;
      height: 32px;
    }

    .library-trigger :global(.panel-btn) {
      width: var(--min-touch-target, 48px);
      min-width: var(--min-touch-target, 48px);
      padding: 0;
    }

    .library-trigger :global(.panel-btn) {
      position: relative;
    }

    .library-count {
      position: absolute;
      top: -4px;
      right: -4px;
      min-width: 1.25rem;
      min-height: 1.25rem;
      padding-inline: 3px;
      border: 1px solid var(--theme-panel-bg);
      font-size: 10px;
    }

    .stage-controls {
      align-items: stretch;
      flex-direction: column;
    }

    .preview-heading {
      align-items: flex-start;
    }

    .preview-summary p {
      display: none;
    }

    .result-actions,
    .result-actions :global(.panel-btn) {
      width: 100%;
    }

    .result-actions :global(.panel-btn) {
      flex: 1;
    }
  }

  /* On a large workspace the active inspector becomes a third track, matching
     Fuse: notation and animation concede space together instead of settings
     covering the result they change. The track always exists at zero width so
     opening and closing can interpolate without a grid pop. */
  @container tunnel (min-width: 1000px) and (min-height: 700px) {
    .tunnel-workspace.split-workspace {
      --inspector-open-width: clamp(24rem, 26cqw, 36rem);
      --inspector-seam: 0px;
      --inspector-width: 0px;
      grid-template-columns:
        minmax(25rem, min(38%, 64rem)) var(--tunnel-gap) minmax(22rem, 1fr)
        var(--inspector-seam) var(--inspector-width);
      grid-template-rows: max-content minmax(0, 1fr);
      grid-template-areas:
        "header header header header header"
        "sources . preview . inspector";
      column-gap: 0;
      row-gap: var(--tunnel-gap);
      transition: grid-template-columns var(--duration-emphasis, 280ms)
        var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
    }

    .tunnel-workspace.split-workspace.inline-inspector {
      --inspector-seam: var(--tunnel-gap);
      --inspector-width: var(--inspector-open-width);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tunnel-workspace,
    .inspector-column,
    .inspector-layer {
      transition: none;
    }
  }

  @container tunnel (min-width: 720px) and (max-height: 500px) {
    .tunnel-workspace {
      --tunnel-gap: var(--settings-spacing-sm, 8px);
      padding: var(--settings-spacing-sm, 8px);
    }

    .workspace-header {
      padding-block: 6px;
    }

    .title-block p {
      display: none;
    }

    .editing-poster {
      width: 32px;
      height: 32px;
    }
  }

  .tunnel-workspace.short-landscape {
    grid-template-columns: minmax(19rem, 0.95fr) minmax(20rem, 1.05fr);
    grid-template-rows: max-content minmax(0, 1fr);
    grid-template-areas:
      "header header"
      "sources preview";
    align-content: stretch;
    overflow: hidden;
  }

  .short-landscape .workspace-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px 8px;
    padding: 4px 6px;
  }

  .short-landscape .title-block p,
  .short-landscape .preview-summary,
  .short-landscape .preview-heading > div:first-child > span,
  .short-landscape .result-meta span {
    display: none;
  }

  .short-landscape .preview-stage {
    min-height: 0;
  }

  .short-landscape .source-column {
    min-height: 0;
  }

  .short-landscape .preview-heading,
  .short-landscape .stage-controls {
    min-height: var(--min-touch-target, 48px);
    padding: 4px 8px;
  }

  .short-landscape .result-meta {
    min-width: 0;
  }

  .short-landscape .result-actions :global(.panel-btn) {
    min-width: var(--min-touch-target, 48px);
    padding-inline: 10px;
  }

  @container tunnel (min-width: 1680px) and (min-height: 900px) {
    .tunnel-workspace {
      --font-size-min: 16px;
      --font-size-compact: 14px;
      --font-size-sm: 17px;
      --min-touch-target: 48px;
      --tunnel-gap: var(--settings-spacing-lg, 18px);
      padding: 24px;
    }

    .workspace-header {
      min-height: 5.25rem;
      padding-inline: 18px;
    }
  }

  @container tunnel (min-width: 2600px) and (min-height: 1400px) {
    .tunnel-workspace {
      --font-size-min: 18px;
      --font-size-compact: 16px;
      --font-size-sm: 19px;
      --min-touch-target: 64px;
      --tunnel-gap: 24px;
      padding: 32px;
    }

    .workspace-header {
      min-height: 6.5rem;
      padding-inline: 24px;
    }

    h2 {
      font-size: 1.65rem;
    }

    .preview-heading,
    .stage-controls {
      min-height: 5.5rem;
      padding-inline: 1.25rem;
    }
  }
</style>
