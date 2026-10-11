/**
 * PixelRenderer - 1995 Win95 pixel pictograph renderer.
 *
 * Renders TKA pictographs at 128×128 using era-native drawing:
 *   - Flat gray grid (no anti-aliasing, no shadows)
 *   - Blue/red staves tinted to Win16 palette colors
 *   - Arrows tinted to Win16 palette colors
 *   - Flat gray hand dots (no gloss, no highlight layers)
 *   - Black monospace letter in the bottom-left corner
 *   - 1px solid black border
 *   - Bayer 4×4 dithering to enforce the Windows 16-color palette
 *
 * Extends EraRendererBase which handles SVG wrapping, image loading,
 * color tinting, coordinate scaling, and data conversion. This renderer
 * draws flat shapes in Win16 colors then dithers - the modern high-res
 * downsample pipeline is gone.
 *
 * Domain: 1995 TKA Notation System
 */

import type { RetroPictographData } from "../../shared/domain/pictograph-types";
import type { PictographPreparer } from "#lib/shared/pictograph/shared/services/pictograph-preparer.js";
import type { PreparedRenderData } from "#lib/shared/pictograph/shared/domain/models/prepared-pictograph-data.js";
import { EraRendererBase } from "../../shared/services/era-renderer-base";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { DrawableImage } from '#lib/shared/render/services/svg-image-cache.js';
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";


interface PaletteColor {
	r: number;
	g: number;
	b: number;
}

const WIN16_PALETTE: readonly PaletteColor[] = [
	{ r: 0x00, g: 0x00, b: 0x00 }, // 0  Black
	{ r: 0x80, g: 0x00, b: 0x00 }, // 1  Dark Red
	{ r: 0x00, g: 0x80, b: 0x00 }, // 2  Dark Green
	{ r: 0x80, g: 0x80, b: 0x00 }, // 3  Dark Yellow (Olive)
	{ r: 0x00, g: 0x00, b: 0x80 }, // 4  Dark Blue
	{ r: 0x80, g: 0x00, b: 0x80 }, // 5  Dark Magenta
	{ r: 0x00, g: 0x80, b: 0x80 }, // 6  Dark Cyan
	{ r: 0xc0, g: 0xc0, b: 0xc0 }, // 7  Silver
	{ r: 0x80, g: 0x80, b: 0x80 }, // 8  Gray
	{ r: 0xff, g: 0x00, b: 0x00 }, // 9  Red
	{ r: 0x00, g: 0xff, b: 0x00 }, // 10 Green
	{ r: 0xff, g: 0xff, b: 0x00 }, // 11 Yellow
	{ r: 0x00, g: 0x00, b: 0xff }, // 12 Blue
	{ r: 0xff, g: 0x00, b: 0xff }, // 13 Magenta
	{ r: 0x00, g: 0xff, b: 0xff }, // 14 Cyan
	{ r: 0xff, g: 0xff, b: 0xff }, // 15 White
] as const;

// BAYER DITHERING MATRIX (4x4)

const BAYER_4X4 = [
	[0, 8, 2, 10],
	[12, 4, 14, 6],
	[3, 11, 1, 9],
	[15, 7, 13, 5],
] as const;


/**
 * The TKA rendering system uses a 950×950 coordinate space.
 * Grid point positions below are in that space.
 */
const GRID_CENTER = { x: 475, y: 475 };
// Cardinal positions match Canvas2DDirectRenderer.BASE_GRID_POINTS (radius 300 from center)
const GRID_OUTER_POINTS = [
	{ x: 475, y: 175 }, // N
	{ x: 775, y: 475 }, // E
	{ x: 475, y: 775 }, // S
	{ x: 175, y: 475 }, // W
];

// Win95 grid colors
const GRID_DOT_COLOR  = "#404040";
const GRID_DOT_RADIUS_VB = 25; // Matches modern renderer

// Win16 flat colors for props and arrows
const BLUE_COLOR = "#0000FF";
const RED_COLOR  = "#FF0000";


export class PixelRenderer extends EraRendererBase {
	constructor(preparer: PictographPreparer) {
		super(preparer);
	}

	// Primary entry point

	async render(
		canvas: HTMLCanvasElement,
		data: RetroPictographData,
		size: number = 128,
	): Promise<void> {
		canvas.width = size;
		canvas.height = size;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		// Disable smoothing - we want the hard pixel edges of Win95
		ctx.imageSmoothingEnabled = false;

		// White background
		ctx.fillStyle = "#FFFFFF";
		ctx.fillRect(0, 0, size, size);

		// Prepare positioned arrow/prop data via the shared base
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
		this.drawLetter(ctx, String(data.letter), size);
		this.drawBorder(ctx, size);

		// Quantize every pixel to the Win16 palette via Bayer ordered dithering
		this.applyDithering(ctx, size);
	}

	// Placeholder - Win95-styled silver "?" card

	override renderPlaceholder(canvas: HTMLCanvasElement, size: number = 128): void {
		canvas.width = size;
		canvas.height = size;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		ctx.imageSmoothingEnabled = false;

		// Silver background (Win16 palette index 7)
		ctx.fillStyle = `rgb(${WIN16_PALETTE[7]!.r}, ${WIN16_PALETTE[7]!.g}, ${WIN16_PALETTE[7]!.b})`;
		ctx.fillRect(0, 0, size, size);

		const fontSize = Math.max(8, Math.floor(size * 0.4));
		ctx.fillStyle = "#000000";
		ctx.font = `bold ${fontSize}px monospace`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText("?", size / 2, size / 2);

		this.drawBorder(ctx, size);
		this.applyDithering(ctx, size);
	}

	// --------------------------------------------------------------------------
	// Grid
	// --------------------------------------------------------------------------

	/**
	 * Draw the TKA grid as flat dots only (no lines).
	 * 4 outer cardinal dots + center dot. Rotates for box mode.
	 */
	private drawGrid(ctx: CanvasRenderingContext2D, scale: number, gridMode: GridMode): void {
		const isBox = gridMode === GridMode.BOX;
		const center = GRID_CENTER.x * scale;

		ctx.save();
		if (isBox) {
			ctx.translate(center, center);
			ctx.rotate(Math.PI / 4);
			ctx.translate(-center, -center);
		}

		const dotR = GRID_DOT_RADIUS_VB * scale;
		ctx.fillStyle = GRID_DOT_COLOR;

		for (const pt of GRID_OUTER_POINTS) {
			this.fillCircle(ctx, pt.x * scale, pt.y * scale, dotR);
		}

		// Center dot
		this.fillCircle(ctx, GRID_CENTER.x * scale, GRID_CENTER.y * scale, 12 * scale);

		ctx.restore();
	}

	/**
	 * Draw small flat hand-position dots at cardinal positions,
	 * halfway between center and outer. Drawn behind props.
	 */
	private drawHandPoints(ctx: CanvasRenderingContext2D, scale: number, gridMode: GridMode): void {
		const isBox = gridMode === GridMode.BOX;
		const canvasCenter = GRID_CENTER.x * scale;
		const handR = 5 * scale;
		const cx = GRID_CENTER.x, cy = GRID_CENTER.y;

		ctx.save();
		if (isBox) {
			ctx.translate(canvasCenter, canvasCenter);
			ctx.rotate(Math.PI / 4);
			ctx.translate(-canvasCenter, -canvasCenter);
		}

		ctx.fillStyle = "#808080";
		for (const pt of GRID_OUTER_POINTS) {
			this.fillCircle(ctx, ((cx + pt.x) / 2) * scale, ((cy + pt.y) / 2) * scale, handR);
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
	 * Draw both staves tinted to flat Win16 colors. No shadows, no gradients.
	 * The SVG is rasterised and then every opaque pixel is replaced with the
	 * era color. Bayer dithering later handles any intermediate shades.
	 */
	private async drawProps(
		ctx: CanvasRenderingContext2D,
		prepared: PreparedRenderData,
		scale: number,
	): Promise<void> {
		for (const color of [HandSide.LEFT, HandSide.RIGHT] as const) {
			const position = prepared.propPositions[color];
			const assets   = prepared.propAssets[color];
			if (!position || !assets?.imageSrc) continue;

			try {
				const viewBoxParts  = assets.viewBox.split(/\s+/).map(Number);
				const viewBoxWidth  = viewBoxParts[0] || 100;
				const viewBoxHeight = viewBoxParts[1] || 100;

				const wrapped  = this.wrapSvgContent(assets.imageSrc, viewBoxWidth, viewBoxHeight, false);
				const cacheKey = `pixel_prop_${color}_${wrapped.svg.length}`;
				const img      = await this.loadSvgImage(wrapped.svg, cacheKey);

				const eraColor = color === HandSide.LEFT ? BLUE_COLOR : RED_COLOR;

				const drawParams = {
					x:            position.x * scale,
					y:            position.y * scale,
					rotation:     position.rotation,
					centerX:      viewBoxWidth  / 2,
					centerY:      viewBoxHeight / 2,
					viewBoxWidth:  wrapped.newWidth,
					viewBoxHeight: wrapped.newHeight,
					scale,
					shouldMirror: false,
				};

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
	 * Draw both arrows tinted to flat Win16 colors. No shadows.
	 *
	 * The center adjustment formula mirrors Canvas2DDirectRenderer exactly -
	 * subtract the viewBox origin (which may be negative) and add the expansion
	 * offset so the pivot lands on the correct pixel.
	 */
	private async drawArrows(
		ctx: CanvasRenderingContext2D,
		prepared: PreparedRenderData,
		scale: number,
	): Promise<void> {
		for (const color of [HandSide.LEFT, HandSide.RIGHT] as const) {
			const position    = prepared.arrowPositions[color];
			const assets      = prepared.arrowAssets[color];
			const shouldMirror = prepared.arrowMirroring[color] ?? false;
			if (!position || !assets?.imageSrc) continue;

			try {
				const viewBoxWidth  = assets.viewBox.width;
				const viewBoxHeight = assets.viewBox.height;
				const fullViewBox   = assets.viewBox.fullViewBox;

				// Expand the viewBox so overflowing arrow tips are not clipped
				const wrapped = this.wrapSvgContent(
					assets.imageSrc,
					viewBoxWidth,
					viewBoxHeight,
					true,
					fullViewBox,
				);

				const cacheKey = `pixel_arrow_${color}_${wrapped.svg.length}`;
				const img      = await this.loadSvgImage(wrapped.svg, cacheKey);

				// Compute image-space center: subtract viewBox origin, add expansion offset
				let viewBoxMinX = 0;
				let viewBoxMinY = 0;
				if (fullViewBox) {
					const parts = fullViewBox.split(/\s+/);
					viewBoxMinX = parseFloat(parts[0] ?? "0") || 0;
					viewBoxMinY = parseFloat(parts[1] ?? "0") || 0;
				}

				const adjustedCenterX =
					(assets.center?.x ?? viewBoxWidth  / 2) - viewBoxMinX + wrapped.offsetX;
				const adjustedCenterY =
					(assets.center?.y ?? viewBoxHeight / 2) - viewBoxMinY + wrapped.offsetY;

				const eraColor = color === "left" ? BLUE_COLOR : RED_COLOR;

				const drawParams = {
					x:            position.x * scale,
					y:            position.y * scale,
					rotation:     position.rotation,
					centerX:      adjustedCenterX,
					centerY:      adjustedCenterY,
					viewBoxWidth:  wrapped.newWidth,
					viewBoxHeight: wrapped.newHeight,
					scale,
					shouldMirror,
				};

				ctx.save();
				this.drawTintedElement(ctx, img, drawParams, eraColor);
				ctx.restore();
			} catch {
				// Non-fatal - skip this arrow if asset loading fails
			}
		}
	}

	// --------------------------------------------------------------------------
	// Letter
	// --------------------------------------------------------------------------

	private drawLetter(ctx: CanvasRenderingContext2D, letter: string, size: number): void {
		const fontSize = Math.max(10, Math.floor(size * 0.11));
		ctx.fillStyle = "#000000";
		ctx.font = `bold ${fontSize}px monospace`;
		ctx.textAlign = "left";
		ctx.textBaseline = "bottom";
		ctx.fillText(letter, 4, size - 3);
	}

	// --------------------------------------------------------------------------
	// Border
	// --------------------------------------------------------------------------

	private drawBorder(ctx: CanvasRenderingContext2D, size: number): void {
		ctx.strokeStyle = "#000000";
		ctx.lineWidth = 1;
		ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
	}

	// --------------------------------------------------------------------------
	// Bayer dithering (Win16 palette quantization)
	// --------------------------------------------------------------------------

	/**
	 * Apply ordered 4×4 Bayer dithering to quantize every pixel to the nearest
	 * Win16 palette color. Pure black and pure white pass through unchanged -
	 * they are already in the palette and dithering them would create noise.
	 */
	private applyDithering(ctx: CanvasRenderingContext2D, size: number): void {
		const imageData = ctx.getImageData(0, 0, size, size);
		const data = imageData.data;

		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				const idx = (y * size + x) * 4;
				const r = data[idx]!;
				const g = data[idx + 1]!;
				const b = data[idx + 2]!;

				// Skip pure white and pure black - already in palette
				if (r === 255 && g === 255 && b === 255) continue;
				if (r === 0   && g === 0   && b === 0  ) continue;

				const threshold = (BAYER_4X4[y % 4]![x % 4]! / 16.0 - 0.5) * 64;
				const dr = clampByte(r + threshold);
				const dg = clampByte(g + threshold);
				const db = clampByte(b + threshold);

				const nearest = findNearestPaletteColor(dr, dg, db);
				data[idx]     = nearest.r;
				data[idx + 1] = nearest.g;
				data[idx + 2] = nearest.b;
			}
		}

		ctx.putImageData(imageData, 0, 0);
	}

	// --------------------------------------------------------------------------
	// Internal helpers (tint pipeline)
	// --------------------------------------------------------------------------

	/**
	 * Draw a tinted prop or arrow by mirroring the same transform pipeline as
	 * drawElementWithTransform, then delegating to drawTintedImage.
	 *
	 * This is the same pattern used by XPRenderer - the transform is applied
	 * manually here so the tint OffscreenCanvas can be drawn at (0,0) within
	 * the already-transformed context.
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

		ctx.translate(x, y);
		ctx.rotate((rotation * Math.PI) / 180);
		if (shouldMirror) ctx.scale(-1, 1);
		ctx.scale(scale, scale);
		ctx.translate(-centerX, -centerY);

		this.drawTintedImage(ctx, img, 0, 0, viewBoxWidth, viewBoxHeight, color);

		ctx.restore();
	}
}

// ============================================================================
// PALETTE HELPERS
// ============================================================================

function clampByte(value: number): number {
	return Math.max(0, Math.min(255, Math.round(value)));
}

function findNearestPaletteColor(r: number, g: number, b: number): PaletteColor {
	let bestDist = Infinity;
	let bestColor = WIN16_PALETTE[0]!;

	for (const color of WIN16_PALETTE) {
		const dr = r - color.r;
		const dg = g - color.g;
		const db = b - color.b;
		const dist = dr * dr + dg * dg + db * db;

		if (dist < bestDist) {
			bestDist  = dist;
			bestColor = color;
			if (dist === 0) break;
		}
	}

	return bestColor;
}
