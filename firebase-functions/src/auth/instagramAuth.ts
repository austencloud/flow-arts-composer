import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import {
  InstagramAuthPolicyError,
  instagramSignedRequestFromBody,
  isAllowedInstagramReturnOrigin,
  verifyInstagramSignedRequest,
  type InstagramAuthFailureCode,
  type InstagramAuthIntent,
} from "./instagramAuthPolicy";
import {
  exchangeInstagramAuthorizationCode,
  fetchInstagramProfile,
} from "./instagramApiClient";
import {
  applyInstagramIdentity,
  deauthorizeInstagramIdentity,
  resolveAndStoreInstagramIdentity,
  unlinkInstagramIdentity,
} from "./instagramIdentityStore";
import {
  claimInstagramOAuthState,
  createInstagramOAuthState,
  getInstagramOAuthState,
  isInstagramStateId,
  markInstagramOAuthStateError,
} from "./instagramOAuthStateStore";
import {
  instagramFailureMessage,
  sendInstagramCallbackPage,
} from "./instagramCallbackPage";

const instagramAppId = defineSecret("INSTAGRAM_APP_ID");
const instagramAppSecret = defineSecret("INSTAGRAM_APP_SECRET");

const INSTAGRAM_CALLBACK_URL =
  "https://tkaflowarts.com/api/auth/instagram/callback";
const INSTAGRAM_AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";

function configuredSecret(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new HttpsError(
      "failed-precondition",
      "Instagram login is not configured",
      {
        reason: "instagram/not-configured",
        missing: name,
      }
    );
  }
  return trimmed;
}

function requireCaller(request: {
  auth?: { uid: string; token: Record<string, unknown> };
}): { uid: string; isAnonymous: boolean } {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "A Firebase session is required", {
      reason: "instagram/session-required",
    });
  }

  const firebaseClaim = request.auth.token.firebase as
    | { sign_in_provider?: string }
    | undefined;
  return {
    uid: request.auth.uid,
    isAnonymous: firebaseClaim?.sign_in_provider === "anonymous",
  };
}

function parseIntent(value: unknown): InstagramAuthIntent {
  if (value === "signin" || value === "link" || value === "reauth")
    return value;
  throw new HttpsError("invalid-argument", "Invalid Instagram auth intent", {
    reason: "instagram/state-invalid",
  });
}

function assertIntentMatchesCaller(
  intent: InstagramAuthIntent,
  isAnonymous: boolean
): void {
  if ((intent === "signin") !== isAnonymous) {
    throw new HttpsError(
      "failed-precondition",
      "Instagram auth session changed",
      {
        reason: "instagram/state-invalid",
      }
    );
  }
}

function publicFailureCode(error: unknown): InstagramAuthFailureCode {
  return error instanceof InstagramAuthPolicyError
    ? error.code
    : "instagram/provider-error";
}

function stringQueryValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export const startInstagramAuth = onCall(
  { secrets: [instagramAppId] },
  async (request) => {
    const caller = requireCaller(request);
    const intent = parseIntent(request.data?.intent);
    assertIntentMatchesCaller(intent, caller.isAnonymous);
    if (intent === "link" && request.auth?.token.instagram === true) {
      throw new HttpsError("already-exists", "Instagram is already connected", {
        reason: "instagram/already-linked",
      });
    }
    if (intent === "reauth" && request.auth?.token.instagram !== true) {
      throw new HttpsError(
        "failed-precondition",
        "Instagram is not connected",
        {
          reason: "instagram/reauth-mismatch",
        }
      );
    }

    const returnOrigin =
      typeof request.data?.returnOrigin === "string"
        ? request.data.returnOrigin
        : "";
    if (!isAllowedInstagramReturnOrigin(returnOrigin)) {
      throw new HttpsError("invalid-argument", "Return origin is not allowed", {
        reason: "instagram/origin-not-allowed",
      });
    }

    const appId = configuredSecret(instagramAppId.value(), "INSTAGRAM_APP_ID");
    const { state, expiresAtMs } = await createInstagramOAuthState({
      requesterUid: caller.uid,
      requesterWasAnonymous: caller.isAnonymous,
      intent,
      returnOrigin,
    });

    const authorizationUrl = new URL(INSTAGRAM_AUTHORIZE_URL);
    authorizationUrl.searchParams.set("client_id", appId);
    authorizationUrl.searchParams.set("redirect_uri", INSTAGRAM_CALLBACK_URL);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("scope", "instagram_business_basic");
    authorizationUrl.searchParams.set("state", state);

    return {
      authorizationUrl: authorizationUrl.toString(),
      state,
      expiresAtMs,
    };
  }
);

export const instagramAuthCallback = onRequest(
  { secrets: [instagramAppId, instagramAppSecret], cors: false },
  async (request, response) => {
    if (request.method !== "GET") {
      response.set("Allow", "GET").status(405).send("Method not allowed");
      return;
    }

    const stateValue = stringQueryValue(request.query.state);
    let claimed:
      | Awaited<ReturnType<typeof claimInstagramOAuthState>>
      | undefined;

    try {
      claimed = await claimInstagramOAuthState(stateValue);

      const providerError = stringQueryValue(request.query.error);
      if (providerError) {
        throw new InstagramAuthPolicyError(
          providerError === "access_denied"
            ? "instagram/cancelled"
            : "instagram/provider-error"
        );
      }

      const code = stringQueryValue(request.query.code);
      if (!code || code.length > 4096) {
        throw new InstagramAuthPolicyError("instagram/invalid-response");
      }

      const token = await exchangeInstagramAuthorizationCode({
        code,
        appId: configuredSecret(instagramAppId.value(), "INSTAGRAM_APP_ID"),
        appSecret: configuredSecret(
          instagramAppSecret.value(),
          "INSTAGRAM_APP_SECRET"
        ),
        redirectUrl: INSTAGRAM_CALLBACK_URL,
      });
      const profile = await fetchInstagramProfile(token.accessToken);
      const identity = await resolveAndStoreInstagramIdentity({
        stateRef: claimed.ref,
        state: claimed.data,
        instagramUserId: token.userId,
        profile,
      });
      await applyInstagramIdentity({
        uid: identity.resolvedUid,
        instagramUserId: token.userId,
        profile,
        requesterWasAnonymous: claimed.data.requesterWasAnonymous,
      });
      await claimed.ref.set(
        {
          status: "complete",
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      sendInstagramCallbackPage(response, {
        returnOrigin: claimed.data.returnOrigin,
        state: stateValue,
        status: "complete",
        message: "Return to Flow Arts Composer to finish signing in.",
      });
    } catch (error) {
      const code = publicFailureCode(error);
      if (claimed) {
        await markInstagramOAuthStateError(claimed.ref, code).catch(
          (writeError) => {
            functions.logger.error("Could not record Instagram OAuth failure", {
              code,
              error: writeError instanceof Error ? writeError.name : "unknown",
            });
          }
        );
      }
      functions.logger.warn("Instagram OAuth callback did not complete", {
        code,
      });
      sendInstagramCallbackPage(
        response,
        {
          returnOrigin: claimed?.data.returnOrigin,
          state: isInstagramStateId(stateValue) ? stateValue : undefined,
          status: "error",
          message: instagramFailureMessage(code),
        },
        claimed ? 200 : 400
      );
    }
  }
);

export const completeInstagramAuth = onCall(async (request) => {
  const caller = requireCaller(request);
  const state =
    typeof request.data?.state === "string" ? request.data.state : "";
  if (!isInstagramStateId(state)) {
    throw new HttpsError("invalid-argument", "Invalid Instagram auth state", {
      reason: "instagram/state-invalid",
    });
  }

  const storedState = await getInstagramOAuthState(state);
  if (!storedState.exists || !storedState.data) {
    throw new HttpsError("not-found", "Instagram auth state was not found", {
      reason: "instagram/state-invalid",
    });
  }

  const data = storedState.data;
  if (data.requesterUid !== caller.uid) {
    throw new HttpsError(
      "permission-denied",
      "Instagram auth state belongs to another session",
      { reason: "instagram/state-invalid" }
    );
  }
  if (data.expiresAt.toMillis() <= Date.now()) {
    return {
      status: "error" as const,
      errorCode: "instagram/state-expired" as const,
    };
  }
  if (data.status === "error") {
    return {
      status: "error" as const,
      errorCode: data.errorCode ?? ("instagram/provider-error" as const),
    };
  }
  if (data.status !== "complete" || !data.resolvedUid) {
    return { status: "pending" as const };
  }

  const user = await admin.auth().getUser(data.resolvedUid);
  const customToken = await admin.auth().createCustomToken(data.resolvedUid, {
    ...(user.customClaims ?? {}),
    instagram: true,
  });
  await storedState.ref.set(
    { deliveredAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );

  return {
    status: "complete" as const,
    customToken,
    collision: data.collision === true,
    instagramUsername: data.instagramUsername ?? null,
  };
});

export const unlinkInstagramAuth = onCall(async (request) => {
  const caller = requireCaller(request);
  if (caller.isAnonymous) {
    throw new HttpsError(
      "failed-precondition",
      "Anonymous sessions cannot unlink providers",
      { reason: "instagram/session-required" }
    );
  }

  await unlinkInstagramIdentity(caller.uid);
  return { unlinked: true };
});

/** Meta calls this when a person removes TKA from Instagram's app settings. */
export const instagramDeauthorizeCallback = onRequest(
  { secrets: [instagramAppSecret], cors: false },
  async (request, response) => {
    if (request.method !== "POST") {
      response.set("Allow", "POST").status(405).send("Method not allowed");
      return;
    }

    try {
      const instagramUserId = verifyInstagramSignedRequest(
        instagramSignedRequestFromBody(request.body),
        configuredSecret(instagramAppSecret.value(), "INSTAGRAM_APP_SECRET")
      );
      await deauthorizeInstagramIdentity(instagramUserId);
      response
        .status(200)
        .set({ "Cache-Control": "no-store", "Content-Type": "text/plain" })
        .send("OK");
    } catch (error) {
      functions.logger.warn("Instagram deauthorization callback was rejected", {
        error: error instanceof Error ? error.name : "unknown",
      });
      response.status(400).send("Invalid signed request");
    }
  }
);
