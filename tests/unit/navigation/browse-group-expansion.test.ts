import { describe, expect, it } from "vitest";
import { BROWSE_GROUPS } from "#lib/shared/navigation/config/tab-definitions.js";
import { mergeBrowseGroupExpansion } from "#lib/shared/navigation/utils/browse-group-expansion.js";

describe("Browse sidebar group preference migration", () => {
  it("opens both groups for new and legacy empty preferences", () => {
    expect(JSON.parse(mergeBrowseGroupExpansion(null, BROWSE_GROUPS)!)).toEqual(
      {
        community: true,
        library: true,
      }
    );
    expect(JSON.parse(mergeBrowseGroupExpansion("{}", BROWSE_GROUPS)!)).toEqual(
      {
        community: true,
        library: true,
      }
    );
  });

  it("preserves explicit collapse choices and unrelated keys", () => {
    const result = mergeBrowseGroupExpansion(
      JSON.stringify({ community: false, other: true }),
      BROWSE_GROUPS
    );
    expect(JSON.parse(result!)).toEqual({
      community: false,
      library: true,
      other: true,
    });
    expect(mergeBrowseGroupExpansion(result, BROWSE_GROUPS)).toBeNull();
  });

  it("recovers malformed and non-object preferences", () => {
    for (const stored of ["{", "null", "[]"]) {
      expect(
        JSON.parse(mergeBrowseGroupExpansion(stored, BROWSE_GROUPS)!)
      ).toEqual({
        community: true,
        library: true,
      });
    }
  });
});
