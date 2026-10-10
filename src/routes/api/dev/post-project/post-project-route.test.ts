import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";

const env = vi.hoisted(() => ({ dev: true }));
vi.mock("$app/env", () => ({
  get dev() {
    return env.dev;
  },
}));
import { GET, POST } from "./+server";

function event({
  origin = "https://[::1]:5173",
  address = "::1",
  host = "[::1]",
  body = false,
} = {}) {
  const url = `https://${host}:5173/api/dev/post-project`;
  const request = new Request(
    url,
    body
      ? {
          method: "POST",
          headers: { origin, "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "heartbeat" }),
        }
      : { headers: { origin } }
  );
  return {
    request,
    url: new URL(url),
    getClientAddress: () => address,
  } as RequestEvent;
}

describe("local Post Studio bridge access", () => {
  beforeEach(() => {
    env.dev = true;
  });

  it("denies production requests", async () => {
    env.dev = false;
    await expect(async () => GET(event())).rejects.toMatchObject({
      status: 404,
    });
  });

  it("denies a foreign origin, remote address, or nonloopback host", async () => {
    await expect(
      POST(event({ origin: "https://other.test", body: true }))
    ).rejects.toMatchObject({ status: 403 });
    await expect(async () =>
      GET(event({ address: "192.0.2.12" }))
    ).rejects.toMatchObject({ status: 403 });
    await expect(async () =>
      GET(event({ host: "evil.test", origin: "https://evil.test:5173" }))
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects an oversized streamed body", async () => {
    const base = event({ body: true });
    const request = new Request(base.request.url, {
      method: "POST",
      headers: { origin: "https://[::1]:5173" },
      body: "x".repeat(12_000_001),
    });
    await expect(
      POST({ ...base, request } as RequestEvent)
    ).rejects.toMatchObject({ status: 413 });
  });
});
