/**
 * How an avatar's last moments look: first their own glow goes out, then the
 * body fades. Both fit inside the time the sim keeps a passing avatar
 * (rules.population.passingTicks), so the fade always finishes before the
 * avatar is removed, at any speed: at 1x the body takes its full
 * PASSING_FADE_SECONDS; sped up, both parts shrink with the window.
 */

export const PASSING_FADE_SECONDS = 1.2;
const PASSING_GLOW_SECONDS = 0.4;
// Shares of the passing window each part may take at most, leaving the rest
// as margin for a late frame.
const GLOW_SHARE = 0.2;
const BODY_SHARE = 0.6;

export interface PassingFade {
	// 1 to 0: the elder's glow, then their body.
	glow: number;
	body: number;
}

/** Seconds the sim keeps a passing avatar, at this run speed. */
export function passingWindowSeconds(
	passingTicks: number,
	ticksPerSecond: number,
	speed: number,
): number {
	return passingTicks / (ticksPerSecond * Math.max(speed, 1e-6));
}

export function passingFade(elapsedSeconds: number, windowSeconds: number): PassingFade {
	const glowSeconds = Math.min(PASSING_GLOW_SECONDS, windowSeconds * GLOW_SHARE);
	const bodySeconds = Math.min(PASSING_FADE_SECONDS, windowSeconds * BODY_SHARE);
	const clamp = (v: number) => Math.max(0, Math.min(1, v));
	return {
		glow: clamp(1 - elapsedSeconds / glowSeconds),
		body: clamp(1 - (elapsedSeconds - glowSeconds) / bodySeconds),
	};
}
