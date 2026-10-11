/**
 * ImageModeHandLandmarker - MediaPipe HandLandmarker in IMAGE mode
 *
 * Separate instance from the train module's VIDEO mode landmarker.
 * IMAGE mode treats each frame independently (no temporal tracking),
 * which is correct for batch video analysis where frames are
 * pre-extracted and processed sequentially.
 *
 * This avoids two problems with sharing the train module's singleton:
 * 1. VIDEO mode requires monotonically increasing timestamps - if the
 *    camera was used first, video frame timestamps (starting at 0)
 *    would violate monotonicity.
 * 2. VIDEO mode's detect() API differs from IMAGE mode - calling the
 *    wrong one throws at runtime.
 */

import type { HandLandmarkerResult } from "#lib/features/train/services/hand-landmarker.js";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MediaPipeHandLandmarker = any;

export class ImageModeHandLandmarker {
  private _handLandmarker: MediaPipeHandLandmarker = null;
  private _isInitialized = false;

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  async initialize(): Promise<void> {
    if (this._isInitialized) return;

    const vision = await import("@mediapipe/tasks-vision");
    const { HandLandmarker, FilesetResolver } = vision;

    const wasmFileset = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm"
    );

    this._handLandmarker = await HandLandmarker.createFromOptions(
      wasmFileset,
      {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "IMAGE",
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      }
    );

    this._isInitialized = true;
  }

  detect(image: OffscreenCanvas): HandLandmarkerResult {
    if (!this._isInitialized || !this._handLandmarker) {
      throw new Error("ImageModeHandLandmarker not initialized");
    }

    return this._handLandmarker.detect(image);
  }

  dispose(): void {
    if (this._handLandmarker) {
      this._handLandmarker.close();
      this._handLandmarker = null;
    }
    this._isInitialized = false;
  }
}
