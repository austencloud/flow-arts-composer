import { browser } from '$app/env';
import { OrientationCycleExtender } from './services/orientation-cycle-extender';

let instance: OrientationCycleExtender | null = null;

export function getOrientationCycleExtender(): OrientationCycleExtender {
	if (!browser) throw new Error('getOrientationCycleExtender() is browser-only');
	return instance ??= new OrientationCycleExtender();
}
