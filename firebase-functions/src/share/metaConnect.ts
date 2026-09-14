/**
 * Connecting a Meta account for PUBLISHING.
 *
 * Runs entirely beside the Instagram sign-in handshake in `../auth`, never
 * through it. Sign-in resolves an identity and mints a Firebase custom token;
 * this flow assumes the person is already signed in and only attaches a
 * publishing credential to their uid. Keeping them apart means a change here
 * can never lock anyone out of the app.
 *
 * What it shares with sign-in: the return-origin allowlist and the popup
 * callback page. What it does not share: state documents, tokens, and any
 * write to Firebase Auth.
 */

import * as functions from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { exchangeInstagramAuthorizationCode } from "../auth/instagramApiClient";
import { InstagramAuthPolicyError } from "../auth/instagramAuthPolicy";
import { isAllowedInstagramReturnOrigin } from "../auth/instagramAuthPolicy";
import { sendProviderCallbackPage } from "../auth/providerCallbackPage";
import {
  exchangeFacebookCode,
  exchangeFacebookLongLivedToken,
  exchangeInstagramLongLivedToken,
  fetchInstagramAccount,
  listFacebookPages,
  listPermissionStatuses,
  revokeFacebookPermissions,
} from "./metaGraphClient";
import { GRAPH_VERSION } from "./metaGraphConfig";
import {
  clearConnection,
  readConnections,
  selectFacebookPage,
  syncStatus,
  writeFacebookConnection,
  writeInstagramConnection,
  type MetaConnectionTarget,
} from "./metaConnectionStore";
import {
  claimMetaConnectState,
  createMetaConnectState,
  getMetaConnectState,
  isMetaConnectStateId,
  markMetaConnectComplete,
  markMetaConnectError,
  MetaConnectError,
  metaConnectFailureMessage,
  type MetaConnectFailureCode,
} from "./metaConnectStateStore";
import * as admin from "firebase-admin";

const instagramAppId = defineSecret("INSTAGRAM_APP_ID");
const instagramAppSecret = defineSecret("INSTAGRAM_APP_SECRET");
const facebookAppId = defineSecret("FACEBOOK_APP_ID");
const facebookAppSecret = defineSecret("FACEBOOK_APP_SECRET");

const CONNECT_SECRETS = [
  instagramAppId,
  instagramAppSecret,
  facebookAppId,
  facebookAppSecret,
];

export const META_CONNECT_CALLBACK_URL =
  "https://tkaflowarts.com/api/share/meta/callback";

const INSTAGRAM_AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
const FACEBOOK_AUTHORIZE_URL = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;

/**
 * `instagram_business_content_publish` is the scope Meta app review gates. The
 * basic scope stays in the list because the flow reads the account's username
 * to label the connection.
 */
const INSTAGRAM_PUBLISH_SCOPE =
  "instagram_business_basic,instagram_business_content_publish";

/**
 * Facebook names its permission set in the dashboard, not in the URL.
 *
 * The publishing app is `type: Business`, and the only login product such an
 * app can add is Facebook Login for Business, where `config_id` replaced
 * `scope` outright. The permissions live in the app's "Page posting"
 * configuration and are, in order: `pages_show_list`, `pages_read_engagement`,
 * `pages_manage_posts`, `publish_video` — `publish_video` being separate from
 * `pages_manage_posts` and what a Page reel needs. Editing that list is a
 * dashboard action; this constant only points at it.
 */
const FACEBOOK_LOGIN_CONFIG_ID = "1026384010306248";

function configuredSecret(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new HttpsError("failed-precondition", "Posting is not configured", {
      reason: "meta/not-configured",
      missing: name,
    });
  }
  return trimmed;
}

function requireSignedInCaller(request: {
  auth?: { uid: string; token: Record<string, unknown> };
}): string {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in to connect an account", {
      reason: "meta/session-required",
    });
  }
  const firebaseClaim = request.auth.token.firebase as
    | { sign_in_provider?: string }
    | undefined;
  if (firebaseClaim?.sign_in_provider === "anonymous") {
    throw new HttpsError(
      "failed-precondition",
      "A full account is required to post to Meta",
      { reason: "meta/account-required" }
    );
  }
  return request.auth.uid;
}

function parseTarget(value: unknown): MetaConnectionTarget {
  if (value === "instagram" || value === "facebook-page") return value;
  throw new HttpsError("invalid-argument", "Unknown connection target", {
    reason: "meta/target-invalid",
  });
}

function stringQueryValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function metaConnectFailureCode(error: unknown): MetaConnectFailureCode {
  if (error instanceof MetaConnectError) return error.code;
  if (error instanceof InstagramAuthPolicyError) {
    if (error.code === "instagram/account-type-required") {
      return "meta/account-type-required";
    }
    if (error.code === "instagram/app-configuration-mismatch") {
      return "meta/app-configuration-mismatch";
    }
  }
  return "meta/provider-error";
}

/**
 * What Meta actually said, for the logs and nowhere else.
 *
 * The page the popup renders is deliberately vague, because a Graph error code
 * is not something the person mid-authorization can act on. Whoever is
 * debugging it can — and without this, a failed connect records only the same
 * sanitized bucket the UI already showed, which is no information at all.
 * Unrecognized Graph errors keep Meta's own message (see `mapMetaError`), so
 * this is usually the sentence that names the real cause.
 */
function failureDetail(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return typeof error === "string" ? error : "unknown";
}

export const startMetaConnect = onCall(
  { secrets: CONNECT_SECRETS },
  async (request) => {
    const uid = requireSignedInCaller(request);
    const target = parseTarget(request.data?.target);

    const returnOrigin =
      typeof request.data?.returnOrigin === "string"
        ? request.data.returnOrigin
        : "";
    if (!isAllowedInstagramReturnOrigin(returnOrigin)) {
      throw new HttpsError("invalid-argument", "Return origin is not allowed", {
        reason: "meta/origin-not-allowed",
      });
    }

    // Someone re-opening this to reach a Page they did not share the first
    // time gets nowhere while the grant stands: Meta answers a second visit
    // with "continue with your previous settings" and hands back the same
    // Pages. Releasing the grant here, before the popup navigates, is what
    // turns the dialog back into a first-time one with its Page picker.
    if (request.data?.reselect === true && target === "facebook-page") {
      await releaseFacebookGrant(uid);
    }

    const { state, expiresAtMs } = await createMetaConnectState({
      requesterUid: uid,
      target,
      returnOrigin,
    });

    const authorizationUrl =
      target === "instagram"
        ? buildAuthorizeUrl({
            base: INSTAGRAM_AUTHORIZE_URL,
            clientId: configuredSecret(
              instagramAppId.value(),
              "INSTAGRAM_APP_ID"
            ),
            grant: { kind: "scope", scope: INSTAGRAM_PUBLISH_SCOPE },
            state,
          })
        : buildAuthorizeUrl({
            base: FACEBOOK_AUTHORIZE_URL,
            clientId: configuredSecret(
              facebookAppId.value(),
              "FACEBOOK_APP_ID"
            ),
            grant: { kind: "config", configId: FACEBOOK_LOGIN_CONFIG_ID },
            state,
          });

    // The other half of the redirect_uri comparison Meta refuses to show us.
    // State is a single-use capability and stays out of the logs.
    functions.logger.info("Meta connect authorization requested", {
      target,
      authorizationUrl: authorizationUrl.replace(
        /([?&]state=)[^&]*/,
        "$1<redacted>"
      ),
    });

    return { authorizationUrl, state, expiresAtMs };
  }
);

/**
 * How the two providers name the permissions they are being asked for. They do
 * not accept each other's form: Instagram business login takes a raw scope
 * list, and Facebook Login for Business rejects `scope` in favour of a
 * configuration id.
 */
type AuthorizeGrant =
  | { kind: "scope"; scope: string }
  | { kind: "config"; configId: string };

function buildAuthorizeUrl(input: {
  base: string;
  clientId: string;
  grant: AuthorizeGrant;
  state: string;
}): string {
  const url = new URL(input.base);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", META_CONNECT_CALLBACK_URL);
  url.searchParams.set("response_type", "code");
  if (input.grant.kind === "config") {
    url.searchParams.set("config_id", input.grant.configId);
    // A configuration carries its own default response type, and for a
    // user-token configuration that default is a token handed to the browser.
    // This flow exchanges a code server-side, so the request has to say so.
    url.searchParams.set("override_default_response_type", "true");
  } else {
    url.searchParams.set("scope", input.grant.scope);
    // Sign-in already authorized this same Instagram app, against a different
    // callback. Without this, Instagram answers with "you previously connected
    // — continue sharing?" and issues a code minted under that first grant's
    // redirect_uri, which this flow then redeems with its own and is told the
    // two are not identical. Forcing a fresh pass is what makes the code belong
    // to the request that asked for it.
    url.searchParams.set("force_reauth", "true");
  }
  url.searchParams.set("state", input.state);
  return url.toString();
}

/**
 * Enough of the authorization code to diagnose it, and none of it to use.
 *
 * Meta answers a code it will not honour with one sentence about redirect_uri,
 * whatever the real cause. Two of the causes are visible right here, before the
 * exchange: Express parses the query as form-encoded, where `+` decodes to a
 * space, so a code carrying one arrives corrupted; and the redirect_uri we are
 * about to redeem with is a constant that must match what the dialog was given.
 * Recording both alongside the code's shape is what separates those from a
 * grant Meta minted against some other callback.
 */
function logCodeShape(
  target: MetaConnectionTarget,
  rawUrl: string,
  code: string
): void {
  const rawCode = /[?&]code=([^&]*)/.exec(rawUrl)?.[1] ?? "";
  functions.logger.info("Meta connect callback received a code", {
    target,
    redirectUri: META_CONNECT_CALLBACK_URL,
    codeLength: code.length,
    codeHead: code.slice(0, 8),
    codeTail: code.slice(-8),
    codeHasSpace: code.includes(" "),
    rawEncodedLength: rawCode.length,
    rawHasPlus: rawCode.includes("+"),
  });
}

export const metaConnectCallback = onRequest(
  { secrets: CONNECT_SECRETS, cors: false },
  async (request, response) => {
    if (request.method !== "GET") {
      response.set("Allow", "GET").status(405).send("Method not allowed");
      return;
    }

    const stateValue = stringQueryValue(request.query.state);
    let claimed: Awaited<ReturnType<typeof claimMetaConnectState>> | undefined;

    try {
      claimed = await claimMetaConnectState(stateValue);

      const providerError = stringQueryValue(request.query.error);
      if (providerError) {
        throw new MetaConnectError(
          providerError === "access_denied"
            ? "meta/cancelled"
            : "meta/provider-error"
        );
      }

      const code = stringQueryValue(request.query.code);
      if (!code || code.length > 4096) {
        throw new MetaConnectError("meta/provider-error");
      }
      logCodeShape(
        claimed.data.target,
        request.originalUrl ?? request.url,
        code
      );

      const accountName =
        claimed.data.target === "instagram"
          ? await connectInstagram(claimed.data.requesterUid, code)
          : await connectFacebookPage(claimed.data.requesterUid, code);

      await markMetaConnectComplete(claimed.ref, accountName);
      sendProviderCallbackPage(response, {
        messageType: "tka:meta-connect",
        title: "Account connected",
        returnOrigin: claimed.data.returnOrigin,
        state: stateValue,
        status: "complete",
        message: "Return to Flow Arts Composer — you can post from the share sheet now.",
      });
    } catch (error) {
      const code = metaConnectFailureCode(error);
      if (claimed) {
        await markMetaConnectError(claimed.ref, code).catch((writeError) => {
          functions.logger.error("Could not record Meta connect failure", {
            code,
            error: writeError instanceof Error ? writeError.name : "unknown",
          });
        });
      }
      functions.logger.warn("Meta publish connect did not complete", {
        code,
        target: claimed?.data.target,
        detail: failureDetail(error),
      });
      sendProviderCallbackPage(
        response,
        {
          messageType: "tka:meta-connect",
          title: "Connection failed",
          returnOrigin: claimed?.data.returnOrigin,
          state: isMetaConnectStateId(stateValue) ? stateValue : undefined,
          status: "error",
          message: metaConnectFailureMessage(code),
        },
        claimed ? 200 : 400
      );
    }
  }
);

async function connectInstagram(uid: string, code: string): Promise<string> {
  const appSecret = configuredSecret(
    instagramAppSecret.value(),
    "INSTAGRAM_APP_SECRET"
  );
  const shortLived = await exchangeInstagramAuthorizationCode({
    code,
    appId: configuredSecret(instagramAppId.value(), "INSTAGRAM_APP_ID"),
    appSecret,
    redirectUrl: META_CONNECT_CALLBACK_URL,
  });
  const longLived = await exchangeInstagramLongLivedToken({
    shortLivedToken: shortLived.accessToken,
    appSecret,
  });
  const account = await fetchInstagramAccount(longLived.accessToken);

  const now = Date.now();
  await writeInstagramConnection(uid, {
    igUserId: account.igUserId || shortLived.userId,
    username: account.username,
    accountType: account.accountType,
    graphVersion: GRAPH_VERSION,
    appAccess: "unknown",
    permissions: {
      instagram_business_basic: "granted",
      instagram_business_content_publish: "granted",
    },
    accessToken: longLived.accessToken,
    issuedAt: admin.firestore.Timestamp.fromMillis(now),
    expiresAt: admin.firestore.Timestamp.fromMillis(
      now + longLived.expiresIn * 1000
    ),
    connectedAt: admin.firestore.Timestamp.fromMillis(now),
    verifiedAt: admin.firestore.Timestamp.fromMillis(now),
  });

  return account.username || "Instagram";
}

async function connectFacebookPage(uid: string, code: string): Promise<string> {
  const appId = configuredSecret(facebookAppId.value(), "FACEBOOK_APP_ID");
  const appSecret = configuredSecret(
    facebookAppSecret.value(),
    "FACEBOOK_APP_SECRET"
  );

  const shortLived = await exchangeFacebookCode({
    code,
    appId,
    appSecret,
    redirectUrl: META_CONNECT_CALLBACK_URL,
  });
  const longLived = await exchangeFacebookLongLivedToken({
    shortLivedToken: shortLived.accessToken,
    appId,
    appSecret,
  });
  const pages = await listFacebookPages(longLived.accessToken);
  if (pages.length === 0) {
    // Meta answers "no Pages shared" and "you never had permission to ask"
    // with the same empty list, and the remedy differs: one is a choice in
    // the dialog, the other is the app's permission set. Recording what was
    // actually granted is the only way to tell them apart afterwards.
    const permissions = await listPermissionStatuses(
      longLived.accessToken
    ).catch(() => null);
    functions.logger.warn("Facebook connect returned no Pages", {
      permissions,
    });

    // Nothing is stored on this path, so without this the grant Meta just
    // issued becomes unreachable: the next attempt is answered with "continue
    // with your previous settings", replaying the very authorization that
    // produced no Pages, and there is no saved token left for a revoke to
    // break the loop with. Handing this one back on the way out is what makes
    // simply trying again reach the Page picker.
    await revokeFacebookPermissions(longLived.accessToken).catch((error) => {
      functions.logger.warn("Could not release the empty Facebook grant", {
        error: error instanceof Error ? error.name : "unknown",
      });
    });
    throw new MetaConnectError("meta/no-pages");
  }

  // Keep whichever Page was already selected if this is a reconnect, so
  // re-authorizing does not silently retarget a week of posts.
  //
  // With no prior selection there is nothing to keep, and picking the first
  // Page Meta happens to return is a decision wearing a default's clothing:
  // whoever connects gets whichever Page sorts first, never having been asked.
  // An empty id means "not chosen yet" — the sheet asks, and publishing
  // refuses until it has an answer. One Page is not a decision, so it stands.
  const existing = await readConnections(uid);
  const previous = existing.facebookPage?.selectedPageId;
  const selectedPageId =
    previous && pages.some((page) => page.id === previous)
      ? previous
      : pages.length === 1
        ? pages[0].id
        : "";

  const now = Date.now();
  await writeFacebookConnection(uid, {
    userAccessToken: longLived.accessToken,
    issuedAt: admin.firestore.Timestamp.fromMillis(now),
    expiresAt: admin.firestore.Timestamp.fromMillis(
      now + longLived.expiresIn * 1000
    ),
    connectedAt: admin.firestore.Timestamp.fromMillis(now),
    pages,
    selectedPageId,
  });

  return (
    pages.find((page) => page.id === selectedPageId)?.name ?? "Facebook Page"
  );
}

/** Polled by the client after the popup reports back, mirroring the sign-in
 *  handshake's completion step. */
export const completeMetaConnect = onCall(async (request) => {
  const uid = requireSignedInCaller(request);
  const state =
    typeof request.data?.state === "string" ? request.data.state : "";
  if (!isMetaConnectStateId(state)) {
    throw new HttpsError("invalid-argument", "Invalid connection state", {
      reason: "meta/state-invalid",
    });
  }

  const stored = await getMetaConnectState(state);
  if (!stored.data) {
    throw new HttpsError("not-found", "Connection state was not found", {
      reason: "meta/state-invalid",
    });
  }
  if (stored.data.requesterUid !== uid) {
    throw new HttpsError(
      "permission-denied",
      "That connection belongs to another session",
      { reason: "meta/state-invalid" }
    );
  }
  if (stored.data.expiresAt.toMillis() <= Date.now()) {
    return { status: "error" as const, errorCode: "meta/state-expired" };
  }
  if (stored.data.status === "error") {
    return {
      status: "error" as const,
      errorCode: stored.data.errorCode ?? "meta/provider-error",
    };
  }
  if (stored.data.status !== "complete") {
    return { status: "pending" as const };
  }

  return {
    status: "complete" as const,
    target: stored.data.target,
    accountName: stored.data.accountName ?? "",
  };
});

/**
 * Gives the Facebook grant back to Meta and forgets the local credential.
 *
 * Deleting only the local copy leaves Meta still authorized, which is what
 * made disconnecting and reconnecting land on the same Pages every time.
 *
 * The revoke is best effort: a token Meta has already invalidated cannot be
 * revoked, and refusing to disconnect over that would strand someone with a
 * connection they can neither use nor replace. Clearing local state regardless
 * keeps the sheet honest — it says disconnected because it is.
 */
async function releaseFacebookGrant(uid: string): Promise<void> {
  const existing = await readConnections(uid);
  const token = existing.facebookPage?.userAccessToken;
  if (token) {
    await revokeFacebookPermissions(token).catch((error) => {
      functions.logger.warn("Could not revoke the Facebook grant", {
        error: error instanceof Error ? error.name : "unknown",
      });
    });
  }
  await clearConnection(uid, "facebook-page");
}

export const disconnectMetaAccount = onCall(async (request) => {
  const uid = requireSignedInCaller(request);
  const target = parseTarget(request.data?.target);
  if (target === "facebook-page") {
    await releaseFacebookGrant(uid);
  } else {
    await clearConnection(uid, target);
  }
  return { disconnected: true };
});

export const selectMetaFacebookPage = onCall(async (request) => {
  const uid = requireSignedInCaller(request);
  const pageId =
    typeof request.data?.pageId === "string" ? request.data.pageId : "";
  const selected = await selectFacebookPage(uid, pageId);
  if (!selected) {
    throw new HttpsError("not-found", "That Page is not connected", {
      reason: "meta/page-unknown",
    });
  }
  return { selected: true };
});

/** Rebuilds the client-readable mirror. Cheap repair path for a status doc
 *  that predates a schema change or was never written. */
export const refreshMetaPublishStatus = onCall(async (request) => {
  const uid = requireSignedInCaller(request);
  return await syncStatus(uid);
});
