/**
 * Canvas defaults shared by the main thread and workers.
 *
 * Kept out of `canvas-resizer.svelte.ts` on purpose: worker bundles build
 * without the Svelte plugin, so a worker that reaches a `.svelte.ts` module
 * can throw `$state is not defined`.
 */

/** Default canvas size */
export const DEFAULT_CANVAS_SIZE = 500;
