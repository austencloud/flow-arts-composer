/**
 * Gallery Capture State
 *
 * Manages the capture-then-upload pipeline for the screenshot gallery:
 * idle → capturing → uploading state machine, progress tracking,
 * retry logic, and cleanup.
 */

import type { DeviceInfo, RouteNode, CaptureJobStatus, CaptureStartResult } from "../../../services/types";
import type { ScreenshotUploadOrchestrator } from "../../../services/screenshot-upload-orchestrator";
import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";

interface ScreenshotOrchestratorLike {
  getRoutes(): RouteNode[];
  getDevices(): DeviceInfo[];
  startCapture(request: { routes: string[]; devices: string[] }): Promise<CaptureStartResult>;
  getJobStatus?(jobId: string): Promise<CaptureJobStatus>;
}
import type { UploadProgress } from "../../../services/types";

export type CapturePhase = "idle" | "capturing" | "uploading";

export interface GalleryCaptureDeps {
  getOrchestrator: () => ScreenshotOrchestratorLike;
  getUploadOrchestrator: () => ScreenshotUploadOrchestrator;
}

export function createGalleryCaptureState(deps: GalleryCaptureDeps) {
  let captureJobId = $state<string | null>(null);
  let capturePhase = $state<CapturePhase>("idle");
  let uploadProgress = $state<UploadProgress | null>(null);
  let lastCapturedFiles = $state<string[]>([]);

  function startCapture() {
    const orch = deps.getOrchestrator();
    const allRoutes = orch.getRoutes().map((r: RouteNode) => r.label);
    const allDevices = orch.getDevices().map((d: DeviceInfo) => d.slug);

    capturePhase = "capturing";
    orch
      .startCapture({ routes: allRoutes, devices: allDevices })
      .then((result: CaptureStartResult) => {
        captureJobId = result.jobId;
      })
      .catch((err: unknown) => {
        console.error("[GalleryCaptureState] Capture failed to start:", err);
        capturePhase = "idle";
        const message = err instanceof Error ? err.message : String(err);
        toast.error(`Screenshot capture failed: ${message}`);
      });
  }

  function handleCaptureStatusUpdate(status: CaptureJobStatus) {
    if (status.status === "completed" && status.capturedFiles) {
      lastCapturedFiles = status.capturedFiles;
    }
  }

  function handleCaptureComplete() {
    captureJobId = null;

    if (lastCapturedFiles.length > 0) {
      capturePhase = "uploading";
      runUpload(lastCapturedFiles);
    } else {
      capturePhase = "idle";
    }
  }

  function runUpload(filenames: string[]) {
    const uploadOrch = deps.getUploadOrchestrator();

    uploadOrch
      .uploadCaptures(filenames, (p: UploadProgress) => {
        uploadProgress = p;
      })
      .then(() => {
        setTimeout(() => {
          if (capturePhase === "uploading") {
            capturePhase = "idle";
            uploadProgress = null;
          }
        }, 3000);
      })
      .catch((err: unknown) => {
        console.error("[GalleryCaptureState] Upload failed:", err);
        const message = err instanceof Error ? err.message : String(err);
        // Surface the failure in the UI: a "failed" progress card (which exposes
        // the Retry action) plus a toast, instead of leaving the phase stuck on
        // "uploading" with a frozen progress bar.
        const prior = uploadProgress;
        uploadProgress = {
          phase: "failed",
          total: prior?.total ?? filenames.length,
          uploaded: prior?.uploaded ?? 0,
          skipped: prior?.skipped ?? 0,
          failed: (prior?.total ?? filenames.length) - (prior?.uploaded ?? 0),
          errors: [message],
          currentFile: null,
        };
        toast.error(`Screenshot upload failed: ${message}`);
      });
  }

  function retryUpload() {
    if (lastCapturedFiles.length > 0) {
      capturePhase = "uploading";
      uploadProgress = null;
      runUpload(lastCapturedFiles);
    }
  }

  function dismissProgress() {
    capturePhase = "idle";
    captureJobId = null;
    uploadProgress = null;
    lastCapturedFiles = [];
  }

  return {
    get captureJobId() {
      return captureJobId;
    },
    get capturePhase() {
      return capturePhase;
    },
    get uploadProgress() {
      return uploadProgress;
    },

    startCapture,
    handleCaptureStatusUpdate,
    handleCaptureComplete,
    retryUpload,
    dismissProgress,
  };
}

export type GalleryCaptureState = ReturnType<
  typeof createGalleryCaptureState
>;
