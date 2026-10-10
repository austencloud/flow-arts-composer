import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  Group,
  Mesh,
  MeshStandardMaterial,
  BoxGeometry,
  PerspectiveCamera,
  ShaderMaterial,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { BackgroundType } from "@austencloud/backgrounds";
import { createDefaultRainbowConfig } from "#lib/shared/3d/environments/domain/models/scene-configs/rainbow-scene-config.js";
import { getStageCoordinateFrame } from "#lib/shared/3d/environments/domain/stage-coordinate-frame.js";
import {
  createRainbowEnvironmentWorld,
  getRainbowVenueScale,
} from "#lib/shared/3d/environments/worlds/rainbow/rainbow-environment-world.js";
import { createRainbowPrototypeWorld } from "#lib/shared/3d/worker-renderer/worlds/rainbow-prototype-world.js";

function fixture() {
  const venue = new Group();
  const court = new Mesh(
    new BoxGeometry(12, 0.05, 12),
    new MeshStandardMaterial()
  );
  court.position.y = 0.425;
  court.userData.rainbowRole = "court";
  venue.add(court);
  return { venue, court };
}
afterEach(() => vi.restoreAllMocks());

describe("Spectrum Commons environment", () => {
  it("updates live controls without replacing or disposing the loaded venue", () => {
    const { venue, court } = fixture();
    const world = createRainbowEnvironmentWorld({ groundY: 0 }, venue);
    const dispose = vi.spyOn(court.geometry, "dispose");
    const config = createDefaultRainbowConfig();
    config.platform.radius = 9;
    config.platform.enabled = false;
    config.fog.density = 0.002;
    world.setConfig(config);
    expect(venue.parent!.scale.x).toBe(1.5);
    expect(court.visible).toBe(false);
    expect(world.fog.density).toBe(0.002);
    expect(dispose).not.toHaveBeenCalled();
    world.dispose();
  });
  it("keeps the authored floor on the canonical foot plane through cast growth", () => {
    const { venue, court } = fixture();
    const frame = getStageCoordinateFrame(BackgroundType.PRIDE, true);
    const world = createRainbowEnvironmentWorld(
      { groundY: -1.5, worldYOffset: frame.environmentYOffset },
      venue
    );
    for (const [groundY, radius, growth] of [
      [-1.5, 3, 0],
      [-2, 12, 3.5],
      [-1, 4, 1.5],
    ]) {
      world.setLayout(groundY!, radius!, growth!, frame.environmentYOffset);
      world.root.updateMatrixWorld(true);
      const top = court.localToWorld(new Vector3(0, 0.025, 0));
      expect(top.y).toBeCloseTo(groundY! + frame.performerAnchorY);
      expect(venue.parent!.scale.x * 6).toBeGreaterThanOrEqual(radius!);
    }
    world.dispose();
  });

  it("expands supports and seating with the court, while legacy small radii remain safe", () => {
    expect(getRainbowVenueScale(3, 2)).toBe(1);
    expect(getRainbowVenueScale(12, 6, 3.5)).toBe(2);
    expect(getRainbowVenueScale(4, 6, 3.5)).toBeCloseTo(9.5 / 6);
  });

  it("freezes environmental motion for reduced motion and resumes without an elapsed-time jump", () => {
    const world = createRainbowEnvironmentWorld(
      { groundY: 0 },
      fixture().venue
    );
    const lake = world.root.getObjectByName("rainbow-lake") as Reflector;
    const material = lake.material as ShaderMaterial;
    const camera = new PerspectiveCamera();
    camera.position.set(3, 4, 5);
    world.update(1, 100, camera);
    const before = material.uniforms.uTime!.value;
    expect(before).toBeGreaterThan(0);
    world.setMotionScale(0);
    world.update(10, 110, camera);
    expect(material.uniforms.uTime!.value).toBe(before);
    world.setMotionScale(1);
    world.update(1, 111, camera);
    expect(material.uniforms.uTime!.value).toBeCloseTo(before * 2);
    expect(
      world.root.getObjectByName("rainbow-sky-gradient")!.position.toArray()
    ).toEqual([3, 4, 5]);
    world.dispose();
  });

  it("releases reflection targets and venue resources once on repeated disposal", () => {
    const { venue, court } = fixture();
    const world = createRainbowEnvironmentWorld({ groundY: 0 }, venue);
    const lake = world.root.getObjectByName("rainbow-lake") as Reflector;
    const reflectionDispose = vi.spyOn(lake.getRenderTarget(), "dispose");
    const geometryDispose = vi.spyOn(court.geometry, "dispose");
    world.dispose();
    world.dispose();
    expect(reflectionDispose).toHaveBeenCalledTimes(1);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(world.root.children).toHaveLength(0);
  });

  it("uses the same loaded venue in the worker and fits later cast positions", async () => {
    vi.spyOn(GLTFLoader.prototype, "loadAsync").mockResolvedValue({
      scene: fixture().venue,
    } as never);
    const progress = vi.fn();
    const world = await createRainbowPrototypeWorld({
      renderer: {} as never,
      camera: new PerspectiveCamera(),
      performers: [],
      reducedMotion: true,
      requestId: 4,
      reportProgress: progress,
    });
    world.setPerformers!([{ position: [15, 0, 0], groundY: -1.5 }] as never);
    const layout = world.scene.getObjectByName("rainbow-pavilion-layout")!;
    expect(layout.scale.x * 6).toBeGreaterThan(15);
    expect(progress).toHaveBeenLastCalledWith("construct", 1);
    world.dispose();
    expect(world.scene.children).toHaveLength(0);
  });

  it("ships seven separately addressable sails and the authored court without review figures", () => {
    const bytes = readFileSync("static/models/rainbow/spectrum-commons.glb");
    const jsonLength = bytes.readUInt32LE(12);
    const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
    const nodes = document.nodes as {
      extras?: { rainbowRole?: string };
      name?: string;
    }[];
    expect(
      nodes.filter((node) => node.extras?.rainbowRole === "sail")
    ).toHaveLength(7);
    expect(
      nodes.filter((node) => node.extras?.rainbowRole === "court")
    ).toHaveLength(1);
    expect(
      nodes.every(
        (node) => !/performer|audience|mannequin/i.test(node.name ?? "")
      )
    ).toBe(true);
    expect(bytes.length).toBeLessThan(4_000_000);
  });
});
