import { browser } from '$app/env';

import { ErrorHandler } from './services/error-handler';

let instance: ErrorHandler | null = null;

export function getErrorHandler(): ErrorHandler {
	if (!browser) throw new Error('getErrorHandler() is browser-only');
	return instance ??= new ErrorHandler();
}
