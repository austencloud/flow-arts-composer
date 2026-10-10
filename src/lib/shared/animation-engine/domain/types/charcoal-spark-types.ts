/**
 * Charcoal Spark Types
 *
 * Discrete spark particle system for charcoal/steel-wool fire effects.
 * Sparks burst on direction changes and fall under gravity, replacing
 * the previous fluid-sim-with-cranked-gravity approach.
 */

import type { PropTipData } from "./fire-types";
import type { CharcoalEmissionStyle } from "#lib/shared/effects/domain/effects-config.js";
import { resolveCharcoal3DMotionProfile } from "#lib/shared/effects/translators/charcoal-3d-motion-profiles.js";

// Core Particle

/** A single spark particle in the pool. */
export interface CharcoalSpark {
	/** X position in viewbox coordinates */
	x: number;
	/** Y position in viewbox coordinates */
	y: number;
	/** Horizontal velocity (viewbox units/second) */
	vx: number;
	/** Vertical velocity (viewbox units/second) */
	vy: number;
	/** Remaining lifetime in seconds */
	life: number;
	/** Total lifetime at spawn (seconds) */
	maxLife: number;
	/** Current radius in viewbox units */
	size: number;
	/** Normalized temperature [0-1], decays over lifetime */
	temperature: number;
	/** Whether this slot is in use */
	active: boolean;
}

// Tip Tracking

/** Per-tip data with jerk (rate of velocity change) for burst detection. */
export interface CharcoalTipData extends PropTipData {
	/** Rate of velocity change (viewbox units/second^2). High jerk = direction reversal = spark burst. */
	jerk: number;
}

// Tunable Parameters

/** All tunable parameters for the charcoal spark system. */
export interface CharcoalSparkParams {
	/** Jerk magnitude above which a burst fires (viewbox units/s^2) */
	burstThreshold: number;
	/** Spark count multiplier when jerk exceeds threshold */
	burstMultiplier: number;
	/** Maximum sparks per single burst event */
	burstMax: number;
	/** Base sparks emitted per second during movement */
	ambientRate: number;
	/** Speed below which ambient emission stops (viewbox units/s) */
	ambientSpeedThreshold: number;
	/** Sparks per second when tip is stationary (embers falling off a still-burning prop) */
	idleRate: number;

	/** Downward acceleration (viewbox units/s^2). Higher = sparks fall faster. */
	gravity: number;
	/** Velocity decay per second (0-1). 1 = no drag, 0.5 = halves each second. */
	drag: number;
	/** Fraction of tip velocity inherited by each spark [0-1]. Higher = sparks fly where the tip was going. */
	velocityInheritance: number;
	/** Minimum random perturbation speed added on top of inherited velocity (viewbox units/s) */
	perturbSpeedMin: number;
	/** Maximum random perturbation speed added on top of inherited velocity (viewbox units/s) */
	perturbSpeedMax: number;
	/** Half-angle of perturbation cone centered on tip's velocity direction (radians). PI = full sphere. */
	spreadAngle: number;

	/** Minimum spark lifetime (seconds) */
	lifetimeMin: number;
	/** Maximum spark lifetime (seconds) */
	lifetimeMax: number;
	/** Minimum spark radius (viewbox units) */
	sizeMin: number;
	/** Maximum spark radius (viewbox units) */
	sizeMax: number;
	/** Whether sparks shrink as they cool */
	shrinkOverLife: boolean;

	// -- Color (RGB tuples, 0-255 range for Canvas fillStyle) --
	/** Hottest spark color (core/birth) */
	coreColor: [number, number, number];
	/** Mid-temperature spark color */
	midColor: [number, number, number];
	/** Coolest spark color (near death) */
	coolColor: [number, number, number];

	/** Radius of the soft glow around each spark (viewbox units) */
	emberGlowRadius: number;
	/** Opacity multiplier for the ember glow [0-1] */
	emberGlowIntensity: number;

	/** Maximum particles alive at once. Oldest are recycled when full. */
	maxParticles: number;
}

// Default Parameters (steel-wool baseline)

/** Slider definition for charcoal controls UI. */
export interface CharcoalSliderDef {
	key: keyof CharcoalSparkParams;
	label: string;
	min: number;
	max: number;
	step: number;
	format?: (v: number) => string;
}

/** Group of related sliders in the charcoal controls panel. */
export interface CharcoalSliderGroup {
	label: string;
	sliders: CharcoalSliderDef[];
}

const fmtDec = (v: number) => v.toFixed(2);
const fmtAngle = (v: number) => `${((v / Math.PI) * 180).toFixed(0)}°`;
const fmtSettle = (v: number) => `${settleSecondsOf(v).toFixed(2)}s`;

/** Slider groups for the CharcoalControlsPanel UI. */
export const CHARCOAL_SLIDER_GROUPS: CharcoalSliderGroup[] = [
	{
		label: "Emission",
		sliders: [
			{ key: "burstThreshold", label: "Burst threshold", min: 20, max: 300, step: 5 },
			{ key: "burstMultiplier", label: "Burst multiplier", min: 1, max: 60, step: 1 },
			{ key: "burstMax", label: "Burst max", min: 10, max: 300, step: 5 },
			{ key: "ambientRate", label: "Ambient rate", min: 0, max: 120, step: 1 },
			{ key: "ambientSpeedThreshold", label: "Speed threshold", min: 1, max: 50, step: 1 },
			{ key: "idleRate", label: "Idle rate", min: 0, max: 20, step: 1 },
		],
	},
	{
		label: "Physics",
		sliders: [
			{ key: "gravity", label: "Gravity", min: 50, max: 2200, step: 25 },
			// Shown as its time constant, which is the number that means
			// something: how long a spark coasts before gravity takes the
			// trajectory. The raw retention figure is unreadable down here -
			// 0.03 and 0.30 look adjacent and are 0.28s vs 0.83s apart.
			{ key: "drag", label: "Settle time", min: 0.01, max: 0.99, step: 0.01, format: fmtSettle },
			{ key: "velocityInheritance", label: "Vel. inheritance", min: 0, max: 1, step: 0.05, format: fmtDec },
			{ key: "perturbSpeedMin", label: "Perturb min", min: 0, max: 40, step: 1 },
			{ key: "perturbSpeedMax", label: "Perturb max", min: 5, max: 100, step: 1 },
			{ key: "spreadAngle", label: "Spread angle", min: 0, max: Math.PI, step: 0.05, format: fmtAngle },
		],
	},
	{
		label: "Appearance",
		sliders: [
			{ key: "lifetimeMin", label: "Life min", min: 0.1, max: 3, step: 0.05, format: fmtDec },
			{ key: "lifetimeMax", label: "Life max", min: 0.3, max: 5, step: 0.05, format: fmtDec },
			{ key: "sizeMin", label: "Size min", min: 1, max: 15, step: 1 },
			{ key: "sizeMax", label: "Size max", min: 3, max: 30, step: 1 },
			{ key: "emberGlowRadius", label: "Glow radius", min: 0, max: 60, step: 1 },
			{ key: "emberGlowIntensity", label: "Glow intensity", min: 0, max: 4, step: 0.1, format: fmtDec },
		],
	},
	{
		label: "Pool",
		sliders: [
			{ key: "maxParticles", label: "Max particles", min: 50, max: 2000, step: 50 },
		],
	},
];

/** Default charcoal spark parameters - moderate steel-wool look (40/40/50). */
export const DEFAULT_CHARCOAL_PARAMS: CharcoalSparkParams = {
	burstThreshold: 114,
	burstMultiplier: 57,
	burstMax: 284,
	ambientRate: 107,
	ambientSpeedThreshold: 10,
	idleRate: 10,
	// Physics matches semanticToCharcoalParams at 40/40/50: a 0.51s settle,
	// a 372 px/s terminal fall, and a lifetime that leaves room to fall for
	// most of it. The old 294 / 0.91 / 1.17-3.54s pair was a 10.6-SECOND
	// settle against a 3.5s life - a spark that never stopped coasting.
	gravity: 732,
	drag: 0.1396,
	velocityInheritance: 0.59,
	perturbSpeedMin: 28,
	perturbSpeedMax: 111,
	spreadAngle: Math.PI * 0.50,
	lifetimeMin: 0.61,
	lifetimeMax: 1.54,
	sizeMin: 5,
	sizeMax: 12,
	shrinkOverLife: true,
	coreColor: [255, 242, 210],
	midColor: [255, 150, 35],
	coolColor: [170, 45, 2],
	emberGlowRadius: 25,
	emberGlowIntensity: 1.70,
	maxParticles: 2120,
};

// ============================================================================
// Semantic Controls (map 0-1 user sliders to underlying params)
// ============================================================================

/** Semantic charcoal values exposed to the user (all 0-1 range). */
export interface CharcoalSemanticValues {
	/** 0 = sparse gentle sparks, 1 = dense shower */
	intensity: number;
	/** 0 = tight focused stream, 1 = wide floating embers */
	spread: number;
	/** 0 = subtle dim sparks, 1 = bright hot glow */
	glow: number;
	/**
	 * Which emission behavior the look asks for. Optional: omitting it is the
	 * neutral profile, identical to the values the three sliders produce alone.
	 *
	 * This used to be 3D-only, which meant four of the eight shipped Coal
	 * presets selected an emission SHAPE that the 2D stage silently ignored -
	 * a difference the user could pick and never receive. The 3D profile table
	 * is the single source; the spark-relevant half of it applies here.
	 */
	emissionStyle?: CharcoalEmissionStyle;
}

/** Default semantic values that correspond to DEFAULT_CHARCOAL_PARAMS. */
export const DEFAULT_CHARCOAL_SEMANTIC: CharcoalSemanticValues = {
	intensity: 0.40,
	spread: 0.40,
	glow: 0.50,
};

/** Lerp helper: map t [0-1] to [a, b]. */
function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

/**
 * Seconds a spark takes to shed its launch velocity, from per-second drag.
 * tau = -1/ln(drag). Guarded at both ends: drag >= 1 is no drag at all
 * (unbounded coast) and drag <= 0 stops a spark instantly.
 */
function settleSecondsOf(drag: number): number {
	if (drag >= 1) return Number.POSITIVE_INFINITY;
	if (drag <= 0) return 0;
	return -1 / Math.log(drag);
}

/** Inverse lerp: map value in [a, b] back to [0-1]. */
function invLerp(a: number, b: number, v: number): number {
	if (a === b) return 0;
	return Math.max(0, Math.min(1, (v - a) / (b - a)));
}

/** Convert a semantic intensity/spread/glow (0-1) to concrete CharcoalSparkParams.
 * Accepts an optional `colorOverrides` to pass through custom color triplets from
 * CharcoalIntent when presets inject their own palette. */
export function semanticToCharcoalParams(
	semantic: CharcoalSemanticValues,
	colorOverrides?: {
		coreColor?: [number, number, number];
		midColor?: [number, number, number];
		coolColor?: [number, number, number];
	},
): CharcoalSparkParams {
	const { intensity, spread, glow, emissionStyle } = semantic;

	// The spark-relevant half of the 3D motion profile. 2D has no separate
	// fragment class, so the fragment* fields have no analogue here and are
	// deliberately not consumed - honouring the spark half is what makes the
	// four styled presets actually differ on the 2D stage. Omitting the style
	// gives the identity profile, so existing looks are byte-identical.
	const p = emissionStyle ? resolveCharcoal3DMotionProfile(emissionStyle) : null;
	const emission = p?.motionEmissionScale ?? 1;
	const idle = p?.idleEmissionScale ?? 1;
	const burstSpark = p?.burstSparkScale ?? 1;
	const burstThresh = p?.burstThresholdScale ?? 1;
	const cone = p?.coneScale ?? 1;
	const velocity = p?.velocityScale ?? 1;
	const sparkLife = p?.sparkLifetimeScale ?? 1;
	const sparkSize = p?.sparkSizeScale ?? 1;
	const gravityScale = p?.gravityScale ?? 1;

	// Drag, gravity and lifetime are one system, not three sliders.
	//
	// `drag` is per-second velocity retention, so its time constant
	// tau = -1/ln(drag) is the thing that matters: how long a spark coasts on
	// its launch velocity before gravity owns the trajectory. Terminal fall
	// speed is then g * tau.
	//
	// The old mapping ran drag 0.88..0.99, which is tau = 8.5..100 SECONDS.
	// A spark kept ~92% of its launch speed for its entire life and flew a
	// straight ray off the canvas; gravity of 15..480 needed 4..17s to build a
	// comparable downward velocity, so the arc never appeared. None of that was
	// visible while the pool clipped every spark to ~0.3s of life. Once
	// d13665ee made the authored lifetimes real, it became the whole look:
	// weightless dust scattered across the frame.
	//
	// So spread now sets tau directly - how long a spark coasts IS how far it
	// scatters - and gravity is derived from the terminal fall speed the look
	// wants, at the 950px reference the rest of this file is authored against.
	const settleSeconds = lerp(0.28, 0.85, spread);
	const terminalFall = lerp(420, 300, spread);

	return {
		// Intensity controls emission volume
		ambientRate: Math.round(lerp(5, 260, intensity) * emission),
		burstMultiplier: Math.round(lerp(8, 130, intensity) * burstSpark),
		burstMax: Math.round(lerp(40, 650, intensity) * burstSpark),
		burstThreshold: Math.round(lerp(180, 15, intensity) * burstThresh),
		ambientSpeedThreshold: lerp(15, 3, intensity),
		maxParticles: Math.round(lerp(200, 5000, intensity)),
		// idleEmissionScale is the one profile field that can raise a value from
		// zero-ish to dominant: banked-ember idles at 0.85 while moving at 0.16,
		// which is the whole character of a fire damped down.
		idleRate: Math.round(lerp(0, 25, intensity) * idle),

		// Spread controls how far sparks travel (floor raised - below old 20% was useless)
		gravity: Math.round((terminalFall / settleSeconds) * gravityScale),
		drag: Number(Math.exp(-1 / settleSeconds).toFixed(4)),
		velocityInheritance: lerp(0.78, 0.3, spread),
		perturbSpeedMin: Math.round(lerp(13, 50, spread) * velocity),
		perturbSpeedMax: Math.round(lerp(52, 200, spread) * velocity),
		// Clamped: cinder-fan's 1.8x cone would otherwise push a wide preset past
		// a full turn, which wraps and reads as a narrower spray, not a wider one.
		spreadAngle: Math.min(
			Math.PI,
			lerp(Math.PI * 0.24, Math.PI * 0.9, spread) * cone
		),
		// Cut from 0.84..8.0s. That range was authored blind - the pool clipped
		// every spark to a fraction of a second, so no one ever saw an 8-second
		// ember. A spark now settles within `settleSeconds` and then falls, and
		// these leave it roughly 0.3-1.7s of falling to be an ember rather than
		// a streak that outlives the step that threw it.
		lifetimeMin: Number((lerp(0.35, 1.0, spread) * sparkLife).toFixed(2)),
		lifetimeMax: Number((lerp(0.9, 2.5, spread) * sparkLife).toFixed(2)),

		// Glow controls visual brightness
		sizeMin: Math.round(lerp(3, 8, glow) * sparkSize),
		sizeMax: Math.round(lerp(8, 18, glow) * sparkSize),
		shrinkOverLife: true,
		emberGlowRadius: Math.round(lerp(10, 40, glow)),
		emberGlowIntensity: Number(lerp(0.4, 3.0, glow).toFixed(2)),

		// Colors: use overrides if supplied, otherwise default steel-wool palette
		coreColor: colorOverrides?.coreColor ?? [255, 242, 210],
		midColor: colorOverrides?.midColor ?? [255, 150, 35],
		coolColor: colorOverrides?.coolColor ?? [170, 45, 2],
	};
}

/** Extract semantic values from concrete CharcoalSparkParams (best-effort inverse). */
export function charcoalParamsToSemantic(params: CharcoalSparkParams): CharcoalSemanticValues {
	return {
		intensity: invLerp(5, 260, params.ambientRate),
		// Spread reads back off drag, not gravity. Gravity is now a derived
		// quantity (terminal fall / settle time) and no longer monotonic in
		// spread once a preset's gravityScale is applied; the settle time is
		// what spread actually sets. See semanticToCharcoalParams.
		// A drag that high can only be a params object written against the old
		// 0.88..0.99 mapping - the current one tops out at 0.31 - so read it
		// back the way it was written. Without this, every legacy config
		// migrates to spread 1.
		spread:
			params.drag >= 0.8
				? invLerp(0.88, 0.99, params.drag)
				: invLerp(0.28, 0.85, settleSecondsOf(params.drag)),
		glow: invLerp(0.4, 3.0, params.emberGlowIntensity),
	};
}
