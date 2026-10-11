/**
 * viewport-3d-gate
 *
 * "Can this viewport host the 3D sequence viewer?" Sibling to
 * `webgl-capabilities.ts` (`isWebGL2Available()`) — together they gate every 3D
 * entry door. The 3D viewer is not phone-friendly yet, so it is withheld below a
 * minimum shortest-viewport-side (see `MIN_3D_VIEWPORT_PX`). Orientation-proof:
 * the rule is on `min(width, height)`, so an iPhone in landscape (wide but short)
 * stays excluded while a squarish unfolded foldable passes.
 *
 * Three flavors:
 *  - `fits3DViewport(w, h)` — pure predicate, the unit-tested core.
 *  - `fits3DViewportNow()`  — imperative window snapshot (init coercion, transient menus).
 *  - `viewportFits3D()`     — reactive, live-updates on resize/fold/rotate.
 */

import { MediaQuery } from 'svelte/reactivity';
import { MIN_3D_VIEWPORT_PX } from '#lib/shared/device/domain/constants/device-constants.js';

/** Pure: does a `w × h` viewport clear the 3D shortest-side threshold? */
export function fits3DViewport(width: number, height: number): boolean {
	return Math.min(width, height) >= MIN_3D_VIEWPORT_PX;
}

/** Imperative snapshot from the current window. SSR-safe (assumes capable). */
export function fits3DViewportNow(): boolean {
	if (typeof window === 'undefined') return true;
	return fits3DViewport(window.innerWidth, window.innerHeight);
}

// `MediaQuery`'s constructor calls `window.matchMedia`, so it must not be built
// at module load (SSR crash). Lazy-instantiate on first client read. The query
// `(min-width: N) and (min-height: N)` is exactly `min(w, h) >= N`.
let _gate: MediaQuery | null = null;

function gate(): MediaQuery | null {
	if (typeof window === 'undefined') return null;
	if (_gate === null) {
		_gate = new MediaQuery(
			`(min-width: ${MIN_3D_VIEWPORT_PX}px) and (min-height: ${MIN_3D_VIEWPORT_PX}px)`
		);
	}
	return _gate;
}

/**
 * Reactive: whether the viewport currently fits 3D. Read inside a `$derived` /
 * `$effect` / template to re-evaluate live as the window resizes, folds, or
 * rotates. SSR fallback: `true` (assume capable; corrects on hydrate).
 */
export function viewportFits3D(): boolean {
	const mq = gate();
	return mq ? mq.current : true;
}
