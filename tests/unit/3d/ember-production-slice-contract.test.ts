import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createDefaultEmberConfig } from "$lib/shared/3d/environments/domain/models/scene-configs/ember-scene-config";
import { getCanonicalPerformerStageBounds } from "$lib/shared/3d/environments/domain/performer-stage-bounds";
import { isEmberGroundDetailSurface } from "$lib/shared/3d/environments/scenes/ember/ember-ground-detail";
import {
  EMBER_APRON_RIM_INSET,
  EMBER_APRON_RIM_TUCK,
  createEmberHorizonApron,
  createEmberSurfaceEcology,
  createEmberTerrainHeightField,
  distanceToEmberLavaCorridor,
  distanceToEmberLavaCorridorEdge,
  emberLavaCorridorHalfWidth,
  sampleEmberTerrainHeight,
} from "$lib/shared/3d/environments/scenes/ember/ember-surface-ecology";
import { createEmberSurfacePlateGeometry } from "$lib/shared/3d/environments/scenes/ember/ember-surface-plate-geometry";
import {
  LAVA_RIVER_BANK_MARGIN_FRACTION,
  createLavaRiverStripGeometry,
} from "$lib/shared/3d/environments/scenes/ember/lava-river-geometry";
import volcanicWorldR7 from "$lib/shared/3d/environments/domain/models/scene-configs/ember-volcanic-world-r7.json";
import {
  DEFAULT_VIEWER_FRONT_STAGE_CAMERA_Z_SIGN,
  DEFAULT_VIEWER_FRONT_STAGE_FACING_ANGLE,
  EMBER_VIEWER_FRONT_STAGE_CAMERA_Z_SIGN,
  EMBER_VIEWER_FRONT_STAGE_FACING_ANGLE,
  getViewerFrontStageCameraZ,
  getViewerFrontStageFacingAngle,
  resolveViewerFormationFacingAngle,
} from "$lib/shared/3d/domain/viewer-formation-facing";
import {
  SCENE_ENVIRONMENTS,
  SceneEnvironmentId,
} from "$lib/shared/3d/environments/domain/scene-environment";
import { createFormationFromPreset } from "@austencloud/scene-3d";
import { MeshStandardMaterial } from "three";

interface EmberSliceGltf {
  extensionsRequired?: string[];
  extensionsUsed?: string[];
  materials?: Array<{ name?: string }>;
  meshes?: Array<{ primitives: Array<{ material: number }> }>;
  images?: Array<{ name?: string; mimeType?: string }>;
  nodes?: Array<{
    name?: string;
    mesh?: number;
    extras?: {
      tka_scene?: string;
      tka_revision?: string;
      tka_gate?: number;
      tka_role?: string;
      tka_element?: string;
      tka_authorship?: string;
      tka_joint_sides?: number;
      tka_cap_loss_max?: number;
    };
  }>;
}

// Keep the historical rollback asset's contracts distinct from the R5 world.
const optimizedPath = resolve(
  "static/models/ember/ember-production-slice-r10.glb"
);
const integratedPath = resolve("static/models/ember/ember-integrated-room.glb");
const reportPath = resolve(
  "docs/superpowers/specs/ember-spatial-directions/evidence/gate-4-living-caldera-r10/ember-volcanic-world-production-slice-r10-report.json"
);
const volcanicWorldContractPath = resolve(
  "src/lib/shared/3d/environments/domain/models/scene-configs/ember-volcanic-world-r7.json"
);
const integratedReportPath = resolve(
  "docs/superpowers/specs/ember-spatial-directions/evidence/gate-5-r4/ember-integrated-room-r4-report.json"
);

function readOptimizedEmberAsset(path: string): EmberSliceGltf {
  const buffer = readFileSync(path);
  expect(buffer.readUInt32LE(0)).toBe(0x46546c67);
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(
    buffer.subarray(20, 20 + jsonLength).toString("utf8")
  ) as EmberSliceGltf;
}

describe("Ember historical R10 production-slice contracts", () => {
  const gltf = readOptimizedEmberAsset(optimizedPath);

  it("ships GPU-ready KTX2 textures and meshopt geometry under seven megabytes", () => {
    expect(gltf.extensionsRequired).toEqual(
      expect.arrayContaining([
        "EXT_meshopt_compression",
        "KHR_mesh_quantization",
        "KHR_texture_basisu",
      ])
    );
    expect(gltf.images).toHaveLength(12);
    expect(gltf.images?.every((image) => image.mimeType === "image/ktx2")).toBe(
      true
    );
    expect(statSync(optimizedPath).size).toBeLessThan(7_000_000);
  });

  it("retains the breached-caldera world and the four selected geology roles", () => {
    const roles = new Set(gltf.nodes?.map((node) => node.extras?.tka_role));
    expect(roles).toEqual(
      new Set([
        "playable-shelf",
        "shelf-stratum",
        "playable-surface",
        "cooled-fissure",
        "live-fissure",
        "caldera-bank",
        "perimeter-talus-cluster",
        "volcanic-basin",
        "lava-channel-levee",
        "meshy-hero-geology",
        "meshy-lava-bank",
        "meshy-fumarole-talus",
        "meshy-distant-caldera",
      ])
    );
    for (const role of [
      "meshy-hero-geology",
      "meshy-lava-bank",
      "meshy-fumarole-talus",
      "meshy-distant-caldera",
    ]) {
      expect(
        gltf.nodes?.filter((node) => node.extras?.tka_role === role)
      ).toHaveLength(1);
    }
    expect(
      gltf.nodes?.every(
        (node) =>
          !node.extras ||
          (node.extras.tka_scene === "ember" &&
            node.extras.tka_gate === 4 &&
            node.extras.tka_revision === "ember-living-caldera-gate4-r10")
      )
    ).toBe(true);
  });

  it("records the selected Meshy modules without repeating a source", () => {
    const imported =
      gltf.nodes?.filter(
        (node) => node.extras?.tka_authorship === "meshy-selected-multiview-r7"
      ) ?? [];
    expect(imported).toHaveLength(4);
    expect(new Set(imported.map((node) => node.extras?.tka_role))).toEqual(
      new Set([
        "meshy-hero-geology",
        "meshy-lava-bank",
        "meshy-fumarole-talus",
        "meshy-distant-caldera",
      ])
    );
  });

  it("ships only the approved Fresh Rift families and live-fissure source", () => {
    expect(new Set(gltf.materials?.map((material) => material.name))).toEqual(
      new Set([
        "Ember_R9_fresh-rift-synthesis_roped-pahoehoe",
        "Ember_R9_fresh-rift-synthesis_fractured-basalt",
        "Ember_R9_fresh-rift-synthesis_iron-contact-crust",
        "Ember_R9_fresh-rift-synthesis_windborne-ash",
        "Ember_R9_fresh-rift-synthesis_Blended_Terrain",
        "Ember_Live_Fissure",
      ])
    );
  });

  it("rejects runaway per-object subdivision before export", () => {
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
      geometry: {
        triangleCount: number;
        maximumMeshTriangleCount: number;
      };
    };
    expect(report.geometry.triangleCount).toBeLessThan(225_000);
    expect(report.geometry.maximumMeshTriangleCount).toBeLessThan(55_000);
  });

  it("records the four paid-source chains and rejects unrelated hero imports", () => {
    const report = readFileSync(reportPath, "utf8");
    expect(report).toContain('"sources": [');
    expect(report).toContain("remeshed through Meshy's topology service");
    expect(report).toContain("QRHbwRQLhM7Zn9LyYHOd");
    expect(report).toContain("gME4uHJawz9dtTlirRl8");
    expect(report).toContain("5otAzYdNg5Wp5E27mgfo");
    expect(report).toContain("nu73zqvPJRxio4T2sWz7");
    expect(report).toContain("ATURN84Ov2hmjWUndebl");
    expect(report).toContain("ZSnkB98pb0wz6PO17XKp");
    expect(report).toContain("s3cxnp6hOLBVQR5dDF42");
    expect(report).toContain("ahPuPwh34G3FeqvUEHsB");
    expect(report).toContain("01a045af-5015-7cb4-ac34-0d62f4269b67");
    expect(report).toContain("01a045b2-f26d-772f-a92e-9bf36e3fc318");
    expect(report).toContain("01a045b6-292c-7930-bdd7-ad8a5222989d");
    expect(report).toContain("01a045d9-7610-7858-bf2d-3caba206f23a");
    expect(report).toContain("01a045db-a666-78ec-99a2-3195f6a55319");
    expect(report).toContain("01a045e1-a103-7626-bff7-b62b29c74094");
    expect(report).not.toContain("generated/ember-rift-buttress");
    expect(report).not.toContain("static/models/ocean");
    expect(report).not.toContain("basalt_pinnacle");
    expect(report).toContain(
      "static/textures/ember-surface-r9/fresh-rift-family-mask.png"
    );
    expect(report).toContain(
      "src/lib/shared/3d/environments/primitives/masked-ground-detail-material.ts"
    );
  });

  it("uses one descending source-to-runout river in the static and runtime world", () => {
    const world = JSON.parse(
      readFileSync(volcanicWorldContractPath, "utf8")
    ) as {
      lavaRiver: {
        topology: string;
        sourceTaperFraction: number;
        pointsRuntimeXZHeight: [number, number, number][];
      };
      distantVent: {
        centerRuntimeXZ: [number, number];
      };
      terrain: {
        runtimeXRange: [number, number];
        runtimeZRange: [number, number];
        actionFloorRadius: number;
        actionTerrainBaseHeight: number;
        direction: string;
      };
    };
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
      contract: {
        lavaRiverControlPointsRuntimeXZHeight: [number, number, number][];
        distantVentCenterRuntimeXZ: [number, number];
        collapsedLavaBankCenterRuntimeXZ: [number, number];
        collapsedLavaBankRiverEdgeClearanceMeters: number;
        continuousOrbitDepthBands: string[];
        registeredReviewCameras: string[];
      };
      geometry: { volcanicBasinCount: number; lavaChannelLeveeCount: number };
    };
    const config = createDefaultEmberConfig();

    expect(world.lavaRiver.topology).toBe("single-distant-vent-source");
    expect(config.lavaRivers?.channels).toHaveLength(1);
    expect(config.lavaRivers?.channels[0]?.points).toEqual(
      world.lavaRiver.pointsRuntimeXZHeight
    );
    expect(report.contract.lavaRiverControlPointsRuntimeXZHeight).toEqual(
      world.lavaRiver.pointsRuntimeXZHeight
    );
    expect(report.contract.distantVentCenterRuntimeXZ).toEqual(
      world.distantVent.centerRuntimeXZ
    );

    const source = world.lavaRiver.pointsRuntimeXZHeight[0]!;
    const [ventX, ventZ] = world.distantVent.centerRuntimeXZ;
    expect([source[0], source[1]]).toEqual([ventX, ventZ]);
    expect(world.lavaRiver.sourceTaperFraction).toBeGreaterThan(0);
    for (
      let index = 1;
      index < world.lavaRiver.pointsRuntimeXZHeight.length;
      index += 1
    ) {
      expect(world.lavaRiver.pointsRuntimeXZHeight[index]![2]).toBeLessThan(
        world.lavaRiver.pointsRuntimeXZHeight[index - 1]![2]
      );
    }
    const stagePass = world.lavaRiver.pointsRuntimeXZHeight.filter(
      ([, z]) => Math.abs(z) <= 30
    );
    expect(stagePass.every(([x]) => x <= -10)).toBe(true);

    expect(report.contract.collapsedLavaBankCenterRuntimeXZ).toEqual([30.5, 6]);
    expect(
      report.contract.collapsedLavaBankRiverEdgeClearanceMeters
    ).toBeGreaterThan(4);
    expect(report.geometry.volcanicBasinCount).toBe(1);
    expect(report.geometry.lavaChannelLeveeCount).toBe(2);
    expect(world.terrain.runtimeXRange).toEqual([-190, 190]);
    expect(world.terrain.runtimeZRange[0]).toBeLessThanOrEqual(-140);
    expect(world.terrain.runtimeZRange[1]).toBeGreaterThanOrEqual(180);
    expect(world.terrain.direction).toBe("living-caldera");
    expect(world.terrain.actionFloorRadius).toBe(10.8);
    expect(world.terrain.actionTerrainBaseHeight).toBeCloseTo(0.49);
    expect(world.terrain.actionTerrainBaseHeight).toBeLessThan(0.5);
    expect(getCanonicalPerformerStageBounds(8).radius).toBeLessThan(
      world.terrain.actionFloorRadius
    );
    expect(report.contract.continuousOrbitDepthBands).toEqual([
      "foreground",
      "midground",
      "north-rim",
      "south-rim",
    ]);
    expect(report.contract.registeredReviewCameras).toContain("audience");

    const frontContinuation = world.lavaRiver.pointsRuntimeXZHeight.at(-1)!;
    expect(frontContinuation[1]).toBeLessThanOrEqual(-120);
    const minimumRiverClearance = Math.min(
      ...world.lavaRiver.pointsRuntimeXZHeight.map(([x, z]) => Math.hypot(x, z))
    );
    expect(
      minimumRiverClearance - config.lavaRivers!.width / 2
    ).toBeGreaterThan(9);
  });

  it("opens the river from a fissure point instead of a cut ribbon", () => {
    const channel = createDefaultEmberConfig().lavaRivers?.channels[0];
    expect(channel?.sourceTaperFraction).toBeGreaterThan(0);

    const { geometry } = createLavaRiverStripGeometry({
      channel: channel!,
      poolPosition: { x: 0, z: 0 },
      groundY: 0.5,
      width: 6.4,
      longitudinalSegments: 20,
      lateralSegments: 4,
    });
    const positions = geometry.getAttribute("position");
    const source = Array.from({ length: 5 }, (_, index) => [
      positions.getX(index),
      positions.getY(index),
      positions.getZ(index),
    ]);
    expect(new Set(source.map((point) => point.join(","))).size).toBe(1);

    const finalRowStart = 20 * 5;
    expect(
      Math.hypot(
        positions.getX(finalRowStart) - positions.getX(finalRowStart + 4),
        positions.getZ(finalRowStart) - positions.getZ(finalRowStart + 4)
      )
    ).toBeGreaterThan(5);
    geometry.dispose();
  });

  it("keeps the old prop ring disabled", () => {
    const config = createDefaultEmberConfig();
    expect(config.obsidianPillars.enabled).toBe(false);
    expect(config.platform.enabled).toBe(false);
    expect(config.rockCount).toBe(0);

    const sceneSource = readFileSync(
      resolve("src/lib/shared/3d/environments/scenes/EmberScene.svelte"),
      "utf8"
    );
    expect(sceneSource).toContain("createLoadedEmberEnvironmentWorld");
    expect(sceneSource).not.toContain("rock_largeA.glb");
    expect(sceneSource).not.toContain("rock_largeB.glb");
    expect(sceneSource).not.toContain("<GroundPlane");
    expect(sceneSource).not.toContain("<CraterGround");
  });
});

describe("Ember integrated-room contracts", () => {
  if (!existsSync(integratedPath)) {
    it.todo(
      "validates the historical integrated-room asset when it is present"
    );
    return;
  }

  const gltf = readOptimizedEmberAsset(integratedPath);

  it("ships the complete caldera under six megabytes with GPU compression", () => {
    expect(gltf.extensionsRequired).toEqual(
      expect.arrayContaining([
        "EXT_meshopt_compression",
        "KHR_mesh_quantization",
        "KHR_texture_basisu",
      ])
    );
    expect(gltf.images).toHaveLength(3);
    expect(gltf.materials).toHaveLength(7);
    expect(gltf.images?.every((image) => image.mimeType === "image/ktx2")).toBe(
      true
    );
    expect(statSync(integratedPath).size).toBeLessThan(6_000_000);
  });

  it("adds asymmetrical depth layers without rebuilding a prop ring", () => {
    const names = gltf.nodes?.map((node) => node.name) ?? [];
    expect(
      names.filter((name) => name?.startsWith("Ember_Caldera_Ridge_"))
    ).toHaveLength(14);
    expect(
      names.filter((name) => name?.startsWith("Ember_Basalt_Column_"))
    ).toHaveLength(68);
    expect(
      names.filter((name) => name?.startsWith("Ember_Gate_Talus_"))
    ).toHaveLength(34);
    expect(
      names.filter((name) => name?.startsWith("Ember_Obsidian_Shard_"))
    ).toHaveLength(5);
    expect(
      names.filter((name) => name?.startsWith("Ember_Gate_Backplate_"))
    ).toHaveLength(3);
    expect(names).not.toContain("Ember_Generated_Buttress_01");
  });

  it("records every new geological family as Gate 5 Ember geometry", () => {
    const gate5Nodes =
      gltf.nodes?.filter((node) => node.extras?.tka_gate === 5) ?? [];
    expect(new Set(gate5Nodes.map((node) => node.extras?.tka_role))).toEqual(
      new Set([
        "basalt-column",
        "caldera-ridge",
        "gate-backplate",
        "gate-talus",
        "glow-basin",
        "glow-basin-chasm",
        "obsidian-shard",
      ])
    );
    expect(
      gate5Nodes.every(
        (node) =>
          node.extras?.tka_scene === "ember" &&
          node.extras?.tka_revision === "ember-broken-rift-gate5-r4"
      )
    ).toBe(true);
  });

  it("keeps the invalidated integrated asset out of the runtime", () => {
    const sceneSource = readFileSync(
      resolve("src/lib/shared/3d/environments/scenes/EmberScene.svelte"),
      "utf8"
    );
    expect(sceneSource).not.toContain(
      'url="/models/ember/ember-integrated-room.glb"'
    );
    expect(sceneSource).toContain(
      'url="/models/ember/ember-production-slice.glb"'
    );
  });

  it("ties the build to the approved Gate 4 artifact and tracker decision", () => {
    const report = readFileSync(integratedReportPath, "utf8");
    expect(report).toContain("ember-broken-rift-gate5-r4");
    expect(report).toContain("MqaUVXWmMvvViGEOTCKX");
    expect(report).toContain("ember-production-slice-r2.blend");
    expect(report).toContain('"orbit-rear"');
    expect(report).toContain('"oldPropRingRestored": false');
    expect(report).toContain('"visuallyEnclosedPerimeter": true');
    expect(report).toContain('"generatedButtressRemoved": true');
  });

  it("keeps reversed headings scoped to Ember and the Blossom garden", () => {
    const workbenchSource = readFileSync(
      resolve("src/routes/test/viewer-3d/Viewer3DWorkbench.svelte"),
      "utf8"
    );
    expect(workbenchSource).toContain(
      "facingAngle: EMBER_VIEWER_FRONT_STAGE_FACING_ANGLE"
    );
    expect(getViewerFrontStageFacingAngle(SceneEnvironmentId.EMBER)).toBe(
      EMBER_VIEWER_FRONT_STAGE_FACING_ANGLE
    );
    expect(EMBER_VIEWER_FRONT_STAGE_FACING_ANGLE).toBe(Math.PI);
    expect(EMBER_VIEWER_FRONT_STAGE_CAMERA_Z_SIGN).toBe(-1);
    expect(getViewerFrontStageCameraZ(0.3, 2.8, SceneEnvironmentId.EMBER)).toBe(
      -2.5
    );
    for (const environment of SCENE_ENVIRONMENTS) {
      if (
        environment.id === SceneEnvironmentId.EMBER ||
        environment.id === SceneEnvironmentId.BLOSSOM
      )
        continue;
      expect(getViewerFrontStageFacingAngle(environment.id)).toBe(
        DEFAULT_VIEWER_FRONT_STAGE_FACING_ANGLE
      );
      expect(DEFAULT_VIEWER_FRONT_STAGE_CAMERA_Z_SIGN).toBe(1);
      expect(getViewerFrontStageCameraZ(0.3, 2.8, environment.id)).toBe(3.1);
    }

    const line = createFormationFromPreset("line", 4);
    for (const slot of line.slots) {
      expect(
        resolveViewerFormationFacingAngle(
          slot,
          line,
          Number.NaN,
          EMBER_VIEWER_FRONT_STAGE_FACING_ANGLE
        )
      ).toBe(EMBER_VIEWER_FRONT_STAGE_FACING_ANGLE);
      expect(
        resolveViewerFormationFacingAngle(
          slot,
          line,
          Number.NaN,
          DEFAULT_VIEWER_FRONT_STAGE_FACING_ANGLE
        )
      ).toBe(DEFAULT_VIEWER_FRONT_STAGE_FACING_ANGLE);
    }

    const backToBack = createFormationFromPreset("back-to-back", 2);
    expect(
      backToBack.slots.map((slot) =>
        resolveViewerFormationFacingAngle(slot, backToBack, Number.NaN)
      )
    ).toEqual([0, Math.PI]);

    const circle = createFormationFromPreset("circle", 4);
    expect(
      circle.slots.map((slot) =>
        resolveViewerFormationFacingAngle(slot, circle, Number.NaN)
      )
    ).toEqual(circle.slots.map((slot) => slot.facingAngle));
  });

  it("fills the shelf with deterministic geology without invading stage or lava", () => {
    const first = createEmberSurfaceEcology(5.2);
    const second = createEmberSurfaceEcology(5.2);
    expect(first).toEqual(second);
    expect(first.rubble).toHaveLength(150);
    expect(first.plates).toHaveLength(32);

    for (const placement of [...first.rubble, ...first.plates]) {
      const [x, , z] = placement.position;
      expect(Math.hypot(x, z)).toBeGreaterThanOrEqual(7.4);
      expect(distanceToEmberLavaCorridor(x, z)).toBeGreaterThanOrEqual(4.3);
      expect(distanceToEmberLavaCorridorEdge(x, z)).toBeGreaterThanOrEqual(1.4);
    }
  });

  it("measures lava clearance from the polygon edge, so the delta widens it", () => {
    const tail = volcanicWorldR7.lavaRiver.pointsRuntimeXZHeight.at(-1)!;
    const head = volcanicWorldR7.lavaRiver.pointsRuntimeXZHeight[0]!;
    // Upstream the corridor is the channel plus its bank margin.
    expect(emberLavaCorridorHalfWidth(0.5)).toBeCloseTo(
      (volcanicWorldR7.lavaRiver.width / 2) *
        1.025 *
        (1 + LAVA_RIVER_BANK_MARGIN_FRACTION),
      6
    );
    // At the toe it spreads with the delta.
    expect(emberLavaCorridorHalfWidth(1)).toBeGreaterThan(
      emberLavaCorridorHalfWidth(0.5) * 2
    );
    // Eight metres beside the tail is inside the delta: the boulder the F04
    // frame caught sitting in the lava.
    expect(distanceToEmberLavaCorridorEdge(tail[0] - 8, tail[1])).toBeLessThan(
      0
    );
    // Eight metres beside the head is well clear of the channel.
    expect(
      distanceToEmberLavaCorridorEdge(head[0] - 8, head[1])
    ).toBeGreaterThan(3);
  });

  it("gives every geology role a detail pass or a named reason it has none", () => {
    const HERO_EXCEPTION = new Set(["meshy-hero-geology"]);
    const HIDDEN = new Set(["cooled-fissure", "live-fissure"]);
    const seen = new Set<string>();

    for (const node of gltf.nodes ?? []) {
      if (node.mesh === undefined) continue;
      const role = node.extras?.tka_role;
      if (!role || seen.has(role)) continue;
      seen.add(role);
      for (const primitive of gltf.meshes?.[node.mesh]?.primitives ?? []) {
        const material = new MeshStandardMaterial({
          name: gltf.materials?.[primitive.material]?.name ?? "",
        });
        if (HIDDEN.has(role) || HERO_EXCEPTION.has(role)) {
          expect(isEmberGroundDetailSurface(role, material)).toBe(false);
          continue;
        }
        // Anything else that ships in the slice must be textured. The pale
        // upcountry masses were failing exactly here.
        expect(`${role} -> ${isEmberGroundDetailSurface(role, material)}`).toBe(
          `${role} -> true`
        );
      }
    }

    // Guard the inventory itself: a new role added to the slice has to make a
    // deliberate choice rather than silently inheriting a shared material.
    expect(seen.size).toBe(13);
  });

  it("seats outer scatter on the sampled terrain and closes the world rim", () => {
    // A synthetic bowl over the real terrain bounds: high rim, low centre, so
    // both the sampler and the apron have real relief to trace.
    const minX = -190;
    const maxX = 190;
    const minZ = -145;
    const maxZ = 190;
    const groundY = 1.5;
    const columns = 96;
    const rows = 96;
    const points = new Float32Array(columns * rows * 3);
    const bowl = (x: number, z: number) =>
      (Math.hypot(x, z) / 190) * 34 - 6 + Math.sin(x * 0.05) * 1.5;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = minX + ((maxX - minX) * column) / (columns - 1);
        const z = minZ + ((maxZ - minZ) * row) / (rows - 1);
        const index = (row * columns + column) * 3;
        points[index] = x;
        points[index + 1] = groundY + bowl(x, z);
        points[index + 2] = z;
      }
    }
    const field = createEmberTerrainHeightField(points, groundY);
    expect(field.heights.some((height) => height !== 0)).toBe(true);
    expect(sampleEmberTerrainHeight(field, 0, 0)).toBeLessThan(
      sampleEmberTerrainHeight(field, 170, 0)
    );

    const seated = createEmberSurfaceEcology(5.2, 9413, field);
    expect(seated.rubble).toHaveLength(150);
    expect(seated.plates).toHaveLength(32);
    expect(seated.outcrops).toHaveLength(240);
    // Same three instanced meshes as the near-field rubble: instances, not
    // draw calls.
    expect(new Set(seated.outcrops.map((rock) => rock.family))).toEqual(
      new Set(["cold", "iron", "glass"])
    );
    expect(createEmberSurfaceEcology(5.2, 9413, field)).toEqual(seated);
    // Without a field there is nothing to seat on, so the outer pass stays out
    // rather than floating boulders at stage height.
    expect(createEmberSurfaceEcology(5.2).outcrops).toHaveLength(0);

    let east = 0;
    let west = 0;
    let south = 0;
    for (const rock of seated.outcrops) {
      const [x, y, z] = rock.position;
      expect(Math.hypot(x, z)).toBeGreaterThanOrEqual(34);
      expect(distanceToEmberLavaCorridor(x, z)).toBeGreaterThanOrEqual(8);
      expect(distanceToEmberLavaCorridorEdge(x, z)).toBeGreaterThanOrEqual(5);
      // Seated, not floating: within a boulder's own height of the terrain.
      expect(Math.abs(y - sampleEmberTerrainHeight(field, x, z))).toBeLessThan(
        Math.max(...rock.scale)
      );
      if (x > 34) east += 1;
      if (x < -34) west += 1;
      if (z < -34) south += 1;
    }
    // The bald bearings the orbit cameras fill.
    expect(east).toBeGreaterThan(30);
    expect(west).toBeGreaterThan(30);
    expect(south).toBeGreaterThan(30);

    const apron = createEmberHorizonApron(field);
    expect(apron.indices).toHaveLength(224 * 6);
    expect(apron.positions).toHaveLength(225 * 2 * 3);
    let reachesPastRim = 0;
    let descends = 0;
    for (let step = 0; step <= 224; step += 1) {
      const inner = step * 6;
      const innerX = apron.positions[inner]!;
      const innerZ = apron.positions[inner + 2]!;
      const outerX = apron.positions[inner + 3]!;
      const outerZ = apron.positions[inner + 5]!;
      if (Math.hypot(outerX, outerZ) > Math.hypot(innerX, innerZ) + 80)
        reachesPastRim += 1;
      if (apron.positions[inner + 4]! < apron.positions[inner + 1]!)
        descends += 1;
      // The rim ring starts inside the bounds and under the terrain, so the
      // seam cannot open to the sky, but it still tracks the relief rather
      // than a flat plane.
      expect(innerX).toBeGreaterThanOrEqual(minX + EMBER_APRON_RIM_INSET * 0.7);
      expect(innerX).toBeLessThanOrEqual(maxX - EMBER_APRON_RIM_INSET * 0.7);
      expect(innerZ).toBeGreaterThanOrEqual(minZ + EMBER_APRON_RIM_INSET * 0.7);
      expect(innerZ).toBeLessThanOrEqual(maxZ - EMBER_APRON_RIM_INSET * 0.7);
      const surface = sampleEmberTerrainHeight(field, innerX, innerZ);
      expect(apron.positions[inner + 1]!).toBeLessThanOrEqual(
        surface - EMBER_APRON_RIM_TUCK + 1e-4
      );
      expect(apron.positions[inner + 1]!).toBeGreaterThan(
        surface - EMBER_APRON_RIM_TUCK - 4
      );
    }
    expect(reachesPastRim).toBe(225);
    expect(descends).toBe(225);
    // Closed loop: last pair repeats the first, so the skirt has no seam.
    expect(Array.from(apron.positions.slice(0, 6))).toEqual(
      Array.from(apron.positions.slice(224 * 6, 224 * 6 + 6))
    );
    // Up-facing, or the apron is invisible from every camera above it.
    for (let vertex = 1; vertex < apron.normals.length; vertex += 3) {
      expect(apron.normals[vertex]!).toBeGreaterThan(0);
    }
  });

  it("treats each shared slice material once instead of once per mesh", () => {
    const sceneSource = readFileSync(
      resolve("src/lib/shared/3d/environments/scenes/EmberScene.svelte"),
      "utf8"
    );
    // GLTFLoader shares one material instance per glTF material index, so the
    // treatment has to resolve per material with a declared precedence rather
    // than lerping once per mesh in traversal order.
    expect(sceneSource).toContain("TREATMENT_PRECEDENCE");
    expect(sceneSource).toContain("compoundedBlend");
    const traversal = sceneSource.slice(
      sceneSource.indexOf("asset.traverse((child)"),
      sceneSource.indexOf("for (const [material, counts] of routed)")
    );
    expect(traversal).not.toContain("material.color.lerp");
    expect(traversal).not.toContain("material.roughness =");
    expect(traversal).not.toContain("material.emissiveIntensity =");
  });

  it("uses one faceted volcanic plate mesh instead of instanced graybox slabs", () => {
    const geometry = createEmberSurfacePlateGeometry();
    const positions = geometry.getAttribute("position");
    expect(geometry.name).toBe("Ember_Jagged_Surface_Plate");
    expect(positions.count).toBe(132);
    expect(
      new Set(Array.from(positions.array).map((value) => value.toFixed(2))).size
    ).toBeGreaterThan(18);
    expect(geometry.boundingSphere?.radius).toBeGreaterThan(0.9);
    geometry.dispose();

    const sceneSource = readFileSync(
      resolve(
        "src/lib/shared/3d/environments/scenes/ember/EmberSurfaceEcology.svelte"
      ),
      "utf8"
    );
    expect(sceneSource).not.toContain("<T.BoxGeometry");
    expect(sceneSource).toContain("createEmberSurfacePlateGeometry");
  });

  it("keeps the visibility revision above the darkness regression floor", () => {
    const config = createDefaultEmberConfig();
    expect(config.fog.density).toBeLessThanOrEqual(0.01);
    expect(config.hemisphereLight.intensity).toBeGreaterThanOrEqual(1);
    expect(config.skyLight?.intensity).toBeGreaterThanOrEqual(1.5);
  });
});
