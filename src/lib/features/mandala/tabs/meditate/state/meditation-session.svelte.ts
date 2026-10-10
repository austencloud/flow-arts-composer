/**
 * Meditation Session State (Svelte 5 Runes)
 *
 * Reactive state for guided breathing meditation sessions.
 * Manages breath phase computation, RAF-driven tick clock,
 * visibility-aware pause/resume, and Screen Wake Lock.
 */

import type {
	BreathPhase,
	BreathingPattern,
	BreathingPatternId,
	CompletedSession,
	MeditationSessionStatus,
} from "../domain/meditation-types";
import { getPatternCycleTime } from "../domain/meditation-types";
import { createScreenWakeLockManager } from "#lib/shared/device/services/screen-wake-lock-manager.js";

const PHASE_ORDER: BreathPhase[] = ["inhale", "hold-in", "exhale", "hold-out"];

/**
 * Public surface of a meditation session instance: read-only reactive getters
 * plus the lifecycle controls. Explicit so callers and tooling get a stable
 * contract instead of an inferred shape.
 */
export interface MeditationSession {
	readonly status: MeditationSessionStatus;
	readonly pattern: BreathingPattern;
	readonly durationMinutes: number;
	readonly elapsedSeconds: number;
	readonly breathCount: number;
	readonly currentPhase: BreathPhase;
	readonly phaseElapsed: number;
	readonly phaseDuration: number;
	readonly holdPulseDx: number | undefined;
	readonly sessionHistory: CompletedSession[];
	start(
		p: BreathingPattern,
		dur: number,
		aMin: number,
		aMax: number,
		onComplete?: () => void,
		onPhaseChange?: (phase: BreathPhase) => void,
	): void;
	stop(): void;
	dispose(): void;
}

function getPhaseDuration(pattern: BreathingPattern, phase: BreathPhase): number {
	switch (phase) {
		case "inhale":
			return pattern.inhale;
		case "hold-in":
			return pattern.holdIn;
		case "exhale":
			return pattern.exhale;
		case "hold-out":
			return pattern.holdOut;
	}
}

/**
 * Create a reactive meditation session state instance.
 * One instance per viewer/modal context.
 */
export function createMeditationSession(): MeditationSession {
	let status = $state<MeditationSessionStatus>("idle");
	let pattern = $state<BreathingPattern>(null!);
	let durationMinutes = $state(10);
	let elapsedSeconds = $state(0);
	let breathCount = $state(0);
	let currentPhase = $state<BreathPhase>("inhale");
	let phaseElapsed = $state(0);
	let phaseDuration = $state(0);
	let holdPulseDx = $state<number | undefined>(undefined);
	let sessionHistory = $state<CompletedSession[]>([]);

	// ── Internal (non-reactive) state ──────────────────────────────
	let rafId: number | null = null;
	let sessionStartMs = 0;
	let totalPausedMs = 0;
	let tabHiddenAt: number | null = null;
	let paused = false;
	let animateMin = 0;
	let animateMax = 0;
	let prevCycleIndex = -1;
	let prevPhase: BreathPhase | null = null;
	let onCompleteCallback: (() => void) | undefined;
	let onPhaseChangeCallback: ((phase: BreathPhase) => void) | undefined;
	const screenWakeLockManager = createScreenWakeLockManager();

	function handleVisibilityChange() {
		if (document.hidden) {
			tabHiddenAt = performance.now();
			paused = true;
		} else {
			if (tabHiddenAt !== null) {
				totalPausedMs += performance.now() - tabHiddenAt;
				tabHiddenAt = null;
			}
			paused = false;
		}
	}

	function computePhase(elapsed: number) {
		const cycleTime = getPatternCycleTime(pattern);
		if (cycleTime <= 0) return;

		const cycleIndex = Math.floor(elapsed / cycleTime);
		const cycleElapsed = elapsed % cycleTime;

		// Detect new cycle start → increment breath count
		if (cycleIndex > prevCycleIndex && prevCycleIndex >= 0) {
			breathCount = cycleIndex;
		}
		prevCycleIndex = cycleIndex;

		// Walk through phases to find current
		let accumulated = 0;
		for (const phase of PHASE_ORDER) {
			const dur = getPhaseDuration(pattern, phase);
			if (dur <= 0) continue; // Skip zero-duration phases

			if (cycleElapsed < accumulated + dur) {
				currentPhase = phase;
				phaseElapsed = cycleElapsed - accumulated;
				phaseDuration = dur;

				// Fire phase change callback
				if (phase !== prevPhase) {
					prevPhase = phase;
					onPhaseChangeCallback?.(phase);
				}

				// Hold phase micro-pulse
				computeHoldPulse(phase, phaseElapsed);
				return;
			}
			accumulated += dur;
		}
	}

	function computeHoldPulse(phase: BreathPhase, elapsed: number) {
		if (phase === "hold-in" || phase === "hold-out") {
			const range = animateMax - animateMin;
			const amplitude = range * 0.03;
			const sinVal = Math.sin(2 * Math.PI * 0.2 * elapsed);

			if (phase === "hold-in") {
				holdPulseDx = animateMax + sinVal * amplitude;
			} else {
				holdPulseDx = animateMin + sinVal * amplitude;
			}
		} else {
			holdPulseDx = undefined;
		}
	}

	function tick() {
		if (status !== "running") return;

		if (!paused) {
			const now = performance.now();
			elapsedSeconds = (now - sessionStartMs - totalPausedMs) / 1000;

			// Check session complete
			const targetSeconds = durationMinutes * 60;
			if (elapsedSeconds >= targetSeconds) {
				elapsedSeconds = targetSeconds;
				completeSession();
				return;
			}

			computePhase(elapsedSeconds);
		}

		rafId = requestAnimationFrame(tick);
	}

	function completeSession() {
		status = "complete";
		stopInternal();

		// Final breath count based on total elapsed
		const cycleTime = getPatternCycleTime(pattern);
		if (cycleTime > 0) {
			breathCount = Math.floor(elapsedSeconds / cycleTime);
		}

		sessionHistory = [
			...sessionHistory,
			{
				completedAt: new Date(),
				durationMinutes,
				pattern: pattern.id,
				breathCount,
			},
		];

		onCompleteCallback?.();
	}

	function stopInternal() {
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
		document.removeEventListener("visibilitychange", handleVisibilityChange);
		screenWakeLockManager.setActive(false);
	}

	function start(
		p: BreathingPattern,
		dur: number,
		aMin: number,
		aMax: number,
		onComplete?: () => void,
		onPhaseChange?: (phase: BreathPhase) => void,
	): void {
		// Clean up any prior session
		stopInternal();

		// Initialize state
		pattern = p;
		durationMinutes = dur;
		animateMin = aMin;
		animateMax = aMax;
		onCompleteCallback = onComplete;
		onPhaseChangeCallback = onPhaseChange;

		elapsedSeconds = 0;
		breathCount = 0;
		currentPhase = "inhale";
		phaseElapsed = 0;
		phaseDuration = p.inhale;
		holdPulseDx = undefined;
		prevCycleIndex = -1;
		prevPhase = null;
		totalPausedMs = 0;
		tabHiddenAt = null;
		paused = false;

		status = "running";
		sessionStartMs = performance.now();

		// Register visibility handler
		document.addEventListener("visibilitychange", handleVisibilityChange);

		screenWakeLockManager.setActive(true);

		// Fire initial phase callback
		onPhaseChangeCallback?.(currentPhase);

		// Start RAF loop
		rafId = requestAnimationFrame(tick);
	}

	function stop(): void {
		if (status !== "running") return;
		status = "idle";
		stopInternal();
	}

	function dispose(): void {
		stopInternal();
		screenWakeLockManager.dispose();
		status = "idle";
		elapsedSeconds = 0;
		breathCount = 0;
		holdPulseDx = undefined;
		prevCycleIndex = -1;
		prevPhase = null;
	}

	return {
		get status() {
			return status;
		},
		get pattern() {
			return pattern;
		},
		get durationMinutes() {
			return durationMinutes;
		},
		get elapsedSeconds() {
			return elapsedSeconds;
		},
		get breathCount() {
			return breathCount;
		},
		get currentPhase() {
			return currentPhase;
		},
		get phaseElapsed() {
			return phaseElapsed;
		},
		get phaseDuration() {
			return phaseDuration;
		},
		get holdPulseDx() {
			return holdPulseDx;
		},
		get sessionHistory() {
			return sessionHistory;
		},
		start,
		stop,
		dispose,
	};
}
