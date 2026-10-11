/**
 * HallOfShameLoader - Load and query Hall of Shame entries
 *
 * Handles gallery loading with filtering, sorting, and pagination.
 * Only returns approved, non-hidden entries.
 */

import {
	collection,
	doc,
	getDoc,
	getDocs,
	updateDoc,
	increment,
	query,
	where,
	orderBy,
	limit as firestoreLimit,
	startAfter,
	getCountFromServer
} from 'firebase/firestore';
import { getFirestoreInstance } from '#lib/shared/auth/firebase.js';
import type { AgeVerifier } from "./age-verifier";
import type {
	HallOfShameEntry,
	ShameLoadParams,
	PaginatedShameResult,
	ShameCategoryCounts,
	ShameCategory,
} from '../domain/models/hall-of-shame-models';

export class HallOfShameLoader {
	private readonly COLLECTION = 'hallOfShame';

	constructor(private readonly ageVerifier: AgeVerifier) {}

	async loadApproved(params: ShameLoadParams): Promise<PaginatedShameResult> {
		try {
			const firestore = await getFirestoreInstance();
			const collectionRef = collection(firestore, this.COLLECTION);

			const constraints: Parameters<typeof query>[1][] = [
				where('status', '==', 'approved'),
				where('hidden', '==', false)
			];

			// Add category filter if specified
			if (params.category) {
				constraints.push(where('category', '==', params.category));
			}

			// Add owner filter if specified
			if (params.ownerId) {
				constraints.push(where('ownerId', '==', params.ownerId));
			}

			switch (params.sortBy) {
				case 'newest':
					constraints.push(orderBy('approvedAt', 'desc'));
					break;
				case 'mostVoted':
					constraints.push(orderBy('voteCount', 'desc'));
					break;
				case 'mostViewed':
					constraints.push(orderBy('viewCount', 'desc'));
					break;
			}

			// Add limit (fetch one extra to check if there's more)
			constraints.push(firestoreLimit(params.limit + 1));

			// Add cursor for pagination
			if (params.cursor) {
				const cursorDoc = await getDoc(doc(firestore, this.COLLECTION, params.cursor));
				if (cursorDoc.exists()) {
					constraints.push(startAfter(cursorDoc));
				}
			}

			const q = query(collectionRef, ...constraints);
			const snapshot = await getDocs(q);

			const items = snapshot.docs.slice(0, params.limit).map((doc) => doc.data() as HallOfShameEntry);
			const hasMore = snapshot.docs.length > params.limit;
			const lastItem = items[items.length - 1];
			const nextCursor = hasMore && lastItem ? lastItem.id : undefined;

			return {
				items,
				hasMore,
				nextCursor
			};
		} catch (error) {
			console.error('[HallOfShameLoader] Error loading approved entries:', error);
			return { items: [], hasMore: false };
		}
	}

	async loadFeatured(limit = 10): Promise<HallOfShameEntry[]> {
		try {
			const firestore = await getFirestoreInstance();
			const collectionRef = collection(firestore, this.COLLECTION);
			const q = query(
				collectionRef,
				where('status', '==', 'approved'),
				where('hidden', '==', false),
				where('featured', '==', true),
				orderBy('featuredAt', 'desc'),
				firestoreLimit(limit)
			);

			const snapshot = await getDocs(q);
			return snapshot.docs.map((doc) => doc.data() as HallOfShameEntry);
		} catch (error) {
			console.error('[HallOfShameLoader] Error loading featured entries:', error);
			return [];
		}
	}

	async getEntry(sequenceId: string): Promise<HallOfShameEntry | null> {
		try {
			const firestore = await getFirestoreInstance();
			const docRef = doc(firestore, this.COLLECTION, sequenceId);
			const docSnap = await getDoc(docRef);

			if (!docSnap.exists()) {
				return null;
			}

			const entry = docSnap.data() as HallOfShameEntry;

			// Only return if approved and not hidden
			if (entry.status !== 'approved' || entry.hidden) {
				return null;
			}

			return entry;
		} catch (error) {
			console.error('[HallOfShameLoader] Error getting entry:', error);
			return null;
		}
	}

	async getCategoryCounts(): Promise<ShameCategoryCounts> {
		const counts: ShameCategoryCounts = {
			profanity: 0,
			sexual: 0,
			creative: 0
		};

		try {
			const firestore = await getFirestoreInstance();
			const collectionRef = collection(firestore, this.COLLECTION);

			// Query each category separately for accurate counts. The three
			// counts are independent, so run them in parallel rather than
			// awaiting each in sequence (~3x faster).
			const categories: ShameCategory[] = ['profanity', 'sexual', 'creative'];

			const results = await Promise.all(
				categories.map(async (category) => {
					const q = query(
						collectionRef,
						where('status', '==', 'approved'),
						where('hidden', '==', false),
						where('category', '==', category)
					);
					const countSnapshot = await getCountFromServer(q);
					return [category, countSnapshot.data().count] as const;
				})
			);

			for (const [category, count] of results) {
				counts[category] = count;
			}

			return counts;
		} catch (error) {
			console.error('[HallOfShameLoader] Error getting category counts:', error);
			return counts;
		}
	}

	async incrementViewCount(sequenceId: string): Promise<void> {
		try {
			const firestore = await getFirestoreInstance();
			const docRef = doc(firestore, this.COLLECTION, sequenceId);
			await updateDoc(docRef, {
				viewCount: increment(1)
			});
		} catch (error) {
			console.error('[HallOfShameLoader] Error incrementing view count:', error);
			// Don't throw - view tracking is best-effort
		}
	}
}
