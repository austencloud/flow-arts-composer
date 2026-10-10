/**
 * TimelinePlaybackService
 *
 * Service for managing timeline playback state and controls.
 * Handles transport, shuttle (J/K/L), and audio synchronization.
 */

import { getErrorHandler } from "#lib/shared/application/get-error-handler.js";
import type { ActiveClipInfo } from "#lib/shared/animation-engine/timeline/domain/types.js";
import type { TimeSeconds, TimelineClip } from "#lib/shared/animation-engine/domain/timeline-types.js";
import { getClipEndTime } from "#lib/shared/animation-engine/domain/timeline-types.js";
import { getTimelineState } from "#lib/shared/animation-engine/state/timeline-state.svelte.js";
import type { ErrorHandler } from '#lib/shared/application/services/error-handler.js'

export class TimelinePlayer {
  private animationFrameId: number | null = null;
  private lastFrameTime: number = 0;
  private isRunning: boolean = false;
  private audioElement: HTMLAudioElement | null = null;
  private audioSyncEnabled: boolean = false;
  private audioErrorShown: boolean = false;
  private audioErrorResetTimer: ReturnType<typeof setTimeout> | null = null;

  private _activeClips: TimelineClip[] = [];
  private _activeClipInfos: ActiveClipInfo[] = [];

  constructor() {}

  // State Getters

  get isPlaying(): boolean {
    return getTimelineState().playhead.isPlaying;
  }

  get position(): TimeSeconds {
    return getTimelineState().playhead.position;
  }

  get direction(): 1 | -1 {
    return getTimelineState().playhead.direction;
  }

  get shuttleSpeed(): number {
    return getTimelineState().playhead.shuttleSpeed;
  }

  get loopStart(): TimeSeconds | null {
    return getTimelineState().playhead.loopStart;
  }

  get loopEnd(): TimeSeconds | null {
    return getTimelineState().playhead.loopEnd;
  }

  get hasLoopRegion(): boolean {
    const state = getTimelineState();
    return state.playhead.loopStart !== null && state.playhead.loopEnd !== null;
  }

  get activeClips(): TimelineClip[] {
    return this._activeClips;
  }

  get activeClipInfos(): ActiveClipInfo[] {
    return this._activeClipInfos;
  }

  // Transport Controls

  play(): void {
    const state = getTimelineState();
    state.play();
    this.startEngine();
  }

  pause(): void {
    const state = getTimelineState();
    state.pause();
    this.stopEngine();
  }

  stop(): void {
    const state = getTimelineState();
    state.stop();
    this.stopEngine();
  }

  togglePlayPause(): void {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  seek(position: TimeSeconds): void {
    const state = getTimelineState();
    const clampedPosition = Math.max(
      0,
      Math.min(state.totalDuration, position)
    );
    state.setPlayheadPosition(clampedPosition);

    // Sync audio position
    if (this.audioElement) {
      this.audioElement.currentTime = clampedPosition;
    }

    // Update active clips
    this.updateActiveClips(clampedPosition);
  }

  goToStart(): void {
    this.seek(0);
  }

  goToEnd(): void {
    const state = getTimelineState();
    this.seek(state.totalDuration);
  }

  // Shuttle Controls (J/K/L)

  shuttleForward(): void {
    const state = getTimelineState();
    const speeds = [1, 2, 4, 8];
    const currentSpeed = state.playhead.shuttleSpeed;
    const currentDirection = state.playhead.direction;

    if (!state.playhead.isPlaying || currentDirection === -1) {
      // Start playing forward at 1x
      state.setShuttleSpeed(1);
      state.play();
      this.startEngine();
      this.updateAudioShuttle(1, 1);
    } else {
      // Increase speed
      const currentIndex = speeds.indexOf(currentSpeed);
      const nextIndex = Math.min(currentIndex + 1, speeds.length - 1);
      const nextSpeed = speeds[nextIndex] ?? 1;
      state.setShuttleSpeed(nextSpeed);
      this.updateAudioShuttle(nextSpeed, 1);
    }
  }

  shuttleReverse(): void {
    const state = getTimelineState();
    const speeds = [1, 2, 4, 8];
    const currentSpeed = state.playhead.shuttleSpeed;
    const currentDirection = state.playhead.direction;

    if (!state.playhead.isPlaying || currentDirection === 1) {
      // Start playing reverse at 1x
      state.setShuttleSpeed(1);
      state.play();
      this.startEngine();
      this.updateAudioShuttle(1, -1);
    } else {
      // Increase speed
      const currentIndex = speeds.indexOf(currentSpeed);
      const nextIndex = Math.min(currentIndex + 1, speeds.length - 1);
      const nextSpeed = speeds[nextIndex] ?? 1;
      state.setShuttleSpeed(nextSpeed);
      this.updateAudioShuttle(nextSpeed, -1);
    }
  }

  shuttleStop(): void {
    const state = getTimelineState();
    state.shuttleStop();
    this.stopEngine();
  }

  // Frame Stepping

  stepForward(frames: number = 1): void {
    const state = getTimelineState();
    const frameTime = 1 / state.project.frameRate;
    this.seek(state.playhead.position + frameTime * frames);
  }

  stepBackward(frames: number = 1): void {
    const state = getTimelineState();
    const frameTime = 1 / state.project.frameRate;
    this.seek(Math.max(0, state.playhead.position - frameTime * frames));
  }

  // Loop Region

  setLoopRegion(start: TimeSeconds, end: TimeSeconds): void {
    const state = getTimelineState();
    state.setLoopRegion(start, end);
  }

  clearLoopRegion(): void {
    const state = getTimelineState();
    state.clearLoopRegion();
  }

  setInPointAtPlayhead(): void {
    const state = getTimelineState();
    const end = state.playhead.loopEnd ?? state.totalDuration;
    state.setLoopRegion(state.playhead.position, end);
  }

  setOutPointAtPlayhead(): void {
    const state = getTimelineState();
    const start = state.playhead.loopStart ?? 0;
    state.setLoopRegion(start, state.playhead.position);
  }

  // Audio Sync

  connectAudio(audioElement: HTMLAudioElement): void {
    this.audioElement = audioElement;
    this.audioSyncEnabled = true;

    // Listen for audio time updates as fallback sync
    audioElement.addEventListener("timeupdate", this.handleAudioTimeUpdate);

  }

  disconnectAudio(): void {
    if (this.audioElement) {
      this.audioElement.removeEventListener(
        "timeupdate",
        this.handleAudioTimeUpdate
      );
      this.audioElement = null;
    }
    this.audioSyncEnabled = false;
  }

  // Lifecycle

  initialize(): void {
  }

  destroy(): void {
    this.stopEngine();
    this.disconnectAudio();

    if (this.audioErrorResetTimer) {
      clearTimeout(this.audioErrorResetTimer);
      this.audioErrorResetTimer = null;
    }
  }

  // Private Methods

  private startEngine(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.animationFrameId = requestAnimationFrame(this.tick);

    // Start audio if synced
    if (this.audioSyncEnabled && this.audioElement) {
      const state = getTimelineState();
      this.audioElement.currentTime = state.playhead.position;
      this.audioElement.playbackRate =
        state.playhead.shuttleSpeed * state.playhead.direction;
      this.audioElement.play().catch((e) => this.handleAudioPlayError(e));
    }

  }

  private stopEngine(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Pause audio if synced
    if (this.audioElement) {
      this.audioElement.pause();
    }

    this.audioErrorShown = false;
  }

  private tick = (currentTime: number): void => {
    if (!this.isRunning) return;

    const state = getTimelineState();
    const deltaMs = currentTime - this.lastFrameTime;
    this.lastFrameTime = currentTime;

    // Calculate new position
    const deltaSeconds =
      (deltaMs / 1000) * state.playhead.shuttleSpeed * state.playhead.direction;
    let newPosition = state.playhead.position + deltaSeconds;

    // Handle loop region
    if (state.playhead.loopStart !== null && state.playhead.loopEnd !== null) {
      if (
        state.playhead.direction === 1 &&
        newPosition >= state.playhead.loopEnd
      ) {
        newPosition =
          state.playhead.loopStart + (newPosition - state.playhead.loopEnd);
      } else if (
        state.playhead.direction === -1 &&
        newPosition <= state.playhead.loopStart
      ) {
        newPosition =
          state.playhead.loopEnd - (state.playhead.loopStart - newPosition);
      }
    }

    // Clamp to valid range
    const duration = state.totalDuration;
    if (newPosition >= duration) {
      newPosition = duration;
      this.stopEngine();
      state.setPlayheadPosition(0); // Reset to start
    } else if (newPosition < 0) {
      newPosition = 0;
      this.stopEngine();
    } else {
      state.setPlayheadPosition(newPosition);
    }

    // Update active clips
    this.updateActiveClips(newPosition);

    // Continue loop
    if (this.isRunning) {
      this.animationFrameId = requestAnimationFrame(this.tick);
    }
  };

  private updateActiveClips(position: TimeSeconds): void {
    const state = getTimelineState();
    const clips = state.allClips;
    const activeClips: TimelineClip[] = [];
    const activeClipInfos: ActiveClipInfo[] = [];

    for (const clip of clips) {
      if (clip.muted) continue;

      const clipStart = clip.startTime;
      const clipEnd = getClipEndTime(clip);

      // Check if playhead is within this clip
      if (position >= clipStart && position < clipEnd) {
        activeClips.push(clip);

        const clipDuration = clip.duration;
        const timeInClip = position - clipStart;

        // Calculate progress accounting for in/out points and playback rate
        const sourceRange = clip.outPoint - clip.inPoint;
        const rawProgress = timeInClip / clipDuration;

        let progress: number;
        let isLooping = false;

        if (clip.loop && rawProgress > 1) {
          progress = rawProgress % 1;
          isLooping = true;
        } else {
          progress = Math.min(1, rawProgress);
        }

        // Map to source range
        const sourceProgress = clip.inPoint + progress * sourceRange;

        // Calculate current beat
        const stepCount = clip.sequence.steps.length;
        const currentStep = Math.floor(sourceProgress * stepCount);

        activeClipInfos.push({
          clip,
          progress: sourceProgress,
          currentStep,
          isLooping,
        });
      }
    }

    this._activeClips = activeClips;
    this._activeClipInfos = activeClipInfos;
  }

  private updateAudioShuttle(speed: number, direction: 1 | -1): void {
    if (this.audioElement && this.isRunning) {
      // Audio playback rate can't be negative, so we handle reverse differently
      if (direction === -1) {
        // For reverse, we manually step backwards
        this.audioElement.pause();
      } else {
        this.audioElement.playbackRate = speed;
        if (this.isRunning) {
          this.audioElement.play().catch((e) => this.handleAudioPlayError(e));
        }
      }
    }
  }

  private handleAudioPlayError(error: unknown): void {
    if (this.audioErrorShown) return;
    this.audioErrorShown = true;

    try {
      const errorHandler = getErrorHandler() as ErrorHandler;
      errorHandler.showWarning(
        "Audio playback failed. Try clicking anywhere on the page first (browser autoplay policy)."
      );
    } catch {
      console.error("Audio play failed:", error);
    }

    // Reset after 10 seconds so the warning can show again if needed
    this.audioErrorResetTimer = setTimeout(() => {
      this.audioErrorResetTimer = null;
      this.audioErrorShown = false;
    }, 10000);
  }

  private handleAudioTimeUpdate = (): void => {
    if (!this.audioElement || !this.audioSyncEnabled) return;

    const state = getTimelineState();
    // Only sync from audio if we're playing with audio as master
    if (this.isRunning && state.playhead.direction === 1) {
      // Use audio as time source for forward playback
      const audioTime = this.audioElement.currentTime;
      state.setPlayheadPosition(audioTime);
    }
  };
}

// Singleton Instance

let serviceInstance: TimelinePlayer | null = null;

/**
 * Get the singleton playback service instance
 */
export function getTimelinePlayer(): TimelinePlayer {
  if (!serviceInstance) {
    serviceInstance = new TimelinePlayer();
    serviceInstance.initialize();
  }
  return serviceInstance;
}
