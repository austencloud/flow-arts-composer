/**
 * Send Magic Link Cloud Function
 *
 * Generates a Firebase Auth magic link via Admin SDK,
 * then sends a branded email via Brevo using your custom domain.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { randomUUID } from "crypto";
import {
  createMagicLinkSignInState,
  redeemMagicLinkCode,
  resolveMagicLinkSignInState,
  type MagicLinkSignInState,
  type RedeemedMagicLinkCode,
  type ResolvedMagicLinkSignInState,
} from "./auth/magicLinkStateStore";
import { createSignInCodeHtml } from "./email/signInEmail";

// Brevo transactional email API endpoint
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const MAGIC_LINK_SUBJECT = "Your Flow Arts Composer sign-in code";
const DEFAULT_CONTINUE_URL = "https://tkaflowarts.com/create";
const DEFAULT_SENDER_EMAIL = "noreply@tkaflowarts.com";
const DEFAULT_SENDER_NAME = "Flow Arts Composer";
const PROVIDER_TIMEOUT_MS = 10_000;
const MAGIC_LINK_STATE_PARAM = "magicLinkState";
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SendMagicLinkRequest {
  email: string;
  continueUrl?: string;
  requestId?: string;
}

export interface ResolveMagicLinkEmailRequest {
  action: "resolve-email";
  state: string;
}

export interface RedeemMagicLinkCodeRequest {
  action: "redeem-code";
  requestId: string;
  code: string;
}

type MagicLinkCallableRequest =
  | SendMagicLinkRequest
  | ResolveMagicLinkEmailRequest
  | RedeemMagicLinkCodeRequest;

export interface SendMagicLinkResponse {
  success: boolean;
  message?: string;
  error?: string;
  requestId: string;
  subject: string;
  senderEmail: string;
}

export interface ResolveMagicLinkEmailResponse {
  success: true;
  email: string;
}

export interface RedeemMagicLinkCodeResponse {
  success: true;
  customToken: string;
}

type MagicLinkCallableResponse =
  | SendMagicLinkResponse
  | ResolveMagicLinkEmailResponse
  | RedeemMagicLinkCodeResponse;

function isResolveMagicLinkEmailRequest(
  data: unknown
): data is ResolveMagicLinkEmailRequest {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { action?: unknown }).action === "resolve-email"
  );
}

function isRedeemMagicLinkCodeRequest(
  data: unknown
): data is RedeemMagicLinkCodeRequest {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { action?: unknown }).action === "redeem-code"
  );
}

type MagicLinkStage =
  | "configuration"
  | "state_creation"
  | "link_generation"
  | "provider_request"
  | "provider_response";

interface MagicLinkLogger {
  info(message: string, data: Record<string, unknown>): void;
  error(message: string, data: Record<string, unknown>): void;
}

export interface MagicLinkRuntime {
  brevoApiKey?: string;
  senderEmail: string;
  senderName: string;
  appCheckStatus: "verified" | "missing";
  authStatus: "authenticated" | "anonymous";
  initiatingUid: string | null;
  now(): number;
  createRequestId(): string;
  createSignInState(
    email: string,
    requestId: string,
    initiatingUid: string | null
  ): Promise<MagicLinkSignInState>;
  generateLink(
    email: string,
    settings: { url: string; handleCodeInApp: boolean }
  ): Promise<string>;
  fetch(
    input: string,
    init: RequestInit
  ): Promise<Pick<Response, "ok" | "status" | "json">>;
  logger: MagicLinkLogger;
}

export interface ResolveMagicLinkEmailRuntime {
  resolveSignInState(
    state: string
  ): Promise<ResolvedMagicLinkSignInState | null>;
}

export interface RedeemMagicLinkCodeRuntime {
  redeemCode(
    requestId: string,
    code: string
  ): Promise<RedeemedMagicLinkCode | null>;
  getUser(uid: string): Promise<admin.auth.UserRecord>;
  getUserByEmail(email: string): Promise<admin.auth.UserRecord>;
  createUser(
    properties: admin.auth.CreateRequest
  ): Promise<admin.auth.UserRecord>;
  updateUser(
    uid: string,
    properties: admin.auth.UpdateRequest
  ): Promise<admin.auth.UserRecord>;
  createCustomToken(uid: string): Promise<string>;
}

function resolveRequestId(
  candidate: unknown,
  createRequestId: () => string
): string {
  return typeof candidate === "string" && REQUEST_ID_PATTERN.test(candidate)
    ? candidate
    : createRequestId();
}

function resolveAuthHost(continueUrl?: string): string {
  try {
    return new URL(continueUrl || DEFAULT_CONTINUE_URL).hostname.toLowerCase();
  } catch {
    return "invalid";
  }
}

function addMagicLinkState(continueUrl: string, state: string): string {
  const url = new URL(continueUrl);
  url.searchParams.set(MAGIC_LINK_STATE_PARAM, state);
  return url.toString();
}

function safeErrorCode(error: unknown): string {
  if (error instanceof functions.https.HttpsError) {
    return `https/${error.code}`;
  }

  const candidate = (error as { code?: unknown })?.code;
  if (typeof candidate === "string" && /^[a-z0-9_/-]{1,80}$/i.test(candidate)) {
    return candidate;
  }

  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "provider/timeout";
  }

  return "unknown";
}

export async function handleResolveMagicLinkEmail(
  data: ResolveMagicLinkEmailRequest,
  runtime: ResolveMagicLinkEmailRuntime
): Promise<ResolveMagicLinkEmailResponse> {
  const state = typeof data?.state === "string" ? data.state : "";
  const resolved = state ? await runtime.resolveSignInState(state) : null;

  if (!resolved) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "This sign-in link is invalid or expired"
    );
  }

  return {
    success: true,
    email: resolved.email,
  };
}

function userOwnsEmail(user: admin.auth.UserRecord, email: string): boolean {
  const normalized = email.toLowerCase();
  return (
    user.email?.toLowerCase() === normalized ||
    user.providerData.some(
      (provider) => provider.email?.toLowerCase() === normalized
    )
  );
}

async function findUserByEmail(
  email: string,
  runtime: RedeemMagicLinkCodeRuntime
): Promise<admin.auth.UserRecord | null> {
  try {
    return await runtime.getUserByEmail(email);
  } catch (error) {
    if ((error as { code?: string })?.code === "auth/user-not-found") {
      return null;
    }
    throw error;
  }
}

/**
 * Exchange the short code from the email for a Firebase custom token. This is
 * the installed-PWA path: iOS opens email links in the default browser, while
 * the code lets the original Home Screen app complete in its own storage silo.
 */
export async function handleRedeemMagicLinkCode(
  data: RedeemMagicLinkCodeRequest,
  runtime: RedeemMagicLinkCodeRuntime
): Promise<RedeemMagicLinkCodeResponse> {
  const requestId = typeof data?.requestId === "string" ? data.requestId : "";
  const code = typeof data?.code === "string" ? data.code : "";
  const redeemed = await runtime.redeemCode(requestId, code);
  if (!redeemed) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "This sign-in code is invalid or expired"
    );
  }

  let target: admin.auth.UserRecord;
  if (redeemed.initiatingUid) {
    target = await runtime.getUser(redeemed.initiatingUid);
    if (target.disabled) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "This sign-in code is invalid or expired"
      );
    }

    if (!userOwnsEmail(target, redeemed.email)) {
      const existing = await findUserByEmail(redeemed.email, runtime);
      if (existing && existing.uid !== target.uid) {
        throw new functions.https.HttpsError(
          "already-exists",
          "That email belongs to another account"
        );
      }
      target = await runtime.updateUser(target.uid, {
        email: redeemed.email,
        emailVerified: true,
      });
    }
  } else {
    target =
      (await findUserByEmail(redeemed.email, runtime)) ??
      (await runtime.createUser({
        email: redeemed.email,
        emailVerified: true,
      }));
  }

  if (target.disabled) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "This sign-in code is invalid or expired"
    );
  }

  return {
    success: true,
    customToken: await runtime.createCustomToken(target.uid),
  };
}

/**
 * Testable core for the callable. Logs only opaque request/provider IDs and
 * provider-neutral status; recipient addresses never enter Cloud Logging.
 */
export async function handleSendMagicLink(
  data: SendMagicLinkRequest,
  runtime: MagicLinkRuntime
): Promise<SendMagicLinkResponse> {
  const email = typeof data?.email === "string" ? data.email.trim() : "";

  if (!email) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Email is required"
    );
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Invalid email format"
    );
  }

  const requestId = resolveRequestId(data.requestId, runtime.createRequestId);
  const startedAt = runtime.now();
  const authHost = resolveAuthHost(data.continueUrl);
  let stage: MagicLinkStage = "configuration";
  let providerStatus: number | undefined;

  runtime.logger.info("Magic link request started", {
    requestId,
    authHost,
    appCheck: runtime.appCheckStatus,
    auth: runtime.authStatus,
  });

  try {
    if (!runtime.brevoApiKey) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Email service not configured"
      );
    }

    stage = "state_creation";
    const { state, oneTimeCode } = await runtime.createSignInState(
      email,
      requestId,
      runtime.initiatingUid
    );

    stage = "link_generation";
    const continueUrl = addMagicLinkState(
      data.continueUrl || DEFAULT_CONTINUE_URL,
      state
    );
    const magicLink = await runtime.generateLink(email, {
      url: continueUrl,
      handleCodeInApp: true,
    });

    const htmlContent = createSignInCodeHtml(oneTimeCode, magicLink);
    const textContent = `Your Flow Arts Composer sign-in code

${oneTimeCode}

Return to Flow Arts Composer and enter this code. It expires in 30 minutes.

Signing in in a web browser instead? Use this link:
${magicLink}

Didn't request this? Ignore it.

Flow Arts Composer
https://tkaflowarts.com`;

    stage = "provider_request";
    const response = await runtime.fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "api-key": runtime.brevoApiKey,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: runtime.senderName, email: runtime.senderEmail },
        to: [{ email }],
        subject: MAGIC_LINK_SUBJECT,
        htmlContent,
        textContent,
        tags: ["authentication", "magic-link"],
        headers: {
          "X-Mailin-custom": `request_id:${requestId}`,
        },
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    providerStatus = response.status;

    if (!response.ok) {
      throw new functions.https.HttpsError("internal", "Failed to send email");
    }

    stage = "provider_response";
    const result = (await response.json()) as { messageId?: unknown };
    if (typeof result.messageId !== "string" || !result.messageId) {
      const invalidResponse = new Error(
        "Brevo response omitted messageId"
      ) as Error & {
        code: string;
      };
      invalidResponse.code = "provider/invalid-response";
      throw invalidResponse;
    }

    runtime.logger.info("Magic link provider accepted", {
      requestId,
      providerMessageId: result.messageId,
      providerStatus,
      authHost,
      durationMs: runtime.now() - startedAt,
    });

    return {
      success: true,
      message: "Email code sent. Check your email.",
      requestId,
      subject: MAGIC_LINK_SUBJECT,
      senderEmail: runtime.senderEmail,
    };
  } catch (error: unknown) {
    const errorCode = safeErrorCode(error);
    runtime.logger.error("Magic link request failed", {
      requestId,
      stage,
      errorCode,
      providerStatus: providerStatus ?? null,
      authHost,
      durationMs: runtime.now() - startedAt,
    });

    if ((error as { code?: unknown })?.code === "auth/invalid-email") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Invalid email address"
      );
    }

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    if (errorCode === "provider/timeout") {
      throw new functions.https.HttpsError(
        "unavailable",
        "Email provider timed out"
      );
    }

    throw new functions.https.HttpsError(
      "internal",
      "Failed to send magic link"
    );
  }
}

/**
 * Callable endpoint for issuing a link and resolving its short-lived state.
 * The deployed name stays `sendMagicLink` so existing clients keep working.
 */
export const sendMagicLink = functions.https.onCall(
  async (
    data: MagicLinkCallableRequest,
    context
  ): Promise<MagicLinkCallableResponse> => {
    if (isResolveMagicLinkEmailRequest(data)) {
      return handleResolveMagicLinkEmail(data, {
        resolveSignInState: resolveMagicLinkSignInState,
      });
    }

    if (isRedeemMagicLinkCodeRequest(data)) {
      return handleRedeemMagicLinkCode(data, {
        redeemCode: redeemMagicLinkCode,
        getUser: (uid) => admin.auth().getUser(uid),
        getUserByEmail: (email) => admin.auth().getUserByEmail(email),
        createUser: (properties) => admin.auth().createUser(properties),
        updateUser: (uid, properties) =>
          admin.auth().updateUser(uid, properties),
        createCustomToken: (uid) => admin.auth().createCustomToken(uid),
      });
    }

    return handleSendMagicLink(data, {
      brevoApiKey: process.env.BREVO_API_KEY,
      senderEmail: process.env.BREVO_SENDER_EMAIL || DEFAULT_SENDER_EMAIL,
      senderName: process.env.BREVO_SENDER_NAME || DEFAULT_SENDER_NAME,
      appCheckStatus: context.app ? "verified" : "missing",
      authStatus: context.auth ? "authenticated" : "anonymous",
      initiatingUid: context.auth?.uid ?? null,
      now: Date.now,
      createRequestId: randomUUID,
      createSignInState: createMagicLinkSignInState,
      generateLink: (email, settings) =>
        admin.auth().generateSignInWithEmailLink(email, settings),
      fetch: (input, init) => fetch(input, init),
      logger: {
        info: (message, fields) => functions.logger.info(message, fields),
        error: (message, fields) => functions.logger.error(message, fields),
      },
    });
  }
);
