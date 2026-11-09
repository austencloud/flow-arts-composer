import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  WebGLRenderTarget,
} from "three";

import { QualityTier } from "../../effects/types";
import {
  applyModelCasterCap,
  applySunShadowBudget,
  getWorldShadowBudget,
} from "./world-shadow-budget";

function model(): Group {
  const group = new Group();
  const inner = new Group();
  inner.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
  group.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()), inner);
  return group;
}

function meshes(root: Group): Mesh[] {
  const out: Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof Mesh) out.push(child);
  });
  return out;
}

describe("world shadow budget", () => {
  it("spends fewer casters and texels on each lower tier", () => {
    const high = getWorldShadowBudget(QualityTier.HIGH);
    const medium = getWorldShadowBudget(QualityTier.MEDIUM);
    const low = getWorldShadowBudget(QualityTier.LOW);

    expect(high.maxModelCasters).toBeGreaterThan(medium.maxModelCasters);
    expect(medium.maxModelCasters).toBeGreaterThan(low.maxModelCasters);
    expect(high.mapSize).toBeGreaterThan(medium.mapSize);
    expect(high.mapSize).toBeLessThanOrEqual(1024);
    expect(low.sunShadows).toBe(false);
    expect(low.maxModelCasters).toBe(0);
    expect(medium.vegetationCasts).toBe(false);
  });

  it.each([QualityTier.HIGH, QualityTier.MEDIUM, QualityTier.LOW])(
    "caps casting models at the %s tier and keeps every mesh receiving",
    (tier) => {
      const cap = getWorldShadowBudget(tier).maxModelCasters;
      const models = Array.from({ length: 30 }, model);

      const casting = applyModelCasterCap(models, cap);

      expect(casting).toBe(Math.min(cap, models.length));
      models.forEach((root, index) => {
        const casts = index < cap;
        expect(root.castShadow).toBe(casts);
        for (const mesh of meshes(root)) {
          expect(mesh.castShadow).toBe(casts);
          expect(mesh.receiveShadow).toBe(true);
        }
      });
    }
  );

  it("turns casting back on when the cap rises", () => {
    const models = Array.from({ length: 10 }, model);
    applyModelCasterCap(models, 0);
    applyModelCasterCap(models, 10);
    for (const root of models) {
      for (const mesh of meshes(root)) expect(mesh.castShadow).toBe(true);
    }
  });

  it("resizes the sun's map and frees the old one", () => {
    const sun = new DirectionalLight();
    sun.shadow.mapSize.set(1024, 1024);
    const oldMap = new WebGLRenderTarget(1024, 1024);
    let disposed = false;
    oldMap.addEventListener("dispose", () => (disposed = true));
    sun.shadow.map = oldMap;

    applySunShadowBudget(sun, getWorldShadowBudget(QualityTier.MEDIUM), true);

    expect(sun.castShadow).toBe(true);
    expect(sun.shadow.mapSize.width).toBe(512);
    expect(sun.shadow.mapSize.height).toBe(512);
    expect(sun.shadow.map).toBeNull();
    expect(disposed).toBe(true);
  });

  it("keeps the sun dark where shadows are not allowed", () => {
    const sun = new DirectionalLight();
    applySunShadowBudget(sun, getWorldShadowBudget(QualityTier.HIGH), false);
    expect(sun.castShadow).toBe(false);
    applySunShadowBudget(sun, getWorldShadowBudget(QualityTier.LOW), true);
    expect(sun.castShadow).toBe(false);
  });
});
