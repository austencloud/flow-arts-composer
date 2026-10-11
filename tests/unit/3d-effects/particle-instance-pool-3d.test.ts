import { describe, expect, it } from "vitest";
import { Object3D, PlaneGeometry, ShaderMaterial, Texture } from "three";
import { ParticleInstancePool3D } from "#lib/shared/3d/effects/instancing/particle-instance-pool-3d.js";
import { setLinearRgbFromHex } from "#lib/shared/3d/effects/instancing/particle-color.js";

describe("ParticleInstancePool3D", () => {
  it("packs visible particles into stable instance attributes", () => {
    const parent = new Object3D();
    const pool = new ParticleInstancePool3D({
      capacity: 2,
      geometry: new PlaneGeometry(1, 1),
    });
    pool.initialize(parent);

    pool.beginFrame();
    expect(
      pool.write({
        x: 1,
        y: 2,
        z: 3,
        scaleX: 4,
        scaleY: 5,
        scaleZ: 6,
        right: 0.25,
        green: 0.5,
        left: 0.75,
        alpha: 0.8,
      })
    ).toBe(true);
    pool.commit();

    expect(pool.mesh.count).toBe(1);
    expect(parent.children).toContain(pool.mesh);
    expect(
      Array.from(pool.mesh.geometry.getAttribute("aCenter").array).slice(0, 3)
    ).toEqual([1, 2, 3]);
    expect(
      Array.from(pool.mesh.geometry.getAttribute("aScale").array).slice(0, 3)
    ).toEqual([4, 5, 6]);
    expect(
      Array.from(pool.mesh.geometry.getAttribute("aColor").array).slice(0, 3)
    ).toEqual([0.25, 0.5, 0.75]);
    expect(pool.mesh.geometry.getAttribute("aAlpha").getX(0)).toBeCloseTo(0.8);
    expect(pool.mesh.geometry.getAttribute("aCenter").updateRanges).toEqual([
      { start: 0, count: 3 },
    ]);
  });

  it("refuses writes beyond capacity and disposes its scene object", () => {
    const parent = new Object3D();
    const pool = new ParticleInstancePool3D({
      capacity: 1,
      geometry: new PlaneGeometry(1, 1),
      billboard: true,
    });
    pool.initialize(parent);
    const particle = {
      x: 0,
      y: 0,
      z: 0,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
      right: 1,
      green: 1,
      left: 1,
      alpha: 1,
    };

    pool.beginFrame();
    expect(pool.write(particle)).toBe(true);
    expect(pool.write(particle)).toBe(false);
    pool.commit();
    expect(pool.mesh.count).toBe(1);

    pool.dispose();
    expect(parent.children).not.toContain(pool.mesh);
  });

  it("does not upload instance attributes for an empty material variant", () => {
    const pool = new ParticleInstancePool3D({
      capacity: 8,
      geometry: new PlaneGeometry(1, 1),
    });
    const center = pool.mesh.geometry.getAttribute("aCenter");
    const initialVersion = center.version;
    pool.beginFrame();
    pool.commit();
    expect(center.version).toBe(initialVersion);
    expect(pool.mesh.count).toBe(0);
  });

  it("carries an optional near-camera fade into the particle shader", () => {
    const pool = new ParticleInstancePool3D({
      capacity: 1,
      geometry: new PlaneGeometry(1, 1),
      nearFadeStart: 2.2,
      nearFadeEnd: 3.8,
    });
    const material = pool.mesh.material as ShaderMaterial;
    expect(material.uniforms.uNearFadeStart?.value).toBe(2.2);
    expect(material.uniforms.uNearFadeEnd?.value).toBe(3.8);
    expect(material.fragmentShader).toContain("smoothstep");
  });

  it("opts art-directed particles into scene lighting, fog, and far-depth softness", () => {
    const pool = new ParticleInstancePool3D({
      capacity: 1,
      geometry: new PlaneGeometry(1, 1),
      texture: new Texture(),
      fog: true,
      colorManaged: true,
      surfaceLighting: { strength: 0.72, floor: 0.24 },
      contrastAdaptation: {
        backdropLuminance: 0.035,
        minimumSurfaceLuminance: 0.15,
        maximumSurfaceLuminance: 0.72,
        strength: 0.86,
        edgeStrength: 0.2,
      },
      farFadeStart: 5.2,
      farFadeEnd: 10.5,
      farFadeOpacity: 0.56,
      farSoftness: 0.62,
    });
    const material = pool.mesh.material as ShaderMaterial;

    expect(material.fog).toBe(true);
    expect(material.lights).toBe(true);
    expect(material.defines.USE_PARTICLE_SURFACE_LIGHTING).toBe("");
    expect(material.defines.USE_PARTICLE_THIN_SURFACE).toBeUndefined();
    expect(material.defines.USE_PARTICLE_COLOR_MANAGEMENT).toBe("");
    expect(material.defines.USE_PARTICLE_CONTRAST_ADAPTATION).toBe("");
    expect(material.uniforms.uLightingStrength?.value).toBe(0.72);
    expect(material.uniforms.uLightingFloor?.value).toBe(0.24);
    expect(material.uniforms.uFarFadeStart?.value).toBe(5.2);
    expect(material.uniforms.uFarFadeEnd?.value).toBe(10.5);
    expect(material.uniforms.uFarFadeOpacity?.value).toBe(0.56);
    expect(material.uniforms.uFarSoftness?.value).toBe(0.62);
    expect(material.uniforms.uBackdropLuminance?.value).toBe(0.035);
    expect(material.uniforms.uMinimumSurfaceLuminance?.value).toBe(0.15);
    expect(material.uniforms.uMaximumSurfaceLuminance?.value).toBe(0.72);
    expect(material.uniforms.uContrastStrength?.value).toBe(0.86);
    expect(material.uniforms.uContrastEdgeStrength?.value).toBe(0.2);
    expect(material.fragmentShader).toContain("#include <fog_fragment>");
    expect(material.fragmentShader).toContain("#include <colorspace_fragment>");
    expect(material.fragmentShader).toContain(
      "abs(dot(normal, lightDirection))"
    );
    expect(material.fragmentShader).toContain("sampleColor.a * sampleColor.a");
    expect(material.fragmentShader).toContain("particleLuminance");

    pool.setContrastAdaptation({
      backdropLuminance: 0.56,
      minimumSurfaceLuminance: 0.08,
      maximumSurfaceLuminance: 0.2,
      strength: 0.94,
      edgeStrength: 0.3,
    });
    expect(material.uniforms.uBackdropLuminance?.value).toBe(0.56);
    expect(material.uniforms.uMaximumSurfaceLuminance?.value).toBe(0.2);
    expect(material.uniforms.uContrastStrength?.value).toBe(0.94);
  });

  it("enables thin-surface lighting only when requested", () => {
    const pool = new ParticleInstancePool3D({
      capacity: 1,
      geometry: new PlaneGeometry(1, 1),
      texture: new Texture(),
      surfaceLighting: { strength: 0.72, floor: 0.24 },
      thinSurfaceLighting: true,
      contrastAdaptation: {
        backdropLuminance: 0.56,
        minimumSurfaceLuminance: 0.15,
        maximumSurfaceLuminance: 0.2,
        strength: 0.94,
        edgeStrength: 0.2,
      },
    });
    const material = pool.mesh.material as ShaderMaterial;
    expect(material.defines.USE_PARTICLE_THIN_SURFACE).toBe("");
    pool.dispose();
  });

  it("converts authored sRGB tints into the shader's linear working space", () => {
    const color = { right: 0, green: 0, left: 0 };
    setLinearRgbFromHex(color, "#808080");
    expect(color.right).toBeCloseTo(0.21586, 4);
    expect(color.green).toBeCloseTo(0.21586, 4);
    expect(color.left).toBeCloseTo(0.21586, 4);
  });
});
