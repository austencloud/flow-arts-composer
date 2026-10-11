import {
  AdditiveBlending,
  CircleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  RingGeometry,
} from "three";
import { describe, expect, it, vi } from "vitest";
import {
  createWorkerSelectionMarker,
  type WorkerSelectionMarkerSnapshot,
} from "#lib/shared/3d/worker-renderer/worlds/selection-markers/worker-selection-marker.js";

function snapshot(
  overrides: Partial<WorkerSelectionMarkerSnapshot> = {}
): WorkerSelectionMarkerSnapshot {
  return {
    groundPosition: [2, -1.5, 3],
    color: 0x3b82f6,
    selected: true,
    allPerformersSelected: false,
    present: true,
    pulsePhase: 0,
    ...overrides,
  };
}

function mesh(
  root: Group,
  name: string
): Mesh<RingGeometry | CircleGeometry, MeshBasicMaterial> {
  const object = root.getObjectByName(name);
  if (!(object instanceof Mesh)) throw new Error(`Missing ${name}`);
  return object as Mesh<RingGeometry | CircleGeometry, MeshBasicMaterial>;
}

describe("worker selection marker parity", () => {
  it("builds the exact individual pulse-ring geometry and material flags", () => {
    const marker = createWorkerSelectionMarker(snapshot());
    const individual = marker.root.getObjectByName(
      "worker-selection-marker-individual"
    );
    const inner = mesh(marker.root, "worker-selection-marker-inner-ring");
    const outer = mesh(marker.root, "worker-selection-marker-outer-ring");
    const center = mesh(marker.root, "worker-selection-marker-center");

    expect(marker.root.position.toArray()).toEqual([2, -1.5, 3]);
    expect(individual?.position.toArray()).toEqual([0, 0.015, 0]);
    expect(individual?.rotation.x).toBeCloseTo(-Math.PI / 2, 12);
    expect((inner.geometry as RingGeometry).parameters).toMatchObject({
      innerRadius: 0.42,
      outerRadius: 0.58,
      thetaSegments: 64,
    });
    expect((outer.geometry as RingGeometry).parameters).toMatchObject({
      innerRadius: 0.58,
      outerRadius: 1,
      thetaSegments: 64,
    });
    expect((center.geometry as CircleGeometry).parameters).toMatchObject({
      radius: 0.42,
      segments: 64,
    });
    expect(inner.material).toMatchObject({
      transparent: true,
      opacity: 0.54,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    expect(outer.material).toMatchObject({
      transparent: true,
      opacity: 0.18,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    expect(center.material).toMatchObject({
      transparent: true,
      opacity: 0.15,
      blending: NormalBlending,
    });
    expect(center.material.depthWrite).toBe(true);

    marker.dispose();
  });

  it("updates the shared pulse value, color, and final ground position", () => {
    const marker = createWorkerSelectionMarker(snapshot());
    marker.update(
      snapshot({
        groundPosition: [-4, -0.75, 1.5],
        color: 0xef4444,
        pulsePhase: Math.PI / 2,
      })
    );
    const inner = mesh(marker.root, "worker-selection-marker-inner-ring");
    const outer = mesh(marker.root, "worker-selection-marker-outer-ring");
    const center = mesh(marker.root, "worker-selection-marker-center");

    expect(marker.root.position.toArray()).toEqual([-4, -0.75, 1.5]);
    expect(inner.material.opacity).toBeCloseTo(0.9, 12);
    expect(outer.material.opacity).toBeCloseTo(0.3, 12);
    expect(inner.material.color.getHex()).toBe(0xef4444);
    expect(outer.material.color.getHex()).toBe(0xef4444);
    expect(center.material.color.getHex()).toBe(0xef4444);

    marker.dispose();
  });

  it("suppresses individual rings and shows the exact gray all-selected disc", () => {
    const marker = createWorkerSelectionMarker(
      snapshot({ allPerformersSelected: true })
    );
    const individual = marker.root.getObjectByName(
      "worker-selection-marker-individual"
    );
    const all = mesh(marker.root, "worker-selection-marker-all");

    expect(individual?.visible).toBe(false);
    expect(all.visible).toBe(true);
    expect(all.position.toArray()).toEqual([0, 0.01, 0]);
    expect(all.rotation.x).toBeCloseTo(-Math.PI / 2, 12);
    expect((all.geometry as CircleGeometry).parameters).toMatchObject({
      radius: 0.35,
      segments: 32,
    });
    expect(all.material.color.getHex()).toBe(0x6b7280);
    expect(all.material).toMatchObject({
      transparent: true,
      opacity: 0.15,
      blending: NormalBlending,
      depthWrite: true,
    });

    marker.dispose();
  });

  it("hides both marker modes for an exiting performer", () => {
    const marker = createWorkerSelectionMarker(snapshot({ present: false }));
    expect(
      marker.root.getObjectByName("worker-selection-marker-individual")?.visible
    ).toBe(false);
    expect(mesh(marker.root, "worker-selection-marker-all").visible).toBe(
      false
    );

    marker.update(
      snapshot({
        present: false,
        selected: true,
        allPerformersSelected: true,
      })
    );
    expect(
      marker.root.getObjectByName("worker-selection-marker-individual")?.visible
    ).toBe(false);
    expect(mesh(marker.root, "worker-selection-marker-all").visible).toBe(
      false
    );

    marker.dispose();
  });

  it("accepts a structured clone and disposes every owned resource once", () => {
    const parent = new Group();
    const marker = createWorkerSelectionMarker(structuredClone(snapshot()));
    parent.add(marker.root);
    const meshes = [
      mesh(marker.root, "worker-selection-marker-inner-ring"),
      mesh(marker.root, "worker-selection-marker-outer-ring"),
      mesh(marker.root, "worker-selection-marker-center"),
      mesh(marker.root, "worker-selection-marker-all"),
    ];
    const geometryDisposals = meshes.map((entry) =>
      vi.spyOn(entry.geometry, "dispose")
    );
    const materialDisposals = meshes.map((entry) =>
      vi.spyOn(entry.material, "dispose")
    );

    marker.dispose();
    marker.dispose();

    expect(marker.root.parent).toBeNull();
    expect(marker.root.children).toHaveLength(0);
    for (const dispose of [...geometryDisposals, ...materialDisposals]) {
      expect(dispose).toHaveBeenCalledTimes(1);
    }
  });
});
