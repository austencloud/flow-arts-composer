import { getExportOptionsState } from "$lib/shared/animation-panel/state/export-options-state.svelte";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  sanitizeFilename,
  shareOrDownloadBlob,
} from "$lib/shared/foundation/services/file-downloader";
import type { createViewer3DState } from "$lib/shared/3d/state/viewer-3d-state.svelte";
import { ensureFullAccountForExport } from "$lib/shared/auth/domain/export-gate";
import {
  sequenceModalExporter,
  type Video3DExportDependencies,
} from "$lib/shared/sequence-viewer/services/sequence-modal-exporter.svelte";
import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
import { CameraKeyframeBuffer } from "$lib/shared/video-export/domain/camera-keyframe";
import type { Scene3DFilm } from "$lib/features/scene-3d-collection/domain/scene-3d-collection-types";

type Viewer3DState = ReturnType<typeof createViewer3DState>;

/**
 * Scene Studio's export adapter. The offline renderer and export-option state
 * stay owned by the same production services used by Sequence Viewer; this
 * adapter only gathers the live scene handles and delivers the finished blob.
 */
export function createSceneVideoExport(viewer: Viewer3DState) {
  const options = getExportOptionsState();
  let localError = $state<string | null>(null);
  let isStarting = $state(false);
  let isCancelling = $state(false);
  let activeAttempt: AbortController | null = null;

  async function waitForScene(
    signal: AbortSignal,
    timeoutMs = 10_000
  ): Promise<boolean> {
    const ready = () =>
      !!viewer.webglCanvas &&
      !!viewer.threlteCamera &&
      !!viewer.threlteRenderer &&
      !!viewer.threlteRunFrame &&
      !!viewer.threltePauseAutoLoop &&
      !!viewer.threlteResumeAutoLoop;

    const deadline = Date.now() + timeoutMs;
    while (!signal.aborted && !ready() && Date.now() < deadline) {
      await waitForNextSceneCheck(signal);
    }
    return !signal.aborted && ready();
  }

  /**
   * Render the scene. With no film this exports the current static angle for
   * the sequence's own length; with one it replays the recorded camera path
   * for exactly as long as it was recorded, which is what makes a saved film
   * reproducible at any resolution.
   */
  async function render(
    sequence: SequenceData,
    bpm: number,
    film?: Scene3DFilm
  ): Promise<boolean> {
    localError = null;
    if (isStarting || sequenceModalExporter.state.isExporting) return false;

    const attempt = new AbortController();
    activeAttempt = attempt;
    isStarting = true;
    isCancelling = false;

    try {
      if (!(await ensureFullAccountForExport()) || attempt.signal.aborted) {
        return false;
      }
      if (!(await waitForScene(attempt.signal))) {
        if (!attempt.signal.aborted) {
          localError =
            "The 3D scene is still loading. Wait a moment and try again.";
        }
        return false;
      }

      const canvas = viewer.webglCanvas;
      const camera = viewer.threlteCamera as
        | Video3DExportDependencies["camera"]
        | null;
      const renderer = viewer.threlteRenderer as
        | Video3DExportDependencies["renderer"]
        | null;
      const runFrame = viewer.threlteRunFrame;
      const pauseAutoLoop = viewer.threltePauseAutoLoop;
      const resumeAutoLoop = viewer.threlteResumeAutoLoop;
      if (
        !canvas ||
        !camera ||
        !renderer ||
        !runFrame ||
        !pauseAutoLoop ||
        !resumeAutoLoop
      ) {
        localError = "The 3D scene is not ready to export yet.";
        return false;
      }

      const videoOptions = options.getVideoOptions();
      const beatsPerSecond = Math.max(1, bpm) / 60;
      const sequenceUnits = sequence.steps.reduce(
        (sum, step) => sum + (step.duration ?? 1),
        0
      );
      const holdUnits =
        (videoOptions.includeStartPosition ? 1 : 0) +
        (videoOptions.includeEndHold ? 1 : 0);
      const cameraKeyframes = film
        ? CameraKeyframeBuffer.fromKeyframes(film.keyframes)
        : new CameraKeyframeBuffer();
      if (!film) cameraKeyframes.captureStatic(camera);
      const totalDurationSeconds = film
        ? film.durationSeconds
        : (sequenceUnits + holdUnits) / beatsPerSecond;

      if (attempt.signal.aborted) return false;

      // export3DAnimation marks the shared exporter active synchronously, so
      // the progress UI stays present when startup hands off to frame capture.
      isStarting = false;
      await sequenceModalExporter.export3DAnimation(
        {
          fps: videoOptions.fps,
          loopCount: videoOptions.loopCount,
          resolution: videoOptions.resolution,
          includeStartPosition: videoOptions.includeStartPosition,
          includeEndHold: videoOptions.includeEndHold,
          quality: videoOptions.quality,
        },
        {
          webglCanvas: canvas,
          camera,
          beatsPerSecond,
          totalDurationSeconds,
          cameraKeyframes,
          renderer,
          runFrame,
          pauseAutoLoop,
          resumeAutoLoop,
          setExporting: (value) => (viewer.isExporting = value),
          setExportCurrentStep: (step) => (viewer.exportCurrentStep = step),
        },
        {
          onSuccess: () => undefined,
          onError: () => undefined,
          onHaptic: () => undefined,
        }
      );

      return !!sequenceModalExporter.state.previewBlobUrl;
    } finally {
      if (activeAttempt === attempt) activeAttempt = null;
      isStarting = false;
      isCancelling = false;
    }
  }

  async function save(sequence: SequenceData): Promise<void> {
    const url = sequenceModalExporter.state.previewBlobUrl;
    if (!url) return;
    const blob = await (await fetch(url)).blob();
    const rawName =
      sequence.displayName ||
      sequence.intendedWord ||
      sequence.word ||
      "sequence";
    const filename =
      sanitizeFilename(simplifyRepeatedWord(rawName)) || "sequence";
    await shareOrDownloadBlob(blob, `${filename}-3d.mp4`, {
      title: "Flow Arts Composer 3D Scene",
    });
  }

  return {
    options,
    get state() {
      const sharedState = sequenceModalExporter.state;
      return {
        ...sharedState,
        isExporting: isStarting || sharedState.isExporting,
        isCancelling,
        error: localError ?? sharedState.error,
      };
    },
    render,
    save,
    cancel: () => {
      if (!isStarting && !sequenceModalExporter.state.isExporting) return;
      isCancelling = true;
      activeAttempt?.abort();
      sequenceModalExporter.cancel();
    },
    dismissPreview: () => sequenceModalExporter.dismissPreview(),
    clearError: () => {
      localError = null;
      sequenceModalExporter.clearError();
    },
  };
}

function waitForNextSceneCheck(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();

  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, 100);
    signal.addEventListener("abort", finish, { once: true });
  });
}

export type SceneVideoExportState = ReturnType<typeof createSceneVideoExport>;
