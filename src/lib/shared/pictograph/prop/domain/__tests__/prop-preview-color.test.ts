import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HandSide } from "../../../shared/domain/enums/pictograph-enums";
import { applyMotionColorToSvg } from "$lib/shared/utils/svg-color-utils";
import { applyHandColorOverride } from "../prop-preview-color";

// The same bundled artwork propSvgLoader serves, already carrying the default
// hand color the loader paints on (right = #ED1C24). The override must replace
// that paint, not just add another rule after it.
const staffSvg = readFileSync(
  new URL(
    "../../../../../../../static/images/props/pictograph/staff.svg",
    import.meta.url
  ),
  "utf8"
);
const loaderColoredRight = applyMotionColorToSvg(staffSvg, HandSide.RIGHT);
const loaderColoredLeft = applyMotionColorToSvg(staffSvg, HandSide.LEFT);

describe("applyHandColorOverride", () => {
  it("repaints the loader's default hand color with the user's chosen color", () => {
    expect(loaderColoredRight.toLowerCase()).toContain("#ed1c24");
    const green = applyHandColorOverride(
      loaderColoredRight,
      HandSide.RIGHT,
      "staff",
      "#22c55e"
    );
    expect(green.toLowerCase()).not.toContain("#ed1c24");
    expect(green.toLowerCase()).toContain("#22c55e");
  });

  it("keeps both hands' style rules distinct inside one host SVG", () => {
    const left = applyHandColorOverride(
      loaderColoredLeft,
      HandSide.LEFT,
      "staff",
      "#2e8bf0"
    );
    const right = applyHandColorOverride(
      loaderColoredRight,
      HandSide.RIGHT,
      "staff",
      "#22c55e"
    );
    const classesOf = (svg: string) =>
      new Set(svg.match(/\.st\d+-[\w-]+/g) ?? []);
    for (const cls of classesOf(left))
      expect(classesOf(right).has(cls)).toBe(false);
  });

  it("recolors a selective prop's hand paint without touching its neutral materials", () => {
    const torchSvg = readFileSync(
      new URL(
        "../../../../../../../static/images/props/pictograph/torch.svg",
        import.meta.url
      ),
      "utf8"
    );
    const loaderTorch = applyMotionColorToSvg(torchSvg, HandSide.RIGHT, {
      selectiveColorMode: true,
    });
    const recolored = applyHandColorOverride(
      loaderTorch,
      HandSide.RIGHT,
      "torch",
      "#22c55e"
    );
    expect(recolored.toLowerCase()).not.toContain("#ed1c24");
    expect(recolored.toLowerCase()).toContain("#22c55e");
    // Every other material (dark body, gold bands) survives the override.
    const otherPaints = (svg: string, hand: string) =>
      (svg.match(/#[0-9a-f]{6}/gi) ?? [])
        .map((c) => c.toLowerCase())
        .filter((c) => c !== hand)
        .sort();
    expect(otherPaints(recolored, "#22c55e")).toEqual(
      otherPaints(loaderTorch, "#ed1c24")
    );
  });
});
