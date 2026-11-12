/**
 * Session recording waits for the 3D scene on a direct 3D open.
 *
 * The replay recorder's full DOM snapshot and canvas capture cost about 0.9 s
 * of main-thread time before the 3D worker even started on the live site
 * (2026-11-11 profile; 3.5 s on a 4x slower CPU), and more while the scene
 * loads. Austen approved trimming it during loading and still wants replays,
 * canvases included, once the scene is up. So on a page that boots straight
 * into 3D, PostHog initialises with recording held back, and the first of
 * these starts it:
 *
 * - `scene-revealed`: the 3D curtain has opened.
 * - `main-thread-renderer`: the viewer chose the main-thread renderer. rrweb
 *   only forces `preserveDrawingBuffer` on WebGL contexts created while it
 *   records, so that canvas would replay black if recording started later.
 * - `left-3d`: the visitor moved to another pane.
 * - `cap`: 15 s after PostHog initialised.
 *
 * Events capture during the hold; only the replay starts later.
 *
 * This module has no PostHog import, so viewer code can release the hold
 * without pulling the SDK into its chunk. posthog.ts arms it.
 */

export type ReplayHoldRelease =
  | "scene-revealed"
  | "main-thread-renderer"
  | "left-3d"
  | "cap";

export const REPLAY_HOLD_CAP_MS = 15_000;

export interface ReplayHoldInputs {
  /** Recording would start at init: production, not an agent browser. */
  recordingAllowed: boolean;
  /** The URL opens the viewer straight into 3D (`pageBootsInto3D`). */
  bootsInto3D: boolean;
  /**
   * The browser can run the worker renderer. Without it the main-thread
   * renderer is certain, and its canvas must be recorded from the start.
   */
  workerRendererSupported: boolean;
  /** A release trigger already fired before PostHog initialised. */
  releasedEarly: boolean;
}

/** Pure: should PostHog initialise with session recording held back? */
export function shouldHoldReplay(inputs: ReplayHoldInputs): boolean {
  return (
    inputs.recordingAllowed &&
    inputs.bootsInto3D &&
    inputs.workerRendererSupported &&
    !inputs.releasedEarly
  );
}

export interface ReplayHoldTimers {
  set(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}

export interface ReplayHold {
  /** Start recording if still held. Returns whether this call started it. */
  release(reason: ReplayHoldRelease): boolean;
  readonly releasedBy: ReplayHoldRelease | null;
}

/** One armed hold: starts recording exactly once, on the first release. */
export function createReplayHold(
  start: () => void,
  timers: ReplayHoldTimers = {
    set: (callback, delayMs) => setTimeout(callback, delayMs),
    clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
  capMs = REPLAY_HOLD_CAP_MS
): ReplayHold {
  let releasedBy: ReplayHoldRelease | null = null;
  const timer = timers.set(() => hold.release("cap"), capMs);
  const hold: ReplayHold = {
    release(reason) {
      if (releasedBy) return false;
      releasedBy = reason;
      timers.clear(timer);
      start();
      return true;
    },
    get releasedBy() {
      return releasedBy;
    },
  };
  return hold;
}

let armed: ReplayHold | null = null;
let releasedEarly = false;

/** posthog.ts: hold recording until a release, with the 15 s cap running. */
export function armReplayHold(start: () => void): void {
  armed = createReplayHold(start);
}

/**
 * Viewer code: a release trigger happened. A no-op when nothing is held. When
 * PostHog has not initialised yet, it remembers, so init does not hold at all.
 */
export function releaseReplayHold(reason: ReplayHoldRelease): void {
  if (armed) armed.release(reason);
  else releasedEarly = true;
}

export function replayHoldReleasedEarly(): boolean {
  return releasedEarly;
}

export function _resetReplayHoldForTests(): void {
  armed = null;
  releasedEarly = false;
}
