import { browser } from '$app/env';

import { AccountManager } from './services/account-manager';
import { getHapticFeedback } from '../application/get-haptic-feedback';

let instance: AccountManager | null = null;

export function getAccountManager(): AccountManager {
	if (!browser) throw new Error('getAccountManager() is browser-only');
	return instance ??= new AccountManager(getHapticFeedback());
}
