import { describe, expect, it } from "vitest";
import { scanPropProperties } from "#lib/shared/analytics/scan-prop-attribution.js";

describe("scan prop attribution", () => {
  it("keeps mixed left and right props explicit", () => {
    expect(scanPropProperties("fan", "hoop")).toEqual({
      left_prop: "fan",
      right_prop: "hoop",
      mixed_props: true,
    });
  });

  it("marks a matched pair without collapsing it to one field", () => {
    expect(scanPropProperties("staff", "staff")).toEqual({
      left_prop: "staff",
      right_prop: "staff",
      mixed_props: false,
    });
  });
});
