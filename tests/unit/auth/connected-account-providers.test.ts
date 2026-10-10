import { describe, expect, it } from "vitest";

import { getAvailableProviderIds } from "#lib/shared/navigation/components/profile-settings/connected-accounts.providers.js";

const allEnabled = {
  facebookEnabled: true,
  instagramEnabled: true,
  native: false,
};

describe("getAvailableProviderIds", () => {
  it("excludes every provider that is already connected", () => {
    expect(
      getAvailableProviderIds(["google.com", "password"], allEnabled)
    ).toEqual(["facebook.com", "instagram.com"]);
  });

  it("keeps disabled social providers out of the connect list", () => {
    expect(
      getAvailableProviderIds([], {
        facebookEnabled: false,
        instagramEnabled: false,
        native: false,
      })
    ).toEqual(["google.com", "password"]);
  });

  it("hides popup-only social providers in the native app", () => {
    expect(
      getAvailableProviderIds([], {
        facebookEnabled: true,
        instagramEnabled: true,
        native: true,
      })
    ).toEqual(["google.com", "password"]);
  });
});
