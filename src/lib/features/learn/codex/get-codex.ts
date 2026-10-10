import { browser } from '$app/env';

import { Codex } from './services/codex';
import { getCodexLetterMappingRepo } from './get-codex-letter-mapping-repo';
import * as codexPictographUpdater from './services/codex-pictograph-updater';
import { getQuizRepoManager } from '#lib/features/learn/quiz/get-quiz-repo-manager.js';
import { letterQueryHandler } from '#lib/shared/pictograph/tka-glyph/services/letter-query-handler.js';

let instance: Codex | null = null;

export function getCodex(): Codex {
	if (!browser) throw new Error('getCodex() is browser-only');
	return instance ??= new Codex(
		getCodexLetterMappingRepo(),
		getQuizRepoManager(),
		codexPictographUpdater,
		letterQueryHandler,
	);
}
