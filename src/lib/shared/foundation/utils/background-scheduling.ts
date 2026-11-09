/**
 * Background scheduling — one owner for the two "don't block the frame"
 * primitives this app keeps re-deriving inline.
 *
 * `yieldToScheduler()` breaks a long synchronous loop into separate tasks so no
 * single task overruns the frame budget. `runAtBackgroundPriority()` defers work
 * that has no deadline (prefetch, warm-up) behind whatever the user can see.
 * `runAtUserVisiblePriority()` starts chunked work that someone is waiting
 * for, so its yields do not inherit an idle callback's background priority.
 * `holdDeferredWorkForMotion()` and `whenMotionSettled()` keep deferred work out
 * of a press and of a motion the user is watching, and `whenInputQuiet()` keeps
 * the heaviest work away from someone who is still using the page, and
 * `whenPageStill()` is the two together.
 *
 * Both are progressive: `scheduler.yield()` / `scheduler.postTask()` are
 * Chromium-only and explicitly NOT Baseline (verified against MDN 2026-09-03),
 * so each falls back through `requestIdleCallback` (also not universal) to a
 * plain macrotask. Both APIs exist inside Web Workers as well as on the window,
 * so this module reads `globalThis` rather than `window` and is safe to import
 * from worker and SSR contexts.
 */

type SchedulerLike = {
  postTask?: (
    callback: () => unknown,
    options?: { priority?: "user-blocking" | "user-visible" | "background" }
  ) => Promise<unknown>;
  yield?: () => Promise<void>;
};

type IdleCapableGlobal = {
  scheduler?: SchedulerLike;
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout?: number }
  ) => number;
};

function schedulerApi(): SchedulerLike | undefined {
  return (globalThis as IdleCapableGlobal).scheduler;
}

/**
 * Hand the thread back so the browser can paint a frame or service input, then
 * resume. Call this BETWEEN units of work in a loop, never inside the unit —
 * yielding cannot subdivide one long synchronous computation.
 *
 * `scheduler.yield()` resumes ahead of already-queued tasks, so a chunked loop
 * keeps its place in line instead of losing it to every other pending timer the
 * way a `setTimeout(0)` chain does. Where it is missing, the macrotask fallback
 * is slower to resume but still unblocks the frame, which is the point.
 */
export async function yieldToScheduler(): Promise<void> {
  const scheduler = schedulerApi();
  if (typeof scheduler?.yield === "function") {
    try {
      await scheduler.yield();
      return;
    } catch {
      // An aborted yield rejects with the signal's reason. Nothing here owns a
      // signal, so treat it as "could not yield that way" and fall through.
    }
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * Run `task` as its own task at "user-visible" priority and resolve with its
 * result.
 *
 * Use it to start chunked work that someone is waiting to see from inside a
 * `requestIdleCallback` callback. `scheduler.yield()` inherits the priority of
 * the task that called it, and an idle callback counts as "background" (MDN,
 * checked 2026-10-14), so every yield in that chain queues behind all other
 * work and can wait hundreds of milliseconds. A `postTask` priority does not
 * come from the caller, and the yields inside the task inherit it instead.
 * Without `postTask`, the task runs on a microtask and yields fall back as in
 * `yieldToScheduler`.
 */
export function runAtUserVisiblePriority<T>(
  task: () => T | Promise<T>
): Promise<T> {
  const scheduler = schedulerApi();
  if (typeof scheduler?.postTask === "function") {
    return scheduler.postTask(task, { priority: "user-visible" }) as Promise<T>;
  }
  return Promise.resolve().then(task);
}

/**
 * Run `task` once the thread has room, behind anything the user can perceive.
 *
 * `timeout` bounds the wait for the `requestIdleCallback` fallback: a page with
 * a continuously running animation loop may never report a genuine idle period,
 * and work that never runs is worse than work that runs late. The
 * `scheduler.postTask` path needs no timeout — "background" priority is ordered
 * behind other work rather than gated on idleness, so it always drains.
 */
export function runAtBackgroundPriority(
  task: () => void,
  options?: { timeout?: number }
): void {
  const scheduler = schedulerApi();
  if (typeof scheduler?.postTask === "function") {
    void scheduler.postTask(task, { priority: "background" })?.catch(() => {
      // postTask rejects when the task's signal aborts. Nothing here aborts,
      // but an unhandled rejection would still surface in the console.
    });
    return;
  }

  const requestIdle = (globalThis as IdleCapableGlobal).requestIdleCallback;
  if (typeof requestIdle === "function") {
    requestIdle(task, { timeout: options?.timeout ?? 2000 });
    return;
  }

  setTimeout(task, 0);
}

/**
 * A safety limit, not a design length: no motion here runs this long, and work
 * must not be stranded by a transition that never reported its end.
 */
const MOTION_HOLD_CAP_MS = 2000;

const motionHolds = new Map<object, { neededWorkRuns: boolean }>();
let motionWaiters: (() => void)[] = [];

function motionHeld(needed: boolean): boolean {
  for (const { neededWorkRuns } of motionHolds.values()) {
    if (!needed || !neededWorkRuns) return true;
  }
  return false;
}

/**
 * Keep deferred work out of a motion that is about to play. A view transition's
 * morph animates layout on the main thread, so it has no headroom, yet an idle
 * callback can still fire between its frames. The motion's owner takes a hold
 * before it starts and calls the returned release when it lands. Releasing
 * twice is harmless.
 *
 * `neededWorkRuns` is for a motion that is itself waiting for something to
 * load, such as a screen clearing while the next one gets ready. Prefetches and
 * warm-ups stay out, and work marked `needed` in `whenMotionSettled` goes ahead.
 */
export function holdDeferredWorkForMotion({
  neededWorkRuns = false,
}: { neededWorkRuns?: boolean } = {}): () => void {
  const hold = {};
  motionHolds.set(hold, { neededWorkRuns });
  const release = (): void => {
    clearTimeout(cap);
    if (!motionHolds.delete(hold)) return;
    const waiters = motionWaiters;
    motionWaiters = [];
    for (const wake of waiters) wake();
  };
  const cap = setTimeout(release, MOTION_HOLD_CAP_MS);
  return release;
}

/**
 * How long one wait keeps checking for running animations. A page that starts
 * finite animations one after another must not strand deferred work.
 */
const MOTION_SETTLE_LIMIT_MS = 4000;

/**
 * What a height ease does not share a thread with: the compositor runs these by
 * itself, so a long task on the main thread cannot freeze them.
 */
const COMPOSITED_KEYFRAME_KEYS = new Set([
  "offset",
  "computedOffset",
  "easing",
  "composite",
  "opacity",
  "transform",
  "translate",
  "rotate",
  "scale",
  "filter",
  "backdropFilter",
]);

function runsOnMainThread(animation: Animation): boolean {
  if (animation.playState !== "running") return false;
  const effect = animation.effect as KeyframeEffect | null;
  if (typeof effect?.getKeyframes !== "function") return false;
  if (effect.getComputedTiming().iterations === Infinity) return false;
  return effect
    .getKeyframes()
    .some((frame) =>
      Object.keys(frame).some((key) => !COMPOSITED_KEYFRAME_KEYS.has(key))
    );
}

function runningMainThreadAnimations(): Animation[] {
  if (typeof document === "undefined") return [];
  if (typeof document.getAnimations !== "function") return [];
  return document.getAnimations().filter(runsOnMainThread);
}

function landingOf(animations: Animation[], limitMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const limit = setTimeout(resolve, limitMs);
    void Promise.allSettled(animations.map((a) => a.finished)).then(() => {
      clearTimeout(limit);
      resolve();
    });
  });
}

let watchingInput = false;
let lastInputAt = Number.NEGATIVE_INFINITY;
let releaseInputHold: (() => void) | null = null;

/**
 * A press holds deferred work from the moment it goes down. Its motion only
 * starts when it comes back up, so the hold lasts two frames past that, by when
 * an ease the press started shows up in `document.getAnimations()`.
 */
function watchInput(): void {
  if (watchingInput || typeof window === "undefined") return;
  watchingInput = true;
  const begin = (): void => {
    lastInputAt = performance.now();
    releaseInputHold ??= holdDeferredWorkForMotion();
  };
  const end = (): void => {
    lastInputAt = performance.now();
    const release = releaseInputHold;
    releaseInputHold = null;
    if (release) requestAnimationFrame(() => requestAnimationFrame(release));
  };
  const options = { capture: true, passive: true };
  window.addEventListener("pointerdown", begin, options);
  window.addEventListener("keydown", begin, options);
  window.addEventListener("pointerup", end, options);
  window.addEventListener("pointercancel", end, options);
  window.addEventListener("keyup", end, options);
}

/**
 * Resolves at once when nothing is moving and nothing is being pressed.
 * Otherwise it waits for the press or the motion to land, then queues behind the
 * landing frame, and checks again in case another has started since. Motion
 * means a hold or any finite animation the compositor cannot run by itself, so a
 * height ease protects itself without its owner doing anything.
 *
 * Await this only in work nobody is waiting on, or pass `needed` for work a
 * screen may be waiting on. A motion that awaited its own deferred work would
 * sit frozen until the safety limit ran out.
 */
export async function whenMotionSettled({
  needed = false,
}: { needed?: boolean } = {}): Promise<void> {
  watchInput();
  const deadline = Date.now() + MOTION_SETTLE_LIMIT_MS;
  for (;;) {
    if (motionHeld(needed)) {
      await new Promise<void>((resolve) => motionWaiters.push(resolve));
    } else {
      const remaining = deadline - Date.now();
      const moving = remaining > 0 ? runningMainThreadAnimations() : [];
      if (moving.length === 0) return;
      await landingOf(moving, remaining);
    }
    await new Promise<void>((resolve) => runAtBackgroundPriority(resolve));
  }
}

/**
 * Resolves once `quietMs` has passed with no press or key, counted from the call
 * or the last input, whichever is later. For work too heavy to land under
 * someone's hand. It can wait as long as they keep working, so only await it for
 * a warm-up the page works without.
 */
export async function whenInputQuiet(quietMs: number): Promise<void> {
  watchInput();
  const started = performance.now();
  for (;;) {
    const since = performance.now() - Math.max(lastInputAt, started);
    if (since >= quietMs) return;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, quietMs - since);
    });
  }
}

/**
 * Resolves once nothing has been pressed for `quietMs` and nothing is moving,
 * checking again if a press came while it waited for a motion to land. Run
 * heavy work straight in the continuation: nothing can come between the last
 * check and that work, so anything asynchronous it needs has to be done first.
 */
export async function whenPageStill(quietMs: number): Promise<void> {
  for (;;) {
    await whenInputQuiet(quietMs);
    const inputAt = lastInputAt;
    await whenMotionSettled();
    if (lastInputAt === inputAt) return;
  }
}
