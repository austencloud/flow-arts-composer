import type { RequestHandler } from "./$types";
import { requireFullFirebaseUser } from "#lib/server/auth/requireFullFirebaseUser.js";
import {
  FirestoreRestError,
  getFirestoreRest,
  readFirestoreString,
  toFirestoreFields,
  type FirestoreWrite,
} from "#lib/server/firestore/firestore-rest.js";
import { RATE_LIMITS } from "#lib/server/security/rate-limiter.js";
import { withRateLimit } from "#lib/server/security/withRateLimit.js";
import { validatePhysicalCardCompletionRequest } from "#lib/shared/qr/domain/physical-card.js";
import { workerEnv } from "#lib/server/cloudflare/worker-env.js";

function updateRunWrite(
  name: string,
  data: Record<string, unknown>,
  updateTime: string
): FirestoreWrite {
  return {
    update: {
      name,
      fields: toFirestoreFields(data),
    },
    updateMask: { fieldPaths: Object.keys(data) },
    currentDocument: { updateTime },
  };
}

function isPreconditionConflict(error: unknown): boolean {
  return (
    error instanceof FirestoreRestError &&
    (error.status === 409 || error.responseBody.includes("FAILED_PRECONDITION"))
  );
}

function responseForError(error: unknown): Response {
  const status =
    typeof error === "object" &&
    error &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : 500;
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : status === 500
        ? "completion_failed"
        : "request_rejected";
  const message =
    status < 500 && error instanceof Error
      ? error.message
      : "Could not finalize the print run";

  if (status >= 500) {
    console.error("[physical-card-complete] failed:", error);
  }
  return Response.json({ error: message, code }, { status });
}

export const POST: RequestHandler = async (event) => {
  try {
    const caller = await requireFullFirebaseUser(event);
    const blocked = await withRateLimit(
      event,
      RATE_LIMITS.CARD_ISSUE,
      "user",
      caller.uid
    );
    if (blocked) return blocked;

    let rawBody: unknown;
    try {
      rawBody = await event.request.json();
    } catch {
      return Response.json(
        { error: "Invalid JSON body", code: "invalid_json" },
        { status: 400 }
      );
    }
    const validation = validatePhysicalCardCompletionRequest(rawBody);
    if (!validation.ok) {
      return Response.json(
        { error: validation.error, code: "invalid_request" },
        { status: 400 }
      );
    }
    const request = validation.value;

    const firestore = getFirestoreRest(
      workerEnv()?.FIREBASE_SERVICE_ACCOUNT_JSON
    );
    const path = `cardPrintRuns/${request.printRunId}`;
    const run = await firestore.getDocument(path, [
      "status",
      "allocatedByUserId",
    ]);
    if (!run) {
      return Response.json(
        { error: "Print run not found", code: "print_run_not_found" },
        { status: 404 }
      );
    }
    if (readFirestoreString(run, "allocatedByUserId") !== caller.uid) {
      return Response.json(
        { error: "Print run belongs to another account", code: "forbidden" },
        { status: 403 }
      );
    }

    const currentStatus = readFirestoreString(run, "status");
    if (currentStatus === request.result) {
      return Response.json({ status: currentStatus, unchanged: true });
    }
    if (currentStatus !== "allocated") {
      return Response.json(
        {
          error: `Print run cannot move from ${currentStatus ?? "unknown"} to ${request.result}`,
          code: "invalid_status_transition",
        },
        { status: 409 }
      );
    }
    if (!run.updateTime) {
      throw new Error("Print run is missing its Firestore update time");
    }

    const completedAt = new Date();
    try {
      await firestore.commit([
        updateRunWrite(
          firestore.documentName(path),
          {
            status: request.result,
            completedAt,
          },
          run.updateTime
        ),
      ]);
    } catch (error) {
      if (!isPreconditionConflict(error)) throw error;

      const changedRun = await firestore.getDocument(path, ["status"]);
      const changedStatus = changedRun
        ? readFirestoreString(changedRun, "status")
        : null;
      if (changedStatus === request.result) {
        return Response.json({ status: changedStatus, unchanged: true });
      }
      return Response.json(
        {
          error: "Print run changed before it could be finalized",
          code: "print_run_conflict",
        },
        { status: 409 }
      );
    }
    return Response.json({
      status: request.result,
      completedAt: completedAt.toISOString(),
    });
  } catch (error) {
    return responseForError(error);
  }
};
