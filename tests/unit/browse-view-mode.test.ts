import { describe, expect, it } from "vitest";
import {
  decodeViewMode,
  encodeViewMode,
  normalizeBrowseViewMode,
} from "#lib/shared/browse/domain/browse-view-mode.js";

describe("browse view mode hand identity", () => {
  it("keeps historical compact URLs stable while exposing performer hands", () => {
    expect(
      encodeViewMode({ subject: "props", granularity: "solo", hand: "left" })
    ).toBe("psb");
    expect(decodeViewMode("hsr")).toEqual({
      subject: "hands",
      granularity: "solo",
      hand: "right",
    });
  });

  it("normalizes browse state saved with palette identities", () => {
    expect(
      normalizeBrowseViewMode({
        subject: "props",
        granularity: "solo",
        color: "red",
      })
    ).toEqual({ subject: "props", granularity: "solo", hand: "right" });
  });
});
