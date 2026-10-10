import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const auth = {
    getUser: vi.fn(),
    listUsers: vi.fn(),
    setCustomUserClaims: vi.fn(),
    revokeRefreshTokens: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
  };
  return {
    requireAdmin: vi.fn(),
    withRateLimit: vi.fn(),
    logAdminAction: vi.fn(),
    auth,
    updateProfile: vi.fn(),
    setAdminMetadata: vi.fn(),
    batchSet: vi.fn(),
    batchUpdate: vi.fn(),
    batchDelete: vi.fn(),
    batchCommit: vi.fn(),
    restGetDocument: vi.fn(),
    restQueryDocuments: vi.fn(),
    restCommit: vi.fn(),
    runTransaction: vi.fn(),
    mutationLocks: new Map<string, Record<string, unknown>>(),
    contributorDocs: [] as string[],
    privateMetadata: {} as Record<string, unknown>,
    ownerPrivateMetadata: {} as Record<string, unknown>,
    publicProfile: {} as Record<string, unknown>,
  };
});

vi.mock("#lib/server/auth/requireAdmin.js", () => ({
  requireAdmin: mocks.requireAdmin,
}));
vi.mock("#lib/server/security/withRateLimit.js", () => ({
  withRateLimit: mocks.withRateLimit,
}));
vi.mock("#lib/server/security/rate-limiter.js", () => ({
  RATE_LIMITS: { ADMIN: {} },
}));
vi.mock("#lib/server/security/audit-logger.js", () => ({
  logAdminAction: mocks.logAdminAction,
}));
vi.mock("#lib/server/firebaseAdmin.js", () => ({
  getAdminAuth: () => mocks.auth,
  getAdminDb: () => ({
    runTransaction: mocks.runTransaction,
    collection: (name: string) => {
      const query = {
        where: () => query,
        limit: () => query,
        get: async () => {
          const docs =
            name === "contributors"
              ? mocks.contributorDocs.map((id) => ({ id }))
              : [];
          return { empty: docs.length === 0, docs };
        },
        add: vi.fn(),
        doc: (id: string) => ({
          id,
          path: `${name}/${id}`,
          delete: vi.fn(),
          set: vi.fn(),
        }),
      };
      return query;
    },
    batch: () => ({
      set: mocks.batchSet,
      update: mocks.batchUpdate,
      delete: mocks.batchDelete,
      commit: mocks.batchCommit,
    }),
    doc: (path: string) => ({
      path,
      id: path.split("/").at(-1),
      update: mocks.updateProfile,
      set: mocks.setAdminMetadata,
      get: vi.fn().mockResolvedValue({
        exists: true,
        data: () =>
          path.startsWith("userAdminMetadata/")
            ? mocks.privateMetadata
            : path.startsWith("userPrivateProfiles/")
              ? mocks.ownerPrivateMetadata
              : mocks.publicProfile,
      }),
    }),
  }),
}));
vi.mock("#lib/server/auth/firebase-auth-rest.js", () => ({
  getFirebaseAuthRest: () => ({ getUser: mocks.auth.getUser }),
}));
vi.mock("#lib/server/firestore/firestore-rest.js", () => {
  function toFirestoreValue(value: unknown): Record<string, unknown> {
    if (value === null || value === undefined) return { nullValue: null };
    if (typeof value === "string") return { stringValue: value };
    if (typeof value === "boolean") return { booleanValue: value };
    if (typeof value === "number") return { integerValue: String(value) };
    return {
      mapValue: {
        fields: toFirestoreFields(value as Record<string, unknown>),
      },
    };
  }
  function toFirestoreFields(value: Record<string, unknown>) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toFirestoreValue(item)])
    );
  }
  function fromFirestoreValue(value: Record<string, unknown>): unknown {
    if ("nullValue" in value) return null;
    if ("stringValue" in value) return value.stringValue;
    if ("booleanValue" in value) return value.booleanValue;
    if ("integerValue" in value) return Number(value.integerValue);
    if ("mapValue" in value) {
      return fromFirestoreFields(
        (value.mapValue as { fields?: Record<string, Record<string, unknown>> })
          .fields ?? {}
      );
    }
    return undefined;
  }
  function fromFirestoreFields(
    fields: Record<string, Record<string, unknown>>
  ) {
    return Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [
        key,
        fromFirestoreValue(value),
      ])
    );
  }
  return {
    toFirestoreFields,
    fromFirestoreFields,
    getFirestoreRest: () => ({
      documentName: (path: string) =>
        `projects/test/databases/(default)/documents/${path}`,
      getDocument: mocks.restGetDocument,
      queryDocuments: mocks.restQueryDocuments,
      commit: mocks.restCommit,
    }),
  };
});

import {
  DELETE,
  GET,
  PATCH,
} from "../../src/routes/api/admin/user-auth/[uid]/+server";

function user(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    uid,
    email: `${uid}@example.com`,
    emailVerified: true,
    displayName: uid,
    photoURL: null,
    phoneNumber: null,
    disabled: false,
    providerData: [],
    metadata: {},
    multiFactor: null,
    customClaims: { role: "admin", admin: true, isAdmin: true },
    ...overrides,
  };
}

function event(body?: unknown, uid = "target") {
  return {
    params: { uid },
    request: new Request(`https://example.test/api/admin/user-auth/${uid}`, {
      method: body ? "PATCH" : "DELETE",
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
    getClientAddress: () => "127.0.0.1",
  };
}

describe("admin user mutation handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.privateMetadata = {};
    mocks.ownerPrivateMetadata = {};
    mocks.publicProfile = {};
    mocks.contributorDocs = [];
    mocks.mutationLocks.clear();
    mocks.requireAdmin.mockResolvedValue({ uid: "caller" });
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.auth.getUser.mockResolvedValue(user("target"));
    mocks.auth.listUsers.mockResolvedValue({
      users: [user("target"), user("other")],
      pageToken: undefined,
    });
    mocks.auth.setCustomUserClaims.mockResolvedValue(undefined);
    mocks.auth.revokeRefreshTokens.mockResolvedValue(undefined);
    mocks.auth.updateUser.mockImplementation(async (uid, update) =>
      user(uid, update)
    );
    mocks.auth.deleteUser.mockResolvedValue(undefined);
    mocks.runTransaction.mockImplementation(
      async (
        operation: (transaction: {
          get: (reference: { path: string }) => Promise<unknown>;
          set: (
            reference: { path: string },
            data: Record<string, unknown>
          ) => void;
          update: (
            reference: { path: string },
            data: Record<string, unknown>
          ) => void;
          delete: (reference: { path: string }) => void;
        }) => Promise<void>
      ) =>
        operation({
          get: async (reference) => ({
            exists: mocks.mutationLocks.has(reference.path),
            data: () => mocks.mutationLocks.get(reference.path) ?? {},
          }),
          set: (reference, data) => {
            mocks.mutationLocks.set(reference.path, data);
          },
          update: (reference, data) => {
            mocks.mutationLocks.set(reference.path, {
              ...mocks.mutationLocks.get(reference.path),
              ...data,
            });
          },
          delete: (reference) => {
            mocks.mutationLocks.delete(reference.path);
          },
        })
    );
    mocks.updateProfile.mockResolvedValue(undefined);
    mocks.setAdminMetadata.mockResolvedValue(undefined);
    mocks.batchCommit.mockImplementation(async () => {
      for (const [reference] of mocks.batchDelete.mock.calls as Array<
        [{ id: string; path: string }]
      >) {
        if (reference.path.startsWith("contributors/")) {
          mocks.contributorDocs = mocks.contributorDocs.filter(
            (id) => id !== reference.id
          );
        }
      }
      for (const [reference, data] of mocks.batchSet.mock.calls as Array<
        [{ id: string; path: string }, Record<string, unknown>]
      >) {
        if (reference.path.startsWith("contributors/")) {
          if (!mocks.contributorDocs.includes(reference.id)) {
            mocks.contributorDocs.push(reference.id);
          }
        } else if (reference.path.startsWith("userAdminMetadata/")) {
          mocks.privateMetadata = { ...mocks.privateMetadata, ...data };
        }
      }
      for (const [reference, data] of mocks.batchUpdate.mock.calls as Array<
        [{ path: string }, Record<string, unknown>]
      >) {
        if (reference.path.startsWith("users/")) {
          mocks.publicProfile = { ...mocks.publicProfile, ...data };
        }
      }
    });
    mocks.restGetDocument.mockImplementation(async (path: string) => {
      const data = path.startsWith("userAdminMetadata/")
        ? mocks.privateMetadata
        : path.startsWith("userPrivateProfiles/")
          ? mocks.ownerPrivateMetadata
          : mocks.publicProfile;
      const fields = Object.fromEntries(
        Object.entries(data).map(([key, value]) => [
          key,
          value === null
            ? { nullValue: null }
            : typeof value === "number"
              ? { integerValue: String(value) }
              : { stringValue: String(value) },
        ])
      );
      return {
        name: `projects/test/databases/(default)/documents/${path}`,
        fields,
      };
    });
    mocks.restQueryDocuments.mockImplementation(async () =>
      mocks.contributorDocs.map((id) => ({
        name: `projects/test/databases/(default)/documents/contributors/${id}`,
      }))
    );
    mocks.restCommit.mockImplementation(async (writes) => {
      for (const write of writes as Array<{
        update?: {
          name: string;
          fields: Record<string, Record<string, unknown>>;
        };
        updateMask?: { fieldPaths: string[] };
      }>) {
        if (!write.update) continue;
        const data = Object.fromEntries(
          Object.entries(write.update.fields).map(([key, value]) => [
            key,
            "nullValue" in value
              ? null
              : "stringValue" in value
                ? value.stringValue
                : "integerValue" in value
                  ? Number(value.integerValue)
                  : undefined,
          ])
        );
        if (write.update.name.includes("/userAdminMetadata/")) {
          mocks.privateMetadata = { ...mocks.privateMetadata, ...data };
        }
        if (write.update.name.includes("/users/")) {
          const next = { ...mocks.publicProfile, ...data };
          for (const field of write.updateMask?.fieldPaths ?? []) {
            if (!(field in data)) delete next[field];
          }
          mocks.publicProfile = next;
        }
      }
      return { commitTime: new Date().toISOString() };
    });
  });

  it("keeps role claims and Firestore privilege fields in parity", async () => {
    const response = await PATCH(
      event({ action: "role", role: "tester" }) as never
    );
    expect(response.status).toBe(200);
    expect(mocks.auth.setCustomUserClaims).toHaveBeenCalledWith(
      "target",
      expect.objectContaining({ role: "tester", admin: false, isAdmin: false })
    );
    expect(mocks.updateProfile).toHaveBeenCalledWith({
      role: "tester",
      isAdmin: false,
    });
    expect(mocks.auth.revokeRefreshTokens).toHaveBeenCalledWith("target");
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: "caller",
        target: "target",
        action: "user_role_update",
      }),
      undefined
    );
  });

  it("rejects unauthorized callers before reading or mutating the target", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(
      Object.assign(new Error("Admin access required"), { status: 403 })
    );
    await expect(
      PATCH(event({ action: "role", role: "tester" }) as never)
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.auth.getUser).not.toHaveBeenCalled();
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it("returns rate limiting before reading or mutating the target", async () => {
    const blocked = new Response("blocked", { status: 429 });
    mocks.withRateLimit.mockResolvedValueOnce(blocked);
    expect(
      await PATCH(event({ action: "role", role: "tester" }) as never)
    ).toBe(blocked);
    expect(mocks.auth.getUser).not.toHaveBeenCalled();
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it("rolls Auth claims back when the Firestore role projection fails", async () => {
    mocks.updateProfile.mockRejectedValueOnce(new Error("write failed"));
    await expect(
      PATCH(event({ action: "role", role: "tester" }) as never)
    ).rejects.toMatchObject({ status: 500 });
    expect(mocks.auth.setCustomUserClaims).toHaveBeenNthCalledWith(
      2,
      "target",
      { role: "admin", admin: true, isAdmin: true }
    );
  });

  it("never lets a stale lease holder roll Auth state over its successor", async () => {
    mocks.updateProfile.mockImplementationOnce(async () => {
      for (const [path, lock] of mocks.mutationLocks) {
        mocks.mutationLocks.set(path, { ...lock, owner: "replacement-owner" });
      }
      throw new Error("write failed after lease transfer");
    });

    await expect(
      PATCH(event({ action: "role", role: "tester" }) as never)
    ).rejects.toMatchObject({ status: 500 });

    expect(mocks.auth.setCustomUserClaims).toHaveBeenCalledTimes(1);
    expect(mocks.auth.setCustomUserClaims).toHaveBeenCalledWith(
      "target",
      expect.objectContaining({ role: "tester" })
    );
  });

  it("disables Admin Auth and its Firestore projection", async () => {
    await PATCH(event({ action: "disabled", disabled: true }) as never);
    expect(mocks.auth.updateUser).toHaveBeenCalledWith("target", {
      disabled: true,
    });
    expect(mocks.updateProfile).toHaveBeenCalledWith({ isDisabled: true });
    expect(mocks.auth.revokeRefreshTokens).toHaveBeenCalledWith("target");
  });

  it("rejects self mutation and removal of the last enabled admin", async () => {
    mocks.requireAdmin.mockResolvedValueOnce({ uid: "target" });
    await expect(
      PATCH(event({ action: "role", role: "user" }) as never)
    ).rejects.toMatchObject({ status: 409 });

    mocks.requireAdmin.mockResolvedValue({ uid: "caller" });
    mocks.auth.listUsers.mockResolvedValue({
      users: [user("target")],
      pageToken: undefined,
    });
    await expect(DELETE(event(undefined) as never)).rejects.toMatchObject({
      status: 409,
    });
    expect(mocks.auth.deleteUser).not.toHaveBeenCalled();
  });

  it("serializes admin-set mutations so concurrent requests cannot remove both admins", async () => {
    let releaseList:
      | ((value: { users: unknown[]; pageToken: undefined }) => void)
      | undefined;
    mocks.auth.listUsers.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseList = resolve;
        })
    );

    const first = PATCH(
      event({ action: "role", role: "user" }, "target") as never
    );
    await vi.waitFor(() =>
      expect(mocks.mutationLocks.has("adminMutationLocks/last-admin")).toBe(
        true
      )
    );

    await expect(
      PATCH(event({ action: "disabled", disabled: true }, "other") as never)
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.auth.updateUser).not.toHaveBeenCalledWith("other", {
      disabled: true,
    });

    releaseList?.({
      users: [user("target"), user("other")],
      pageToken: undefined,
    });
    expect((await first).status).toBe(200);
    expect(mocks.mutationLocks.size).toBe(0);
  });

  it("accepts Firestore-compatible custom Firebase UIDs", async () => {
    const response = await GET(event(undefined, "tenant:sky.v2") as never);
    expect(response.status).toBe(200);
  });

  it("does not count a stale Firestore admin projection without live admin claims", async () => {
    mocks.auth.listUsers.mockResolvedValue({
      users: [
        user("target"),
        user("other", {
          customClaims: { role: "user", admin: false, isAdmin: false },
        }),
      ],
      pageToken: undefined,
    });
    await expect(DELETE(event(undefined) as never)).rejects.toMatchObject({
      status: 409,
    });
    expect(mocks.auth.deleteUser).not.toHaveBeenCalled();
  });

  it("protects the sole live admin even when no Firestore projection exists", async () => {
    mocks.auth.listUsers.mockResolvedValue({
      users: [user("target")],
      pageToken: undefined,
    });
    await expect(DELETE(event(undefined) as never)).rejects.toMatchObject({
      status: 409,
    });
    expect(mocks.auth.deleteUser).not.toHaveBeenCalled();
  });

  it("migrates legacy private profile fields before stripping the public copy", async () => {
    mocks.publicProfile = {
      displayName: "Target",
      adminLabel: "Tuesday jam",
      adminNotes: "Private note",
    };
    const response = await GET(event(undefined) as never);
    expect(mocks.restCommit).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([
        expect.objectContaining({
          update: expect.objectContaining({
            name: expect.stringContaining("userAdminMetadata/target"),
          }),
          updateMask: { fieldPaths: ["adminLabel", "adminNotes"] },
        }),
      ])
    );
    expect(mocks.restCommit).toHaveBeenNthCalledWith(
      2,
      expect.arrayContaining([
        expect.objectContaining({
          update: expect.objectContaining({
            fields: expect.objectContaining({
              publicProfileVersion: { integerValue: "2" },
            }),
          }),
        }),
      ])
    );
    await expect(response.json()).resolves.toMatchObject({
      adminMetadata: {
        adminLabel: "Tuesday jam",
        adminNotes: "Private note",
      },
    });
  });

  it("removes a stale public marker when legacy migration finds an unknown field", async () => {
    mocks.publicProfile = {
      publicProfileVersion: 2,
      displayName: "Target",
      adminLabel: "Tuesday jam",
      futureSecret: "not-public",
    };

    await GET(event(undefined) as never);

    const publicWrite = mocks.restCommit.mock.calls[1]![0][0];
    expect(publicWrite.updateMask.fieldPaths).toEqual(
      expect.arrayContaining(["publicProfileVersion", "adminLabel"])
    );
    expect(publicWrite.update.fields).not.toHaveProperty(
      "publicProfileVersion"
    );
  });

  it("does not stamp a clean profile during an admin read", async () => {
    mocks.publicProfile = { displayName: "Target" };

    await GET(event(undefined) as never);

    expect(mocks.restCommit).not.toHaveBeenCalled();
  });

  it("writes admin metadata only to the server-private document", async () => {
    await PATCH(
      event({ action: "profile", adminLabel: "Known user" }) as never
    );
    expect(mocks.batchSet).toHaveBeenCalledWith(
      expect.objectContaining({ path: "userAdminMetadata/target" }),
      { adminLabel: "Known user" },
      { merge: true }
    );
    expect(mocks.updateProfile).not.toHaveBeenCalledWith(
      expect.objectContaining({ adminLabel: expect.anything() })
    );
  });

  it("uses the user ID as the contributor document and removes legacy duplicates", async () => {
    mocks.contributorDocs = ["legacy-one", "legacy-two"];
    mocks.publicProfile = { displayName: "Target", avatar: "avatar.svg" };

    const response = await PATCH(
      event({ action: "contributor", active: true }) as never
    );

    expect(response.status).toBe(200);
    expect(mocks.batchSet).toHaveBeenCalledWith(
      expect.objectContaining({ id: "target" }),
      {
        userId: "target",
        displayName: "Target",
        avatarUrl: "avatar.svg",
      }
    );
    expect(mocks.batchDelete).toHaveBeenCalledTimes(2);
    expect(mocks.contributorDocs).toEqual(["target"]);
    await expect(response.json()).resolves.toMatchObject({
      auth: { contributor: { active: true, id: "target" } },
    });
  });

  it("removes every contributor duplicate plus the deterministic document", async () => {
    mocks.contributorDocs = ["target", "legacy-one", "legacy-two"];

    const response = await PATCH(
      event({ action: "contributor", active: false }) as never
    );

    expect(response.status).toBe(200);
    expect(mocks.batchDelete).toHaveBeenCalledTimes(3);
    expect(mocks.contributorDocs).toEqual([]);
    await expect(response.json()).resolves.toMatchObject({
      auth: { contributor: { active: false, id: null } },
    });
  });

  it("preserves profile photos and refreshes contributor identity on rename", async () => {
    mocks.publicProfile = {
      displayName: "Target",
      avatar: "custom-avatar.svg",
      photoURL: "https://provider.example/photo.jpg",
    };
    mocks.contributorDocs = ["target", "legacy-contributor"];

    const response = await PATCH(
      event({ action: "profile", displayName: "Renamed" }) as never
    );

    expect(response.status).toBe(200);
    expect(mocks.auth.updateUser).toHaveBeenCalledWith("target", {
      displayName: "Renamed",
    });
    expect(mocks.batchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ path: "users/target" }),
      { displayName: "Renamed" }
    );
    expect(mocks.batchUpdate).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        avatar: expect.anything(),
        photoURL: expect.anything(),
      })
    );
    expect(mocks.batchSet).toHaveBeenCalledWith(
      expect.objectContaining({ path: "contributors/target" }),
      {
        userId: "target",
        displayName: "Renamed",
        avatarUrl: "https://provider.example/photo.jpg",
      }
    );
    expect(mocks.contributorDocs).toEqual(["target"]);
  });

  it("serializes rename and contributor mutations for the same account", async () => {
    mocks.publicProfile = {
      displayName: "Target",
      avatar: "avatar.svg",
    };
    mocks.contributorDocs = ["target"];
    let releaseRename: ((value: unknown) => void) | undefined;
    mocks.auth.updateUser.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseRename = resolve;
        })
    );

    const rename = PATCH(
      event({ action: "profile", displayName: "Renamed" }) as never
    );
    await vi.waitFor(() => expect(mocks.mutationLocks.size).toBe(1));

    await expect(
      PATCH(event({ action: "contributor", active: false }) as never)
    ).rejects.toMatchObject({ status: 409 });

    releaseRename?.(user("target", { displayName: "Renamed" }));
    expect((await rename).status).toBe(200);
    expect(mocks.mutationLocks.size).toBe(0);
  });

  it("does not resolve a mutation response until its audit attempt completes", async () => {
    let releaseAudit: (() => void) | undefined;
    mocks.logAdminAction.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseAudit = resolve;
        })
    );

    let settled = false;
    const responsePromise = PATCH(
      event({ action: "profile", adminLabel: "Known user" }) as never
    ).then((response) => {
      settled = true;
      return response;
    });
    await vi.waitFor(() => expect(mocks.logAdminAction).toHaveBeenCalled());
    expect(settled).toBe(false);
    releaseAudit?.();
    expect((await responsePromise).status).toBe(200);
  });

  it("deletes through Admin Auth and attributes the destructive audit event", async () => {
    const response = await DELETE(event(undefined) as never);
    expect(response.status).toBe(200);
    expect(mocks.auth.deleteUser).toHaveBeenCalledWith("target");
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: "caller",
        target: "target",
        action: "user_deleted",
      }),
      undefined
    );
  });
});
