import { describe, expect, it } from "vitest";
import { AdditiveBlending, BufferAttribute, NormalBlending } from "three";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { resolveInk3D } from "#lib/shared/effects/translators/webgl3d-translator.js";
import { BoundedSourcePath3D } from "#lib/shared/3d/effects/scene-effects/bounded-source-path-3d.js";
import { InkStrokeGeometry3D } from "#lib/shared/3d/effects/ink/ink-stroke-geometry-3d.js";
import { createInkStrokeMaterial3D } from "#lib/shared/3d/effects/ink/ink-stroke-material-3d.js";

const params = resolveInk3D(DEFAULT_EFFECTS_CONFIG.ink, {
  maxPointsPerTip: 96,
});

function center(
  position: BufferAttribute,
  ring: number
): [number, number, number] {
  let x = 0,
    y = 0,
    z = 0;
  for (let cross = 0; cross < 8; cross++) {
    const vertex = ring * 8 + cross;
    x += position.getX(vertex);
    y += position.getY(vertex);
    z += position.getZ(vertex);
  }
  return [x / 8, y / 8, z / 8];
}

describe("Ink stroke geometry", () => {
  it("joins smoothed rings across a wrapped source path without a seam", () => {
    const path = new BoundedSourcePath3D(96);
    for (let i = 0; i < 160; i++) {
      path.push(
        { x: i * 0.025, y: Math.sin(i * 0.06) * 0.1, z: 0 },
        i / 60,
        1.5,
        0
      );
    }
    const ink = new InkStrokeGeometry3D();
    ink.beginFrame();
    ink.writeStroke(path, params, 160 / 60, 4096);
    ink.commit();
    const position = ink.geometry.getAttribute("position") as BufferAttribute;
    const index = ink.geometry.index as BufferAttribute;
    const ringCount = (path.count - 1) * 3 + 1;
    expect(ink.drawCount).toBe((ringCount - 1) * 8 * 6);
    for (let ring = 1; ring < ringCount; ring++) {
      const a = center(position, ring - 1);
      const b = center(position, ring);
      expect(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])).toBeLessThan(
        0.05
      );
      expect(index.getX((ring - 1) * 48)).toBe((ring - 1) * 8);
    }
    ink.dispose();
  });

  it("keeps source meshes separate and finite through duplicate and reversing points", () => {
    const first = new BoundedSourcePath3D(8);
    const second = new BoundedSourcePath3D(8);
    for (const [i, x] of [0, 0.1, 0.1, 0.02, -0.08].entries()) {
      first.push({ x, y: 0, z: 0 }, i / 60, 0, 0);
    }
    second.push({ x: 10, y: 0, z: 0 }, 0, 0, 0);
    second.push({ x: 10.1, y: 0, z: 0 }, 1 / 60, 0, 0);
    const ink = new InkStrokeGeometry3D();
    ink.beginFrame();
    ink.writeStroke(first, params, 0.1, 4096);
    ink.writeStroke(second, params, 0.1, 4096);
    ink.commit();
    const position = ink.geometry.getAttribute("position") as BufferAttribute;
    const normal = ink.geometry.getAttribute("normal") as BufferAttribute;
    const index = ink.geometry.index as BufferAttribute;
    const indexCount = ink.drawCount;
    const firstIndexCount = (first.count - 1) * 3 * 8 * 6;
    const firstVertexCount = ((first.count - 1) * 3 + 1) * 8;
    expect(indexCount).toBe(firstIndexCount + (second.count - 1) * 3 * 8 * 6);
    for (let i = 0; i < firstIndexCount; i++)
      expect(index.getX(i)).toBeLessThan(firstVertexCount);
    for (let i = firstIndexCount; i < indexCount; i++)
      expect(index.getX(i)).toBeGreaterThanOrEqual(firstVertexCount);
    for (let i = 0; i < indexCount; i++) {
      const vertex = index.getX(i);
      for (const attribute of [position, normal]) {
        expect(Number.isFinite(attribute.getX(vertex))).toBe(true);
        expect(Number.isFinite(attribute.getY(vertex))).toBe(true);
        expect(Number.isFinite(attribute.getZ(vertex))).toBe(true);
      }
    }
    expect(indexCount).toBeGreaterThan(0);
    ink.clear();
    expect(ink.drawCount).toBe(0);
    ink.dispose();
  });

  it("retains separate normal and additive palette draw groups", () => {
    const path = new BoundedSourcePath3D(4);
    path.push({ x: 0, y: 0, z: 0 }, 0, 1, 0);
    path.push({ x: 0.2, y: 0.1, z: 0 }, 0.1, 1, 0);
    const ink = new InkStrokeGeometry3D();
    ink.beginFrame();
    ink.writeStroke(path, params, 0.1, 4096);
    ink.writeStroke(path, { ...params, emissiveMaterial: true }, 0.1, 4096);
    ink.commit();
    expect(ink.geometry.groups.map((group) => group.materialIndex)).toEqual([
      0, 1,
    ]);
    expect(ink.geometry.groups[1]!.start).toBe(ink.geometry.groups[0]!.count);
    const pigment = createInkStrokeMaterial3D();
    const neon = createInkStrokeMaterial3D(true);
    expect(pigment.blending).toBe(NormalBlending);
    expect(neon.blending).toBe(AdditiveBlending);
    pigment.dispose();
    neon.dispose();
    ink.dispose();
  });

  it("keeps brush pressure smooth when source speed alternates between updates", () => {
    const path = new BoundedSourcePath3D(24);
    for (let i = 0; i < 16; i++) {
      path.push({ x: i * 0.06, y: i * 0.015, z: 0 }, i / 60, i % 2 ? 3 : 0, 0);
    }
    const ink = new InkStrokeGeometry3D();
    ink.beginFrame();
    ink.writeStroke(path, params, 0.3, 4096);
    ink.commit();
    const position = ink.geometry.getAttribute("position") as BufferAttribute;
    const radii: number[] = [];
    const rings = (path.count - 1) * 3 + 1;
    for (let ring = 3; ring < rings - 3; ring++) {
      const c = center(position, ring);
      radii.push(
        Math.hypot(
          position.getX(ring * 8) - c[0],
          position.getY(ring * 8) - c[1],
          position.getZ(ring * 8) - c[2]
        )
      );
    }
    expect(Math.max(...radii) / Math.min(...radii)).toBeLessThan(1.5);
    ink.dispose();
  });

  it("keeps the flattened face aligned as the circular path advances", () => {
    const path = new BoundedSourcePath3D(8);
    for (let i = 0; i < 8; i++)
      path.push(
        { x: i * 0.05, y: Math.sin(i * 0.15) * 0.02, z: i * 0.01 },
        i / 60,
        1,
        0
      );
    const ink = new InkStrokeGeometry3D();
    const frame = {
      headSideX: 0,
      headSideY: 0,
      headSideZ: 1,
      hasHeadSide: false,
    };
    ink.beginFrame();
    ink.writeStroke(path, params, 0.2, 4096, frame);
    ink.commit();
    const first = [frame.headSideX, frame.headSideY, frame.headSideZ];
    path.push({ x: 0.4, y: 0.02, z: 0.08 }, 0.2, 1, 0);
    ink.beginFrame();
    ink.writeStroke(path, params, 0.21, 4096, frame);
    ink.commit();
    expect(
      first[0] * frame.headSideX +
        first[1] * frame.headSideY +
        first[2] * frame.headSideZ
    ).toBeGreaterThan(0.95);
    ink.dispose();
  });

  it("recovers when the saved brush side is parallel to a vertical tangent", () => {
    const path = new BoundedSourcePath3D(4);
    path.push({ x: 0, y: 0, z: 0 }, 0, 1, 0);
    path.push({ x: 0, y: 0, z: 0.2 }, 0.1, 1, 0);
    const frame = {
      headSideX: 0,
      headSideY: 0,
      headSideZ: 1,
      hasHeadSide: true,
    };
    const ink = new InkStrokeGeometry3D();
    ink.beginFrame();
    ink.writeStroke(path, params, 0.1, 4096, frame);
    ink.commit();
    const positions = ink.geometry.getAttribute("position") as BufferAttribute;
    const normals = ink.geometry.getAttribute("normal") as BufferAttribute;
    for (let vertex = 0; vertex < 8 * 4; vertex++) {
      expect(Number.isFinite(positions.getX(vertex))).toBe(true);
      expect(Number.isFinite(positions.getY(vertex))).toBe(true);
      expect(Number.isFinite(positions.getZ(vertex))).toBe(true);
      expect(Number.isFinite(normals.getX(vertex))).toBe(true);
      expect(Number.isFinite(normals.getY(vertex))).toBe(true);
      expect(Number.isFinite(normals.getZ(vertex))).toBe(true);
    }
    ink.dispose();
  });
});
