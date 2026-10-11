import { describe, expect, it } from "vitest";
import {
  arrangementCellLook,
  arrangementLookOverride,
} from "#lib/shared/media-composition/domain/arrangement-look.js";

describe("arrangementCellLook", () => {
  it("reads the cell's flags over the grid's and is null when neither says anything", () => {
    expect(arrangementCellLook(undefined, {})).toBeNull();
    expect(arrangementCellLook({ darkMode: true }, {})).toEqual({
      darkMode: true,
    });
    expect(
      arrangementCellLook(
        { darkMode: true, props: false },
        { appearance: { props: true } }
      )
    ).toEqual({ darkMode: true, props: true });
  });
});

describe("arrangementLookOverride", () => {
  it("keeps only the flags a change moved, over what the cell already said", () => {
    const look = { props: false, darkMode: true, effortPreset: "glide" as const };
    expect(arrangementLookOverride({ props: false }, look, ["darkMode"])).toEqual(
      { props: false, darkMode: true }
    );
    expect(arrangementLookOverride({ props: false }, look, [])).toEqual({
      props: false,
    });
  });

  it("drops a flag the change set back to unsaid and is undefined once nothing is left", () => {
    expect(
      arrangementLookOverride({ mandalaThickness: 4 }, { props: true }, [
        "mandalaThickness",
      ])
    ).toBeUndefined();
    expect(
      arrangementLookOverride(
        { mandalaThickness: 4, props: true },
        { props: true },
        ["mandalaThickness"]
      )
    ).toEqual({ props: true });
  });
});
