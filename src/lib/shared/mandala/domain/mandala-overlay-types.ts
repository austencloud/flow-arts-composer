import type { PreparedMandalaPaths } from "../services/types";
import type { MandalaHandOffsets } from "../services/mandala-grid-join";
import type { MandalaHandVisibility } from "./mandala-types";

export interface MandalaOverlayConfig {
	enabled: boolean;
	/**
	 * guide = show the complete path beneath the animation so live trails can
	 * trace it; drawing = progressively reveal and retain the path.
	 */
	mode: "guide" | "drawing";
	/** How long before fully faded - multiplier of loop duration (default: 1.0) */
	fadeDurationMultiplier: number;
	/** Line thickness in canvas pixels (default: 2.5) */
	strokeWidth: number;
	/** Which hands to draw */
	show: MandalaHandVisibility;
	/** Global opacity of the overlay (0-1, default: 0.9) */
	opacity: number;
	/** Hide prop rendering for pure mandala view */
	hideProps: boolean;
}

export const DEFAULT_MANDALA_OVERLAY_CONFIG: MandalaOverlayConfig = {
	enabled: false,
	mode: "guide",
	fadeDurationMultiplier: 1.0,
	strokeWidth: 2.5,
	show: "both",
	opacity: 0.9,
	hideProps: false,
};

/**
 * Opacity of a mandala shown as a floor beneath live motion: the animator's
 * guide overlay and the Shape Matrix hero's cold floor both use it, so the
 * moment the live canvas takes over from the still floor nothing changes.
 */
export const MANDALA_GUIDE_FLOOR_OPACITY = 0.55;

/** Parameters passed to MandalaOverlayCanvas.renderFrame() each frame */
export interface MandalaOverlayRenderParams {
	/** Pre-computed Path2D objects with lengths and colors */
	preparedPaths: PreparedMandalaPaths | null;
	/** Animation progress through the sequence: 0.0 = start, 1.0 = end of loop */
	progress: number;
	config: MandalaOverlayConfig;
	/** Seconds since last frame */
	deltaTime: number;
	/** Animation clock for this frame in milliseconds */
	currentTime: number;
	/** Canvas size in pixels */
	canvasSize: number;
	/** Current animation step index - used to detect seeks/jumps */
	currentStep: number;
	/**
	 * Joined grids: each hand's figure offset (mandala units) onto its own
	 * grid, between two layouts while one slides. Absent or null for one grid.
	 */
	handOffsets?: MandalaHandOffsets | null;
}
