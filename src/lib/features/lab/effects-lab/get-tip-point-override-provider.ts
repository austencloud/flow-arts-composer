import { browser } from '$app/env';
import { TipPointOverrideProvider } from './services/tip-point-override-provider';
import { getEffectPointsPersister } from './get-effect-points-persister';
import { getFireDefaultsLoader } from '#lib/shared/animation-engine/get-fire-defaults-loader.js';
import { setTipPointOverrideProvider } from '#lib/shared/animation-engine/domain/types/prop-tip-points.js';
import { setTrailPointOverrideProvider } from '#lib/shared/animation-engine/domain/types/trail-point-types.js';

let instance: TipPointOverrideProvider | null = null;

export function getTipPointOverrideProvider(): TipPointOverrideProvider {
	if (!browser) throw new Error('getTipPointOverrideProvider() is browser-only');
	if (!instance) {
		const persister = getEffectPointsPersister();
		const fireDefaultsLoader = getFireDefaultsLoader();
		const provider = new TipPointOverrideProvider(persister);

		// Hook into the domain-level tip point lookup so overrides
		// take effect automatically in all tip trackers
		setTipPointOverrideProvider((propType) => provider.getOverride(propType));

		// Hook trail point assignments into the domain-level lookup
		// so PropPositionCalculator can resolve trail configs without
		// depending on the effects-lab feature layer
		setTrailPointOverrideProvider((propType) => provider.getTrailAssignment(propType));

		// Load admin-published defaults from Firestore; strip flameScale
		// from legacy fire point data to produce position-only tip configs
		fireDefaultsLoader.load().then(() => {
			const firePoints = fireDefaultsLoader.getAllFirePoints();
			if (Object.keys(firePoints).length > 0) {
				const tipDefaults: Record<string, { points: { dx: number; dy: number }[] }> = {};
				for (const [key, config] of Object.entries(firePoints)) {
					tipDefaults[key] = {
						points: config.points.map((p) => ({ dx: p.dx, dy: p.dy })),
					};
				}
				provider.loadPublishedDefaults(tipDefaults);
			}
		});

		// Subscribe to real-time updates
		fireDefaultsLoader.subscribe(() => {
			const firePoints = fireDefaultsLoader.getAllFirePoints();
			if (Object.keys(firePoints).length > 0) {
				const tipDefaults: Record<string, { points: { dx: number; dy: number }[] }> = {};
				for (const [key, config] of Object.entries(firePoints)) {
					tipDefaults[key] = {
						points: config.points.map((p) => ({ dx: p.dx, dy: p.dy })),
					};
				}
				provider.loadPublishedDefaults(tipDefaults);
			}
		});

		instance = provider;
	}
	return instance;
}
