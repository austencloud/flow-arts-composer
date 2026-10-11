import { describe, expect, it } from "vitest";
import { EFFECTS } from "#lib/shared/animation-engine/components/effects-panel/effect-registry.js";
import {
  effectGridDestination,
  readReviewEffect,
} from "../../../src/routes/test/viewer-3d/effect-review.js";

describe("effect review in the production viewer", () => {
  it.each(EFFECTS.map(({ id }) => id))(
    "preserves the %s grid bookmark",
    (id) => {
      const destination = effectGridDestination(
        new URLSearchParams({ focus: id, scene: "forest" })
      );
      const url = new URL(destination, "https://localhost");
      expect(url.pathname).toBe("/test/viewer-3d");
      expect(url.searchParams.get("effect")).toBe(id);
      expect(url.searchParams.get("scene")).toBe("forest");
      expect(url.searchParams.has("focus")).toBe(false);
    }
  );

  it("opens Sparkle for unselected or invalid old bookmarks", () => {
    expect(effectGridDestination(new URLSearchParams())).toBe(
      "/test/viewer-3d?effect=sparkles"
    );
    expect(effectGridDestination(new URLSearchParams("focus=unknown"))).toBe(
      "/test/viewer-3d?effect=sparkles"
    );
    expect(
      readReviewEffect(new URLSearchParams("effect=unknown"))
    ).toBeUndefined();
  });
});
