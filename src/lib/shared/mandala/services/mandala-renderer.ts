/**
 * Mandala Renderer
 *
 * Takes pre-computed MandalaPaths and renders them to either an SVG string
 * or a Canvas 2D context. Stateless - the same paths can be rendered
 * at any size or style without recomputation.
 */

import {
	MANDALA_GRID_RADIUS,
	ENGINE_GRID_RADIUS,
	MANDALA_STANDARD_TIP_DX,
	BLUE_STROKE,
	RED_STROKE,
	BLUE_FILL,
	RED_FILL,
	PURPLE_STROKE,
	PURPLE_FILL,
} from "../domain/mandala-constants";
import { DEFAULT_OVERLAP_CONFIG } from "../domain/mandala-types";
import type { MandalaPaths, MandalaRenderOptions } from "../domain/mandala-types";
import { compositeMandalaOverlap } from "./mandala-overlap-compositor";
import {
	mandalaJoinReach,
	type MandalaHandOffsets,
} from "./mandala-grid-join";

let maskIdCounter = 0;

function strokeAttributes(color: string, strokeWidth: number): string {
	return `fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" opacity="0.9"`;
}

function filledAttributes(strokeColor: string, fillColor: string, strokeWidth: number): string {
	const sw = (strokeWidth * 0.6).toFixed(2);
	return `fill="${fillColor}" stroke="${strokeColor}" stroke-width="${sw}" stroke-linecap="round"`;
}

/**
 * Bounding box of an SVG path `d` string. The calculator emits only `M`/`C`
 * commands with absolute coordinate pairs, so every number is an x or y in
 * alternating order — pair them and track extents. Used to map an
 * objectBoundingBox-style per-path gradient onto the canvas (parity with the
 * SVG renderer's `<linearGradient gradientUnits="objectBoundingBox">`).
 */
function pathBBox(d: string): { minX: number; minY: number; maxX: number; maxY: number } {
	const nums = d.match(/-?\d+(?:\.\d+)?/g);
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	if (nums) {
		for (let i = 0; i + 1 < nums.length; i += 2) {
			const x = parseFloat(nums[i]!);
			const y = parseFloat(nums[i + 1]!);
			if (x < minX) minX = x;
			if (y < minY) minY = y;
			if (x > maxX) maxX = x;
			if (y > maxY) maxY = y;
		}
	}
	if (minX === Infinity) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
	return { minX, minY, maxX, maxY };
}

/** Diagonal gradient across a path's bbox (top-left → bottom-right), matching
 *  the SVG objectBoundingBox gradient with x1y1=(0,0) x2y2=(1,1). */
function bboxGradient(
	ctx: CanvasRenderingContext2D,
	d: string,
	stops: [string, string],
): CanvasGradient {
	const b = pathBBox(d);
	const g = ctx.createLinearGradient(b.minX, b.minY, b.maxX, b.maxY);
	g.addColorStop(0, stops[0]);
	g.addColorStop(1, stops[1]);
	return g;
}

function drawPath(
	ctx: CanvasRenderingContext2D,
	d: string,
	strokeColor: string | CanvasGradient,
	fillColor: string | CanvasGradient,
	style: "stroke" | "filled",
	strokeWidth: number,
): void {
	const path = new Path2D(d);

	if (style === "filled") {
		ctx.fillStyle = fillColor;
		ctx.fill(path);
		ctx.strokeStyle = strokeColor;
		ctx.lineWidth = strokeWidth * 0.6;
		ctx.lineCap = "round";
		ctx.stroke(path);
	} else {
		ctx.strokeStyle = strokeColor;
		ctx.lineWidth = strokeWidth;
		ctx.lineCap = "round";
		ctx.globalAlpha = 0.9;
		ctx.stroke(path);
		ctx.globalAlpha = 1;
	}
}

function drawMaskPath(
	ctx: OffscreenCanvasRenderingContext2D,
	d: string,
	style: "stroke" | "filled",
	strokeWidth: number,
): void {
	const path = new Path2D(d);
	if (style === "filled") {
		ctx.fillStyle = "white";
		ctx.fill(path);
		ctx.strokeStyle = "white";
		ctx.lineWidth = strokeWidth * 0.6;
		ctx.lineCap = "round";
		ctx.stroke(path);
	} else {
		ctx.strokeStyle = "white";
		ctx.lineWidth = strokeWidth;
		ctx.lineCap = "round";
		ctx.stroke(path);
	}
}

const PATH_TOKEN_PATTERN = /[MC]|[-+]?(?:\d*\.?\d+)(?:[eE][-+]?\d+)?/g;
const CUBIC_EPSILON = 1e-9;

function cubicValue(
	p0: number,
	p1: number,
	p2: number,
	p3: number,
	t: number
): number {
	const mt = 1 - t;
	return (
		mt * mt * mt * p0 +
		3 * mt * mt * t * p1 +
		3 * mt * t * t * p2 +
		t * t * t * p3
	);
}

function cubicAxisExtent(
	p0: number,
	p1: number,
	p2: number,
	p3: number
): number {
	let extent = Math.max(Math.abs(p0), Math.abs(p3));
	const a = -p0 + 3 * p1 - 3 * p2 + p3;
	const b = 2 * (p0 - 2 * p1 + p2);
	const c = p1 - p0;
	const candidates: number[] = [];

	if (Math.abs(a) < CUBIC_EPSILON) {
		if (Math.abs(b) >= CUBIC_EPSILON) candidates.push(-c / b);
	} else {
		const discriminant = b * b - 4 * a * c;
		if (discriminant >= 0) {
			const root = Math.sqrt(discriminant);
			candidates.push((-b + root) / (2 * a), (-b - root) / (2 * a));
		}
	}

	for (const t of candidates) {
		if (t > 0 && t < 1) {
			extent = Math.max(extent, Math.abs(cubicValue(p0, p1, p2, p3, t)));
		}
	}
	return extent;
}

function pathCoordinateExtent(d: string): number {
	const tokens = d.match(PATH_TOKEN_PATTERN);
	if (!tokens) return 0;

	let extent = 0;
	let x = 0;
	let y = 0;
	for (let i = 0; i < tokens.length; ) {
		const command = tokens[i++];
		if (command === "M") {
			x = Number.parseFloat(tokens[i++] ?? "0");
			y = Number.parseFloat(tokens[i++] ?? "0");
			extent = Math.max(extent, Math.abs(x), Math.abs(y));
			continue;
		}
		if (command !== "C") continue;

		const x1 = Number.parseFloat(tokens[i++] ?? "0");
		const y1 = Number.parseFloat(tokens[i++] ?? "0");
		const x2 = Number.parseFloat(tokens[i++] ?? "0");
		const y2 = Number.parseFloat(tokens[i++] ?? "0");
		const x3 = Number.parseFloat(tokens[i++] ?? "0");
		const y3 = Number.parseFloat(tokens[i++] ?? "0");
		extent = Math.max(
			extent,
			cubicAxisExtent(x, x1, x2, x3),
			cubicAxisExtent(y, y1, y2, y3)
		);
		x = x3;
		y = y3;
	}
	return extent;
}

/**
 * The joined-grid hand offsets a render applies: only when both hands show,
 * since a one-hand view keeps its figure centered.
 */
function joinedHandOffsets(
	options: Pick<MandalaRenderOptions, "show" | "handOffsets">
): MandalaHandOffsets | null {
	return options.show === "both" ? (options.handOffsets ?? null) : null;
}

/** `<g>` that moves a hand's paths onto its own grid; "" when unmoved. */
function handGroupOpen(offset: { x: number; y: number } | undefined): string {
	return offset
		? `<g transform="translate(${offset.x.toFixed(2)}, ${offset.y.toFixed(2)})">`
		: "";
}

function handGroupClose(offset: { x: number; y: number } | undefined): string {
	return offset ? "</g>" : "";
}

/**
 * Preserve the established scale for ordinary mandalas, but make room when a
 * prop's real traced points extend farther than the standard staff-sized fit.
 * Joined grids add how far the pair reaches past one figure.
 */
export function resolveMandalaRenderExtent(
	paths: MandalaPaths,
	options: Pick<MandalaRenderOptions, "show" | "tipDx" | "handOffsets">
): number {
	return (
		resolveFigureExtent(paths, options) +
		mandalaJoinReach(joinedHandOffsets(options))
	);
}

function resolveFigureExtent(
	paths: MandalaPaths,
	options: Pick<MandalaRenderOptions, "show" | "tipDx">
): number {
	const effectiveTipDx = Math.max(
		options.tipDx ?? MANDALA_STANDARD_TIP_DX,
		MANDALA_STANDARD_TIP_DX
	);
	const standardExtent =
		MANDALA_GRID_RADIUS +
		(effectiveTipDx * MANDALA_GRID_RADIUS) / ENGINE_GRID_RADIUS;
	const visiblePaths =
		options.show === "left"
			? paths.left
			: options.show === "right"
				? paths.right
				: [...paths.left, ...paths.right];
	const tracedExtent = visiblePaths.reduce(
		(max, path) => Math.max(max, pathCoordinateExtent(path.d)),
		0
	);

	// The existing 5% breathing room already contains ordinary prop geometry.
	// Keep that exact scale until the path would cross the padded boundary.
	return tracedExtent <= standardExtent * 1.05
		? standardExtent
		: tracedExtent;
}

export function renderMandalaSVG(paths: MandalaPaths, options: MandalaRenderOptions): string {
	const { size, style, show, strokeWidth = 2.5 } = options;
	const center = size / 2;

	const maxExtent = resolveMandalaRenderExtent(paths, options);
	const scale = center / (maxExtent * 1.05);
	// A perfectly horizontal or vertical mandala has no geometric width or
	// height. SVG ignores object-bounding-box filters and masks in that case,
	// which made a real straight-line result disappear from static previews.
	// Fixed user-space regions keep the glow and overlap treatment without
	// making visibility depend on the path's bounding-box dimensions.
	const glowExtent = maxExtent * 1.4;
	const featherExtent = maxExtent * 1.2;
	const bloomExtent = maxExtent * 2;

	const parts: string[] = [];

	const uid = maskIdCounter++;
	const needsMask = show === "both" && paths.left.length > 0 && paths.right.length > 0;
	const ov = options.overlap ?? DEFAULT_OVERLAP_CONFIG;
	const offsets = joinedHandOffsets(options);
	const leftOffset = offsets?.left;
	const rightOffset = offsets?.right;

	parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="100%" height="100%" overflow="hidden">`);
	parts.push(`  <defs>`);
	parts.push(`    <filter id="glow" filterUnits="userSpaceOnUse" x="${(-glowExtent).toFixed(2)}" y="${(-glowExtent).toFixed(2)}" width="${(glowExtent * 2).toFixed(2)}" height="${(glowExtent * 2).toFixed(2)}">`);
	parts.push(`      <feGaussianBlur stdDeviation="3" result="blur"/>`);
	parts.push(`      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>`);
	parts.push(`    </filter>`);

	if (needsMask) {
		parts.push(`    <filter id="feather${uid}" filterUnits="userSpaceOnUse" x="${(-featherExtent).toFixed(2)}" y="${(-featherExtent).toFixed(2)}" width="${(featherExtent * 2).toFixed(2)}" height="${(featherExtent * 2).toFixed(2)}">`);
		parts.push(`      <feGaussianBlur stdDeviation="${ov.feather}"/>`);
		parts.push(`    </filter>`);
		parts.push(`    <filter id="bloom${uid}" filterUnits="userSpaceOnUse" x="${(-bloomExtent).toFixed(2)}" y="${(-bloomExtent).toFixed(2)}" width="${(bloomExtent * 2).toFixed(2)}" height="${(bloomExtent * 2).toFixed(2)}">`);
		parts.push(`      <feGaussianBlur stdDeviation="${ov.bloomBlur}" result="b"/>`);
		parts.push(`      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>`);
		parts.push(`    </filter>`);
		parts.push(`    <mask id="bom${uid}" maskUnits="userSpaceOnUse" x="${(-featherExtent).toFixed(2)}" y="${(-featherExtent).toFixed(2)}" width="${(featherExtent * 2).toFixed(2)}" height="${(featherExtent * 2).toFixed(2)}">`);
		parts.push(`      <g filter="url(#feather${uid})">${handGroupOpen(leftOffset)}`);
		for (const pathData of paths.left) {
			if (style === "filled") {
				const sw = (strokeWidth * 0.6).toFixed(2);
				parts.push(`        <path d="${pathData.d}" fill="white" stroke="white" stroke-width="${sw}" stroke-linecap="round"/>`);
			} else {
				parts.push(`        <path d="${pathData.d}" fill="none" stroke="white" stroke-width="${strokeWidth}" stroke-linecap="round"/>`);
			}
		}
		parts.push(`      ${handGroupClose(leftOffset)}</g>`);
		parts.push(`    </mask>`);
	}

	if (options.gradient) {
		const g = options.gradient;
		parts.push(`    <linearGradient id="gBlue${uid}" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="1">`);
		parts.push(`      <stop offset="0%" stop-color="${g.left[0]}"/>`);
		parts.push(`      <stop offset="100%" stop-color="${g.left[1]}"/>`);
		parts.push(`    </linearGradient>`);
		parts.push(`    <linearGradient id="gRed${uid}" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="1">`);
		parts.push(`      <stop offset="0%" stop-color="${g.right[0]}"/>`);
		parts.push(`      <stop offset="100%" stop-color="${g.right[1]}"/>`);
		parts.push(`    </linearGradient>`);
		parts.push(`    <linearGradient id="gPurple${uid}" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="1">`);
		parts.push(`      <stop offset="0%" stop-color="${g.purple[0]}"/>`);
		parts.push(`      <stop offset="100%" stop-color="${g.purple[1]}"/>`);
		parts.push(`    </linearGradient>`);
	}

	parts.push(`  </defs>`);

	parts.push(`  <g transform="translate(${center}, ${center}) scale(${scale.toFixed(4)})" filter="url(#glow)">`);


	const palette = options.palette ?? {
		leftStroke: BLUE_STROKE,
		leftFill: BLUE_FILL,
		rightStroke: RED_STROKE,
		rightFill: RED_FILL,
		purpleStroke: PURPLE_STROKE,
		purpleFill: PURPLE_FILL,
	};

	const leftColor = options.gradient ? `url(#gBlue${uid})` : palette.leftStroke;
	const rightColor = options.gradient ? `url(#gRed${uid})` : palette.rightStroke;

	if (show === "left" || show === "both") {
		if (leftOffset) parts.push(`    ${handGroupOpen(leftOffset)}`);
		for (const pathData of paths.left) {
			const attrs = style === "filled"
				? filledAttributes(leftColor, palette.leftFill, strokeWidth)
				: strokeAttributes(leftColor, strokeWidth);
			parts.push(`    <path d="${pathData.d}" ${attrs}/>`);
		}
		if (leftOffset) parts.push(`    ${handGroupClose(leftOffset)}`);
	}

	if (show === "right" || show === "both") {
		if (rightOffset) parts.push(`    ${handGroupOpen(rightOffset)}`);
		for (const pathData of paths.right) {
			const attrs = style === "filled"
				? filledAttributes(rightColor, palette.rightFill, strokeWidth)
				: strokeAttributes(rightColor, strokeWidth);
			parts.push(`    <path d="${pathData.d}" ${attrs}/>`);
		}
		if (rightOffset) parts.push(`    ${handGroupClose(rightOffset)}`);
	}

	if (needsMask) {
		const purpleColor = options.gradient ? `url(#gPurple${uid})` : palette.purpleStroke;
		const purpleCore = style === "filled"
			? `fill="${palette.purpleFill}" stroke="${purpleColor}" stroke-width="${(strokeWidth * 0.6).toFixed(2)}" stroke-linecap="round"`
			: `fill="none" stroke="${purpleColor}" stroke-width="${strokeWidth}" stroke-linecap="round"`;
		parts.push(`    <g mask="url(#bom${uid})" opacity="${ov.coreOpacity}">${handGroupOpen(rightOffset)}`);
		for (const pathData of paths.right) {
			parts.push(`      <path d="${pathData.d}" ${purpleCore}/>`);
		}
		parts.push(`    ${handGroupClose(rightOffset)}</g>`);

		const bloomWidth = style === "filled" ? strokeWidth : strokeWidth * ov.bloomWidth;
		parts.push(`    <g mask="url(#bom${uid})" filter="url(#bloom${uid})" opacity="${ov.bloomOpacity}">${handGroupOpen(rightOffset)}`);
		for (const pathData of paths.right) {
			parts.push(`      <path d="${pathData.d}" fill="none" stroke="${purpleColor}" stroke-width="${bloomWidth}" stroke-linecap="round"/>`);
		}
		parts.push(`    ${handGroupClose(rightOffset)}</g>`);
	}

	parts.push(`  </g>`);
	parts.push(`</svg>`);

	return parts.join("\n");
}

export function renderMandalaToCanvas(
	ctx: CanvasRenderingContext2D,
	paths: MandalaPaths,
	options: MandalaRenderOptions & { offsetX: number; offsetY: number },
): void {
	const { size, style, show, strokeWidth = 2, offsetX, offsetY } = options;
	const center = size / 2;
	const maxExtent = resolveMandalaRenderExtent(paths, options);
	const scale = center / (maxExtent * 1.05);

	const gradient = options.gradient;

	ctx.save();

	ctx.translate(offsetX + center, offsetY + center);
	ctx.scale(scale, scale);

	const palette = options.palette ?? {
		leftStroke: BLUE_STROKE,
		leftFill: BLUE_FILL,
		rightStroke: RED_STROKE,
		rightFill: RED_FILL,
		purpleStroke: PURPLE_STROKE,
		purpleFill: PURPLE_FILL,
	};

	// Opt-in soft glow (export only). The original parity render set a
	// `shadowBlur` on EVERY stroke — on mobile that is one offscreen blur per
	// path (dozens per frame) and dominates render time. Collapse it to ONE blur
	// per color: draw the color's crisp strokes onto a scratch canvas, then blit
	// that whole layer to the target a single time with the shadow enabled, so
	// the entire layer gets one halo. The per-stroke version already used a
	// single representative shadow color per layer (gradient start in flow mode),
	// and per-stroke globalAlpha accumulates identically on the scratch, so this
	// is visually equivalent. Non-glow callers (card back, gallery) keep the
	// direct draw with no extra canvas.
	const glow = options.glow;
	const w = ctx.canvas.width;
	const h = ctx.canvas.height;
	const sc = options.maskScratch;
	const scratchFits = !!sc && sc.a.width === w && sc.a.height === h && sc.b.width === w && sc.b.height === h;
	const glowLeft = glow ? (scratchFits ? sc!.a : new OffscreenCanvas(w, h)) : null;
	const glowRight = glow ? (scratchFits ? sc!.b : new OffscreenCanvas(w, h)) : null;

	const offsets = joinedHandOffsets(options);

	const paintColor = (
		layerPaths: { d: string }[],
		solidStroke: string,
		fillColor: string,
		gradientPair: [string, string] | undefined,
		glowCanvas: OffscreenCanvas | null,
		offset: { x: number; y: number } | undefined,
	): void => {
		// A joined hand's figure moves onto its own grid. The glow pass copies
		// this transform, so the glow layer moves with it.
		if (offset) {
			ctx.save();
			ctx.translate(offset.x, offset.y);
		}
		paintLayer(layerPaths, solidStroke, fillColor, gradientPair, glowCanvas);
		if (offset) ctx.restore();
	};

	const paintLayer = (
		layerPaths: { d: string }[],
		solidStroke: string,
		fillColor: string,
		gradientPair: [string, string] | undefined,
		glowCanvas: OffscreenCanvas | null,
	): void => {
		if (!glow || !glowCanvas) {
			for (const p of layerPaths) {
				const stroke = gradientPair ? bboxGradient(ctx, p.d, gradientPair) : solidStroke;
				drawPath(ctx, p.d, stroke, fillColor, style, strokeWidth);
			}
			return;
		}
		const gctx = glowCanvas.getContext("2d") as unknown as CanvasRenderingContext2D;
		gctx.setTransform(1, 0, 0, 1, 0, 0);
		gctx.globalCompositeOperation = "source-over";
		gctx.clearRect(0, 0, w, h);
		gctx.setTransform(ctx.getTransform());
		for (const p of layerPaths) {
			const stroke = gradientPair ? bboxGradient(gctx, p.d, gradientPair) : solidStroke;
			drawPath(gctx, p.d, stroke, fillColor, style, strokeWidth);
		}
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.shadowColor = gradientPair ? gradientPair[0] : solidStroke;
		ctx.shadowBlur = glow.blur;
		ctx.drawImage(glowCanvas, 0, 0);
		ctx.restore();
	};

	if (show === "left" || show === "both") {
		paintColor(paths.left, palette.leftStroke, palette.leftFill, gradient?.left, glowLeft, offsets?.left);
	}
	if (show === "right" || show === "both") {
		paintColor(paths.right, palette.rightStroke, palette.rightFill, gradient?.right, glowRight, offsets?.right);
	}

	if (show === "both" && paths.left.length > 0 && paths.right.length > 0) {
		const transform = ctx.getTransform();
		const w = ctx.canvas.width;
		const h = ctx.canvas.height;

		// Reuse caller-provided scratch canvases (export hot loop) when they match
		// the target size; otherwise allocate fresh. Reused canvases must be
		// cleared since the previous frame's mask is still on them.
		const scratch = options.maskScratch;
		const reuse = scratch && scratch.a.width === w && scratch.a.height === h && scratch.b.width === w && scratch.b.height === h;
		const maskB = reuse ? scratch!.a : new OffscreenCanvas(w, h);
		const maskR = reuse ? scratch!.b : new OffscreenCanvas(w, h);
		const bC = maskB.getContext("2d")!;
		const rC = maskR.getContext("2d")!;

		if (reuse) {
			bC.setTransform(1, 0, 0, 1, 0, 0);
			rC.setTransform(1, 0, 0, 1, 0, 0);
			bC.clearRect(0, 0, w, h);
			rC.clearRect(0, 0, w, h);
			bC.globalCompositeOperation = "source-over";
			rC.globalCompositeOperation = "source-over";
		}

		bC.setTransform(transform);
		rC.setTransform(transform);
		if (offsets) {
			bC.translate(offsets.left.x, offsets.left.y);
			rC.translate(offsets.right.x, offsets.right.y);
		}

		for (const p of paths.left) {
			drawMaskPath(bC, p.d, style, strokeWidth);
		}
		for (const p of paths.right) {
			drawMaskPath(rC, p.d, style, strokeWidth);
		}

		// The overlap is a thin masked region with a bloom halo; a single
		// representative color (gradient start in flow mode) reads identically to
		// the SVG's per-path purple gradient here.
		const overlapColor =
			gradient?.purple[0] ??
			options.palette?.purpleStroke ??
			PURPLE_STROKE;
		compositeMandalaOverlap({
			targetContext: ctx,
			overlapMaskContext: bC,
			overlapMaskCanvas: maskB,
			otherMaskCanvas: maskR,
			width: w,
			height: h,
			color: overlapColor,
			shadowBlur: glow ? (glow.bloomBlur ?? glow.blur) : undefined,
		});
	}

	ctx.restore();
}
