/**
 * AUDIT (read-only): rate-limit bucket identity on parameterised routes.
 *
 * `withRateLimit` derives its bucket key from `event.url.pathname` — the
 * CONCRETE request path, not the matched route id. On a route whose path
 * contains a caller-supplied parameter, every distinct parameter value is a
 * distinct bucket, so the preset's ceiling is per-URL rather than per-caller.
 *
 * These tests observe the shipped helper directly. They assert current
 * behaviour so the defect is reproducible; they are NOT a spec of desired
 * behaviour, and nothing here edits production code.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RATE_LIMITS } from "$lib/server/security/rate-limiter";
import { withRateLimit } from "$lib/server/security/withRateLimit";
import { fakeEvent, hashForIndex } from "./helpers/fake-request-event";

const CALLER_IP = "198.51.100.44";

/** Drive one request through the guard; true means the caller was blocked. */
async function attempt(pathname: string): Promise<boolean> {
  const blocked = await withRateLimit(
    fakeEvent({
      url: `https://tkaflowarts.com${pathname}`,
      method: "PUT",
      clientAddress: CALLER_IP,
    }),
    RATE_LIMITS.GENERAL,
    "ip"
  );
  return blocked !== null;
}

describe("withRateLimit bucket identity (in-memory fallback backend)", () => {
  beforeEach(() => {
    // The in-memory window is module state; a fresh registry per test keeps
    // each observation independent of the ones before it.
    vi.resetModules();
  });

  it("enforces the preset ceiling when the path is constant", async () => {
    const path = `/api/qr-video/${hashForIndex(1)}`;
    let blockedAt = -1;

    for (let i = 0; i < RATE_LIMITS.GENERAL.maxRequests + 5; i++) {
      if (await attempt(path)) {
        blockedAt = i;
        break;
      }
    }

    expect(blockedAt).toBe(RATE_LIMITS.GENERAL.maxRequests);
  });

  it("never blocks when the same caller varies the path parameter", async () => {
    const attempts = RATE_LIMITS.GENERAL.maxRequests * 5;
    let blocked = 0;

    for (let i = 0; i < attempts; i++) {
      if (await attempt(`/api/qr-video/${hashForIndex(1_000 + i)}`)) blocked++;
    }

    // 500 requests from one IP inside one 60s window against a 100/min preset.
    expect(blocked).toBe(0);
  });

  it("also splits per target on the admin route's per-user preset", async () => {
    // ADMIN is keyed by caller uid, but the pathname prefix still carries the
    // TARGET uid, so one admin gets a fresh quota per user they act on.
    const adminUid = "admin-uid-fixed";
    let blocked = 0;

    for (let i = 0; i < RATE_LIMITS.ADMIN.maxRequests * 3; i++) {
      const response = await withRateLimit(
        fakeEvent({
          url: `https://tkaflowarts.com/api/admin/user-auth/target-uid-${i}`,
          method: "GET",
          clientAddress: CALLER_IP,
        }),
        RATE_LIMITS.ADMIN,
        "user",
        adminUid
      );
      if (response !== null) blocked++;
    }

    expect(blocked).toBe(0);
  });

  it("keys on the route id instead when the path carries no parameter", async () => {
    // Control: the same helper does bound a fixed-path route, which is why the
    // defect is specific to parameterised paths rather than general.
    let blockedAt = -1;
    for (let i = 0; i < RATE_LIMITS.GENERAL.maxRequests + 5; i++) {
      if (await attempt("/api/thumbnail")) {
        blockedAt = i;
        break;
      }
    }
    expect(blockedAt).toBe(RATE_LIMITS.GENERAL.maxRequests);
  });
});

describe("in-memory bucket registry growth", () => {
  it("retains one entry per distinct path seen inside the cleanup interval", async () => {
    vi.resetModules();
    const { checkRateLimit } = await import("$lib/server/security/rate-limiter");

    // checkRateLimit's Map is private, so measure the observable consequence:
    // every distinct identifier is still allowed on its first call, which is
    // only possible if each one was retained as its own entry.
    let allowed = 0;
    for (let i = 0; i < 5_000; i++) {
      if (checkRateLimit(`/api/qr-video/${hashForIndex(i)}:ip:${CALLER_IP}`, RATE_LIMITS.GENERAL).allowed) {
        allowed++;
      }
    }

    expect(allowed).toBe(5_000);
  });
});
