/**
 * How much of its square a mandala covers, and a key that names its picture.
 *
 * The words of two sequences say nothing about how alike their mandalas look:
 * the same word with and without turns draws two different figures, and two
 * different words can trace one figure. The traced geometry is dropped onto
 * a coarse grid spanning the square the still is drawn in; coverage is the
 * share of cells a line passes through, and the key is a hash of those cells.
 * Overlap counts once, so a word that retraces the same petals four times
 * scores as sparse as it looks.
 */
import type { MandalaPaths, MandalaPoint, SVGPathData } from "../domain/mandala-types";
import { MANDALA_STANDARD_TIP_DX } from "../domain/mandala-constants";
import { resolveMandalaRenderExtent } from "./mandala-renderer";

/** Cells per side of the grid the geometry is dropped onto. */
export const DENSITY_GRID = 64;

export interface MandalaSignature {
	/** Share of the grid's cells a line passes through, 0 to 1. */
	coverage: number;
	/** Names the picture: equal for geometries that mark the same cells. */
	key: string;
}

export const EMPTY_MANDALA_SIGNATURE: MandalaSignature = { coverage: 0, key: "" };

const SIGNATURES = new WeakMap<MandalaPaths, MandalaSignature>();

/** Coverage and key of a geometry, measured once per geometry object. */
export function mandalaSignature(paths: MandalaPaths): MandalaSignature {
	const cached = SIGNATURES.get(paths);
	if (cached) return cached;
	const signature = measure(paths);
	SIGNATURES.set(paths, signature);
	return signature;
}

export function mandalaCoverage(paths: MandalaPaths): number {
	return mandalaSignature(paths).coverage;
}

export function mandalaKey(paths: MandalaPaths): string {
	return mandalaSignature(paths).key;
}

function measure(paths: MandalaPaths): MandalaSignature {
	const traces = [...paths.left, ...paths.right].map(pointsOf).filter((p) => p.length > 0);
	if (traces.length === 0) return EMPTY_MANDALA_SIGNATURE;

	const extent = resolveMandalaRenderExtent(paths, {
		show: "both",
		tipDx: MANDALA_STANDARD_TIP_DX,
	});
	if (!(extent > 0)) return EMPTY_MANDALA_SIGNATURE;

	const cell = (2 * extent) / DENSITY_GRID;
	const cells = new Uint8Array(DENSITY_GRID * DENSITY_GRID);
	let marked = 0;
	const mark = (x: number, y: number): void => {
		const cx = clampIndex(Math.floor((x + extent) / cell));
		const cy = clampIndex(Math.floor((y + extent) / cell));
		const i = cy * DENSITY_GRID + cx;
		if (cells[i] === 0) {
			cells[i] = 1;
			marked++;
		}
	};

	for (const points of traces) {
		mark(points[0]!.x, points[0]!.y);
		for (let i = 1; i < points.length; i++) {
			const from = points[i - 1]!;
			const to = points[i]!;
			// Half-cell steps: a segment longer than a cell still marks every
			// cell it crosses.
			const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (cell / 2)));
			for (let s = 1; s <= steps; s++) {
				const t = s / steps;
				mark(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
			}
		}
	}

	return {
		coverage: marked / cells.length,
		key: `${fnv1a(cells).toString(16).padStart(8, "0")}-${marked}`,
	};
}

function clampIndex(i: number): number {
	return i < 0 ? 0 : i >= DENSITY_GRID ? DENSITY_GRID - 1 : i;
}

/** A path's on-curve points: its beats, or the end point of each command. */
function pointsOf(path: SVGPathData): MandalaPoint[] {
	if (path.beats && path.beats.length > 0) return path.beats.flat();
	return endPointsOf(path.d);
}

function endPointsOf(d: string): MandalaPoint[] {
	const points: MandalaPoint[] = [];
	for (const command of d.split(/(?=[A-Za-z])/)) {
		const numbers = command.match(/-?\d*\.?\d+(?:e-?\d+)?/g);
		if (!numbers || numbers.length < 2) continue;
		const x = Number(numbers[numbers.length - 2]);
		const y = Number(numbers[numbers.length - 1]);
		if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
	}
	return points;
}

function fnv1a(bytes: Uint8Array): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < bytes.length; i++) {
		hash ^= bytes[i]!;
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash >>> 0;
}
