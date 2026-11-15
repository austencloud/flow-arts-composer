/**
 * Start the 3D viewer's code on a direct 3D open, in parallel with the page.
 *
 * Measured on the live site (2026-11-11): the 3D canvas chunk graph was only
 * requested at about 4.2 s, once the viewer shell had mounted and
 * ViewerMotionSurface asked for it, and the 600 KB renderer worker script
 * after that. When the URL already says 3D (`pageBootsInto3D`), the route
 * starts the same imports at once.
 *
 * The specifiers are exactly the ones the real loaders use
 * (`ViewerMotionSurface.loadViewer3DCanvas`, `createLazyViewer3DState.load`),
 * so the module map hands those loaders the same in-flight modules. This
 * evaluates code only: it builds no 3D state, starts no worker, and downloads
 * no scene asset. A failure is swallowed; the normal path retries.
 *
 * The worker script is warmed with one low-priority fetch of its built URL.
 * `?worker&url` resolves to the same bundle as the
 * worker constructor in worker-environment-renderer.ts (Vite
 * caches worker bundles by file), so the worker's own request hits the HTTP
 * cache. Only the entry is warmed, not chunks it imports.
 */
import { runGuardedWarmup } from "./viewer-3d-warmup-guard";

let started = false;

export function preloadViewer3DCode(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  const swallow = () => undefined;
  void import("#lib/shared/3d/components/Viewer3DCanvas.svelte").catch(swallow);
  void import("#lib/shared/3d/state/viewer-3d-state.svelte.js").catch(swallow);
  void import("@austencloud/scene-3d").catch(swallow);
  void import("../worker-renderer/workers/environment-renderer.worker.ts?worker&url")
    .then(({ default: workerUrl }) =>
      fetch(workerUrl, { priority: "low" } as RequestInit)
    )
    .catch(swallow);
}

/**
 * The same code, warmed before a tap from an open 2D viewer.
 *
 * Same specifiers as {@link preloadViewer3DCode}, so the tap's own loaders get
 * the modules already in the module map. Differences: the imports run one
 * after another, each through {@link runGuardedWarmup} so a failed chunk never
 * reaches the reload in hooks.client.ts; it stops between steps once
 * `shouldStop` says the visitor has tapped (the tap's own imports take over);
 * and it never throws. Resolves when the worker script is in the HTTP cache or
 * the warm-up has given up.
 */
export async function warmViewer3DCode(shouldStop: () => boolean): Promise<void> {
  if (started || typeof window === "undefined") return;
  started = true;
  const steps: Array<() => Promise<unknown>> = [
    () => import("@austencloud/scene-3d"),
    () => import("#lib/shared/3d/state/viewer-3d-state.svelte.js"),
    () => import("#lib/shared/3d/components/Viewer3DCanvas.svelte"),
    async () => {
      const { default: workerUrl } = await import(
        "../worker-renderer/workers/environment-renderer.worker.ts?worker&url"
      );
      const response = await fetch(workerUrl, { priority: "low" } as RequestInit);
      await response.body?.pipeTo(new WritableStream());
    },
  ];
  for (const step of steps) {
    if (shouldStop()) return;
    await runGuardedWarmup(step);
  }
  if (!shouldStop()) codeWarmed = true;
}

let codeWarmed = false;

/** True once every warm-up step ran before the tap (for the load record). */
export function viewer3DCodeWarmed(): boolean {
  return codeWarmed;
}

export function _resetViewer3DCodePrefetchForTests(): void {
  started = false;
  codeWarmed = false;
}
