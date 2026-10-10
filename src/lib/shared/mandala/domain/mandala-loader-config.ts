/**
 * MandalaLoader configuration — the parameters Austen chooses.
 *
 * RECIPE drives which sequences the pool generates. LOOK drives how the mandala
 * animates. Both are intentionally one editable file so they are easy to tune.
 */
import {
	GenerationMode,
	DifficultyLevel,
} from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import { LOOPType, Period } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { GenerationOptions } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import type { MandalaPresetId, UndulationEasing } from "./mandala-types";

/** Even lengths read as fuller mandalas; one is picked at random per draw. */
export const LOADER_LENGTHS = [8, 10, 12, 16] as const;

/**
 * Base generation recipe. LOOP (rotated) sequences make symmetric petal
 * mandalas, which read best as ambient art. To use plain freeform instead,
 * set `mode: GenerationMode.FREEFORM` and drop `loopType`/`period`.
 */
export function buildLoaderRecipe(length: number): GenerationOptions {
	return {
		mode: GenerationMode.CIRCULAR,
		loopType: LOOPType.ROTATED,
		period: Period.HALVED,
		length,
		gridMode: GridMode.DIAMOND,
		propType: PropType.STAFF,
		difficulty: DifficultyLevel.INTERMEDIATE,
		constraintPreset: "smooth",
	};
}

/** Visual look for the loader's mandala. */
export const MANDALA_LOADER_LOOK = {
	animateEasing: "breathe" as UndulationEasing,
	animateRotation: 30, // slow degrees per undulation cycle
	animatePeriod: 6, // seconds per undulation
	animateMin: 40,
	animateMax: 250,
	/** Color presets randomized per draw for variety. */
	presets: ["aurora", "twilight", "ice", "ember"] as Array<Exclude<MandalaPresetId, "custom">>,
	strokeWidth: 2.5,
} as const;

/** Pool sizing. */
export const MANDALA_POOL_TARGET = 24; // try to keep this many around
export const MANDALA_POOL_CAP = 40; // hard cap; drop oldest beyond this
export const MANDALA_POOL_MIN = 3; // below this, seed synchronously on first use
export const MANDALA_TOPUP_BATCH = 2; // generate this many per idle top-up

/** Loader timing. */
export const MANDALA_DWELL_MS = 5000; // time per sequence before crossfade
export const MANDALA_CROSSFADE_MS = 900;
