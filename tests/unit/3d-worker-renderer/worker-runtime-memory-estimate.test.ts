import {
  BufferGeometry,
  CompressedTexture,
  DataTexture,
  Mesh,
  MeshBasicMaterial,
  RGBAFormat,
  Scene,
  Texture,
  Uint16BufferAttribute,
  UnsignedByteType,
} from "three";
import { describe, expect, it } from "vitest";
import {
  estimateWorkerRuntimeBytes,
  retainedSceneBudgetBytes,
} from "$lib/shared/3d/worker-renderer/services/worker-runtime-memory-estimate";

const viewport = { width: 1, height: 1, dpr: 1 };

describe("worker runtime memory estimate", () => {
  it.each([undefined, NaN, Infinity, -1, 0.5, 4])(
    "uses the conservative retention budget for device memory %s",
    (deviceMemory) => {
      expect(retainedSceneBudgetBytes(deviceMemory)).toBe(96 * 1024 * 1024);
    }
  );

  it("allows heavier scenes on capable devices without an unbounded budget", () => {
    expect(retainedSceneBudgetBytes(8)).toBe(192 * 1024 * 1024);
    expect(retainedSceneBudgetBytes(16)).toBe(320 * 1024 * 1024);
    expect(retainedSceneBudgetBytes(128)).toBe(320 * 1024 * 1024);
  });

  it("uses compressed mip bytes instead of an expanded RGBA estimate", () => {
    const scene = new Scene();
    const texture = new CompressedTexture(
      [{ data: new Uint8Array(16) }, { data: new Uint8Array(4) }],
      1024,
      1024,
      RGBAFormat,
      UnsignedByteType
    );
    scene.add(
      new Mesh(new BufferGeometry(), new MeshBasicMaterial({ map: texture }))
    );

    const estimate = estimateWorkerRuntimeBytes(scene, viewport);

    expect(estimate.skipReason).toBeNull();
    expect(estimate.bytes).toBeLessThan(9 * 1024 * 1024);
  });

  it("counts data texture bytes and indexed geometry", () => {
    const scene = new Scene();
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Uint16BufferAttribute([0, 1, 2], 1));
    geometry.setIndex([0, 1, 2]);
    const texture = new DataTexture(new Uint8Array(64), 4, 4, RGBAFormat);
    texture.generateMipmaps = false;
    scene.add(new Mesh(geometry, new MeshBasicMaterial({ map: texture })));

    const estimate = estimateWorkerRuntimeBytes(scene, viewport);

    expect(estimate.skipReason).toBeNull();
    expect(estimate.bytes).toBeGreaterThan(8 * 1024 * 1024 + 64 + 12);
  });

  it("rejects retention when a texture cannot report an allocation", () => {
    const scene = new Scene();
    scene.add(
      new Mesh(
        new BufferGeometry(),
        new MeshBasicMaterial({ map: new Texture() })
      )
    );

    expect(estimateWorkerRuntimeBytes(scene, viewport).skipReason).toBe(
      "texture dimensions are unavailable (Texture)"
    );
  });
});
