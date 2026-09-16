<script lang="ts">
  import ArtPane from "./ArtPane.svelte";
  import ChoreoCard from "./ChoreoCard.svelte";
  import { createPaneKeepAlive } from "./pane-keep-alive.svelte";
  import type { ViewerCompanionSurfaceProps } from "./viewer-split-pane-types";
  import SequenceVideos from "./sequence-videos/SequenceVideos.svelte";
  import { getViewerTunnelStageContext } from "../context/viewer-tunnel-stage-context";
  import { getViewerStudioSurfaces } from "../context/viewer-studio-surfaces-context";
  import { reparentToInspector } from "./reparent-to-inspector";
  import { createHandLabeledCard } from "../services/hand-labeled-card.svelte";

  let {
    side,
    sequence,
    activeHandLabeling = null,
    playback,
    imageComposition,
    propRendering,
    layout,
    splitConfig,
    bpm,
    onBpmChange,
    onSaveToLibrary,
    onPropChange,
    onFanAppearanceChange,
    onRenderProgress,
    onUnfocusPane,
    onStepClick,
    onQrPlayClick,
    onChoreoCardContextMenu,
    cardAutoLayoutOverride,
    cardContainSizeMotion = null,
    cardContainMotionBox = null,
    onAutoLayoutResolved,
    onPlaybackToggle,
    playbackMode,
    onPlaybackModeChange,
    rerenderTrigger,
    isLoggedIn,
    onVideoUpload,
    onArtExport,
    onArtShare,
    artShareActive = false,
    onArtExportEvent,
    onArtSettingChange,
    onArtAction,
    tunnelComposition = null,
    tunnelSaveTarget = null,
    onTunnelSaved,
  }: ViewerCompanionSurfaceProps = $props();

  // Beside performance footage the card draws the sequence the viewer should
  // copy, not the stored one, and the footer legend must always describe the
  // sequence actually drawn - never the labeling still in flight.
  const labeledCard = createHandLabeledCard({
    getSequence: () => sequence,
    getLabeling: () => activeHandLabeling,
  });

  const selectedPane = $derived(
    side === "left" ? splitConfig.leftPane : splitConfig.rightPane
  );
  const tunnelStage = getViewerTunnelStageContext();
  const studio = getViewerStudioSurfaces();
  const studioCard = $derived(side === "right" ? studio?.cardFrame : null);
  function ownCard(node: HTMLElement) {
    return {
      destroy: side === "right" ? studio?.registerCard(node) : undefined,
    };
  }
  const card = createPaneKeepAlive(() => selectedPane === "card");
  const videos = createPaneKeepAlive(() => selectedPane === "videos");
  const mandala = createPaneKeepAlive(() => selectedPane === "mandala");
  const tunnel = createPaneKeepAlive(() => selectedPane === "tunnel");

  // A focused Card has no neighboring playback surface for a seek to explain.
  // Keep its cells static; split view retains click-to-seek beside the motion.
  const cardStepClick = $derived(
    layout.focusedPane === "image" ? undefined : onStepClick
  );

  function handleCloseClick(event: MouseEvent | KeyboardEvent): void {
    event.stopPropagation();
    onUnfocusPane();
  }
</script>

{#if card.mounted}
  <div
    class="media-pane preview-pane content-overlay"
    class:content-overlay-hidden={!card.shown}
  >
    {#if side === "right" && card.active && layout.focusedPane === "image" && !layout.isMobile && !layout.suppressCloseButton}
      <div
        class="pane-close-btn"
        role="button"
        tabindex="0"
        onclick={handleCloseClick}
        onkeydown={(event) => {
          if (event.key === "Enter" || event.key === " ")
            handleCloseClick(event);
        }}
        aria-label="Exit focus mode"
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </div>
    {/if}

    <div
      class="shared-card"
      use:ownCard
      data-shared-studio-card={side === "right" || undefined}
      use:reparentToInspector={{
        target: side === "right" ? (studio?.cardTarget ?? null) : null,
        animate: true,
        onMoving: (moving) => {
          if (side === "right") studio?.setSurfaceMoving("card", moving);
        },
      }}
    >
      <ChoreoCard
        sequence={studioCard?.sequence ?? labeledCard.sequence}
        handLabeling={studioCard
          ? studioCard.handLabeling
          : labeledCard.labeling}
        qrSequence={studioCard ? studioCard.qrSequence : sequence}
        customTitleText={sequence.sequenceKind === "hand-path"
          ? sequence.displayName || sequence.name
          : undefined}
        highlightedStepIndex={studioCard
          ? studioCard.highlightedStepIndex
          : side === "right" && layout.focusedPane === "image"
            ? null
            : playback.highlightedStepIndex}
        showHighlight={studioCard
          ? true
          : side === "right" && layout.focusedPane === "image"
            ? false
            : playback.isPlaying || playback.highlightedStepIndex !== null}
        onStepClick={studioCard ? undefined : cardStepClick}
        {onQrPlayClick}
        clickableStart={!!cardStepClick}
        {onRenderProgress}
        showWord={studioCard?.options?.addWord ?? imageComposition.showWord}
        showStepNumbers={studioCard?.options?.addStepNumbers ??
          imageComposition.showStepNumbers}
        showDifficultyLevel={studioCard?.options?.addDifficultyLevel ??
          imageComposition.showDifficulty}
        includeStartPlacement={studioCard?.options?.includeStartPlacement ??
          imageComposition.showStartPos}
        showNotes={studioCard
          ? (studioCard.options?.showNotes ?? false)
          : sequence.sequenceKind === "hand-path" || imageComposition.showNotes}
        customNotesText={sequence.sequenceKind === "hand-path"
          ? sequence.notes
          : imageComposition.customNotesText}
        showQRCode={studioCard?.options?.visibilityOverrides?.showQRCode ??
          imageComposition.showQRCode}
        showMandala={studioCard?.options?.visibilityOverrides?.showMandala ??
          imageComposition.showMandala ??
          false}
        showLoopGlyph={studioCard?.options?.showLoopGlyph ??
          imageComposition.showLoopGlyph ??
          true}
        handPathMode={studioCard?.options?.visibilityOverrides?.handPathMode ??
          imageComposition.handPathMode}
        darkMode={studioCard?.options?.visibilityOverrides?.darkMode ??
          imageComposition.darkMode}
        columnCount={studioCard
          ? studioCard.automatic
            ? null
            : (studioCard.options?.columnCount ?? null)
          : imageComposition.columnCount}
        startPlacementLayoutOverride={studioCard && !studioCard.automatic
          ? studioCard.options?.startPlacementLayout
          : undefined}
        forceContain={studioCard ? true : imageComposition.forceContain}
        fitWidth={!!studioCard ||
          (side === "right" &&
            layout.isMobile &&
            layout.focusedPane === "image")}
        leftPropType={studioCard?.options?.leftPropTypeOverride ??
          studioCard?.options?.propTypeOverride ??
          propRendering.leftPropType}
        rightPropType={studioCard?.options?.rightPropTypeOverride ??
          studioCard?.options?.propTypeOverride ??
          propRendering.rightPropType}
        catDogModeEnabled={propRendering.catDogModeEnabled}
        {rerenderTrigger}
        onContextMenu={onChoreoCardContextMenu}
        autoLayoutOverride={studioCard ? null : cardAutoLayoutOverride}
        containSizeMotion={studioCard ? null : cardContainSizeMotion}
        containMotionBox={studioCard ? null : cardContainMotionBox}
        onAutoLayoutResolved={!studioCard && card.shown
          ? onAutoLayoutResolved
          : undefined}
      />
    </div>
  </div>
{/if}

{#if videos.mounted}
  <div
    class="media-pane content-overlay"
    class:content-overlay-hidden={!videos.shown}
  >
    <!-- Browse only. Uploading and timing happen on the full Videos surface,
         which onVideoUpload switches the viewer to. -->
    <SequenceVideos
      {sequence}
      isOwned={false}
      active={videos.shown}
      {isLoggedIn}
      {onSaveToLibrary}
      canUpload={!!onVideoUpload}
      onUploadOpenChange={(open) => {
        if (open) onVideoUpload?.();
      }}
    />
  </div>
{/if}

{#if mandala.mounted}
  <div
    class="media-pane content-overlay"
    class:content-overlay-hidden={!mandala.shown}
  >
    <ArtPane
      artType="mandala"
      controller={tunnelStage.controller}
      active={side === "right" ? mandala.shown : true}
      shown={mandala.shown}
      {sequence}
      {playback}
      leftPropType={propRendering.leftPropType != null
        ? String(propRendering.leftPropType)
        : undefined}
      rightPropType={propRendering.rightPropType != null
        ? String(propRendering.rightPropType)
        : undefined}
      {bpm}
      {onBpmChange}
      {playbackMode}
      {onPlaybackModeChange}
      onPlaybackToggle={onPlaybackToggle ?? (() => {})}
      layout={layout.isMobile ? "bottom" : "sidebar"}
      {onPropChange}
      fanAppearance={propRendering.fanAppearance}
      {onFanAppearanceChange}
      {onArtExport}
      {onArtShare}
      {artShareActive}
      {onArtExportEvent}
      {onArtSettingChange}
      {onArtAction}
      {tunnelSaveTarget}
      {onTunnelSaved}
    />
  </div>
{/if}

{#if tunnel.mounted}
  <!-- Tunnel contributes controls and export overlays here. Its live art stays
       on the shell-owned Animator canvas beneath this transparent surface. -->
  <div
    class="media-pane content-overlay"
    class:content-overlay-hidden={!tunnel.shown}
    data-companion-surface="tunnel"
    data-shared-tunnel-canvas
    data-presented={tunnel.shown}
    inert={!tunnel.shown}
    aria-hidden={!tunnel.shown}
  >
    <ArtPane
      artType="tunnel"
      controller={tunnelStage.controller}
      sharedTunnelCanvas
      active={side === "right" ? tunnel.shown : true}
      shown={tunnel.shown}
      {sequence}
      {playback}
      leftPropType={propRendering.leftPropType != null
        ? String(propRendering.leftPropType)
        : undefined}
      rightPropType={propRendering.rightPropType != null
        ? String(propRendering.rightPropType)
        : undefined}
      {bpm}
      {onBpmChange}
      {playbackMode}
      {onPlaybackModeChange}
      onPlaybackToggle={onPlaybackToggle ?? (() => {})}
      layout={layout.isMobile ? "bottom" : "sidebar"}
      {onPropChange}
      fanAppearance={propRendering.fanAppearance}
      {onFanAppearanceChange}
      {onArtExport}
      {onArtShare}
      {artShareActive}
      {onArtExportEvent}
      {onArtSettingChange}
      {onArtAction}
      {tunnelComposition}
      {tunnelSaveTarget}
      {onTunnelSaved}
    />
  </div>
{/if}

<style>
  .shared-card {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    position: relative;
  }
</style>
