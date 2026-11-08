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
import { handleCandidates } from '../domain/models/handle-rule';

const USERNAMES_COLLECTION = 'usernames';
const USERS_COLLECTION = 'users';

export function validateUsernameFormatLocal(username: string): UsernameValidationResult {
	return validateUsernameFormat(username);
}

async function generateSuggestions(base: string): Promise<string[]> {
	const suggestions: string[] = [];
	const cleanBase = base
		.toLowerCase()
		.replace(/[^a-z0-9._]/g, '')
		.replace(/^[._]+|[._]+$/g, '')
		.substring(0, 28);

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

/**
 * Take the first free handle the name gives, and write it with the rest of the
 * profile in one transaction, so a profile can never hold a handle whose
 * reservation failed. Two people with the same name cannot both win: the loser's
 * transaction sees the reservation and moves to the next candidate. `previous`
 * is a handle this person is giving up; its reservation goes in the same write.
 */
export async function claimHandleFromName(
	userId: string,
	name: string | null | undefined,
	profileFields: Record<string, unknown>,
	previous?: string | null,
): Promise<string> {
	const firestore = await getFirestoreInstance();
	const userDocRef = doc(firestore, USERS_COLLECTION, userId);

	for (const candidate of handleCandidates(name)) {
		const usernameDocRef = doc(firestore, USERNAMES_COLLECTION, candidate);
		const previousRef =
			previous && formatUsername(previous) !== candidate
				? doc(firestore, USERNAMES_COLLECTION, formatUsername(previous))
				: null;
		const won = await runTransaction(firestore, async (transaction) => {
			const reservation = await transaction.get(usernameDocRef);
			if (reservation.exists() && reservation.data().userId !== userId) {
				return false;
			}
			const previousClaim = previousRef ? await transaction.get(previousRef) : null;

			if (!reservation.exists()) {
				transaction.set(usernameDocRef, {
					userId,
					createdAt: serverTimestamp(),
					updatedAt: serverTimestamp(),
				});
			}
			transaction.set(
				userDocRef,
				{ ...profileFields, username: candidate, usernameLowercase: candidate },
				{ merge: true },
			);
			if (previousRef && previousClaim?.exists() && previousClaim.data().userId === userId) {
				transaction.delete(previousRef);
			}
			return true;
		});
		if (won) return candidate;
	}
	throw new Error('Could not find a free username');
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
 * the profile is only updated when its stored spelling differs.
 */
export async function claimUsername(userId: string, requested: string): Promise<void> {
	const formatResult = validateUsernameFormat(requested);
	if (!formatResult.isValid) {
		throw new Error(formatResult.error || 'Invalid username format');
	}

	const firestore = await getFirestoreInstance();
	// Handles are stored in lowercase; typing capitals changes nothing.
	const username = formatUsername(requested);
	const usernameLowercase = username;

	await runTransaction(firestore, async (transaction) => {
		const usernameDocRef = doc(firestore, USERNAMES_COLLECTION, usernameLowercase);
		const usernameDoc = await transaction.get(usernameDocRef);

		if (usernameDoc.exists() && usernameDoc.data().userId !== userId) {
			throw new Error('Username is already taken');
		}

		const userDocRef = doc(firestore, USERS_COLLECTION, userId);
		const profile = (await transaction.get(userDocRef)).data();

		// The handle being given up is released in the same write, so a rename
		// never leaves a reservation behind or a profile without one. The rules
		// require the new reservation to be written with (or before) the profile.
		const previous =
			typeof profile?.username === 'string' ? formatUsername(profile.username) : null;
		const previousRef =
			previous && previous !== usernameLowercase
				? doc(firestore, USERNAMES_COLLECTION, previous)
				: null;
		const previousClaim = previousRef ? await transaction.get(previousRef) : null;

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

		if (previousRef && previousClaim?.exists() && previousClaim.data().userId === userId) {
			transaction.delete(previousRef);
		}
	});
}

/**
 * Put back a reservation that is missing for a handle the profile already holds.
 * Separate from claimUsername because older handles (hyphens, capitals) stay
 * valid while unchanged and would fail today's format check.
 */
export async function repairUsernameClaim(userId: string, username: string): Promise<void> {
	const firestore = await getFirestoreInstance();
	const usernameDocRef = doc(firestore, USERNAMES_COLLECTION, formatUsername(username));
	await runTransaction(firestore, async (transaction) => {
		const reservation = await transaction.get(usernameDocRef);
		if (reservation.exists()) {
			if (reservation.data().userId !== userId) {
				throw new Error('Username is already taken');
			}
			return;
		}
		transaction.set(usernameDocRef, {
			userId,
			createdAt: serverTimestamp(),
			updatedAt: serverTimestamp(),
		});
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
