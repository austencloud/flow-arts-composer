/**
 * Mandala Guide Image
 *
 * A still raster of a mandala painted by the SAME routine the animation
 * canvas uses for its guide overlay (`paintMandalaGuide`). Consumers that
 * need a mandala to be the animator's mandala — a Shape Matrix tile, the
 * detail hero's cold floor — get their `<img>` source here.
 *
 * Two fits:
 * - `extent`: the whole mandala fills its box (the standalone/tile rule the
 *   SVG renderer uses, so a busy high-turn tile never clips).
 * - `engine`: the mandala hand circle lands on the animation engine's hand
 *   orbit for a box of this size, which is exactly the transform the live
 *   overlay applies. Stack this over the animator's square and the two are
 *   the same pixels.
 */
import type {
	MandalaHandVisibility,
	MandalaPaths,
} from "../domain/mandala-types";
import { DEFAULT_MANDALA_OVERLAY_CONFIG } from "../domain/mandala-overlay-types";
import {
	MandalaOverlapMasks,
	paintMandalaGuide,
	type MandalaGuidePaintOptions,
	type MandalaGuidePaintTarget,
} from "./mandala-guide-painter";
import {
	computeEngineAlignedMandalaScale,
	prepareMandalaHandPaths,
} from "./mandala-path-preparer";
import { resolveMandalaRenderExtent } from "./mandala-renderer";
import type { PreparedMandalaPath } from "./types";

export type MandalaGuideFit = "extent" | "engine";

export interface MandalaGuideImageOptions {
	/** Box edge in CSS pixels; the image is square. */
	size: number;
	/** Device pixels per CSS pixel to rasterize at (default: window DPR). */
	dpr?: number;
	show?: MandalaHandVisibility;
	leftColor: string;
	rightColor: string;
	/** Stroke width in CSS pixels (default: the live overlay's). */
	strokeWidth?: number;
	fit: MandalaGuideFit;
	/** Tip reach used by the `extent` fit; ignored by `engine`. */
	tipDx?: number;
}

export interface MandalaGuideImageDependencies {
	createCanvas: () => HTMLCanvasElement | null;
	prepare: typeof prepareMandalaHandPaths;
	paint: typeof paintMandalaGuide;
}

/** Mandala units → CSS pixels for a square box of `size`, per fit. */
export function mandalaGuideScale(
	paths: MandalaPaths,
	options: Pick<MandalaGuideImageOptions, "size" | "fit" | "show" | "tipDx">
): number {
	if (options.fit === "engine") {
		return computeEngineAlignedMandalaScale(options.size);
	}
	const extent = resolveMandalaRenderExtent(paths, {
		show: options.show ?? "both",
		tipDx: options.tipDx,
	});
	return options.size / 2 / (extent * 1.05);
}

const masks = new MandalaOverlapMasks();

function browserCanvas(): HTMLCanvasElement | null {
	// No canvas on the server, and no Path2D in a DOM-only test environment:
	// either way there is nothing to paint into.
	if (typeof document === "undefined" || typeof Path2D === "undefined") {
		return null;
	}
	return document.createElement("canvas");
}

const DEFAULT_DEPS: MandalaGuideImageDependencies = {
	createCanvas: browserCanvas,
	prepare: prepareMandalaHandPaths,
	paint: paintMandalaGuide,
};

interface GuideSurface {
	target: MandalaGuidePaintTarget;
	paint: MandalaGuidePaintOptions;
}

/**
 * Size `canvas` for a square box of `options.size` at the device pixel ratio
 * and prepare the paths the options show. The still and the reveal frame share
 * this, so a finished reveal paints the still's drawing. Only a reveal measures
 * paths: its dash lengths come from real path lengths, and a complete guide
 * never reads them.
 */
function prepareGuideSurface(
	canvas: HTMLCanvasElement,
	paths: MandalaPaths,
	options: MandalaGuideImageOptions,
	prepare: MandalaGuideImageDependencies["prepare"],
	measure: boolean
): GuideSurface | null {
	const size = Math.round(options.size);
	if (!(size > 0)) return null;
	const context = canvas.getContext("2d");
	if (!context) return null;

	const dpr =
		options.dpr ??
		(typeof window !== "undefined" ? (window.devicePixelRatio ?? 1) : 1);
	const pixelSize = Math.max(1, Math.round(size * dpr));
	canvas.width = pixelSize;
	canvas.height = pixelSize;

	const show = options.show ?? "both";
	const prepared: PreparedMandalaPath[] = [];
	if (show === "left" || show === "both") {
		prepared.push(
			...prepare(paths.left, options.leftColor, "left", { measure })
		);
	}
	if (show === "right" || show === "both") {
		prepared.push(
			...prepare(paths.right, options.rightColor, "right", { measure })
		);
	}

	return {
		target: {
			context,
			pixelWidth: pixelSize,
			pixelHeight: pixelSize,
			dpr,
		},
		paint: {
			paths: prepared,
			scale: mandalaGuideScale(paths, { ...options, show }),
			strokeWidth:
				options.strokeWidth ?? DEFAULT_MANDALA_OVERLAY_CONFIG.strokeWidth,
		},
	};
}

/**
 * Paint the guide into a fresh canvas and return it as a data URL. Returns
 * an empty string where no canvas can exist (server render) or the box has
 * no size yet; the consumer renders nothing until it has one.
 */
export function renderMandalaGuideImage(
	paths: MandalaPaths,
	options: MandalaGuideImageOptions,
	deps: MandalaGuideImageDependencies = DEFAULT_DEPS
): string {
	if (!(Math.round(options.size) > 0)) return "";
	const canvas = deps.createCanvas();
	if (!canvas) return "";
	const surface = prepareGuideSurface(
		canvas,
		paths,
		options,
		deps.prepare,
		false
	);
	if (!surface) return "";
	deps.paint(surface.target, surface.paint, masks);
	return canvas.toDataURL("image/png");
}

/** A guide drawing itself into a canvas the caller owns. */
export interface MandalaGuideRevealFrame {
	/**
	 * Paint the guide revealed to `progress` (0..1). At 1 it paints the
	 * complete guide: the drawing `renderMandalaGuideImage` returns for the
	 * same options.
	 */
	paint(progress: number): void;
}

/**
 * The still's progressive twin: the live overlay's reveal (`reveal` and
 * `progress`) at a still's size and fit. The Create front door's Shape
 * preview draws a matrix tile's mandala with it. Returns null where nothing
 * can be painted: no size yet, or no 2D context.
 */
export function createMandalaGuideRevealFrame(
	canvas: HTMLCanvasElement,
	paths: MandalaPaths,
	options: MandalaGuideImageOptions,
	deps: Pick<MandalaGuideImageDependencies, "prepare" | "paint"> = DEFAULT_DEPS
): MandalaGuideRevealFrame | null {
	const surface = prepareGuideSurface(
		canvas,
		paths,
		options,
		deps.prepare,
		true
	);
	if (!surface) return null;
	// Its own scratch masks: a reveal repaints every frame at one size, and the
	// stills' shared masks would be reallocated between sizes.
	const frameMasks = new MandalaOverlapMasks();
	return {
		paint(progress: number): void {
			// NaN (say, a zero-length turn) counts as done, not a stale partial dash.
			const complete = !(progress < 1);
			deps.paint(
				surface.target,
				{
					...surface.paint,
					reveal: !complete,
					progress: complete ? 1 : Math.max(0, progress),
				},
				frameMasks
			);
		},
	};
}
