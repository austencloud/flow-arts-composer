// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildPhoneSignInWorker } from "../../../scripts/build-phone-sign-in-worker.mjs";

// The script every visitor's worker loads, run the way importScripts runs it. A
// bundle that assumes a module scope, or reaches for something a worker lacks,
// would pass every other test and quietly lose one-tap sign-in on real phones.
describe("the bundled phone-sign-in-worker.js", () => {
  const outDir = mkdtempSync(join(tmpdir(), "phone-sign-in-worker-"));
  let source = "";

  beforeAll(async () => {
    source = readFileSync(await buildPhoneSignInWorker(outDir), "utf8");
  }, 60_000);

  afterAll(() => rmSync(outDir, { recursive: true, force: true }));

  it("is one classic script: no imports or exports, and no Firebase SDK", () => {
    expect(source).not.toMatch(/^\s*(import|export)\s/m);
    expect(source).not.toMatch(/gstatic|initializeApp/);
  });

  it("shows a sign-in and claims its click, from a fake self", async () => {
    const showNotification = vi.fn(async () => {});
    const scope = {
      registration: { showNotification, getNotifications: async () => [] },
      clients: { openWindow: vi.fn() },
    } as Record<string, any>;

    new Function("self", source)(scope);

    const worker = scope.phoneSignInWorker;
    const shown = await worker.showPush({
      data: {
        type: "phone-sign-in",
        id: "AbCdEfGhIjKlMnOpQr12",
        title: "Sign in Chrome on Windows?",
        body: "Tap to sign it in. Code 123 456",
        expiresInMs: "180000",
      },
    });

    expect(shown).toBe(true);
    const calls = showNotification.mock.calls as unknown as [
      string,
      { data: unknown },
    ][];
    expect(calls[0]?.[0]).toBe("Sign in Chrome on Windows?");
    expect(worker.ownsClick({ data: calls[0]?.[1].data })).toBe(true);
  });
});
