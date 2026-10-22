import type { RequestHandler } from "./$types";
import {
  getFirestoreRest,
  toFirestoreFields,
} from "#lib/server/firestore/firestore-rest.js";
import { RATE_LIMITS } from "#lib/server/security/rate-limiter.js";
import { withRateLimit } from "#lib/server/security/withRateLimit.js";
import { requestCf, workerEnv } from "#lib/server/cloudflare/worker-env.js";
import {
  LIVE_SITE_HOSTS,
  SITE_VISIT_RETENTION_DAYS,
  looksLikeBot,
  parseVisitReport,
} from "#lib/server/visits/site-visit.js";

// The browser ignores the answer, so every outcome — recorded, skipped as a
// bot, rate limited, malformed — gets the same empty reply.
const NO_CONTENT = () => new Response(null, { status: 204 });

/**
 * One report per visit from a browser without an account. Stored in
 * siteVisits, where the pulseSiteVisit Cloud Function picks it up and buzzes
 * the admins.
 */
export const POST: RequestHandler = async (event) => {
  const { request, url } = event;
  if (!LIVE_SITE_HOSTS.has(url.hostname)) return NO_CONTENT();

  const origin = request.headers.get("origin");
  if (origin !== url.origin) return NO_CONTENT();

  const blocked = await withRateLimit(event, RATE_LIMITS.SITE_VISIT, "ip");
  if (blocked) return NO_CONTENT();

  const cf = requestCf(request);
  const userAgent = request.headers.get("user-agent") ?? "";
  if (looksLikeBot(userAgent, cf)) return NO_CONTENT();

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 8_000) return NO_CONTENT();
    body = JSON.parse(raw);
  } catch {
    return NO_CONTENT();
  }

  const parsed = parseVisitReport(body, {
    ownHost: url.hostname,
    userAgent,
    cf,
  });
  if (!parsed.ok) return NO_CONTENT();

  try {
    const firestore = getFirestoreRest(
      workerEnv()?.FIREBASE_SERVICE_ACCOUNT_JSON
    );
    const expiresAt = new Date(
      Date.now() + SITE_VISIT_RETENTION_DAYS * 86_400_000
    ).toISOString();
    await firestore.commit([
      {
        update: {
          name: firestore.documentName(`siteVisits/${crypto.randomUUID()}`),
          fields: {
            ...toFirestoreFields({ ...parsed.value }),
            expiresAt: { timestampValue: expiresAt },
          },
        },
        updateTransforms: [
          { fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" },
        ],
        currentDocument: { exists: false },
      },
    ]);
  } catch (error) {
    console.error("[visit] Firestore write failed:", error);
  }
  return NO_CONTENT();
};
