import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";
import {
  unsubscribeSecret,
  readUnsubscribeToken,
  type UnsubscribeClaim,
} from "./unsubscribeToken";
import { escapeHtml } from "./emailLayout";

const SETTINGS_URL = "https://tkaflowarts.com/settings/notifications";

export interface UnsubscribeResponse {
  status: number;
  allow?: string;
  html: string;
}

export interface UnsubscribeDependencies {
  turnOffPreference(claim: UnsubscribeClaim): Promise<void>;
}

const LABELS: Record<UnsubscribeClaim["preferenceKey"], string> = {
  emailMessages: "message emails",
  emailFeedback: "feedback emails",
  emailPlatformUpdates: "release emails",
};

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5"><h1 style="font-size:1.4rem">${escapeHtml(title)}</h1>${body}</body></html>`;
}

/**
 * GET only shows a confirm button, because mail scanners open links and must
 * not unsubscribe anyone. POST (the mail client's one-click request, or the
 * button) changes the preference.
 */
export async function handleUnsubscribe(
  request: { method: string; token: unknown },
  secret: string,
  dependencies: UnsubscribeDependencies
): Promise<UnsubscribeResponse> {
  if (request.method !== "GET" && request.method !== "POST") {
    return { status: 405, allow: "GET, POST", html: page("Not allowed", "") };
  }

  const claim = readUnsubscribeToken(request.token, secret);
  if (!claim) {
    return {
      status: 400,
      html: page(
        "This link isn't valid",
        `<p>You can still change your emails in <a href="${SETTINGS_URL}">notification settings</a>.</p>`
      ),
    };
  }

  const label = LABELS[claim.preferenceKey];
  if (request.method === "GET") {
    return {
      status: 200,
      html: page(
        `Stop ${label}?`,
        `<form method="post"><button type="submit" style="font:inherit;padding:.6rem 1.2rem">Unsubscribe from ${escapeHtml(label)}</button></form>`
      ),
    };
  }

  await dependencies.turnOffPreference(claim);
  return {
    status: 200,
    html: page(
      `You won't get ${label} anymore`,
      `<p>Changed your mind? <a href="${SETTINGS_URL}">Notification settings</a>.</p>`
    ),
  };
}

const defaultDependencies: UnsubscribeDependencies = {
  async turnOffPreference({ userId, preferenceKey }) {
    await admin
      .firestore()
      .doc(`users/${userId}/settings/notificationPreferences`)
      .set(
        { notificationPreferences: { [preferenceKey]: false } },
        { merge: true }
      );
  },
};

export const emailUnsubscribe = onRequest(
  { secrets: [unsubscribeSecret], cors: false },
  async (request, response) => {
    // The token is in the query string for both GET and the one-click POST.
    const result = await handleUnsubscribe(
      { method: request.method, token: request.query.t },
      unsubscribeSecret.value(),
      defaultDependencies
    );
    if (result.allow) response.set("Allow", result.allow);
    response.set("Cache-Control", "no-store");
    response.status(result.status).type("html").send(result.html);
  }
);
