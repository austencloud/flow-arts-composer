import { browser } from '$app/env';

import { HandAssigner } from './services/hand-assigner';
import { getHandTrackingStabilizer } from './get-hand-tracking-stabilizer';

let instance: HandAssigner | null = null;

export function getHandAssigner(): HandAssigner {
	if (!browser) throw new Error('getHandAssigner() is browser-only');
	return instance ??= new HandAssigner(getHandTrackingStabilizer());
}
