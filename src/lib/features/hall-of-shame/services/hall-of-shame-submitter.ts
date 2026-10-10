/**
 * HallOfShameSubmitter - Submit sequences to the Hall of Shame
 *
 * Handles submission of flagged content to the moderation queue,
 * with rate limiting (3/day) and duplicate prevention.
 */

import {
	collection,
	doc,
	getDoc,
	getDocs,
	setDoc,
	deleteDoc,
	query,
	where,
	orderBy,
	serverTimestamp
} from 'firebase/firestore';
import { getFirestoreInstance } from '#lib/shared/auth/firebase.js';
import type { AgeVerifier } from "./age-verifier";
import type {
	HallOfShameEntry,
	ShameSubmissionParams,
} from '../domain/models/hall-of-shame-models';

const DAILY_LIMIT = 3;

export class HallOfShameSubmitter {
	private readonly COLLECTION = 'hallOfShame';
	private readonly RATE_LIMIT_COLLECTION = 'hallOfShameRateLimits';

	constructor(private readonly ageVerifier: AgeVerifier) {}

	async submit(params: ShameSubmissionParams): Promise<string> {
		const { userId, sourceSequenceId } = params;

		// Verify age first
		const isVerified = await this.ageVerifier.isVerified(userId);
		if (!isVerified) {
			throw new Error('Age verification required to submit to Hall of Shame');
		}

		// Check rate limit
		const remaining = await this.getRemainingSubmissions(userId);
		if (remaining <= 0) {
			throw new Error('Daily submission limit reached (3 per day). Try again tomorrow.');
		}

		// Check for duplicate
		const alreadySubmitted = await this.isSubmitted(sourceSequenceId);
		if (alreadySubmitted) {
			throw new Error('This sequence has already been submitted to the Hall of Shame');
		}

		try {
			const firestore = await getFirestoreInstance();
			const collectionRef = collection(firestore, this.COLLECTION);
			const newDocRef = doc(collectionRef);
			const entryId = newDocRef.id;

			const entry: Omit<HallOfShameEntry, 'submittedAt'> & { submittedAt: ReturnType<typeof serverTimestamp> } = {
				id: entryId,
				sourceSequenceId: params.sourceSequenceId,
				ownerId: params.userId,
				ownerDisplayName: '', // Will be populated by caller or lookup
				word: params.word,
				displayName: params.displayName,
				thumbnails: params.thumbnails,
				sequenceLength: params.sequenceLength,
				difficulty: params.difficulty,
				flaggedTerms: params.flaggedTerms,
				category: params.category,
				status: 'pending',
				submittedAt: serverTimestamp(),
				featured: false,
				voteCount: 0,
				viewCount: 0,
				reportCount: 0,
				hidden: false
			};

			await setDoc(newDocRef, entry);

			// Increment rate limit counter
			await this.incrementDailyCount(userId);

			return entryId;
		} catch (error) {
			console.error('[HallOfShameSubmitter] Error submitting:', error);
			throw new Error('Failed to submit to Hall of Shame');
		}
	}

	async getUserSubmissions(userId: string): Promise<HallOfShameEntry[]> {
		try {
			const firestore = await getFirestoreInstance();
			const collectionRef = collection(firestore, this.COLLECTION);
			const q = query(
				collectionRef,
				where('ownerId', '==', userId),
				orderBy('submittedAt', 'desc')
			);

			const snapshot = await getDocs(q);
			return snapshot.docs.map((doc) => doc.data() as HallOfShameEntry);
		} catch (error) {
			console.error('[HallOfShameSubmitter] Error getting user submissions:', error);
			return [];
		}
	}

	async withdraw(sequenceId: string, userId: string): Promise<void> {
		try {
			const firestore = await getFirestoreInstance();
			const docRef = doc(firestore, this.COLLECTION, sequenceId);
			const docSnap = await getDoc(docRef);

			if (!docSnap.exists()) {
				throw new Error('Submission not found');
			}

			const entry = docSnap.data() as HallOfShameEntry;

			if (entry.ownerId !== userId) {
				throw new Error('You can only withdraw your own submissions');
			}

			if (entry.status !== 'pending') {
				throw new Error('Only pending submissions can be withdrawn');
			}

			await deleteDoc(docRef);
		} catch (error) {
			console.error('[HallOfShameSubmitter] Error withdrawing:', error);
			throw error;
		}
	}

	async isSubmitted(sourceSequenceId: string): Promise<boolean> {
		try {
			const firestore = await getFirestoreInstance();
			const collectionRef = collection(firestore, this.COLLECTION);
			const q = query(
				collectionRef,
				where('sourceSequenceId', '==', sourceSequenceId),
				where('status', 'in', ['pending', 'approved'])
			);

			const snapshot = await getDocs(q);
			return !snapshot.empty;
		} catch (error) {
			console.error('[HallOfShameSubmitter] Error checking submission status:', error);
			return false;
		}
	}

	async getRemainingSubmissions(userId: string): Promise<number> {
		try {
			const todayKey = this.getTodayKey();
			const firestore = await getFirestoreInstance();
			const docRef = doc(firestore, this.RATE_LIMIT_COLLECTION, `${userId}_${todayKey}`);
			const docSnap = await getDoc(docRef);

			if (!docSnap.exists()) {
				return DAILY_LIMIT;
			}

			const count = docSnap.data()?.count ?? 0;
			return Math.max(0, DAILY_LIMIT - count);
		} catch (error) {
			console.error('[HallOfShameSubmitter] Error getting remaining submissions:', error);
			return DAILY_LIMIT; // Fail open to allow submissions
		}
	}

	// ============================================================================
	// Private Helpers
	// ============================================================================

	private async incrementDailyCount(userId: string): Promise<void> {
		try {
			const todayKey = this.getTodayKey();
			const firestore = await getFirestoreInstance();
			const docRef = doc(firestore, this.RATE_LIMIT_COLLECTION, `${userId}_${todayKey}`);
			const docSnap = await getDoc(docRef);

			const currentCount = docSnap.exists() ? (docSnap.data()?.count ?? 0) : 0;

			await setDoc(docRef, {
				userId,
				date: todayKey,
				count: currentCount + 1
			} as Record<string, unknown>);
		} catch (error) {
			console.error('[HallOfShameSubmitter] Error incrementing daily count:', error);
			// Don't throw - rate limiting is best-effort
		}
	}

	private getTodayKey(): string {
		const now = new Date();
		const datePart = now.toISOString().split('T')[0];
		return datePart ?? ''; // YYYY-MM-DD in UTC
	}
}
