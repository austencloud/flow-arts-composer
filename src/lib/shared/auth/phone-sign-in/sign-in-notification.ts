/**
 * What the phone shows for a sign-in request, and what each tap on it leads to.
 * The service worker shows the request with one Deny button. A tap on the
 * notification itself approves it right there, on any network; the notification
 * then changes to say what happened. Whatever cannot finish there opens the
 * approve page in review mode, where nothing approves by itself, so a failure
 * never looks like a success.
 *
 * Each request has its own notification, so a second request can never take the
 * place of the one being read. When more than one is waiting, none of them
 * approves from a tap: it opens the page, where the code can be checked.
 *
 * Ported from Ringmaster's sign-in-notification.ts. It differs in reading FCM's
 * data strings, and in "That wasn't me", which reports from the notification
 * instead of opening a page.
 */

import {
  opensApprovePage,
  type NotificationApprover,
  type NotificationOutcome,
} from "@austencloud/phone-sign-in/client";
import { notMeNotice, type NotMeAnswer } from "@austencloud/phone-sign-in";
import {
  APP_NAME,
  SIGN_IN_PUSH_TYPE,
  reviewPath,
  signInTag,
} from "./values";

/** A request as the push message carries it. */
export interface SignInPush {
  id: string;
  /** The computer asking, such as "Chrome on Windows". */
  label: string;
  /** How long the request has left, by the server's clock, when it was sent. */
  expiresInMs: number;
}

/** What the notification keeps, read back when it is tapped or when another request arrives. */
export interface SignInNotificationData {
  url: string;
  signIn: SignInPush;
  /** Set while the request is waiting for an answer: this phone's clock when it expires. */
  pendingUntil?: number;
  /** The request's own body, so it can be shown again without the crowded line. */
  body?: string;
  /** Set on the one waiting request: a tap on the notification itself approves it. Crowded, done and failure notifications never carry it. */
  tapApproves?: true;
}

export interface NotificationContent {
  title: string;
  options: NotificationOptions & {
    actions?: { action: string; title: string }[];
    renotify?: boolean;
  };
}

/** A notification already on the phone, as the service worker reads it. */
export interface ShownNotification {
  title: string;
  data: unknown;
}

/** Where a tap ends up: the notification it leaves behind, and a page to open, if any. */
export interface TapResult {
  notification: NotificationContent | null;
  open: string | null;
}

/** What a tap can do from the worker. */
export interface TapAnswers {
  approver: NotificationApprover;
  /** Reports "That wasn't me". Rejects when the report did not go through. */
  reportNotMe: (id: string) => Promise<NotMeAnswer>;
}

const ID = /^[A-Za-z0-9]{20}$/;
const ICON = "/pwa/icons/icon-192x192.png";
const BADGE = "/pwa/icons/icon-96x96.png";
const DEFAULT_LIFETIME_MS = 3 * 60 * 1000;
const MAX_LIFETIME_MS = 10 * 60 * 1000;
const CROWDED =
  "More than one sign-in is waiting. Tap to check the code before you approve.";

/** The sign-in in an FCM message, or null when it has none or it is malformed. */
export function signInFromPush(message: unknown): SignInPush | null {
  const data = (message as { data?: Record<string, unknown> } | null)?.data;
  if (data?.type !== SIGN_IN_PUSH_TYPE) return null;
  if (typeof data.id !== "string" || !ID.test(data.id)) return null;
  const lifetime = Number(data.expiresInMs);
  return {
    id: data.id,
    label:
      typeof data.label === "string" && data.label ? data.label : "A computer",
    expiresInMs:
      data.expiresInMs !== undefined && Number.isFinite(lifetime)
        ? Math.min(Math.max(lifetime, 0), MAX_LIFETIME_MS)
        : DEFAULT_LIFETIME_MS,
  };
}

const donePage = (id: string) => `/sign-in/${id}?done=auto`;

function content(
  title: string,
  body: string,
  signIn: SignInPush,
  url: string,
  extra: NotificationContent["options"] = {},
  more: Partial<SignInNotificationData> = {}
): NotificationContent {
  const data: SignInNotificationData = { url, signIn, ...more };
  return {
    title,
    options: {
      body,
      icon: ICON,
      badge: BADGE,
      tag: signInTag(signIn.id),
      data,
      ...extra,
    },
  };
}

/** The request as it first appears when it is the only one waiting: who is asking, with Deny. The body tap approves. */
export function requestNotification(
  signIn: SignInPush,
  title: string,
  body: string,
  now: number
): NotificationContent {
  return content(
    title,
    body,
    signIn,
    reviewPath(signIn.id),
    {
      requireInteraction: true,
      renotify: true,
      actions: [{ action: "deny", title: "Deny" }],
    },
    { pendingUntil: now + signIn.expiresInMs, body, tapApproves: true }
  );
}

/** A request waiting alongside another: no approval and no Deny, only a tap that opens the page. */
function crowdedNotification(
  signIn: SignInPush,
  title: string,
  body: string,
  pendingUntil: number,
  silent: boolean
): NotificationContent {
  return content(
    title,
    `${body}\n${CROWDED}`,
    signIn,
    reviewPath(signIn.id),
    { requireInteraction: true, renotify: !silent, silent },
    { pendingUntil, body }
  );
}

function waitingRequest(
  shown: ShownNotification,
  now: number
): (SignInNotificationData & { title: string }) | null {
  const data = shown.data as Partial<SignInNotificationData> | null;
  if (
    !data?.signIn ||
    typeof data.pendingUntil !== "number" ||
    data.pendingUntil <= now
  ) {
    return null;
  }
  return { ...(data as SignInNotificationData), title: shown.title };
}

/** True for a sign-in notification whose request has expired unanswered: it can be cleared. */
export function isStaleRequest(shown: ShownNotification, now: number): boolean {
  const data = shown.data as Partial<SignInNotificationData> | null;
  return (
    !!data?.signIn &&
    typeof data.pendingUntil === "number" &&
    data.pendingUntil <= now
  );
}

/**
 * What to show for a new request, given the notifications already on the phone.
 * Alone, the body tap approves it and it has Deny. With another request still
 * waiting, every waiting request is shown again without either.
 */
export function showRequest(
  signIn: SignInPush,
  title: string,
  body: string,
  shown: ShownNotification[],
  now: number
): NotificationContent[] {
  const others = shown
    .map((notification) => waitingRequest(notification, now))
    .filter(
      (other): other is SignInNotificationData & { title: string } =>
        !!other && other.signIn.id !== signIn.id
    );
  if (others.length === 0) {
    return [requestNotification(signIn, title, body, now)];
  }
  return [
    crowdedNotification(signIn, title, body, now + signIn.expiresInMs, false),
    ...others.map((other) =>
      crowdedNotification(
        other.signIn,
        other.title,
        other.body ?? "",
        other.pendingUntil ?? now,
        true
      )
    ),
  ];
}

/** Shown the moment the tap lands, until the answer is in. */
export function answeringNotification(
  action: "approve" | "deny" | "not-me",
  signIn: SignInPush
): NotificationContent {
  const title = {
    approve: `Signing in ${signIn.label}...`,
    deny: "Denying the sign-in...",
    "not-me": "Signing everyone out...",
  }[action];
  return content(title, "One moment.", signIn, reviewPath(signIn.id), {
    silent: true,
  });
}

/** The notification an answer leaves behind, quietly replacing the request. */
function afterAnswer(
  outcome: NotificationOutcome,
  signIn: SignInPush
): NotificationContent {
  const { id, label } = signIn;
  const page = reviewPath(id);
  switch (outcome) {
    case "approved":
      return content(
        `Signed in ${label}`,
        "Not you? Tap That wasn't me.",
        signIn,
        donePage(id),
        { actions: [{ action: "not-me", title: "That wasn't me" }] }
      );
    case "denied":
      return content(
        "Sign-in denied",
        `${label} was not signed in.`,
        signIn,
        page
      );
    case "expired":
      return content(
        "That sign-in expired",
        "Start again on the computer.",
        signIn,
        page
      );
    case "already-decided":
      return content(
        "That sign-in was already answered",
        "Nothing changed.",
        signIn,
        page
      );
    case "different-network":
      return content(
        "Approve on your phone",
        "Your phone is on a different network from the computer. Tap to check and approve.",
        signIn,
        page
      );
    case "signed-out":
      return content(
        "Sign in on your phone first",
        `Tap to open ${APP_NAME} and answer from there.`,
        signIn,
        page
      );
    case "no-key":
    case "not-trusted":
      return content(
        "Answer on your phone",
        "This phone no longer approves by itself. Tap to answer.",
        signIn,
        page
      );
    case "error":
      return couldNotAnswer(signIn);
  }
}

/** Failure, in words that cannot pass for success. Its tap opens the review page. */
export function couldNotAnswer(signIn: SignInPush): NotificationContent {
  return content(
    "Could not answer from the notification",
    "Tap to approve or deny on your phone.",
    signIn,
    reviewPath(signIn.id)
  );
}

/** True for the one waiting request whose notification body approves it, while it is still waiting on this phone's clock. */
function tapApproves(data: SignInNotificationData, now: number): boolean {
  return (
    data.tapApproves === true &&
    typeof data.pendingUntil === "number" &&
    data.pendingUntil > now
  );
}

/** True when this tap will approve or deny, so the worker can acknowledge it at once. */
export function tapAnswers(
  action: string,
  data: SignInNotificationData,
  now: number
): "approve" | "deny" | "not-me" | null {
  if (action === "deny") return "deny";
  if (action === "not-me") return "not-me";
  if (action === "" && tapApproves(data, now)) return "approve";
  return null;
}

async function reportNotMe(
  signIn: SignInPush,
  answers: TapAnswers
): Promise<TapResult> {
  const page = donePage(signIn.id);
  try {
    const answer = await answers.reportNotMe(signIn.id);
    return {
      notification: content(
        "Reported",
        notMeNotice(answer, APP_NAME).text,
        signIn,
        page
      ),
      open: null,
    };
  } catch {
    return {
      notification: content(
        "That didn't go through",
        "Tap to report it on your phone.",
        signIn,
        page
      ),
      open: page,
    };
  }
}

/**
 * Answers a tap on a sign-in notification. `action` is the button tapped, or
 * empty for the notification itself. On the one waiting request, the
 * notification itself approves, on any network. Every page it opens for a
 * request is the review page, so a Deny that could not finish never turns into
 * an approval there.
 */
export async function answerTap(
  action: string,
  data: SignInNotificationData,
  answers: TapAnswers,
  now: number
): Promise<TapResult> {
  const { signIn, url } = data;
  const answer = tapAnswers(action, data, now);
  if (answer === "not-me") return reportNotMe(signIn, answers);
  if (answer) {
    const outcome =
      answer === "approve"
        ? await answers.approver.approve(signIn.id, {
            confirmDifferentNetwork: true,
          })
        : await answers.approver.deny(signIn.id);
    return {
      notification: afterAnswer(outcome, signIn),
      open: opensApprovePage(outcome) ? reviewPath(signIn.id) : null,
    };
  }
  // The notification itself on anything else: the page it names, which for a request is the review page.
  return {
    notification: null,
    open: url.startsWith("/sign-in/") ? url : reviewPath(signIn.id),
  };
}
