import { mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isWeb: vi.fn(),
}));

vi.mock("#lib/shared/platform/services/platform-detector.js", () => ({
  isWeb: mocks.isWeb,
}));
vi.mock("#lib/shared/auth/services/authenticator.js", () => ({
  signInWithGoogleCredential: vi.fn(),
}));
vi.mock("#lib/shared/utils/debug-logger.js", () => ({
  createComponentLogger: () => ({
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import GoogleOneTap from "#lib/shared/auth/components/GoogleOneTap.svelte";

describe("GoogleOneTap platform boundary", () => {
  let component: ReturnType<typeof mount> | null;

  beforeEach(() => {
    mocks.isWeb.mockReset();
    mocks.isWeb.mockReturnValue(false);
    document
      .querySelectorAll('script[src="https://accounts.google.com/gsi/client"]')
      .forEach((script) => script.remove());
    delete (window as Window & { google?: unknown }).google;
    component = null;
  });

  afterEach(async () => {
    if (component) await unmount(component);
  });

  it("does not load Google Identity Services in a native or desktop shell", async () => {
    component = mount(GoogleOneTap, { target: document.body });

    await vi.waitFor(() => expect(mocks.isWeb).toHaveBeenCalledOnce());

    expect(
      document.querySelector(
        'script[src="https://accounts.google.com/gsi/client"]'
      )
    ).toBeNull();
  });
});
