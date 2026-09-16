/**
 * SvgToBrailleConverter - Downsamples real SVG pictographs into Braille Unicode art.
 *
 * Renders a pictograph via the existing Canvas2DDirectRenderer at braille
 * resolution (132×104 pixels for a 66×26 character grid), reads pixel colors,
 * and encodes each 2×4 pixel block into a Unicode Braille character (U+2800-U+28FF)
 * with per-cell color tracking.
 *
 * The result is a pixel-accurate braille representation of whatever the real
 * SVG renderer produces - including all arrow positioning adjustments, prop
 * geometry, and special placements - without reimplementing any of that logic.
 *
 * Domain: Retro DOS Terminal
 */

import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { IDirectRenderer } from "$lib/shared/render/services/IDirectRenderer";
import type { PictographPreparer } from "$lib/shared/pictograph/shared/services/pictograph-preparer";


const BRAILLE_OFFSET = 0x2800;

/** Bit layout for 2x4 Braille dot grid */
const PIXEL_MAP = [
	[0x01, 0x08], // row 0
	[0x02, 0x10], // row 1
	[0x04, 0x20], // row 2
	[0x40, 0x80], // row 3
];

// COLOR DETECTION
//
// The Canvas2DDirectRenderer uses these colors:
//   Blue (dark mode): #3575E2 → R=53, G=117, B=226
//   Red  (dark mode): #ED1C24 → R=237, G=28, B=36
//   Grid points:      #ffffff at reduced opacity
//   Background:       dark (~#1a1a2e or similar)
//
// We classify pixels by comparing color channels. A pixel is "blue" if
// B channel dominates, "red" if R channel dominates, and "structural"
// if all channels are roughly equal (gray/white).

const COLOR_BLUE = 1;
const COLOR_RED = 2;
const COLOR_STRUCTURAL = 3;

/** Minimum brightness to consider a pixel "lit" (0-255) */
const BRIGHTNESS_THRESHOLD = 60;

/** Minimum channel dominance ratio to classify as blue or red vs structural */
const DOMINANCE_RATIO = 1.4;

function classifyPixel(r: number, g: number, b: number, a: number): number {
	// Transparent or very dark = background, skip
	if (a < 30) return 0;
	const brightness = Math.max(r, g, b);
	if (brightness < BRIGHTNESS_THRESHOLD) return 0;

	// Check for blue dominance: B channel >> R and G
	if (b > r * DOMINANCE_RATIO && b > g * DOMINANCE_RATIO) return COLOR_BLUE;

	// Check for red dominance: R channel >> G and B
	if (r > g * DOMINANCE_RATIO && r > b * DOMINANCE_RATIO) return COLOR_RED;

	// Everything else is structural (white, gray grid elements)
	return COLOR_STRUCTURAL;
}

// CSS CLASSES (matching DOS terminal)

const CSS_BLUE = "dos-blue";
const CSS_RED = "dos-red";
const CSS_WHITE = "dos-white";

function _colorIdToCss(colorId: number): string {
	switch (colorId) {
		case COLOR_BLUE: return CSS_BLUE;
		case COLOR_RED: return CSS_RED;
		case COLOR_STRUCTURAL: return CSS_WHITE;
		default: return CSS_WHITE;
	}
}


/**
 * Braille character grid dimensions.
 *
 * The SVG pictograph is square (950×950). Each braille character is 2px wide
 * and 4px tall, so a square pixel grid requires charW × 2 = charH × 4.
 * With charW = 50, we get 100px wide and charH = 25 gives 100px tall.
 * This keeps the output square and compact.
 */
const CHAR_WIDTH = 50;
const CHAR_HEIGHT = 25;

/** Pixel dimensions of the braille output (each char = 2 wide × 4 tall) */
const PX_WIDTH = CHAR_WIDTH * 2;   // 100
const PX_HEIGHT = CHAR_HEIGHT * 4; // 100

/**
 * Render resolution for the SVG canvas before downsampling.
 * Higher resolution = more source pixels per braille cell = better accuracy
 * at areas where elements converge (center point, staff ends).
 * At 600px with 100px braille grid, each braille pixel samples a 6×6 area.
 */
const RENDER_SIZE = 600;

export interface BrailleConvertResult {
	/** HTML-formatted lines (same format as IAsciiRenderer output) */
	lines: string[];
	/** Render time in milliseconds */
	renderTimeMs: number;
}

export class SvgToBrailleConverter {
	private renderer: IDirectRenderer;
	private preparer: PictographPreparer;

	constructor(renderer: IDirectRenderer, preparer: PictographPreparer) {
		this.renderer = renderer;
		this.preparer = preparer;
	}

	/**
	 * Convert a pictograph to braille art.
	 *
	 * Prepares the pictograph (calculates arrow positions, loads SVG assets),
	 * renders to canvas at high resolution, reads pixel data, and encodes
	 * into Braille characters with color.
	 */
	async convert(pictograph: PictographData): Promise<BrailleConvertResult> {
		const start = performance.now();

		// Ensure the renderer has loaded grid SVGs and other assets.
		await this.renderer.initialize();

		// Prepare the pictograph - this calculates arrow positions, loads
		// SVG assets, and produces the _prepared data the renderer needs.
		const prepared = await this.preparer.prepareSingle(pictograph, {
			themeMode: "dark",
		});

		// Render the prepared pictograph to canvas.
		const canvas = await this.renderer.renderPictograph(prepared, {
			size: RENDER_SIZE, // Render large, then downsample to braille resolution
			visibility: {
				showTKA: false,
				showTnD: false,
				showElemental: false,
				showPlacements: false,
				showReversals: false,
				showNonRadialPoints: false,
				darkMode: true,
			},
		});

		// The canvas may not be exactly PX_WIDTH × PX_HEIGHT because
		// the SVG is square (950×950) - it will be PX_WIDTH × PX_WIDTH.
		// We need to read the actual dimensions and scale if needed.
		const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
		if (!ctx) throw new Error("Failed to get canvas 2d context");

		// Read pixel data from the rendered canvas
		const sourceW = canvas.width;
		const sourceH = canvas.height;
		const imageData = ctx.getImageData(0, 0, sourceW, sourceH);

		// Downsample to braille resolution and classify each pixel
		const pixels = this.downsampleAndClassify(imageData, sourceW, sourceH);

		// Encode to braille HTML lines
		const lines = this.encodeToBrailleHtml(pixels);

		return {
			lines,
			renderTimeMs: performance.now() - start,
		};
	}

	/**
	 * Downsample the rendered canvas to braille pixel resolution using
	 * area-averaged sampling.
	 *
	 * Instead of picking a single source pixel per braille pixel (point
	 * sampling), this reads ALL source pixels that map to each braille
	 * pixel, classifies each, and picks the dominant color. This prevents
	 * the center-point muddling where staff ends and the center dot would
	 * bleed into the same braille cells with point sampling.
	 *
	 * Returns a flat array of color classifications (PX_WIDTH × PX_HEIGHT).
	 */
	private downsampleAndClassify(
		imageData: ImageData,
		sourceW: number,
		sourceH: number,
	): Uint8Array {
		const result = new Uint8Array(PX_WIDTH * PX_HEIGHT);
		const data = imageData.data;

		// How many source pixels each braille pixel spans
		const scaleX = sourceW / PX_WIDTH;
		const scaleY = sourceH / PX_HEIGHT;

		for (let py = 0; py < PX_HEIGHT; py++) {
			for (let px = 0; px < PX_WIDTH; px++) {
				// Source pixel region for this braille pixel
				const sx0 = Math.floor(px * scaleX);
				const sy0 = Math.floor(py * scaleY);
				const sx1 = Math.min(Math.floor((px + 1) * scaleX), sourceW);
				const sy1 = Math.min(Math.floor((py + 1) * scaleY), sourceH);

				let leftVotes = 0;
				let rightVotes = 0;
				let structVotes = 0;

				// Sample every source pixel in the region
				for (let sy = sy0; sy < sy1; sy++) {
					for (let sx = sx0; sx < sx1; sx++) {
						const idx = (sy * sourceW + sx) * 4;
						const r = data[idx]!;
						const g = data[idx + 1]!;
						const b = data[idx + 2]!;
						const a = data[idx + 3]!;

						const classification = classifyPixel(r, g, b, a);
						if (classification === COLOR_BLUE) leftVotes++;
						else if (classification === COLOR_RED) rightVotes++;
						else if (classification === COLOR_STRUCTURAL) structVotes++;
					}
				}

				const totalLit = leftVotes + rightVotes + structVotes;
				const totalPixels = (sx1 - sx0) * (sy1 - sy0);

				// A braille pixel is "on" only if enough of the source region
				// is lit. This threshold prevents noise and stray pixels from
				// bleeding into neighboring cells. Higher threshold = cleaner
				// separation at convergence points like the center.
				if (totalLit < totalPixels * 0.15) {
					result[py * PX_WIDTH + px] = 0;
				} else if (leftVotes >= rightVotes && leftVotes >= structVotes) {
					result[py * PX_WIDTH + px] = COLOR_BLUE;
				} else if (rightVotes >= leftVotes && rightVotes >= structVotes) {
					result[py * PX_WIDTH + px] = COLOR_RED;
				} else {
					result[py * PX_WIDTH + px] = COLOR_STRUCTURAL;
				}
			}
		}

		return result;
	}

	/**
	 * Encode the classified pixel grid into HTML-formatted braille lines.
	 * Each 2×4 pixel block becomes one Braille character.
	 */
	private encodeToBrailleHtml(pixels: Uint8Array): string[] {
		const lines: string[] = [];

		for (let charRow = 0; charRow < CHAR_HEIGHT; charRow++) {
			let html = "";
			let currentColor: string | null = null;
			let run = "";

			for (let charCol = 0; charCol < CHAR_WIDTH; charCol++) {
				let code = 0;
				let leftCount = 0;
				let rightCount = 0;
				let structCount = 0;

				// Read the 2×4 pixel block for this character cell
				for (let dy = 0; dy < 4; dy++) {
					for (let dx = 0; dx < 2; dx++) {
						const px = charCol * 2 + dx;
						const py = charRow * 4 + dy;
						const colorId = pixels[py * PX_WIDTH + px]!;

						if (colorId > 0) {
							code |= PIXEL_MAP[dy]![dx]!;
							if (colorId === COLOR_BLUE) leftCount++;
							else if (colorId === COLOR_RED) rightCount++;
							else structCount++;
						}
					}
				}

				let char: string;
				let cellColor: string | null;

				if (code === 0) {
					char = " ";
					cellColor = null;
				} else {
					char = String.fromCharCode(BRAILLE_OFFSET + code);
					// Dominant color wins for this cell
					if (leftCount >= rightCount && leftCount >= structCount) {
						cellColor = CSS_BLUE;
					} else if (rightCount >= leftCount && rightCount >= structCount) {
						cellColor = CSS_RED;
					} else {
						cellColor = CSS_WHITE;
					}
				}

				// Run-length group by color for efficient HTML
				if (cellColor !== currentColor) {
					if (run.length > 0) {
						html += currentColor
							? `<span class="${currentColor}">${this.escapeHtml(run)}</span>`
							: this.escapeHtml(run);
					}
					currentColor = cellColor;
					run = char;
				} else {
					run += char;
				}
			}

			// Flush final run
			if (run.length > 0) {
				html += currentColor
					? `<span class="${currentColor}">${this.escapeHtml(run)}</span>`
					: this.escapeHtml(run);
			}

			lines.push(html);
		}

		return lines;
	}

	private escapeHtml(text: string): string {
		return text
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/ /g, "&nbsp;");
	}
}
