import { browser } from '$app/env';
import { ConceptProgressTracker } from './services/concept-progress-tracker';
import { getUserKnowledgeProfilePersister } from './get-user-knowledge-profile-persister';

let instance: ConceptProgressTracker | null = null;

export function getConceptProgressTracker(): ConceptProgressTracker {
	if (!browser) throw new Error('getConceptProgressTracker() is browser-only');
	return instance ??= new ConceptProgressTracker(getUserKnowledgeProfilePersister());
}
