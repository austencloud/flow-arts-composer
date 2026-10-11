import type { UndulationEasing } from "#lib/shared/mandala/domain/mandala-types.js";

export type BreathPhase = "inhale" | "hold-in" | "exhale" | "hold-out";

export type BreathingPatternId =
	| "coherence"
	| "box"
	| "4-7-8"
	| "physiological-sigh"
	| "custom";

export interface BreathingPattern {
	id: BreathingPatternId;
	label: string;
	inhale: number;
	holdIn: number;
	exhale: number;
	holdOut: number;
	defaultEasing: UndulationEasing;
	/**
	 * Seconds into the inhale phase where a sub-cue fires.
	 * Used by "physiological-sigh" to show "Inhale again" at the double-inhale boundary.
	 */
	inhaleSubCueAt?: number;
}

export function getPatternCycleTime(p: BreathingPattern): number {
	return p.inhale + p.holdIn + p.exhale + p.holdOut;
}

export const BREATHING_PATTERNS: Record<string, BreathingPattern> = {
	coherence: {
		id: "coherence",
		label: "Coherence",
		inhale: 5,
		holdIn: 0,
		exhale: 5,
		holdOut: 0,
		defaultEasing: "sine",
	},
	box: {
		id: "box",
		label: "Box",
		inhale: 4,
		holdIn: 4,
		exhale: 4,
		holdOut: 4,
		defaultEasing: "ease",
	},
	"4-7-8": {
		id: "4-7-8",
		label: "4-7-8",
		inhale: 4,
		holdIn: 7,
		exhale: 8,
		holdOut: 0,
		defaultEasing: "bloom",
	},
	"physiological-sigh": {
		id: "physiological-sigh",
		label: "Physiological Sigh",
		inhale: 3,
		holdIn: 0,
		exhale: 6,
		holdOut: 0,
		defaultEasing: "sine",
		inhaleSubCueAt: 2,
	},
};

export function makeCoherencePattern(bpm: number): BreathingPattern {
	const halfCycle = 60 / bpm / 2;
	return {
		id: "coherence",
		label: "Coherence",
		inhale: halfCycle,
		holdIn: 0,
		exhale: halfCycle,
		holdOut: 0,
		defaultEasing: "sine",
	};
}

export function makeCustomPattern(
	inhale: number,
	holdIn: number,
	exhale: number,
	holdOut: number,
): BreathingPattern {
	return {
		id: "custom",
		label: "Custom",
		inhale,
		holdIn,
		exhale,
		holdOut,
		defaultEasing: "breathe",
	};
}

export type AmbientTrack = "ocean" | "forest" | "chimes" | "singing-bowl" | "none";

export const AMBIENT_TRACKS: { id: AmbientTrack; label: string }[] = [
	{ id: "ocean", label: "Ocean" },
	{ id: "forest", label: "Forest" },
	{ id: "chimes", label: "Chimes" },
	{ id: "singing-bowl", label: "Singing Bowl" },
	{ id: "none", label: "None" },
];

export const SESSION_DURATIONS = [5, 10, 15, 20, 30] as const;
export type SessionDuration = (typeof SESSION_DURATIONS)[number];

export type MeditationSessionStatus = "idle" | "running" | "complete";

export interface CompletedSession {
	completedAt: Date;
	durationMinutes: number;
	pattern: BreathingPatternId;
	breathCount: number;
}

export const PHASE_COLORS: Record<BreathPhase, string> = {
	inhale: "#4dd0e1",
	"hold-in": "rgba(255,255,255,0.7)",
	exhale: "#ffab00",
	"hold-out": "rgba(255,255,255,0.5)",
};
