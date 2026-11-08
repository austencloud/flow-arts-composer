/**
 * Username Validation Domain Models
 *
 * Defines validation rules, reserved usernames, and helper functions
 * for enforcing unique usernames across Flow Arts Composer.
 */

import {
	HANDLE_MAX_LENGTH,
	HANDLE_MIN_LENGTH,
	RESERVED_HANDLES
} from './handle-rule';

export interface UsernameValidationResult {
	isValid: boolean;
	error?: string;
	suggestions?: string[];
}

export const USERNAME_RULES = {
	MIN_LENGTH: HANDLE_MIN_LENGTH,
	MAX_LENGTH: HANDLE_MAX_LENGTH,
	/** Allowed: letters, numbers, dots, underscores. Stored in lowercase. */
	PATTERN: /^[a-zA-Z0-9._]+$/,
	RESERVED: RESERVED_HANDLES
} as const;

/**
 * Normalize username to lowercase for case-insensitive comparison
 */
export function formatUsername(username: string): string {
	return username.toLowerCase().trim();
}

/**
 * Validate username format (synchronous - no Firestore calls)
 */
export function validateUsernameFormat(username: string): UsernameValidationResult {
	const trimmed = username.trim();

	if (!trimmed) {
		return {
			isValid: false,
			error: 'Username is required'
		};
	}

	if (trimmed.length < USERNAME_RULES.MIN_LENGTH) {
		return {
			isValid: false,
			error: `Username must be at least ${USERNAME_RULES.MIN_LENGTH} characters`
		};
	}

	if (trimmed.length > USERNAME_RULES.MAX_LENGTH) {
		return {
			isValid: false,
			error: `Username must be no more than ${USERNAME_RULES.MAX_LENGTH} characters`
		};
	}

	if (!USERNAME_RULES.PATTERN.test(trimmed)) {
		return {
			isValid: false,
			error: 'Username can only contain letters, numbers, dots, and underscores'
		};
	}

	// Check reserved usernames
	const lower = formatUsername(trimmed);
	if ((USERNAME_RULES.RESERVED as readonly string[]).includes(lower)) {
		return {
			isValid: false,
			error: 'This username is reserved'
		};
	}

	// Check doesn't start/end with a separator
	if (trimmed.startsWith('.') || trimmed.startsWith('_')) {
		return {
			isValid: false,
			error: 'Username cannot start with a dot or underscore'
		};
	}

	if (trimmed.endsWith('.') || trimmed.endsWith('_')) {
		return {
			isValid: false,
			error: 'Username cannot end with a dot or underscore'
		};
	}

	// The rules (isHandleShape in firestore.rules) refuse these too.
	if (trimmed.includes('..') || trimmed.includes('___')) {
		return {
			isValid: false,
			error: 'Username cannot contain ".." or "___"'
		};
	}

	return { isValid: true };
}
