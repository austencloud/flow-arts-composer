/**
 * Tempo Practice Orchestrator
 *
 * Pure state machine for progressive tempo training.
 * Tracks loop completions and determines when to raise BPM.
 * Does NOT control playback - fires return values for the consumer to act on.
 *
 * Single source of truth: `currentBpm`. The displayed level is a pure function
 * of BPM (round((bpm - startBpm) / increment)), so fine-trims, level jumps, and
 * the per-loop creep can never desync the level readout.
 *
 * One model, two knobs (no modes):
 * - Every `roundsPerLevel` (X) clean loops, raise BPM by `increment` (Y).
 *   X=1 gives the gentle per-loop creep; X=5,Y=5 gives a hold-then-jump
 *   staircase; anything in between is just a dial. The big Faster/Slower step
 *   by the same `increment` so the manual bump matches the auto bump.
 * - `targetEnabled` turns the climb into a finish line: it stops at `targetBpm`
 *   (clamped to `maxBpm`) and raises `reachedTarget`. Off, it climbs to the cap.
 * - Hold freezes the auto-climb at the current tempo; Faster/Slower/fine-trim
 *   still work while held, so "drive it entirely by hand" needs no extra mode.
 */

import {
  PLAYBACK_MIN_BPM,
  PLAYBACK_MAX_BPM,
} from "#lib/shared/animation-engine/domain/constants/timing.js";

export interface TempoPracticeConfig {
  /** Starting BPM (default: 15) */
  startBpm: number;
  /** Y — BPM added per speed-up, and the Faster/Slower step (default: 1) */
  increment: number;
  /** X — full sequence loops between speed-ups (default: 1 = creep every loop) */
  roundsPerLevel: number;
  /** Hard maximum BPM cap (default: the engine's playback ceiling) */
  maxBpm: number;
  /** Goal BPM when targetEnabled — climb stops here and celebrates (default: 60) */
  targetBpm: number;
  /** When true, the climb stops at targetBpm instead of the cap (default: false) */
  targetEnabled: boolean;
}

export interface TempoPracticeProgress {
  /** Whether practice is currently running */
  active: boolean;
  /** Current BPM */
  currentBpm: number;
  /** Which round within the current step (1-based, clamped to roundsPerLevel) */
  currentRound: number;
  /** How many loops per speed-up (X) */
  roundsPerLevel: number;
  /** BPM jump per speed-up (Y) — also the Faster/Slower step */
  increment: number;
  /** Derived level: how many increments above the start tempo */
  currentLevel: number;
  /** Total rounds completed across all levels */
  totalRoundsCompleted: number;
  /** Loops completed at the current level (0..roundsPerLevel) — drives the dots */
  loopsCompleted: number;
  /** Loops left before the next speed-up (max(0, roundsPerLevel - loopsCompleted)) */
  loopsRemaining: number;
  /** Hold toggle: the auto-climb is frozen at the current tempo until released */
  held: boolean;
  /** Configured starting tempo — floor for level-down / fine-trim disable logic */
  startBpm: number;
  /** Configured max tempo — ceiling for level-up / fine-trim disable logic */
  maxBpm: number;
  /** Whether a goal tempo is set (climb stops at it) */
  targetEnabled: boolean;
  /** The raw configured goal tempo, shown in the goal stepper even when the
   *  target toggle is off (so toggling on doesn't jump the readout). */
  goalBpm: number;
  /** Effective ceiling: the goal BPM when targetEnabled, else the maxBpm cap.
   *  Drives the bar's at-ceiling disable and the target fill. */
  targetBpm: number;
  /** Goal reached (session complete) — only when targetEnabled. */
  reachedTarget: boolean;
}

const DEFAULT_CONFIG: TempoPracticeConfig = {
  startBpm: 15,
  increment: 1,
  roundsPerLevel: 1,
  maxBpm: PLAYBACK_MAX_BPM,
  targetBpm: 60,
  targetEnabled: false,
};

/**
 * Keep the practice domain inside the playback engine's speed clamp. A ceiling
 * above PLAYBACK_MAX_BPM is unreachable: the engine re-clamps every setSpeed,
 * the readout freezes, and Faster becomes a silent no-op that never disables.
 */
function sanitizeConfig(config: TempoPracticeConfig): TempoPracticeConfig {
  const maxBpm = Math.min(config.maxBpm, PLAYBACK_MAX_BPM);
  const startBpm = Math.max(PLAYBACK_MIN_BPM, Math.min(config.startBpm, maxBpm));
  // targetBpm stays raw: goalBpm is documented as the raw configured goal
  // (shown in the stepper), and effectiveCeiling() clamps it to the
  // engine-capped maxBpm at use time.
  return { ...config, maxBpm, startBpm };
}

export class TempoPracticeOrchestrator {
  private config: TempoPracticeConfig = { ...DEFAULT_CONFIG };
  private active = false;
  private currentBpm = 0;
  private currentRound = 0; // 0-based count of completed loops within the step
  private totalRoundsCompleted = 0;
  private held = false;

  start(partialConfig?: Partial<TempoPracticeConfig>): number {
    this.config = sanitizeConfig({ ...DEFAULT_CONFIG, ...partialConfig });
    this.active = true;
    this.currentBpm = this.config.startBpm;
    this.currentRound = 0;
    this.totalRoundsCompleted = 0;
    this.held = false;

    return this.currentBpm;
  }

  /** Freeze/resume the auto-climb. Faster/Slower still work while held. */
  setHeld(held: boolean): void {
    this.held = held;
  }

  /** Set the goal BPM live (clamped above the start tempo, under the cap). */
  setTargetBpm(bpm: number): void {
    this.config.targetBpm = Math.max(this.config.startBpm + 1, Math.min(bpm, this.config.maxBpm));
  }

  /** Merge live config changes from the bar's inline controls without
   *  restarting (loops X, step Y, goal, target on/off). Preserves currentBpm. */
  patchConfig(patch: Partial<TempoPracticeConfig>): void {
    this.config = sanitizeConfig({ ...this.config, ...patch });
    if (patch.targetBpm !== undefined) {
      this.config.targetBpm = Math.max(
        this.config.startBpm + 1,
        Math.min(this.config.targetBpm, this.config.maxBpm)
      );
    }
  }

  /** The ceiling the climb stops at: the goal when targetEnabled, else the cap. */
  private effectiveCeiling(): number {
    return this.config.targetEnabled
      ? Math.min(this.config.targetBpm, this.config.maxBpm)
      : this.config.maxBpm;
  }

  stop(): number {
    const finalBpm = this.currentBpm;
    this.active = false;
    return finalBpm;
  }

  /**
   * Call once per full sequence loop. Counts loops and raises BPM by `increment`
   * once `roundsPerLevel` clean loops are done (X=1 → every loop). Returns the
   * new BPM when it changes, otherwise null.
   */
  onLoopComplete(): number | null {
    if (!this.active) return null;

    // Hold freezes the auto-climb at the current tempo until released.
    if (this.held) return null;

    this.totalRoundsCompleted++;
    this.currentRound++;

    if (this.currentRound >= this.config.roundsPerLevel) {
      return this.stepBpm(this.config.increment);
    }

    return null;
  }

  /**
   * Level up on demand (the bar's big "+"). Returns the new BPM, or null if
   * already at the ceiling (which stops the session — you can't go faster).
   */
  advanceLevel(): number | null {
    if (!this.active) return null;
    return this.stepBpm(this.config.increment);
  }

  /**
   * Level down on demand (the bar's big "−"). Returns the new BPM, or null if
   * already at the start tempo. Never stops the session.
   */
  decreaseLevel(): number | null {
    if (!this.active) return null;
    return this.stepBpm(-this.config.increment);
  }

  /**
   * Shared tempo step: reset the round counter, move BPM by delta clamped to
   * [startBpm, ceiling]. Returns the new BPM, or null when clamping made no
   * change — and in that no-change case, an upward step at the ceiling stops the
   * session (you can't go faster), while a downward step at the floor is a no-op.
   */
  private stepBpm(delta: number): number | null {
    this.currentRound = 0;

    const target = this.currentBpm + delta;
    const clamped = Math.max(
      this.config.startBpm,
      Math.min(target, this.effectiveCeiling())
    );

    if (clamped === this.currentBpm) {
      if (delta > 0) this.active = false; // hit the ceiling going up → done
      return null;
    }

    this.currentBpm = clamped;
    // With a goal set, landing on it ends the session at that tempo.
    if (
      delta > 0 &&
      this.config.targetEnabled &&
      this.currentBpm >= this.effectiveCeiling()
    ) {
      this.active = false;
    }
    return this.currentBpm;
  }

  /** Fine-trim BPM directly (the bar's small ±1). Restarts the step's reps. */
  adjustBpm(newBpm: number): void {
    if (!this.active) return;
    this.currentBpm = Math.min(Math.max(newBpm, PLAYBACK_MIN_BPM), this.config.maxBpm);
    this.currentRound = 0;
  }

  isActive(): boolean {
    return this.active;
  }

  getProgress(): TempoPracticeProgress {
    return {
      active: this.active,
      currentBpm: this.currentBpm,
      // 1-based for display, clamped so it never reads N+1 at the boundary.
      currentRound: Math.min(this.currentRound + 1, this.config.roundsPerLevel),
      roundsPerLevel: this.config.roundsPerLevel,
      increment: this.config.increment,
      // Derived from BPM — never an independent counter that can desync.
      currentLevel: Math.max(
        0,
        Math.round((this.currentBpm - this.config.startBpm) / this.config.increment)
      ),
      totalRoundsCompleted: this.totalRoundsCompleted,
      loopsCompleted: this.currentRound,
      loopsRemaining: Math.max(0, this.config.roundsPerLevel - this.currentRound),
      held: this.held,
      startBpm: this.config.startBpm,
      maxBpm: this.config.maxBpm,
      targetEnabled: this.config.targetEnabled,
      goalBpm: this.config.targetBpm,
      targetBpm: this.effectiveCeiling(),
      reachedTarget:
        this.config.targetEnabled && this.currentBpm >= this.effectiveCeiling(),
    };
  }
}
