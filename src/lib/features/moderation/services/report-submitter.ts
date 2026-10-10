/**
 * Report submission.
 *
 * Handles user report submissions to Firestore.
 */

import {
	collection,
	addDoc,
	query,
	where,
	getDocs,
	serverTimestamp,
	Timestamp
} from 'firebase/firestore';
import { getFirestoreInstance } from '#lib/shared/auth/firebase.js';
import { authState } from '#lib/shared/auth/state/auth-state.svelte.js';
import type { CreateReportInput, UserReport } from '../domain/models/report-models';

const REPORTS_COLLECTION = 'userReports';
const RECENT_REPORT_HOURS = 24; // Prevent duplicate reports within 24 hours

/**
 * Check if the current user has already reported this user recently.
 */
export async function hasRecentReport(reportedUserId: string): Promise<boolean> {
	const user = authState.user;
	if (!user) {
		return false;
	}

	const firestore = await getFirestoreInstance();
	const reportsRef = collection(firestore, REPORTS_COLLECTION);

	// Calculate the cutoff time (24 hours ago)
	const cutoffTime = new Date();
	cutoffTime.setHours(cutoffTime.getHours() - RECENT_REPORT_HOURS);

	const q = query(
		reportsRef,
		where('reporterId', '==', user.uid),
		where('reportedUserId', '==', reportedUserId),
		where('createdAt', '>=', Timestamp.fromDate(cutoffTime))
	);

	const snapshot = await getDocs(q);
	return !snapshot.empty;
}

/**
 * Submit a new report about a user.
 */
export async function submit(input: CreateReportInput): Promise<UserReport> {
	const user = authState.user;
	if (!user) {
		throw new Error('You must be signed in to report a user');
	}

	// Prevent self-reporting
	if (user.uid === input.reportedUserId) {
		throw new Error('You cannot report yourself');
	}

	// Check for recent duplicate reports (admins bypass this for testing)
	const isAdmin = authState.isAdmin;
	if (!isAdmin) {
		const recent = await hasRecentReport(input.reportedUserId);
		if (recent) {
			throw new Error(
				'You have already reported this user recently. Please wait before submitting another report.'
			);
		}
	}

	const firestore = await getFirestoreInstance();
	const reportsRef = collection(firestore, REPORTS_COLLECTION);

	const reportData = {
		createdAt: serverTimestamp(),

		// Reporter info
		reporterId: user.uid,
		reporterDisplayName: user.displayName || 'Anonymous',
		// NOTE: Email not stored for privacy

		// Reported user info
		reportedUserId: input.reportedUserId,
		reportedUserDisplayName: input.reportedUserDisplayName,
		// NOTE: Email not stored for privacy

		// Report content
		category: input.category,
		description: input.description,
		evidenceUrls: input.evidenceUrls || [],

		// Admin fields
		status: 'new' as const
	};

	const docRef = await addDoc(reportsRef, reportData);

	// Return the created report
	return {
		id: docRef.id,
		createdAt: new Date(),
		reporterId: user.uid,
		reporterDisplayName: user.displayName || 'Anonymous',
		reportedUserId: input.reportedUserId,
		reportedUserDisplayName: input.reportedUserDisplayName,
		category: input.category,
		description: input.description,
		evidenceUrls: input.evidenceUrls || [],
		status: 'new'
	};
}
