import { beforeEach, describe, expect, it, vi } from "vitest";

// Naming the phone decides where a one-tap approval goes, so every refusal here
// guards against a notification landing on a device the owner did not choose.
const mocks = vi.hoisted(() => ({
  verifyPhoneUser: vi.fn(),
  verifyAutoSignature: vi.fn(),
  trustedKeyTag: vi.fn(),
  savedToken: vi.fn(),
  setTarget: vi.fn(async () => {}),
  deleteTarget: vi.fn(async () => {}),
}));
vi.mock("#lib/server/auth/phone-sign-in.js", () => ({
  verifyPhoneUser: mocks.verifyPhoneUser,
  trustedPhones: { verifyAutoSignature: mocks.verifyAutoSignature },
  signInPush: {
    trustedKeyTag: mocks.trustedKeyTag,
    savedToken: mocks.savedToken,
    setTarget: mocks.setTarget,
    deleteTarget: mocks.deleteTarget,
  },
}));

import {
  DELETE,
  POST,
} from "../../../src/routes/api/phone-sign-in/push-target/+server.js";

const DOC_ID = "0123456789abcdef0123456789abcdef";
const UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";

function post(body: unknown) {
  const request = new Request("https://localhost/api/phone-sign-in/push-target", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": UA },
    body: JSON.stringify(body),
  });
  return POST({ request } as never);
}

const validBody = { tokenDocId: DOC_ID, signature: "signed" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyPhoneUser.mockResolvedValue({
    uid: "austen",
    email: "a@example.com",
    signInProvider: "google.com",
    issuedAt: Math.floor(Date.now() / 1000),
  });
  mocks.trustedKeyTag.mockResolvedValue("tag");
  mocks.verifyAutoSignature.mockResolvedValue(true);
  mocks.savedToken.mockResolvedValue({ token: "t", transport: "web" });
});

describe("POST /api/phone-sign-in/push-target", () => {
  it("answers an auth refusal with its own status, as the other sign-in routes do", async () => {
    mocks.verifyPhoneUser.mockRejectedValue(
      Object.assign(new Error("Missing Authorization Bearer token"), {
        status: 401,
      })
    );

    const response = await post(validBody);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      message: "Missing Authorization Bearer token",
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.setTarget).not.toHaveBeenCalled();
  });

  it("uses the message of a SvelteKit error()", async () => {
    mocks.verifyPhoneUser.mockRejectedValue({
      status: 403,
      body: { message: "Admin access required" },
    });

    const response = await post(validBody);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ message: "Admin access required" });
  });

  it("does not disguise a real failure as a refusal", async () => {
    mocks.verifyPhoneUser.mockRejectedValue(new Error("boom"));

    await expect(post(validBody)).rejects.toThrow("boom");
  });

  it("names the phone, remembering which trusted phone did it", async () => {
    const response = await post(validBody);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "on" });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.verifyAutoSignature).toHaveBeenCalledWith(
      "austen",
      `push-target ${DOC_ID}`,
      "signed"
    );
    expect(mocks.savedToken).toHaveBeenCalledWith("austen", DOC_ID);
    expect(mocks.setTarget).toHaveBeenCalledWith({
      uid: "austen",
      tokenDocId: DOC_ID,
      label: expect.stringContaining("Android"),
      keyTag: "tag",
    });
  });

  it("refuses a sign-in that is not Google", async () => {
    mocks.verifyPhoneUser.mockResolvedValue({
      uid: "austen",
      signInProvider: "password",
      issuedAt: Math.floor(Date.now() / 1000),
    });
    expect((await post(validBody)).status).toBe(403);
    expect(mocks.setTarget).not.toHaveBeenCalled();
  });

  it("refuses a token older than five minutes", async () => {
    mocks.verifyPhoneUser.mockResolvedValue({
      uid: "austen",
      signInProvider: "google.com",
      issuedAt: Math.floor(Date.now() / 1000) - 301,
    });
    expect((await post(validBody)).status).toBe(401);
    expect(mocks.setTarget).not.toHaveBeenCalled();
  });

  it.each([
    [{ tokenDocId: "../../other/doc", signature: "s" }],
    [{ tokenDocId: DOC_ID }],
    [null],
  ])("refuses a malformed body %j", async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(mocks.setTarget).not.toHaveBeenCalled();
  });

  it("refuses an account with no trusted phone", async () => {
    mocks.trustedKeyTag.mockResolvedValue(null);
    expect((await post(validBody)).status).toBe(409);
    expect(mocks.setTarget).not.toHaveBeenCalled();
  });

  it("refuses a signature from anything but the trusted key", async () => {
    mocks.verifyAutoSignature.mockResolvedValue(false);
    expect((await post(validBody)).status).toBe(403);
    expect(mocks.setTarget).not.toHaveBeenCalled();
  });

  it("refuses a token document this account does not hold", async () => {
    mocks.savedToken.mockResolvedValue(null);
    expect((await post(validBody)).status).toBe(409);
    expect(mocks.setTarget).not.toHaveBeenCalled();
  });

  it("refuses a native app token", async () => {
    mocks.savedToken.mockResolvedValue({
      token: "t",
      transport: "android-native",
    });
    expect((await post(validBody)).status).toBe(409);
    expect(mocks.setTarget).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/phone-sign-in/push-target", () => {
  it("clears the signed-in account's phone", async () => {
    const request = new Request(
      "https://localhost/api/phone-sign-in/push-target",
      { method: "DELETE" }
    );
    const response = await DELETE({ request } as never);

    expect(await response.json()).toEqual({ status: "off" });
    expect(mocks.deleteTarget).toHaveBeenCalledWith("austen");
  });

  it("answers an auth refusal with its own status and clears nothing", async () => {
    mocks.verifyPhoneUser.mockRejectedValue(
      Object.assign(new Error("Missing Authorization Bearer token"), {
        status: 401,
      })
    );
    const request = new Request(
      "https://localhost/api/phone-sign-in/push-target",
      { method: "DELETE" }
    );
    const response = await DELETE({ request } as never);

    expect(response.status).toBe(401);
    expect(mocks.deleteTarget).not.toHaveBeenCalled();
  });
});
