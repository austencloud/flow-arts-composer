/**
 * Admin Reports State
 *
 * Manages the state for the admin reports dashboard, including loading reports,
 * filtering, and selecting a report for detailed view.
 * Uses Svelte 5 runes for reactivity.
 */

import { getReportQuerier } from '#lib/features/moderation/get-report-querier.js';
import { getReportResolver } from '#lib/features/moderation/get-report-resolver.js';
import type {
	UserReport,
	ReportStatus,
	ReportCategory,
	ReportFilters
} from '../domain/models/report-models';

interface AdminReportsState {
	reports: UserReport[];
	selectedReport: UserReport | null;
	isLoading: boolean;
	isLoadingMore: boolean;
	error: string | null;
	filters: ReportFilters;
	counts: {
		new: number;
		reviewing: number;
		resolved: number;
	};
	hasMore: boolean;
	lastDoc: unknown;
	mobileDetailOpen: boolean;
}

const PAGE_SIZE = 20;

// Reactive state using Svelte 5 $state rune
const _state = $state<AdminReportsState>({
	reports: [],
	selectedReport: null,
	isLoading: false,
	isLoadingMore: false,
	error: null,
	filters: {},
	counts: {
		new: 0,
		reviewing: 0,
		resolved: 0
	},
	hasMore: false,
	lastDoc: null,
	mobileDetailOpen: false
});

// Subscription cleanup function
let unsubscribe: (() => void) | null = null;

/**
 * Load reports with current filters (resets pagination).
 */
export async function loadReports(): Promise<void> {
	_state.isLoading = true;
	_state.error = null;
	_state.lastDoc = null;

	try {
		const reportQuerier = getReportQuerier();
		const result = await reportQuerier.listPaginated(_state.filters, PAGE_SIZE);
		_state.reports = result.reports;
		_state.hasMore = result.hasMore;
		_state.lastDoc = result.lastDoc;
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to load reports';
		_state.error = message;
		console.error('[adminReportsState] Error loading reports:', error);
	} finally {
		_state.isLoading = false;
	}
}

/**
 * Load more reports (pagination).
 */
export async function loadMoreReports(): Promise<void> {
	if (!_state.hasMore || _state.isLoadingMore || !_state.lastDoc) return;

	_state.isLoadingMore = true;

	try {
		const reportQuerier = getReportQuerier();
		const result = await reportQuerier.listPaginated(_state.filters, PAGE_SIZE, _state.lastDoc);
		_state.reports = [..._state.reports, ...result.reports];
		_state.hasMore = result.hasMore;
		_state.lastDoc = result.lastDoc;
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to load more reports';
		_state.error = message;
		console.error('[adminReportsState] Error loading more reports:', error);
	} finally {
		_state.isLoadingMore = false;
	}
}

/**
 * Load report counts by status.
 */
export async function loadCounts(): Promise<void> {
	try {
		const reportQuerier = getReportQuerier();
		const [newCount, reviewingCount, resolvedCount] = await Promise.all([
			reportQuerier.getCountByStatus('new'),
			reportQuerier.getCountByStatus('reviewing'),
			reportQuerier.getCountByStatus('resolved')
		]);
		_state.counts = {
			new: newCount,
			reviewing: reviewingCount,
			resolved: resolvedCount
		};
	} catch (error) {
		console.error('[adminReportsState] Error loading counts:', error);
	}
}

/**
 * Subscribe to new reports for real-time updates.
 */
export function subscribeToNewReports(): void {
	if (unsubscribe) {
		unsubscribe();
	}

	const reportQuerier = getReportQuerier();
	unsubscribe = reportQuerier.subscribeToNew((reports: UserReport[]) => {
		// Only update if we're filtering by 'new' or no filter
		if (!_state.filters.status || _state.filters.status === 'new') {
			_state.reports = reports;
		}
		// Always update the new count
		_state.counts.new = reports.length;
	});
}

/**
 * Cleanup subscription.
 */
export function cleanup(): void {
	if (unsubscribe) {
		unsubscribe();
		unsubscribe = null;
	}
}

/**
 * Set filter by status (preserves other filters for compound filtering).
 */
export async function setStatusFilter(status: ReportStatus | undefined): Promise<void> {
	_state.filters = { ..._state.filters, status };
	await loadReports();
}

/**
 * Set filter by category (preserves other filters for compound filtering).
 */
export async function setCategoryFilter(category: ReportCategory | undefined): Promise<void> {
	_state.filters = { ..._state.filters, category };
	await loadReports();
}

/**
 * Set multiple filters at once.
 */
export async function setFilters(filters: ReportFilters): Promise<void> {
	_state.filters = filters;
	await loadReports();
}

export async function clearFilters(): Promise<void> {
	_state.filters = {};
	await loadReports();
}

/**
 * Select a report for detailed view.
 */
export async function selectReport(reportId: string): Promise<void> {
	const report = _state.reports.find((r) => r.id === reportId);
	if (report) {
		_state.selectedReport = report;
		_state.mobileDetailOpen = true;
		return;
	}

	// If not in current list, fetch it
	try {
		const reportQuerier = getReportQuerier();
		const fetchedReport = await reportQuerier.getById(reportId);
		_state.selectedReport = fetchedReport;
		_state.mobileDetailOpen = true;
	} catch (error) {
		console.error('[adminReportsState] Error fetching report:', error);
	}
}

export function clearSelectedReport(): void {
	_state.selectedReport = null;
	_state.mobileDetailOpen = false;
}

/**
 * Close mobile detail drawer.
 */
export function closeMobileDetail(): void {
	_state.mobileDetailOpen = false;
}

/**
 * Update a report in the local state (after mutation).
 */
export function updateLocalReport(updatedReport: UserReport): void {
	const index = _state.reports.findIndex((r) => r.id === updatedReport.id);
	if (index !== -1) {
		_state.reports[index] = updatedReport;
	}
	if (_state.selectedReport?.id === updatedReport.id) {
		_state.selectedReport = updatedReport;
	}
}

export async function startReview(reportId: string): Promise<void> {
	try {
		const reportResolver = getReportResolver();
		const updated = await reportResolver.startReview(reportId);
		updateLocalReport(updated);
		await loadCounts();
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to start review';
		_state.error = message;
		throw error;
	}
}

/**
 * Export the admin reports state with reactive getters.
 */
export const adminReportsState = {
	get reports() {
		return _state.reports;
	},
	get selectedReport() {
		return _state.selectedReport;
	},
	get isLoading() {
		return _state.isLoading;
	},
	get isLoadingMore() {
		return _state.isLoadingMore;
	},
	get error() {
		return _state.error;
	},
	get filters() {
		return _state.filters;
	},
	get counts() {
		return _state.counts;
	},
	get totalUnresolved() {
		return _state.counts.new + _state.counts.reviewing;
	},
	get hasMore() {
		return _state.hasMore;
	},
	get mobileDetailOpen() {
		return _state.mobileDetailOpen;
	},

	// Actions
	loadReports,
	loadMoreReports,
	loadCounts,
	subscribeToNewReports,
	cleanup,
	setStatusFilter,
	setCategoryFilter,
	setFilters,
	clearFilters,
	selectReport,
	clearSelectedReport,
	closeMobileDetail,
	updateLocalReport,
	startReview
};
