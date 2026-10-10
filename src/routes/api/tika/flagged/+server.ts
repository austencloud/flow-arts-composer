/**
 * TIKA Flagged Items API
 *
 * Returns evaluation results flagged for human review.
 * Used by the TIKA Review UI to browse and resolve issues.
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';
import { requireAdmin as requireAdminAuth } from '#lib/server/auth/requireAdmin.js';
import { RATE_LIMITS } from '#lib/server/security/rate-limiter.js';
import { withRateLimit } from '#lib/server/security/withRateLimit.js';
import { logAdminAction } from '#lib/server/security/audit-logger.js';

interface FlaggedItem {
	id: string;
	scenarioId: string;
	scenarioName: string;
	category: string;
	difficulty: string;
	userLevel: number;
	question: string;
	tikaResponse: string;
	toolsCalled: string[];
	issues: Array<{
		type: string;
		severity: string;
		message: string;
	}>;
	expectedKeyFacts: string[];
	timestamp: string;
	status: 'pending' | 'approved' | 'rejected' | 'needs-rewrite';
	resolution?: {
		resolvedAt: string;
		resolvedBy: string;
		notes: string;
		correctedResponse?: string;
	};
}

interface EvaluationReport {
	runId: string;
	startedAt: string;
	summary: {
		total: number;
		passed: number;
		failed: number;
		passRate: number;
		averageLatencyMs: number;
	};
	results: Array<{
		scenarioId: string;
		scenario: {
			id: string;
			name: string;
			category: string;
			userLevel: number;
			question: string;
			criteria: {
				keyFacts: string[];
			};
			difficulty: string;
		};
		response: {
			explanation: string;
			toolsCalled: Array<{ name: string }>;
			latencyMs: number;
		} | null;
		evaluation: {
			passed: boolean;
			issues: Array<{
				type: string;
				severity: string;
				message: string;
			}>;
		};
		timestamp: string;
	}>;
}

const REPORTS_DIR = path.resolve(process.cwd(), 'scripts/tika/reports');
const RESOLUTIONS_FILE = path.resolve(REPORTS_DIR, 'resolutions.json');

function loadResolutions(): Record<string, FlaggedItem['resolution']> {
	if (fs.existsSync(RESOLUTIONS_FILE)) {
		return JSON.parse(fs.readFileSync(RESOLUTIONS_FILE, 'utf-8'));
	}
	return {};
}

function saveResolutions(resolutions: Record<string, FlaggedItem['resolution']>): void {
	fs.writeFileSync(RESOLUTIONS_FILE, JSON.stringify(resolutions, null, 2));
}

/**
 * GET - Retrieve all flagged items
 */
export const GET: RequestHandler = async (event) => {
	try {
		const caller = await requireAdminAuth(event);

		const blocked = await withRateLimit(event, RATE_LIMITS.ADMIN, 'user', caller.uid);
		if (blocked) return blocked;
		// Find all evaluation reports
		if (!fs.existsSync(REPORTS_DIR)) {
			return json({ items: [], summary: { total: 0, pending: 0, resolved: 0 } });
		}

		const files = fs.readdirSync(REPORTS_DIR).filter((f) => f.startsWith('eval-') && f.endsWith('.json'));

		if (files.length === 0) {
			return json({ items: [], summary: { total: 0, pending: 0, resolved: 0 } });
		}

		// Sort by timestamp (newest first)
		files.sort().reverse();

		// Load the most recent report
		const latestFile = files[0];
		if (!latestFile) {
			return json({ items: [], summary: { total: 0, pending: 0, resolved: 0 } });
		}

		const reportPath = path.join(REPORTS_DIR, latestFile);
		const report: EvaluationReport = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));

		const resolutions = loadResolutions();

		// Convert failed results to flagged items
		const flaggedItems: FlaggedItem[] = report.results
			.filter((r) => !r.evaluation.passed)
			.map((result) => {
				const itemId = `${report.runId}-${result.scenarioId}`;
				const resolution = resolutions[itemId];

				return {
					id: itemId,
					scenarioId: result.scenarioId,
					scenarioName: result.scenario.name,
					category: result.scenario.category,
					difficulty: result.scenario.difficulty,
					userLevel: result.scenario.userLevel,
					question: result.scenario.question,
					tikaResponse: result.response?.explanation || 'No response',
					toolsCalled: result.response?.toolsCalled.map((t) => t.name) || [],
					issues: result.evaluation.issues,
					expectedKeyFacts: result.scenario.criteria.keyFacts,
					timestamp: result.timestamp,
					status: resolution ? 'approved' : 'pending',
					resolution
				};
			});

		const summary = {
			total: flaggedItems.length,
			pending: flaggedItems.filter((i) => i.status === 'pending').length,
			resolved: flaggedItems.filter((i) => i.status !== 'pending').length,
			passRate: report.summary.passRate,
			runId: report.runId,
			runDate: report.startedAt
		};

		return json({ items: flaggedItems, summary });
	} catch (error) {
		console.error('[TIKA Flagged API] Error:', error);
		return json({ error: 'Failed to load flagged items' }, { status: 500 });
	}
};

/**
 * POST - Resolve a flagged item
 */
export const POST: RequestHandler = async (event) => {
	try {
		const caller = await requireAdminAuth(event);

		const blocked = await withRateLimit(event, RATE_LIMITS.ADMIN, 'user', caller.uid);
		if (blocked) return blocked;

		const body = await event.request.json();
		const { itemId, status, notes, correctedResponse, resolvedBy } = body;

		if (!itemId || !status) {
			return json({ error: 'Missing itemId or status' }, { status: 400 });
		}

		const resolutions = loadResolutions();

		resolutions[itemId] = {
			resolvedAt: new Date().toISOString(),
			resolvedBy: (resolvedBy as string | undefined) || 'austen',
			notes: (notes as string | undefined) || '',
			correctedResponse: correctedResponse as string | undefined
		};

		saveResolutions(resolutions);

		logAdminAction({
			uid: caller.uid,
			action: 'flagged_item_resolve',
			target: itemId as string,
			metadata: { status },
			ip: event.getClientAddress(),
		});

		return json({ success: true, resolution: resolutions[itemId] });
	} catch (error) {
		console.error('[TIKA Flagged API] Error saving resolution:', error);
		return json({ error: 'Failed to save resolution' }, { status: 500 });
	}
};
