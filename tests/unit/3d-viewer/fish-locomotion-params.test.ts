import { describe, it, expect } from 'vitest';
import {
	LOCOMOTION_PARAMS,
	LocomotionMode,
} from '#lib/shared/3d/environments/scenes/ocean/runtime/fauna/fish/fish-locomotion.js';

describe('fish-locomotion-params', () => {
	it('has params for all 6 locomotion modes', () => {
		const modes = Object.values(LocomotionMode).filter(
			(v) => typeof v === 'number',
		);
		for (const mode of modes) {
			expect(LOCOMOTION_PARAMS[mode as LocomotionMode]).toBeDefined();
		}
	});

	it('swimFreq is between 0.5 and 10 Hz for all modes', () => {
		for (const params of Object.values(LOCOMOTION_PARAMS)) {
			expect(params.swimFreq).toBeGreaterThanOrEqual(0.5);
			expect(params.swimFreq).toBeLessThanOrEqual(10);
		}
	});

	it('stiffness is between 0.0 and 1.0', () => {
		for (const params of Object.values(LOCOMOTION_PARAMS)) {
			expect(params.stiffness).toBeGreaterThanOrEqual(0);
			expect(params.stiffness).toBeLessThanOrEqual(1);
		}
	});

	it('ostraciiform has highest stiffness', () => {
		const ostra = LOCOMOTION_PARAMS[LocomotionMode.Ostraciiform];
		for (const [mode, params] of Object.entries(LOCOMOTION_PARAMS)) {
			if (Number(mode) !== LocomotionMode.Ostraciiform) {
				expect(ostra.stiffness).toBeGreaterThanOrEqual(params.stiffness);
			}
		}
	});

	it('labriform has highest pectoral amplitude', () => {
		const labri = LOCOMOTION_PARAMS[LocomotionMode.Labriform];
		for (const [mode, params] of Object.entries(LOCOMOTION_PARAMS)) {
			if (Number(mode) !== LocomotionMode.Labriform) {
				expect(labri.pectoralAmp).toBeGreaterThanOrEqual(params.pectoralAmp);
			}
		}
	});

	it('anguilliform has zero stiffness (full body wave)', () => {
		const angu = LOCOMOTION_PARAMS[LocomotionMode.Anguilliform];
		expect(angu.stiffness).toBe(0);
	});
});
