import { browser } from '$app/env';
import { ArenaOrchestrator } from './services/arena-orchestrator';

let instance: ArenaOrchestrator | null = null;

export function getArenaOrchestrator(): ArenaOrchestrator {
	if (!browser) throw new Error('getArenaOrchestrator() is browser-only');
	return instance ??= new ArenaOrchestrator();
}
