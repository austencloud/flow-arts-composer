import { describe, expect, it, vi } from "vitest";
import {
  basePropTypeOfRenderKey,
  propArtworkStem,
  resolvePropRenderKey,
} from "../prop-look";

// These tests draw every fan look, and the looks stay renderable even while
// only some are offered, so they run with the preview flag on. The hoisted
// call runs before the modules read the flag.
vi.hoisted(() => {
  vi.stubEnv("VITE_MAKER_PREVIEW", "1");
});

describe("prop render keys", () => {
  it("keeps a plain prop's type, the one look it has", () => {
    expect(resolvePropRenderKey("club", {})).toBe("club");
    expect(resolvePropRenderKey("Staff", {})).toBe("staff");
  });

  it("lets the fan appearance contract win for fans", () => {
    expect(resolvePropRenderKey("fan", {})).toBe("fan__fire_bare");
    expect(
      resolvePropRenderKey("bigfan", {
        fanAppearance: {
          build: "pictograph",
          frameColor: "black",
          cover: "bare",
        },
      })
    ).toBe("bigfan");
  });

  it("strips a render key back to its notation prop", () => {
    expect(basePropTypeOfRenderKey("fan__fire_bare")).toBe("fan");
    expect(basePropTypeOfRenderKey("staff")).toBe("staff");
    // A key cached before prop versions went still names its prop.
    expect(basePropTypeOfRenderKey("club__model")).toBe("club");
  });
});

describe("prop artwork per hand", () => {
  it("gives the right hand its own stick and shares every other drawing", () => {
    expect(propArtworkStem("stick", "left")).toBe("stick");
    expect(propArtworkStem("stick", "right")).toBe("stick-right");
    expect(propArtworkStem("staff", "right")).toBe("staff");
    expect(propArtworkStem("fire_double_staff", "right")).toBe(
      "fire_double_staff"
    );
  });
});
