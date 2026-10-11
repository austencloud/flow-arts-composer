/**
 * XPRenderer - 2003 Windows XP era pictograph renderer.
 *
 * Renders pictographs at 256×256 with the anti-aliased, colorful, lightly
 * glossy aesthetic of Windows XP-era software:
 *   - Clean white background
 *   - Soft gray grid lines with rounded dots at grid points
 *   - Blue/red staves rendered with colored drop shadows
 *   - Arrows with matching colored shadows
 *   - Hand position dots with a subtle 3-layer highlight
 *   - Letter in Tahoma bold, dark navy, with a slight emboss
 *   - Classic WinXP 3D beveled border (4-line inset panel)
 *
 * Extends EraRendererBase which handles SVG wrapping, image loading,
 * color tinting, coordinate scaling, and element transforms.
 */

import type { RetroPictographData } from "../../shared/domain/pictograph-types";
import type { PictographPreparer } from "#lib/shared/pictograph/shared/services/pictograph-preparer.js";
import type { PreparedRenderData } from "#lib/shared/pictograph/shared/domain/models/prepared-pictograph-data.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { EraRendererBase } from "../../shared/services/era-renderer-base";
import type { DrawableImage } from '#lib/shared/render/services/svg-image-cache.js';
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";


/** Canvas size for the XP era - 256×256 matches a typical XP-era thumbnail */
const XP_SIZE = 256;

/**
 * The TKA rendering system uses a 950×950 coordinate space.
 * Grid point positions below are in that space.
 */
const _VIEWBOX_SIZE = 950;

// Grid point positions in the 950×950 viewBox coordinate space.
// Lines connect opposite cardinals through center; dots mark each position.
const GRID_CENTER = { x: 475, y: 475 };
// Cardinal positions match Canvas2DDirectRenderer.BASE_GRID_POINTS (radius 300 from center)
// Only 4 outer points - in box mode the whole grid rotates 45 degrees
const GRID_OUTER_POINTS = [
	{ x: 475, y: 175 }, // N
	{ x: 775, y: 475 }, // E
	{ x: 475, y: 775 }, // S
	{ x: 175, y: 475 }, // W
];

// Grid visual style
const GRID_DOT_COLOR = "#A0A0A0";
const GRID_DOT_RADIUS_VB = 25; // Matches Canvas2DDirectRenderer.BASE_GRID_POINTS radius

// XP-era prop colors (brighter, more saturated than the modern defaults)
const BLUE_COLOR = "#3366EE";
const RED_COLOR = "#EE3322";

// Hand dot radii in viewBox units
const HAND_DOT_BASE_RADIUS_VB = 22;

// TKA letter positioning - bottom-left corner of the 950-unit viewBox
const LETTER_VB_X = 55;
const LETTER_VB_Y = 855;


export class XPRenderer extends EraRendererBase {
	constructor(preparer: PictographPreparer) {
		super(preparer);
	}

	// EraRenderer - primary entry point

	async render(
		canvas: HTMLCanvasElement,
		data: RetroPictographData,
		size: number = XP_SIZE,
	): Promise<void> {
		canvas.width = size;
		canvas.height = size;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		// XP era uses anti-aliased rendering
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = "high";

		// White background - matches every XP-era dialog/panel
		ctx.fillStyle = "#FFFFFF";
		ctx.fillRect(0, 0, size, size);

		// Ask PictographPreparer to produce fully-positioned prop/arrow data
		const prepared = await this.prepare(data);
		if (!prepared) {
			this.renderPlaceholder(canvas, size);
			return;
		}

		const scale = this.getScale(size);

		this.drawGrid(ctx, scale, data.gridMode);
		this.drawHandPoints(ctx, scale, data.gridMode);
		await this.drawProps(ctx, prepared, scale);
		await this.drawArrows(ctx, prepared, scale);
		this.drawLetter(ctx, String(data.letter), scale, size);
		this.drawBeveledBorder(ctx, size);
	}

	// Placeholder override - XP-styled "?" card

	override renderPlaceholder(canvas: HTMLCanvasElement, size: number = XP_SIZE): void {
		canvas.width = size;
		canvas.height = size;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		ctx.fillStyle = "#FFFFFF";
		ctx.fillRect(0, 0, size, size);

		// Draw "?" in the XP Tahoma style
		const fontSize = Math.round(size * 0.4);
		ctx.fillStyle = "#003366";
		ctx.font = `bold ${fontSize}px Tahoma, Verdana, sans-serif`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText("?", size / 2, size / 2);

		this.drawBeveledBorder(ctx, size);
	}

	// --------------------------------------------------------------------------
	// Grid
	// --------------------------------------------------------------------------

	/**
	 * Draw the TKA grid with 3D glossy XP dots.
	 * Diamond mode: 4 lines through center, dots at N/E/S/W.
	 * Box mode: same grid rotated 45 degrees.
	 */
	private drawGrid(ctx: CanvasRenderingContext2D, scale: number, gridMode: GridMode): void {
		const isBox = gridMode === GridMode.BOX;
		const center = GRID_CENTER.x * scale; // Square canvas, x === y

		ctx.save();

		// Box mode: rotate entire grid 45 degrees around center
		if (isBox) {
			ctx.translate(center, center);
			ctx.rotate(Math.PI / 4);
			ctx.translate(-center, -center);
		}

		// Outer dots - 3D glossy XP spheres (no lines - just dots)
		const dotR = GRID_DOT_RADIUS_VB * scale;
		for (const pt of GRID_OUTER_POINTS) {
			this.drawGlossyDot(ctx, pt.x * scale, pt.y * scale, dotR);
		}

		// Center dot - also glossy
		this.drawGlossyDot(ctx, GRID_CENTER.x * scale, GRID_CENTER.y * scale, 12 * scale);

		ctx.restore();
	}

	/** Draw a 3D glossy XP sphere at the given position. */
	private drawGlossyDot(ctx: CanvasRenderingContext2D, px: number, py: number, r: number): void {
		// Shadow
		ctx.save();
		ctx.shadowColor = "rgba(0,0,0,0.35)";
		ctx.shadowBlur = 4;
		ctx.shadowOffsetX = 1;
		ctx.shadowOffsetY = 1;
		ctx.fillStyle = "#808080";
		this.fillCircle(ctx, px, py, r);
		ctx.restore();

		// Highlight
		ctx.fillStyle = "#C0C0C0";
		this.fillCircle(ctx, px - r * 0.15, py - r * 0.15, r * 0.8);

		// Specular
		ctx.fillStyle = "#F0F0F0";
		this.fillCircle(ctx, px - r * 0.35, py - r * 0.35, r * 0.3);
	}

	/**
	 * Draw small flat hand-position dots at cardinal positions, halfway
	 * between center and the outer grid points. These sit behind props.
	 * In box mode they rotate with the grid.
	 */
	private drawHandPoints(
		ctx: CanvasRenderingContext2D,
		scale: number,
		gridMode: GridMode,
	): void {
		const isBox = gridMode === GridMode.BOX;
		const canvasCenter = GRID_CENTER.x * scale;
		const handR = 5 * scale;

		// Halfway between center (475) and outer points
		const cx = GRID_CENTER.x, cy = GRID_CENTER.y;
		const handPoints = GRID_OUTER_POINTS.map(pt => ({
			x: (cx + pt.x) / 2,
			y: (cy + pt.y) / 2,
		}));

		ctx.save();
		if (isBox) {
			ctx.translate(canvasCenter, canvasCenter);
			ctx.rotate(Math.PI / 4);
			ctx.translate(-canvasCenter, -canvasCenter);
		}

		ctx.fillStyle = "#888888";
		for (const pt of handPoints) {
			this.fillCircle(ctx, pt.x * scale, pt.y * scale, handR);
		}
		ctx.restore();
	}

	private fillCircle(
		ctx: CanvasRenderingContext2D,
		cx: number,
		cy: number,
		r: number,
	): void {
		ctx.beginPath();
		ctx.arc(cx, cy, r, 0, Math.PI * 2);
		ctx.fill();
	}

	// --------------------------------------------------------------------------
	// Props
	// --------------------------------------------------------------------------

	/**
	 * Draw both staves with XP-era colored drop shadows.
	 *
	 * We draw each prop twice:
	 *   Pass 1 - with ctx.shadow* set, draws untinted so the shadow shape is accurate
	 *   Pass 2 - without shadow, draws tinted to apply the era color
	 *
	 * This gives a clean colored-shadow + solid-color stave look that reads as
	 * "2003 vector app" without any gradient computation.
	 */
	private async drawProps(
		ctx: CanvasRenderingContext2D,
		prepared: PreparedRenderData,
		scale: number,
	): Promise<void> {
		for (const color of [HandSide.LEFT, HandSide.RIGHT] as const) {
			const position = prepared.propPositions[color];
			const assets = prepared.propAssets[color];
			if (!position || !assets?.imageSrc) continue;

			try {
				// Props come with a simple "width height" viewBox string
				const viewBoxParts = assets.viewBox.split(/\s+/).map(Number);
				const viewBoxWidth = viewBoxParts[0] || 100;
				const viewBoxHeight = viewBoxParts[1] || 100;

				const wrapped = this.wrapSvgContent(assets.imageSrc, viewBoxWidth, viewBoxHeight, false);
				const cacheKey = `xp_prop_${color}_${wrapped.svg.length}`;
				const img = await this.loadSvgImage(wrapped.svg, cacheKey);

				const eraColor = color === HandSide.LEFT ? BLUE_COLOR : RED_COLOR;
				const shadowColor =
					color === HandSide.LEFT ? "rgba(0,50,200,0.4)" : "rgba(200,0,0,0.4)";

				// Props use the viewBox center for their pivot (not a stored center field)
				const centerX = viewBoxWidth / 2;
				const centerY = viewBoxHeight / 2;

				const drawParams = {
					x: position.x * scale,
					y: position.y * scale,
					rotation: position.rotation,
					centerX,
					centerY,
					viewBoxWidth: wrapped.newWidth,
					viewBoxHeight: wrapped.newHeight,
					scale,
					shouldMirror: false,
				};

				// Pass 1: shadow pass (untinted so shadow respects the shape's alpha)
				ctx.save();
				ctx.shadowColor = shadowColor;
				ctx.shadowBlur = 2;
				ctx.shadowOffsetX = 2;
				ctx.shadowOffsetY = 2;
				this.drawElementWithTransform(ctx, img, drawParams);
				ctx.restore();

				// Pass 2: color tint pass (no shadow - it's already painted)
				ctx.save();
				this.drawTintedElement(ctx, img, drawParams, eraColor);
				ctx.restore();
			} catch {
				// Non-fatal - skip this prop if asset loading fails
			}
		}
	}

	// --------------------------------------------------------------------------
	// Arrows
	// --------------------------------------------------------------------------

	/**
	 * Draw both arrows with XP-era colored drop shadows.
	 *
	 * Arrow positioning is more complex than props:
	 *   - The preparer returns a "fullViewBox" string with a non-zero origin (e.g.
	 *     "-296 -2937 2784 3091") that we must account for when computing the
	 *     pivot center.
	 *   - We expand the viewBox by 15% so arrow tips that overflow their bounds
	 *     are captured before rasterisation (SVG overflow:visible is ignored when
	 *     converting to an image).
	 *
	 * The center adjustment formula is the same as Canvas2DDirectRenderer
	 * (lines 704-720): pixelCenter = svgCenter - viewBoxOrigin + expansionOffset
	 */
	private async drawArrows(
		ctx: CanvasRenderingContext2D,
		prepared: PreparedRenderData,
		scale: number,
	): Promise<void> {
		for (const color of [HandSide.LEFT, HandSide.RIGHT] as const) {
			const position = prepared.arrowPositions[color];
			const assets = prepared.arrowAssets[color];
			const shouldMirror = prepared.arrowMirroring[color] ?? false;
			if (!position || !assets?.imageSrc) continue;

			try {
				const viewBoxWidth = assets.viewBox.width;
				const viewBoxHeight = assets.viewBox.height;
				const fullViewBox = assets.viewBox.fullViewBox;

				// Expand the viewBox so overflowing arrow tips are not clipped
				const wrapped = this.wrapSvgContent(
					assets.imageSrc,
					viewBoxWidth,
					viewBoxHeight,
					true,
					fullViewBox,
				);

				const cacheKey = `xp_arrow_${color}_${wrapped.svg.length}`;
				const img = await this.loadSvgImage(wrapped.svg, cacheKey);

				// Compute the image-space center that aligns with the arrow's pivot.
				// We must subtract the viewBox origin (which may be negative) and then
				// add the expansion offset so the pivot falls in the right image pixel.
				let viewBoxMinX = 0;
				let viewBoxMinY = 0;
				if (fullViewBox) {
					const parts = fullViewBox.split(/\s+/);
					viewBoxMinX = parseFloat(parts[0] ?? "0") || 0;
					viewBoxMinY = parseFloat(parts[1] ?? "0") || 0;
				}

				const adjustedCenterX =
					(assets.center?.x ?? viewBoxWidth / 2) - viewBoxMinX + wrapped.offsetX;
				const adjustedCenterY =
					(assets.center?.y ?? viewBoxHeight / 2) - viewBoxMinY + wrapped.offsetY;

				const shadowColor =
					color === "left" ? "rgba(0,50,200,0.3)" : "rgba(200,0,0,0.3)";

				const drawParams = {
					x: position.x * scale,
					y: position.y * scale,
					rotation: position.rotation,
					centerX: adjustedCenterX,
					centerY: adjustedCenterY,
					viewBoxWidth: wrapped.newWidth,
					viewBoxHeight: wrapped.newHeight,
					scale,
					shouldMirror,
				};

				// Shadow pass
				ctx.save();
				ctx.shadowColor = shadowColor;
				ctx.shadowBlur = 4;
				ctx.shadowOffsetX = 1.5;
				ctx.shadowOffsetY = 1.5;
				this.drawElementWithTransform(ctx, img, drawParams);
				ctx.restore();

				// Tint pass (on top, no shadow)
				const eraColor = color === "left" ? BLUE_COLOR : RED_COLOR;
				ctx.save();
				this.drawTintedElement(ctx, img, drawParams, eraColor);
				ctx.restore();
			} catch {
				// Non-fatal - skip this arrow if asset loading fails
			}
		}
	}

	// --------------------------------------------------------------------------
	// Hand position dots
	// --------------------------------------------------------------------------

	/**
	 * Draw hand-position endpoints as simple flat dots.
	 * The 3D glossy treatment is on the outer grid points instead.
	 */
	private drawHandDots(
		ctx: CanvasRenderingContext2D,
		prepared: PreparedRenderData,
		scale: number,
	): void {
		for (const color of [HandSide.LEFT, HandSide.RIGHT] as const) {
			const position = prepared.propPositions[color];
			if (!position) continue;

			const cx = position.x * scale;
			const cy = position.y * scale;
			const r = HAND_DOT_BASE_RADIUS_VB * scale;

			ctx.fillStyle = GRID_DOT_COLOR;
			this.fillCircle(ctx, cx, cy, r);
		}
	}

	// --------------------------------------------------------------------------
	// Letter
	// --------------------------------------------------------------------------

	/**
	 * Draw the TKA letter in the bottom-left corner.
	 *
	 * Technique: classic emboss effect.
	 *   1. Draw white shadow text at (-1, -1) offset - the "raised" highlight
	 *   2. Draw dark navy text on top - the actual letter
	 *
	 * This is a staple of XP-era icon/label design.
	 */
	private drawLetter(
		ctx: CanvasRenderingContext2D,
		letter: string,
		scale: number,
		_size: number,
	): void {
		const fontSize = Math.round(scale * 95); // ~95 viewBox units
		ctx.font = `bold ${fontSize}px Tahoma, Verdana, sans-serif`;
		ctx.textAlign = "left";
		ctx.textBaseline = "alphabetic";

		const x = LETTER_VB_X * scale;
		const y = LETTER_VB_Y * scale;

		// Highlight layer (emboss)
		ctx.fillStyle = "rgba(255,255,255,0.8)";
		ctx.fillText(letter, x - 1, y - 1);

		// Main layer (dark navy)
		ctx.fillStyle = "#003366";
		ctx.fillText(letter, x, y);
	}

	// --------------------------------------------------------------------------
	// Beveled border
	// --------------------------------------------------------------------------

	/**
	 * Draw a classic Windows XP 3D inset panel border.
	 *
	 * Uses four lines in two concentric rectangles:
	 *   Outer: white top-left highlight / #808080 bottom-right shadow
	 *   Inner: #E8E8E8 top-left sub-highlight / #686868 bottom-right deep shadow
	 *
	 * This is how every WinXP panel/groupbox looks.
	 */
	private drawBeveledBorder(ctx: CanvasRenderingContext2D, size: number): void {
		// Outer bevel - white highlight (top, left)
		ctx.strokeStyle = "#FFFFFF";
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(0, size - 0.5);
		ctx.lineTo(0, 0);
		ctx.lineTo(size - 0.5, 0);
		ctx.stroke();

		// Outer bevel - #808080 shadow (bottom, right)
		ctx.strokeStyle = "#808080";
		ctx.beginPath();
		ctx.moveTo(0, size - 0.5);
		ctx.lineTo(size - 0.5, size - 0.5);
		ctx.lineTo(size - 0.5, 0);
		ctx.stroke();

		// Inner bevel - light highlight (top, left), 1px inside outer
		ctx.strokeStyle = "#E8E8E8";
		ctx.beginPath();
		ctx.moveTo(1, size - 1.5);
		ctx.lineTo(1, 1);
		ctx.lineTo(size - 1.5, 1);
		ctx.stroke();

		// Inner bevel - deep shadow (bottom, right), 1px inside outer
		ctx.strokeStyle = "#686868";
		ctx.beginPath();
		ctx.moveTo(1, size - 1.5);
		ctx.lineTo(size - 1.5, size - 1.5);
		ctx.lineTo(size - 1.5, 1);
		ctx.stroke();
	}

	// --------------------------------------------------------------------------
	// Internal helpers
	// --------------------------------------------------------------------------

	/**
	 * Draw an element using the standard transform pipeline and then tint it.
	 *
	 * Because OffscreenCanvas tinting requires knowing the natural draw dimensions,
	 * we compute those here from the transform params and delegate to drawTintedImage.
	 *
	 * The tint replaces every opaque pixel with the era color while preserving
	 * the original alpha mask - same technique as Canvas2DDirectRenderer.
	 */
	private drawTintedElement(
		ctx: CanvasRenderingContext2D,
		img: DrawableImage,
		params: {
			x: number;
			y: number;
			rotation: number;
			centerX: number;
			centerY: number;
			viewBoxWidth: number;
			viewBoxHeight: number;
			scale: number;
			shouldMirror: boolean;
		},
		color: string,
	): void {
		const { x, y, rotation, centerX, centerY, viewBoxWidth, viewBoxHeight, scale, shouldMirror } =
			params;

		ctx.save();

		// Mirror the exact transform pipeline from EraRendererBase.drawElementWithTransform
		ctx.translate(x, y);
		ctx.rotate((rotation * Math.PI) / 180);
		if (shouldMirror) ctx.scale(-1, 1);
		ctx.scale(scale, scale);
		ctx.translate(-centerX, -centerY);

		// Now draw the tinted image at position (0,0) within the transformed space
		this.drawTintedImage(ctx, img, 0, 0, viewBoxWidth, viewBoxHeight, color);

		ctx.restore();
	}
}
