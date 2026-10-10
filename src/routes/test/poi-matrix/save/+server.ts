/**
 * Dev-only persistence for the poi-legality curation page: writes the
 * verdict JSON back to the committed data file so a curation session lands
 * as ordinary working-tree changes. 404s outside `vite dev`.
 */

import { dev } from "$app/env";
import { error } from "@sveltejs/kit";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { RequestHandler } from "./$types";

const DATA_FILE = fileURLToPath(
	new URL("../../../../lib/features/levels/poi-lab/data/poi-legal-matrix.json", import.meta.url)
);

export const POST: RequestHandler = async ({ request }) => {
	if (!dev) error(404);

	const body = (await request.json()) as { version?: number; verdicts?: Record<string, string> };
	if (body?.version !== 1 || typeof body.verdicts !== "object" || body.verdicts === null) {
		error(400, "expected { version: 1, verdicts: {} }");
	}
	const allowed = new Set(["legal", "illegal", "unsure"]);
	for (const [key, verdict] of Object.entries(body.verdicts)) {
		if (!allowed.has(verdict)) error(400, `invalid verdict "${verdict}" for ${key}`);
	}

	try {
		await writeFile(DATA_FILE, JSON.stringify(body, null, "\t") + "\n", "utf8");
	} catch (cause) {
		error(500, cause instanceof Error ? cause.message : String(cause));
	}
	return Response.json({ ok: true, count: Object.keys(body.verdicts).length });
};
