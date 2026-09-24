// @vitest-environment jsdom
/**
 * Share's Download line and the Export page read the render time from one
 * helper. A drift between them would promise one wait in the panel and show
 * another on the page that sets it.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  formatExportDuration,
  formatExportTimeEstimate,
  recordExportThroughput,
} from "$lib/shared/animation-panel/state/export-timing-tracker";

describe("export time estimate", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("marks a fallback estimate until this device has rendered at that size", () => {
    // 10 s at 30 fps is 300 frames; the 1080p fallback is 25 frames/s, plus
    // a second for the encoder.
    expect(formatExportTimeEstimate(1080, 30, 10, 1)).toBe("~13.0s est.");
  });

  it("drops the marker once a real render has been measured", () => {
    recordExportThroughput(1080, 600, 10_000);
    expect(formatExportTimeEstimate(1080, 30, 10, 2)).toBe("~11.0s");
  });

  it("has nothing to say without a duration", () => {
    expect(formatExportTimeEstimate(1080, 30, 0, 1)).toBe("");
  });

  it("switches to minutes past sixty seconds", () => {
    expect(formatExportDuration(72)).toBe("1m 12s");
    expect(formatExportDuration(120)).toBe("2m");
  });
});
