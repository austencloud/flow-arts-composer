/**
 * Report querying.
 *
 * Queries and lists user reports for admin functionality.
 */

import {
	collection,
	doc,
	getDoc,
	getDocs,
	query,
	where,
	orderBy,
	limit as firestoreLimit,
	startAfter as firestoreStartAfter,
	onSnapshot,
	getCountFromServer
} from 'firebase/firestore';
import type { Timestamp, DocumentData, DocumentSnapshot, QueryConstraint } from 'firebase/firestore';
import { getFirestoreInstance } from '#lib/shared/auth/firebase.js';
import type {
	ReportFilters,
	ReportStatus,
	UserReport,
	ReportCategory,
	ReportResolution,
	PaginatedReportsResult
} from '../domain/models/report-models';

const REPORTS_COLLECTION = 'userReports';

interface FirestoreReportData extends DocumentData {
	createdAt: Timestamp;
	reporterId: string;
	reporterDisplayName: string;
	// NOTE: reporterEmail removed for privacy - not stored in Firestore
	reportedUserId: string;
	reportedUserDisplayName: string;
	// NOTE: reportedUserEmail removed for privacy - not stored in Firestore
	category: ReportCategory;
	description: string;
	evidenceUrls?: string[];
	status: ReportStatus;
	resolution?: ReportResolution;
	adminNotes?: string;
	resolvedAt?: Timestamp;
	resolvedBy?: string;
}

function mapFirestoreToReport(id: string, data: FirestoreReportData): UserReport {
	return {
		id,
		createdAt: data.createdAt?.toDate() ?? new Date(),
		reporterId: data.reporterId,
		reporterDisplayName: data.reporterDisplayName,
		// NOTE: Email fields removed for privacy
		reportedUserId: data.reportedUserId,
		reportedUserDisplayName: data.reportedUserDisplayName,
		category: data.category,
		description: data.description,
		evidenceUrls: data.evidenceUrls,
		status: data.status,
		resolution: data.resolution,
		adminNotes: data.adminNotes,
		resolvedAt: data.resolvedAt?.toDate(),
		resolvedBy: data.resolvedBy
	};
}

/**
 * Get a single report by ID.
 */
export async function getById(reportId: string): Promise<UserReport | null> {
	try {
		const firestore = await getFirestoreInstance();
		const reportRef = doc(firestore, REPORTS_COLLECTION, reportId);
		const reportDoc = await getDoc(reportRef);

		if (!reportDoc.exists()) {
			return null;
		}

		return mapFirestoreToReport(reportDoc.id, reportDoc.data() as FirestoreReportData);
	} catch (error) {
		console.error(`[report-querier] Error fetching report ${reportId}:`, error);
		return null;
	}
}

/**
 * List reports with optional filters.
 */
export async function list(filters?: ReportFilters, limit = 50): Promise<UserReport[]> {
	const result = await listPaginated(filters, limit);
	return result.reports;
}

/**
 * List reports with pagination and compound filter support.
 */
export async function listPaginated(
	filters?: ReportFilters,
	limit = 20,
	startAfter?: unknown
): Promise<PaginatedReportsResult> {
	try {
		const firestore = await getFirestoreInstance();
		const reportsRef = collection(firestore, REPORTS_COLLECTION);

		// Build query constraints
		const constraints: QueryConstraint[] = [];

		// Add filter constraints - supports compound filters (status AND category)
		if (filters?.status) {
			constraints.push(where('status', '==', filters.status));
		}
		if (filters?.category) {
			constraints.push(where('category', '==', filters.category));
		}
		if (filters?.reportedUserId) {
			constraints.push(where('reportedUserId', '==', filters.reportedUserId));
		}
		if (filters?.reporterId) {
			constraints.push(where('reporterId', '==', filters.reporterId));
		}

		// Always order by createdAt descending
		constraints.push(orderBy('createdAt', 'desc'));

		// Add pagination cursor if provided
		if (startAfter) {
			constraints.push(firestoreStartAfter(startAfter as DocumentSnapshot));
		}

		// Request one extra to check if there are more results
		constraints.push(firestoreLimit(limit + 1));

		const q = query(reportsRef, ...constraints);
		const snapshot = await getDocs(q);

		const docs = snapshot.docs;
		const hasMore = docs.length > limit;
		const resultDocs = hasMore ? docs.slice(0, limit) : docs;
		const lastDoc = resultDocs.length > 0 ? resultDocs[resultDocs.length - 1] : null;

		return {
			reports: resultDocs.map((docSnap) =>
				mapFirestoreToReport(docSnap.id, docSnap.data() as FirestoreReportData)
			),
			hasMore,
			lastDoc
		};
	} catch (error) {
		console.error('[report-querier] Error listing reports:', error);
		return { reports: [], hasMore: false, lastDoc: null };
	}
}

/**
 * Get count of reports by status.
 */
export async function getCountByStatus(status: ReportStatus): Promise<number> {
	try {
		const firestore = await getFirestoreInstance();
		const reportsRef = collection(firestore, REPORTS_COLLECTION);
		const q = query(reportsRef, where('status', '==', status));
		const snapshot = await getCountFromServer(q);
		return snapshot.data().count;
	} catch (error) {
		console.error(`[report-querier] Error getting count for status ${status}:`, error);
		return 0;
	}
}

/**
 * Get all reports for a specific user.
 */
export async function getReportsForUser(userId: string): Promise<UserReport[]> {
	return list({ reportedUserId: userId }, 100);
}

/**
 * Subscribe to new reports (real-time updates).
 */
export function subscribeToNew(callback: (reports: UserReport[]) => void): () => void {
	let unsubscribe: (() => void) | null = null;

	void (async () => {
		try {
			const firestore = await getFirestoreInstance();
			const reportsRef = collection(firestore, REPORTS_COLLECTION);
			const q = query(
				reportsRef,
				where('status', '==', 'new'),
				orderBy('createdAt', 'desc'),
				firestoreLimit(50)
			);

			unsubscribe = onSnapshot(
				q,
				(snapshot) => {
					const reports = snapshot.docs.map((docSnap) =>
						mapFirestoreToReport(docSnap.id, docSnap.data() as FirestoreReportData)
					);
					callback(reports);
				},
				(error) => {
					console.error('[report-querier] Real-time subscription error:', error);
					callback([]);
				}
			);
		} catch (error) {
			console.error('[report-querier] Failed to initialize subscription:', error);
			callback([]);
		}
	})();

	return () => {
		if (unsubscribe) {
			unsubscribe();
		}
	};
}
