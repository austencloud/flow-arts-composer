/**
 * Who a `vite:preloadError` belongs to while the 3D code warms before a tap.
 *
 * Vite raises `vite:preloadError` from its preload helper as soon as any chunk
 * of a dynamic import fails, before the caller's own `.catch` runs. The
 * handler in `hooks.client.ts` answers it by reloading the page, which is right
 * for a tap on a stale deploy and wrong for a warm-up the visitor never asked
 * for: an idle prefetch must never reload the page under them.
 *
 * While a warm-up import is pending and no tap has asked for 3D, the warm-up
 * owns preload errors and the handler stands aside; the warm-up swallows its
 * own rejection, and the tap's real import later takes the normal path. Once
 * the visitor asks for 3D, {@link releaseViewer3DWarmupGuard} hands every
 * later error back to the handler, so a tap on a stale deploy still recovers.
 *
 * Plain module state, no imports: hooks.client.ts reads it at startup.
 */
let pendingWarmups = 0;
let released = false;

export function viewer3DWarmupOwnsPreloadErrors(): boolean {
  return pendingWarmups > 0 && !released;
}

/** Run `load` as a warm-up import: its preload errors stay out of recovery. */
export async function runGuardedWarmup<T>(
  load: () => Promise<T>
): Promise<T | undefined> {
  if (released) return undefined;
  pendingWarmups += 1;
  try {
    return await load();
  } catch {
    return undefined;
  } finally {
    pendingWarmups -= 1;
  }
}

/** The visitor asked for 3D: from here on, preload errors are real. */
export function releaseViewer3DWarmupGuard(): void {
  released = true;
}

export function _resetViewer3DWarmupGuardForTests(): void {
  pendingWarmups = 0;
  released = false;
}
