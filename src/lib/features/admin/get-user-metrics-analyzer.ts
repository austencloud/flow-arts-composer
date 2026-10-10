import { browser } from '$app/env';
import { UserMetricsAnalyzer } from './services/user-metrics-analyzer';
import { getSystemStateManager } from './get-system-state-manager';

let instance: UserMetricsAnalyzer | null = null;

export function getUserMetricsAnalyzer(): UserMetricsAnalyzer {
	if (!browser) throw new Error('getUserMetricsAnalyzer() is browser-only');
	return instance ??= new UserMetricsAnalyzer(getSystemStateManager());
}
