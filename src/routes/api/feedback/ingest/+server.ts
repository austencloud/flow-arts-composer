/**
 * Agent Feedback Ingest Endpoint
 *
 * POST /api/feedback/ingest
 *   Header: x-api-key: <SECRET>
 *   Body JSON: { title, description, type?, priority?, module?, tab?, agent? }
 *
 * Allows LLM agents and external tools to submit feedback.
 * Auth is via a shared secret in the `x-api-key` header (not query params,
 * which leak to logs, CDN, and Referer headers).
 */

import type { RequestHandler } from "@sveltejs/kit";

import * as env from "$app/env/private";
import { getAdminDb } from "#lib/server/firebaseAdmin.js";
import admin from "firebase-admin";
import { RATE_LIMITS } from "#lib/server/security/rate-limiter.js";
import { withRateLimit } from "#lib/server/security/withRateLimit.js";
import {
	isFeedbackType,
	type FeedbackType,
	type FeedbackPriority,
} from "#lib/shared/feedback/domain/models/feedback-models.js";

const COLLECTION = "feedback";
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_FIELD_LENGTH = 60;

const VALID_PRIORITIES = ["low", "medium", "high", "critical"] as const;

const AGENT_USER = {
	userId: "agent-ingest",
	userEmail: "agent@thekineticalphabetapp.com",
	userDisplayName: "Agent",
};


/** Strip HTML tags and trim whitespace */
function sanitize(input: string, maxLength: number): string {
	return input
		.replace(/<[^>]*>/g, "")
		.trim()
		.slice(0, maxLength);
}

function isValidPriority(value: string): value is FeedbackPriority {
	return (VALID_PRIORITIES as readonly string[]).includes(value);
}

// ── Tombstone: old GET endpoint ─────────────────────────────────────

/** @deprecated Migrated to POST with x-api-key header. */
export const GET: RequestHandler = async () => {
	return Response.json(
		{
			ok: false,
			error:
				"This endpoint has been migrated from GET to POST. " +
				"Send a POST request with the API key in the x-api-key header " +
				"and parameters in the JSON request body.",
		},
		{ status: 410 },
	);
};


export const POST: RequestHandler = async (event) => {
	// 1. Auth: validate API key from header (not query params)
	const FEEDBACK_INGEST_KEY = env.FEEDBACK_INGEST_KEY;
	if (!FEEDBACK_INGEST_KEY) {
		return Response.json(
			{ ok: false, error: "Ingest endpoint not configured" },
			{ status: 500 },
		);
	}

	const apiKey = event.request.headers.get("x-api-key");
	if (!apiKey || apiKey !== FEEDBACK_INGEST_KEY) {
		return Response.json(
			{ ok: false, error: "Invalid or missing API key" },
			{ status: 401 },
		);
	}

	// 2. Rate limit by IP
	const blocked = await withRateLimit(event, RATE_LIMITS.FEEDBACK_INGEST, "ip");
	if (blocked) return blocked;

	// 3. Parse and validate body
	let body: Record<string, unknown>;
	try {
		body = (await event.request.json()) as Record<string, unknown>;
	} catch {
		return Response.json(
			{ ok: false, error: "Invalid JSON body" },
			{ status: 400 },
		);
	}

	const rawTitle = typeof body.title === "string" ? body.title : null;
	const rawDescription =
		typeof body.description === "string" ? body.description : null;
	const rawType =
		typeof body.type === "string" ? body.type : "general";
	const rawPriority =
		typeof body.priority === "string" ? body.priority : "medium";
	const rawModule =
		typeof body.module === "string" ? body.module : "system";
	const rawTab =
		typeof body.tab === "string" ? body.tab : "general";
	const rawAgent =
		typeof body.agent === "string" ? body.agent : "claude-chat";

	if (!rawTitle) {
		return Response.json(
			{ ok: false, error: "Missing required field: title" },
			{ status: 400 },
		);
	}

	if (!rawDescription) {
		return Response.json(
			{ ok: false, error: "Missing required field: description" },
			{ status: 400 },
		);
	}

	const title = sanitize(rawTitle, MAX_TITLE_LENGTH);
	const description = sanitize(rawDescription, MAX_DESCRIPTION_LENGTH);

	if (!title) {
		return Response.json(
			{ ok: false, error: "Title is empty after sanitization" },
			{ status: 400 },
		);
	}

	if (!description) {
		return Response.json(
			{ ok: false, error: "Description is empty after sanitization" },
			{ status: 400 },
		);
	}

	const type: FeedbackType = isFeedbackType(rawType) ? rawType : "general";
	const priority: FeedbackPriority = isValidPriority(rawPriority)
		? rawPriority
		: "medium";
	const capturedModule = sanitize(rawModule, MAX_FIELD_LENGTH) || "system";
	const capturedTab = sanitize(rawTab, MAX_FIELD_LENGTH) || "general";
	const sourceAgent = sanitize(rawAgent, MAX_FIELD_LENGTH) || "claude-chat";

	// 4. Write to Firestore
	try {
		const db = getAdminDb();
		const now = admin.firestore.Timestamp.now();

		const docData = {
			createdAt: now,
			updatedAt: null,
			userId: AGENT_USER.userId,
			userEmail: AGENT_USER.userEmail,
			userDisplayName: AGENT_USER.userDisplayName,
			type,
			title,
			description,
			originalTitle: title,
			originalDescription: description,
			priority,
			capturedModule,
			capturedTab,
			source: "agent" as const,
			sourceAgent,
			status: "new" as const,
			isDeleted: false,
			statusHistory: [
				{
					status: "new",
					timestamp: now,
					actorId: "system",
					actorName: `Agent (${sourceAgent})`,
					notes: `Submitted via ingest endpoint by ${sourceAgent}`,
				},
			],
		};

		const docRef = await db.collection(COLLECTION).add(docData);

		return Response.json({ ok: true, id: docRef.id, title }, { status: 201 });
	} catch (err) {
		console.error("[feedback-ingest] Firestore write failed:", err);
		return Response.json(
			{ ok: false, error: "Internal server error" },
			{ status: 500 },
		);
	}
};
