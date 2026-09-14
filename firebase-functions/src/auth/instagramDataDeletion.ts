import { randomBytes } from "node:crypto";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import type { Response } from "express";
import {
  InstagramAuthPolicyError,
  instagramSignedRequestFromBody,
  verifyInstagramSignedRequest,
} from "./instagramAuthPolicy";
import { deleteInstagramDataForMetaRequest } from "./instagramIdentityStore";

const instagramAppSecret = defineSecret("INSTAGRAM_APP_SECRET");
const DELETION_COLLECTION = "instagramDataDeletionRequests";
const DELETION_STATUS_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const PUBLIC_DELETION_URL =
  "https://tkaflowarts.com/api/auth/instagram/data-deletion";

function configuredAppSecret(): string {
  const value = instagramAppSecret.value().trim();
  if (!value) {
    throw new Error("Instagram app secret is not configured");
  }
  return value;
}

function isConfirmationCode(value: string): boolean {
  return /^[A-Za-z0-9_-]{32}$/.test(value);
}

export function renderInstagramDataDeletionStatusPage(
  status: "complete" | "not-found" | "instructions"
): string {
  const content =
    status === "complete"
      ? {
          title: "Instagram data deletion complete",
          message:
            "Flow Arts Composer removed the Instagram data associated with this request.",
        }
      : status === "not-found"
        ? {
            title: "Deletion request not found",
            message:
              "This confirmation code is invalid or has expired. Contact tkaflowarts@gmail.com if you need help.",
          }
        : {
            title: "Delete your Flow Arts Composer data",
            message:
              "Delete your Flow Arts Composer account from the account deletion page, or contact tkaflowarts@gmail.com for help with an Instagram data request.",
          };

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${content.title}</title>
    <style>body{font:16px/1.5 system-ui,sans-serif;background:#111827;color:#f9fafb;display:grid;min-height:100vh;place-items:center;margin:0;padding:24px;text-align:center}main{max-width:34rem}h1{font-size:1.35rem;margin:0 0 12px}p{color:#d1d5db;margin:0 0 16px}a{color:#a5b4fc}</style>
  </head>
  <body>
    <main>
      <h1>${content.title}</h1>
      <p>${content.message}</p>
      <a href="https://tkaflowarts.com/delete-account">Open account deletion</a>
    </main>
  </body>
</html>`;
}

function sendStatusPage(
  response: Response,
  status: "complete" | "not-found" | "instructions",
  statusCode = 200
): void {
  response
    .status(statusCode)
    .set({
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    })
    .send(renderInstagramDataDeletionStatusPage(status));
}

async function showDeletionStatus(
  code: string,
  response: Response
): Promise<void> {
  if (!code) {
    sendStatusPage(response, "instructions");
    return;
  }
  if (!isConfirmationCode(code)) {
    sendStatusPage(response, "not-found", 404);
    return;
  }

  const snapshot = await admin
    .firestore()
    .collection(DELETION_COLLECTION)
    .doc(code)
    .get();
  const complete =
    snapshot.exists &&
    snapshot.data()?.status === "complete" &&
    snapshot.data()?.expiresAt?.toMillis?.() > Date.now();
  sendStatusPage(
    response,
    complete ? "complete" : "not-found",
    complete ? 200 : 404
  );
}

/** Meta's signed user-data deletion callback and public confirmation page. */
export const instagramDataDeletionCallback = onRequest(
  { secrets: [instagramAppSecret], cors: false },
  async (request, response) => {
    if (request.method === "GET") {
      await showDeletionStatus(
        typeof request.query.code === "string" ? request.query.code : "",
        response
      );
      return;
    }
    if (request.method !== "POST") {
      response.set("Allow", "GET, POST").status(405).send("Method not allowed");
      return;
    }

    try {
      const instagramUserId = verifyInstagramSignedRequest(
        instagramSignedRequestFromBody(request.body),
        configuredAppSecret()
      );
      const result = await deleteInstagramDataForMetaRequest(instagramUserId);
      const confirmationCode = randomBytes(24).toString("base64url");
      const now = Date.now();
      await admin
        .firestore()
        .collection(DELETION_COLLECTION)
        .doc(confirmationCode)
        .set({
          status: "complete",
          result,
          createdAt: admin.firestore.Timestamp.fromMillis(now),
          completedAt: admin.firestore.Timestamp.fromMillis(now),
          expiresAt: admin.firestore.Timestamp.fromMillis(
            now + DELETION_STATUS_LIFETIME_MS
          ),
        });

      const statusUrl = new URL(PUBLIC_DELETION_URL);
      statusUrl.searchParams.set("code", confirmationCode);
      response
        .status(200)
        .set({
          "Cache-Control": "no-store, max-age=0",
          "Content-Type": "application/json; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
        })
        .json({
          url: statusUrl.toString(),
          confirmation_code: confirmationCode,
        });
    } catch (error) {
      const invalidRequest = error instanceof InstagramAuthPolicyError;
      const logContext = {
        error: error instanceof Error ? error.name : "unknown",
      };
      if (invalidRequest) {
        functions.logger.warn(
          "Instagram data deletion callback was rejected",
          logContext
        );
      } else {
        functions.logger.error(
          "Instagram data deletion callback did not complete",
          logContext
        );
      }
      response
        .status(invalidRequest ? 400 : 500)
        .send(invalidRequest ? "Invalid signed request" : "Deletion failed");
    }
  }
);
