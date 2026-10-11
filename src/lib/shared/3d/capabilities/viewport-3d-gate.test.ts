import { describe, it, expect } from 'vitest';
import { fits3DViewport } from './viewport-3d-gate.svelte';
import { MIN_3D_VIEWPORT_PX } from '#lib/shared/device/domain/constants/device-constants.js';

describe('fits3DViewport', () => {
	it('excludes phones in portrait', () => {
		expect(fits3DViewport(375, 667)).toBe(false); // iPhone SE
		expect(fits3DViewport(430, 932)).toBe(false); // iPhone 15 Pro Max portrait
	});

	it('excludes phones in landscape (the width-only trap)', () => {
		// 932px wide is wider than a Z Fold 6 unfolded — a width-only rule would
		// wrongly admit this. The shortest side (430) keeps it out.
		expect(fits3DViewport(932, 430)).toBe(false); // iPhone 15 Pro Max landscape
		expect(fits3DViewport(844, 390)).toBe(false); // iPhone 14 landscape
	});

	it('excludes a folded Z Fold (cover screen)', () => {
		expect(fits3DViewport(384, 832)).toBe(false);
	});

	it('includes an unfolded Z Fold 6 at its worst-case short side', () => {
		// device-constants FOLDABLE_DEVICE_SPECS.zfold6 unfolded: w 800–850 × h 680–750.
		// Short side bottoms out at 680 — must pass.
		expect(fits3DViewport(800, 680)).toBe(true);
		expect(fits3DViewport(850, 750)).toBe(true);
	});

	it('includes tablets and desktop', () => {
		expect(fits3DViewport(768, 1024)).toBe(true); // iPad portrait
		expect(fits3DViewport(1024, 768)).toBe(true); // iPad landscape
		expect(fits3DViewport(1920, 1080)).toBe(true); // desktop
	});

	it('is exact at the boundary', () => {
		expect(fits3DViewport(MIN_3D_VIEWPORT_PX, MIN_3D_VIEWPORT_PX)).toBe(true); // 600×600
		expect(fits3DViewport(MIN_3D_VIEWPORT_PX - 1, 2000)).toBe(false); // 599 short side
		expect(fits3DViewport(2000, MIN_3D_VIEWPORT_PX - 1)).toBe(false); // 599 short side, other axis
	});

	it('is orientation-symmetric', () => {
		expect(fits3DViewport(800, 680)).toBe(fits3DViewport(680, 800));
		expect(fits3DViewport(932, 430)).toBe(fits3DViewport(430, 932));
	});
});
