import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { calculate as calculateMandalaGeometry } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { flowerKey } from "#lib/shared/shape-matrix/domain/flower-signature.js";
import { buildModeRealizationCandidates } from "#lib/shared/shape-matrix/services/build-mode-realizations.js";
import {
  CURVE_MATCH_EPS,
  curveDistance,
} from "#lib/shared/shape-matrix/services/__tests__/curve-distance.js";
import { loadShapeMatrix } from "#lib/shared/shape-matrix/services/shape-matrix-flowers.js";
import { MODE_ORDER } from "#lib/shared/shape-matrix/services/shape-matrix-realizations.js";

const staticPath = path.resolve(process.cwd(), "static");
vi.stubGlobal("fetch", async (input: string | URL | Request) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const file = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0]!;
  return new Response(readFileSync(path.join(staticPath, file)), {
    status: 200,
    headers: {
      "content-type": file.endsWith(".json") ? "application/json" : "text/csv",
    },
  });
});

describe("three-petal and four-petal matrix realizations", () => {
  it("keeps every selected hand flower in both axis orders and all timing modes", async () => {
    const data = await loadShapeMatrix(PropType.STAFF);
    const flowers = (petals: number) =>
      data.axis.filter(
        (flower) => flower.grid === "diamond" && flower.petals === petals
      );
    const three = flowers(3);
    const four = flowers(4);
    expect(three.length).toBeGreaterThan(0);
    expect(four.length).toBeGreaterThan(0);

    for (const [lefts, rights] of [
      [three, four],
      [four, three],
    ]) {
      for (const left of lefts)
        for (const right of rights) {
          const selected = {
            left: data.left.get(flowerKey(left))?.left ?? [],
            right: data.right.get(flowerKey(right))?.right ?? [],
            tips: data.tips,
          };
          const cell = `${flowerKey(left)} × ${flowerKey(right)}`;
          expect(selected.left.length, cell).toBeGreaterThan(0);
          expect(selected.right.length, cell).toBeGreaterThan(0);

          for (const mode of MODE_ORDER) {
            const candidates = await buildModeRealizationCandidates(
              { left, right },
              selected,
              mode
            );
            expect(candidates.length, `${cell} ${mode}`).toBeGreaterThan(0);
            for (const candidate of candidates) {
              const actual = calculateMandalaGeometry(
                candidate.seq.steps,
                undefined,
                undefined,
                { tipEnds: 1, pathShape: "arc" },
                { left: [data.tips.left], right: [data.tips.right] }
              );
              expect(
                curveDistance(selected.left, actual.left),
                `${cell} ${mode} ${candidate.propMode ?? "no prop mode"} left`
              ).toBeLessThanOrEqual(CURVE_MATCH_EPS);
              expect(
                curveDistance(selected.right, actual.right),
                `${cell} ${mode} ${candidate.propMode ?? "no prop mode"} right`
              ).toBeLessThanOrEqual(CURVE_MATCH_EPS);
            }
          }
        }
    }
  }, 60_000);
});
