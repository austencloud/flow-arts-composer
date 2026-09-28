/**
 * Enforces unique usernames with case-insensitive checking.
 * Uses Firestore transactions to prevent race conditions when claiming usernames.
 */

import {
	doc,
	getDoc,
	runTransaction,
	serverTimestamp,
	deleteDoc,
} from 'firebase/firestore';
import { getFirestoreInstance } from '../firebase';
import type { UsernameValidationResult } from '../domain/models/username-validation';
import { validateUsernameFormat, formatUsername } from '../domain/models/username-validation';

const USERNAMES_COLLECTION = 'usernames';
const USERS_COLLECTION = 'users';

export function validateUsernameFormatLocal(username: string): UsernameValidationResult {
	return validateUsernameFormat(username);
}

async function generateSuggestions(base: string): Promise<string[]> {
	const suggestions: string[] = [];
	const cleanBase = base
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '')
		.substring(0, 17);

	const usedSuffixes = new Set<number>();
	while (suggestions.length < 3 && usedSuffixes.size < 90) {
		const suffix = Math.floor(10 + Math.random() * 90);
		if (usedSuffixes.has(suffix)) continue;
		usedSuffixes.add(suffix);

		const candidate = `${cleanBase}${suffix}`;
		const result = await checkUsernameAvailability(candidate);
		if (result.isValid) {
			suggestions.push(candidate);
		}
	}

	return suggestions;
}

export async function checkUsernameAvailability(
	username: string,
	excludeUserId?: string,
): Promise<UsernameValidationResult> {
	const formatResult = validateUsernameFormat(username);
	if (!formatResult.isValid) return formatResult;

	try {
		const firestore = await getFirestoreInstance();
		const usernameLowercase = formatUsername(username);
		const usernameDocRef = doc(firestore, USERNAMES_COLLECTION, usernameLowercase);
		const usernameDoc = await getDoc(usernameDocRef);

		if (usernameDoc.exists()) {
			const ownerId = usernameDoc.data().userId;

			if (excludeUserId && ownerId === excludeUserId) {
				return { isValid: true };
			}

			const suggestions = await generateSuggestions(username);
			return {
				isValid: false,
				error: 'Username is already taken',
				suggestions,
			};
		}

		return { isValid: true };
	} catch (error) {
		console.error('[username-validator] Availability check failed:', error);
		return {
			isValid: false,
			error: 'Unable to check availability. Please try again.',
		};
	}
}

export async function generateUniqueUsername(base: string): Promise<string> {
	let cleanBase = base
		.toLowerCase()
		.replace(/[^a-z0-9_-]/g, '')
		.substring(0, 15);

	if (cleanBase.length < 3) cleanBase = 'user';

	cleanBase = cleanBase.replace(/^[-_]+|[-_]+$/g, '');

	const baseResult = await checkUsernameAvailability(cleanBase);
	if (baseResult.isValid) return cleanBase;

	for (let i = 0; i < 10; i++) {
		const suffix = Math.floor(100 + Math.random() * 900);
		const candidate = `${cleanBase}_${suffix}`;
		const result = await checkUsernameAvailability(candidate);
		if (result.isValid) return candidate;
	}

	return `${cleanBase}_${Date.now().toString().slice(-6)}`;
}

/** The user id holding this username's claim, or null when nobody has claimed it. */
export async function getUsernameOwner(username: string): Promise<string | null> {
	const firestore = await getFirestoreInstance();
	const usernameDoc = await getDoc(
		doc(firestore, USERNAMES_COLLECTION, formatUsername(username)),
	);
	return usernameDoc.exists() ? usernameDoc.data().userId : null;
}

/**
 * Claiming a name the user already holds writes nothing. The claim's createdAt
 * records when the name was first taken, so it is only set on a new claim, and
 * the profile is only updated when its stored spelling differs (a rename that
 * changes only capitalization keeps the claim and updates the profile).
 */
export async function claimUsername(userId: string, username: string): Promise<void> {
	const formatResult = validateUsernameFormat(username);
	if (!formatResult.isValid) {
		throw new Error(formatResult.error || 'Invalid username format');
	}

	const firestore = await getFirestoreInstance();
	const usernameLowercase = formatUsername(username);

	await runTransaction(firestore, async (transaction) => {
		const usernameDocRef = doc(firestore, USERNAMES_COLLECTION, usernameLowercase);
		const usernameDoc = await transaction.get(usernameDocRef);

		if (usernameDoc.exists() && usernameDoc.data().userId !== userId) {
			throw new Error('Username is already taken');
		}

		const userDocRef = doc(firestore, USERS_COLLECTION, userId);
		const profile = (await transaction.get(userDocRef)).data();

		if (!usernameDoc.exists()) {
			transaction.set(usernameDocRef, {
				userId,
				createdAt: serverTimestamp(),
				updatedAt: serverTimestamp(),
			});
		}

		if (profile?.username !== username || profile?.usernameLowercase !== usernameLowercase) {
			transaction.update(userDocRef, {
				username,
				usernameLowercase,
				updatedAt: serverTimestamp(),
			});
		}
	});
}

export async function releaseUsername(username: string): Promise<void> {
	try {
		const firestore = await getFirestoreInstance();
		const usernameLowercase = formatUsername(username);
		const usernameDocRef = doc(firestore, USERNAMES_COLLECTION, usernameLowercase);
		await deleteDoc(usernameDocRef);
	} catch (error) {
		console.error('[username-validator] Failed to release username:', error);
	}
}
