import type { UserRecord } from "firebase-admin/auth";

const getR2Client = jest.fn();
const deleteByPrefix = jest.fn();

jest.mock("../r2/r2-client", () => ({
  getR2Client: (...args: unknown[]) => getR2Client(...args),
  deleteByPrefix: (...args: unknown[]) => deleteByPrefix(...args),
}));

jest.mock("../pulse/notifyAdmins", () => ({
  notifyAdmins: jest.fn(),
}));

import {
  _cascadeDeleteFirestore,
  _handleAuthUserDeleted,
  _removeAdminMetadata,
  _removeFirebaseStorage,
  _removeR2Storage,
} from "./onAuthUserDeleted";

function user(
  uid: string,
  providerData: UserRecord["providerData"]
): UserRecord {
  return { uid, providerData, customClaims: {} } as unknown as UserRecord;
}

function operations() {
  return {
    readReason: jest.fn().mockResolvedValue("done"),
    writeTombstone: jest.fn().mockResolvedValue(undefined),
    cascadeDeleteFirestore: jest.fn().mockResolvedValue(undefined),
    removePresence: jest.fn().mockResolvedValue(undefined),
    removeInstagramAuthLinks: jest.fn().mockResolvedValue(undefined),
    removeAdminMetadata: jest.fn().mockResolvedValue(undefined),
    removeStorage: jest.fn().mockResolvedValue(undefined),
    removeR2Storage: jest.fn().mockResolvedValue(undefined),
    pingAdmins: jest.fn().mockResolvedValue(undefined),
  };
}

describe("Auth account deletion cleanup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.R2_ACCOUNT_ID = "account\n";
    process.env.R2_ACCESS_KEY_ID = "access-key\n";
    process.env.R2_SECRET_ACCESS_KEY = "secret-key\n";
    process.env.R2_BUCKET_NAME = "bucket\n";
  });

  it("deletes only the canonical R2 user prefix", async () => {
    const client = { send: jest.fn() };
    getR2Client.mockReturnValue(client);
    deleteByPrefix.mockResolvedValue(2);

    await _removeR2Storage("user-123");

    expect(getR2Client).toHaveBeenCalledWith(
      "account",
      "access-key",
      "secret-key"
    );
    expect(deleteByPrefix).toHaveBeenCalledWith(
      client,
      "bucket",
      "users/user-123/"
    );
  });

  it("cleans the safe Firebase staging prefix without touching finalized message images", async () => {
    const deleteFiles = jest.fn().mockResolvedValue(undefined);

    await _removeFirebaseStorage("user-123", { deleteFiles });

    const prefixes = deleteFiles.mock.calls.map(([options]) => options.prefix);
    expect(prefixes).toContain("message-image-staging/user-123/");
    expect(prefixes).not.toContain("message-images/user-123/");
    expect(
      prefixes.every((prefix) => !prefix.startsWith("message-images/"))
    ).toBe(true);
  });

  it("deletes the server-private admin metadata document", async () => {
    const deleteDocument = jest.fn().mockResolvedValue(undefined);
    const doc = jest.fn().mockReturnValue({ delete: deleteDocument });

    await _removeAdminMetadata("user-123", { doc });

    expect(doc).toHaveBeenCalledWith("userAdminMetadata/user-123");
    expect(doc).toHaveBeenCalledWith("userPrivateProfiles/user-123");
    expect(deleteDocument).toHaveBeenCalledTimes(2);
  });

  it("deletes public projections and claims owned by the deleted account", async () => {
    const deletedRefs = {
      publicSequences: { path: "publicSequences/public-1" },
      publicSequenceHashes: { path: "publicSequenceHashes/hash-1" },
      contributors: { path: "contributors/contributor-1" },
      usernames: { path: "usernames/deleted.user" },
    };
    const locationDelete = jest.fn().mockResolvedValue(undefined);
    const deleteFromBatch = jest.fn();
    const commit = jest.fn().mockResolvedValue(undefined);
    const collection = jest.fn((name: keyof typeof deletedRefs) => {
      let readCount = 0;
      const get = jest.fn(async () => {
        readCount += 1;
        return readCount === 1
          ? { empty: false, docs: [{ ref: deletedRefs[name] }] }
          : { empty: true, docs: [] };
      });
      const query = { limit: jest.fn(() => ({ get })) };
      return {
        where: jest.fn(() => query),
      };
    });
    const listDocuments = jest.fn().mockResolvedValue([]);
    const userRef = {
      path: "users/deleted-user",
      collection: jest.fn(() => ({ listDocuments })),
    };
    const db = {
      collection,
      doc: jest.fn((path: string) =>
        path === "userLocations/deleted-user"
          ? { path, delete: locationDelete }
          : userRef
      ),
      batch: jest.fn(() => ({ delete: deleteFromBatch, commit })),
      recursiveDelete: jest.fn().mockResolvedValue(undefined),
    };

    await _cascadeDeleteFirestore(
      "deleted-user",
      db as unknown as FirebaseFirestore.Firestore
    );

    expect(collection).toHaveBeenCalledWith("publicSequences");
    expect(collection).toHaveBeenCalledWith("publicSequenceHashes");
    expect(collection).toHaveBeenCalledWith("contributors");
    expect(deleteFromBatch).toHaveBeenCalledWith(deletedRefs.publicSequences);
    expect(deleteFromBatch).toHaveBeenCalledWith(
      deletedRefs.publicSequenceHashes
    );
    expect(deleteFromBatch).toHaveBeenCalledWith(deletedRefs.contributors);
    expect(collection).toHaveBeenCalledWith("usernames");
    expect(deleteFromBatch).toHaveBeenCalledWith(deletedRefs.usernames);
    expect(locationDelete).toHaveBeenCalled();
    expect(db.recursiveDelete).toHaveBeenCalledWith(userRef);
  });

  it.each([
    ["anonymous", user("anon-user", [])],
    [
      "full account",
      user("full-user", [
        {
          uid: "full-user",
          displayName: "Full User",
          email: "full@example.com",
          phoneNumber: "",
          photoURL: "",
          providerId: "password",
          toJSON: () => ({}),
        },
      ]),
    ],
  ])(
    "runs required R2 cleanup for the %s deletion path",
    async (_path, deletedUser) => {
      const ops = operations();

      await _handleAuthUserDeleted(deletedUser, ops);

      expect(ops.removeR2Storage).toHaveBeenCalledWith(deletedUser.uid);
      expect(ops.removeAdminMetadata).toHaveBeenCalledWith(deletedUser.uid);
    }
  );

  it("rejects the trigger work when R2 deletion fails so Firebase can retry", async () => {
    const ops = operations();
    ops.removeR2Storage.mockRejectedValue(new Error("R2 unavailable"));

    await expect(
      _handleAuthUserDeleted(user("full-user", []), ops)
    ).rejects.toThrow("R2 unavailable");
  });

  it("rejects when private admin metadata cleanup fails", async () => {
    const ops = operations();
    ops.removeAdminMetadata.mockRejectedValue(
      new Error("metadata delete unavailable")
    );

    await expect(
      _handleAuthUserDeleted(user("full-user", []), ops)
    ).rejects.toThrow("metadata delete unavailable");
  });
});
