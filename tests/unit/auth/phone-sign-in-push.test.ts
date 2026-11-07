import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "@austencloud/phone-sign-in/testing";
import type { SignInNotice } from "@austencloud/phone-sign-in/server";
import {
  PUSH_DAILY_LIMIT,
  PUSH_LIMIT,
  SIGN_IN_PUSH_COLLECTION,
  createSignInPush,
  isTokenDocId,
  signInMessageData,
  type PushTarget,
  type SavedFcmToken,
} from "#lib/server/auth/phone-sign-in-push.js";
import { fcmTokenDocId } from "#lib/shared/push/fcm-token-doc-id.js";

const TOKEN = "fcm-token-of-the-phone";
const NOTICE: SignInNotice = {
  id: "AbCdEfGhIjKlMnOpQr12",
  code: "123456",
  device: { label: "Chrome on Windows", place: null, site: null },
  expiresInMs: 180_000,
};

let store: ReturnType<typeof createMemoryStore>;
let saved: Map<string, SavedFcmToken>;
let tokenDelete: ReturnType<typeof vi.fn>;
let fcmFetch: ReturnType<typeof vi.fn>;
let rateLimit: ReturnType<typeof vi.fn>;
let target: PushTarget;

function push() {
  return createSignInPush({
    store,
    listTargets: async () => [target],
    tokens: {
      get: async (_uid, docId) => saved.get(docId) ?? null,
      delete: tokenDelete,
    },
    rateLimit,
    projectId: () => "the-kinetic-alphabet",
    fcmFetch,
    now: () => 1000,
  });
}

function sentMessage() {
  const init = fcmFetch.mock.calls[0]?.[1] as RequestInit;
  return JSON.parse(String(init.body)).message;
}

async function targetExists() {
  return (await store.get(SIGN_IN_PUSH_COLLECTION, "austen")) !== null;
}

beforeEach(async () => {
  store = createMemoryStore();
  const tokenDocId = await fcmTokenDocId(TOKEN);
  target = { uid: "austen", tokenDocId, label: "Chrome on Android", keyTag: "tag" };
  saved = new Map([[tokenDocId, { token: TOKEN, transport: "web" }]]);
  tokenDelete = vi.fn(async () => {});
  fcmFetch = vi.fn(async () => new Response("{}", { status: 200 }));
  rateLimit = vi.fn(() => true);
  await store.set("trusted_phones", "austen", { keyTag: "tag" });
  await store.set(SIGN_IN_PUSH_COLLECTION, "austen", { keyTag: "tag" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("signInMessageData", () => {
  it("carries the words and the review page as strings, never a notification block", () => {
    expect(signInMessageData(NOTICE)).toEqual({
      type: "phone-sign-in",
      id: NOTICE.id,
      title: "Sign in Chrome on Windows?",
      body: "Tap to sign it in. Code 123 456",
      tag: `phone-sign-in-${NOTICE.id}`,
      url: `/sign-in/${NOTICE.id}?review=1`,
      label: "Chrome on Windows",
      expiresInMs: "180000",
    });
  });

  it("names the place, and the copy when it is not the live site", () => {
    const data = signInMessageData({
      ...NOTICE,
      device: {
        label: "Chrome on Windows",
        place: "Atlanta",
        site: "localhost:5173",
      },
    });
    expect(data.body).toBe(
      "Tap to sign it in. Code 123 456\nNear Atlanta\nOn localhost:5173"
    );
  });

  it("leaves the live site unnamed", () => {
    const data = signInMessageData({
      ...NOTICE,
      device: { label: "Edge", place: null, site: "tkaflowarts.com" },
    });
    expect(data.body).not.toContain("tkaflowarts.com");
  });
});

describe("notify", () => {
  it("posts a data-only, high urgency message that lapses with the request", async () => {
    expect(await push().notify(NOTICE)).toBe(true);

    expect(fcmFetch.mock.calls[0]?.[0]).toBe(
      "https://fcm.googleapis.com/v1/projects/the-kinetic-alphabet/messages:send"
    );
    const message = sentMessage();
    expect(message.token).toBe(TOKEN);
    expect(message.notification).toBeUndefined();
    expect(message.webpush.notification).toBeUndefined();
    expect(message.webpush.headers).toEqual({ Urgency: "high", TTL: "180" });
    expect(Object.values(message.data).every((v) => typeof v === "string")).toBe(
      true
    );
  });

  it("gives a nearly expired request at least one second", async () => {
    await push().notify({ ...NOTICE, expiresInMs: 200 });
    expect(sentMessage().webpush.headers.TTL).toBe("1");
  });

  it("sends nothing when no phone is named", async () => {
    const quiet = createSignInPush({
      store,
      listTargets: async () => [],
      tokens: { get: async () => null, delete: tokenDelete },
      rateLimit,
      projectId: () => "p",
      fcmFetch,
    });
    expect(await quiet.notify(NOTICE)).toBe(false);
    expect(fcmFetch).not.toHaveBeenCalled();
    expect(rateLimit).not.toHaveBeenCalled();
  });

  describe("caps", () => {
    it("asks for 5 per 10 minutes and 20 per day", async () => {
      await push().notify(NOTICE);
      expect(rateLimit.mock.calls.map(([check]) => check)).toEqual([
        { route: "phone-sign-in-push", limit: 5, windowMs: 600_000 },
        { route: "phone-sign-in-push-day", limit: 20, windowMs: 86_400_000 },
      ]);
      expect([PUSH_LIMIT, PUSH_DAILY_LIMIT]).toEqual([5, 20]);
    });

    it.each(["phone-sign-in-push", "phone-sign-in-push-day"])(
      "stays quiet when %s is used up, and keeps the target",
      async (route) => {
        rateLimit.mockImplementation(
          (check: { route: string }) => check.route !== route
        );
        expect(await push().notify(NOTICE)).toBe(false);
        expect(fcmFetch).not.toHaveBeenCalled();
        expect(await targetExists()).toBe(true);
      }
    );

    it("fails closed when the limiter breaks", async () => {
      rateLimit.mockImplementation(() => {
        throw new Error("limiter down");
      });
      expect(await push().notify(NOTICE)).toBe(false);
      expect(fcmFetch).not.toHaveBeenCalled();
    });
  });

  describe("re-checks before each send", () => {
    it("drops the target when the account no longer has a trusted phone", async () => {
      await store.delete("trusted_phones", "austen");
      expect(await push().notify(NOTICE)).toBe(false);
      expect(fcmFetch).not.toHaveBeenCalled();
      expect(await targetExists()).toBe(false);
    });

    it("drops the target when a different phone is trusted now", async () => {
      await store.set("trusted_phones", "austen", { keyTag: "other" });
      expect(await push().notify(NOTICE)).toBe(false);
      expect(fcmFetch).not.toHaveBeenCalled();
      expect(await targetExists()).toBe(false);
    });

    it("drops the target when its token document is gone", async () => {
      saved.clear();
      expect(await push().notify(NOTICE)).toBe(false);
      expect(fcmFetch).not.toHaveBeenCalled();
      expect(await targetExists()).toBe(false);
    });

    // The account owner can write that document. A swapped token would send
    // the approving notification to a device the trusted phone never signed for.
    it("drops the target when the token no longer matches its document id", async () => {
      saved.set(target.tokenDocId, { token: "someone-elses", transport: "web" });
      expect(await push().notify(NOTICE)).toBe(false);
      expect(fcmFetch).not.toHaveBeenCalled();
      expect(await targetExists()).toBe(false);
    });

    it("drops the target for a native app token, which has no worker to show it", async () => {
      saved.set(target.tokenDocId, {
        token: TOKEN,
        transport: "android-native",
      });
      expect(await push().notify(NOTICE)).toBe(false);
      expect(fcmFetch).not.toHaveBeenCalled();
      expect(await targetExists()).toBe(false);
    });
  });

  describe("FCM's answer", () => {
    it.each([
      [404, "{}"],
      [400, '{"error":{"details":[{"errorCode":"UNREGISTERED"}]}}'],
    ])("forgets a dead token on %i", async (status, body) => {
      fcmFetch.mockResolvedValue(new Response(body, { status }));
      expect(await push().notify(NOTICE)).toBe(false);
      expect(tokenDelete).toHaveBeenCalledWith("austen", target.tokenDocId);
      expect(await targetExists()).toBe(false);
    });

    it("keeps the target through a passing failure and reports not sent", async () => {
      fcmFetch.mockResolvedValue(new Response("busy", { status: 503 }));
      expect(await push().notify(NOTICE)).toBe(false);
      expect(tokenDelete).not.toHaveBeenCalled();
      expect(await targetExists()).toBe(true);
    });

    it("reports not sent when the send throws", async () => {
      fcmFetch.mockRejectedValue(new Error("offline"));
      await expect(push().notify(NOTICE)).resolves.toBe(false);
    });
  });
});

describe("setTarget", () => {
  it("stores the token document id, never the token", async () => {
    await push().setTarget(target);
    const record = await store.get(SIGN_IN_PUSH_COLLECTION, "austen");
    expect(record).toMatchObject({
      tokenDocId: target.tokenDocId,
      label: "Chrome on Android",
      keyTag: "tag",
    });
    expect(JSON.stringify(record)).not.toContain(TOKEN);
  });
});

describe("isTokenDocId", () => {
  it("takes what the token manager saves and refuses a path", async () => {
    expect(isTokenDocId(await fcmTokenDocId(TOKEN))).toBe(true);
    expect(isTokenDocId("../../secrets")).toBe(false);
    expect(isTokenDocId("A".repeat(32))).toBe(false);
    expect(isTokenDocId(null)).toBe(false);
  });
});
