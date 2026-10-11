import { describe, expect, it, vi } from "vitest";
import {
  FirebaseAuthRest,
  FirebaseAuthRestError,
} from "#lib/server/auth/firebase-auth-rest.js";
import { ServiceAccountAuthorizer } from "#lib/server/google/service-account-authorizer.js";

function client(response: Response) {
  const fetchImpl = vi.fn(() =>
    Promise.resolve(response)
  ) as unknown as typeof fetch;
  const authorizer = new ServiceAccountAuthorizer(
    {
      project_id: "test-project",
      client_email: "auth@example.invalid",
      private_key: "not-used-by-this-test",
    },
    fetchImpl
  );
  vi.spyOn(authorizer, "getAccessToken").mockResolvedValue("cached-token");
  return { auth: new FirebaseAuthRest(authorizer), fetchImpl };
}

describe("FirebaseAuthRest", () => {
  it("maps an Identity Toolkit user into the server auth contract", async () => {
    const { auth, fetchImpl } = client(
      Response.json({
        users: [
          {
            localId: "admin-1",
            email: "admin@example.com",
            emailVerified: true,
            displayName: "Admin",
            photoUrl: "https://example.com/avatar.png",
            disabled: false,
            validSince: "1735689600",
            createdAt: "1704067200000",
            lastLoginAt: "1735776000000",
            customAttributes: JSON.stringify({ role: "admin", admin: true }),
            providerUserInfo: [
              {
                providerId: "google.com",
                rawId: "google-1",
                email: "admin@example.com",
              },
            ],
            mfaInfo: [
              {
                mfaEnrollmentId: "factor-1",
                displayName: "Phone",
                phoneInfo: "+15555550100",
                enrolledAt: "2025-01-02T00:00:00Z",
              },
            ],
          },
        ],
      })
    );

    await expect(auth.getUser("admin-1")).resolves.toMatchObject({
      uid: "admin-1",
      customClaims: { role: "admin", admin: true },
      tokensValidAfterTime: "2025-01-01T00:00:00.000Z",
      metadata: {
        creationTime: "2024-01-01T00:00:00.000Z",
        lastSignInTime: "2025-01-02T00:00:00.000Z",
      },
      providerData: [{ providerId: "google.com", uid: "google-1" }],
      multiFactor: {
        enrolledFactors: [{ uid: "factor-1", factorId: "phone" }],
      },
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://identitytoolkit.googleapis.com/v1/projects/test-project/accounts:lookup",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ localId: ["admin-1"] }),
      })
    );
  });

  it("classifies an empty lookup as a missing user", async () => {
    const { auth } = client(Response.json({}));

    await expect(auth.getUser("missing")).rejects.toMatchObject({
      code: "auth/user-not-found",
      status: 404,
    });
  });

  it("lists users with Identity Toolkit pagination", async () => {
    const { auth, fetchImpl } = client(
      Response.json({
        users: [{ localId: "user-1", email: "user@example.com" }],
        nextPageToken: "next-page",
      })
    );

    await expect(auth.listUsers(1000, "current-page")).resolves.toMatchObject({
      users: [{ uid: "user-1", email: "user@example.com" }],
      pageToken: "next-page",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://identitytoolkit.googleapis.com/v1/projects/test-project/accounts:batchGet?maxResults=1000&nextPageToken=current-page",
      expect.objectContaining({ headers: expect.any(Headers) })
    );
  });

  it("fails closed when Firebase returns malformed custom claims", async () => {
    const { auth } = client(
      Response.json({
        users: [{ localId: "admin-1", customAttributes: "not-json" }],
      })
    );

    await expect(auth.getUser("admin-1")).rejects.toBeInstanceOf(
      FirebaseAuthRestError
    );
  });

  it("preserves permission failures as stable Firebase-style codes", async () => {
    const { auth } = client(
      Response.json(
        { error: { message: "PERMISSION_DENIED" } },
        { status: 403 }
      )
    );

    await expect(auth.getUser("admin-1")).rejects.toMatchObject({
      code: "auth/insufficient-permission",
      status: 403,
    });
  });
});
