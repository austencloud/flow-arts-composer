import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SCANS,
  neededScans,
  scanFiles,
  scanRepeat,
} from "../../../src/routes/test/site-walk/look/site-walk-scan-list";
import { readSurroundingsText } from "../../../src/routes/test/site-walk/site-walk-around";
import {
  bareTreeGeometry,
  growBareTree,
} from "../../../src/routes/test/site-walk/site-walk-trees";

const around = (extra: Record<string, unknown>) => {
  const read = readSurroundingsText(
    JSON.stringify({ kind: "site-surroundings", version: 1, ...extra })
  );
  if (!read.ok) throw new Error(read.message);
  return read.around;
};

describe("which photographed surfaces a site needs", () => {
  it("asks for nothing it will not show", () => {
    expect(neededScans({ canopies: 0, streets: 0 }, null)).toEqual([]);
  });

  it("asks for the canopy weave and the street a bare plan has", () => {
    expect(neededScans({ canopies: 1, streets: 1 }, null)).toEqual([
      "cloth",
      "street",
    ]);
  });

  it("asks for each wall, ground and bark the surroundings wear, once", () => {
    const site = around({
      ground: { base: "grass", lot: "mulch", patio: "concrete" },
      buildings: [
        {
          id: "house",
          parts: [
            { shape: "rect", at: [0, 0], w: 20, d: 20, wall: "brick-brown" },
            { shape: "rect", at: [40, 0], w: 20, d: 20, wall: "brick-brown" },
          ],
        },
      ],
      trees: [{ at: [10, 10], kind: "bare", heightFt: 30, spreadFt: 20 }],
    });
    const needed = neededScans({ canopies: 0, streets: 0 }, site);
    expect(needed).toContain("lawn");
    expect(needed).toContain("mulch");
    expect(needed).toContain("concrete");
    expect(needed).toContain("bark");
    expect(new Set(needed).size).toBe(needed.length);
    expect(needed).toContain("brick-brown");
  });
});

describe("the picture files", () => {
  it("exist for every surface at both sizes", () => {
    for (const name of Object.keys(SCANS) as (keyof typeof SCANS)[]) {
      for (const small of [true, false]) {
        const files = scanFiles(name, small);
        for (const path of [files.albedo, files.normal]) {
          if (path) expect(existsSync(`static${path}`), path).toBe(true);
        }
      }
    }
  });
});

describe("scale", () => {
  it("shows a photograph at the size it was taken, whatever the mesh repeats at", () => {
    const { x, y } = scanRepeat("lawn", 4);
    expect(x * SCANS.lawn.wide).toBeCloseTo(4);
    expect(y * SCANS.lawn.high).toBeCloseTo(4);
  });

  it("lays every brick at the course the buildings are drawn to", () => {
    expect(SCANS["brick-buff"].high / 16).toBeCloseTo(
      SCANS["brick-red"].high / 14
    );
  });
});

describe("bark on a bare tree", () => {
  const tree = {
    at: { x: 0, z: 0 },
    kind: "bare" as const,
    height: 12,
    spread: 8,
    seed: 7,
  };
  const g = bareTreeGeometry(tree)!;
  const uv = g.getAttribute("uv");

  it("wraps a whole number of times round a limb, so it has no seam", () => {
    // The first piece is the trunk's foot: ten sides, six corners each.
    let widest = 0;
    for (let i = 0; i < 60; i++) widest = Math.max(widest, uv.getX(i));
    expect(widest).toBeGreaterThanOrEqual(1);
    expect(widest).toBeCloseTo(Math.round(widest), 5);
  });

  it("carries on up the trunk from one piece to the next", () => {
    const top = (from: number) => {
      let v = 0;
      for (let i = from; i < from + 60; i++) v = Math.max(v, uv.getY(i));
      return v;
    };
    const foot = (from: number) => {
      let v = Infinity;
      for (let i = from; i < from + 60; i++) v = Math.min(v, uv.getY(i));
      return v;
    };
    expect(foot(0)).toBeCloseTo(0);
    expect(foot(60)).toBeCloseTo(top(0), 4);
    expect(top(60)).toBeGreaterThan(foot(60));
  });

  // Corners 0, 1 and 3 of each side are at the piece's foot; 2, 4 and 5 at its top.
  const ends = (piece: number, corners: number[], name: string) => {
    const a = g.getAttribute(name);
    const out: number[][] = [];
    for (let side = 0; side < 10; side++)
      for (const c of corners) {
        const i = piece * 60 + side * 6 + c;
        out.push([a.getX(i), a.getY(i), a.getZ(i)]);
      }
    return out;
  };

  it("starts each trunk piece on the very ring the last one ended on", () => {
    for (const name of ["position", "normal"]) {
      const top = ends(0, [2, 4], name);
      const foot = ends(1, [0, 1], name);
      top.forEach((p, i) =>
        p.forEach((value, k) => expect(foot[i]![k]).toBeCloseTo(value, 5))
      );
    }
  });

  it("keeps one shade and one size of bark the whole way up a limb", () => {
    expect(ends(1, [0], "color")[0]).toEqual(ends(0, [0], "color")[0]);
    let first = 0;
    let second = 0;
    for (let i = 0; i < 60; i++) {
      first = Math.max(first, uv.getX(i));
      second = Math.max(second, uv.getX(60 + i));
    }
    expect(second).toBe(first);
  });

  it("closes the trunk's top in among its limbs", () => {
    const grown = growBareTree(tree.seed, tree.height, tree.spread);
    const trunk = grown.branches.filter((b) => b.level === 0);
    const limb = grown.branches.find((b) => b.level === 1)!;
    expect(trunk.at(-1)!.rb).toBeLessThan(limb.ra);
  });
});
