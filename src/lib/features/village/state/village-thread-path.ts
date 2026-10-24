/**
 * The shape of one lineage thread: a low arc of light near the ground from a
 * learner toward their teacher, bright at each person and fading with
 * distance, so a long span reads as two short wisps and a near pair as one
 * small bridge. Wherever the path would cross a chair, the fire or someone's
 * body it goes dark, so a thread never seems to pass through them.
 *
 * Pure and allocation-free: the renderer hands in its own buffers each frame.
 */

export const THREAD_SEGMENTS = 24;
// Just off the grass, with a small rise between the two people.
export const THREAD_BASE_HEIGHT = 0.1;
export const THREAD_ARC_HEIGHT = 0.25;
// Spans shorter than this get a lower rise, so a close pair is a small hop.
const FULL_ARC_SPAN = 2;
// How far the light reaches from each end before it has faded out.
export const THREAD_REACH = 1.6;
// Past an obstacle's edge the light comes back over this distance, not at once.
const CLEAR_FEATHER = 0.3;

/** Obstacle radii, in metres: what a thread keeps clear of. */
export const THREAD_CLEARANCE = {
	chair: 0.45,
	fire: 1.1,
	body: 0.3,
} as const;

function smoothstep(edge0: number, edge1: number, x: number): number {
	const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

/**
 * Writes the thread from (ax, az) to (bx, bz) into `positions` (x, y, z per
 * point, segments + 1 points) and `brightness` (0 to 1 per point).
 * `obstacles` holds `obstacleCount` circles as (x, z, radius) triples.
 */
export function writeThreadPath(
	ax: number,
	az: number,
	bx: number,
	bz: number,
	obstacles: Float32Array,
	obstacleCount: number,
	positions: Float32Array,
	brightness: Float32Array,
	segments = THREAD_SEGMENTS,
): void {
	const span = Math.hypot(bx - ax, bz - az);
	const arc = THREAD_ARC_HEIGHT * Math.min(1, span / FULL_ARC_SPAN);
	for (let s = 0; s <= segments; s++) {
		const u = s / segments;
		const x = ax + (bx - ax) * u;
		const z = az + (bz - az) * u;
		positions[s * 3] = x;
		positions[s * 3 + 1] = THREAD_BASE_HEIGHT + arc * Math.sin(Math.PI * u);
		positions[s * 3 + 2] = z;

		const fromEnd = Math.min(u, 1 - u) * span;
		const fade = Math.max(0, 1 - fromEnd / THREAD_REACH);
		let light = fade * fade;
		for (let o = 0; o < obstacleCount && light > 0; o++) {
			const ox = obstacles[o * 3]!;
			const oz = obstacles[o * 3 + 1]!;
			const r = obstacles[o * 3 + 2]!;
			light *= smoothstep(r, r + CLEAR_FEATHER, Math.hypot(x - ox, z - oz));
		}
		brightness[s] = light;
	}
}
