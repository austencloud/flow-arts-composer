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

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
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

/**
 * Identifies one consumer's `initialize()` → `start()` handshake. Panels that
 * share an instance through `getCameraManager()` hand this back when they close
 * (`abandonAcquisition`) instead of calling the instance-wide `stop()`, which
 * would release whatever the *current* panel is doing.
 */
export interface CameraAcquisition {
  readonly id: number;
}

interface AcquisitionRecord extends CameraAcquisition {
  cancelled: boolean;
  started: boolean;
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
  // and the panel can unmount between them. The current handshake is tracked
  // here so a `stop()` (or `abandonAcquisition`) inside it cancels the start
  // already queued on the next line, instead of letting it open a camera whose
  // owner has gone and whose teardown has already run. A newer `initialize()`
  // takes over as the current acquisition, which is what keeps one shared
  // instance usable by several panels in turn.
  private _acquisition: AcquisitionRecord | null = null;
  private _acquisitionCount = 0;
  // Which acquisition's `start()` actually opened `_stream`. Being the current
  // acquisition is not the same as owning the camera: a panel can set itself up
  // while another panel's stream is live and then close without ever starting.
  // Releasing on that close would switch off a camera it never opened.
  private _streamOwner: AcquisitionRecord | null = null;

  get isActive(): boolean {
    return this._isActive;
  }

  get currentConfig(): CameraConfig {
    return { ...this._currentConfig };
  }

  get availableCameras(): MediaDeviceInfo[] {
    return [...this._availableCameras];
  }

  /**
   * Prepares the camera and returns the handle for this acquisition. Pass it to
   * `start()` and to `abandonAcquisition()` so a panel that closes late acts only
   * on its own handshake.
   */
  async initialize(config?: Partial<CameraConfig>): Promise<CameraAcquisition> {
    this._currentConfig = { ...DEFAULT_CONFIG, ...config };

    const acquisition: AcquisitionRecord = {
      id: ++this._acquisitionCount,
      cancelled: false,
      started: false,
    };
    this._acquisition = acquisition;

    // A new acquisition supersedes any start still waiting on the permission
    // prompt. Without this, that start comes back and installs its stream into
    // the video element and canvas this call is about to replace — the new
    // panel's preview would be showing the old panel's camera.
    this._startTicket++;

    // Enumerate available cameras
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this._availableCameras = devices.filter((d) => d.kind === "videoinput");
    } catch (error) {
      console.warn("Could not enumerate cameras:", error);
    }

    if (acquisition.cancelled || this._acquisition !== acquisition) {
      // The owner tore down while we were enumerating devices, or another panel
      // took the camera over. Rejecting here is what keeps the caller from
      // walking straight into its `start()`.
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

    return acquisition;
  }

  /**
   * Opens the camera. Pass the handle `initialize()` returned so a start that
   * belongs to a closed panel — or to a handshake another panel has taken over —
   * refuses instead of opening a camera nobody will close.
   */
  async start(acquisition?: CameraAcquisition): Promise<MediaStream> {
    const claim = (acquisition ?? this._acquisition) as
      | AcquisitionRecord
      | null
      | undefined;

    if (claim && (claim.cancelled || this._acquisition !== claim)) {
      throw new CameraAcquisitionCancelled(
        "Camera was released before it started."
      );
    }

    if (this._stream) {
      this._releaseActiveStream();
    }

    const ticket = ++this._startTicket;
    // Tracks we took ownership of, so a failure on the way to "live" can hand
    // them back instead of leaving the camera on with nobody holding it.
    let openedStream: MediaStream | null = null;

    // Checked after every await, not just the first: between them the owner can
    // close, a newer start can take the camera, and a newer `initialize()` can
    // replace the video element and canvas this attempt is installing into.
    const superseded = () =>
      ticket !== this._startTicket ||
      (claim ? claim.cancelled || this._acquisition !== claim : false);

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

      if (superseded()) {
        stopTracks(stream);
        throw new CameraAcquisitionCancelled(
          "Camera was released while it was starting."
        );
      }

      this._stream = stream;
      // Ownership is recorded the moment the camera is ours, not when playback
      // finally succeeds: `play()` can stay pending indefinitely, and an
      // `abandonAcquisition()` inside that window has to find an owner to match
      // or it leaves the tracks running until playback settles.
      this._streamOwner = claim ?? null;
      openedStream = stream;

      if (this._videoElement) {
        this._videoElement.srcObject = this._stream;
        await this._videoElement.play();

        // A close during playback startup already stopped the tracks; don't
        // come back and claim the camera is live.
        if (superseded()) {
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
      if (claim) claim.started = true;
      return this._stream;
    } catch (error) {
      // Anything that fails after `getUserMedia` handed us a stream still has
      // live tracks — a `play()` rejection (autoplay policy, or the native
      // AbortError when the element is torn down mid-load) used to leave the
      // camera on with no owner and no way back to it.
      if (openedStream && this._stream === openedStream) {
        this._releaseActiveStream();
      }

      if (isCameraAcquisitionCancelled(error)) {
        throw error;
      }

      // A failure that arrives after this attempt was superseded is our own
      // cancellation, whatever it says. `video.play()` rejects with a native
      // AbortError precisely because the element was torn down — reporting that
      // as a camera failure fires onCameraError on a panel that already closed.
      if (superseded()) {
        throw new CameraAcquisitionCancelled(
          "Camera was released while it was starting.",
          { cause: error }
        );
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

  /**
   * Releases the camera this instance is holding, whoever opened it. A panel
   * that shares the instance and may be closing late should use
   * `abandonAcquisition()` or `releaseStream()` instead — both act only on that
   * panel's own handshake.
   */
  stop(): void {
    // A stop inside the initialize() → start() handshake is a teardown: the
    // owner is gone, so cancel the acquisition rather than let its start open a
    // camera afterwards. A stop after the camera went live is an ordinary
    // release and leaves a later start free to work (pause/resume,
    // switchCamera).
    if (this._acquisition && !this._acquisition.started) {
      this._acquisition.cancelled = true;
    }

    // Invalidate any request still waiting on the permission prompt so its
    // stream gets released instead of surviving this close.
    this._startTicket++;

    this._releaseActiveStream();
  }

  /**
   * Gives up one consumer's handshake: its pending start is cancelled, and the
   * camera is released only if this acquisition is the one that opened it.
   *
   * Both halves matter. It is a no-op once another consumer has taken the
   * instance over, so a panel closing after its replacement opened the camera
   * cannot release someone else's stream. And a panel that set itself up while
   * another panel's stream was live, then closed without ever calling `start()`,
   * leaves that stream running — it never opened a camera, so it has none to
   * switch off.
   */
  abandonAcquisition(acquisition: CameraAcquisition): void {
    const record = this._acquisition;
    if (record !== acquisition) return;

    record.cancelled = true;

    // Invalidate this acquisition's own pending start so a stream that arrives
    // afterwards is released instead of going live for nobody.
    this._startTicket++;

    if (this._streamOwner === record) {
      this._releaseActiveStream();
    }
  }

  /**
   * Hands back a stream a consumer received but no longer wants. The tracks are
   * always stopped; the instance's own state is cleared only while this is still
   * the stream it handed out, so a late teardown cannot switch off the camera a
   * newer consumer is using.
   */
  releaseStream(stream: MediaStream): void {
    stopTracks(stream);

    if (this._stream !== stream) return;

    this._startTicket++;
    this._stream = null;
    this._streamOwner = null;
    if (this._videoElement) {
      this._videoElement.srcObject = null;
    }
    this._isActive = false;
  }

  private _releaseActiveStream(): void {
    if (this._stream) {
      stopTracks(this._stream);
      this._stream = null;
    }
    this._streamOwner = null;

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
