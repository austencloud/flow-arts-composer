/**
 * AUDIT (read-only): how the production-reachable endpoints answer bad input,
 * and what they say when they fail.
 *
 * The interesting contrast is between the routes that were given a deliberate
 * client-facing message and the ones that hand the caller whatever `Error`
 * reached the catch block. `hooks.server.ts` scrubs uncaught errors in
 * production, but a handler that catches its own error and echoes
 * `error.message` never reaches that scrubber.
 */
import { describe, expect, it, vi } from "vitest";
import { parseSoftwareSubmission } from "$lib/server/software-submissions/software-submission-input";
import { fakeEvent } from "./helpers/fake-request-event";

describe("/api/test-render is reachable in production and always fails", () => {
  it("returns 500 carrying an internal implementation message", async () => {
    const { POST } = await import("../../src/routes/api/test-render/+server");

    const response = await POST(
      fakeEvent({
        url: "https://tkaflowarts.com/api/test-render",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stepSize: 144 }),
      }) as never
    );

    // The handler's first statement is getSequenceRenderer(), which throws
    // whenever `browser` is false — i.e. on every server request. There is no
    // dev guard and no auth check on this route.
    expect(response.status).toBe(500);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain("browser-only");
    expect(payload.error).toContain("getSequenceRenderer");
  });

  it("fails identically for an absurd stepSize, so the value is never used", async () => {
    const { POST } = await import("../../src/routes/api/test-render/+server");

    const response = await POST(
      fakeEvent({
        url: "https://tkaflowarts.com/api/test-render",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stepSize: 1e9 }),
      }) as never
    );

    // `stepSize` has no upper bound in the handler, but it is read after the
    // throw, so the missing bound is not reachable. Robustness, not exposure.
    expect(response.status).toBe(500);
    expect(((await response.json()) as { error: string }).error).toContain("browser-only");
  });

  it("still consumes a rate-limit slot per request before failing", async () => {
    vi.resetModules();
    const { POST } = await import("../../src/routes/api/test-render/+server");
    const { RATE_LIMITS } = await import("$lib/server/security/rate-limiter");

    const send = () =>
      POST(
        fakeEvent({
          url: "https://tkaflowarts.com/api/test-render",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
          clientAddress: "203.0.113.200",
        }) as never
      );

    const statuses: number[] = [];
    for (let i = 0; i < RATE_LIMITS.AI_RENDER.maxRequests + 1; i++) {
      statuses.push((await send()).status);
    }

    expect(statuses.slice(0, RATE_LIMITS.AI_RENDER.maxRequests)).toEqual(
      Array(RATE_LIMITS.AI_RENDER.maxRequests).fill(500)
    );
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("/api/software-submissions input parser (the careful shape)", () => {
  it("rejects a body carrying any key outside the allowlist", () => {
    const result = parseSoftwareSubmission({
      name: "Tool",
      url: "https://example.com",
      notes: "",
      role: "admin",
    });
    expect(result).toEqual({
      ok: false,
      error: "That submission contains unexpected fields.",
    });
  });

  it("rejects a JSON __proto__ key as an unexpected field", () => {
    // JSON.parse makes __proto__ an OWN enumerable property, so Object.keys
    // sees it and the allowlist check catches it before any spread.
    const body = JSON.parse('{"name":"Tool","url":"","notes":"","__proto__":{"isAdmin":true}}');
    expect(parseSoftwareSubmission(body).ok).toBe(false);
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
  });

  it("bounds every field it accepts", () => {
    expect(parseSoftwareSubmission({ name: "x".repeat(121), url: "", notes: "" })).toMatchObject({
      ok: false,
    });
    expect(
      parseSoftwareSubmission({ name: "Tool", url: "h".repeat(501), notes: "" })
    ).toMatchObject({ ok: false });
    expect(
      parseSoftwareSubmission({ name: "Tool", url: "", notes: "n".repeat(2001) })
    ).toMatchObject({ ok: false });
  });

  it("rejects a non-http scheme", () => {
    expect(
      parseSoftwareSubmission({
        name: "Tool",
        url: "javascript:alert(1)",
        notes: "",
      })
    ).toMatchObject({ ok: false, error: "Use an http or https link." });
  });

  it("returns only fixed prose, never an internal message", () => {
    const result = parseSoftwareSubmission(42);
    expect(result).toEqual({ ok: false, error: "That submission could not be read." });
  });
});
