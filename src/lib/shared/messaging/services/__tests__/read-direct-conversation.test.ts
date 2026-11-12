import { describe, expect, it } from "vitest";
import { readDirectConversation } from "../read-direct-conversation";

describe("readDirectConversation", () => {
  it("treats the rules' refusal of a missing conversation as no conversation", async () => {
    const denied = Object.assign(
      new Error("Missing or insufficient permissions."),
      { code: "permission-denied" }
    );
    await expect(
      readDirectConversation(() => Promise.reject(denied))
    ).resolves.toBeNull();
  });

  it("passes a successful read through untouched", async () => {
    const snapshot = { exists: () => true };
    await expect(readDirectConversation(async () => snapshot)).resolves.toBe(
      snapshot
    );
  });

  it("rethrows other failures", async () => {
    const offline = Object.assign(new Error("client is offline"), {
      code: "unavailable",
    });
    await expect(
      readDirectConversation(() => Promise.reject(offline))
    ).rejects.toBe(offline);
  });
});
