/**
 * AUDIT (read-only): which handlers still execute when `dev` is false.
 *
 * Three things decide whether a `/test/**` or `/api/dev/**` endpoint is a
 * production surface:
 *
 *  1. The adapter's routes.exclude in `vite.config.ts` does not list
 *     `/test/*`, so those endpoints are compiled into the Cloudflare Worker.
 *  2. `src/routes/test/+layout.ts` redirects away from `/test` when `!dev`,
 *     but it is a `LayoutLoad`. Layout loads do not run for standalone
 *     `+server.ts` endpoints, or for the `__data.json` request that serves a
 *     `+page.server.ts` load, so it guards page navigation only.
 *  3. `src/hooks.server.ts` redirects every `/test` route when `!dev`, before
 *     any of its loads or handlers run.
 *
 * Outside `/test`, the per-handler `dev` check is the only gate. These tests
 * re-import each handler with `dev: false` and record which ones stop, then
 * run the server hook against every `/test` server file.
 */
import { readdirSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INTERNAL_ROUTE_FALLBACK } from "../../src/config/build-flags";

/** Re-import a handler module with `$app/env` reporting production. */
async function inProduction<T>(loader: () => Promise<T>): Promise<T> {
  vi.resetModules();
  vi.doMock("$app/env", () => ({
    dev: false,
    browser: false,
    building: false,
    version: "audit",
  }));
  return loader();
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock("$app/env");
  vi.resetModules();
});

describe("dev guards that DO stop the handler in production", () => {
  it("/api/dev/save-pictograph refuses before composing any path", async () => {
    const { POST } = await inProduction(
      () => import("../../src/routes/api/dev/save-pictograph/+server")
    );
    const response = await POST({
      request: new Request("https://tkaflowarts.com/api/dev/save-pictograph", {
        method: "POST",
        body: JSON.stringify({
          letter: "A",
          variation: 1,
          gridMode: "../../../../tmp/x",
          base64: "",
        }),
      }),
    } as never);

    expect(response.status).toBe(403);
  });

  it("/api/bake-clip refuses before touching the filesystem", async () => {
    const { POST } = await inProduction(
      () => import("../../src/routes/api/bake-clip/+server")
    );
    await expect(
      POST({
        request: new Request(
          "https://tkaflowarts.com/api/bake-clip?effort=a&name=b.mp4",
          {
            method: "POST",
            body: new Uint8Array(4),
          }
        ),
        url: new URL(
          "https://tkaflowarts.com/api/bake-clip?effort=a&name=b.mp4"
        ),
      } as never)
    ).rejects.toMatchObject({ status: 403 });
  });
});

// These handlers still carry no `dev` check of their own; in production the
// server hook stops their requests first (see the last describe block). What
// follows measures the handler bodies, as the dev server runs them.
describe("/test/qft-page handlers carry no dev check of their own", () => {
  it("still validates and answers a request when dev is false", async () => {
    const { GET } = await inProduction(
      () => import("../../src/routes/test/qft-page/img/[file]/+server")
    );

    // A dev-guarded sibling would refuse here. This one runs its own regex,
    // which is what answers — so the handler is live in the Worker bundle.
    await expect(
      GET({ params: { file: "../../../etc/passwd" } } as never)
    ).rejects.toMatchObject({ status: 400 });
  });

  it("reaches its filesystem read for a well-formed name, and 404s", async () => {
    const { GET } = await inProduction(
      () => import("../../src/routes/test/qft-page/img/[file]/+server")
    );

    // 404 (not 403) means the handler executed and the archive simply is not
    // on disk. Before the server hook refused /test in production, the private
    // archive staying undeployed was all that kept this from being an
    // exposure; nothing in the route checks it.
    await expect(
      GET({ params: { file: "nosuchimage.gif" } } as never)
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  it("applies the same shape to the frame endpoint", async () => {
    const { GET } = await inProduction(
      () =>
        import("../../src/routes/test/qft-page/frame/[stem]/[index]/+server")
    );

    await expect(
      GET({ params: { stem: "../etc", index: "0" } } as never)
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      GET({ params: { stem: "nosuchstem", index: "0" } } as never)
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects every traversal shape its regex is meant to exclude", async () => {
    const { GET } = await inProduction(
      () => import("../../src/routes/test/qft-page/img/[file]/+server")
    );

    // The NUL case is written as a \u0000 source escape rather than a raw
    // byte, so this file stays pure ASCII and survives every editor, diff and
    // checkout unchanged. It is the classic truncation trick: a reader that
    // stopped at the NUL would see ".gif"; the anchored regex sees the whole
    // string and refuses it.
    for (const name of [
      "../secret.gif",
      "a/../../x.gif",
      "A.GIF",
      "file.png",
      "a.gif\u0000.txt",
      "%2e%2e%2fx.gif",
    ]) {
      await expect(
        GET({ params: { file: name } } as never)
      ).rejects.toMatchObject({
        status: 400,
      });
    }
  });
});

const ROUTES = resolve(__dirname, "../../src/routes");

/** Every file under /test that runs on the server. */
function testServerFiles(dir = join(ROUTES, "test")): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return testServerFiles(path);
    return /^\+(server|page\.server|layout\.server)\.(ts|js)$/.test(entry.name)
      ? [path]
      : [];
  });
}

// A server load runs on its page's __data.json request, which SvelteKit
// routes to the page's own route id with the suffix stripped from event.url.
const TEST_SERVER_ROUTES = testServerFiles().map((file) => ({
  routeId: `/${relative(ROUTES, dirname(file)).replace(/\\/g, "/")}`,
  isDataRequest: !/^\+server\.(ts|js)$/.test(basename(file)),
}));

// Several of these files carry no dev check of their own, so the hook is the
// only thing between them and a production request.
describe("the server hook stops every /test server file in production", () => {
  it("finds both endpoints and server loads to check", () => {
    const kinds = new Set(TEST_SERVER_ROUTES.map((r) => r.isDataRequest));
    expect(kinds).toEqual(new Set([true, false]));
  });

  it.each(TEST_SERVER_ROUTES)(
    "$routeId redirects before it runs",
    async ({ routeId, isDataRequest }) => {
      const { handle } = await inProduction(
        () => import("../../src/hooks.server")
      );
      const request = new Request(`https://tkaflowarts.com${routeId}`);
      const resolveRoute = vi.fn(async () => new Response("route ran"));

      await expect(
        handle({
          event: {
            url: new URL(request.url),
            request,
            route: { id: routeId },
            params: {},
            isDataRequest,
          },
          resolve: resolveRoute,
        } as never)
      ).rejects.toMatchObject({
        status: 307,
        location: INTERNAL_ROUTE_FALLBACK,
      });
      expect(resolveRoute).not.toHaveBeenCalled();
    }
  );
});
