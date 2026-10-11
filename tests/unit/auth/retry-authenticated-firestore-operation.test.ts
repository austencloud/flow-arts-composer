import { describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import { retryAuthenticatedFirestoreOperation } from "#lib/shared/auth/services/retry-authenticated-firestore-operation.js";

function userWithRefresh(refresh = vi.fn(async () => "fresh-token")): User {
  return { getIdToken: refresh } as unknown as User;
}

describe("retryAuthenticatedFirestoreOperation", () => {
  it("refreshes the linked user's token and retries one permission race", async () => {
    const refresh = vi.fn(async () => "fresh-token");
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce({ code: "permission-denied" })
      .mockResolvedValueOnce("saved");

    await expect(
      retryAuthenticatedFirestoreOperation(userWithRefresh(refresh), operation)
    ).resolves.toBe("saved");

    expect(refresh).toHaveBeenCalledWith(true);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-permission failure", async () => {
    const refresh = vi.fn(async () => "fresh-token");
    const error = new Error("offline");
    const operation = vi.fn(async () => {
      throw error;
    });

    await expect(
      retryAuthenticatedFirestoreOperation(userWithRefresh(refresh), operation)
    ).rejects.toBe(error);

    expect(refresh).not.toHaveBeenCalled();
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("surfaces a real rules denial after the single refresh", async () => {
    const refresh = vi.fn(async () => "fresh-token");
    const operation = vi.fn(async () => {
      throw { code: "permission-denied" };
    });

    await expect(
      retryAuthenticatedFirestoreOperation(userWithRefresh(refresh), operation)
    ).rejects.toEqual({ code: "permission-denied" });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
