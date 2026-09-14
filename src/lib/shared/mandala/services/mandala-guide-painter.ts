/**
 * Mandala Guide Painter
 *
 * The ONE routine that strokes prepared mandala paths onto a 2D context:
 * blue and red hand strokes with round caps, then the purple overlap where
 * the two hands cross. `MandalaOverlayCanvas` paints every live frame with
 * it, and `mandala-guide-image.ts` paints still images (Shape Matrix tiles
 * and the detail hero floor) with it, so a still mandala and the animator's
 * guide are pixel-identical by construction rather than by tuning.
 *
 * Coordinates: `scale` maps mandala units to CSS pixels around the canvas
 * center; `dpr` maps CSS pixels to device pixels. Stroke width is given in
 * CSS pixels and compensated for `scale`, exactly as the live overlay always
 * did, so a 2.5px guide is 2.5px whether it sits in a 150px tile or a
 * 1400px stage.
 */
import { compositeMandalaOverlap } from "./mandala-overlap-compositor";
import { mixColors } from "../domain/mandala-palette";
import { resolveViewerCustomColorPair } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";
import type { PreparedMandalaPath } from "./types";

export type MandalaGuideContext =
	| CanvasRenderingContext2D
	| OffscreenCanvasRenderingContext2D;

export interface MandalaGuidePaintTarget {
	context: MandalaGuideContext;
	/** Backing-store size in device pixels. */
	pixelWidth: number;
	pixelHeight: number;
	/** Device pixels per CSS pixel the target was allocated with. */
	dpr: number;
}

export interface MandalaGuidePaintOptions {
	paths: readonly PreparedMandalaPath[];
	/** Mandala units → CSS pixels. */
	scale: number;
	/** Stroke width in CSS pixels. */
	strokeWidth: number;
	/**
	 * Portion of every path revealed (0..1). Ignored when `reveal` is false:
	 * a guide is always the complete path.
	 */
	progress?: number;
	/** Progressive reveal (drawing mode) instead of the complete guide. */
	reveal?: boolean;
}

interface OverlapMaskPair {
	leftCanvas: OffscreenCanvas;
	leftContext: OffscreenCanvasRenderingContext2D;
	rightCanvas: OffscreenCanvas;
	rightContext: OffscreenCanvasRenderingContext2D;
}

/**
 * Two retained scratch canvases the purple-overlap pass intersects. Owned by
 * the painter's caller so a live overlay reuses them frame after frame.
 */
export class MandalaOverlapMasks {
	private leftCanvas: OffscreenCanvas | null = null;
	private leftContext: OffscreenCanvasRenderingContext2D | null = null;
	private rightCanvas: OffscreenCanvas | null = null;
	private rightContext: OffscreenCanvasRenderingContext2D | null = null;

	ensure(pixelWidth: number, pixelHeight: number): OverlapMaskPair | null {
		if (pixelWidth === 0 || pixelHeight === 0) return null;
		if (typeof OffscreenCanvas === "undefined") return null;

		const matches =
			this.leftCanvas?.width === pixelWidth &&
			this.leftCanvas?.height === pixelHeight &&
			this.rightCanvas?.width === pixelWidth &&
			this.rightCanvas?.height === pixelHeight;

		if (!matches) {
			this.leftCanvas = new OffscreenCanvas(pixelWidth, pixelHeight);
			this.leftContext = this.leftCanvas.getContext("2d");
			this.rightCanvas = new OffscreenCanvas(pixelWidth, pixelHeight);
			this.rightContext = this.rightCanvas.getContext("2d");
		}

		if (
			!this.leftCanvas ||
			!this.leftContext ||
			!this.rightCanvas ||
			!this.rightContext
		) {
			return null;
		}

		return {
			leftCanvas: this.leftCanvas,
			leftContext: this.leftContext,
			rightCanvas: this.rightCanvas,
			rightContext: this.rightContext,
		};
	}

	release(): void {
		this.leftCanvas = null;
		this.leftContext = null;
		this.rightCanvas = null;
		this.rightContext = null;
	}
}

function revealDash(
	path: PreparedMandalaPath,
	progress: number,
	reveal: boolean
): number[] {
	if (!reveal) return [];
	const clamped = Math.max(0, Math.min(1, progress));
	return [path.totalLength * clamped, path.totalLength];
}

function paintHandMask(
	context: OffscreenCanvasRenderingContext2D,
	hand: PreparedMandalaPath["hand"],
	target: MandalaGuidePaintTarget,
	options: MandalaGuidePaintOptions,
	center: number,
	adjustedStrokeWidth: number,
	progress: number,
	reveal: boolean
): void {
	context.setTransform(1, 0, 0, 1, 0, 0);
	context.clearRect(0, 0, target.pixelWidth, target.pixelHeight);
	context.globalCompositeOperation = "source-over";
	context.globalAlpha = 1;
	context.setTransform(target.dpr, 0, 0, target.dpr, 0, 0);
	context.translate(center, center);
	context.scale(options.scale, options.scale);
	context.strokeStyle = "white";
	context.lineWidth = adjustedStrokeWidth;
	context.lineCap = "round";
	context.lineJoin = "round";
	context.lineDashOffset = 0;

	for (const path of options.paths) {
		if (path.hand !== hand) continue;
		context.setLineDash(revealDash(path, progress, reveal));
		context.stroke(path.path2d);
	}
}

/**
 * Clear the target and paint the complete mandala guide (or the revealed
 * portion of it) with the purple overlap on top. Leaves the context's
 * transform as it found it.
 */
export function paintMandalaGuide(
	target: MandalaGuidePaintTarget,
	options: MandalaGuidePaintOptions,
	masks: MandalaOverlapMasks
): void {
	const { context, pixelWidth, pixelHeight, dpr } = target;
	const reveal = options.reveal ?? false;
	const progress = reveal ? (options.progress ?? 1) : 1;
	const center = pixelWidth / dpr / 2;
	// Compensate stroke width for the scale transform so it stays constant in
	// CSS pixels.
	const adjustedStrokeWidth = options.strokeWidth / options.scale;

	context.save();
	context.setTransform(1, 0, 0, 1, 0, 0);
	context.clearRect(0, 0, pixelWidth, pixelHeight);
	context.setTransform(dpr, 0, 0, dpr, 0, 0);
	context.translate(center, center);
	context.scale(options.scale, options.scale);

	for (const path of options.paths) {
		context.strokeStyle = path.color;
		context.lineWidth = adjustedStrokeWidth;
		context.lineCap = "round";
		context.lineJoin = "round";
		context.globalAlpha = 1;
		context.setLineDash(revealDash(path, progress, reveal));
		context.lineDashOffset = 0;
		context.stroke(path.path2d);
	}
	context.restore();

	const hasLeft = options.paths.some((path) => path.hand === "left");
	const hasRight = options.paths.some((path) => path.hand === "right");
	if (!hasLeft || !hasRight) return;

	const pair = masks.ensure(pixelWidth, pixelHeight);
	if (!pair) return;

	paintHandMask(
		pair.leftContext,
		"left",
		target,
		options,
		center,
		adjustedStrokeWidth,
		progress,
		reveal
	);
	paintHandMask(
		pair.rightContext,
		"right",
		target,
		options,
		center,
		adjustedStrokeWidth,
		progress,
		reveal
	);

	// Derive the intersection from the same hand colors as the visible paths.
	// A fixed purple incorrectly labels green/red or other custom palettes.
	const colors = resolveViewerCustomColorPair({
		left: options.paths.find((path) => path.hand === "left")?.color,
		right: options.paths.find((path) => path.hand === "right")?.color,
	});
	compositeMandalaOverlap({
		targetContext: context,
		overlapMaskContext: pair.leftContext,
		overlapMaskCanvas: pair.leftCanvas,
		otherMaskCanvas: pair.rightCanvas,
		width: pair.leftCanvas.width,
		height: pair.leftCanvas.height,
		color: mixColors(colors.left, colors.right),
	});
}
