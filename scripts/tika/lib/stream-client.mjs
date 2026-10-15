/**
 * Stream Client for TIKA API
 *
 * Posts one question to /api/tika/ask and reads the answer back from the
 * AI SDK UI message stream (`result.toUIMessageStreamResponse()` on the
 * server): Server-Sent Events, one `data: {json}` chunk per event, ending
 * with `data: [DONE]`.
 *
 * The endpoint requires a signed-in Firebase user. Set TIKA_ID_TOKEN to a
 * Firebase ID token (see docs/reference/tika-testing.md). TIKA_BASE_URL
 * overrides the default dev server origin.
 */

import {
	getToolOrDynamicToolName,
	isTextUIPart,
	isToolOrDynamicToolUIPart,
	parseJsonEventStream,
	readUIMessageStream,
	uiMessageChunkSchema
} from 'ai';

export const DEFAULT_TIKA_BASE_URL = 'https://localhost:5173';

/** The sign-in check failed: every later request would fail the same way. */
export class TikaAuthError extends Error {
	constructor(message) {
		super(message);
		this.name = 'TikaAuthError';
	}
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function resolveTikaEndpoint(env = process.env) {
	return new URL('/api/tika/ask', env.TIKA_BASE_URL || DEFAULT_TIKA_BASE_URL).href;
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function requireTikaIdToken(env = process.env) {
	const token = env.TIKA_ID_TOKEN?.trim();
	if (!token) {
		throw new TikaAuthError(
			'TIKA_ID_TOKEN is not set. /api/tika/ask needs a Firebase ID token; see docs/reference/tika-testing.md.'
		);
	}
	return token.replace(/^Bearer\s+/i, '');
}

/**
 * Call TIKA streaming endpoint and parse the response
 *
 * @param {string} question - The user's question
 * @param {number} userLevel - User's knowledge level (1-4)
 * @param {string[]} completedConcepts - List of completed concept IDs
 * @param {{ env?: Record<string, string | undefined> }} [options]
 * @returns {Promise<{explanation: string, toolsCalled: Array, latencyMs: number, finishReason: string | null, streamErrors: string[]}>}
 */
export async function callTikaStreaming(question, userLevel, completedConcepts = [], options = {}) {
	const env = options.env ?? process.env;
	const token = requireTikaIdToken(env);
	const startTime = Date.now();

	const response = await fetch(resolveTikaEndpoint(env), {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		},
		body: JSON.stringify({
			messages: [
				{
					id: crypto.randomUUID(),
					role: 'user',
					parts: [{ type: 'text', text: question }]
				}
			],
			completedConcepts: completedConcepts,
			language: 'en'
		})
	});

	if (!response.ok) {
		const errorText = await response.text();
		// The route answers 401 now; servers older than 2026-10-15 send 500, so match the message too.
		if (response.status === 401 || /Bearer token|ID token expired|Invalid or expired token/.test(errorText)) {
			throw new TikaAuthError(`Sign-in rejected (${response.status}): ${errorText}`);
		}
		throw new Error(`API error: ${response.status} - ${errorText}`);
	}

	const parsed = await readTikaStream(response.body);
	if (parsed.errors.length > 0 && !parsed.fullText) {
		throw new Error(`Stream error: ${parsed.errors.join('; ')}`);
	}

	return {
		explanation: parsed.fullText,
		toolsCalled: parsed.toolCalls,
		latencyMs: Date.now() - startTime,
		finishReason: parsed.finishReason,
		streamErrors: parsed.errors
	};
}

/**
 * Read an AI SDK UI message stream into the answer text and tool calls.
 *
 * Uses the installed `ai` package's own readers, the same path its Chat
 * transport takes: parseJsonEventStream decodes the SSE `data:` chunks against
 * uiMessageChunkSchema, and readUIMessageStream assembles them into the final
 * assistant UIMessage. Text parts are joined with a blank line; tool parts
 * become {id, name, input, result, error}.
 *
 * @param {ReadableStream<Uint8Array>} stream - Response body
 * @returns {Promise<{fullText: string, toolCalls: Array<{id: string, name: string, input: unknown, result: unknown, error: string | null}>, errors: string[], finishReason: string | null}>}
 */
export async function readTikaStream(stream) {
	const errors = [];
	let finishReason = null;

	const chunks = parseJsonEventStream({ stream, schema: uiMessageChunkSchema }).pipeThrough(
		new TransformStream({
			transform(result, controller) {
				if (!result.success) {
					errors.push(`Unreadable stream chunk: ${result.error.message}`);
					return;
				}
				if (result.value.type === 'finish') finishReason = result.value.finishReason ?? null;
				controller.enqueue(result.value);
			}
		})
	);

	let message;
	for await (const snapshot of readUIMessageStream({
		stream: chunks,
		onError: (error) => errors.push(error instanceof Error ? error.message : String(error))
	})) {
		message = snapshot;
	}

	const parts = message?.parts ?? [];
	const fullText = parts
		.filter(isTextUIPart)
		.map((part) => part.text.trim())
		.filter(Boolean)
		.join('\n\n');
	const toolCalls = parts.filter(isToolOrDynamicToolUIPart).map((part) => ({
		id: part.toolCallId,
		name: getToolOrDynamicToolName(part),
		input: part.input ?? null,
		result: part.state === 'output-available' ? part.output : null,
		error: part.errorText ?? (part.state === 'output-denied' ? 'denied' : null)
	}));

	return { fullText, toolCalls, errors, finishReason };
}

/**
 * Get the completed concepts for a given user level
 * Used to simulate a user at that knowledge level
 *
 * @param {number} level - User level (1-4)
 * @returns {string[]} - Array of completed concept IDs
 */
export function getLevelConcepts(level) {
	const concepts = {
		1: ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8'],
		2: ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8', '2.1', '2.2', '2.3'],
		3: [
			'1.1',
			'1.2',
			'1.3',
			'1.4',
			'1.5',
			'1.6',
			'1.7',
			'1.8',
			'2.1',
			'2.2',
			'2.3',
			'3.1',
			'3.2',
			'3.3'
		],
		4: [
			'1.1',
			'1.2',
			'1.3',
			'1.4',
			'1.5',
			'1.6',
			'1.7',
			'1.8',
			'2.1',
			'2.2',
			'2.3',
			'3.1',
			'3.2',
			'3.3',
			'4.1',
			'4.2',
			'4.3',
			'4.4',
			'4.5'
		]
	};
	return concepts[level] || concepts[1];
}
