import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { HandSide } from "../../../shared/domain/enums/pictograph-enums";
import { applyMotionColorToSvg } from "$lib/shared/utils/svg-color-utils";
import {
  applyHandColorOverride,
  applyModelSpriteColor,
  modelPreviewColorMatrix,
} from "../prop-preview-color";

// The same bundled artwork propSvgLoader serves, already carrying the default
// hand color the loader paints on (right = #ED1C24). The override must replace
// that paint, not just add another rule after it.
// Resolved from the repo root: under the jsdom project `import.meta.url` is an
// http URL, so a file-relative `new URL()` cannot reach the static asset.
const staffSvg = readFileSync(
  resolve("static/images/props/pictograph/staff.svg"),
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
      resolve("static/images/props/pictograph/torch.svg"),
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

describe("applyModelSpriteColor", () => {
  const sprite = (hand: "blue" | "red") =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" data-prop-look="model" data-prop="staff" data-motion-color="${hand}"><image href="data:image/webp;base64,AAAA" width="10" height="10"/></svg>`;

  it("leaves artwork that is not a model capture untouched", () => {
    expect(applyModelSpriteColor(staffSvg, "#22c55e")).toBe(staffSvg);
  });

  it("tints the capture from the palette it was lit in", () => {
    const green = applyModelSpriteColor(sprite("red"), "#22C55E");
    expect(green).toContain(
      `values="${modelPreviewColorMatrix("#22c55e", "right")}"`
    );
    expect(green).toContain('filter="url(#model-tint-right-22c55e)"');
    expect(green).toMatch(/<g data-model-tint-body=""[^>]*><image /);
    expect(green.endsWith("</g></svg>")).toBe(true);
  });

  it("replaces an earlier tint instead of stacking a second one", () => {
    const once = applyModelSpriteColor(sprite("blue"), "#22c55e");
    const twice = applyModelSpriteColor(once, "#a855f7");
    expect(twice.match(/data-model-tint-body/g)).toHaveLength(1);
    expect(twice).toContain("model-tint-left-a855f7");
    expect(twice).not.toContain("22c55e");
  });

  it("is what the hand override applies to a model capture", () => {
    expect(
      applyHandColorOverride(sprite("red"), HandSide.RIGHT, "staff", "#a855f7")
    ).toBe(applyModelSpriteColor(sprite("red"), "#a855f7"));
  });
});
