import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { fanAppearanceArtwork } from "#lib/shared/pictograph/prop/domain/fan-appearance.js";

const root = process.cwd();
const contours = JSON.parse(
  fs.readFileSync(
    path.join(root, "scripts/assets/doodlegrip-day-contours.json"),
    "utf8"
  )
) as { outline: number[][]; holes: number[][][] };

function readArtwork(cover: "bare" | "covered") {
  const href = fanAppearanceArtwork("day", cover)!;
  const file = href.replace(/\?.*$/, "");
  return fs.readFileSync(path.join(root, "static", file), "utf8");
}

function plateLoops(svg: string): string[] {
  const plate = /<path data-day-plate="" d="([^"]+)"/.exec(svg)?.[1] ?? "";
  return plate.split(" Z").filter((loop) => loop.trim().length > 0);
}

describe("DoodleGrip Day fan artwork", () => {
  it("draws the traced cut sheet as one even-odd plate on the hand pivot", () => {
    const svg = readArtwork("bare");
    expect(svg).toContain('data-fan-frame="" fill="#2E3192" fill-rule="evenodd"');
    const loops = plateLoops(svg);
    expect(loops).toHaveLength(1 + contours.holes.length);
    expect(loops[0].split(" L ")).toHaveLength(contours.outline.length);

    // Every vertex stays inside the shared 260 x 207 prop box so nothing clips.
    const numbers = loops
      .join(" ")
      .match(/-?\d+(?:\.\d+)?/g)!
      .map(Number);
    for (let index = 0; index < numbers.length; index += 2) {
      expect(numbers[index]).toBeGreaterThanOrEqual(0);
      expect(numbers[index]).toBeLessThanOrEqual(260);
      expect(numbers[index + 1]).toBeGreaterThanOrEqual(0);
      expect(numbers[index + 1]).toBeLessThanOrEqual(207);
    }

    // The finger ring (last hole) is centred on the pivot at 130, 103.5.
    const ring = loops.at(-1)!.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    const xs = ring.filter((_, index) => index % 2 === 0);
    const ys = ring.filter((_, index) => index % 2 === 1);
    const center = [
      (Math.min(...xs) + Math.max(...xs)) / 2,
      (Math.min(...ys) + Math.max(...ys)) / 2,
    ];
    expect(center[0]).toBeCloseTo(130, 0);
    expect(center[1]).toBeCloseTo(103.5, 0);
  });

  it("leaves the whole plate to the hand color, with no rim or frame tint", () => {
    const bare = readArtwork("bare");
    expect(bare.match(/data-fan-frame=""/g)).toHaveLength(1);
    expect(bare).not.toContain("stroke-width");
    expect(bare).not.toContain("data-fan-frame-tint");
    expect(bare).not.toContain('data-fan-cover=""');
    expect(readArtwork("covered")).toContain('data-fan-cover=""');
    for (const stale of ["black", "white", "black-covered", "white-covered"]) {
      expect(
        fs.existsSync(path.join(root, `static/images/props/appearances/fan-day-${stale}.svg`))
      ).toBe(false);
    }
  });
});
