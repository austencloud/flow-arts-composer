/**
 * User Sequence Presets - Type Definitions
 *
 * Types derive from @tka/sequence-engine — never hardcode loop type lists here.
 */

import { LOOPType, ALL_LOOP_TYPES, Period } from "@tka/sequence-engine/loop";

export type LoopType = `${LOOPType}`;
export { Period };
export type GridMode = "diamond" | "box" | "skewed";

export const PRESET_GRID_JOIN_DIRECTIONS = [
	"n",
	"ne",
	"e",
	"se",
	"s",
	"sw",
	"w",
	"nw",
] as const;

/** Where red's grid sits from blue's, and how many hand points apart. */
export interface PresetGridJoin {
	toward: (typeof PRESET_GRID_JOIN_DIRECTIONS)[number];
	steps: 1 | 2;
}

/**
 * Configuration for sequence generation stored in a preset.
 * All fields are optional - unspecified fields use tool defaults.
 */
export interface PresetConfig {
	// LOOP settings
	loopType?: LoopType;
	period?: Period;
	loopComponents?: Array<"rotated" | "mirrored" | "flipped" | "swapped" | "inverted" | "rewound">;

	// Word length (derived from LOOP config or explicit)
	wordLength?: number;

	// Difficulty
	level?: 1 | 2 | 3;
	turnIntensity?: number; // 0-3

	// Constraints
	constraintPreset?: string; // "smooth", "reversal", etc.
	constraints?: string; // Natural language override

	// Grid
	gridMode?: GridMode;

	// Visual (for image generation)
	darkMode?: boolean;
	cellSize?: number;
	layout?: "grid" | "strip";

	// Joined grids: red's hand on a second grid beside blue's. Absent = one grid.
	conjoined?: PresetGridJoin;
}

/**
 * A saved user preset with metadata.
 */
export interface UserSequencePreset {
	id: string; // UUID
	name: string; // "Comfy 16"
	description?: string; // "My go-to comfortable sequence"
	icon?: string; // emoji

	config: PresetConfig;

	createdAt: number; // Unix timestamp
	updatedAt: number; // Unix timestamp
}

/**
 * The JSON file structure for persisted presets.
 */
export interface UserPresetsFile {
	version: 1;
	presets: UserSequencePreset[];
	lastModified: number; // Unix timestamp
}

/**
 * Input for creating a new preset.
 */
export interface CreatePresetInput {
	name: string;
	description?: string;
	icon?: string;

	// Flattened config fields for easier tool input
	loopType?: string;
	period?: string;
	loopComponents?: string[];
	wordLength?: number;
	level?: number;
	turnIntensity?: number;
	constraintPreset?: string;
	constraints?: string;
	gridMode?: string;
	darkMode?: boolean;
	cellSize?: number;
	layout?: string;
	/** A join to remember; null on an update removes the one the preset has. */
	conjoined?: { toward: string; steps: number } | null;
}

/**
 * Type guard to validate preset config values.
 */
export function isValidLoopType(value: string): value is LoopType {
	return (ALL_LOOP_TYPES as readonly string[]).includes(value);
}

export function isValidPeriod(value: string): value is Period {
	return (Object.values(Period) as string[]).includes(value);
}

export function isValidGridMode(value: string): value is GridMode {
	return ["diamond", "box", "skewed"].includes(value);
}

export function isValidGridJoin(value: unknown): value is PresetGridJoin {
	if (!value || typeof value !== "object") return false;
	const join = value as { toward?: unknown; steps?: unknown };
	return (
		typeof join.toward === "string" &&
		(PRESET_GRID_JOIN_DIRECTIONS as readonly string[]).includes(join.toward) &&
		(join.steps === 1 || join.steps === 2)
	);
}

export function isValidLevel(value: number): value is 1 | 2 | 3 {
	return [1, 2, 3].includes(value);
}

export function isValidLoopComponent(
	value: string
): value is "rotated" | "mirrored" | "flipped" | "swapped" | "inverted" | "rewound" {
	return ["rotated", "mirrored", "flipped", "swapped", "inverted", "rewound"].includes(value);
}

/**
 * Validates and normalizes raw input into a PresetConfig.
 * Returns null if validation fails.
 */
export function normalizePresetConfig(input: CreatePresetInput): PresetConfig | null {
	const config: PresetConfig = {};

	if (input.loopType !== undefined) {
		if (!isValidLoopType(input.loopType)) return null;
		config.loopType = input.loopType;
	}

	if (input.period !== undefined) {
		if (!isValidPeriod(input.period)) return null;
		config.period = input.period;
	}

	if (input.loopComponents !== undefined) {
		if (!input.loopComponents.every(isValidLoopComponent)) return null;
		config.loopComponents = input.loopComponents as PresetConfig["loopComponents"];
	}

	if (input.wordLength !== undefined) {
		if (input.wordLength < 1 || input.wordLength > 20) return null;
		config.wordLength = input.wordLength;
	}

	if (input.level !== undefined) {
		if (!isValidLevel(input.level)) return null;
		config.level = input.level;
	}

	if (input.turnIntensity !== undefined) {
		if (input.turnIntensity < 0 || input.turnIntensity > 3) return null;
		config.turnIntensity = input.turnIntensity;
	}

	if (input.constraintPreset !== undefined) {
		config.constraintPreset = input.constraintPreset;
	}

	if (input.constraints !== undefined) {
		config.constraints = input.constraints;
	}

	if (input.gridMode !== undefined) {
		if (!isValidGridMode(input.gridMode)) return null;
		config.gridMode = input.gridMode;
	}

	if (input.darkMode !== undefined) {
		config.darkMode = input.darkMode;
	}

	if (input.cellSize !== undefined) {
		if (input.cellSize < 50 || input.cellSize > 500) return null;
		config.cellSize = input.cellSize;
	}

	if (input.layout !== undefined) {
		if (!["grid", "strip"].includes(input.layout)) return null;
		config.layout = input.layout as "grid" | "strip";
	}

	if (input.conjoined !== undefined && input.conjoined !== null) {
		if (!isValidGridJoin(input.conjoined)) return null;
		config.conjoined = {
			toward: input.conjoined.toward,
			steps: input.conjoined.steps,
		};
	}

	return config;
}
