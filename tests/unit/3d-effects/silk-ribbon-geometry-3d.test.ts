import { describe, expect, it } from "vitest";
import type { BufferAttribute } from "three";
import { SilkRibbonGeometry3D } from "#lib/shared/3d/effects/silk/silk-ribbon-geometry-3d.js";
import { BoundedSourcePath3D } from "#lib/shared/3d/effects/scene-effects/bounded-source-path-3d.js";
import type { Silk3DParams } from "#lib/shared/effects/translators/webgl3d-types.js";

function makeParams(flutter: number): Silk3DParams {
  return {
    intensity: 0.5,
    width: 0.5,
    duration: 0.5,
    flutter,
    tautness: 0.2,
    palette: "satin",
    customColor: "#c0c0d0",
    trackingMode: "both_ends",
    resolvedPalette: { id: "satin", body: "#c0c0d0", edge: "#ffffff" },
    baseHalfWidthWorld: 0.25,
    lifetimeSeconds: 2,
    motionReferenceSpeed: 3,
    maxPointsPerTip: 16,
  };
}

function renderPositions(flutter: number): number[] {
  const path = new BoundedSourcePath3D(16);
  for (let index = 0; index < 8; index++) {
    path.push({ x: index * 0.2, y: 0, z: 0 }, index * 0.1, 1, 0);
  }

  const ribbon = new SilkRibbonGeometry3D(16);
  ribbon.beginFrame();
  ribbon.writeRibbon(path, makeParams(flutter), 1.2, {
    headSideX: 0,
    headSideY: 0,
    headSideZ: 0,
    hasHeadSide: false,
  });
  ribbon.commit();

  const positions = ribbon.geometry.getAttribute("position") as BufferAttribute;
  return Array.from(positions.array).slice(0, path.count * 2 * 3);
}

describe("SilkRibbonGeometry3D", () => {
  it("uses flutter to move the ribbon vertices", () => {
    const still = renderPositions(0);
    const fluttering = renderPositions(1);
    const largestDelta = Math.max(
      ...still.map((value, index) => Math.abs(value - fluttering[index]!))
    );

    expect(largestDelta).toBeGreaterThan(0.01);
  });
});

/**
 * Upload discipline. three's WebGLAttributes.updateBuffer re-uploads the WHOLE
 * backing array whenever an attribute is dirty with no update ranges, so a
 * ribbon that dirtied its buffers unconditionally paid 4.8 MB of bufferSubData
 * every frame even while it was drawing nothing.
 */
describe("SilkRibbonGeometry3D upload discipline", () => {
  const DYNAMIC_ATTRIBUTES = [
    "position",
    "normal",
    "ribbonTangent",
    "bodyColor",
    "edgeColor",
    "alpha",
    "ribbonEdge",
    "progress",
    "emissive",
    "sheen",
    "roughness",
    "translucency",
    "weaveFrequency",
  ] as const;

  function versionsOf(ribbon: SilkRibbonGeometry3D): number[] {
    const attributeVersions = DYNAMIC_ATTRIBUTES.map(
      (name) => (ribbon.geometry.getAttribute(name) as BufferAttribute).version
    );
    return [
      ...attributeVersions,
      (ribbon.geometry.index as BufferAttribute).version,
    ];
  }

  function writeOneFrame(ribbon: SilkRibbonGeometry3D): void {
    const path = new BoundedSourcePath3D(16);
    for (let index = 0; index < 8; index++) {
      path.push({ x: index * 0.2, y: 0, z: 0 }, index * 0.1, 1, 0);
    }
    ribbon.beginFrame();
    ribbon.writeRibbon(path, makeParams(0.4), 1.2, {
      headSideX: 0,
      headSideY: 0,
      headSideZ: 0,
      hasHeadSide: false,
    });
    ribbon.commit();
  }

  it("leaves every buffer clean while the ribbon is idle", () => {
    const ribbon = new SilkRibbonGeometry3D(16);
    ribbon.clear();
    const published = versionsOf(ribbon);

    ribbon.clear();
    ribbon.clear();
    ribbon.clear();

    expect(versionsOf(ribbon)).toEqual(published);
    expect(ribbon.geometry.drawRange.count).toBe(0);
    expect(ribbon.drawCount).toBe(0);
  });

  it("bounds every dirty attribute to the span it wrote", () => {
    const ribbon = new SilkRibbonGeometry3D(16);
    writeOneFrame(ribbon);

    expect(ribbon.drawCount).toBeGreaterThan(0);
    for (const name of DYNAMIC_ATTRIBUTES) {
      const attribute = ribbon.geometry.getAttribute(name) as BufferAttribute;
      expect(attribute.updateRanges).toHaveLength(1);
      const range = attribute.updateRanges[0]!;
      expect(range.start).toBe(0);
      expect(range.count).toBeGreaterThan(0);
      expect(range.count).toBeLessThanOrEqual(attribute.array.length);
    }

    const index = ribbon.geometry.index as BufferAttribute;
    expect(index.updateRanges).toHaveLength(1);
    expect(index.updateRanges[0]!.count).toBe(ribbon.drawCount);
  });

  it("retires a drawn ribbon by draw range alone, with no upload", () => {
    const ribbon = new SilkRibbonGeometry3D(16);
    writeOneFrame(ribbon);
    expect(ribbon.geometry.drawRange.count).toBeGreaterThan(0);

    // Going quiet needs no upload: the draw range stops the shader reading the
    // vertices the previous frame left behind, so re-publishing them would be
    // pure cost.
    const beforeQuiet = versionsOf(ribbon);
    ribbon.clear();
    expect(versionsOf(ribbon)).toEqual(beforeQuiet);
    expect(ribbon.geometry.drawRange.count).toBe(0);
    expect(ribbon.drawCount).toBe(0);

    ribbon.clear();
    ribbon.clear();
    expect(versionsOf(ribbon)).toEqual(beforeQuiet);
  });
});
