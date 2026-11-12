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
