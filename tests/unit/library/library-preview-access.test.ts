import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  effectiveUserId: "admin" as string | null,
  previewReadOnly: false,
}));

vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: {
    get effectiveUserId() {
      return mocks.effectiveUserId;
    },
  },
}));

vi.mock("#lib/shared/debug/state/user-preview-state.svelte.js", () => ({
  isPreviewReadOnly: () => mocks.previewReadOnly,
}));

import { getAuthenticatedUserId } from "#lib/shared/library/services/collection-firestore-mapper.js";

describe("Library preview access", () => {
  beforeEach(() => {
    mocks.effectiveUserId = "admin";
    mocks.previewReadOnly = false;
  });

  it("reads through the effective preview identity", () => {
    mocks.effectiveUserId = "preview-user";
    mocks.previewReadOnly = true;

    expect(getAuthenticatedUserId("read")).toBe("preview-user");
  });

  it("rejects writes while another user's library is being previewed", () => {
    mocks.effectiveUserId = "preview-user";
    mocks.previewReadOnly = true;

    expect(() => getAuthenticatedUserId()).toThrowError(
      expect.objectContaining({ code: "UNAUTHORIZED" })
    );
  });
});
