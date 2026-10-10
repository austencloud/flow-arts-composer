/**
 * AgeVerifier - Age verification for Hall of Shame access
 *
 * Manages honor-system age verification stored in user profile.
 * Verification persists across sessions via Firestore.
 */

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import type { Timestamp } from 'firebase/firestore';
import { getFirestoreInstance } from '#lib/shared/auth/firebase.js';

export class AgeVerifier {
	private readonly PRIVATE_PROFILES_COLLECTION = 'userPrivateProfiles';

	// Local cache to avoid repeated Firestore reads
	private verificationCache = new Map<string, boolean>();

	async isVerified(userId: string): Promise<boolean> {
		// Check cache first
		if (this.verificationCache.has(userId)) {
			return this.verificationCache.get(userId)!;
		}

		try {
			const firestore = await getFirestoreInstance();
			const userRef = doc(firestore, this.PRIVATE_PROFILES_COLLECTION, userId);
			const userDoc = await getDoc(userRef);

			if (!userDoc.exists()) {
				return false;
			}

			const data = userDoc.data();
			const isVerified = data?.ageVerifiedAt != null;

			// Cache the result
			this.verificationCache.set(userId, isVerified);

			return isVerified;
		} catch (error) {
			console.error('[AgeVerifier] Error checking verification:', error);
			return false;
		}
	}

	async recordVerification(userId: string): Promise<void> {
		try {
			const firestore = await getFirestoreInstance();
			const userRef = doc(firestore, this.PRIVATE_PROFILES_COLLECTION, userId);

			await setDoc(userRef, {
				ageVerifiedAt: serverTimestamp()
			}, { merge: true });

			this.verificationCache.set(userId, true);
		} catch (error) {
			console.error('[AgeVerifier] Error recording verification:', error);
			throw new Error('Failed to record age verification');
		}
	}

	async getVerificationDate(userId: string): Promise<Date | null> {
		try {
			const firestore = await getFirestoreInstance();
			const userRef = doc(firestore, this.PRIVATE_PROFILES_COLLECTION, userId);
			const userDoc = await getDoc(userRef);

			if (!userDoc.exists()) {
				return null;
			}

			const data = userDoc.data();
			const timestamp = data?.ageVerifiedAt as Timestamp | undefined;

			return timestamp?.toDate() ?? null;
		} catch (error) {
			console.error('[AgeVerifier] Error getting verification date:', error);
			return null;
		}
	}

	/**
	 * Clear the verification cache for a user
	 * Useful when user logs out or for testing
	 */
	clearCache(userId?: string): void {
		if (userId) {
			this.verificationCache.delete(userId);
		} else {
			this.verificationCache.clear();
		}
	}
}
