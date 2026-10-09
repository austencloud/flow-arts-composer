import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../../..");
const grid3d = readFileSync(
  resolve(repoRoot, "src/lib/shared/3d/components/Grid3D.svelte"),
  "utf8"
);
const gridPlane = readFileSync(
  resolve(repoRoot, "src/lib/shared/3d/components/GridPlane.svelte"),
  "utf8"
);

describe("worker grid production parity contract", () => {
  it("pins the production dimensions and layering copied by the worker owner", () => {
    expect(gridPlane).toContain(
      "getGridRingGeometry(handPointRadius, 0.015, 64)"
    );
    expect(gridPlane).toContain(
      "getGridRingGeometry(outerPointRadius, 0.01, 64)"
    );
    expect(gridPlane).toContain("position={[0, 0, 0.005]}");
    expect(gridPlane).toContain("position={[0, 0, 0.003]}");
    expect(gridPlane).toContain("position={[0, 0, 0.01]}");
    expect(gridPlane).toContain(
      "<T.Group position={[pos[0] * 1.08, pos[1] * 1.08, pos[2] * 1.08]}>"
    );
    expect(grid3d).toContain("getGridMarkerGeometry(0.04, 32)");
    expect(grid3d).toContain("getGridOrientationHelperArgs(effectiveSize)");
  });

  it("pins the production label styling represented by OffscreenCanvas", () => {
    expect(gridPlane).toContain("font-size: 9px");
    expect(gridPlane).toContain("font-weight: 700");
    expect(gridPlane.match(/rgba\(0, 0, 0, 0\.6\)/g)).toHaveLength(4);
    expect(gridPlane).toContain("<HTML center sprite>");
  });

  it("pins camera-selected labels and dual-wheel-only duplication", () => {
    expect(grid3d).toContain("const dot = Math.abs(_viewDir.dot(normal))");
    expect(grid3d).toContain("labelPlane = bestPlane");
    expect(grid3d).toContain("plane === Plane.WHEEL");
    expect(grid3d).toContain(
      "return [effectiveStaffHalfLength, -effectiveStaffHalfLength];"
    );
    expect(grid3d).toContain(
      "showLabels={labelPlane === plane && index === 0}"
    );
  });
});
