import { describe, expect, it, vi } from "vitest";

vi.mock("#lib/server/auth/firebase-auth-handler-proxy.js", () => ({
  isFirebaseAuthHandlerPath: () => false,
  proxyFirebaseAuthHandler: vi.fn(),
}));

vi.mock("#lib/server/auth/meta-oauth-proxy.js", () => ({
  isMetaOAuthProxyPath: () => false,
  proxyMetaOAuthRequest: vi.fn(),
}));

import { handle } from "../../src/hooks.server";

describe("Post Studio media policy", () => {
  it("allows every video origin used by the TKA library", async () => {
    const request = new Request("https://localhost:5173/test/post-studio");
    const response = await handle({
      event: {
        url: new URL(request.url),
        request,
      },
      resolve: async () => new Response("ok"),
    } as Parameters<typeof handle>[0]);

    const policy = response.headers.get("Content-Security-Policy");

    expect(policy).toContain("media-src 'self' blob:");
    expect(policy).toContain("https://assets.tkaflowarts.com");
    expect(policy).toContain(
      "https://pub-f5505ed75927471cb198c54336317370.r2.dev"
    );
    expect(policy).toContain("https://*.r2.cloudflarestorage.com");
  });
});
