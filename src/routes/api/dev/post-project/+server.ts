import { error, type RequestHandler } from "@sveltejs/kit";
import { authorizeLoopback, readJsonBody } from "#lib/server/dev-loopback.js";
import { featureVideos } from "#lib/server/feature-video-store.js";
import {
  heartbeatPostProject,
  listPostProjectSessions,
  postProjectEditStatus,
  postProjectRenderStatus,
  queuePostProjectEdit,
  queuePostProjectOps,
  queuePostProjectRender,
  readPostProjectSession,
  readRenderReport,
} from "#lib/server/post-project-dev-bridge.js";

export const GET: RequestHandler = ({ request, url, getClientAddress }) => {
  authorizeLoopback(request, getClientAddress);
  const sessionId = url.searchParams.get("sessionId");
  const commandId = url.searchParams.get("commandId");
  const renderId = url.searchParams.get("renderId");
  if (sessionId && renderId) {
    const status = postProjectRenderStatus(sessionId, renderId);
    if (!status) error(404, "Render not found");
    return Response.json(status);
  }
  if (sessionId && commandId) {
    const status = postProjectEditStatus(sessionId, commandId);
    if (!status) error(404, "Edit not found");
    return Response.json(status);
  }
  if (sessionId) {
    const session = readPostProjectSession(sessionId);
    if (!session) error(404, "Editor session not found");
    return Response.json(session);
  }
  return Response.json({ sessions: listPostProjectSessions() });
};

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  authorizeLoopback(request, getClientAddress);
  const input = await readJsonBody(request);
  try {
    if (input.kind === "heartbeat") {
      if (
        typeof input.sessionId !== "string" ||
        typeof input.revision !== "number" ||
        (input.featureSlug !== undefined &&
          typeof input.featureSlug !== "string")
      )
        error(400, "Invalid heartbeat");
      const featureSlug =
        typeof input.featureSlug === "string" ? input.featureSlug : undefined;
      const render = readRenderReport(input.render);
      const answer = heartbeatPostProject({
        sessionId: input.sessionId,
        revision: input.revision,
        ...(featureSlug ? { featureSlug } : {}),
        ...(input.snapshot !== undefined ? { snapshot: input.snapshot } : {}),
        ...(render ? { render } : {}),
        ...(input.result && typeof input.result === "object"
          ? {
              result: input.result as {
                commandId: string;
                status: "completed" | "failed";
                message: string;
              },
            }
          : {}),
      });
      if (!featureSlug) return Response.json(answer);
      // The editor compares this with the revision it last saved or loaded.
      const featureRevision = await featureVideos()
        .revision(featureSlug)
        .catch(() => null);
      return Response.json({ ...answer, featureRevision });
    }
    if (input.kind === "apply") {
      if (
        typeof input.sessionId !== "string" ||
        typeof input.baseRevision !== "number" ||
        typeof input.baseFingerprint !== "string"
      )
        error(400, "Invalid edit request");
      return Response.json(
        await queuePostProjectEdit({
          sessionId: input.sessionId,
          baseRevision: input.baseRevision,
          baseFingerprint: input.baseFingerprint,
          project: input.project,
        })
      );
    }
    if (input.kind === "render") {
      if (
        typeof input.sessionId !== "string" ||
        (input.name !== undefined && typeof input.name !== "string")
      )
        error(400, "Invalid render request");
      return Response.json(
        queuePostProjectRender({
          sessionId: input.sessionId,
          ...(typeof input.name === "string" ? { name: input.name } : {}),
        })
      );
    }
    if (input.kind === "ops") {
      if (typeof input.sessionId !== "string" || !Array.isArray(input.ops))
        error(400, "Invalid edit request");
      return Response.json(
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
