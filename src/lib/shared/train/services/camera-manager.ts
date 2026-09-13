export interface CameraConfig {
  facingMode: "user" | "environment";
  width: number;
  height: number;
  frameRate: number;
}

const DEFAULT_CONFIG: CameraConfig = {
  facingMode: "user",
  width: 640,
  height: 480,
  frameRate: 30,
};

/**
 * `start()` rejects with this name when the camera was closed (or restarted)
 * before the request finished. It is the same name the platform uses for an
 * aborted request, so a consumer can tell "we gave up on this one" apart from
 * "the camera refused" and skip the error message for a panel that is already
 * going away.
 */
export const CAMERA_START_CANCELLED = "AbortError";

function cameraStartCancelled(): Error {
  const error = new Error("Camera start was cancelled.");
  error.name = CAMERA_START_CANCELLED;
  return error;
}

function releaseStream(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}

export class CameraManager {
  private _stream: MediaStream | null = null;
  private _videoElement: HTMLVideoElement | null = null;
  private _isActive = false;
  private _currentConfig: CameraConfig = { ...DEFAULT_CONFIG };
  private _availableCameras: MediaDeviceInfo[] = [];
  private _canvas: OffscreenCanvas | null = null;
  private _canvasCtx: OffscreenCanvasRenderingContext2D | null = null;
  // Every start attempt carries a ticket. `stop()` and any newer `start()`
  // invalidate the outstanding ticket, which is how a request that only
  // finishes after the panel closed (permission prompt left open, slow USB
  // camera) learns that nobody wants its stream — without that, the resolved
  // tracks are never stopped and the camera light stays on until page reload.
  private _startTicket = 0;

  get isActive(): boolean {
    return this._isActive;
  }

  get currentConfig(): CameraConfig {
    return { ...this._currentConfig };
  }

  get availableCameras(): MediaDeviceInfo[] {
    return [...this._availableCameras];
  }

  async initialize(config?: Partial<CameraConfig>): Promise<void> {
    this._currentConfig = { ...DEFAULT_CONFIG, ...config };

    // Enumerate available cameras
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this._availableCameras = devices.filter((d) => d.kind === "videoinput");
    } catch (error) {
      console.warn("Could not enumerate cameras:", error);
    }

    this._videoElement = document.createElement("video");
    this._videoElement.setAttribute("playsinline", "true");
    this._videoElement.setAttribute("autoplay", "true");
    this._videoElement.muted = true;

    // Create canvas for frame capture
    this._canvas = new OffscreenCanvas(
      this._currentConfig.width,
      this._currentConfig.height
    );
    this._canvasCtx = this._canvas.getContext("2d");
  }

  async start(): Promise<MediaStream> {
    if (this._stream) {
      this.stop();
    }

    const ticket = ++this._startTicket;

    const constraints: MediaStreamConstraints = {
      video: {
        facingMode: this._currentConfig.facingMode,
        width: { ideal: this._currentConfig.width },
        height: { ideal: this._currentConfig.height },
        frameRate: { ideal: this._currentConfig.frameRate },
      },
      audio: false,
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (ticket !== this._startTicket) {
        releaseStream(stream);
        throw cameraStartCancelled();
      }

      this._stream = stream;

      if (this._videoElement) {
        this._videoElement.srcObject = this._stream;
        await this._videoElement.play();

        // A close during playback startup already stopped the tracks; don't
        // come back and claim the camera is live.
        if (ticket !== this._startTicket) {
          throw cameraStartCancelled();
        }

        // Update canvas size to match actual video dimensions
        if (this._canvas) {
          this._canvas.width =
            this._videoElement.videoWidth || this._currentConfig.width;
          this._canvas.height =
            this._videoElement.videoHeight || this._currentConfig.height;
        }
      }

      this._isActive = true;
      return this._stream;
    } catch (error) {
      if (error instanceof Error && error.name === CAMERA_START_CANCELLED) {
        throw error;
      }

      console.error("Failed to start camera:", error);

      // A denied prompt or missing device is an expected user state, not a bug.
      // Every consumer (CameraPreview, VideoRecordPanel, PerformancePreview)
      // renders this message inline with its own retry affordance — no global
      // error modal.
      let message = "Couldn't access your camera.";
      if (error instanceof Error) {
        if (error.name === "NotAllowedError") {
          message = "Camera access was denied. Check your browser permissions.";
        } else if (error.name === "NotFoundError") {
          message = "No camera found on this device.";
        } else if (error.name === "NotReadableError") {
          message = "Camera is being used by another app.";
        }
      }

      throw new Error(message, { cause: error });
    }
  }

  stop(): void {
    // Invalidate any request still waiting on the permission prompt so its
    // stream gets released instead of surviving this close.
    this._startTicket++;

    if (this._stream) {
      releaseStream(this._stream);
      this._stream = null;
    }

    if (this._videoElement) {
      this._videoElement.srcObject = null;
    }

    this._isActive = false;
  }

  async switchCamera(): Promise<void> {
    const newFacingMode =
      this._currentConfig.facingMode === "user" ? "environment" : "user";
    this._currentConfig.facingMode = newFacingMode;

    if (this._isActive) {
      this.stop();
      await this.start();
    }
  }

  getVideoElement(): HTMLVideoElement | null {
    return this._videoElement;
  }

  captureFrame(): ImageData | null {
    if (!this._videoElement || !this._canvas || !this._canvasCtx) {
      return null;
    }

    if (this._videoElement.readyState < 2) {
      return null;
    }

    this._canvasCtx.drawImage(
      this._videoElement,
      0,
      0,
      this._canvas.width,
      this._canvas.height
    );

    return this._canvasCtx.getImageData(
      0,
      0,
      this._canvas.width,
      this._canvas.height
    );
  }
}
