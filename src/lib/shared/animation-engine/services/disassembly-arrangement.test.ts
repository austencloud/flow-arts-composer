import { describe, expect, it } from "vitest";
import {
  heroSizeFor,
  resolveDisassemblyArrangement,
} from "./disassembly-arrangement";

// Boxes measured from the Side by Side report on a 2000x1125 window: the
// animation pane is ~920x890 with 7rem (112px) of word + transport chrome.
const sideBySidePane = { width: 920, height: 890, chromeHeight: 112 };

describe("heroSizeFor", () => {
  it("stacked hero is two thirds of the usable height, capped by width", () => {
    expect(heroSizeFor("stacked", sideBySidePane)).toBeCloseTo(518.67, 1);
    expect(
      heroSizeFor("stacked", { width: 300, height: 890, chromeHeight: 112 })
    ).toBe(300);
  });

  it("sidecar hero is two thirds of the width, capped by usable height", () => {
    expect(heroSizeFor("sidecar", sideBySidePane)).toBeCloseTo(613.33, 1);
    expect(
      heroSizeFor("sidecar", { width: 2000, height: 500, chromeHeight: 112 })
    ).toBe(388);
  });
});

describe("resolveDisassemblyArrangement", () => {
  it("picks sidecar for the near-square Side by Side pane", () => {
    expect(resolveDisassemblyArrangement(sideBySidePane, null)).toBe("sidecar");
  });

  it("picks stacked for a portrait phone pane", () => {
    expect(
      resolveDisassemblyArrangement(
        { width: 390, height: 700, chromeHeight: 112 },
        null
      )
    ).toBe("stacked");
  });

  it("ties go to stacked", () => {
    // stacked = min(W, (H-c)*2/3) = 400; sidecar = min(2W/3, H-c) = 400
    expect(
      resolveDisassemblyArrangement(
        { width: 600, height: 712, chromeHeight: 112 },
        null
      )
    ).toBe("stacked");
  });

  it("keeps the current arrangement until the other wins by the hysteresis margin", () => {
    // stacked 400 vs sidecar 413: a 3% edge does not flip a live stack.
    const nearBreakEven = { width: 620, height: 712, chromeHeight: 112 };
    expect(resolveDisassemblyArrangement(nearBreakEven, "stacked")).toBe(
      "stacked"
    );
    expect(resolveDisassemblyArrangement(nearBreakEven, null)).toBe("sidecar");
    // stacked 400 vs sidecar 460: a 15% edge does.
    expect(
      resolveDisassemblyArrangement(
        { width: 690, height: 712, chromeHeight: 112 },
        "stacked"
      )
    ).toBe("sidecar");
  });

  it("returns the current arrangement for an unmeasured box", () => {
    expect(
      resolveDisassemblyArrangement(
        { width: 0, height: 0, chromeHeight: 0 },
        "sidecar"
      )
    ).toBe("sidecar");
    expect(
      resolveDisassemblyArrangement(
        { width: 0, height: 0, chromeHeight: 0 },
        null
      )
    ).toBe("stacked");
  });
});
