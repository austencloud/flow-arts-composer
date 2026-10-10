/**
 * ReportResolver Implementation
 *
 * Handles admin actions on reports (resolution, status changes).
 */

import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getFirestoreInstance } from '#lib/shared/auth/firebase.js';
import { authState } from '#lib/shared/auth/state/auth-state.svelte.js';
interface ReportQuerier {
	getById(reportId: string): Promise<UserReport | null>;
}
import type { ResolveReportInput, UserReport } from '../domain/models/report-models';
import { REPORT_CATEGORIES } from '../domain/models/report-models';
import * as notificationTriggerService from '#lib/features/feedback/services/notification-trigger-service.js';

const REPORTS_COLLECTION = 'userReports';
const USERS_COLLECTION = 'users';

export class ReportResolver {
	constructor(private reportQuerier: ReportQuerier) {}

	/**
	 * Mark a report as "reviewing" (admin is looking at it).
	 */
	async startReview(reportId: string): Promise<UserReport> {
		this.ensureAdmin();

		const firestore = await getFirestoreInstance();
		const reportRef = doc(firestore, REPORTS_COLLECTION, reportId);

		await updateDoc(reportRef, {
			status: 'reviewing'
		});

		const updated = await this.reportQuerier.getById(reportId);
		if (!updated) {
			throw new Error('Report not found after update');
		}
		return updated;
	}

	/**
	 * Resolve a report with a specific resolution.
	 */
	async resolve(input: ResolveReportInput): Promise<UserReport> {
		this.ensureAdmin();

		const user = authState.user;
		const firestore = await getFirestoreInstance();
		const reportRef = doc(firestore, REPORTS_COLLECTION, input.reportId);

		// Get the report to check if we need to disable the account
		const report = await this.reportQuerier.getById(input.reportId);
		if (!report) {
			throw new Error('Report not found');
		}

		await updateDoc(reportRef, {
			status: 'resolved',
			resolution: input.resolution,
			adminNotes: input.adminNotes || null,
			resolvedAt: serverTimestamp(),
			resolvedBy: user?.uid || 'unknown'
		});

		// Handle side effects based on resolution
		if (input.resolution === 'account_disabled') {
			await this.disableUserAccount(
				report.reportedUserId,
				`Disabled via report ${input.reportId}: ${input.adminNotes || 'No notes provided'}`
			);
		}

		if (input.resolution === 'warning_issued') {
			try {
				await this.issueWarning(
					report.reportedUserId,
					input.reportId,
					report.category,
					input.adminNotes
				);
			} catch (error) {
				console.error('[ReportResolver] Failed to issue warning:', error);
				throw new Error('Failed to send warning notification. Please try again.');
			}
		}

		const updated = await this.reportQuerier.getById(input.reportId);
		if (!updated) {
			throw new Error('Report not found after update');
		}
		return updated;
	}

	/**
	 * Add admin notes to a report without changing its status.
	 */
	async addNotes(reportId: string, notes: string): Promise<UserReport> {
		this.ensureAdmin();

		const firestore = await getFirestoreInstance();
		const reportRef = doc(firestore, REPORTS_COLLECTION, reportId);

		await updateDoc(reportRef, {
			adminNotes: notes
		});

		const updated = await this.reportQuerier.getById(reportId);
		if (!updated) {
			throw new Error('Report not found after update');
		}
		return updated;
	}

	/**
	 * Disable a user's account.
	 */
	async disableUserAccount(userId: string, reason: string): Promise<void> {
		this.ensureAdmin();

		const firestore = await getFirestoreInstance();
		const userRef = doc(firestore, USERS_COLLECTION, userId);

		await updateDoc(userRef, {
			isDisabled: true,
			disabledReason: reason,
			disabledAt: serverTimestamp(),
			disabledBy: authState.user?.uid || 'unknown'
		});
	}

	/**
	 * Issue a warning to a user.
	 * Sets the hasActiveWarning flag and sends a notification.
	 */
	private async issueWarning(
		userId: string,
		reportId: string,
		category: string,
		adminNotes?: string
	): Promise<void> {
		const firestore = await getFirestoreInstance();
		const userRef = doc(firestore, `users/${userId}/moderation/status`);

		// Set the active warning flag on the user document
		await setDoc(userRef, {
			hasActiveWarning: true,
			lastWarningAt: serverTimestamp(),
			lastWarningReportId: reportId
		}, { merge: true });

		// Send notification to the warned user
		const categoryLabel = REPORT_CATEGORIES[category as keyof typeof REPORT_CATEGORIES]?.label || category;
		await notificationTriggerService.createModerationWarning(
			userId,
			reportId,
			categoryLabel,
			adminNotes
		);
	}

	/**
	 * Ensure the current user is an admin.
	 */
	private ensureAdmin(): void {
		if (!authState.isAdmin) {
			throw new Error('Only admins can perform this action');
		}
	}
}
