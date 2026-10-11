import { hashString } from "#lib/shared/foundation/services/content-hasher.js";
import type { MandalaPaths, MandalaPoint, SVGPathData } from "../domain/mandala-types";

/** Quantization grid in px. Coarse enough to absorb FP drift under rotation,
 *  fine enough to keep distinct glyphs apart. Tuned by the round-trip +
 *  rotation tests. */
export const QUANTIZE_GRID = 1;

/** Extract on-curve points from an SVG "d" string: the M start plus each C
 *  endpoint (control points excluded — they are not on the curve). */
export function parsePoints(d: string): MandalaPoint[] {
	const pts: MandalaPoint[] = [];
	const m = d.match(/^M\s+(-?[\d.]+)\s+(-?[\d.]+)/);
	if (m) pts.push({ x: parseFloat(m[1]!), y: parseFloat(m[2]!) });
	const c = /C\s+-?[\d.]+\s+-?[\d.]+,\s+-?[\d.]+\s+-?[\d.]+,\s+(-?[\d.]+)\s+(-?[\d.]+)/g;
	let mc: RegExpExecArray | null;
	while ((mc = c.exec(d)) !== null) {
		pts.push({ x: parseFloat(mc[1]!), y: parseFloat(mc[2]!) });
	}
	return pts;
}

function quantize(p: MandalaPoint): string {
	const qx = Math.round(p.x / QUANTIZE_GRID) * QUANTIZE_GRID;
	const qy = Math.round(p.y / QUANTIZE_GRID) * QUANTIZE_GRID;
	// -0 → 0 so signs never split a key.
	return `${qx + 0},${qy + 0}`;
}

/** Set of quantized "x,y" tokens for every on-curve point across the given
 *  path groups. A point drawn by two colors collapses to one token (Set). */
function quantizedTokenSet(...groups: readonly SVGPathData[][]): Set<string> {
	const tokens = new Set<string>();
	for (const group of groups) {
		for (const path of group) {
			for (const pt of parsePoints(path.d)) tokens.add(quantize(pt));
		}
	}
	return tokens;
}

/** Color-blind shape fingerprint: union of all blue/red/purple on-curve points,
 *  quantized, sorted, hashed. The primary equivalence key. */
export function shapeKey(p: MandalaPaths): string {
	const tokens = [...quantizedTokenSet(p.left, p.right, p.purple)].sort();
	return hashString(tokens.join(";"));
}

export interface ColorSignature {
	leftOnly: boolean;
	rightOnly: boolean;
	/** |blue∩red| / |blue∪red| over quantized points — the purple-overlap share. */
	comboPurpleRatio: number;
}

/** Which colors drew the glyph, and how much they overlap. Annotation only —
 *  never part of the primary shapeKey. */
export function colorSignature(p: MandalaPaths): ColorSignature {
	const left = quantizedTokenSet(p.left);
	const right = quantizedTokenSet(p.right);
	const hasLeft = left.size > 0;
	const hasRight = right.size > 0;

	let inter = 0;
	for (const t of left) if (right.has(t)) inter++;
	const union = left.size + right.size - inter;
	const comboPurpleRatio = union === 0 ? 0 : inter / union;

	return {
		leftOnly: hasLeft && !hasRight,
		rightOnly: hasRight && !hasLeft,
		comboPurpleRatio,
	};
}

// ─── Rotation/reflection orbit key (polar, exact by construction) ────────────
//
// A 45° rotation scales Cartesian coords by an irrational factor, so rotating
// points and re-quantizing is only ~99% invariant (boundary points scatter).
// Instead, quantize each point ONCE into (radius bucket, angle bucket) and let
// the dihedral group act on the INTEGER angle buckets: a 45° rotation is exactly
// +ORBIT_ROT_STEP buckets, a reflection is bucket negation. No re-rounding of
// transformed coordinates, so orbit membership is exact.

const ORBIT_RADIAL_GRID = 1; // px per radius bucket
const ORBIT_ANGLE_BUCKETS = 360; // divisible by 8 (rotation) and even (reflection)
const ORBIT_ROT_STEP = ORBIT_ANGLE_BUCKETS / 8; // buckets per 45°
const TWO_PI = Math.PI * 2;

interface PolarToken {
	r: number; // radius bucket
	a: number; // angle bucket in [0, ORBIT_ANGLE_BUCKETS)
}

/** Color-blind set of unique (radius, angle) buckets for every on-curve point. */
function polarTokens(p: MandalaPaths): PolarToken[] {
	const seen = new Set<string>();
	const toks: PolarToken[] = [];
	for (const group of [p.left, p.right, p.purple]) {
		for (const path of group) {
			for (const pt of parsePoints(path.d)) {
				const r = Math.round(Math.hypot(pt.x, pt.y) / ORBIT_RADIAL_GRID);
				const theta = (Math.atan2(pt.y, pt.x) + TWO_PI) % TWO_PI; // [0, 2π)
				const a = Math.round((theta / TWO_PI) * ORBIT_ANGLE_BUCKETS) % ORBIT_ANGLE_BUCKETS;
				const key = `${r},${a}`;
				if (!seen.has(key)) {
					seen.add(key);
					toks.push({ r, a });
				}
			}
		}
	}
	return toks;
}

/** Lexicographic-min canonical string over the 8 rotations × {identity, mirror}
 *  dihedral group acting on integer angle buckets. Members of one orbit produce
 *  the same canonical form exactly. */
function orbitCanonicalForm(toks: readonly PolarToken[]): string {
	let min: string | null = null;
	for (let step = 0; step < 8; step++) {
		for (const reflect of [false, true]) {
			const mapped = toks.map(({ r, a }) => {
				const base = reflect ? ORBIT_ANGLE_BUCKETS - a : a;
				const na = (base + step * ORBIT_ROT_STEP) % ORBIT_ANGLE_BUCKETS;
				return `${r},${na}`;
			});
			mapped.sort();
			const key = mapped.join(";");
			if (min === null || key < min) min = key;
		}
	}
	return min ?? "";
}

/** Rotation/reflection-invariant key: members of one orbit share this exactly.
 *  Annotation only — never part of the primary shapeKey. */
export function orbitKey(p: MandalaPaths): string {
	return hashString(orbitCanonicalForm(polarTokens(p)));
}
