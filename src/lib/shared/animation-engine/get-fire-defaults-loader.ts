import { browser } from '$app/env';
import { FireDefaultsLoader } from './services/fire-defaults-loader';

let instance: FireDefaultsLoader | null = null;

export function getFireDefaultsLoader(): FireDefaultsLoader {
	if (!browser) throw new Error('getFireDefaultsLoader() is browser-only');
	return instance ??= new FireDefaultsLoader();
}
