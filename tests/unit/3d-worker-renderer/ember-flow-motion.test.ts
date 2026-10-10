import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import {
  Box3,
  Matrix4,
  Texture,
  Vector3,
  type InstancedMesh,
  type Mesh,
  type MeshStandardMaterial,
} from "three";
import {
  measureFlowPath,
  sampleFlowPath,
} from "#lib/shared/3d/environments/worlds/ember/ember-flow-motion.js";
import { createMidflankLava } from "#lib/shared/3d/environments/worlds/ember/ember-midflank-finish.js";

describe("Ember drifting crust", () => {
  it("travels by distance through uneven samples and wraps without reversing", () => {
    const path = measureFlowPath([
      new Vector3(0, 5, 10),
      new Vector3(0, 5, 9),
      new Vector3(0, 5, 0),
    ]);
    const position = new Vector3(),
      tangent = new Vector3();
    sampleFlowPath(path, 4, position, tangent);
    expect(position.toArray()).toEqual([0, 5, 6]);
    expect(tangent.toArray()).toEqual([0, 0, -1]);
    sampleFlowPath(path, 14, position, tangent);
    expect(position.z).toBe(6);
    sampleFlowPath(path, -1, position, tangent);
    expect(position.z).toBe(1);
  });

  it("keeps degenerate paths finite", () => {
    const point = new Vector3(1, 2, 3),
      output = new Vector3(),
      tangent = new Vector3();
    sampleFlowPath(measureFlowPath([point, point]), 100, output, tangent);
    expect(output.toArray()).toEqual([1, 2, 3]);
  });

  it("preserves shader coordinates and metre-sized moving rafts after GLB optimization", async () => {
    const bytes = readFileSync(
      "static/models/ember/ember-production-slice.glb"
    );
    const data = new Uint8Array(bytes.length);
    data.set(bytes);
    const gltf = await new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      // This test checks flow geometry; browsers verify the embedded atlas.
      .register(() => ({
        name: "geometry-test-textures",
        loadTexture: async () => new Texture(),
      }))
      .parseAsync(data.buffer, "");
    gltf.scene.position.y = -1.5;
    gltf.scene.updateMatrixWorld(true);
    const deposit = gltf.scene.getObjectByName(
      "EMBER_LavaSimulatorDeposit"
    ) as Mesh;
    expect(deposit.geometry.getAttribute("uv").count).toBeGreaterThan(20_000);
    // Check the delivered asset, not Blender's pre-export coordinates. A heat
    // feature at V-speed*time=constant must move toward decreasing world Z.
    const uv = deposit.geometry.getAttribute("uv");
    const positions = deposit.geometry.getAttribute("position");
    const sample = new Vector3();
    let upstream = { z: -Infinity, v: 0 },
      downstream = { z: Infinity, v: 0 };
    for (let index = 0; index < positions.count; index++) {
      sample
        .fromBufferAttribute(positions, index)
        .applyMatrix4(deposit.matrixWorld);
      if (sample.z > upstream.z) upstream = { z: sample.z, v: uv.getY(index) };
      if (sample.z < downstream.z)
        downstream = { z: sample.z, v: uv.getY(index) };
    }
    const metresPerV =
      (downstream.z - upstream.z) / (downstream.v - upstream.v);
    expect(metresPerV).toBeCloseTo(-1, 3);
    expect(0.72 * metresPerV).toBeLessThan(0);
    expect(deposit.geometry.getAttribute("color").count).toBe(
      deposit.geometry.getAttribute("position").count
    );
    const bank = deposit.geometry.getAttribute("color");
    let minimum = Infinity,
      maximum = -Infinity;
    for (let index = 0; index < bank.count; index++) {
      minimum = Math.min(minimum, bank.getX(index));
      maximum = Math.max(maximum, bank.getX(index));
    }
    expect(minimum).toBe(0);
    expect(maximum).toBe(1);
    expect(deposit.userData.ember_flow_paths_space).toBe(
      "world-relative-to-groundY"
    );
    expect(
      gltf.scene.getObjectByName("EMBER_BakedLavaClinker")
    ).toBeUndefined();
    const branches = [
      "EMBER_EastDistributary",
      "EMBER_UpperBraidedBranch",
      "EMBER_WestDistantFlow",
      "EMBER_FarEastFlow",
      "EMBER_LowerWestBreakout",
    ].map((name) => gltf.scene.getObjectByName(name) as Mesh);
    for (const branch of branches) {
      expect(branch.userData.ember_flow_surface).toBe(true);
      const path = branch.userData.ember_flow_paths[0] as number[][];
      for (let index = 1; index < path.length; index++) {
        expect(path[index][1]).toBeLessThan(path[index - 1][1]);
        expect(Math.hypot(path[index][0], path[index][2])).toBeGreaterThan(
          24.5
        );
      }
      const coordinates = branch.geometry.getAttribute("uv");
      const vertices = branch.geometry.getAttribute("position");
      let first = { v: Infinity, y: 0 },
        last = { v: -Infinity, y: 0 };
      for (let index = 0; index < coordinates.count; index++) {
        const v = coordinates.getY(index);
        sample
          .fromBufferAttribute(vertices, index)
          .applyMatrix4(branch.matrixWorld);
        if (v < first.v) first = { v, y: sample.y };
        if (v > last.v) last = { v, y: sample.y };
      }
      expect(last.y).toBeLessThan(first.y - 40);
      if (
        branch.name.includes("Distant") ||
        branch.name === "EMBER_FarEastFlow" ||
        branch.name === "EMBER_LowerWestBreakout"
      ) {
        const colors = branch.geometry.getAttribute("color");
        let hottest = 0,
          coolest = Infinity;
        for (let index = 0; index < colors.count; index++) {
          if (colors.getX(index) < 0.5) continue;
          const heat = colors.getY(index) / colors.getX(index);
          expect(colors.getZ(index) / colors.getX(index)).toBeLessThan(0.08);
          hottest = Math.max(hottest, heat);
          coolest = Math.min(coolest, heat);
        }
        expect(hottest).toBeGreaterThan(coolest * 5);
      }
    }
    const cold = gltf.scene.getObjectByName("EMBER_AbandonedOverflow") as Mesh;
    const distant = gltf.scene.getObjectByName(
      "EMBER_DistantValleyHeat"
    ) as Mesh;
    expect(distant.userData.ember_distant_flow_surface).toBe(true);
    const distantUv = distant.geometry.getAttribute("uv");
    const distantVertices = distant.geometry.getAttribute("position");
    const distantMask = distant.geometry.getAttribute("color");
    for (let index = 0; index < distantVertices.count; index += 137) {
      sample
        .fromBufferAttribute(distantVertices, index)
        .applyMatrix4(distant.matrixWorld);
      // One V unit is one downhill metre, just like the upstream river.
      expect(distantUv.getY(index) + sample.z).toBeCloseTo(1, 1);
      const coverage = distantMask.getX(index);
      expect(coverage).toBeGreaterThanOrEqual(0);
      expect(coverage).toBeLessThanOrEqual(1);
      if (coverage > 0.05) {
        expect(distantMask.getY(index) / coverage).toBeGreaterThan(0.65);
        expect(distantMask.getY(index) / coverage).toBeLessThanOrEqual(1.01);
      }
    }
    const coldMaterial = cold.material;
    const runtime = createMidflankLava(gltf.scene, -1.5);
    expect(cold.material).toBe(coldMaterial);
    for (const branch of branches)
      expect(branch.material).toBe(deposit.material);
    expect((distant.material as MeshStandardMaterial).onBeforeCompile).toBe(
      (deposit.material as MeshStandardMaterial).onBeforeCompile
    );
    const rafts = runtime.object.getObjectByName(
      "EmberDriftingCrust"
    ) as InstancedMesh;
    expect(rafts.count).toBe(400);
    const bounds = new Box3().setFromBufferAttribute(
      rafts.geometry.getAttribute("position")
    );
    const size = bounds.getSize(new Vector3());
    expect(size.x).toBeGreaterThan(0.7);
    expect(size.x).toBeLessThan(1.2);
    expect(size.y).toBeLessThan(0.08);
    const before = new Matrix4(),
      after = new Matrix4();
    rafts.getMatrixAt(30, before);
    for (let frame = 0; frame < 60; frame++) runtime.update(1 / 60, frame / 60);
    rafts.getMatrixAt(30, after);
    const a = new Vector3().setFromMatrixPosition(before),
      b = new Vector3().setFromMatrixPosition(after);
    expect(b.z).toBeLessThan(a.z);
    expect(a.distanceTo(b)).toBeGreaterThan(0.5);
    expect(a.distanceTo(b)).toBeLessThan(0.9);
    rafts.getMatrixAt(240, before);
    for (let frame = 0; frame < 60; frame++) runtime.update(1 / 60, frame / 60);
    rafts.getMatrixAt(240, after);
    a.setFromMatrixPosition(before);
    b.setFromMatrixPosition(after);
    expect(b.z).toBeLessThan(a.z);
    expect(b.y).toBeLessThan(a.y);
    const frozen = rafts.instanceMatrix.array.slice();
    runtime.update(0, 99);
    expect(rafts.instanceMatrix.array).toEqual(frozen);
    runtime.setGroundY(2);
    expect(runtime.object.position.y).toBe(2);
    const dispose = vi.spyOn(rafts.geometry, "dispose");
    runtime.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
