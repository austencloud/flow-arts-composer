import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  initializeAuthListener: vi.fn(),
  isAdmin: vi.fn(),
  isInitialized: vi.fn(),
}));

vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => auth);

import { load, ssr } from "../../src/routes/admin/+layout";

describe("admin route client guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.initializeAuthListener.mockResolvedValue(undefined);
    auth.isInitialized.mockReturnValue(true);
    auth.isAdmin.mockReturnValue(false);
  });

  it("disables SSR so direct loads cannot skip browser-backed auth", () => {
    expect(ssr).toBe(false);
  });

  it("redirects an initialized non-admin before rendering the route", async () => {
    await expect(load({} as never)).rejects.toMatchObject({
      status: 303,
      location: "/",
    });
    expect(auth.initializeAuthListener).toHaveBeenCalledOnce();
    expect(auth.isAdmin).toHaveBeenCalledOnce();
  });
});
