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
	const size = Math.round(options.size);
	if (!(size > 0)) return "";
	const canvas = deps.createCanvas();
	if (!canvas) return "";
	const context = canvas.getContext("2d");
	if (!context) return "";

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
			...deps.prepare(paths.left, options.leftColor, "left", { measure: false })
		);
	}
	if (show === "right" || show === "both") {
		prepared.push(
			...deps.prepare(paths.right, options.rightColor, "right", {
				measure: false,
			})
		);
	}

	const target: MandalaGuidePaintTarget = {
		context,
		pixelWidth: pixelSize,
		pixelHeight: pixelSize,
		dpr,
	};
	const paint: MandalaGuidePaintOptions = {
		paths: prepared,
		scale: mandalaGuideScale(paths, { ...options, show }),
		strokeWidth: options.strokeWidth ?? DEFAULT_MANDALA_OVERLAY_CONFIG.strokeWidth,
	};
	deps.paint(target, paint, masks);
	return canvas.toDataURL("image/png");
}
