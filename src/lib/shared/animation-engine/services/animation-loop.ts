/**
 * Animation Loop Service Implementation
 *
 * Manages requestAnimationFrame loop with timing and speed control.
 * Provides clean abstraction over browser animation APIs.
 */

import { frameStatsRecorder } from "./frame-stats-recorder";
import { PLAYBACK_MIN_SPEED, PLAYBACK_MAX_SPEED } from "../domain/constants/timing";
import type { RenderActivityGate } from "#lib/shared/render-gating/render-activity-gate.js";

export class AnimationLoop {
  private animationFrameId: number | null = null;
  private lastTimestamp: number | null = null;
  private speed: number = 1.0;
  private onUpdateCallback: ((deltaTime: number) => void) | null = null;

  // Off-screen / hidden-tab gating — see shared/render-gating. `wantsToRun`
  // records the caller's intent so the loop resumes by itself when the surface
  // scrolls back into view; the caller is never asked to re-start it.
  private activityGate: RenderActivityGate | null = null;
  private unsubscribeGate: (() => void) | null = null;
  private wantsToRun = false;

  /**
   * Route this loop through the canonical activity gate. While the gate is
   * inactive the rAF stops entirely and the playhead holds; when it reopens the
   * loop resumes where it stopped with a re-seeded clock, so a surface parked
   * off screen for thirty seconds does not resume with a thirty-second
   * timestep. Pass null to un-gate (deterministic export drivers do).
   */
  setActivityGate(gate: RenderActivityGate | null): void {
    if (gate === this.activityGate) return;
    this.unsubscribeGate?.();
    this.unsubscribeGate = null;
    this.activityGate = gate;
    if (gate) {
      this.unsubscribeGate = gate.subscribe((active) => {
        if (active) this.resumeFromGate();
        else this.pauseForGate();
      });
      if (!gate.active) this.pauseForGate();
      return;
    }
    // Un-gating resumes anything the caller still wants running.
    this.resumeFromGate();
  }

  private gateAllows(): boolean {
    return this.activityGate === null || this.activityGate.active;
  }

  private pauseForGate(): void {
    if (this.animationFrameId === null) return;
    cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
    // Re-seed on resume: the loop's own first-frame branch treats a null
    // timestamp as "initialize, do not advance", which is exactly the delta
    // clamp a resume needs.
    this.lastTimestamp = null;
  }

  private resumeFromGate(): void {
    if (!this.wantsToRun) return;
    if (this.animationFrameId !== null) return;
    if (!this.onUpdateCallback) return;
    this.lastTimestamp = null;
    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  start(onUpdate: (deltaTime: number) => void, speed: number): void {
    this.wantsToRun = true;

    if (this.animationFrameId !== null) {
      // Already running, just update callback and speed
      this.onUpdateCallback = onUpdate;
      this.speed = Math.max(PLAYBACK_MIN_SPEED, Math.min(PLAYBACK_MAX_SPEED, speed));
      return;
    }

    this.onUpdateCallback = onUpdate;
    this.speed = Math.max(PLAYBACK_MIN_SPEED, Math.min(PLAYBACK_MAX_SPEED, speed));
    this.lastTimestamp = null;
    // Gated off screen: hold the intent and schedule nothing. The gate
    // subscription starts the loop the moment the surface is worth drawing.
    if (!this.gateAllows()) return;
    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.wantsToRun = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.lastTimestamp = null;
    this.onUpdateCallback = null;
  }

  /**
   * True while the loop is logically running — including while it is parked by
   * the activity gate. Callers read this to decide whether playback is live,
   * and a gated pause must not read as "playback stopped".
   */
  isRunning(): boolean {
    return (
      this.animationFrameId !== null || (this.wantsToRun && !this.gateAllows())
    );
  }

  /** True only while frames are actually being scheduled. */
  isPumping(): boolean {
    return this.animationFrameId !== null;
  }

  /** Release the gate subscription. Safe to call more than once. */
  dispose(): void {
    this.stop();
    this.unsubscribeGate?.();
    this.unsubscribeGate = null;
    this.activityGate = null;
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(PLAYBACK_MIN_SPEED, Math.min(PLAYBACK_MAX_SPEED, speed));
  }

  getSpeed(): number {
    return this.speed;
  }

  private loop = (timestamp: number): void => {
    if (!this.onUpdateCallback) {
      this.stop();
      return;
    }

    // The gate can close between a frame being scheduled and that frame being
    // dispatched. Park here; the gate subscription re-schedules on reopen.
    if (!this.gateAllows()) {
      this.animationFrameId = null;
      this.lastTimestamp = null;
      return;
    }

    // Calculate deltaTime
    if (this.lastTimestamp === null) {
      this.lastTimestamp = timestamp;
      // First frame, just initialize - don't update
      this.animationFrameId = requestAnimationFrame(this.loop);
      return;
    }

    const deltaTime = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;

    // Apply speed multiplier and invoke callback
    const adjustedDeltaTime = deltaTime * this.speed;
    const updateStart = performance.now();
    this.onUpdateCallback(adjustedDeltaTime);
    // Dev-only smoothness instrumentation: raw rAF gap (total frame cost) +
    // update-callback duration (engine cost). No-op when disabled.
    frameStatsRecorder.record(deltaTime, performance.now() - updateStart);

    // Continue loop if still running
    if (this.animationFrameId !== null) {
      this.animationFrameId = requestAnimationFrame(this.loop);
    }
  };
}
