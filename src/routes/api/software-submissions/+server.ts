import type { RequestHandler } from "@sveltejs/kit";

import admin from "firebase-admin";
import { getAdminDb } from "#lib/server/firebaseAdmin.js";
import { parseSoftwareSubmission } from "#lib/server/software-submissions/software-submission-input.js";
import { RATE_LIMITS } from "#lib/server/security/rate-limiter.js";
import { withRateLimit } from "#lib/server/security/withRateLimit.js";

const COLLECTION = "software_submissions";

export const POST: RequestHandler = async (event) => {
  const origin = event.request.headers.get("origin");
  if (origin && origin !== event.url.origin) {
    return Response.json(
      {
        ok: false,
        error: "This form only accepts submissions from this site.",
      },
      { status: 403 }
    );
  }

  const contentType = event.request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return Response.json(
      { ok: false, error: "That submission format is not supported." },
      { status: 415 }
    );
  }

  const blocked = await withRateLimit(
    event,
    RATE_LIMITS.SOFTWARE_SUBMISSION,
    "ip"
  );
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await event.request.json();
  } catch {
    return Response.json(
      { ok: false, error: "That submission could not be read." },
      { status: 400 }
    );
  }

  const parsed = parseSoftwareSubmission(body);
  if (!parsed.ok) {
    return Response.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  // Bots that fill the hidden field get a normal success response but no write.
  if (parsed.spam) return Response.json({ ok: true }, { status: 201 });

  try {
    const docRef = await getAdminDb()
      .collection(COLLECTION)
      .add({
        ...parsed.value,
        createdAt: admin.firestore.Timestamp.now(),
        source: "roots-software",
      });

    return Response.json({ ok: true, id: docRef.id }, { status: 201 });
  } catch (error) {
    console.error("[software-submissions] Firestore write failed:", error);
    return Response.json(
      {
        ok: false,
        error: "We couldn't send that submission. Please try again.",
      },
      { status: 500 }
    );
  }
};
