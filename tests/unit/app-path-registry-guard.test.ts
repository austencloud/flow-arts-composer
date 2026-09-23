import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/auth/firebase-auth-handler-proxy", () => ({
  isFirebaseAuthHandlerPath: (pathname: string) =>
    pathname.startsWith("/__/auth/"),
  proxyFirebaseAuthHandler: vi.fn(async () => new Response("auth handler")),
}));

vi.mock("$lib/server/auth/meta-oauth-proxy", () => ({
  isMetaOAuthProxyPath: () => false,
  proxyMetaOAuthRequest: vi.fn(),
}));

import {
  MODULE_DEFINITIONS,
  MODULE_ID_MIGRATIONS,
} from "$lib/shared/navigation/config/module-definitions";
import { handle, rejectUnknownAppPath } from "../../src/hooks.server";

/**
 * Every first path segment the app itself will accept as a module: every
 * current ModuleId (MODULE_DEFINITIONS) plus every legacy alias the client
 * still rewrites (MODULE_ID_MIGRATIONS — /discover, /dashboard, /realm, and
 * so on). Reading straight from the registry means a future module or alias
 * is covered automatically and this suite can never drift from what
 * `normalizeModuleId` actually accepts.
 */
const REGISTERED_FIRST_SEGMENTS = [
  ...MODULE_DEFINITIONS.map((m) => m.id),
  ...Object.keys(MODULE_ID_MIGRATIONS),
];

describe("rejectUnknownAppPath (hooks.server.ts soft-404 guard)", () => {
  it("has a non-empty registry to test against", () => {
    expect(REGISTERED_FIRST_SEGMENTS.length).toBeGreaterThan(10);
  });

  it("never gates a route other than the [...appPath] catch-all", () => {
    expect(rejectUnknownAppPath("/shop", "anything")).toBeUndefined();
    expect(rejectUnknownAppPath(undefined, "anything")).toBeUndefined();
    expect(rejectUnknownAppPath(null, "anything")).toBeUndefined();
  });

  for (const segment of REGISTERED_FIRST_SEGMENTS) {
    it(`lets a registered module path through: /${segment}`, () => {
      expect(rejectUnknownAppPath("/[...appPath]", segment)).toBeUndefined();
    });

    it(`lets a nested registered module path through: /${segment}/some-tab`, () => {
      expect(
        rejectUnknownAppPath("/[...appPath]", `${segment}/some-tab`)
      ).toBeUndefined();
    });

    it(`is case-insensitive for /${segment.toUpperCase()}`, () => {
      expect(
        rejectUnknownAppPath("/[...appPath]", segment.toUpperCase())
      ).toBeUndefined();
    });
  }

  it("404s a genuinely unknown path", () => {
    const response = rejectUnknownAppPath(
      "/[...appPath]",
      "asdfqwer-nonexistent"
    );
    expect(response?.status).toBe(404);
  });

  it("404s an empty appPath", () => {
    const response = rejectUnknownAppPath("/[...appPath]", "");
    expect(response?.status).toBe(404);
  });

  it("404s an undefined appPath", () => {
    const response = rejectUnknownAppPath("/[...appPath]", undefined);
    expect(response?.status).toBe(404);
  });
});

describe("handle() wiring", () => {
  function requestTo(pathname: string, appPath: string | undefined) {
    const request = new Request(`https://localhost:5173${pathname}`);
    let resolveCalled = false;
    return {
      response: handle({
        event: {
          url: new URL(request.url),
          request,
          route: { id: "/[...appPath]" },
          params: { appPath },
        },
        resolve: async () => {
          resolveCalled = true;
          return new Response("ok");
        },
      } as Parameters<typeof handle>[0]),
      wasResolved: () => resolveCalled,
    };
  }

  it("short-circuits before resolve() for an unknown app path", async () => {
    const { response, wasResolved } = requestTo(
      "/asdfqwer-nonexistent",
      "asdfqwer-nonexistent"
    );
    const res = await response;
    expect(res.status).toBe(404);
    expect(wasResolved()).toBe(false);
  });

  it("lets the Firebase auth proxy answer /__/auth/* before the gate", async () => {
    // No route owns /__/auth/handler, so SvelteKit matches it to the catch-all.
    const { response } = requestTo("/__/auth/handler", "__/auth/handler");
    const res = await response;
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("auth handler");
  });

  it("calls resolve() normally for a registered module path", async () => {
    const first = REGISTERED_FIRST_SEGMENTS[0];
    const { response, wasResolved } = requestTo(`/${first}`, first);
    const res = await response;
    expect(res.status).not.toBe(404);
    expect(wasResolved()).toBe(true);
  });

  it("does not gate a request for an unrelated route", async () => {
    const request = new Request("https://localhost:5173/shop");
    const res = await handle({
      event: {
        url: new URL(request.url),
        request,
        route: { id: "/(public)/shop" },
        params: {},
      },
      resolve: async () => new Response("ok"),
    } as Parameters<typeof handle>[0]);
    expect(res.status).not.toBe(404);
  });
});
