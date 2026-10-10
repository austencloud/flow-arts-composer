import { browser } from '$app/env';
import * as contributorLoader from '#lib/shared/feedback/services/contributor-loader.js';

const api = {
	...contributorLoader,
	delete: contributorLoader.deleteContributor,
};

export type ContributorLoader = typeof api;

export function getContributorLoader(): ContributorLoader {
	if (!browser) throw new Error('getContributorLoader() is browser-only');
	return api;
}
