/**
 * VideoPlayer
 *
 * Manages video element state, playback synchronization, and beat tracking.
 * Assumes videos are generated at 60 BPM (1 beat = 1 second).
 */
export class VideoPlayer {
  private videoElement: HTMLVideoElement | null = null;
  private stepTrackingFrameId: number | null = null;
  private stepChangeCallback: ((beat: number) => void) | null = null;

  initialize(videoElement: HTMLVideoElement): void {
    this.videoElement = videoElement;
  }

  play(): void {
    if (!this.videoElement) {
      console.warn("VideoPlayer: No video element initialized");
      return;
    }

    this.videoElement.play().catch((error) => {
      console.error("VideoPlayer: Play failed", error);
    });
  }

  pause(): void {
    if (!this.videoElement) {
      console.warn("VideoPlayer: No video element initialized");
      return;
    }

    this.videoElement.pause();
  }

  setPlaybackRate(rate: number): void {
    if (!this.videoElement) {
      console.warn("VideoPlayer: No video element initialized");
      return;
    }

    this.videoElement.playbackRate = rate;
  }

  seek(timeInSeconds: number): void {
    if (!this.videoElement) {
      console.warn("VideoPlayer: No video element initialized");
      return;
    }

    this.videoElement.currentTime = timeInSeconds;
  }

  startStepTracking(onStepChange: (beat: number) => void): void {
    // Don't start if already tracking
    if (this.stepTrackingFrameId !== null) {
      return;
    }

    this.stepChangeCallback = onStepChange;

    const trackBeat = () => {
      if (this.videoElement && this.stepChangeCallback) {
        // Video is at 60 BPM base, so currentTime in seconds = currentStep
        const currentStep = this.videoElement.currentTime;
        this.stepChangeCallback(currentStep);
      }
      this.stepTrackingFrameId = requestAnimationFrame(trackBeat);
    };

    this.stepTrackingFrameId = requestAnimationFrame(trackBeat);
  }

  stopBeatTracking(): void {
    if (this.stepTrackingFrameId !== null) {
      cancelAnimationFrame(this.stepTrackingFrameId);
      this.stepTrackingFrameId = null;
    }
    this.stepChangeCallback = null;
  }

  getCurrentTime(): number {
    if (!this.videoElement) {
      return 0;
    }
    return this.videoElement.currentTime;
  }

  getCurrentStep(): number {
    // For videos at 60 BPM base, currentTime = currentStep
    return this.getCurrentTime();
  }

  dispose(): void {
    this.stopBeatTracking();
    this.videoElement = null;
    this.stepChangeCallback = null;
  }
}

// Singleton instance
let instance: VideoPlayer | null = null;

export function getVideoPlayer(): VideoPlayer {
  if (!instance) {
    instance = new VideoPlayer();
  }
  return instance;
}
