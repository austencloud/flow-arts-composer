import { describe, expect, it } from "vitest";
import { getUserIdentityLabels } from "#lib/shared/community/domain/user-identity-labels.js";

describe("getUserIdentityLabels", () => {
  it("leads with the chosen community name and keeps the unique handle", () => {
    expect(
      getUserIdentityLabels({
        username: "andrewpelarinos",
        displayName: "Myst13purple",
      })
    ).toEqual({
      primary: "Myst13purple",
      secondary: "@andrewpelarinos",
    });
  });

  it("falls back to the account name when no username exists", () => {
    expect(
      getUserIdentityLabels({ username: null, displayName: "Andrew" })
    ).toEqual({ primary: "Andrew", secondary: null });
  });

  it("does not repeat the same identity with different capitalization", () => {
    expect(
      getUserIdentityLabels({ username: "Andrew", displayName: "andrew" })
    ).toEqual({ primary: "andrew", secondary: null });
  });
});
