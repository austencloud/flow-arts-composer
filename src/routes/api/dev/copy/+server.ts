/**
 * Dev-only endpoint: saves a page's edited strings to its copy.json, so Vite
 * hot-reloads the import and the source of truth stays the file in the repo.
 * It only rewrites a copy.json that already exists; it never creates one.
 */
import type { RequestHandler } from "@sveltejs/kit";
import { dev } from "$app/env";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isEditableCopyPath } from "#lib/shared/copy-edit/copy-path.js";

const fail = (status: number, error: string) =>
  Response.json({ error }, { status });

function isFlatStrings(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

export const POST: RequestHandler = async ({ request }) => {
  if (!dev) return fail(403, "This endpoint is only available in development");

  // A foreign page can send text/plain without a preflight, but not JSON.
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return fail(415, "Send JSON");
  }

  const body = (await request.json().catch(() => null)) as {
    file?: unknown;
    copy?: unknown;
  } | null;
  const file = body?.file;
  const copy = body?.copy;
  if (!isEditableCopyPath(file)) {
    return fail(400, "Not an editable copy.json path");
  }
  if (!isFlatStrings(copy)) {
    return fail(400, "Copy must be a flat object of strings");
  }

  const target = resolve(process.cwd(), file);
  if (!existsSync(target)) return fail(404, `${file} does not exist`);

  // Written beside the target and renamed, so Vite never reads half a file.
  const temp = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, `${JSON.stringify(copy, null, 2)}\n`, "utf-8");
    await rename(temp, target);
  } catch (caught) {
    await rm(temp, { force: true });
    return fail(500, caught instanceof Error ? caught.message : "Write failed");
  }
  return Response.json({ ok: true });
};
