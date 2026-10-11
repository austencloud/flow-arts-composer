import { describe, expect, it } from "vitest";
import { BufferAttribute, Mesh, NormalBlending, Object3D } from "three";
import { BoundedSourcePath3D } from "#lib/shared/3d/effects/scene-effects/bounded-source-path-3d.js";
import {
  SILK_CROSS_SECTION_VERTEX_COUNT,
  SilkRibbonGeometry3D,
  resolveSilkAttachmentScale,
  resolveSilkMaterialProfile3D,
} from "#lib/shared/3d/effects/silk/silk-ribbon-geometry-3d.js";
import {
  SilkRenderer3D,
  resolveSilkSourceEnergyScale,
  resolveSilkSourceSampleBudget,
} from "#lib/shared/3d/effects/silk/silk-renderer-3d.js";
import type { Silk3DParams } from "#lib/shared/effects/translators/webgl3d-types.js";

function makeParams(): Silk3DParams {
  return {
    intensity: 0.5,
    width: 0.5,
    duration: 0.5,
    flutter: 0.55,
    tautness: 0.35,
    palette: "satin",
    customColor: "#c0c0d0",
    trackingMode: "both_ends",
    resolvedPalette: { id: "satin", body: "#c0c0d0", edge: "#ffffff" },
    baseHalfWidthWorld: 0.25,
    lifetimeSeconds: 2,
    motionReferenceSpeed: 3,
    maxPointsPerTip: 32,
  };
}

function makePath(): BoundedSourcePath3D {
  const path = new BoundedSourcePath3D(32);
  for (let index = 0; index < 12; index++) {
    path.push(
      {
        x: index * 0.16,
        y: Math.sin(index * 0.48) * 0.2,
        z: Math.cos(index * 0.31) * 0.08,
      },
      index * 0.1,
      index % 3 === 0 ? 2.4 : 0.9,
      0
    );
  }
  return path;
}

function renderRibbon(energyScale = 1): SilkRibbonGeometry3D {
  const ribbon = new SilkRibbonGeometry3D(64);
  const path = makePath();
  ribbon.beginFrame();
  ribbon.writeRibbon(
    path,
    makeParams(),
    1.1,
    {
      headSideX: 0,
      headSideY: 0,
      headSideZ: 0,
      hasHeadSide: false,
      propColor: "#3b82f6",
    },
    energyScale
  );
  ribbon.commit();
  return ribbon;
}

function rowWidth(positions: BufferAttribute, sample: number): number {
  const first = sample * SILK_CROSS_SECTION_VERTEX_COUNT;
  const last = first + SILK_CROSS_SECTION_VERTEX_COUNT - 1;
  return Math.hypot(
    positions.getX(last) - positions.getX(first),
    positions.getY(last) - positions.getY(first),
    positions.getZ(last) - positions.getZ(first)
  );
}

function renderedRowCount(
  ribbon: Pick<SilkRibbonGeometry3D, "geometry">
): number {
  const indicesPerSegment = (SILK_CROSS_SECTION_VERTEX_COUNT - 1) * 6;
  return ribbon.geometry.drawRange.count / indicesPerSegment + 1;
}

describe("Kinetic Silk surface", () => {
  it("opens from a narrow attachment throat", () => {
    expect(resolveSilkAttachmentScale(0, 0.25)).toBeCloseTo(0.06);
    expect(resolveSilkAttachmentScale(0.3, 0.25)).toBeCloseTo(1);

    const ribbon = renderRibbon();
    const positions = ribbon.geometry.getAttribute(
      "position"
    ) as BufferAttribute;
    expect(rowWidth(positions, 0)).toBeLessThan(rowWidth(positions, 4) * 0.2);
    ribbon.dispose();
  });

  it("tapers the free tail instead of ending as a rectangular slab", () => {
    const ribbon = renderRibbon();
    const positions = ribbon.geometry.getAttribute(
      "position"
    ) as BufferAttribute;
    const rowCount = renderedRowCount(ribbon);
    expect(rowWidth(positions, rowCount - 1)).toBeLessThan(
      rowWidth(positions, Math.floor(rowCount / 2)) * 0.2
    );
    ribbon.dispose();
  });

  it("builds a folded cross-section with changing surface normals", () => {
    const ribbon = renderRibbon();
    const normals = ribbon.geometry.getAttribute("normal") as BufferAttribute;
    const row =
      Math.floor(renderedRowCount(ribbon) / 2) *
      SILK_CROSS_SECTION_VERTEX_COUNT;
    const normalDelta = Math.hypot(
      normals.getX(row) - normals.getX(row + 3),
      normals.getY(row) - normals.getY(row + 3),
      normals.getZ(row) - normals.getZ(row + 3)
    );

    expect(SILK_CROSS_SECTION_VERTEX_COUNT).toBeGreaterThanOrEqual(7);
    expect(normalDelta).toBeGreaterThan(0.05);
    expect(renderedRowCount(ribbon)).toBeGreaterThan(12);
    ribbon.dispose();
  });

  it("normalizes accumulated opacity as more prop tips overlap", () => {
    expect(resolveSilkSourceEnergyScale(2)).toBe(1);
    expect(resolveSilkSourceEnergyScale(8)).toBeCloseTo(Math.pow(0.25, 0.72));

    const full = renderRibbon(1);
    const normalized = renderRibbon(0.5);
    const fullAlpha = full.geometry.getAttribute("alpha") as BufferAttribute;
    const normalizedAlpha = normalized.geometry.getAttribute(
      "alpha"
    ) as BufferAttribute;
    expect(normalizedAlpha.getX(0)).toBeCloseTo(fullAlpha.getX(0) * 0.5);
    full.dispose();
    normalized.dispose();
  });

  it("divides the fixed sample pool fairly across active sources", () => {
    expect(resolveSilkSourceSampleBudget(1)).toBe(6144);
    expect(resolveSilkSourceSampleBudget(8)).toBe(768);
    expect(resolveSilkSourceSampleBudget(32)).toBe(192);
  });

  it("gives the palettes distinct cloth responses", () => {
    const satin = resolveSilkMaterialProfile3D("satin");
    const velvet = resolveSilkMaterialProfile3D("velvet");
    const ethereal = resolveSilkMaterialProfile3D("ethereal");

    expect(satin.sheen).toBeGreaterThan(velvet.sheen);
    expect(velvet.roughness).toBeGreaterThan(satin.roughness);
    expect(ethereal.translucency).toBeGreaterThan(satin.translucency);
  });

  it("renders cloth in one bounded normal-blended draw instead of an additive duplicate", () => {
    const parent = new Object3D();
    const renderer = new SilkRenderer3D();
    renderer.initialize(parent);

    expect(parent.children).toHaveLength(1);
    const material = (
      parent.children[0] as { material?: { blending?: number } }
    ).material;
    expect(material?.blending).toBe(NormalBlending);
    renderer.dispose();
  });

  it("keeps sampling a moving tip while the cloth solver has a pending path extension", () => {
    const parent = new Object3D();
    const renderer = new SilkRenderer3D();
    renderer.initialize(parent);
    const params = makeParams();
    const source = {
      effect: "silk" as const,
      sourceId: 1,
      propIndex: 0 as const,
      tipIndex: 0 as const,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 1, y: 0, z: 0 },
      speed: 1,
      currentStep: 0,
      propColor: "#3b82f6",
      params,
    };

    renderer.update([source], 1 / 60);
    source.position = { x: 0.1, y: 0, z: 0 };
    renderer.update([source], 1 / 60);

    const mesh = parent.children[0] as Mesh;
    expect(mesh.geometry.drawRange.count).toBeGreaterThan(0);
    renderer.dispose();
  });

  it("keeps the stateful cloth solver finite through a long looping path", () => {
    const parent = new Object3D();
    const renderer = new SilkRenderer3D();
    renderer.initialize(parent);
    const source = {
      effect: "silk" as const,
      sourceId: 7,
      propIndex: 0 as const,
      tipIndex: 0 as const,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      speed: 2,
      currentStep: 0,
      propColor: "#ef4444",
      params: makeParams(),
    };

    for (let frame = 0; frame < 240; frame++) {
      const phase = frame * 0.075;
      source.position = {
        x: Math.cos(phase) * 1.4,
        y: Math.sin(phase * 1.3) * 1.1,
        z: Math.sin(phase * 0.7) * 0.25,
      };
      renderer.update([source], 1 / 60);
    }

    const mesh = parent.children[0] as Mesh;
    const positions = mesh.geometry.getAttribute("position") as BufferAttribute;
    const vertexCount =
      renderedRowCount({ geometry: mesh.geometry }) *
      SILK_CROSS_SECTION_VERTEX_COUNT;
    for (let vertex = 0; vertex < vertexCount; vertex++) {
      expect(Number.isFinite(positions.getX(vertex))).toBe(true);
      expect(Number.isFinite(positions.getY(vertex))).toBe(true);
      expect(Number.isFinite(positions.getZ(vertex))).toBe(true);
      expect(Math.abs(positions.getX(vertex))).toBeLessThan(10);
      expect(Math.abs(positions.getY(vertex))).toBeLessThan(10);
      expect(Math.abs(positions.getZ(vertex))).toBeLessThan(10);
    }
    renderer.dispose();
  });
});
