import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "@austencloud/phone-sign-in/testing";

// The local-only rule on its own is tested in phone-sign-in-local.test.ts. This
// checks the rule actually stands between the create route and the phone, on a
// dev build, which is the only build where the answer can ever be yes.
const mocks = vi.hoisted(() => ({
  notify: vi.fn(async () => true),
  store: null as unknown,
}));
vi.mock("$app/env", () => ({ dev: true, building: false }));
vi.mock("#lib/server/auth/requireAdmin.js", () => ({ requireAdmin: vi.fn() }));
vi.mock("#lib/server/security/rate-limiter.js", () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 9, resetAt: 0 }),
}));
vi.mock("#lib/server/auth/phone-sign-in-store.js", () => ({
  createPhoneSignInStore: () => createMemoryStore(),
}));
vi.mock("#lib/server/auth/phone-sign-in-push.js", () => ({
  FCM_SCOPE: "scope",
  SIGN_IN_PUSH_COLLECTION: "phone_sign_in_push",
  createSignInPush: () => ({ notify: mocks.notify }),
}));
vi.mock("#lib/server/google/service-account-authorizer.js", () => ({
  loadServiceAccountSource: () => "{}",
  parseServiceAccount: () => ({
    project_id: "p",
    client_email: "e@example.com",
    private_key: "test key",
  }),
  getServiceAccountAuthorizer: () => ({ projectId: "p" }),
}));

import { phoneSignIn } from "#lib/server/auth/phone-sign-in.js";

function create(url: string, headers: Record<string, string> = {}) {
  const parsed = new URL(url);
  return phoneSignIn.create(
    new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: parsed.origin,
        ...headers,
      },
      body: JSON.stringify({ notify: true }),
    }),
    { clientAddress: "127.0.0.1", url: parsed }
  );
}

beforeEach(() => {
  mocks.notify.mockClear();
});

describe("phoneSignIn.create on a dev build", () => {
  it("rings the phone for a request at this machine", async () => {
    const response = await create("https://localhost:5173/api/phone-sign-in");

    expect(response.status).toBe(200);
    expect((await response.json()).notified).toBe(true);
    expect(mocks.notify).toHaveBeenCalledOnce();
  });

  it("creates the request without ringing through the tunnel's host", async () => {
    const response = await create(
      "https://dev.tkaflowarts.com/api/phone-sign-in"
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.notified).toBe(false);
    expect(body.id).toBeTruthy();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("creates the request without ringing when a tunnel rewrote the host to localhost", async () => {
    const response = await create("https://localhost:5173/api/phone-sign-in", {
      "cf-connecting-ip": "203.0.113.9",
    });

    expect((await response.json()).notified).toBe(false);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
