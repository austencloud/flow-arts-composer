import { browser } from '$app/env';
import { OnboardingPersister } from './services/onboarding-persister';

let instance: OnboardingPersister | null = null;

export function getOnboardingPersister(): OnboardingPersister {
	if (!browser) throw new Error('getOnboardingPersister() is browser-only');
	return instance ??= new OnboardingPersister();
}
