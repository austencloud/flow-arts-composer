import {
  getServiceAccountAuthorizer,
  type ServiceAccountAuthorizer,
} from "#lib/server/google/service-account-authorizer.js";

const IDENTITY_TOOLKIT_HOST = "https://identitytoolkit.googleapis.com/v1";
const IDENTITY_TOOLKIT_SCOPE =
  "https://www.googleapis.com/auth/identitytoolkit";

interface IdentityToolkitProvider {
  providerId?: string;
  rawId?: string;
  federatedId?: string;
  displayName?: string;
  email?: string;
  phoneNumber?: string;
  photoUrl?: string;
}

interface IdentityToolkitMfaEnrollment {
  mfaEnrollmentId?: string;
  displayName?: string;
  enrolledAt?: string;
  phoneInfo?: string;
  unobfuscatedPhoneInfo?: string;
  totpInfo?: Record<string, unknown>;
}

interface IdentityToolkitUser {
  localId?: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  photoUrl?: string;
  phoneNumber?: string;
  disabled?: boolean;
  providerUserInfo?: IdentityToolkitProvider[];
  createdAt?: string;
  lastLoginAt?: string;
  validSince?: string;
  customAttributes?: string;
  mfaInfo?: IdentityToolkitMfaEnrollment[];
}

export interface FirebaseAuthUser {
  uid: string;
  email?: string;
  emailVerified: boolean;
  displayName?: string;
  photoURL?: string;
  phoneNumber?: string;
  disabled: boolean;
  providerData: Array<{
    providerId: string;
    uid: string;
    displayName?: string;
    email?: string;
    phoneNumber?: string;
    photoURL?: string;
  }>;
  metadata: {
    creationTime?: string;
    lastSignInTime?: string;
  };
  multiFactor: {
    enrolledFactors: Array<{
      uid: string;
      displayName?: string;
      factorId: string;
      enrollmentTime?: string;
    }>;
  } | null;
  customClaims: Record<string, unknown>;
  tokensValidAfterTime?: string;
}

export class FirebaseAuthRestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly responseBody: string
  ) {
    super(message);
    this.name = "FirebaseAuthRestError";
  }
}

function millisToIso(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const millis = Number(value);
  if (!Number.isFinite(millis)) return undefined;
  return new Date(millis).toISOString();
}

function secondsToIso(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return undefined;
  return new Date(seconds * 1000).toISOString();
}

function customClaims(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new FirebaseAuthRestError(
      "Firebase Auth returned invalid custom claims",
      "auth/internal-error",
      502,
      ""
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new FirebaseAuthRestError(
      "Firebase Auth returned invalid custom claims",
      "auth/internal-error",
      502,
      ""
    );
  }
  return parsed as Record<string, unknown>;
}

function factorId(enrollment: IdentityToolkitMfaEnrollment): string {
  if (enrollment.totpInfo) return "totp";
  if (enrollment.phoneInfo || enrollment.unobfuscatedPhoneInfo) return "phone";
  return "unknown";
}

function toFirebaseAuthUser(user: IdentityToolkitUser): FirebaseAuthUser {
  if (!user.localId) {
    throw new FirebaseAuthRestError(
      "Firebase Auth returned a user without a UID",
      "auth/internal-error",
      502,
      ""
    );
  }

  const enrollments = user.mfaInfo ?? [];
  return {
    uid: user.localId,
    ...(user.email ? { email: user.email } : {}),
    emailVerified: user.emailVerified === true,
    ...(user.displayName ? { displayName: user.displayName } : {}),
    ...(user.photoUrl ? { photoURL: user.photoUrl } : {}),
    ...(user.phoneNumber ? { phoneNumber: user.phoneNumber } : {}),
    disabled: user.disabled === true,
    providerData: (user.providerUserInfo ?? []).map((provider) => ({
      providerId: provider.providerId ?? "unknown",
      uid: provider.rawId ?? provider.federatedId ?? "",
      ...(provider.displayName ? { displayName: provider.displayName } : {}),
      ...(provider.email ? { email: provider.email } : {}),
      ...(provider.phoneNumber ? { phoneNumber: provider.phoneNumber } : {}),
      ...(provider.photoUrl ? { photoURL: provider.photoUrl } : {}),
    })),
    metadata: {
      creationTime: millisToIso(user.createdAt),
      lastSignInTime: millisToIso(user.lastLoginAt),
    },
    multiFactor:
      enrollments.length > 0
        ? {
            enrolledFactors: enrollments.map((enrollment) => ({
              uid: enrollment.mfaEnrollmentId ?? "",
              ...(enrollment.displayName
                ? { displayName: enrollment.displayName }
                : {}),
              factorId: factorId(enrollment),
              ...(enrollment.enrolledAt
                ? { enrollmentTime: enrollment.enrolledAt }
                : {}),
            })),
          }
        : null,
    customClaims: customClaims(user.customAttributes),
    tokensValidAfterTime: secondsToIso(user.validSince),
  };
}

function responseErrorCode(status: number, body: string): string {
  if (/USER_NOT_FOUND/i.test(body)) return "auth/user-not-found";
  if (status === 401) return "auth/invalid-credential";
  if (status === 403) return "auth/insufficient-permission";
  if (status === 404) return "auth/project-not-found";
  return "auth/internal-error";
}

export class FirebaseAuthRest {
  constructor(private readonly authorizer: ServiceAccountAuthorizer) {}

  async getUser(uid: string): Promise<FirebaseAuthUser> {
    const url =
      `${IDENTITY_TOOLKIT_HOST}/projects/` +
      `${encodeURIComponent(this.authorizer.projectId)}/accounts:lookup`;
    const response = await this.authorizer.authorizedFetch(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localId: [uid] }),
      },
      IDENTITY_TOOLKIT_SCOPE
    );
    const body = await response.text();
    if (!response.ok) {
      throw new FirebaseAuthRestError(
        `Firebase Auth lookup failed (${response.status})`,
        responseErrorCode(response.status, body),
        response.status,
        body.slice(0, 1500)
      );
    }

    let payload: { users?: IdentityToolkitUser[] };
    try {
      payload = JSON.parse(body) as { users?: IdentityToolkitUser[] };
    } catch {
      throw new FirebaseAuthRestError(
        "Firebase Auth lookup returned invalid JSON",
        "auth/internal-error",
        502,
        body.slice(0, 1500)
      );
    }
    const user = payload.users?.[0];
    if (!user) {
      throw new FirebaseAuthRestError(
        "No user record found",
        "auth/user-not-found",
        404,
        body.slice(0, 1500)
      );
    }
    return toFirebaseAuthUser(user);
  }

  async listUsers(
    maxResults = 1000,
    nextPageToken?: string
  ): Promise<{ users: FirebaseAuthUser[]; pageToken?: string }> {
    const query = new URLSearchParams({
      maxResults: String(Math.max(1, Math.min(Math.trunc(maxResults), 1000))),
    });
    if (nextPageToken) query.set("nextPageToken", nextPageToken);
    const url =
      `${IDENTITY_TOOLKIT_HOST}/projects/` +
      `${encodeURIComponent(this.authorizer.projectId)}/accounts:batchGet?${query}`;
    const response = await this.authorizer.authorizedFetch(
      url,
      { headers: { accept: "application/json" } },
      IDENTITY_TOOLKIT_SCOPE
    );
    const body = await response.text();
    if (!response.ok) {
      throw new FirebaseAuthRestError(
        `Firebase Auth list failed (${response.status})`,
        responseErrorCode(response.status, body),
        response.status,
        body.slice(0, 1500)
      );
    }

    let payload: {
      users?: IdentityToolkitUser[];
      nextPageToken?: string;
    };
    try {
      payload = JSON.parse(body) as typeof payload;
    } catch {
      throw new FirebaseAuthRestError(
        "Firebase Auth list returned invalid JSON",
        "auth/internal-error",
        502,
        body.slice(0, 1500)
      );
    }
    return {
      users: (payload.users ?? []).map(toFirebaseAuthUser),
      ...(payload.nextPageToken ? { pageToken: payload.nextPageToken } : {}),
    };
  }
}

let client: FirebaseAuthRest | null = null;
let clientAuthorizer: ServiceAccountAuthorizer | null = null;

export function getFirebaseAuthRest(
  platformCredential?: string
): FirebaseAuthRest {
  const authorizer = getServiceAccountAuthorizer(platformCredential);
  if (!client || clientAuthorizer !== authorizer) {
    client = new FirebaseAuthRest(authorizer);
    clientAuthorizer = authorizer;
  }
  return client;
}
