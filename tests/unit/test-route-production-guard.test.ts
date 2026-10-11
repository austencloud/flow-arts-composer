import type { Handle } from "@sveltejs/kit/hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INTERNAL_ROUTE_FALLBACK } from "../../src/config/build-flags";

vi.mock("#lib/server/auth/firebase-auth-handler-proxy.js", () => ({
  isFirebaseAuthHandlerPath: () => false,
  proxyFirebaseAuthHandler: vi.fn(),
}));

vi.mock("#lib/server/auth/meta-oauth-proxy.js", () => ({
  isMetaOAuthProxyPath: () => false,
  proxyMetaOAuthRequest: vi.fn(),
}));

/** hooks.server.ts as the dev server (`dev: true`) or a build loads it. */
async function loadHandle(dev: boolean): Promise<Handle> {
  vi.resetModules();
  vi.doMock("$app/env", () => ({
    dev,
    browser: false,
    building: false,
    version: "test",
  }));
  return (await import("../../src/hooks.server")).handle;
}

afterEach(() => {
  vi.doUnmock("$app/env");
  vi.resetModules();
});

interface HarnessRequest {
  /** The URL as the browser sent it. */
  path: string;
  /** The route SvelteKit matched, which it sets before calling handle. */
  routeId: string | null;
  isDataRequest?: boolean;
}

/** Run one request through handle() and record whether the route ran. */
async function send(handle: Handle, harness: HarnessRequest) {
  const request = new Request(`https://tkaflowarts.com${harness.path}`);
  const resolve = vi.fn(async () => new Response("route ran"));
  const event = {
    url: new URL(request.url),
    request,
    route: { id: harness.routeId },
    params: {},
    isDataRequest: harness.isDataRequest ?? false,
  };

  let thrown: unknown;
  try {
    await handle({ event, resolve } as unknown as Parameters<Handle>[0]);
  } catch (error) {
    thrown = error;
  }
  return { thrown, routeRan: resolve.mock.calls.length > 0 };
}

const PRODUCTION_REDIRECT = { status: 307, location: INTERNAL_ROUTE_FALLBACK };

describe("production guard for /test in hooks.server.ts", () => {
  // SvelteKit strips `/__data.json` from event.url before handle runs, so a
  // server-load request arrives as the page path with isDataRequest set.
  it.each<[string, HarnessRequest]>([
    [
      "a harness page",
      { path: "/test/prop-viewing", routeId: "/test/prop-viewing" },
    ],
    [
      "an endpoint with no dev check",
      {
        path: "/test/qft-page/img/a.gif",
        routeId: "/test/qft-page/img/[file]",
      },
    ],
    [
      "the __data.json request behind a server load",
      {
        path: "/test/arrow-placement-lab",
        routeId: "/test/arrow-placement-lab",
        isDataRequest: true,
      },
    ],
    ["the tree root", { path: "/test", routeId: "/test" }],
  ])("redirects %s before the route runs", async (_, harness) => {
    const handle = await loadHandle(false);

    const { thrown, routeRan } = await send(handle, harness);

    expect(thrown).toMatchObject(PRODUCTION_REDIRECT);
    expect(routeRan).toBe(false);
  });

  it("matches the decoded route, so a percent-encoded path cannot slip past", async () => {
    const handle = await loadHandle(false);

    const { thrown, routeRan } = await send(handle, {
      path: "/%74est/avatar-bakeoff",
      routeId: "/test/avatar-bakeoff",
    });

    expect(thrown).toMatchObject(PRODUCTION_REDIRECT);
    expect(routeRan).toBe(false);
  });

  it.each<[string, HarnessRequest]>([
    [
      "a route that only shares the prefix",
      { path: "/testimonials", routeId: "/testimonials" },
    ],
    [
      "an API route named after tests",
      { path: "/api/test-render", routeId: "/api/test-render" },
    ],
    ["a request no route matched", { path: "/favicon.ico", routeId: null }],
  ])("leaves %s alone", async (_, harness) => {
    const handle = await loadHandle(false);

    const { thrown, routeRan } = await send(handle, harness);

    expect(thrown).toBeUndefined();
    expect(routeRan).toBe(true);
  });

  it("serves /test normally on the dev server", async () => {
    const handle = await loadHandle(true);

    const { thrown, routeRan } = await send(handle, {
      path: "/test/qft-page/img/a.gif",
      routeId: "/test/qft-page/img/[file]",
    });

    expect(thrown).toBeUndefined();
    expect(routeRan).toBe(true);
  });
});
