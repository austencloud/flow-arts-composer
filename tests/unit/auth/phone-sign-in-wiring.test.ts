import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { error } from "@sveltejs/kit";
import { createMemoryStore } from "@austencloud/phone-sign-in/testing";
import { setWorkerEnv, withCf } from "#test-helpers/worker-env.js";

// Flow Arts Composer's wiring of @austencloud/phone-sign-in: its fixed values,
// its admin check, rate limiter and service account, and what a route hands
// over. The package's own tests cover what the handlers do.
const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  checkRateLimit: vi.fn(),
  getAccessToken: vi.fn(),
  forgetAccessToken: vi.fn(),
  store: null as ReturnType<typeof createMemoryStore> | null,
}));
vi.mock("#lib/server/auth/requireAdmin.js", () => ({
  requireAdmin: mocks.requireAdmin,
}));
vi.mock("#lib/server/security/rate-limiter.js", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));
vi.mock("#lib/server/auth/phone-sign-in-store.js", () => ({
  createPhoneSignInStore: () => {
    mocks.store = createMemoryStore();
    return new Proxy({} as ReturnType<typeof createMemoryStore>, {
      get: (_target, key) =>
        Reflect.get(mocks.store as object, key as string | symbol),
    });
  },
}));
vi.mock("#lib/server/google/service-account-authorizer.js", () => ({
  loadServiceAccountSource: () => "{}",
  parseServiceAccount: () => ({
    project_id: "the-kinetic-alphabet",
    client_email: "firebase-adminsdk@the-kinetic-alphabet.iam.example",
    private_key: "test service account private key",
  }),
  getServiceAccountAuthorizer: () => ({
    projectId: "the-kinetic-alphabet",
    getAccessToken: mocks.getAccessToken,
    forgetAccessToken: mocks.forgetAccessToken,
  }),
}));

import {
  APP_NAME,
  AUTO_PURPOSE,
  KEY_SALT,
  LIVE_ORIGIN,
  TRUSTED_PHONE_DB,
} from "#lib/shared/auth/phone-sign-in/values.js";
import { phoneSignIn, routeContext } from "#lib/server/auth/phone-sign-in.js";

const LIVE = "https://tkaflowarts.com";
const ID = "AbCdEfGhIjKlMnOpQr12";
const NOW = Date.UTC(2026, 9, 10, 20, 0, 0);

function startRequest(): Request {
  return new Request(`${LIVE}/api/phone-sign-in`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: LIVE },
    body: "{}",
  });
}

function admin(issuedAt = NOW / 1000) {
  return {
    uid: "austen",
    email: "austen@example.com",
    signInProvider: "google.com",
    issuedAt,
    authTime: issuedAt,
    admin: true,
  };
}

beforeEach(() => {
  setWorkerEnv({});
  mocks.checkRateLimit.mockReturnValue({
    allowed: true,
    remaining: 9,
    resetAt: 0,
  });
  mocks.store?.docs.clear();
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  setWorkerEnv({});
});

describe("Flow Arts Composer phone sign-in values", () => {
  // A new salt or purpose stops every trusted phone from approving by itself,
  // and a new database name makes each phone forget its key.
  it("keeps the values trusted phones are enrolled with", () => {
    expect(APP_NAME).toBe("Flow Arts Composer");
    expect(LIVE_ORIGIN).toBe(LIVE);
    expect(KEY_SALT).toBe("flow-arts-phone-sign-in");
    expect(AUTO_PURPOSE).toBe("flow-arts-phone-sign-in-auto");
    expect(TRUSTED_PHONE_DB).toBe("flow-arts-trusted-phone");
  });
});

describe("phoneSignIn", () => {
  it("starts a request with a QR link to the live site, limited per address", async () => {
    const response = await phoneSignIn.create(startRequest(), {
      clientAddress: "203.0.113.9",
      url: new URL(`${LIVE}/api/phone-sign-in`),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.approveUrl).toBe(`${LIVE}/sign-in/${body.id}`);
    expect(mocks.store?.docs.has(`phone_sign_in_requests/${body.id}`)).toBe(
      true
    );
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      "phone-sign-in-create:ip:203.0.113.9",
      { maxRequests: expect.any(Number), windowMs: expect.any(Number) }
    );
  });

  it("refuses a request the rate limiter turns away", async () => {
    mocks.checkRateLimit.mockReturnValue({
      allowed: false,
      remaining: 0,
      resetAt: 0,
    });

    const response = await phoneSignIn.create(startRequest(), {
      clientAddress: "203.0.113.9",
      url: new URL(`${LIVE}/api/phone-sign-in`),
    });

    expect(response.status).toBe(429);
    expect(mocks.store?.docs.size).toBe(0);
  });

  it.each(["1", "true", " TRUE "])(
    "is switched off by PHONE_SIGN_IN_DISABLED=%j",
    async (value) => {
      setWorkerEnv({ PHONE_SIGN_IN_DISABLED: value });

      const response = await phoneSignIn.create(startRequest(), {
        clientAddress: "203.0.113.9",
        url: new URL(`${LIVE}/api/phone-sign-in`),
      });

      expect(response.status).toBe(503);
      expect(mocks.store?.docs.size).toBe(0);
    }
  );

  it("answers with the status the admin check refuses with", async () => {
    mocks.requireAdmin.mockImplementation(async () =>
      error(403, "Admin access required")
    );

    const response = await phoneSignIn.lookup(
      new Request(`${LIVE}/api/phone-sign-in/${ID}`),
      { id: ID, clientAddress: "203.0.113.9" }
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      message: "Admin access required",
    });
    expect(mocks.requireAdmin).toHaveBeenCalledWith({
      request: expect.any(Request),
    });
  });

  it("looks a request up for an admin", async () => {
    mocks.requireAdmin.mockResolvedValue(admin());

    const response = await phoneSignIn.lookup(
      new Request(`${LIVE}/api/phone-sign-in/${ID}`),
      { id: ID, clientAddress: "203.0.113.9" }
    );

    expect(response.status).toBe(404);
  });

  it("passes the token's issue time through, so an old token cannot approve", async () => {
    vi.useFakeTimers({ now: NOW });
    mocks.requireAdmin.mockResolvedValue(admin(NOW / 1000 - 3600));

    const response = await phoneSignIn.decision(
      new Request(`${LIVE}/api/phone-sign-in/${ID}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: LIVE },
        body: JSON.stringify({ decision: "approve" }),
      }),
      { id: ID, clientAddress: "203.0.113.9" }
    );

    expect(response.status).toBe(401);
  });

  it("signs the account out through Identity Toolkit for the-kinetic-alphabet", async () => {
    vi.useFakeTimers({ now: NOW });
    mocks.requireAdmin.mockResolvedValue(admin());
    mocks.getAccessToken.mockResolvedValue("scoped-token");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await mocks.store?.set("trusted_phones", "austen", { keyTag: "x" });

    const answer = phoneSignIn.notMe(
      new Request(`${LIVE}/api/phone-sign-in/${ID}/not-me`, {
        method: "POST",
        headers: { origin: LIVE },
      }),
      { id: ID, clientAddress: "203.0.113.9" }
    );
    // An unknown request waits out the longest a collected pass could live,
    // then signs out again.
    await vi.advanceTimersByTimeAsync(120_000);
    const response = await answer;

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      signedOut: true,
      autoOff: true,
    });
    expect(mocks.store?.docs.has("trusted_phones/austen")).toBe(false);
    expect(mocks.getAccessToken).toHaveBeenCalledWith(
      "https://www.googleapis.com/auth/cloud-platform"
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://identitytoolkit.googleapis.com/v1/projects/the-kinetic-alphabet/accounts:update",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("routeContext", () => {
  it("passes the id, address, Cloudflare details and URL along", () => {
    const url = new URL(`${LIVE}/api/phone-sign-in/${ID}`);
    const cf = { city: "Atlanta" };
    const request = withCf(new Request(url), cf);

    expect(
      routeContext({
        params: { id: ID },
        request,
        url,
        getClientAddress: () => "203.0.113.9",
      })
    ).toEqual({ id: ID, clientAddress: "203.0.113.9", cf, url });
  });

  it("reads the address as unknown where the runtime has none", () => {
    const context = routeContext({
      params: {},
      request: new Request(`${LIVE}/api/phone-sign-in`),
      url: new URL(`${LIVE}/api/phone-sign-in`),
      getClientAddress: () => {
        throw new Error("no address outside Workers");
      },
    });

    expect(context.clientAddress).toBe("unknown");
    expect(context.id).toBeUndefined();
    expect(context.cf).toBeUndefined();
  });
});
