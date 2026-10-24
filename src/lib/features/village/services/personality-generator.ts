import type { PersonalityComponent } from "../domain/village-types";
import { gaussian, type VillageRng } from "../engine/village-rng";

export function generatePersonality(
	rng: VillageRng,
	mean: number,
	stdDev: number,
): PersonalityComponent {
	return {
		learnSpeed: clampedNormal(rng, mean, stdDev),
		sociability: clampedNormal(rng, mean, stdDev),
		creativity: clampedNormal(rng, mean, stdDev),
		patience: clampedNormal(rng, mean, stdDev),
		curiosity: clampedNormal(rng, mean, stdDev),
		ego: 0,
	};
}

function clampedNormal(rng: VillageRng, mean: number, stdDev: number): number {
	return Math.max(0, Math.min(1, mean + gaussian(rng) * stdDev));
}
