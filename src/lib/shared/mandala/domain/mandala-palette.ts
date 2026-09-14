/**
 * Pure flow-color helpers for mandala rendering. Extracted from
 * MandalaViewerController so the controller and the MandalaLoader share one
 * source of truth for preset colors and gradient interpolation.
 */
import type { MandalaPalette, MandalaPresetId } from "./mandala-types";

/** Apply hand identity colors while retaining the theme's default palette. */
export function applyMandalaHandColors(
	base: MandalaPalette,
	colors?: { left: string; right: string } | null,
): MandalaPalette {
	if (!colors) return base;
	const overlap = mixColors(colors.left, colors.right);
	return {
		leftStroke: colors.left, leftFill: withAlpha(colors.left, 0.2),
		rightStroke: colors.right, rightFill: withAlpha(colors.right, 0.2),
		purpleStroke: overlap, purpleFill: withAlpha(overlap, 0.2),
	};
}

export const PRESET_COLORS: Record<
	Exclude<MandalaPresetId, "custom">,
	{ pair: [string, string]; morph: string[]; bg: string; fillAlpha?: number }
> = {
	aurora: { pair: ["#00e5ff", "#76ff03"], morph: ["#00e5ff", "#76ff03", "#7c4dff", "#ff4081", "#00e5ff"], bg: "#000000" },
	neon: { pair: ["#ff0099", "#00ddff"], morph: ["#ff0099", "#7928ca", "#0055ff", "#00ddff", "#ff0099"], bg: "#000000" },
	ember: { pair: ["#ff3d00", "#ffd600"], morph: ["#ff3d00", "#ff9100", "#ffd600", "#ff6d00", "#ff3d00"], bg: "#000000" },
	twilight: { pair: ["#aa00ff", "#f50057"], morph: ["#311b92", "#aa00ff", "#f50057", "#ff6d00", "#311b92"], bg: "#000000" },
	ice: { pair: ["#4dd0e1", "#b388ff"], morph: ["#e0f7fa", "#4dd0e1", "#1a237e", "#b388ff", "#e0f7fa"], bg: "#000000" },
	solar: { pair: ["#ffab00", "#dd2c00"], morph: ["#ffab00", "#ff6d00", "#dd2c00", "#ffea00", "#ffab00"], bg: "#000000" },
	// Art-grade presets (2026-07-11) — chosen by Austen from a 9-candidate
	// comparison at /test/mandala-palettes. Each ships its own stage bg so the
	// palette reads correctly (ink needs light parchment, not black).
	ink: {
		pair: ["#1e2749", "#b33a2e"],
		morph: ["#1e2749", "#44496e", "#b33a2e", "#7a3a4e", "#1e2749"],
		bg: "#f4ecdc",
		fillAlpha: 0.12,
	},
	gilded: {
		pair: ["#d4af37", "#b8722c"],
		morph: ["#d4af37", "#e8c96a", "#b8722c", "#8a5a24", "#d4af37"],
		bg: "#16161c",
	},
	abyss: {
		pair: ["#35e0c8", "#e05a9a"],
		morph: ["#35e0c8", "#4a9ae8", "#8a7ae8", "#e05a9a", "#35e0c8"],
		bg: "#04101c",
		fillAlpha: 0.18,
	},
};

export function hexToRgb(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1), 16);
	return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function rgbToHex(r: number, g: number, b: number): string {
	return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function mixColors(a: string, b: string): string {
	const [ar, ag, ab] = hexToRgb(a);
	const [br, bg, bb] = hexToRgb(b);
	return rgbToHex(Math.round((ar + br) / 2), Math.round((ag + bg) / 2), Math.round((ab + bb) / 2));
}

export function withAlpha(hex: string, alpha: number): string {
	const [r, g, b] = hexToRgb(hex);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function lerpColor(a: string, b: string, t: number): string {
	const [ar, ag, ab] = hexToRgb(a);
	const [br, bg, bb] = hexToRgb(b);
	return rgbToHex(
		Math.round(ar + (br - ar) * t),
		Math.round(ag + (bg - ag) * t),
		Math.round(ab + (bb - ab) * t),
	);
}

export function sampleGradient(colors: string[], t: number): string {
	const segments = colors.length - 1;
	const scaled = t * segments;
	const idx = Math.min(Math.floor(scaled), segments - 1);
	const frac = scaled - idx;
	return lerpColor(colors[idx]!, colors[idx + 1]!, frac);
}

/** Flow-mode stroke/fill palette for a morph ramp at a phase in [0,1). */
export function flowPalette(morphColors: string[], phase: number): MandalaPalette {
	const c1 = sampleGradient(morphColors, phase);
	const c2 = sampleGradient(morphColors, (phase + 0.4) % 1);
	const mix = mixColors(c1, c2);
	return {
		leftStroke: c1, leftFill: withAlpha(c1, 0.15),
		rightStroke: c2, rightFill: withAlpha(c2, 0.15),
		purpleStroke: mix, purpleFill: withAlpha(mix, 0.2),
	};
}

/** Per-path gradient endpoints for a morph ramp at a phase in [0,1). */
export function flowGradientColors(
	morphColors: string[],
	phase: number,
): { left: [string, string]; right: [string, string]; purple: [string, string] } {
	const c1 = sampleGradient(morphColors, phase);
	const c2 = sampleGradient(morphColors, (phase + 0.4) % 1);
	const c3 = sampleGradient(morphColors, (phase + 0.7) % 1);
	const mix = mixColors(c1, c2);
	return {
		left: [c1, c3],
		right: [c2, c1],
		purple: [mix, c3],
	};
}
