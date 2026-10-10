import { browser } from '$app/env';
import { ClaudeCodeCopier } from '#lib/shared/browse/services/claude-code-copier.js';
import { getSequenceDetailLoader } from '#lib/shared/browse/get-sequence-detail-loader.js';

let instance: ClaudeCodeCopier | null = null;

export function getClaudeCodeCopier(): ClaudeCodeCopier {
	if (!browser) throw new Error('getClaudeCodeCopier() is browser-only');
	return instance ??= new ClaudeCodeCopier(getSequenceDetailLoader());
}
