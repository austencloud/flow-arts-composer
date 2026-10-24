interface CaptureScheduler {
  run(timeMs: number): void;
  readonly stages?: readonly { run(deltaSeconds: number): void }[];
}

// Canvas outlives the keyed rigs. Its scheduler may already be seconds ahead
// of wall time after a fast export; resetting to performance.now() reverses IK.
const lastCaptureTime = new WeakMap<CaptureScheduler, number>();
const explicitFrameSchedulers = new WeakSet<CaptureScheduler>();

export function captureClockOrigin(
  scheduler: CaptureScheduler,
  nowMs: number
): number {
  return Math.max(nowMs, lastCaptureTime.get(scheduler) ?? nowMs);
}

/** Drive the public Threlte stages with exact capture deltas. Scheduler.run()
 * retains its constructor-time clock across asynchronous rig loading and
 * otherwise turns the first pose into a clamped 100 ms animation step. */
export function primeCaptureScheduler(
  scheduler: CaptureScheduler,
  nowMs: number
): number {
  const origin = captureClockOrigin(scheduler, nowMs);
  if (!scheduler.stages)
    throw new Error("Native capture scheduler has no stages");
  explicitFrameSchedulers.add(scheduler);
  lastCaptureTime.set(scheduler, origin);
  return origin;
}

export function runCaptureScheduler(
  scheduler: CaptureScheduler,
  timeMs: number
): void {
  const previous = lastCaptureTime.get(scheduler);
  if (!Number.isFinite(timeMs) || (previous !== undefined && timeMs < previous))
    throw new Error(
      "Native capture scheduler time must be finite and monotonic"
    );
  if (explicitFrameSchedulers.has(scheduler)) {
    const delta = Math.min((timeMs - previous!) / 1000, 0.1);
    for (const stage of scheduler.stages!) stage.run(delta);
  } else scheduler.run(timeMs);
  lastCaptureTime.set(scheduler, timeMs);
}
