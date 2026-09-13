/**
 * BackgroundHold
 * Domain: Short-window freezing of the animated background's render loop
 *
 * The @austencloud/backgrounds controller repaints a viewport-sized canvas on
 * every frame. That is affordable while the page is sitting still and it is not
 * affordable while something in the foreground is animating: the app already
 * measured 37.9fps with 40.7% hitch frames during playback with the loop
 * running, against 59.9fps and 0.1% with it stopped (see BackgroundHost's
 * `pauseDuringPlayback`). A CSS panel transition has the same problem in a much
 * shorter window.
 *
 * A hold stops the loop and leaves the last painted frame on the canvas, so a
 * decorative backdrop holds still for the couple of hundred milliseconds the
 * interface is moving. Nobody looks at the backdrop during a transition; they
 * look at the thing that is moving, which is exactly the thing that wants the
 * frame budget.
 *
 * This is NOT background-suppression.svelte.ts. That unmounts the controller —
 * disposing systems and canvases — which is right for a fullscreen scene
 * occluding the backdrop for minutes and catastrophic for 280ms, where the
 * re-initialization costs more than the jank it was meant to avoid.
 *
 * Holds are keyed and refcounted: two overlapping transitions cannot unfreeze
 * each other early, and a released key is idempotent.
 */

/**
 * IMPORT BOUNDARY — this module must not statically import a renderer package.
 *
 * It is a few hundred bytes, which puts it under Rollup's
 * `experimentalMinChunkSize` floor (vite.config.ts, `clientOnlyChunkMergePlugin`),
 * so the bundler is free to merge it into whatever chunk it happens to sit
 * beside — and it did: into the root layout's own chunk. A static
 * `@austencloud/backgrounds` import here therefore became a static edge from
 * `+layout.svelte` into the shared `vendor` chunk, and every route (landing
 * included) preloaded 3.28 MB / 918 KB gzip of unrelated packages before it
 * could hydrate. Measured 2026-09-12 against `4eeaea16d0`'s successor build.
 *
 * The controller is owned by BackgroundHost, which is the only component that
 * mounts it. It registers the instance here; a hold taken before the host
 * exists is remembered and applied at registration. Holding with no host is a
 * no-op either way — the controller's `freeze()` stops animations that a
 * hostless singleton never started.
 *
 * `tests/unit/boot-import-boundary.test.ts` enforces the rule.
 */

/** The slice of BackgroundController this module drives. */
export interface BackgroundFreezeTarget {
  freeze(): void;
  unfreeze(): void;
}

const heldKeys = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

let freezeTarget: BackgroundFreezeTarget | null = null;

/**
 * Publish the live background controller. Called by BackgroundHost, the single
 * owner of the controller singleton. Registering while a hold is outstanding
 * freezes immediately, so a hold taken before the host mounted still holds.
 */
export function registerBackgroundFreezeTarget(
  target: BackgroundFreezeTarget
): void {
  freezeTarget = target;
  if (heldKeys.size > 0) target.freeze();
}

function applyFreeze(): void {
  freezeTarget?.freeze();
}

function applyUnfreeze(): void {
  freezeTarget?.unfreeze();
}

/** Hold the background still. Idempotent for the same key. */
export function holdBackground(key: string): void {
  const timer = timers.get(key);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(key);
  }

  const wasEmpty = heldKeys.size === 0;
  heldKeys.add(key);
  if (wasEmpty) applyFreeze();
}

/** Release a hold. The loop resumes only once every key has released. */
export function releaseBackground(key: string): void {
  const timer = timers.get(key);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(key);
  }

  if (!heldKeys.delete(key)) return;
  if (heldKeys.size === 0) applyUnfreeze();
}

/**
 * Hold the background still for a fixed window — the shape a CSS transition
 * wants, since it has a known duration and no completion callback worth
 * wiring. Re-arming the same key extends the window rather than stacking, so a
 * user toggling a panel repeatedly gets one continuous hold instead of a
 * backdrop that stutters back to life between clicks.
 *
 * The window is deliberately a little longer than the transition it covers:
 * the last frame of a transition is the one most worth protecting, and a
 * backdrop that restarts a frame early undoes the point of the hold.
 */
export function holdBackgroundFor(key: string, durationMs: number): void {
  holdBackground(key);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      releaseBackground(key);
    }, durationMs)
  );
}
