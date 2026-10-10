import { describe, it, expect } from "vitest";
import {
  TrailRenderer3D,
  TrailRingBuffer,
} from "#lib/shared/3d/effects/trails/trail-renderer-3d.js";
import { Vector3, type ShaderMaterial } from "three";

describe("TrailRingBuffer", () => {
  it("stores points up to capacity", () => {
    const buf = new TrailRingBuffer(4);
    buf.push(new Vector3(0, 0, 0));
    buf.push(new Vector3(1, 0, 0));
    buf.push(new Vector3(2, 0, 0));
    expect(buf.length).toBe(3);
  });

  it("overwrites oldest when full", () => {
    const buf = new TrailRingBuffer(3);
    buf.push(new Vector3(0, 0, 0));
    buf.push(new Vector3(1, 0, 0));
    buf.push(new Vector3(2, 0, 0));
    buf.push(new Vector3(3, 0, 0));

    expect(buf.length).toBe(3);
    const points = buf.toOrderedArray();
    expect(points[0].x).toBe(1);
    expect(points[2].x).toBe(3);
  });

  it("returns points in oldest-to-newest order", () => {
    const buf = new TrailRingBuffer(5);
    for (let i = 0; i < 7; i++) {
      buf.push(new Vector3(i, 0, 0));
    }
    const points = buf.toOrderedArray();
    expect(points[0].x).toBe(2);
    expect(points[4].x).toBe(6);
  });

  it("clears all points", () => {
    const buf = new TrailRingBuffer(4);
    buf.push(new Vector3(1, 2, 3));
    buf.push(new Vector3(4, 5, 6));
    buf.clear();
    expect(buf.length).toBe(0);
  });

  it("applies lifecycle visibility without overwriting authored opacity", () => {
    const renderer = new TrailRenderer3D({ opacity: 0.42 });
    const mesh = renderer.object3D;
    const material = mesh.material as ShaderMaterial;

    renderer.setVisibilityAlpha(-1);
    expect(material.uniforms.uVisibility?.value).toBe(0);
    expect(material.uniforms.uOpacity?.value).toBe(0.42);
    expect(mesh.visible).toBe(false);

    renderer.setVisibilityAlpha(0.5);
    expect(material.uniforms.uVisibility?.value).toBe(0.5);
    expect(mesh.visible).toBe(true);

    renderer.setVisibilityAlpha(2);
    expect(material.uniforms.uVisibility?.value).toBe(1);

    renderer.dispose();
  });
});
