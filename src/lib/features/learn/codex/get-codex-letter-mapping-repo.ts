import { browser } from '$app/env';
import { CodexLetterMappingRepo } from '#lib/shared/learn/services/codex-letter-mapping-repo.js';
import { letterQueryHandler } from '#lib/shared/pictograph/tka-glyph/services/letter-query-handler.js';

let instance: CodexLetterMappingRepo | null = null;

export function getCodexLetterMappingRepo(): CodexLetterMappingRepo {
	if (!browser) throw new Error('getCodexLetterMappingRepo() is browser-only');
	if (!instance) {
		instance = new CodexLetterMappingRepo();
		// Inject the repo into the letter query handler if the method exists
		// This enables Codex-specific methods like getAllCodexPictographs
		if (letterQueryHandler.setLetterMappingRepo) {
			letterQueryHandler.setLetterMappingRepo(instance);
		}
	}
	return instance;
}
