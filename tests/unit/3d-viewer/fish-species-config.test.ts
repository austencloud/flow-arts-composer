import { describe, it, expect } from 'vitest';
import {
	RESIDENT_SPECIES,
	VISITOR_SPECIES,
	ALL_SPECIES,
	TrophicRole,
	LocomotionMode,
} from '#lib/shared/3d/environments/scenes/ocean/runtime/fauna/fish/fish-species.js';

describe('fish-species-config', () => {
	it('has exactly 50 species total', () => {
		expect(ALL_SPECIES.length).toBe(50);
	});

	it('has 13 resident species', () => {
		expect(RESIDENT_SPECIES.length).toBe(13);
	});

	it('has 37 visitor species', () => {
		expect(VISITOR_SPECIES.length).toBe(37);
	});

	it('every species has a valid locomotion mode', () => {
		for (const sp of ALL_SPECIES) {
			expect(Object.values(LocomotionMode)).toContain(sp.locomotionMode);
		}
	});

	it('every species has a valid trophic role', () => {
		for (const sp of ALL_SPECIES) {
			expect(Object.values(TrophicRole)).toContain(sp.trophicRole);
		}
	});

	it('every species has sizeScale > 0', () => {
		for (const sp of ALL_SPECIES) {
			expect(sp.sizeScale).toBeGreaterThan(0);
		}
	});

	it('every species has a model filename', () => {
		for (const sp of ALL_SPECIES) {
			expect(sp.modelFile).toMatch(/^[a-z_]+\.glb$/);
		}
	});

	it('no duplicate model filenames', () => {
		const files = ALL_SPECIES.map((s) => s.modelFile);
		expect(new Set(files).size).toBe(files.length);
	});

	it('resident species have instanceCount defined', () => {
		for (const sp of RESIDENT_SPECIES) {
			expect(sp.instanceCount).toBeGreaterThan(0);
		}
	});

	it('speed range is valid (min < max, both positive)', () => {
		for (const sp of ALL_SPECIES) {
			expect(sp.speed[0]).toBeGreaterThan(0);
			expect(sp.speed[1]).toBeGreaterThanOrEqual(sp.speed[0]);
		}
	});

	it('social range is valid', () => {
		for (const sp of ALL_SPECIES) {
			expect(sp.social[0]).toBeGreaterThanOrEqual(0);
			expect(sp.social[1]).toBeGreaterThanOrEqual(sp.social[0]);
		}
	});

	it('bold range is valid', () => {
		for (const sp of ALL_SPECIES) {
			expect(sp.bold[0]).toBeGreaterThan(0);
			expect(sp.bold[1]).toBeGreaterThanOrEqual(sp.bold[0]);
		}
	});
});
