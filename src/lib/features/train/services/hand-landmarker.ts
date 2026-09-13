/**
 * HandLandmarker - MediaPipe HandLandmarker wrapper
 *
 * Responsibility: Initialize and manage MediaPipe HandLandmarker,
 * provide raw landmark detection for video frames and images.
 */

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface HandednessResult {
  categoryName: string;
  score: number;
}

export interface HandLandmarkerResult {
  landmarks: HandLandmark[][];
  handedness: HandednessResult[][];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MediaPipeHandLandmarker = any;

export class HandLandmarker {
  private _handLandmarker: MediaPipeHandLandmarker = null;
  private _isInitialized = false;
  private _loading: Promise<void> | null = null;
  // Bumped by dispose(). A load that finishes after its generation expired has
  // no owner left, so it closes the landmarker it just built instead of
  // parking a live WASM runtime and GPU delegate for the rest of the session.
  private _generation = 0;

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  async initialize(): Promise<void> {
    if (this._isInitialized) return;

    // The WASM bundle and the model come off a CDN. Two callers reaching for
    // the first detection at once must share one load: otherwise each builds
    // its own landmarker, the second overwrites the first, and the first is
    // never closed.
    if (!this._loading) {
      const loading = this._load().finally(() => {
        // Only clear our own load: a dispose may already have started a newer
        // one, and stealing its slot would let a second landmarker be built.
        if (this._loading === loading) this._loading = null;
      });
      this._loading = loading;
    }

    return this._loading;
  }

  private async _load(): Promise<void> {
    const generation = this._generation;

    try {
      // Dynamically import MediaPipe
      const vision = await import("@mediapipe/tasks-vision");
      const { HandLandmarker, FilesetResolver } = vision;

      const wasmFileset = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm"
      );

      const landmarker = await HandLandmarker.createFromOptions(wasmFileset, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      if (generation !== this._generation) {
        // dispose() ran while the model was downloading — the user left Train.
        // Hand this one straight back and stay uninitialized so the next visit
        // builds a fresh landmarker.
        landmarker.close();
        return;
      }

      this._handLandmarker = landmarker;
      this._isInitialized = true;
    } catch (error) {
      throw new Error(`MediaPipe initialization failed: ${error}`);
    }
  }

  detectForVideo(
    video: HTMLVideoElement,
    timestamp: number
  ): HandLandmarkerResult {
    if (!this._isInitialized || !this._handLandmarker) {
      throw new Error("HandLandmarker not initialized");
    }

    return this._handLandmarker.detectForVideo(video, timestamp);
  }

  detect(image: OffscreenCanvas): HandLandmarkerResult {
    if (!this._isInitialized || !this._handLandmarker) {
      throw new Error("HandLandmarker not initialized");
    }

    return this._handLandmarker.detect(image);
  }

  dispose(): void {
    this._generation++;
    this._loading = null;

    if (this._handLandmarker) {
      this._handLandmarker.close();
      this._handLandmarker = null;
    }
    this._isInitialized = false;
  }
}
