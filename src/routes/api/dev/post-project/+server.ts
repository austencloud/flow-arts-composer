import { error, json, type RequestHandler } from "@sveltejs/kit";
import { authorizeLoopback, readJsonBody } from "$lib/server/dev-loopback";
import {
  heartbeatPostProject,
  listPostProjectSessions,
  postProjectEditStatus,
  queuePostProjectEdit,
  queuePostProjectOps,
  readPostProjectSession,
} from "$lib/server/post-project-dev-bridge";

export const GET: RequestHandler = ({ request, url, getClientAddress }) => {
  authorizeLoopback(request, getClientAddress);
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
  authorizeLoopback(request, getClientAddress);
  const input = await readJsonBody(request);
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
