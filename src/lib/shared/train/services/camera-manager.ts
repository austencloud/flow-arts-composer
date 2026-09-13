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

export const CAMERA_ACQUISITION_CANCELLED = "CAMERA_ACQUISITION_CANCELLED";

/**
 * Thrown when *we* gave up on opening the camera — the panel that asked for it
 * unmounted, or a newer start replaced this one. Deliberately not the platform's
 * `AbortError`: `getUserMedia` and `video.play()` both raise a native
 * `AbortError` for real hardware and playback failures, and a consumer that
 * silences cancellation by name would silence those too and leave the user
 * staring at a preview that never starts.
 */
export class CameraAcquisitionCancelled extends Error {
  readonly code = CAMERA_ACQUISITION_CANCELLED;

  constructor(message: string) {
    super(message);
    this.name = "CameraAcquisitionCancelled";
  }
}

/** Survives bundle boundaries, where `instanceof` alone can fail. */
export function isCameraAcquisitionCancelled(
  error: unknown
): error is CameraAcquisitionCancelled {
  if (error instanceof CameraAcquisitionCancelled) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === CAMERA_ACQUISITION_CANCELLED
  );
}

function stopTracks(stream: MediaStream): void {
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
  // Consumers acquire the camera in two awaits — `initialize()` then `start()` —
  // and the panel can unmount between them. A `stop()` anywhere inside that
  // handshake cancels it, so the start already queued on the next line refuses
  // instead of opening a camera whose owner has gone and whose teardown has
  // already run. The next `initialize()` re-arms the manager, which matters
  // because several panels share one instance through `getCameraManager()`.
  private _acquiring = false;
  private _acquisitionCancelled = false;

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
    this._acquiring = true;
    this._acquisitionCancelled = false;

    // Enumerate available cameras
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this._availableCameras = devices.filter((d) => d.kind === "videoinput");
    } catch (error) {
      console.warn("Could not enumerate cameras:", error);
    }

    if (this._acquisitionCancelled) {
      // The owner tore down while we were enumerating devices. Rejecting here
      // is what keeps the caller from walking straight into its `start()`.
      this._acquiring = false;
      throw new CameraAcquisitionCancelled(
        "Camera setup was cancelled before it finished."
      );
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
    if (this._acquisitionCancelled) {
      this._acquiring = false;
      throw new CameraAcquisitionCancelled(
        "Camera was released before it started."
      );
    }

    if (this._stream) {
      this._releaseStream();
    }

    const ticket = ++this._startTicket;
    // Tracks we took ownership of, so a failure on the way to "live" can hand
    // them back instead of leaving the camera on with nobody holding it.
    let openedStream: MediaStream | null = null;

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
        stopTracks(stream);
        throw new CameraAcquisitionCancelled(
          "Camera was released while it was starting."
        );
      }

      this._stream = stream;
      openedStream = stream;

      if (this._videoElement) {
        this._videoElement.srcObject = this._stream;
        await this._videoElement.play();

        // A close during playback startup already stopped the tracks; don't
        // come back and claim the camera is live.
        if (ticket !== this._startTicket) {
          throw new CameraAcquisitionCancelled(
            "Camera was released while it was starting."
          );
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
      this._acquiring = false;
      return this._stream;
    } catch (error) {
      this._acquiring = false;

      // Anything that fails after `getUserMedia` handed us a stream still has
      // live tracks — a `play()` rejection (autoplay policy, or the native
      // AbortError when the element is torn down mid-load) used to leave the
      // camera on with no owner and no way back to it.
      if (openedStream && this._stream === openedStream) {
        this._releaseStream();
      }

      if (isCameraAcquisitionCancelled(error)) {
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
    // A stop inside the initialize() → start() handshake is a teardown: the
    // owner is gone, so cancel the acquisition rather than let its start open a
    // camera afterwards. A stop after the camera went live is an ordinary
    // release and leaves a later start free to work (pause/resume,
    // switchCamera).
    if (this._acquiring) {
      this._acquisitionCancelled = true;
      this._acquiring = false;
    }

    // Invalidate any request still waiting on the permission prompt so its
    // stream gets released instead of surviving this close.
    this._startTicket++;

    this._releaseStream();
  }

  private _releaseStream(): void {
    if (this._stream) {
      stopTracks(this._stream);
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
