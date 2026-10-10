import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeLoopback, readJsonBody } from "#lib/server/dev-loopback.js";
import { createEmptyPostProject } from "#lib/shared/media-composition/domain/post-project.js";
import { POST as postProjectRoute } from "../../../src/routes/api/dev/post-project/+server";
import {
  routeEvent,
  thrownStatus,
  type RouteInit,
} from "./feature-video-test-helpers";

afterEach(() => {
  vi.doUnmock("$app/env");
  vi.resetModules();
});

const PATH = "/api/dev/feature-videos";

describe("authorizeLoopback", () => {
  it("lets this computer read without an Origin header", () => {
    const { request, getClientAddress } = routeEvent(PATH, { origin: null });
    expect(() => authorizeLoopback(request, getClientAddress)).not.toThrow();
  });

  it("lets the page's own origin write", () => {
    const { request, getClientAddress } = routeEvent(PATH, {
      method: "POST",
      body: "{}",
    });
    expect(() => authorizeLoopback(request, getClientAddress)).not.toThrow();
  });

  it.each<[string, string, RouteInit]>([
    ["another host name", "http://example.test/api/dev/feature-videos", {}],
    ["a caller on another computer", PATH, { client: "203.0.113.5" }],
    ["another origin", PATH, { origin: "http://evil.test" }],
    [
      "a write without an Origin header",
      PATH,
      { method: "POST", body: "{}", origin: null },
    ],
  ])("refuses %s with 403", async (_name, pathname, init) => {
    const { request, getClientAddress } = routeEvent(pathname, init);
    expect(
      await thrownStatus(() => authorizeLoopback(request, getClientAddress))
    ).toBe(403);
  });

  it("answers 404 when the server is not a dev server", async () => {
    vi.resetModules();
    vi.doMock("$app/env", () => ({
      dev: false,
      browser: false,
      building: false,
      version: "test",
    }));
    const { authorizeLoopback: guard } =
      await import("#lib/server/dev-loopback.js");
    const { request, getClientAddress } = routeEvent(PATH);
    expect(await thrownStatus(() => guard(request, getClientAddress))).toBe(
      404
    );
  });
});

describe("readJsonBody", () => {
  const post = (init: RouteInit) =>
    routeEvent(PATH, { method: "POST", ...init }).request;

  it("reads a JSON object", async () => {
    expect(await readJsonBody(post({ body: '{"a":1}' }))).toEqual({ a: 1 });
  });

  it.each<[string, RouteInit]>([
    ["no body", {}],
    ["broken JSON", { body: "{" }],
    ["a list", { body: "[1]" }],
  ])("refuses %s with 400", async (_name, init) => {
    expect(await thrownStatus(() => readJsonBody(post(init)))).toBe(400);
  });

  it("refuses a declared length over the limit with 413", async () => {
    const request = post({ body: "{}", headers: { "content-length": "65" } });
    expect(await thrownStatus(() => readJsonBody(request, 64))).toBe(413);
  });

  it("refuses a streamed body over the limit with 413", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(`{"a":"${"x".repeat(100)}"}`)
        );
        controller.close();
      },
    });
    const request = post({ body: stream, duplex: "half" } as RouteInit);
    expect(await thrownStatus(() => readJsonBody(request, 64))).toBe(413);
  });
});

describe("the post-project route after the move", () => {
  it("still answers a first heartbeat", async () => {
    const response = await postProjectRoute(
      routeEvent("/api/dev/post-project", {
        method: "POST",
        body: JSON.stringify({
          kind: "heartbeat",
          sessionId: randomUUID(),
          revision: 0,
          snapshot: createEmptyPostProject({
            sequenceId: "loopback-check",
            now: 1,
          }),
        }),
      }) as never
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ command: null });
  });
});
