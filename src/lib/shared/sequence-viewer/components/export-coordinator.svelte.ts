/**
 * ExportCoordinator.svelte.ts
 *
 * Reactive module that owns export state and logic:
 * - 2D/3D export routing, recording countdown, progress tracking
 * - exportOptions, animationCanvas, isExporting, exportProgress
 * - 3D recording: camera keyframes, countdown, Pass 1/2 workflow
 * - viewer3DState management for recording
 *
 * Extracted from SequenceViewerOrchestrator.
 */

import type { ResolvedPropConfig } from "$lib/shared/foundation/services/recorded-prop-intent";
import type { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
import type { AnimationPanelState } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  capturePosterFrame,
  compositeContainerLayers,
} from "../tunnel/tunnel-poster";
import { showToast } from "$lib/shared/toast/state/toast-state.svelte";
import {
  sequenceModalExporter,
  type Video3DExportDependencies,
} from "$lib/shared/sequence-viewer/services/sequence-modal-exporter.svelte";
import type { AdditionalLayerProps } from "$lib/shared/animation-engine/domain/types/trail-capture-types";
import type { TunnelPropColorPair } from "$lib/shared/sequence-viewer/tunnel/tunnel-prop-colors";
import { getExportOptionsState } from "$lib/shared/animation-panel/state/export-options-state.svelte";
import { CameraKeyframeBuffer } from "$lib/shared/video-export/domain/camera-keyframe";
import {
  saveFilmRecipe,
  updateFilmRenderOptions,
} from "$lib/features/scene-3d-collection/services/save-film-recipe";
import type { Scene3DFilmRender } from "$lib/features/scene-3d-collection/domain/scene-3d-collection-types";
import {
  putRenderedFilm,
  pruneRenderedFilms,
} from "$lib/shared/video-export/services/rendered-film-store";
import { ensureFullAccountForExport } from "$lib/shared/auth/domain/export-gate";
import {
  openerAddsHold,
  VIDEO_OPENER_HOLD_BEATS,
  type VideoOpener,
  type VideoOpenerRequest,
} from "$lib/shared/share/domain/video-opener";
import { loadOpenerImage } from "$lib/shared/compose/domain/video-opener-frame";
import { getRenderContextRegistry } from "$lib/shared/animation-engine/get-render-context-registry";
import { renderMandalaOpener } from "$lib/shared/share/services/video-opener-mandala";
import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
import { buildCardRenderOptions } from "$lib/shared/share/services/card-render-options";
import type { ResolvedAutoLayout } from "$lib/shared/render/services/container-aware-layout";
import {
  sanitizeFilename,
  shareOrDownloadBlob,
} from "$lib/shared/foundation/services/file-downloader";
import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
import { detectPlatform } from "$lib/shared/mobile/services/platform-detector";
import { logShareAction } from "$lib/shared/analytics/services/posthog-activity-logger";
import type { createViewer3DState } from "$lib/shared/3d/state/viewer-3d-state.svelte";
import type { createModalAccessibilityHelper } from "$lib/shared/sequence-viewer/services/modal-accessibility-helper.svelte";
type ExportType = "animation" | "image" | "both";

/**
 * Who delivers the finished file. Default (`true`) is the viewer's own Export
 * button: save it and say so. A caller that owns delivery — the share sheet,
 * which shows the render and hands it to a destination — passes `false`.
 */
export interface ExportRequestOptions {
  autoDeliver?: boolean;
  /** The image the clip opens with; the share sheet's choice. */
  opener?: VideoOpenerRequest;
}

type Viewer3DState = ReturnType<typeof createViewer3DState>;
type AccessibilityHelper = ReturnType<typeof createModalAccessibilityHelper>;

export interface ExportCoordinatorDeps {
  getPropConfig?: () => ResolvedPropConfig;
  viewer3DState: Viewer3DState;
  accessibilityHelper: AccessibilityHelper;
  /**
   * Viewer Blue/Red motion toggles, read at export time. The offscreen export
   * engine is a fresh instance, so the 2D export forwards these explicitly;
   * without them a hand hidden on screen still renders in the file.
   */
  getMotionVisibility?: () => { left: boolean; right: boolean };
}

export function createExportCoordinator(deps: ExportCoordinatorDeps) {
  const { viewer3DState, accessibilityHelper, getMotionVisibility } = deps;
  const measuredVideoUrls = new Set<string>();

  const exportOptions = getExportOptionsState();

  let animationCanvas = $state<HTMLCanvasElement | null>(null);

  // ── 3D recording UI state ──
  const countdownValue = $state(0);
  let isRecording3D = $state(false);
  let recordingElapsed = $state(0);
  let recordingTimer: ReturnType<typeof setInterval> | null = null;
  let resolveRecording: (() => void) | null = null;

  // Between Stop and the offline render, the person picks how good the render
  // should be. The recording is already saved by then, so backing out here
  // costs them nothing.
  let pendingFilmRender = $state<{ durationSeconds: number } | null>(null);
  let resolvePendingRender: ((render: boolean) => void) | null = null;
  let lastFilmEntryId: string | null = null;

  function handleConfirmFilmRender(): void {
    resolvePendingRender?.(true);
  }

  function handleDiscardFilmRender(): void {
    resolvePendingRender?.(false);
  }

  /**
   * Put the film that just finished rendering into local retention, and drop
   * the oldest ones once the cap is reached. Never throws: the export already
   * succeeded, and the person is looking at the preview.
   */
  async function retainRenderedFilm(input: {
    filmEntryId: string | null;
    sequence: SequenceData | null;
    render: Scene3DFilmRender;
    durationSeconds: number;
  }): Promise<void> {
    try {
      const url = sequenceModalExporter.state.previewBlobUrl;
      if (!url) return;
      const blob = await (await fetch(url)).blob();
      const word = simplifyRepeatedWord(
        input.sequence?.displayName ||
          input.sequence?.intendedWord ||
          input.sequence?.word ||
          ""
      );
      await putRenderedFilm({
        id: `film-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        filmEntryId: input.filmEntryId,
        sequenceId: input.sequence?.id ?? null,
        word,
        blob,
        mimeType: blob.type || "video/mp4",
        byteSize: blob.size,
        render: { ...input.render },
        durationSeconds: input.durationSeconds,
        createdAt: Date.now(),
      });
      await pruneRenderedFilms();
    } catch (error) {
      console.warn("[RenderedFilms] Could not keep the finished film:", error);
    }
  }

  function handleCanvasReady(canvas: HTMLCanvasElement | null) {
    animationCanvas = canvas;
  }

  /** A small, presentational capture of the live animation canvas. Export owns
   * the canvas handle, so sharing can show the current view without creating a
   * second renderer or starting an export. */
  function captureAnimationPreview(): string {
    if (!animationCanvas) return "";
    // Effects and trails are sibling canvases near the registered prop canvas.
    // Capture that owned stage when present, while retaining its actual aspect.
    const stage = animationCanvas.parentElement;
    const scale = Math.min(
      1,
      960 / Math.max(animationCanvas.width, animationCanvas.height)
    );
    const width = Math.round(animationCanvas.width * scale);
    const height = Math.round(animationCanvas.height * scale);
    const composite = stage
      ? compositeContainerLayers(
          stage,
          Math.max(width, height),
          undefined,
          true
        )
      : null;
    return capturePosterFrame(composite ?? animationCanvas, {
      width,
      height,
    });
  }

  /** Yields to the live render loop so a jumped-to pose is on the canvas. */
  function waitForPaint(frames: number): Promise<void> {
    return new Promise((resolve) => {
      let remaining = frames;
      const step = () => {
        remaining -= 1;
        if (remaining <= 0) resolve();
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  /**
   * The image a shared clip opens with, as a data URL for the sheet's stage.
   * "First beat" reuses the export's own start-up dance: pause, jump to the
   * start position, let the live canvas paint it, capture, and put playback
   * back where it was. "This frame" is the plain current-view capture and
   * "Mandala" is drawn from the sequence, so neither touches playback.
   */
  async function captureVideoOpener(
    kind: VideoOpener,
    playbackController: AnimationPlaybackController | null,
    panelState: AnimationPanelState,
    sequence: SequenceData | null
  ): Promise<string> {
    if (kind === "mandala") {
      if (!sequence) return "";
      const config = deps.getPropConfig?.();
      return renderMandalaOpener(sequence, {
        leftPropType:
          config?.leftPropType ??
          settingsService.settings.leftPropType ??
          settingsService.settings.propType ??
          "staff",
        rightPropType:
          config?.rightPropType ??
          settingsService.settings.rightPropType ??
          settingsService.settings.propType ??
          "staff",
      });
    }
    if (kind === "this-frame" || !playbackController || !animationCanvas) {
      return captureAnimationPreview();
    }
    const wasPlaying = panelState.isPlaying;
    const step = panelState.currentStep;
    if (wasPlaying) playbackController.togglePlayback();
    // The export clears its trail history and overlay buffers before its first
    // frame. Do the same on the live context that owns this canvas, then jump,
    // so the thumbnail is the pose the clip opens on and nothing the trail was
    // still fading out. Sibling layers such as path lines repaint as usual.
    const live = getRenderContextRegistry()
      .getAll()
      .find((context) => context.canvas === animationCanvas);
    live?.trailCapturer.clearTrails();
    live?.effectManager.trailOverlay?.clearBuffers();
    playbackController.jumpToStep(0);
    await waitForPaint(3);
    const url = captureAnimationPreview();
    playbackController.jumpToStep(step);
    if (wasPlaying) playbackController.togglePlayback();
    return url;
  }

  function handleCancelExport() {
    sequenceModalExporter.cancel();
  }

  function handleRetryExport(handleExportFn: () => Promise<unknown>) {
    sequenceModalExporter.clearError();
    handleExportFn();
  }

  function dismissPreview() {
    sequenceModalExporter.dismissPreview();
    accessibilityHelper.announce("Ready to export again");
  }

  /**
   * Deliver the finished export video on a FRESH user gesture — share sheet on
   * mobile, download straight to disk on desktop. Reads the preview blob URL
   * lazily, so the same function serves the "Video ready" toast's Download
   * action, the inline VideoPreviewPanel Save button, and any re-save.
   */
  async function saveExportedVideo(effectiveSequence: SequenceData | null) {
    const url = sequenceModalExporter.state.previewBlobUrl;
    if (!url) return;
    const rawName =
      effectiveSequence?.displayName ||
      effectiveSequence?.intendedWord ||
      effectiveSequence?.word ||
      "sequence";
    const safeName =
      sanitizeFilename(simplifyRepeatedWord(rawName)) || "sequence";
    const blob = await (await fetch(url)).blob();
    const result = await shareOrDownloadBlob(blob, `${safeName}.mp4`, {
      title: "Flow Arts Composer sequence",
    });

    if (result.success && !result.canceled && !measuredVideoUrls.has(url)) {
      measuredVideoUrls.add(url);
      void logShareAction(
        result.method === "share" ? "sequence_share" : "sequence_export",
        {
          sequenceId: effectiveSequence?.id,
          sequenceWord:
            effectiveSequence?.word ||
            effectiveSequence?.intendedWord ||
            effectiveSequence?.displayName,
          sequenceLength: effectiveSequence?.steps.length,
          shareMethod:
            result.method === "share" ? "native_file_share" : "download",
          exportFormat: "mp4",
        }
      );
    }
  }

  /**
   * Preview-first completion signal. Once the video blob exists, surface an
   * ACTIONABLE toast whose button IS the save gesture. Chrome 125+ enforces
   * transient user activation on downloads, so a programmatic download fired at
   * export-completion (seconds after the trigger click, activation long expired)
   * is silently dropped — even in a focused, foreground tab. A toast-button
   * click is a fresh gesture, so the download fires reliably. The inline
   * VideoPreviewPanel Save button is the same action, as a durable fallback.
   * Deliberately NOT a "Video exported!" toast: nothing has hit disk yet.
   */
  function notifyVideoReady(effectiveSequence: SequenceData | null) {
    if (
      !sequenceModalExporter.state.previewBlobUrl ||
      sequenceModalExporter.state.error
    ) {
      return;
    }
    const saveLabel = detectPlatform() === "desktop" ? "Download" : "Save";
    showToast({
      message: "Video ready",
      type: "success",
      duration: 12000,
      action: {
        label: saveLabel,
        onClick: () => void saveExportedVideo(effectiveSequence),
      },
    });
    accessibilityHelper.announce(
      `Video ready. Activate ${saveLabel} to keep it.`,
      "assertive"
    );
  }

  /**
   * Completion delivery. Auto-downloads the moment the render finishes — the
   * zero-click path — then keeps the toast + inline preview Save as the
   * guaranteed fallback.
   *
   * The auto-download is best-effort by browser rule: a programmatic download
   * fires reliably only from a FOCUSED tab (the common case — the user just
   * watched it render). Browsers defer/block downloads initiated from a hidden
   * tab, and drop any download once the trigger's transient activation has
   * expired (~5s). So if the user tabbed away mid-render, the auto-download is
   * suppressed and the actionable toast (its button IS a fresh gesture) + the
   * preview Save become the delivery. Both read the same blob, so no double file
   * unless the user also clicks after a successful auto-download.
   */
  function autoDeliverExportedVideo(effectiveSequence: SequenceData | null) {
    if (
      !sequenceModalExporter.state.previewBlobUrl ||
      sequenceModalExporter.state.error
    ) {
      return;
    }
    const tabFocused = typeof document === "undefined" || !document.hidden;
    if (tabFocused) void saveExportedVideo(effectiveSequence);
    notifyVideoReady(effectiveSequence);
  }

  // The tunnel (Art mode) export drives the shared offscreen engine with a
  // square sourceSizeOverride (the live 2D animator canvas is unmounted in Art
  // mode) + the kaleidoscope's per-step layers, all chrome suppressed. A bare
  // square placeholder satisfies the dependency signature without touching the
  // live DOM.
  function createArtExportPlaceholderCanvas(size: number): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    return c;
  }

  /**
   * Tunnel (Art-mode) video export — preview-first. Renders the kaleidoscope via
   * the shared offscreen engine (square sourceSizeOverride + per-step layers +
   * chrome suppressed), then leaves the result on
   * sequenceModalExporter.previewBlobUrl for ArtPane to surface inline
   * (VideoPreviewPanel: play / save / share). NOTHING auto-downloads — the user
   * picks save/share from the preview. Errors still toast (a failed export must
   * not look like nothing happened).
   *
   * Resolves `false` when the request was refused before any render began — an
   * export already running, the take-it-home account gate, an unready
   * controller. The share sheet shows its own "Rendering tunnel…" state and has
   * to honour that, or it spins on a render that never started.
   */
  async function exportTunnel(
    playbackController: AnimationPlaybackController | null,
    modalAnimationState: AnimationPanelState,
    hapticService: HapticFeedback | null,
    additionalLayersForBeat: (beat: number) => AdditionalLayerProps[],
    // Per-prop rainbow spectrum, mirrored from the live tunnel controller so the
    // offscreen engine colors the kaleidoscope to match the on-screen view.
    tunnelSpectrum: boolean,
    tunnelPropColors: TunnelPropColorPair | null
  ): Promise<boolean> {
    if (sequenceModalExporter.state.isExporting) return false;

    // Take-it-home gate: same as the 2D path — producing the file needs a
    // free account.
    if (!(await ensureFullAccountForExport())) return false;

    if (!playbackController) {
      showToast(
        "Animation not ready yet. Wait a moment and try again.",
        "error"
      );
      return false;
    }

    hapticService?.trigger("selection");

    const opts = exportOptions.getVideoOptions();
    const squareSize = opts.resolution ?? 1080;

    const callbacks = {
      onSuccess: (message: string) => {
        // No success toast — the inline VideoPreviewPanel ("Export complete" +
        // the playable result) IS the visible signal. A toast would imply the
        // file was saved, but preview-first saves nothing until the user picks.
        accessibilityHelper.announce(message, "assertive");
      },
      onError: (message: string) => {
        // Visible toast — a failed tunnel export must not look like nothing
        // happened (the old Art path announced to the screen reader only).
        showToast(message, "error");
        accessibilityHelper.announce(`Export failed: ${message}`, "assertive");
      },
      onHaptic: (type: "success" | "error" | "selection") => {
        hapticService?.trigger(type);
      },
    };

    await sequenceModalExporter.exportAnimation(
      {
        fps: opts.fps,
        loopCount: opts.loopCount,
        resolution: opts.resolution,
        includeStartPlacement: opts.includeStartPlacement,
        includeEndHold: opts.includeEndHold,
        sourceSizeOverride: squareSize,
        additionalLayersForBeat,
        tunnelSpectrum,
        tunnelPropColors,
        overlayOverrides: {
          tkaGlyph: false,
          elementalGlyph: false,
          stepNumbers: false,
          wordHeader: false,
          progressBar: false,
          leftPathLines: false,
          rightPathLines: false,
          grid: false,
        },
      },
      {
        canvas: createArtExportPlaceholderCanvas(squareSize),
        playbackController,
        panelState: modalAnimationState,
      },
      callbacks
    );
    // No auto-download: ArtPane surfaces previewBlobUrl in VideoPreviewPanel and
    // the user saves/shares from there.
    return true;
  }

  function handleStopRecording() {
    if (resolveRecording) resolveRecording();
  }

  /**
   * The 3D stage hands up its canvas and Threlte handles from inside the Threlte
   * canvas component, several frames after the scene itself reports loaded.
   * Through that window the viewer looks completely ready — stage drawn, Record
   * Scene pill up, Share up — while `webglCanvas` and the five handles are still
   * null, and an export asked for there was refused outright ("Animation not
   * ready yet", "3D scene not ready for export"). Reproducible by clicking Share
   * the moment the button appears. Wait for the handles instead of turning the
   * user away for being quick.
   */
  async function await3DExportHandles(timeoutMs = 10000): Promise<void> {
    const ready = () =>
      !!viewer3DState.webglCanvas &&
      !!viewer3DState.threlteCamera &&
      !!viewer3DState.threlteRenderer &&
      !!viewer3DState.threlteRunFrame &&
      !!viewer3DState.threltePauseAutoLoop &&
      !!viewer3DState.threlteResumeAutoLoop;

    const deadline = Date.now() + timeoutMs;
    while (!ready() && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    // Timing out is not handled here: the gates below already own the "not
    // ready" message, and reaching them means the stage genuinely never came up.
  }

  /**
   * Runs an export for the current pane. Resolves `false` when the request was
   * refused before any render began — wrong pane, an export already in flight,
   * the take-it-home account gate, an unready canvas or scene. A caller that
   * shows its own "rendering…" state must honour that `false`, or it spins
   * forever on a render that was never going to happen.
   */
  async function handleExport(
    editingPane: "animation" | "image" | "video-upload" | null,
    effectiveSequence: SequenceData | null,
    playbackController: AnimationPlaybackController | null,
    modalAnimationState: AnimationPanelState,
    hapticService: HapticFeedback | null,
    isPlayingLocal: boolean,
    bpmLocal: number,
    isHandPath: boolean,
    resolvedAutoLayout: ResolvedAutoLayout | null,
    options?: ExportRequestOptions
  ): Promise<boolean> {
    // The share sheet asks for a render it is going to deliver itself. Without
    // this the same take also lands in Downloads and toasts "Video ready" —
    // a 34 MB file the user never asked for, once per attempt.
    const autoDeliver = options?.autoDeliver !== false;
    const exportType: ExportType | null =
      editingPane === "animation"
        ? "animation"
        : editingPane === "image"
          ? "image"
          : null;

    if (sequenceModalExporter.state.isExporting || !exportType) return false;

    // Take-it-home gate: guests play with export settings freely, but pulling
    // the actual file down requires a free account.
    if (!(await ensureFullAccountForExport())) return false;

    hapticService?.trigger("selection");

    const callbacks = {
      onSuccess: (message: string) => {
        showToast(message, "success");
        accessibilityHelper.announce(message, "assertive");
        // Image export keeps the settings panel open so the user can tweak and
        // re-export. Auto-exiting here used to flip editingPane away from
        // "image", which dropped the preview card off exportOptions.imageDarkMode
        // and snapped it back to the global (dark) theme — the "card goes dark
        // after export" bug. Staying in export mode keeps the preview stable.
      },
      onError: (message: string) => {
        accessibilityHelper.announce(`Export failed: ${message}`, "assertive");
      },
      onHaptic: (type: "success" | "error" | "selection") => {
        hapticService?.trigger(type);
      },
    };

    // Video (animation) export is preview-first: the completion signal is the
    // actionable "Video ready" toast fired by notifyVideoReady AFTER the blob
    // URL exists — NOT a "saved!" toast here, because nothing is on disk until
    // the user's fresh save gesture. Errors still toast (a failed export must
    // not look like nothing happened).
    const videoCallbacks = {
      onSuccess: (_message: string) => {
        // Intentionally silent — notifyVideoReady owns the completion signal.
      },
      onError: (message: string) => {
        showToast(message, "error");
        accessibilityHelper.announce(`Export failed: ${message}`, "assertive");
      },
      onHaptic: (type: "success" | "error" | "selection") => {
        hapticService?.trigger(type);
      },
    };

    // 3D mode: real-time capture from WebGL canvas
    const is3DMode = viewer3DState.renderMode === "3d";
    if (is3DMode && exportType === "animation") await await3DExportHandles();
    const webglCanvas = viewer3DState.webglCanvas;

    if (
      exportType === "animation" &&
      is3DMode &&
      webglCanvas &&
      playbackController
    ) {
      const opts = exportOptions.getVideoOptions();
      const secondsPerBeat = 1.0 / modalAnimationState.speed;
      const beatsPerSecond = modalAnimationState.speed;
      const steps = effectiveSequence?.steps ?? [];
      const totalDurationUnits = steps.reduce(
        (sum, s) => sum + (s.duration ?? 1),
        0
      );
      const startDur = opts.includeStartPlacement ? 1 : 0;
      const endDur = opts.includeEndHold ? 1 : 0;
      const singleLoopSec =
        (startDur + totalDurationUnits + endDur) * secondsPerBeat;

      const threlteCamera = viewer3DState.threlteCamera as
        | Video3DExportDependencies["camera"]
        | null;
      const threlteRenderer = viewer3DState.threlteRenderer as
        | Video3DExportDependencies["renderer"]
        | null;
      const threlteRunFrame = viewer3DState.threlteRunFrame;
      const threltePauseAutoLoop = viewer3DState.threltePauseAutoLoop;
      const threlteResumeAutoLoop = viewer3DState.threlteResumeAutoLoop;
      if (
        !threlteCamera ||
        !threlteRenderer ||
        !threlteRunFrame ||
        !threltePauseAutoLoop ||
        !threlteResumeAutoLoop
      ) {
        showToast("3D scene not ready for export. Please try again.", "error");
        return false;
      }

      // ── Pass 1: Camera Performance Recording ──
      const cameraKeyframes = new CameraKeyframeBuffer();

      const choreography = viewer3DState.cameraChoreography;
      const useOrbit = choreography.activePresetId === "auto-orbit";

      const primaryAvatar =
        viewer3DState.performerManager.performers[0] ?? null;
      const orbitPreset = useOrbit ? choreography.activePreset : null;
      const presetTotalLoops = orbitPreset?.totalLoops ?? 1;
      const presetDurationSec = useOrbit ? singleLoopSec * presetTotalLoops : 0;

      const disposeDriver: (() => void) | null = useOrbit
        ? choreography.applyPreset("auto-orbit", {
            performers: viewer3DState.performerManager.performers,
            sequenceDurationSec: singleLoopSec,
          })
        : null;
      const driverActive = !!disposeDriver;

      const loopBefore = primaryAvatar?.loop ?? false;
      if (driverActive && primaryAvatar) primaryAvatar.loop = true;

      // Start camera recording
      cameraKeyframes.startRecording(threlteCamera);
      isRecording3D = true;
      recordingElapsed = 0;
      recordingTimer = setInterval(() => {
        recordingElapsed += 0.1;
      }, 100);

      let boundaryPoller: ReturnType<typeof setInterval> | null = null;
      let autoStopTimer: ReturnType<typeof setTimeout> | null = null;
      if (driverActive && primaryAvatar) {
        let prevProgress = primaryAvatar.progress;
        let completedLoops = 0; // eslint-disable-line @typescript-eslint/no-unused-vars
        boundaryPoller = setInterval(() => {
          const p = primaryAvatar.progress;
          if (prevProgress > 0.85 && p < 0.15) {
            completedLoops += 1;
            choreography.emitLoopBoundary();
          }
          prevProgress = p;
        }, 1000 / 60);
        autoStopTimer = setTimeout(
          () => {
            if (resolveRecording) resolveRecording();
          },
          Math.round(presetDurationSec * 1000) + 200
        );
      }

      try {
        await new Promise<void>((resolve) => {
          resolveRecording = resolve;
        });
      } finally {
        if (boundaryPoller) clearInterval(boundaryPoller);
        if (autoStopTimer) clearTimeout(autoStopTimer);
        if (disposeDriver) disposeDriver();
        if (driverActive && primaryAvatar) primaryAvatar.loop = loopBefore;
      }

      cameraKeyframes.stopRecording();
      isRecording3D = false;
      resolveRecording = null;
      if (recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
      }

      const recordedDuration = cameraKeyframes.duration;
      if (recordedDuration <= 0) {
        showToast("Recording too short. Please try again.", "error");
        return false;
      }

      // Save the recipe first: the scene, the camera path, and the render
      // settings. From here on the performance survives even if the person
      // backs out of rendering, or dismisses the finished video.
      const recipeRender: Scene3DFilmRender = {
        fps: opts.fps,
        resolution: opts.resolution,
        quality: opts.quality,
        includeStartPlacement: opts.includeStartPlacement,
        includeEndHold: opts.includeEndHold,
      };
      const filmEntry = await saveFilmRecipe({
        viewer3DState,
        sequence: effectiveSequence,
        bpm: bpmLocal,
        keyframes: cameraKeyframes.keyframes,
        cameraMode: useOrbit ? "auto-orbit" : "free",
        render: recipeRender,
      });
      lastFilmEntryId = filmEntry?.id ?? null;

      // ── The render card: how good, or not at all ──
      pendingFilmRender = { durationSeconds: recordedDuration };
      const wantsRender = await new Promise<boolean>((resolve) => {
        resolvePendingRender = resolve;
      });
      pendingFilmRender = null;
      resolvePendingRender = null;
      if (!wantsRender) {
        showToast("Recording kept in your scenes. Render it any time.", "info");
        return false;
      }

      // ── Pass 2: Deterministic Offline Render ──
      // Read the options AFTER the card, so the preset just chosen is the one
      // that renders.
      const renderOpts = exportOptions.getVideoOptions();
      if (lastFilmEntryId) {
        void updateFilmRenderOptions(lastFilmEntryId, {
          fps: renderOpts.fps,
          resolution: renderOpts.resolution,
          quality: renderOpts.quality,
          includeStartPlacement: renderOpts.includeStartPlacement,
          includeEndHold: renderOpts.includeEndHold,
        });
      }

      let exported3DOk = false;
      try {
        await sequenceModalExporter.export3DAnimation(
          {
            fps: renderOpts.fps,
            loopCount: 1,
            resolution: renderOpts.resolution,
            includeStartPlacement: renderOpts.includeStartPlacement,
            includeEndHold: renderOpts.includeEndHold,
            quality: renderOpts.quality,
          },
          {
            webglCanvas,
            camera: threlteCamera,
            beatsPerSecond,
            totalDurationSeconds: recordedDuration,
            cameraKeyframes,
            renderer: threlteRenderer,
            runFrame: threlteRunFrame,
            pauseAutoLoop: threltePauseAutoLoop,
            resumeAutoLoop: threlteResumeAutoLoop,
            setExporting: (value: boolean) => {
              viewer3DState.isExporting = value;
            },
            setExportCurrentStep: (step: number | null) => {
              viewer3DState.exportCurrentStep = step;
            },
          },
          videoCallbacks
        );
        exported3DOk = true;
      } finally {
        isRecording3D = false;
        recordingElapsed = 0;
        if (recordingTimer) {
          clearInterval(recordingTimer);
          recordingTimer = null;
        }
      }
      // Keep the finished file on the device so dismissing the preview costs
      // nothing. Fire and forget: retention is a convenience, and a storage
      // failure must not read as a failed export.
      if (exported3DOk) {
        void retainRenderedFilm({
          filmEntryId: lastFilmEntryId,
          sequence: effectiveSequence,
          render: {
            fps: renderOpts.fps,
            resolution: renderOpts.resolution,
            quality: renderOpts.quality,
            includeStartPlacement: renderOpts.includeStartPlacement,
            includeEndHold: renderOpts.includeEndHold,
          },
          durationSeconds: recordedDuration,
        });
      }
      // Auto-download on finish (focused tab) + toast/preview fallback.
      if (exported3DOk && autoDeliver)
        autoDeliverExportedVideo(effectiveSequence);
      return true;
    }

    // 2D mode: frame-by-frame capture from PixiJS canvas
    if (exportType === "animation" && playbackController && animationCanvas) {
      const opts = exportOptions.getVideoOptions();
      const motion = getMotionVisibility?.();
      // The opener hold is baked from the very image the sheet showed, so the
      // clip's first frame is exactly the thumbnail the person chose.
      const openerRequest = options?.opener;
      const openerImage =
        openerRequest && openerAddsHold(openerRequest.kind)
          ? await loadOpenerImage(openerRequest.imageUrl)
          : null;
      await sequenceModalExporter.exportAnimation(
        {
          fps: opts.fps,
          loopCount: opts.loopCount,
          resolution: opts.resolution,
          includeStartPlacement: opts.includeStartPlacement,
          includeEndHold: opts.includeEndHold,
          leftMotionVisible: motion?.left,
          rightMotionVisible: motion?.right,
          opener: openerImage
            ? { image: openerImage, holdBeats: VIDEO_OPENER_HOLD_BEATS }
            : undefined,
        },
        {
          canvas: animationCanvas,
          playbackController,
          panelState: modalAnimationState,
        },
        videoCallbacks
      );
      // Auto-download on finish (focused tab) + toast/preview fallback.
      if (autoDeliver) autoDeliverExportedVideo(effectiveSequence);
    } else if (
      exportType === "animation" &&
      (!playbackController || !animationCanvas)
    ) {
      showToast(
        "Animation not ready yet. Wait a moment and try again.",
        "error"
      );
      return false;
    } else if (exportType === "image" && effectiveSequence) {
      if (!effectiveSequence.steps || effectiveSequence.steps.length === 0) {
        showToast("Sequence has no steps to export.", "error");
        return false;
      }
      // All card toggles (word/difficulty/LOOP/mandala/QR/grid/footer/columns/
      // start-layout) + hand-path suppression come from the one canonical builder,
      // so the downloaded PNG matches the live ChoreoCard preview.
      const renderOptions = buildCardRenderOptions(effectiveSequence, {
        propConfig: deps.getPropConfig?.(),
        darkMode: exportOptions.imageDarkMode,
        isHandPath,
        resolvedAutoLayout,
      });
      await sequenceModalExporter.exportImage(
        renderOptions,
        { sequence: effectiveSequence },
        callbacks
      );
    }

    return true;
  }

  function dispose() {
    // A viewer torn down while the render card is up must not leave the export
    // waiting forever on a choice nobody can make any more.
    resolvePendingRender?.(false);
    sequenceModalExporter.dispose();
    if (recordingTimer) {
      clearInterval(recordingTimer);
      recordingTimer = null;
    }
  }

  return {
    exportOptions,
    get animationCanvas() {
      return animationCanvas;
    },
    get isExporting() {
      return sequenceModalExporter.state.isExporting;
    },
    get exportProgress() {
      return sequenceModalExporter.state.progress;
    },
    get exportError() {
      return sequenceModalExporter.state.error;
    },
    get previewBlobUrl() {
      return sequenceModalExporter.state.previewBlobUrl;
    },
    get countdownValue() {
      return countdownValue;
    },
    get isRecording3D() {
      return isRecording3D;
    },
    get recordingElapsed() {
      return recordingElapsed;
    },
    get pendingFilmRender() {
      return pendingFilmRender;
    },
    get lastFilmEntryId() {
      return lastFilmEntryId;
    },
    handleConfirmFilmRender,
    handleDiscardFilmRender,
    handleCanvasReady,
    captureAnimationPreview,
    captureVideoOpener,
    handleCancelExport,
    handleRetryExport,
    handleExport,
    exportTunnel,
    handleStopRecording,
    dismissPreview,
    saveExportedVideo,
    dispose,
  };
}

export type ExportCoordinatorState = ReturnType<typeof createExportCoordinator>;
