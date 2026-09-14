import type {
  IVideoExportOrchestrator,
  VideoExportProgress,
} from "$lib/shared/compose/domain/video-export-types";
import type { Offline3DExporter } from "$lib/shared/3d/services/offline-3d-exporter";
import type { SequenceRenderer } from "$lib/shared/render/services/sequence-renderer";
import { getSequenceRenderer } from "$lib/shared/render/get-sequence-renderer";
import { sanitizeFilename } from "$lib/shared/foundation/services/file-downloader";
import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
import { recordExportThroughput } from "$lib/shared/animation-panel/state/export-timing-tracker";
import { logShareAction } from "$lib/shared/analytics/services/posthog-activity-logger";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
import type { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
import type { AnimationPanelState } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
import type { VideoExportOrchestratorOptions } from "$lib/shared/compose/domain/video-export-types";
import type { AdditionalLayerProps } from "$lib/shared/animation-engine/domain/types/trail-capture-types";

import {
  ensureVideoExportOrchestrator,
  tryGetVideoExportOrchestrator,
} from "$lib/shared/animation-engine/get-video-export-orchestrator";
import { getOffline3DExporter } from "$lib/shared/3d/get-offline-3d-exporter";
import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
import type { CameraKeyframeBuffer } from "$lib/shared/video-export/domain/camera-keyframe";
import { reportImageExportDelivery } from "./image-export-delivery";

export interface VideoExportEffectOverrides {
  fire?: boolean;
  led?: boolean;
  trails?: boolean;
  charcoal?: boolean;
}

export interface VideoExportOptions {
  fps: number;
  loopCount: number;
  resolution: 720 | 1080 | 2160 | 4320;
  effectOverrides?: VideoExportEffectOverrides;
  includeStartPosition?: boolean;
  includeEndHold?: boolean;
  /** Viewer Blue/Red motion toggles; a hand hidden on screen stays hidden in the file. */
  leftMotionVisible?: boolean;
  rightMotionVisible?: boolean;
  /**
   * "standard" (default): one render per output frame, native resolution.
   * "cinema": 2× supersampling + 4× temporal motion blur. Roughly 4-8×
   * slower but produces a visibly smoother, sharper result. 3D exports only.
   */
  quality?: "standard" | "cinema";
  /**
   * Square source-size override (px). Forwarded to the orchestrator so the
   * export sizes itself off this square instead of the live canvas. Set by the
   * tunnel/art export, where the live 2D animator canvas is not mounted.
   */
  sourceSizeOverride?: number;
  /**
   * Per-beat overlaid prop layers injected into the offscreen engine (tunnel
   * kaleidoscope's extra copies). Forwarded to the orchestrator.
   */
  additionalLayersForBeat?: (beat: number) => AdditionalLayerProps[];
  /**
   * Tunnel/art export: per-prop rainbow spectrum (mirrors the live tunnel
   * controller). Forwarded to the orchestrator so the exported kaleidoscope's
   * layer colors match the on-screen view. Omit for normal sequence export.
   */
  tunnelSpectrum?: boolean;
  tunnelPropColors?: VideoExportOrchestratorOptions["tunnelPropColors"];
  /**
   * Per-export chrome-visibility overrides, merged over the global visibility
   * manager (does NOT mutate global state). Forwarded to the orchestrator so
   * tunnel/art export can suppress glyph / header / progress / path lines / grid.
   */
  overlayOverrides?: VideoExportOrchestratorOptions["overlayOverrides"];
}

/**
 * Export state for UI binding
 */
export interface ExportState {
  isExporting: boolean;
  progress: VideoExportProgress | null;
  error: string | null;
  /** Object URL of the exported video blob, available after successful video export */
  previewBlobUrl: string | null;
}

/**
 * Callbacks for export lifecycle events
 */
export interface ExportCallbacks {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  onHaptic: (type: "success" | "error" | "selection") => void;
  /** Native share sheet was dismissed. Optional for existing callers. */
  onCanceled?: () => void;
}

/**
 * Dependencies required for video exports
 */
export interface VideoExportDependencies {
  canvas: HTMLCanvasElement;
  playbackController: AnimationPlaybackController;
  panelState: AnimationPanelState;
}

/**
 * Dependencies required for image exports
 */
export interface ImageExportDependencies {
  sequence: SequenceData;
}

/**
 * Dependencies required for 3D video exports (offline two-pass pipeline).
 * The caller gathers these from the live 3D scene; SequenceModalExporter
 * forwards them into Offline3DExportDependencies.
 */
export interface Video3DExportDependencies {
  webglCanvas: HTMLCanvasElement;
  /** Three.js PerspectiveCamera (from useThrelte().camera) */
  camera: {
    position: {
      x: number;
      y: number;
      z: number;
      set(x: number, y: number, z: number): void;
    };
    quaternion: {
      x: number;
      y: number;
      z: number;
      w: number;
      set(x: number, y: number, z: number, w: number): void;
    };
    fov: number;
    updateProjectionMatrix(): void;
  };
  /** Beats per second for converting animation time to currentStep */
  beatsPerSecond: number;
  /** Total animation duration in seconds (single loop, no start/end hold) */
  totalDurationSeconds: number;
  /** Camera keyframe buffer from pass 1 (or static capture) */
  cameraKeyframes: CameraKeyframeBuffer;
  /** Three.js WebGLRenderer - needed for cinema-mode supersampling resize */
  renderer: {
    getSize(target: {
      x: number;
      y: number;
      set(w: number, h: number): unknown;
    }): unknown;
    setSize(w: number, h: number, updateStyle?: boolean): void;
    getPixelRatio(): number;
    setPixelRatio(ratio: number): void;
  };
  /** Run the full Threlte pipeline synchronously for one frame */
  runFrame(timeMs: number): void;
  /** Pause Threlte's native rAF loop for the duration of the export */
  pauseAutoLoop(): void;
  /** Resume Threlte's native rAF loop after export completes */
  resumeAutoLoop(): void;
  /** Signal export mode to the puppet loop */
  setExporting(value: boolean): void;
  /** Set the animation step for the puppet loop to distribute each frame */
  setExportCurrentStep(step: number | null): void;
}

export class SequenceModalExporter {
  private _isExporting = $state(false);
  private _progress = $state<VideoExportProgress | null>(null);
  private _error = $state<string | null>(null);
  private _previewBlobUrl = $state<string | null>(null);
  /** Invalidates callbacks and completions from canceled/superseded exports. */
  private _exportVersion = 0;

  private _videoExportOrchestrator: IVideoExportOrchestrator | null = null;
  private _sequenceRenderer: SequenceRenderer | null = null;
  private _activeExporter: Offline3DExporter | null = null;

  private async resolveVideoExportOrchestrator(): Promise<IVideoExportOrchestrator> {
    // Registration happens in deferred-registrations.ts via idle callback, so
    // it can legitimately not have run yet when a viewer host reaches export.
    // ensure* loads that module on demand rather than losing the export to the
    // race.
    this._videoExportOrchestrator ??=
      tryGetVideoExportOrchestrator() ??
      (await ensureVideoExportOrchestrator());
    return this._videoExportOrchestrator;
  }

  private get sequenceRenderer(): SequenceRenderer | null {
    if (!this._sequenceRenderer) {
      this._sequenceRenderer = getSequenceRenderer();
    }
    return this._sequenceRenderer;
  }

  get state(): ExportState {
    return {
      isExporting: this._isExporting,
      progress: this._progress,
      error: this._error,
      previewBlobUrl: this._previewBlobUrl,
    };
  }

  async exportAnimation(
    options: VideoExportOptions,
    deps: VideoExportDependencies,
    callbacks: ExportCallbacks
  ): Promise<void> {
    const exportVersion = ++this._exportVersion;
    this._isExporting = true;
    this._error = null;
    this._progress = { progress: 0, stage: "capturing" };
    this.revokePreviewUrl();

    const exportStartTime = performance.now();
    let capturedFrameCount = 0;

    try {
      const orchestrator = await this.resolveVideoExportOrchestrator();
      const blob = await orchestrator.executeExport(
        deps.canvas,
        deps.playbackController,
        deps.panelState,
        (progress) => {
          if (exportVersion !== this._exportVersion) return;
          this._progress = progress;
          if (progress.totalFrames) {
            capturedFrameCount = progress.totalFrames;
          }
          if (progress.stage === "complete") {
            callbacks.onHaptic("success");
            callbacks.onSuccess("Video exported!");
          } else if (progress.stage === "error") {
            callbacks.onHaptic("error");
            this._error = progress.error || "Export failed. Please try again.";
            callbacks.onError(this._error);
          }
        },
        {
          compositeMode: "none",
          // The viewer is preview-first: it surfaces previewBlobUrl in
          // VideoPreviewPanel and saves on a user gesture (share on mobile /
          // download on desktop). Suppress the orchestrator's side-effect
          // download so nothing hits disk without the user's tap.
          autoDownload: false,
          fps: options.fps,
          loopCount: options.loopCount,
          resolution: options.resolution,
          effectOverrides: options.effectOverrides,
          includeAnimationStartPosition: options.includeStartPosition,
          includeEndHold: options.includeEndHold,
          leftMotionVisible: options.leftMotionVisible,
          rightMotionVisible: options.rightMotionVisible,
          // App mode: the offscreen export engine has no settings wiring, so pass
          // the user's chosen prop explicitly. Without it the export renders the
          // default "staff" instead of the live prop.
          leftPropType:
            settingsService.settings.leftPropType ??
            settingsService.settings.propType ??
            "staff",
          rightPropType:
            settingsService.settings.rightPropType ??
            settingsService.settings.propType ??
            "staff",
          // Tunnel/art export pass-throughs (absent for normal sequence export).
          sourceSizeOverride: options.sourceSizeOverride,
          additionalLayersForBeat: options.additionalLayersForBeat,
          tunnelSpectrum: options.tunnelSpectrum,
          tunnelPropColors: options.tunnelPropColors,
          overlayOverrides: options.overlayOverrides,
        }
      );

      const exportDurationMs = performance.now() - exportStartTime;
      if (capturedFrameCount > 0 && exportDurationMs > 0) {
        recordExportThroughput(
          options.resolution,
          capturedFrameCount,
          exportDurationMs
        );
      }

      if (exportVersion !== this._exportVersion) return;
      this._previewBlobUrl = URL.createObjectURL(blob);
    } catch (error) {
      if (exportVersion !== this._exportVersion) return;
      if ((error as Error).message !== "Export cancelled") {
        console.error(
          "[SequenceModalExporter] Animation export failed:",
          error
        );
        this._error = "Export failed. Please try again.";
        callbacks.onError(this._error);
      }
    } finally {
      if (exportVersion !== this._exportVersion) return;
      this._isExporting = false;
      this._progress = null;
    }
  }

  async export3DAnimation(
    options: VideoExportOptions,
    deps: Video3DExportDependencies,
    callbacks: ExportCallbacks
  ): Promise<void> {
    const exportVersion = ++this._exportVersion;
    const exporter = getOffline3DExporter() as Offline3DExporter;
    if (!exporter) {
      this._error = "3D export services not ready.";
      return;
    }

    this._activeExporter = exporter;
    this._isExporting = true;
    this._error = null;
    this._progress = { progress: 0, stage: "capturing" };
    this.revokePreviewUrl();

    try {
      const blob = await exporter.exportOffline(
        {
          webglCanvas: deps.webglCanvas,
          camera: deps.camera,
          beatsPerSecond: deps.beatsPerSecond,
          totalDurationSeconds: deps.totalDurationSeconds,
          cameraKeyframes: deps.cameraKeyframes,
          renderer: deps.renderer,
          runFrame: deps.runFrame,
          pauseAutoLoop: deps.pauseAutoLoop,
          resumeAutoLoop: deps.resumeAutoLoop,
          setExporting: deps.setExporting,
          setExportCurrentStep: deps.setExportCurrentStep,
        },
        (progress) => {
          if (exportVersion !== this._exportVersion) return;
          this._progress = progress;
          if (progress.stage === "complete") {
            callbacks.onHaptic("success");
            callbacks.onSuccess("3D video exported!");
          }
        },
        {
          fps: options.fps,
          resolution: options.resolution,
          loopCount: options.loopCount,
          includeStartPosition: options.includeStartPosition ?? true,
          includeEndHold: options.includeEndHold ?? false,
          quality: options.quality ?? "standard",
        }
      );

      if (exportVersion !== this._exportVersion) return;
      this._previewBlobUrl = URL.createObjectURL(blob);
    } catch (error) {
      if (exportVersion !== this._exportVersion) return;
      if ((error as Error).message !== "Export cancelled") {
        console.error("[SequenceModalExporter] 3D export failed:", error);
        this._error = "3D export failed. Please try again.";
        callbacks.onError(this._error);
      }
    } finally {
      if (exportVersion !== this._exportVersion) return;
      this._activeExporter = null;
      this._isExporting = false;
      this._progress = null;
    }
  }

  /**
   * Render + deliver a card PNG. `renderOptions` is the complete card-render
   * option set, built by buildCardRenderOptions() so every export path (viewer,
   * QR page, share/download) honors the same panel toggles. Only the output
   * format defaults (stepSize/format/quality) are applied here.
   */
  async exportImage(
    renderOptions: Partial<SequenceExportOptions>,
    deps: ImageExportDependencies,
    callbacks: ExportCallbacks
  ): Promise<void> {
    if (!this.sequenceRenderer) {
      this._error = "Export services not ready. Please try again.";
      return;
    }

    this._isExporting = true;
    this._error = null;

    try {
      const blob = await this.sequenceRenderer.renderSequenceToBlob(
        deps.sequence,
        {
          stepSize: 240,
          format: "PNG",
          quality: 1.0,
          ...renderOptions,
        }
      );

      const seq = deps.sequence;
      const rawName =
        seq.displayName || seq.intendedWord || seq.word || "sequence";
      // Keep the real Greek glyphs (Σ, Φ, Λ…) in the filename — sanitizeFilename
      // preserves Unicode and only strips truly-illegal path chars. Transliterating
      // to ASCII ("phi") was the old behavior Austen rejected.
      const simplified = simplifyRepeatedWord(rawName);
      const safeName = sanitizeFilename(simplified) || "sequence";
      const filename = `${safeName}.png`;

      // Touch devices open the native share sheet; desktop does a plain download.
      // Gated on a coarse pointer so desktop Chrome (which also exposes the Web
      // Share API) still downloads rather than popping a share dialog.
      const coarsePointer =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(pointer: coarse)").matches;

      let shared = false;
      let shareCanceled = false;
      if (
        coarsePointer &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function"
      ) {
        try {
          const file = new File([blob], filename, {
            type: blob.type || "image/png",
          });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: "Flow Arts Composer sequence",
              text: rawName,
            });
            shared = true;
          }
        } catch (err) {
          // Dismissing the share sheet is not a failure; anything else falls
          // through to a regular download.
          if (err instanceof DOMException && err.name === "AbortError") {
            shared = true;
            shareCanceled = true;
          }
        }
      }

      if (!shared) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }

      if (!shareCanceled) {
        void logShareAction(shared ? "sequence_share" : "sequence_export", {
          sequenceId: seq.id,
          sequenceWord: seq.word || seq.intendedWord || seq.displayName,
          sequenceLength: seq.steps.length,
          shareMethod: shared ? "native_file_share" : "download",
          exportFormat: "png",
        });
      }

      reportImageExportDelivery(callbacks, shared, shareCanceled);
    } catch (error) {
      console.error("[SequenceModalExporter] Image export failed:", error);
      callbacks.onHaptic("error");
      this._error = "Export failed. Please try again.";
      callbacks.onError(this._error);
    } finally {
      this._isExporting = false;
    }
  }

  cancel(): void {
    // Raw field, not the lazy getter — never instantiate the orchestrator
    // just to cancel an export that was never started (dispose() runs this
    // on unmount, possibly before deferred registrations have loaded).
    this._exportVersion += 1;
    this._videoExportOrchestrator?.cancelExport();
    this._activeExporter?.cancel();
    this._activeExporter = null;
    this._isExporting = false;
    this._progress = null;
  }

  dismissPreview(): void {
    this.revokePreviewUrl();
  }

  clearError(): void {
    this._error = null;
  }

  dispose(): void {
    this.cancel();
    this.revokePreviewUrl();
    this._error = null;
  }

  private revokePreviewUrl(): void {
    if (this._previewBlobUrl) {
      URL.revokeObjectURL(this._previewBlobUrl);
      this._previewBlobUrl = null;
    }
  }
}

export const sequenceModalExporter = new SequenceModalExporter();
