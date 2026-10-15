/**
 * TIKA Evaluation Runner
 *
 * Runs scenarios through TIKA and evaluates responses using the streaming API.
 * Flags low-scoring responses for Opus review.
 *
 * Usage:
 *   node scripts/tika/run-evaluation.mjs              # Run all scenarios
 *   node scripts/tika/run-evaluation.mjs --dry-run   # Preview only
 *   node scripts/tika/run-evaluation.mjs --limit 5   # Run first 5 only
 *   node scripts/tika/run-evaluation.mjs --category misconception-correction  # Run one category
 *   node scripts/tika/run-evaluation.mjs --opus      # Enable Opus review for failed items
 *
 * Live runs need TIKA_ID_TOKEN (a Firebase ID token) and the dev server; see
 * docs/reference/tika-testing.md. Every live scenario is a paid model call.
 */

import fs from 'fs';
import path from 'path';
import { evaluateResponse, summarizeEvaluations } from './lib/evaluator.mjs';

const SCENARIOS_FILE = path.join(process.cwd(), 'scripts/tika/scenarios.json');
const REPORTS_DIR = path.join(process.cwd(), 'scripts/tika/reports');

// Ensure reports directory exists
if (!fs.existsSync(REPORTS_DIR)) {
	fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const opusReview = args.includes('--opus');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : null;
const categoryIdx = args.indexOf('--category');
const categoryFilter = categoryIdx >= 0 ? args[categoryIdx + 1] : null;

let allScenarios = JSON.parse(fs.readFileSync(SCENARIOS_FILE, 'utf-8'));

if (categoryFilter) {
	allScenarios = allScenarios.filter((s) => s.category === categoryFilter);
}

const scenarios = limit ? allScenarios.slice(0, limit) : allScenarios;

console.log('');
console.log('═'.repeat(60));
console.log('  TIKA EVALUATION RUN');
console.log('═'.repeat(60));
console.log(`  Scenarios: ${scenarios.length}${limit ? ` (limited from ${allScenarios.length})` : ''}`);
if (categoryFilter) console.log(`  Category: ${categoryFilter}`);
console.log(`  Mode: ${dryRun ? 'DRY RUN (preview only)' : 'LIVE'}`);
console.log(`  Opus Review: ${opusReview ? 'ENABLED' : 'disabled'}`);
console.log(`  Time: ${new Date().toISOString()}`);
console.log('═'.repeat(60));
console.log('');

if (dryRun) {
	console.log('SCENARIOS TO RUN:\n');

	// Group by category
	const byCategory = {};
	scenarios.forEach((s) => {
		if (!byCategory[s.category]) byCategory[s.category] = [];
		byCategory[s.category].push(s);
	});

	for (const [category, items] of Object.entries(byCategory)) {
		console.log(`\n${category} (${items.length}):`);
		items.forEach((s, i) => {
			console.log(`  ${i + 1}. [L${s.userLevel}] ${s.name}`);
			console.log(`     Q: "${s.question}"`);
			console.log(`     Must include: ${s.criteria.mustInclude.join(', ') || 'None'}`);
			console.log(`     Must NOT include: ${s.criteria.mustNotInclude.join(', ') || 'None'}`);
		});
	}

	console.log('\n');
	process.exit(0);
}

// Loaded after the dry-run exit so a preview needs no installed packages.
const { TikaAuthError, callTikaStreaming, getLevelConcepts, requireTikaIdToken, resolveTikaEndpoint } =
	await import('./lib/stream-client.mjs');

try {
	requireTikaIdToken();
} catch (error) {
	console.error(error.message);
	process.exit(1);
}
console.log(`Endpoint: ${resolveTikaEndpoint()}
`);

// Run evaluation
const results = [];
let passed = 0;
let failed = 0;
let totalLatency = 0;
const flaggedForOpus = [];
let stoppedForAuth = null;

for (let i = 0; i < scenarios.length; i++) {
	const scenario = scenarios[i];
	console.log(`[${i + 1}/${scenarios.length}] ${scenario.name}`);

	try {
		const completedConcepts = getLevelConcepts(scenario.userLevel);
		const response = await callTikaStreaming(scenario.question, scenario.userLevel, completedConcepts);
		const evaluation = evaluateResponse(scenario, response);

		const result = {
			scenarioId: scenario.id,
			scenario,
			response: {
				explanation: response.explanation,
				toolsCalled: response.toolsCalled || [],
				latencyMs: response.latencyMs
			},
			evaluation,
			timestamp: new Date().toISOString()
		};

		results.push(result);
		totalLatency += response.latencyMs;

		if (evaluation.passed) {
			passed++;
			console.log(`   ✓ PASSED (score: ${evaluation.overall}, ${response.latencyMs}ms)`);
		} else {
			failed++;
			console.log(`   ✗ FAILED (score: ${evaluation.overall}, ${response.latencyMs}ms)`);
			evaluation.issues.forEach((issue) => {
				const icon = issue.severity === 'error' ? '✗' : '⚠';
				console.log(`     ${icon} ${issue.message}`);
			});

			// Flag for Opus review if enabled and score is low
			if (opusReview && evaluation.overall < 70) {
				flaggedForOpus.push(result);
				console.log(`     → Flagged for Opus review`);
			}
		}
	} catch (error) {
		// A rejected or expired token fails every remaining scenario the same way.
		if (error instanceof TikaAuthError) {
			stoppedForAuth = error;
			break;
		}
		failed++;
		results.push({
			scenarioId: scenario.id,
			scenario,
			response: null,
			evaluation: {
				passed: false,
				overall: 0,
				scores: { termAccuracy: 0, levelAppropriate: 0, toolUsage: 0, conciseness: 0 },
				issues: [{ type: 'api-error', severity: 'error', message: error.message }],
				recommendation: 'fix-required'
			},
			timestamp: new Date().toISOString()
		});
		console.log(`   ✗ ERROR: ${error.message}`);
	}

	// Small delay between requests
	await new Promise((r) => setTimeout(r, 500));
}

if (stoppedForAuth) {
	// process.exit() here can trip a libuv assertion on Windows after a fetch.
	console.error(`   ✗ ${stoppedForAuth.message}`);
	console.error('Stopped before saving a report: get a fresh TIKA_ID_TOKEN and run again.');
	process.exitCode = 1;
} else {
	// Summary
	const passRate = Math.round((passed / scenarios.length) * 100);
	const avgLatency = Math.round(totalLatency / scenarios.length);

	console.log('');
	console.log('═'.repeat(60));
	console.log('  SUMMARY');
	console.log('═'.repeat(60));
	console.log(`  Total:      ${scenarios.length}`);
	console.log(`  Passed:     ${passed} (${passRate}%)`);
	console.log(`  Failed:     ${failed} (${100 - passRate}%)`);
	console.log(`  Avg Time:   ${avgLatency}ms`);
	console.log('═'.repeat(60));
	console.log('');

	// Generate summary statistics
	const evaluationData = results.map((r) => ({ evaluation: r.evaluation, scenario: r.scenario }));
	const summary = summarizeEvaluations(evaluationData);

	// Category breakdown
	console.log('SCORES BY CATEGORY:\n');
	for (const [category, data] of Object.entries(summary.byCategory)) {
		const status = data.passRate >= 80 ? '✓' : data.passRate >= 60 ? '⚠' : '✗';
		console.log(`  ${status} ${category}: ${data.passRate}% pass (avg: ${data.avgScore})`);
	}
	console.log('');

	// Difficulty breakdown
	console.log('SCORES BY DIFFICULTY:\n');
	for (const [difficulty, data] of Object.entries(summary.byDifficulty)) {
		const status = data.passRate >= 80 ? '✓' : data.passRate >= 60 ? '⚠' : '✗';
		console.log(`  ${status} ${difficulty}: ${data.passRate}% pass (avg: ${data.avgScore})`);
	}
	console.log('');

	// Common issues
	if (Object.keys(summary.commonMissingTerms).length > 0) {
		console.log('MOST FREQUENTLY MISSING TERMS:');
		const topMissing = Object.entries(summary.commonMissingTerms).slice(0, 5);
		topMissing.forEach(([term, count]) => {
			console.log(`  - "${term}" (${count} times)`);
		});
		console.log('');
	}

	if (Object.keys(summary.commonForbiddenTerms).length > 0) {
		console.log('MOST FREQUENTLY USED FORBIDDEN TERMS:');
		const topForbidden = Object.entries(summary.commonForbiddenTerms).slice(0, 5);
		topForbidden.forEach(([term, count]) => {
			console.log(`  - "${term}" (${count} times)`);
		});
		console.log('');
	}

	// Run Opus review for flagged items
	if (opusReview && flaggedForOpus.length > 0) {
		console.log('═'.repeat(60));
		console.log(`  OPUS REVIEW (${flaggedForOpus.length} items)`);
		console.log('═'.repeat(60));
		console.log('');

		try {
			// Dynamic import for TypeScript module
			const { reviewWithOpus } = await import('./opus-reviewer.ts');

			for (const result of flaggedForOpus) {
				console.log(`Reviewing: ${result.scenario.name}...`);

				// Adapt scenario format for Opus reviewer
				const opusScenario = {
					id: result.scenario.id,
					name: { en: result.scenario.name },
					category: result.scenario.category,
					userLevel: result.scenario.userLevel,
					question: { en: result.scenario.question },
					criteria: {
						mustInclude: result.scenario.criteria.mustInclude,
						mustNotInclude: result.scenario.criteria.mustNotInclude,
						expectedTools: result.scenario.criteria.expectedTools,
						keyFacts: result.scenario.criteria.keyFacts.map((f) => ({ en: f })),
						commonMistakes: result.scenario.criteria.commonMistakes?.map((m) => ({ en: m }))
					},
					difficulty: result.scenario.difficulty
				};

				const opusReviewResult = await reviewWithOpus(opusScenario, result.response);
				result.opusReview = opusReviewResult.result;

				console.log(`  → Recommendation: ${opusReviewResult.result.recommendation}`);
				console.log(`  → Score: ${opusReviewResult.result.overallScore}/10`);
				if (opusReviewResult.result.suggestedRewrite) {
					console.log(`  → Has suggested rewrite`);
				}
				console.log('');
			}
		} catch (error) {
			console.error('Failed to run Opus review:', error.message);
			console.log('Skipping Opus review...\n');
		}
	}

	// Save full report
	const timestamp = Date.now();
	const reportFile = path.join(REPORTS_DIR, `eval-${timestamp}.json`);
	const report = {
		runId: `eval-${timestamp}`,
		startedAt: new Date().toISOString(),
		config: {
			categoryFilter,
			limit,
			opusReview
		},
		summary: {
			total: scenarios.length,
			passed,
			failed,
			passRate,
			averageLatencyMs: avgLatency,
			averageScores: summary.averageScores,
			byCategory: summary.byCategory,
			byDifficulty: summary.byDifficulty
		},
		issues: {
			commonMissingTerms: summary.commonMissingTerms,
			commonForbiddenTerms: summary.commonForbiddenTerms,
			commonMissingTools: summary.commonMissingTools
		},
		results
	};

	fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
	console.log(`Full report saved to: ${reportFile}`);

	// Also save a human-readable summary for flagged items
	const failedResults = results.filter((r) => !r.evaluation.passed);
	if (failedResults.length > 0) {
		const flaggedFile = path.join(REPORTS_DIR, `flagged-${timestamp}.md`);
		let flaggedContent = `# TIKA Evaluation - Flagged Items\n\n`;
		flaggedContent += `**Run:** ${report.runId}\n`;
		flaggedContent += `**Date:** ${new Date().toLocaleString()}\n`;
		flaggedContent += `**Pass Rate:** ${passRate}%\n\n`;
		flaggedContent += `---\n\n`;

		for (const result of failedResults) {
			flaggedContent += `## ${result.scenario.name}\n\n`;
			flaggedContent += `**ID:** ${result.scenarioId}\n`;
			flaggedContent += `**Category:** ${result.scenario.category}\n`;
			flaggedContent += `**Difficulty:** ${result.scenario.difficulty}\n`;
			flaggedContent += `**Score:** ${result.evaluation.overall}/100\n\n`;
			flaggedContent += `### Question\n\n> ${result.scenario.question}\n\n`;
			flaggedContent += `### TIKA's Response\n\n${result.response?.explanation || 'No response'}\n\n`;
			flaggedContent += `### Issues Found\n\n`;
			for (const issue of result.evaluation.issues) {
				const icon = issue.severity === 'error' ? '❌' : '⚠️';
				flaggedContent += `- ${icon} **${issue.type}**: ${issue.message}\n`;
			}
			flaggedContent += `\n### Expected Key Facts\n\n`;
			for (const fact of result.scenario.criteria.keyFacts) {
				flaggedContent += `- ${fact}\n`;
			}

			// Include Opus review if available
			if (result.opusReview) {
				flaggedContent += `\n### Opus Review\n\n`;
				flaggedContent += `**Recommendation:** ${result.opusReview.recommendation}\n`;
				flaggedContent += `**Score:** ${result.opusReview.overallScore}/10\n\n`;
				flaggedContent += `${result.opusReview.opusNotes}\n`;
				if (result.opusReview.suggestedRewrite) {
					flaggedContent += `\n**Suggested Rewrite:**\n\n${result.opusReview.suggestedRewrite}\n`;
				}
			}

			flaggedContent += `\n---\n\n`;
		}

		fs.writeFileSync(flaggedFile, flaggedContent);
		console.log(`Flagged items saved to: ${flaggedFile}`);
	}

	console.log('');
}
