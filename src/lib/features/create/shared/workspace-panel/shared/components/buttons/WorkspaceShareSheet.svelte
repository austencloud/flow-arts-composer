<!--
  WorkspaceShareSheet.svelte

  The share sheet for a sequence that has no viewer of its own: the card, link,
  send and video choices, plus the offscreen video render behind them. The
  Create workspace's Share button and the Fuse tab both open it directly, so
  Share never routes through the sequence viewer first. The host owns the
  trigger and the open state; this owns everything the sheet needs to deliver.
-->
<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { hashString } from "#lib/shared/foundation/services/content-hasher.js";
  import { deriveWord } from "#lib/shared/foundation/services/word-deriver.js";
  import { generateViewerURL } from "#lib/shared/navigation/services/sequence-encoder.js";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { authDrawerState } from "#lib/shared/auth/state/auth-drawer-state.svelte.js";
  import {
    buildSequenceSharePayload,
    openSendSequenceSheet,
  } from "#lib/shared/inbox/state/send-sequence-state.svelte.js";
  import PostShareSheet from "#lib/shared/share/components/PostShareSheet.svelte";
  import { getExportOptionsState } from "#lib/shared/animation-panel/state/export-options-state.svelte.js";
  import InlineAnimationPlayer from "#lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte";
  import StepStrip from "#lib/shared/timeline/StepStrip.svelte";
  import {
    VIDEO_CAROUSEL_BAND_RATIO,
    videoCarouselOrientation,
  } from "#lib/shared/video-export/domain/video-carousel.js";
  import {
    showsVideoHeader,
    videoOverlayExport,
    videoOverlaysFrom,
  } from "#lib/shared/video-export/domain/video-overlays.js";
  import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import { PLAYBACK_BASELINE_BPM } from "#lib/shared/animation-engine/domain/constants/timing.js";
  import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
  import type { AnimationPlaybackController } from "#lib/shared/animation-engine/services/animation-playback-controller.js";
  import type { AnimationPanelState } from "#lib/shared/animation-engine/state/animation-panel-state.svelte.js";
  import type { SequenceModalExporter } from "#lib/shared/sequence-viewer/services/sequence-modal-exporter.svelte.js";

  interface Props {
    sequence: SequenceData | null;
    isOpen: boolean;
    onClose: () => void;
    /** The host's tempo. A host without one plays and renders at 60 BPM. */
    bpm?: number;
  }

  let {
    sequence,
    isOpen,
    onClose,
    bpm = PLAYBACK_BASELINE_BPM,
  }: Props = $props();

  const exportOptions = getExportOptionsState();
  const animationVisibility = getAnimationVisibilityManager();
  // These stay unloaded until a person requests a file. Their controller never
  // publishes into the workspace playhead or saves playback preferences.
  let workspaceVideoState: AnimationPanelState | null = null;
  let workspaceVideoExporter = $state<SequenceModalExporter | null>(null);
  let workspaceVideoController: AnimationPlaybackController | null = null;
  let workspaceVideoExport: Promise<void> | null = null;
  let activeVideoSourceKey: string | null = null;
  let videoRenderGeneration = 0;

  // The video's speed starts at the workspace tempo each time the sheet opens.
  // Changing it here shapes the preview and the file only; the workspace
  // keeps its own tempo.
  let videoBpm = $state(untrack(() => bpm));
  $effect(() => {
    if (isOpen) untrack(() => (videoBpm = bpm));
  });

  const hasFullAccount = $derived(authState.isFullAccount);
  const guestShareUrl = $derived(
    isOpen && !hasFullAccount && sequence
      ? generateViewerURL(sequence, { compress: true, metadata: { bpm } }).url
      : ""
  );
  const workspaceVideoSourceKey = $derived.by(() =>
    hashString(
      JSON.stringify({
        sequence,
        bpm: videoBpm,
        options: exportOptions.getVideoOptions(),
      })
    )
  );
  // Playback only reloads when the choreography changes. Export dimensions and
  // loop count alter the eventual file, not the live motion a person is using
  // to decide whether to download it.
  const workspaceVideoPreviewKey = $derived.by(() =>
    hashString(JSON.stringify(sequence))
  );
  // The live preview's title bar shows the word the rendered video carries.
  // An unsaved sequence stores an empty word, which left the bar blank.
  const workspaceVideoPreviewWord = $derived(
    sequence ? deriveWord(sequence) : null
  );
  // The preview draws what the file will: the Download screen's own list, or
  // the canvas's until that screen first opens.
  const previewOverlays = $derived(
    exportOptions.videoOverlays ??
      videoOverlaysFrom(
        (key) => animationVisibility.getVisibility(key),
        animationVisibility.isGridVisible()
      )
  );
  const previewShowsHeader = $derived(showsVideoHeader(previewOverlays));
  // The live preview takes the rendered video's shape, never the stage's:
  // the animation is a square, the header and bar sit on it at whatever
  // height they draw, and the carousel the file will carry sits on its side.
  const previewCarousel = $derived(exportOptions.videoCarousel);
  const previewBand = $derived.by(() => {
    if (previewCarousel === "off") return { w: 0, h: 0 };
    return videoCarouselOrientation(previewCarousel) === "vertical"
      ? { w: VIDEO_CAROUSEL_BAND_RATIO, h: 0 }
      : { w: 0, h: VIDEO_CAROUSEL_BAND_RATIO };
  });
  // The header and bar heights the player draws, measured, so the frame
  // wraps them and the square exactly instead of squeezing the square.
  let previewCardEl = $state<HTMLElement | null>(null);
  let previewChromePx = $state(0);
  $effect(() => {
    const card = previewCardEl;
    if (!card) return;
    const resize = new ResizeObserver(measure);
    const observed = new Set<Element>();
    function measure(): void {
      let chrome = 0;
      for (const slot of card!.querySelectorAll(".header-slot, .progress-slot")) {
        if (!observed.has(slot)) {
          observed.add(slot);
          resize.observe(slot);
        }
        chrome += slot.getBoundingClientRect().height;
      }
      previewChromePx = Math.round(chrome);
    }
    const mounts = new MutationObserver(measure);
    mounts.observe(card, { childList: true, subtree: true });
    resize.observe(card);
    measure();
    return () => {
      resize.disconnect();
      mounts.disconnect();
    };
  });
  let previewStep = $state(0);
  const workspaceVideoUrl = $derived(
    workspaceVideoExporter?.state.previewBlobUrl ?? null
  );
  const workspaceVideoExporting = $derived(
    workspaceVideoExporter?.state.isExporting ?? false
  );
  const workspaceVideoProgress = $derived(
    workspaceVideoExporter?.state.progress?.progress ?? null
  );

  onDestroy(() => {
    cancelWorkspaceVideo();
    const disposeVideoResources = () => {
      workspaceVideoExporter?.dismissPreview();
      workspaceVideoController?.dispose();
      workspaceVideoState?.dispose();
    };
    if (workspaceVideoExport) {
      void workspaceVideoExport.finally(disposeVideoResources);
    } else {
      disposeVideoResources();
    }
  });

  $effect(() => {
    const sourceKey = workspaceVideoSourceKey;
    untrack(() => {
      if (activeVideoSourceKey && activeVideoSourceKey !== sourceKey) {
        cancelWorkspaceVideo();
      }
    });
  });

  function sendSequenceToInbox(): void {
    if (!sequence) return;
    openSendSequenceSheet(buildSequenceSharePayload(sequence));
  }

  function cancelWorkspaceVideo(): void {
    videoRenderGeneration += 1;
    activeVideoSourceKey = null;
    // SequenceModalExporter talks to the shared orchestrator. Only ask it to
    // cancel while this sheet owns a live job; a stale workspace preview must
    // never interrupt a render started from another surface.
    if (workspaceVideoExport) workspaceVideoExporter?.cancel();
    workspaceVideoExporter?.dismissPreview();
  }

  async function ensureWorkspaceVideoServices(): Promise<{
    exporter: SequenceModalExporter;
    panelState: AnimationPanelState;
    createController: (options: {
      syncSharedWorkspaceState: false;
    }) => AnimationPlaybackController;
  }> {
    const [exporterModule, panelStateModule, controllerModule] =
      await Promise.all([
        import("#lib/shared/sequence-viewer/services/sequence-modal-exporter.svelte.js"),
        import("#lib/shared/animation-engine/state/animation-panel-state.svelte.js"),
        import("#lib/shared/animation-engine/services/animation-playback-controller-factory.js"),
      ]);
    workspaceVideoExporter ??= new exporterModule.SequenceModalExporter();
    workspaceVideoState ??= panelStateModule.createAnimationPanelState({
      ephemeral: true,
    });
    return {
      exporter: workspaceVideoExporter,
      panelState: workspaceVideoState,
      createController: (options) =>
        controllerModule.createAnimationPlaybackController(undefined, options),
    };
  }

  async function requestWorkspaceVideo(): Promise<boolean> {
    if (!sequence) return false;

    // Capture the accepted request before waiting for a previous encoder to
    // drain. The current workspace may regenerate during that wait.
    const currentSequence = structuredClone($state.snapshot(sequence));
    const options = exportOptions.getVideoOptions();
    const speed = videoBpm / PLAYBACK_BASELINE_BPM;
    const sourceKey = workspaceVideoSourceKey;
    cancelWorkspaceVideo();
    const renderGeneration = ++videoRenderGeneration;
    activeVideoSourceKey = sourceKey;
    const previousExport = workspaceVideoExport;
    if (previousExport) await previousExport;
    if (
      renderGeneration !== videoRenderGeneration ||
      sourceKey !== workspaceVideoSourceKey
    ) {
      return false;
    }
    const { exporter, panelState, createController } =
      await ensureWorkspaceVideoServices();
    // A sequence can regenerate while export modules load. The source key was
    // stamped beside the snapshot above, so a late request cannot start with
    // an old sequence under the new workspace state.
    if (
      renderGeneration !== videoRenderGeneration ||
      sourceKey !== workspaceVideoSourceKey
    ) {
      return false;
    }
    const layoutCanvas = document.createElement("canvas");
    // The orchestrator uses this only for layout sizing; it creates and drives
    // the real animation canvas offscreen.
    layoutCanvas.width = 600;
    layoutCanvas.height = 600;
    const controller = createController({
      syncSharedWorkspaceState: false,
    });
    workspaceVideoController?.dispose();
    workspaceVideoController = controller;
    panelState.reset();
    // reset() returns the panel to 1x, which is 60 BPM. The export times each
    // beat from this speed, so a host with its own tempo sets it here. This
    // panel is ephemeral: nothing is saved as the person's playback speed.
    if (speed !== 1) panelState.setSpeed(speed);

    if (!controller.initialize(currentSequence, panelState)) {
      if (workspaceVideoController === controller) {
        workspaceVideoController = null;
      }
      controller.dispose();
      return false;
    }

    activeVideoSourceKey = sourceKey;
    const exportPromise = exporter.exportAnimation(
      {
        fps: options.fps,
        loopCount: options.loopCount,
        resolution: options.resolution,
        effectOverrides: options.effectOverrides ?? undefined,
        includeStartPlacement: options.includeStartPlacement,
        includeEndHold: options.includeEndHold,
        quality: options.quality,
        carousel: options.carousel,
        ...(options.overlays ? videoOverlayExport(options.overlays) : {}),
        // The offscreen exporter calls this tunnel-shaped input for any custom
        // pair. Supplying the workspace pair keeps its downloaded file aligned
        // with the live animation, including non-blue/red prop choices.
        tunnelPropColors:
          settingsService.settings.primaryPropColors ?? undefined,
      },
      {
        canvas: layoutCanvas,
        playbackController: controller,
        panelState,
      },
      {
        onSuccess: () => {},
        onError: () => {},
        onHaptic: () => {},
      }
    );
    workspaceVideoExport = exportPromise;
    await exportPromise;
    if (workspaceVideoExport === exportPromise) {
      workspaceVideoExport = null;
    }

    if (renderGeneration !== videoRenderGeneration) return false;
    return !!exporter.state.previewBlobUrl;
  }
</script>

{#snippet workspaceLiveVideoPreview()}
  {#if sequence}
    <div class="workspace-live-video-preview">
      <div
        class="preview-frame"
        data-carousel={previewCarousel}
        style:--band-w={previewBand.w}
        style:--band-h={previewBand.h}
        style:--chrome={`${previewChromePx}px`}
      >
        <div class="preview-card" bind:this={previewCardEl}>
          <InlineAnimationPlayer
            {sequence}
            displayWord={workspaceVideoPreviewWord}
            sequenceLoadKey={workspaceVideoPreviewKey}
            chrome="minimal"
            fill={true}
            showControls={false}
            autoPlay={true}
            autoPlayDelay={0}
            externalBpm={videoBpm}
            interactive={true}
            cornerToggle={true}
            hoverHint="none"
            playbackAllowed={isOpen}
            ephemeral={true}
            visibilityManagerOverride={animationVisibility}
            effectsConfigState={animationVisibility.effectsConfigState ??
              undefined}
            gridVisible={previewOverlays.grid}
            showWordHeader={previewShowsHeader}
            overlayVisibility={{
              ...previewOverlays,
              wordHeader: previewShowsHeader,
              // The file never draws the prop glyph.
              propElementalGlyph: false,
            }}
            leftPropType={settingsService.settings.leftPropType}
            rightPropType={settingsService.settings.rightPropType}
            primaryPropColors={settingsService.settings.primaryPropColors ??
              undefined}
            onStepChange={(step) => (previewStep = step)}
          />
        </div>
        {#if previewCarousel !== "off"}
          <div class="preview-band">
            <StepStrip
              {sequence}
              currentStep={previewStep}
              bpm={videoBpm}
              presentation="spotlight"
              density="compact"
              orientation={videoCarouselOrientation(previewCarousel)}
              fillHeight
              loop
            />
          </div>
        {/if}
      </div>
    </div>
  {/if}
{/snippet}

<!-- Guests can copy the current workspace sequence without saving it. An
     account still gets the short link only when a share action needs it. -->
<PostShareSheet
  {isOpen}
  {sequence}
  shareUrl={guestShareUrl}
  videoBlobUrl={workspaceVideoUrl}
  isExportingVideo={workspaceVideoExporting}
  exportProgress={workspaceVideoProgress}
  liveVideoPreview={workspaceLiveVideoPreview}
  {videoBpm}
  onVideoBpmChange={(next) => (videoBpm = next)}
  onRequestVideo={requestWorkspaceVideo}
  onCancelVideo={cancelWorkspaceVideo}
  onPrepareFile={(artifact) => {
    if (artifact !== "video") return false;
    cancelWorkspaceVideo();
    return true;
  }}
  videoSourceKey={workspaceVideoSourceKey}
  availableArtifacts={["card", "video"]}
  canCreateLink={hasFullAccount}
  onSendInTka={hasFullAccount ? sendSequenceToInbox : undefined}
  needsAccountForFiles={!hasFullAccount}
  onRequestAccount={() =>
    authDrawerState.show("signup", "share-sequence", sequence)}
  onClose={() => {
    cancelWorkspaceVideo();
    onClose();
  }}
/>

<style>
  .workspace-live-video-preview {
    width: 100%;
    height: 100%;
    min-height: 0;
    display: grid;
    place-items: center;
    container-type: size;
  }
  /* The rendered video's frame, contain-fit in the stage: --square is the
     largest animation square that fits beside the carousel band and under
     the header and bar, and the frame is exactly that plus them. */
  .preview-frame {
    --square: min(
      100cqw / (1 + var(--band-w)),
      (100cqh - var(--chrome)) / (1 + var(--band-h))
    );
    display: flex;
    flex-direction: column;
    width: calc(var(--square) * (1 + var(--band-w)));
    height: calc(var(--square) * (1 + var(--band-h)) + var(--chrome));
    min-width: 0;
    min-height: 0;
  }
  .preview-frame[data-carousel="above"] {
    flex-direction: column-reverse;
  }
  .preview-frame[data-carousel="left"] {
    flex-direction: row-reverse;
  }
  .preview-frame[data-carousel="right"] {
    flex-direction: row;
  }
  .preview-card {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
  }
  .preview-band {
    flex-grow: 0;
    flex-shrink: 0;
    display: flex;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    /* The band's depth, as rendered: the square times its ratio. */
    flex-basis: calc(var(--square) * (var(--band-w) + var(--band-h)));
  }
  .preview-band > :global(*) {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
  }
</style>
