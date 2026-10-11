import { describe, expect, it, vi } from "vitest";
import {
  FirestoreRestError,
  type FirestoreRest,
} from "#lib/server/firestore/firestore-rest.js";
import { createPhoneSignInStore } from "#lib/server/auth/phone-sign-in-store.js";

const ROOT = "projects/the-kinetic-alphabet/databases/(default)/documents/";
const ID = "AbCdEfGhIjKlMnOpQr12";

function fakeFirestore() {
  const rest = {
    getDocument: vi.fn(),
    commit: vi.fn(async () => ({ commitTime: "2026-10-10T20:00:01Z" })),
    documentName: (path: string) => ROOT + path,
  };
  return {
    rest,
    store: createPhoneSignInStore(() => rest as unknown as FirestoreRest),
  };
}

function refusal(status: number, rpcStatus: string): FirestoreRestError {
  return new FirestoreRestError(
    `Firestore REST commit failed (${status})`,
    status,
    JSON.stringify({ error: { code: status, status: rpcStatus } })
  );
}

describe("phone sign-in Firestore store", () => {
  it("reads a document with its revision and every timestamp as a Date", async () => {
    const { rest, store } = fakeFirestore();
    rest.getDocument.mockResolvedValue({
      name: `${ROOT}phone_sign_in_requests/${ID}`,
      createTime: "2026-10-10T20:00:00.000001Z",
      updateTime: "2026-10-10T20:00:05.123456Z",
      fields: {
        status: { stringValue: "pending" },
        createdAt: { timestampValue: "2026-10-10T20:00:00Z" },
        attempts: { integerValue: "2" },
        decidedBy: {
          mapValue: {
            fields: {
              uid: { stringValue: "austen" },
              at: { timestampValue: "2026-10-10T20:00:04Z" },
            },
          },
        },
        seen: {
          arrayValue: { values: [{ timestampValue: "2026-10-10T20:00:02Z" }] },
        },
        note: { nullValue: null },
      },
    });

    const doc = await store.getWithRevision("phone_sign_in_requests", ID);

    expect(rest.getDocument).toHaveBeenCalledWith(
      `phone_sign_in_requests/${ID}`
    );
    expect(doc).toEqual({
      revision: "2026-10-10T20:00:05.123456Z",
      createTime: "2026-10-10T20:00:00.000001Z",
      data: {
        status: "pending",
        createdAt: new Date("2026-10-10T20:00:00Z"),
        attempts: 2,
        decidedBy: { uid: "austen", at: new Date("2026-10-10T20:00:04Z") },
        seen: [new Date("2026-10-10T20:00:02Z")],
        note: null,
      },
    });
    await expect(store.get("phone_sign_in_requests", ID)).resolves.toEqual(
      doc?.data
    );
  });

  it("reads a missing document as null", async () => {
    const { rest, store } = fakeFirestore();
    rest.getDocument.mockResolvedValue(null);

    await expect(store.get("trusted_phones", "austen")).resolves.toBeNull();
    await expect(
      store.getWithRevision("trusted_phones", "austen")
    ).resolves.toBeNull();
  });

  it("replaces the whole document on set, writing Dates as timestamps", async () => {
    const { rest, store } = fakeFirestore();

    await store.set("trusted_phones", "austen", {
      keyTag: "abc",
      createdAt: new Date("2026-10-10T20:00:00Z"),
    });

    expect(rest.commit).toHaveBeenCalledWith([
      {
        update: {
          name: `${ROOT}trusted_phones/austen`,
          fields: {
            keyTag: { stringValue: "abc" },
            createdAt: { timestampValue: "2026-10-10T20:00:00.000Z" },
          },
        },
      },
    ]);
  });

  it("updates only the given fields, and only at the revision it read", async () => {
    const { rest, store } = fakeFirestore();

    const won = await store.updateIfCurrent(
      "phone_sign_in_requests",
      ID,
      { status: "used", usedAt: new Date("2026-10-10T20:00:06Z") },
      "2026-10-10T20:00:05.123456Z"
    );

    expect(won).toBe(true);
    expect(rest.commit).toHaveBeenCalledWith([
      {
        update: {
          name: `${ROOT}phone_sign_in_requests/${ID}`,
          fields: {
            status: { stringValue: "used" },
            usedAt: { timestampValue: "2026-10-10T20:00:06.000Z" },
          },
        },
        updateMask: { fieldPaths: ["status", "usedAt"] },
        currentDocument: { updateTime: "2026-10-10T20:00:05.123456Z" },
      },
    ]);
  });

  it.each([
    [400, "FAILED_PRECONDITION"],
    [409, "ABORTED"],
  ])(
    "reports a lost race (%i %s) as false without retrying",
    async (status, rpcStatus) => {
      const { rest, store } = fakeFirestore();
      rest.commit.mockRejectedValue(refusal(status, rpcStatus));

      await expect(
        store.updateIfCurrent(
          "phone_sign_in_requests",
          ID,
          { status: "used" },
          "rev"
        )
      ).resolves.toBe(false);
      expect(rest.commit).toHaveBeenCalledTimes(1);
    }
  );

  it("throws any other failure of a conditional write", async () => {
    const { rest, store } = fakeFirestore();
    rest.commit.mockRejectedValue(refusal(400, "INVALID_ARGUMENT"));

    await expect(
      store.updateIfCurrent(
        "phone_sign_in_requests",
        ID,
        { status: "used" },
        "rev"
      )
    ).rejects.toBeInstanceOf(FirestoreRestError);
  });

  it("quotes a field name Firestore's path syntax cannot take bare", async () => {
    const { rest, store } = fakeFirestore();

    await store.updateIfCurrent(
      "phone_sign_in_requests",
      ID,
      { "a-b": 1 },
      "rev"
    );

    expect(rest.commit.mock.calls[0][0][0].updateMask).toEqual({
      fieldPaths: ["`a-b`"],
    });
  });

  it("deletes through a commit", async () => {
    const { rest, store } = fakeFirestore();

    await store.delete("trusted_phones", "austen");

    expect(rest.commit).toHaveBeenCalledWith([
      { delete: `${ROOT}trusted_phones/austen` },
    ]);
  });

  it.each(["", ".", "..", "a/b"])(
    "refuses the document id %j before any request",
    async (id) => {
      const { rest, store } = fakeFirestore();

      await expect(store.get("trusted_phones", id)).rejects.toThrow(
        "Invalid Firestore path segment"
      );
      await expect(store.delete("trusted_phones", id)).rejects.toThrow();
      expect(rest.getDocument).not.toHaveBeenCalled();
      expect(rest.commit).not.toHaveBeenCalled();
    }
  );
});
