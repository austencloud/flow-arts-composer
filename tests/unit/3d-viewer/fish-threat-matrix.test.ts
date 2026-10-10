import { describe, it, expect } from 'vitest';
import {
	THREAT_MATRIX,
	TrophicRole,
	isThreat,
	isPrey,
} from '#lib/shared/3d/environments/scenes/ocean/runtime/fauna/fish/fish-species.js';

describe('threat matrix', () => {
	it('apex predator fears nothing', () => {
		for (const role of Object.values(TrophicRole).filter(
			(v) => typeof v === 'number',
		)) {
			expect(isThreat(TrophicRole.ApexPredator, role as TrophicRole)).toBe(
				false,
			);
		}
	});

	it('schooling prey fears apex and meso', () => {
		expect(
			isThreat(TrophicRole.SchoolingPrey, TrophicRole.ApexPredator),
		).toBe(true);
		expect(
			isThreat(TrophicRole.SchoolingPrey, TrophicRole.Mesopredator),
		).toBe(true);
		expect(
			isThreat(TrophicRole.SchoolingPrey, TrophicRole.SchoolingPrey),
		).toBe(false);
	});

	it('neutral fears nothing', () => {
		for (const role of Object.values(TrophicRole).filter(
			(v) => typeof v === 'number',
		)) {
			expect(isThreat(TrophicRole.Neutral, role as TrophicRole)).toBe(false);
		}
	});

	it('apex hunts prey and cruiser', () => {
		expect(isPrey(TrophicRole.ApexPredator, TrophicRole.SchoolingPrey)).toBe(
			true,
		);
		expect(isPrey(TrophicRole.ApexPredator, TrophicRole.ReefCruiser)).toBe(
			true,
		);
		expect(isPrey(TrophicRole.ApexPredator, TrophicRole.ApexPredator)).toBe(
			false,
		);
	});

	it('meso hunts only prey', () => {
		expect(
			isPrey(TrophicRole.Mesopredator, TrophicRole.SchoolingPrey),
		).toBe(true);
		expect(isPrey(TrophicRole.Mesopredator, TrophicRole.ReefCruiser)).toBe(
			false,
		);
	});

	it('neutral hunts nothing', () => {
		for (const role of Object.values(TrophicRole).filter(
			(v) => typeof v === 'number',
		)) {
			expect(isPrey(TrophicRole.Neutral, role as TrophicRole)).toBe(false);
		}
	});

	it('threat matrix is 6x6', () => {
		expect(THREAT_MATRIX.length).toBe(36);
	});
});
