/**
 * shame-queue-manager - Admin operations for Hall of Shame
 *
 * Handles the moderation queue: reviewing, approving, rejecting,
 * featuring, and hiding entries.
 */

import {
	collection,
	doc,
	getDoc,
	getDocs,
	setDoc,
	updateDoc,
	increment,
	query,
	where,
	orderBy,
	serverTimestamp,
	getCountFromServer
} from 'firebase/firestore';
import { getFirestoreInstance } from '#lib/shared/auth/firebase.js';
import type { HallOfShameEntry, ShameCategory } from '../domain/models/hall-of-shame-models';

const REPORT_THRESHOLD = 5;
const COLLECTION = 'hallOfShame';
const REPORTS_COLLECTION = 'hallOfShameReports';

export async function getPendingQueue(): Promise<HallOfShameEntry[]> {
	try {
		const firestore = await getFirestoreInstance();
		const collectionRef = collection(firestore, COLLECTION);
		const q = query(
			collectionRef,
			where('status', '==', 'pending'),
			orderBy('submittedAt', 'asc') // Oldest first (FIFO)
		);

		const snapshot = await getDocs(q);
		return snapshot.docs.map((doc) => doc.data() as HallOfShameEntry);
	} catch (error) {
		console.error('[ShameQueueManager] Error getting pending queue:', error);
		return [];
	}
}

export async function getPendingCount(): Promise<number> {
	try {
		const firestore = await getFirestoreInstance();
		const collectionRef = collection(firestore, COLLECTION);
		const q = query(collectionRef, where('status', '==', 'pending'));

		const countSnapshot = await getCountFromServer(q);
		return countSnapshot.data().count;
	} catch (error) {
		console.error('[ShameQueueManager] Error getting pending count:', error);
		return 0;
	}
}

export async function approveEntry(sequenceId: string, adminId: string, category?: ShameCategory): Promise<void> {
	try {
		const firestore = await getFirestoreInstance();
		const docRef = doc(firestore, COLLECTION, sequenceId);
		const docSnap = await getDoc(docRef);

		if (!docSnap.exists()) {
			throw new Error('Entry not found');
		}

		const entry = docSnap.data() as HallOfShameEntry;
		if (entry.status !== 'pending') {
			throw new Error('Only pending entries can be approved');
		}

		const updates: Record<string, unknown> = {
			status: 'approved',
			approvedAt: serverTimestamp(),
			approvedBy: adminId
		};

		// Allow category override if admin specifies
		if (category) {
			updates.category = category;
		}

		await updateDoc(docRef, updates);
	} catch (error) {
		console.error('[ShameQueueManager] Error approving entry:', error);
		throw error;
	}
}

export async function rejectEntry(sequenceId: string, adminId: string, reason: string): Promise<void> {
	if (!reason?.trim()) {
		throw new Error('Rejection reason is required');
	}

	try {
		const firestore = await getFirestoreInstance();
		const docRef = doc(firestore, COLLECTION, sequenceId);
		const docSnap = await getDoc(docRef);

		if (!docSnap.exists()) {
			throw new Error('Entry not found');
		}

		const entry = docSnap.data() as HallOfShameEntry;
		if (entry.status !== 'pending') {
			throw new Error('Only pending entries can be rejected');
		}

		await updateDoc(docRef, {
			status: 'rejected',
			rejectedAt: serverTimestamp(),
			rejectedBy: adminId,
			rejectionReason: reason.trim()
		});
	} catch (error) {
		console.error('[ShameQueueManager] Error rejecting entry:', error);
		throw error;
	}
}

export async function setEntryFeatured(sequenceId: string, adminId: string, featured: boolean): Promise<void> {
	try {
		const firestore = await getFirestoreInstance();
		const docRef = doc(firestore, COLLECTION, sequenceId);
		const docSnap = await getDoc(docRef);

		if (!docSnap.exists()) {
			throw new Error('Entry not found');
		}

		const entry = docSnap.data() as HallOfShameEntry;
		if (entry.status !== 'approved') {
			throw new Error('Only approved entries can be featured');
		}

		const updates: Record<string, unknown> = { featured };

		if (featured) {
			updates.featuredAt = serverTimestamp();
			updates.featuredBy = adminId;
		} else {
			updates.featuredAt = null;
			updates.featuredBy = null;
		}

		await updateDoc(docRef, updates);
	} catch (error) {
		console.error('[ShameQueueManager] Error setting featured:', error);
		throw error;
	}
}

export async function setEntryHidden(sequenceId: string, adminId: string, hidden: boolean): Promise<void> {
	try {
		const firestore = await getFirestoreInstance();
		const docRef = doc(firestore, COLLECTION, sequenceId);
		const docSnap = await getDoc(docRef);

		if (!docSnap.exists()) {
			throw new Error('Entry not found');
		}

		await updateDoc(docRef, { hidden });

		// Log the action for audit trail
		console.info(`[ShameQueueManager] Entry ${sequenceId} ${hidden ? 'hidden' : 'unhidden'} by ${adminId}`);
	} catch (error) {
		console.error('[ShameQueueManager] Error setting hidden:', error);
		throw error;
	}
}

export async function reportEntry(sequenceId: string, reporterId: string, reason?: string): Promise<void> {
	try {
		const firestore = await getFirestoreInstance();
		const entryRef = doc(firestore, COLLECTION, sequenceId);
		const entryDoc = await getDoc(entryRef);

		if (!entryDoc.exists()) {
			throw new Error('Entry not found');
		}

		const entry = entryDoc.data() as HallOfShameEntry;
		if (entry.status !== 'approved') {
			throw new Error('Can only report approved entries');
		}

		// Increment report count
		await updateDoc(entryRef, {
			reportCount: increment(1),
			lastReportedAt: serverTimestamp()
		});

		// Store detailed report (optional, for admin review)
		if (reason) {
			const reportRef = doc(collection(firestore, REPORTS_COLLECTION));
			await setDoc(reportRef, {
				sequenceId,
				reporterId,
				reason,
				createdAt: serverTimestamp()
			});
		}
	} catch (error) {
		console.error('[ShameQueueManager] Error reporting entry:', error);
		throw error;
	}
}

export async function getReportedEntries(threshold = REPORT_THRESHOLD): Promise<HallOfShameEntry[]> {
	try {
		const firestore = await getFirestoreInstance();
		const collectionRef = collection(firestore, COLLECTION);
		const q = query(
			collectionRef,
			where('status', '==', 'approved'),
			where('reportCount', '>=', threshold),
			orderBy('reportCount', 'desc')
		);

		const snapshot = await getDocs(q);
		return snapshot.docs.map((doc) => doc.data() as HallOfShameEntry);
	} catch (error) {
		console.error('[ShameQueueManager] Error getting reported entries:', error);
		return [];
	}
}
