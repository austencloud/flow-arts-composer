import { describe, expect, it, vi } from "vitest";
import { createProfileOnce } from "../profile-create-replay";

const denied = () =>
  Object.assign(new Error("Missing or insufficient permissions."), {
    code: "permission-denied",
  });

describe("createProfileOnce", () => {
  it("accepts a denied resend when the first create already landed", async () => {
    const result = await createProfileOnce(
      () => Promise.reject(denied()),
      () => Promise.resolve(true)
    );
    expect(result).toBe("already-landed");
  });

  it("rethrows a denial when the document is still missing", async () => {
    await expect(
      createProfileOnce(
        () => Promise.reject(denied()),
        () => Promise.resolve(false)
      )
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("rethrows the original denial when the check itself fails", async () => {
    await expect(
      createProfileOnce(
        () => Promise.reject(denied()),
        () => Promise.reject(new Error("offline"))
      )
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("does not check the server for other failures", async () => {
    const existsOnServer = vi.fn(() => Promise.resolve(true));
    await expect(
      createProfileOnce(
        () => Promise.reject(new Error("unavailable")),
        existsOnServer
      )
    ).rejects.toThrow("unavailable");
    expect(existsOnServer).not.toHaveBeenCalled();
  });
});
