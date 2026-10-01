interface PreviewFrameState {
  playing: boolean;
  targetTime: number;
  source: string;
}

interface PreviewFrameRecoveryOptions {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  readState: () => PreviewFrameState;
  isCurrent: () => boolean;
  onFrame: () => void;
  onRestore: () => void;
}

// Each mounted preview owns its decoder and retained picture independently.
export class PreviewVideoFrameRecovery {
  private readonly source: string;
  private generation = 0;
  private frameRequest: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private fallbackRequest: number | null = null;
  private pausedTarget: number | null = null;
  private destroyed = false;
  private priming = false;
  private watchingPlayback = false;
  private retained = false;

  constructor(private readonly options: PreviewFrameRecoveryOptions) {
    this.source = options.readState().source;
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("pageshow", this.onRestore);
    window.addEventListener("focus", this.onRestore);
    window.addEventListener("pagehide", this.onSuspend);
  }

  get isPriming(): boolean {
    return this.priming;
  }

  private current(): boolean {
    return (
      !this.destroyed &&
      this.options.isCurrent() &&
      this.options.readState().source === this.source
    );
  }

  private visible(): boolean {
    return document.visibilityState !== "hidden";
  }

  private target(): number {
    const { video } = this.options;
    const time = this.options.readState().targetTime;
    return Math.max(
      0,
      Math.min(
        Number.isFinite(video.duration)
          ? Math.max(0, video.duration - 1 / 60)
          : time,
        time
      )
    );
  }

  private capture(): void {
    const { video, canvas } = this.options;
    if (
      !this.current() ||
      !this.visible() ||
      video.seeking ||
      video.readyState < 2 ||
      !video.videoWidth ||
      !video.videoHeight
    )
      return;
    const context = canvas.getContext("2d");
    if (!context) return;
    // Bound preview memory without changing the source used by export.
    const scale = Math.min(
      1,
      1920 / Math.max(video.videoWidth, video.videoHeight)
    );
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    try {
      if (canvas.width !== width || canvas.height !== height) {
        const nextFrame = document.createElement("canvas");
        nextFrame.width = width;
        nextFrame.height = height;
        const nextContext = nextFrame.getContext("2d");
        if (!nextContext) return;
        nextContext.drawImage(video, 0, 0, width, height);
        canvas.width = width;
        canvas.height = height;
        context.drawImage(nextFrame, 0, 0);
      } else {
        context.drawImage(video, 0, 0, width, height);
      }
      if (!this.retained) {
        this.retained = true;
        this.options.onFrame();
      }
    } catch {
      // An unavailable decoder frame leaves the previous picture in place.
    }
  }

  private requestFrame(callback: () => void): void {
    const { video } = this.options;
    const generation = this.generation;
    if (typeof video.requestVideoFrameCallback === "function") {
      this.frameRequest = video.requestVideoFrameCallback(() => {
        if (!this.current() || generation !== this.generation) return;
        this.frameRequest = null;
        callback();
      });
    } else {
      this.fallbackRequest = requestAnimationFrame(() => {
        if (!this.current() || generation !== this.generation) return;
        this.fallbackRequest = null;
        if (video.readyState >= 2 && !video.seeking) callback();
        else this.requestFrame(callback);
      });
    }
  }

  cancel(): void {
    this.generation += 1;
    const { video } = this.options;
    if (this.frameRequest !== null)
      video.cancelVideoFrameCallback?.(this.frameRequest);
    if (this.fallbackRequest !== null)
      cancelAnimationFrame(this.fallbackRequest);
    if (this.timer !== null) clearTimeout(this.timer);
    this.frameRequest = null;
    this.fallbackRequest = null;
    this.timer = null;
    if (this.priming && !this.options.readState().playing) {
      video.pause();
      if (
        this.current() &&
        this.pausedTarget !== null &&
        Math.abs(video.currentTime - this.target()) > 1 / 240
      )
        video.currentTime = this.target();
    }
    this.priming = false;
    this.watchingPlayback = false;
    this.pausedTarget = null;
  }

  update(): void {
    if (!this.current() || !this.visible()) {
      this.cancel();
      return;
    }
    if (this.options.readState().playing) {
      if (this.pausedTarget !== null) this.cancel();
      if (this.frameRequest === null && this.fallbackRequest === null)
        this.watchPlayback();
    } else {
      if (
        this.watchingPlayback ||
        (this.pausedTarget !== null && this.target() !== this.pausedTarget)
      )
        this.cancel();
    }
  }

  private watchPlayback(): void {
    this.watchingPlayback = true;
    this.requestFrame(() => {
      this.capture();
      if (this.current() && this.visible() && this.options.readState().playing)
        this.watchPlayback();
    });
  }

  presentPausedFrame(reseek = false): void {
    if (!this.current() || !this.visible() || this.options.readState().playing)
      return;
    const target = this.target();
    if (!Number.isFinite(target) || this.options.video.readyState < 1) return;
    if (this.pausedTarget === target) return;
    this.cancel();
    this.pausedTarget = target;
    const generation = this.generation;
    const finish = () => {
      if (!this.current() || generation !== this.generation) return;
      const restoring =
        this.priming &&
        Math.abs(this.options.video.currentTime - target) > 1 / 240;
      this.capture();
      this.cancel();
      if (restoring) {
        // A decoder may advance while priming. Restore the exact paused
        // picture too, without another playback attempt.
        this.pausedTarget = target;
        this.requestFrame(() => {
          this.capture();
          this.cancel();
        });
        this.timer = setTimeout(() => this.cancel(), 400);
      }
    };
    this.requestFrame(finish);
    if (reseek) this.options.video.currentTime = target;
    // A same-time seek normally refreshes the picture. A muted, bounded
    // decode is the second attempt when the browser never presents it.
    this.timer = setTimeout(() => {
      this.timer = null;
      if (
        !this.current() ||
        generation !== this.generation ||
        !this.visible() ||
        this.options.readState().playing
      )
        return;
      const { video } = this.options;
      this.priming = true;
      video.muted = true;
      this.timer = setTimeout(() => this.cancel(), 400);
      void video
        .play()
        .then(() => {
          if (
            (!this.current() || generation !== this.generation) &&
            !this.options.readState().playing
          )
            video.pause();
        })
        .catch(() => {
          if (this.current() && generation === this.generation) this.cancel();
        });
    }, 400);
  }

  private onVisibility = (): void => {
    if (this.visible()) this.onRestore();
    else this.onSuspend();
  };

  private onSuspend = (): void => this.cancel();

  private onRestore = (): void => {
    if (!this.current() || !this.visible()) return;
    // Repeated focus/pageshow notifications share the current bounded retry.
    if (this.pausedTarget !== null) return;
    if (
      this.options.readState().playing &&
      this.options.video.readyState >= 1 &&
      !this.options.video.seeking &&
      Number.isFinite(this.target())
    ) {
      this.options.video.currentTime = this.target();
    }
    this.options.onRestore();
    this.update();
    if (!this.options.readState().playing) this.presentPausedFrame(true);
  };

  destroy(): void {
    this.cancel();
    this.destroyed = true;
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("pageshow", this.onRestore);
    window.removeEventListener("focus", this.onRestore);
    window.removeEventListener("pagehide", this.onSuspend);
  }
}
