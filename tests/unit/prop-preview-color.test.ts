import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  colorPropPreview,
  modelPreviewColorMatrix,
} from "../../src/lib/shared/pictograph/prop/domain/prop-preview-color";

describe("detailed prop preview colors", () => {
  it.each(["guitar", "ukulele", "doublestar", "chicken"])(
    "retains %s paths and cutouts while recoloring",
    (type) => {
      const source = readFileSync(
        `static/images/props/buttons/${type}.svg`,
        "utf8"
      );
      const colored = colorPropPreview(source, type, "#22c55e");
      expect(colored).toContain("#22c55e");
      expect([...colored.matchAll(/\bd="([^"]*)"/g)].map((m) => m[1])).toEqual(
        [...source.matchAll(/\bd="([^"]*)"/g)].map((m) => m[1])
      );
      if (type === "guitar") expect(colored).toContain("fill:#FFFFFF");
    }
  );

  it("preserves fan wicks while coloring only the frame", () => {
    const source = readFileSync(
      "static/images/props/appearances/fan-flat-grip.svg",
      "utf8"
    );
    const colored = colorPropPreview(source, "fan", "#22c55e");
    expect(colored).toContain('stroke="#22c55e"');
    expect(colored.match(/fill="[^"]*"/g)).toEqual(
      source.match(/fill="[^"]*"/g)
    );
  });

  it.each(["left", "right"] as const)(
    "keeps neutral model detail and edge alpha for %s",
    (side) => {
      const matrix = modelPreviewColorMatrix("#22c55e", side)
        .split(" ")
        .map(Number);
      function transform(pixel: number[]) {
        return [0, 1, 2, 3].map((row) =>
          matrix
            .slice(row * 5, row * 5 + 4)
            .reduce(
              (sum, v, col) => sum + v * pixel[col]!,
              matrix[row * 5 + 4]!
            )
        );
      }
      for (const level of [0, 0.3, 1]) {
        const output = transform([level, level, level, 0.4]);
        expect(output[0]).toBeCloseTo(level);
        expect(output[1]).toBeCloseTo(level);
        expect(output[2]).toBeCloseTo(level);
        expect(output[3]).toBeCloseTo(0.4);
      }
      const capture = (side === "left" ? [59, 130, 246] : [239, 68, 68]).map(
        (v) => v / 255
      );
      const colored = transform([...capture, 1]);
      [34, 197, 94].forEach((v, i) => expect(colored[i]).toBeCloseTo(v / 255));
    }
  );
});
