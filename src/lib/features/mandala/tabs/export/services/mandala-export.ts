/**
 * Mandala Export Service
 *
 * Renders a mandala to PNG via the SVG → Canvas pipeline.
 * Uses the shared geometry calculator and SVG renderer, then
 * rasterizes to a canvas for blob export.
 */

import { calculate as calculateMandalaGeometry } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
import { renderMandalaToCanvas } from "#lib/shared/mandala/services/mandala-renderer.js";
import { pairTipEnds } from "#lib/shared/pictograph/prop/domain/prop-tip-ends.js";
import type { StepLike } from "#lib/shared/mandala/services/types.js";
import type {
	MandalaPathShape,
	MandalaRenderOptions,
} from "#lib/shared/mandala/domain/mandala-types.js";
import { getMandalaPathOptions } from "#lib/shared/mandala/services/mandala-path-options.js";

export interface ExportOptions {
	size: number;
	background: "transparent" | "black" | "white";
	strokeWidth: number;
	show: MandalaRenderOptions["show"];
	pathShape: MandalaPathShape;
}

const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
	size: 1080,
	background: "transparent",
	strokeWidth: 2.5,
	show: "both",
	pathShape: "arc",
};

function drawMandala(opts: ExportOptions, steps: StepLike[], leftPropType: string | undefined, rightPropType: string | undefined): HTMLCanvasElement {
	const tipEnds = pairTipEnds(leftPropType, rightPropType);
	const paths = calculateMandalaGeometry(
		steps,
		leftPropType,
		rightPropType,
		getMandalaPathOptions(opts.pathShape, tipEnds),
	);

	const canvas = document.createElement("canvas");
	canvas.width = opts.size;
	canvas.height = opts.size;
	const ctx = canvas.getContext("2d")!;

	// Fill background if not transparent
	if (opts.background !== "transparent") {
		ctx.fillStyle = opts.background;
		ctx.fillRect(0, 0, opts.size, opts.size);
	}

	// Draw the mandala straight to the canvas via the shared canvas renderer.
	// (The old path rasterized renderMandalaSVG through an <img>, but that SVG is
	// emitted with width/height="100%" and no intrinsic pixel size, so the <img>
	// loaded 0-sized and the drawImage produced a blank PNG. renderMandalaToCanvas
	// is the same primitive the animated frame renderer uses — no SVG round-trip.)
	renderMandalaToCanvas(ctx, paths, {
		size: opts.size,
		style: "stroke",
		show: opts.show,
		strokeWidth: opts.strokeWidth,
		offsetX: 0,
		offsetY: 0,
	});

	return canvas;
}

export async function exportMandalaPNG(
	steps: StepLike[],
	leftPropType: string | undefined,
	rightPropType: string | undefined,
	options: Partial<ExportOptions> = {},
): Promise<Blob> {
	const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };
	const canvas = drawMandala(opts, steps, leftPropType, rightPropType);

	return new Promise<Blob>((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (blob) resolve(blob);
				else reject(new Error("Canvas toBlob returned null"));
			},
			"image/png",
		);
	});
}

/**
 * Discovery poster for the public-artifact envelope: a square WebP data URL of
 * the mandala on an opaque ground, small enough for the storage rule's 200 KB
 * ceiling. Derived from the same geometry the detail view redraws, so a poster
 * can never depict something the payload does not.
 */
// Explore hangs artwork on a plinth that reaches ~950 CSS px on a 4K canvas, so
// the poster is sized to cover that 1:1 rather than be upscaled. Thin strokes on
// black compress hard — this stays well inside POSTER_MAX_BYTES at 0.85.
const POSTER_SIZE = 1024;
/** Stroke weight is absolute pixels, so it has to track POSTER_SIZE or the
 *  figure thins out every time the poster grows. 5px at the original 512 is the
 *  weight this was tuned at. */
const POSTER_STROKE_RATIO = 5 / 512;
const POSTER_MAX_BYTES = 200 * 1024;
const POSTER_QUALITIES = [0.85, 0.7, 0.55] as const;

export function renderMandalaPosterDataUrl(
	steps: StepLike[],
	leftPropType: string | undefined,
	rightPropType: string | undefined,
	options: Partial<Pick<ExportOptions, "show" | "pathShape">> = {},
): string {
	const canvas = drawMandala(
		{
			...DEFAULT_EXPORT_OPTIONS,
			size: POSTER_SIZE,
			background: "black",
			strokeWidth: POSTER_SIZE * POSTER_STROKE_RATIO,
			...options,
		},
		steps,
		leftPropType,
		rightPropType,
	);

	let dataUrl = "";
	for (const quality of POSTER_QUALITIES) {
		dataUrl = canvas.toDataURL("image/webp", quality);
		// base64 carries 3 bytes per 4 characters; the header is negligible here.
		if ((dataUrl.length * 3) / 4 <= POSTER_MAX_BYTES) return dataUrl;
	}
	return dataUrl;
}
