import { browser } from '$app/env';
import { FirebaseSettingsPersister } from './services/firebase-settings-persister';

let instance: FirebaseSettingsPersister | null = null;

export function getSettingsPersister(): FirebaseSettingsPersister {
	if (!browser) throw new Error('getSettingsPersister() is browser-only');
	return instance ??= new FirebaseSettingsPersister();
}
