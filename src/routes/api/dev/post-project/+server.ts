import { dev } from "$app/environment";
import { error, json, type RequestHandler } from "@sveltejs/kit";
import {
  heartbeatPostProject,
  listPostProjectSessions,
  postProjectEditStatus,
  queuePostProjectEdit,
  queuePostProjectOps,
  readPostProjectSession,
} from "$lib/server/post-project-dev-bridge";

function authorize(request: Request, getClientAddress: () => string) {
  if (!dev) error(404, "Not found");
  const url = new URL(request.url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    error(403, "Local editor only");
  const remote = getClientAddress();
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote))
    error(403, "Local editor only");
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) error(403, "Forbidden origin");
  if (request.method !== "GET" && origin !== url.origin)
    error(403, "Origin required");
}

export const GET: RequestHandler = ({ request, url, getClientAddress }) => {
  authorize(request, getClientAddress);
  const sessionId = url.searchParams.get("sessionId");
  const commandId = url.searchParams.get("commandId");
  if (sessionId && commandId) {
    const status = postProjectEditStatus(sessionId, commandId);
    if (!status) error(404, "Edit not found");
    return json(status);
  }
  if (sessionId) {
    const session = readPostProjectSession(sessionId);
    if (!session) error(404, "Editor session not found");
    return json(session);
  }
  return json({ sessions: listPostProjectSessions() });
};

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  authorize(request, getClientAddress);
  if (Number(request.headers.get("content-length") ?? 0) > 12_000_000)
    error(413, "Manifest too large");
  const reader = request.body?.getReader();
  if (!reader) error(400, "Missing request body");
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 12_000_000) {
        void reader.cancel();
        error(413, "Manifest too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  let input: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    input = parsed as Record<string, unknown>;
  } catch {
    error(400, "Invalid JSON");
  }
  try {
    if (input.kind === "heartbeat") {
      if (
        typeof input.sessionId !== "string" ||
        typeof input.revision !== "number"
      )
        error(400, "Invalid heartbeat");
      return json(
        heartbeatPostProject({
          sessionId: input.sessionId,
          revision: input.revision,
          ...(input.snapshot !== undefined ? { snapshot: input.snapshot } : {}),
          ...(input.result && typeof input.result === "object"
            ? {
                result: input.result as {
                  commandId: string;
                  status: "completed" | "failed";
                  message: string;
                },
              }
            : {}),
        })
      );
    }
    if (input.kind === "apply") {
      if (
        typeof input.sessionId !== "string" ||
        typeof input.baseRevision !== "number" ||
        typeof input.baseFingerprint !== "string"
      )
        error(400, "Invalid edit request");
      return json(
        await queuePostProjectEdit({
          sessionId: input.sessionId,
          baseRevision: input.baseRevision,
          baseFingerprint: input.baseFingerprint,
          project: input.project,
        })
      );
    }
    if (input.kind === "ops") {
      if (typeof input.sessionId !== "string" || !Array.isArray(input.ops))
        error(400, "Invalid edit request");
      return json(
        await queuePostProjectOps({
          sessionId: input.sessionId,
          ops: input.ops,
        })
      );
    }
    error(400, "Unknown request");
  } catch (cause) {
    if (cause && typeof cause === "object" && "status" in cause) throw cause;
    error(409, cause instanceof Error ? cause.message : "Manifest edit failed");
  }
};
