import { browser } from '$app/env';
import { PendingActionQueue } from './services/pending-action-queue';

let instance: PendingActionQueue | null = null;

export function getPendingActionQueue(): PendingActionQueue {
	if (!browser) throw new Error('getPendingActionQueue() is browser-only');
	return instance ??= new PendingActionQueue();
}
