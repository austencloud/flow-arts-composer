/**
 * TIKA Structural Validator
 *
 * Tests TIKA responses against structural criteria without keyword gaming.
 * Runs scenarios through the actual API and checks format compliance.
 *
 * Usage:
 *   node --import tsx scripts/tika-validator.ts                    # Run all scenarios
 *   node --import tsx scripts/tika-validator.ts --category position-alpha   # Run one category
 *   node --import tsx scripts/tika-validator.ts --limit 10         # Run first 10 only
 *   node --import tsx scripts/tika-validator.ts --dry-run          # Show scenarios without running
 *
 * Requires dev server running at localhost:5173
 */

import { beginnerScenarios, beginnerScenariosByCategory } from '../src/lib/features/tika/evaluation/scenarios/beginner-scenarios'
import type { TikaScenario } from '../src/lib/features/tika/evaluation/types'

// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════

const TIKA_API_URL = 'http://localhost:5173/api/tika/ask'
const MAX_WORD_COUNT_BEGINNER = 50 // Allow some flexibility, flag if way over
const STRICT_WORD_COUNT = 30 // Ideal for beginners

// Patterns that indicate raw JSON dump (bad)
const JSON_DUMP_PATTERNS = [
	/\{[\s\S]*"contextData"/,
	/\{[\s\S]*"variation":\s*\d/,
	/\{[\s\S]*"startPlacement":/,
	/\{[\s\S]*"endPlacement":/,
	/\{[\s\S]*"leftMotion":/,
	/\{[\s\S]*"rightMotion":/,
	/\{[\s\S]*"blueMotion":/,
	/\{[\s\S]*"redMotion":/,
	/"letter":\s*"[A-Z]"/,
	/```json/,
]

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface TikaApiResponse {
	success: boolean
	response?: string
	error?: string
	toolCalls?: Array<{
		name: string
		input: Record<string, unknown>
	}>
	images?: Array<{
		type: string
		data: string
	}>
}

interface ValidationResult {
	scenarioId: string
	question: string
	passed: boolean
	checks: {
		toolCalled: { passed: boolean; details: string }
		hasPictograph: { passed: boolean; details: string }
		wordCount: { passed: boolean; count: number; limit: number }
		noJsonDump: { passed: boolean; details: string }
	}
	response?: string
	error?: string
}

interface ValidationSummary {
	total: number
	passed: number
	failed: number
	errors: number
	failedScenarios: ValidationResult[]
	errorScenarios: ValidationResult[]
}

// ═══════════════════════════════════════════════════════════════════════════
// API Client
// ═══════════════════════════════════════════════════════════════════════════

async function callTikaApi(question: string): Promise<TikaApiResponse> {
	try {
		const response = await fetch(TIKA_API_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				question: question,
				completedConcepts: [],
				language: 'en',
			}),
		})

		if (!response.ok) {
			// Try to get error body for more context
			let errorBody = ''
			try {
				errorBody = await response.text()
			} catch {
				// Ignore if we can't read body
			}
			return {
				success: false,
				error: `HTTP ${response.status}: ${response.statusText}${errorBody ? ` - ${errorBody.slice(0, 200)}` : ''}`,
			}
		}

		// The API uses Server-Sent Events (SSE) format
		// Parse the streaming response to extract text and tool calls
		const text = await response.text()

		// Parse SSE format: lines like "data: {...}"
		const lines = text.split('\n').filter((line) => line.startsWith('data: '))

		let responseText = ''
		const toolCalls: Array<{ name: string; input: Record<string, unknown> }> = []
		const images: Array<{ type: string; data: string }> = []

		for (const line of lines) {
			const jsonStr = line.slice(6) // Remove "data: " prefix
			if (jsonStr === '[DONE]') continue

			try {
				const event = JSON.parse(jsonStr)

				// Check for API errors (like credit exhaustion)
				if (event.type === 'error') {
					return {
						success: false,
						error: event.errorText || 'Unknown API error',
					}
				}

				switch (event.type) {
					case 'text-delta':
						// Text content being streamed
						if (event.textDelta) {
							responseText += event.textDelta
						}
						break
					case 'tool-input-available':
						// Tool was called
						if (event.toolName) {
							toolCalls.push({
								name: event.toolName,
								input: event.input || {},
							})
						}
						break
					case 'tool-output-available':
						// Tool result - check for inline pictographs
						const output = event.output
						if (output) {
							if (output.inlinePictograph) {
								images.push({
									type: 'inline-pictograph',
									data: JSON.stringify(output.inlinePictograph),
								})
							}
							if (output.inlineGallery) {
								images.push({
									type: 'inline-gallery',
									data: JSON.stringify(output.inlineGallery),
								})
							}
							if (output.contextData?.examples) {
								images.push({
									type: 'position-examples',
									data: JSON.stringify(output.contextData.examples),
								})
							}
							if (output.examples) {
								images.push({
									type: 'examples',
									data: JSON.stringify(output.examples),
								})
							}
						}
						break
				}
			} catch {
				// Skip malformed lines
			}
		}

		return {
			success: true,
			response: responseText,
			toolCalls,
			images,
		}
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
		}
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// Validators
// ═══════════════════════════════════════════════════════════════════════════

function checkToolCalled(apiResponse: TikaApiResponse): { passed: boolean; details: string } {
	if (!apiResponse.success) {
		return { passed: false, details: 'API call failed' }
	}

	const toolCalls = apiResponse.toolCalls || []
	if (toolCalls.length > 0) {
		const toolNames = toolCalls.map((t) => t.name).join(', ')
		return { passed: true, details: `Called: ${toolNames}` }
	}

	// Check if response mentions tool usage (sometimes tools are called but not reported separately)
	const response = apiResponse.response || ''
	if (response.includes('[Pictograph]') || response.includes('pictograph')) {
		return { passed: true, details: 'Pictograph mentioned in response' }
	}

	return { passed: false, details: 'No tools called' }
}

function checkHasPictograph(apiResponse: TikaApiResponse): { passed: boolean; details: string } {
	if (!apiResponse.success) {
		return { passed: false, details: 'API call failed' }
	}

	const images = apiResponse.images || []
	if (images.length > 0) {
		return { passed: true, details: `${images.length} image(s) included` }
	}

	// Check response text for pictograph indicators
	const response = apiResponse.response || ''
	if (
		response.includes('![') || // Markdown image
		response.includes('[Pictograph') ||
		response.includes('data:image')
	) {
		return { passed: true, details: 'Image reference found in response' }
	}

	return { passed: false, details: 'No pictograph found' }
}

function checkWordCount(
	apiResponse: TikaApiResponse,
	limit: number
): { passed: boolean; count: number; limit: number } {
	if (!apiResponse.success) {
		return { passed: false, count: 0, limit }
	}

	const response = apiResponse.response || ''

	// Strip markdown images and code blocks for word count
	const textOnly = response
		.replace(/!\[.*?\]\(.*?\)/g, '') // Remove markdown images
		.replace(/```[\s\S]*?```/g, '') // Remove code blocks
		.replace(/\[Pictograph.*?\]/g, '') // Remove pictograph placeholders
		.trim()

	const words = textOnly.split(/\s+/).filter((w) => w.length > 0)
	const count = words.length

	return {
		passed: count <= limit,
		count,
		limit,
	}
}

function checkNoJsonDump(apiResponse: TikaApiResponse): { passed: boolean; details: string } {
	if (!apiResponse.success) {
		return { passed: true, details: 'N/A - API failed' }
	}

	const response = apiResponse.response || ''

	for (const pattern of JSON_DUMP_PATTERNS) {
		if (pattern.test(response)) {
			return { passed: false, details: `Found JSON pattern: ${pattern.source.slice(0, 30)}...` }
		}
	}

	return { passed: true, details: 'No JSON dump detected' }
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Validator
// ═══════════════════════════════════════════════════════════════════════════

async function validateScenario(scenario: TikaScenario): Promise<ValidationResult> {
	const question = scenario.question.en

	console.log(`  Testing: "${question.slice(0, 50)}${question.length > 50 ? '...' : ''}"`)

	const apiResponse = await callTikaApi(question)

	if (!apiResponse.success) {
		return {
			scenarioId: scenario.id,
			question,
			passed: false,
			checks: {
				toolCalled: { passed: false, details: 'API failed' },
				hasPictograph: { passed: false, details: 'API failed' },
				wordCount: { passed: false, count: 0, limit: MAX_WORD_COUNT_BEGINNER },
				noJsonDump: { passed: true, details: 'N/A' },
			},
			error: apiResponse.error,
		}
	}

	const toolCheck = checkToolCalled(apiResponse)
	const pictographCheck = checkHasPictograph(apiResponse)
	const wordCountCheck = checkWordCount(apiResponse, MAX_WORD_COUNT_BEGINNER)
	const jsonDumpCheck = checkNoJsonDump(apiResponse)

	const passed =
		toolCheck.passed && pictographCheck.passed && wordCountCheck.passed && jsonDumpCheck.passed

	const status = passed ? '✓' : '✗'
	console.log(`    ${status} Tool: ${toolCheck.passed ? '✓' : '✗'} | Pic: ${pictographCheck.passed ? '✓' : '✗'} | Words: ${wordCountCheck.count}/${wordCountCheck.limit} | JSON: ${jsonDumpCheck.passed ? '✓' : '✗'}`)

	return {
		scenarioId: scenario.id,
		question,
		passed,
		checks: {
			toolCalled: toolCheck,
			hasPictograph: pictographCheck,
			wordCount: wordCountCheck,
			noJsonDump: jsonDumpCheck,
		},
		response: apiResponse.response?.slice(0, 500),
	}
}

async function runValidation(
	scenarios: TikaScenario[],
	options: { stopOnFailure?: number; delayMs?: number } = {}
): Promise<ValidationSummary> {
	const { stopOnFailure = 0, delayMs = 500 } = options

	const results: ValidationResult[] = []
	let consecutiveFailures = 0

	for (const scenario of scenarios) {
		const result = await validateScenario(scenario)
		results.push(result)

		if (!result.passed && !result.error) {
			consecutiveFailures++
			if (stopOnFailure > 0 && consecutiveFailures >= stopOnFailure) {
				console.log(`\n⚠️  Stopping: ${stopOnFailure} consecutive failures`)
				break
			}
		} else if (result.passed) {
			consecutiveFailures = 0
		}

		// Rate limiting
		if (delayMs > 0) {
			await new Promise((resolve) => setTimeout(resolve, delayMs))
		}
	}

	const passed = results.filter((r) => r.passed).length
	const errors = results.filter((r) => r.error).length
	const failed = results.filter((r) => !r.passed && !r.error).length

	return {
		total: results.length,
		passed,
		failed,
		errors,
		failedScenarios: results.filter((r) => !r.passed && !r.error),
		errorScenarios: results.filter((r) => r.error),
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════════

function printUsage() {
	console.log(`
TIKA Structural Validator
═════════════════════════

Usage:
  npx tsx scripts/tika-validator.ts [options]

Options:
  --category <name>   Run specific category only
                      Available: ${Object.keys(beginnerScenariosByCategory).join(', ')}
  --limit <n>         Run only first N scenarios
  --stop-on <n>       Stop after N consecutive failures
  --delay <ms>        Delay between API calls (default: 500ms)
  --dry-run           Show scenarios without running
  --help              Show this help

Examples:
  npx tsx scripts/tika-validator.ts --category position-alpha
  npx tsx scripts/tika-validator.ts --limit 10 --stop-on 3
  npx tsx scripts/tika-validator.ts --dry-run
`)
}

function printSummary(summary: ValidationSummary) {
	console.log(`
═══════════════════════════════════════════════════════════════════════════════
                              VALIDATION SUMMARY
═══════════════════════════════════════════════════════════════════════════════

  Total:  ${summary.total}
  Passed: ${summary.passed} (${((summary.passed / summary.total) * 100).toFixed(1)}%)
  Failed: ${summary.failed}
  Errors: ${summary.errors}

`)

	if (summary.failedScenarios.length > 0) {
		console.log('FAILURES:')
		console.log('─────────────────────────────────────────────────────────────────────────────')
		for (const failure of summary.failedScenarios.slice(0, 10)) {
			console.log(`
  ${failure.scenarioId}
  Q: "${failure.question}"
  ├─ Tool: ${failure.checks.toolCalled.passed ? '✓' : '✗'} ${failure.checks.toolCalled.details}
  ├─ Pic:  ${failure.checks.hasPictograph.passed ? '✓' : '✗'} ${failure.checks.hasPictograph.details}
  ├─ Words: ${failure.checks.wordCount.count}/${failure.checks.wordCount.limit} ${failure.checks.wordCount.passed ? '✓' : '✗'}
  └─ JSON: ${failure.checks.noJsonDump.passed ? '✓' : '✗'} ${failure.checks.noJsonDump.details}
`)
		}
		if (summary.failedScenarios.length > 10) {
			console.log(`  ... and ${summary.failedScenarios.length - 10} more failures`)
		}
	}

	if (summary.errorScenarios.length > 0) {
		console.log('\nERRORS:')
		console.log('─────────────────────────────────────────────────────────────────────────────')
		for (const error of summary.errorScenarios.slice(0, 5)) {
			console.log(`  ${error.scenarioId}: ${error.error}`)
		}
	}
}

async function main() {
	const args = process.argv.slice(2)

	if (args.includes('--help')) {
		printUsage()
		process.exit(0)
	}

	// Parse arguments
	let scenarios = beginnerScenarios
	let limit = 0
	let stopOn = 0
	let delay = 500
	let dryRun = false
	let categoryName = ''

	for (let i = 0; i < args.length; i++) {
		switch (args[i]) {
			case '--category':
				categoryName = args[++i]
				const category = beginnerScenariosByCategory[categoryName as keyof typeof beginnerScenariosByCategory]
				if (!category) {
					console.error(`Unknown category: ${categoryName}`)
					console.error(`Available: ${Object.keys(beginnerScenariosByCategory).join(', ')}`)
					process.exit(1)
				}
				scenarios = category
				break
			case '--limit':
				limit = parseInt(args[++i], 10)
				break
			case '--stop-on':
				stopOn = parseInt(args[++i], 10)
				break
			case '--delay':
				delay = parseInt(args[++i], 10)
				break
			case '--dry-run':
				dryRun = true
				break
		}
	}

	if (limit > 0) {
		scenarios = scenarios.slice(0, limit)
	}

	console.log(`
═══════════════════════════════════════════════════════════════════════════════
                         TIKA STRUCTURAL VALIDATOR
═══════════════════════════════════════════════════════════════════════════════

  Scenarios: ${scenarios.length}${categoryName ? ` (category: ${categoryName})` : ''}
  API: ${TIKA_API_URL}
  Word limit: ${MAX_WORD_COUNT_BEGINNER}
  Delay: ${delay}ms
${stopOn > 0 ? `  Stop after: ${stopOn} consecutive failures` : ''}
`)

	if (dryRun) {
		console.log('DRY RUN - Scenarios that would be tested:')
		console.log('─────────────────────────────────────────────────────────────────────────────')
		for (const scenario of scenarios) {
			console.log(`  ${scenario.id}: "${scenario.question.en}"`)
		}
		process.exit(0)
	}

	// Check if server is running
	try {
		const healthCheck = await fetch('http://localhost:5173', { method: 'HEAD' })
		if (!healthCheck.ok) {
			throw new Error('Server not responding')
		}
	} catch {
		console.error('ERROR: Dev server not running at localhost:5173')
		console.error('Please start the dev server first: npm run dev')
		process.exit(1)
	}

	console.log('Running validation...\n')

	const summary = await runValidation(scenarios, { stopOnFailure: stopOn, delayMs: delay })

	printSummary(summary)

	// Exit code based on results
	if (summary.failed > 0 || summary.errors > 0) {
		process.exit(1)
	}
}

main().catch((error) => {
	console.error('Fatal error:', error)
	process.exit(1)
})
