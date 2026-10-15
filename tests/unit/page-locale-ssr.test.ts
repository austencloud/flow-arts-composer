import type { Handle } from "@sveltejs/kit/hooks";
import { describe, expect, it, vi } from "vitest";
import deMessages from "../../messages/de.json";

vi.mock("#lib/server/auth/firebase-auth-handler-proxy.js", () => ({
  isFirebaseAuthHandlerPath: () => false,
  proxyFirebaseAuthHandler: vi.fn(),
}));

vi.mock("#lib/server/auth/meta-oauth-proxy.js", () => ({
  isMetaOAuthProxyPath: () => false,
  proxyMetaOAuthRequest: vi.fn(),
}));

// The real `read` needs a built server manifest. Serve German for the German
// catalog URL and fail loudly for anything else.
const read = vi.fn((asset: string) => {
  if (!/\/de\.json/.test(asset)) throw new Error(`unexpected asset ${asset}`);
  return new Response(JSON.stringify(deMessages));
});
let currentEvent: { locals: App.Locals } | undefined;
vi.mock("$app/server", () => ({
  read: (asset: string) => read(asset),
  getRequestEvent: () => {
    if (!currentEvent) throw new Error("no request");
    return currentEvent;
  },
}));

import { handle } from "../../src/hooks.server";
import { t } from "#lib/shared/i18n/i18n.svelte.js";

async function render(path: string) {
  const request = new Request(`https://tkaflowarts.com${path}`);
  const locals: App.Locals = {};
  const event = {
    url: new URL(request.url),
    request,
    route: { id: "/(public)/guide/level-2" },
    params: {},
    locals,
    cookies: { get: () => "de" },
  };
  const resolve: Parameters<Handle>[0]["resolve"] = async (
    resolvedEvent,
    options
  ) => {
    await Promise.resolve();
    const html = await options?.transformPageChunk?.({
      html: '<html lang="en" class="dark"><body></body></html>',
      done: true,
    });
    return new Response(html);
  };
  const response = await handle({
    event,
    resolve,
  } as unknown as Parameters<Handle>[0]);
  return { html: await response.text(), locals };
}

describe("localized public page language", () => {
  it("keeps concurrent German and English renders apart", async () => {
    const [german, english] = await Promise.all([
      render("/de/guide/level-2"),
      render("/guide/level-2"),
    ]);

    expect(german.html).toContain('<html lang="de" dir="ltr" class="dark">');
    expect(german.locals.pageMessages?.action_cancel).toBe("Abbrechen");
    expect(english.html).toContain('<html lang="en" class="dark">');
    expect(english.locals.pageLocale).toBeUndefined();
    expect(english.locals.pageMessages).toBeUndefined();
  });

  it("follows the URL, not the cookie, and only for localized paths", async () => {
    const about = await render("/de/about");
    expect(about.locals.pageLocale).toBeUndefined();
    expect(about.html).toContain('<html lang="en"');
  });

  it("makes t() answer in the request's language during a render", async () => {
    const german = await render("/de/guide/level-2");
    // Unit tests run as a browser environment; t() reads the request only on
    // the server.
    vi.stubEnv("SSR", true);
    currentEvent = german;
    expect(t("action_cancel")).toBe("Abbrechen");
    currentEvent = { locals: {} };
    expect(t("action_cancel")).toBe("Cancel");
    currentEvent = undefined;
    vi.unstubAllEnvs();
  });
});
