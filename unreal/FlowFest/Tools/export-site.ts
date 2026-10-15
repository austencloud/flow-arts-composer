/** Export the current Flow Fest site into an engine-neutral, metre-based contract. */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Euler, InstancedMesh, Matrix4, Mesh, Object3D, Quaternion, Vector3 } from "three";
import type { ImportedTerrainDataV2 } from "../../../src/lib/shared/3d/procedural-engine/generation/real-terrain-zone";
import type { FlowFestRuntimeContract } from "../../../src/routes/test/flow-fest-graybox/flow-fest-runtime-contract";
import { buildFlowFestProductionDressing } from "../../../src/routes/test/flow-fest-sim/flow-fest-production-geometry";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const outputDir = resolve(repoRoot, "unreal/FlowFest/Content/Data");
const sourcePrefix = "static/data/flow-fest-sim";
const modelManifestPath = "static/models/flow-fest-sim/ecology/species/manifest.json";
const branch = "lower-tent" as const;

type TerrainManifest = {
  worldFrame: {
    originProjectedMeters: { easting: number; northing: number };
    projectedCrs: { authority: "EPSG"; code: number; name: string };
    requestedAnchorWgs84: { latitude: number; longitude: number };
    resolvedOriginWgs84: { latitude: number; longitude: number };
    vertical: { datum: string; originElevationMeters: number };
  };
  terrain: {
    height: {
      width: number; height: number; sampleSpacingMeters: number;
      minimumElevationMeters: number; maximumElevationMeters: number;
      sha256: string;
    };
    sampleBoundsWorldMeters: { minX: number; maxX: number; minZ: number; maxZ: number };
    coverageBoundaryWorldMeters: Array<{ x: number; z: number }>;
  };
  surfaceEvidence: { width: number; height: number; sha256: string };
};

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const sourceFile = (root: string, name: string) => join(root, sourcePrefix, name);

function parseFloat32(bytes: Buffer, count: number): Float32Array {
  if (bytes.byteLength !== count * 4) throw new Error(`Terrain bytes: expected ${count * 4}, got ${bytes.byteLength}`);
  const data = new Float32Array(count);
  for (let i = 0; i < count; i++) data[i] = bytes.readFloatLE(i * 4);
  return data;
}

function parseUint16(bytes: Buffer, count: number): Uint16Array {
  if (bytes.byteLength !== count * 2) throw new Error(`Canopy bytes: expected ${count * 2}, got ${bytes.byteLength}`);
  const data = new Uint16Array(count);
  for (let i = 0; i < count; i++) data[i] = bytes.readUInt16LE(i * 2);
  return data;
}

function extractCampMeshes(root: Object3D) {
  const camps: Array<{ x: number; y: number; z: number; rotation: number; scale: number; type: string }> = [];
  const matrix = new Matrix4();
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  const readPlacement = (type: string) => {
    matrix.decompose(position, quaternion, scale);
    camps.push({
      x: position.x, y: position.y, z: position.z,
      rotation: new Euler().setFromQuaternion(quaternion, "YXZ").y,
      scale: scale.x, type,
    });
  };
  root.traverse((object) => {
    let type: string | undefined;
    if (object.name === "FFS_Tents_AuthoredFestivalDressing") type = "ridge";
    if (object.name === "FFS_TentsDome_AuthoredFestivalDressing") type = "dome";
    if (object.name === "FFS_Canopies_AuthoredFestivalDressing") type = "canopy";
    if (object.name.startsWith("FFS_PlayerTent_")) type = "player-tent";
    if (!type) return;
    if (object instanceof InstancedMesh) {
      for (let i = 0; i < object.count; i++) {
        object.getMatrixAt(i, matrix);
        readPlacement(type);
      }
    } else if (object instanceof Mesh) {
      matrix.compose(object.position, object.quaternion, object.scale);
      readPlacement(type);
    }
  });
  return camps;
}

export async function buildSiteData(sourceRoot = repoRoot) {
  const manifestBytes = await readFile(sourceFile(sourceRoot, "terrain.manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as TerrainManifest;
  const heightBytes = await readFile(sourceFile(sourceRoot, "terrain-height.f32"));
  const canopyBytes = await readFile(sourceFile(sourceRoot, "surface-offset.u16"));
  const contractBytes = await readFile(sourceFile(sourceRoot, "gate2-runtime-contract.json"));
  const speciesBytes = await readFile(join(sourceRoot, modelManifestPath));
  const contract = JSON.parse(contractBytes.toString("utf8")) as FlowFestRuntimeContract;
  const species = JSON.parse(speciesBytes.toString("utf8")) as {
    families: Array<{ familyId: string; file: string; sourceHeight: number }>;
  };
  const height = manifest.terrain.height;
  const bounds = manifest.terrain.sampleBoundsWorldMeters;
  if (sha256(heightBytes) !== height.sha256) throw new Error("Terrain hash does not match manifest");
  const terrain: ImportedTerrainDataV2 = {
    version: 2, name: "Flow Fest Earth site", sourceManifestPath: sourceFile(sourceRoot, "terrain.manifest.json"),
    worldBounds: bounds,
    heightmap: {
      width: height.width, height: height.height,
      minElevation: height.minimumElevationMeters, maxElevation: height.maximumElevationMeters,
      verticalOriginMeters: manifest.worldFrame.vertical.originElevationMeters,
      verticalScale: 1, heights: parseFloat32(heightBytes, height.width * height.height),
    },
    boundary: manifest.terrain.coverageBoundaryWorldMeters.map(({ x, z }) => ({ worldX: x, worldZ: z })),
    geoReference: {
      projectedCrs: manifest.worldFrame.projectedCrs,
      requestedAnchorWgs84: manifest.worldFrame.requestedAnchorWgs84,
      resolvedOriginWgs84: manifest.worldFrame.resolvedOriginWgs84,
      originProjectedMeters: manifest.worldFrame.originProjectedMeters,
      axes: { x: "east", y: "up", z: "south" },
      verticalDatum: manifest.worldFrame.vertical.datum,
    },
  };
  if (sha256(canopyBytes) !== manifest.surfaceEvidence.sha256) throw new Error("Canopy hash does not match manifest");
  const canopy = {
    width: manifest.surfaceEvidence.width,
    height: manifest.surfaceEvidence.height,
    offsetsCentimeters: parseUint16(canopyBytes, manifest.surfaceEvidence.width * manifest.surfaceEvidence.height),
  };
  const dressing = buildFlowFestProductionDressing(contract, terrain, canopy, branch);
  try {
    const plan = dressing.campPlan;
    const zone = (id: string) => {
      const found = contract.zones.find((item) => item.id === id);
      if (!found) throw new Error(`Missing zone ${id}`);
      return found.center;
    };
    const landmark = (id: string) => {
      const found = plan.landmarks.find((item) => item.id === id);
      if (!found) throw new Error(`Missing landmark ${id}`);
      return found.position;
    };
    const point = ({ x, z }: { x: number; z: number }) => ({ x, z });
    const fire = dressing.festivalCommunity.fireCenter;
    const landmarks = [
      { id: "gate", label: "Lower check-in gate", ...point(landmark("lower-check-in-gate")) },
      { id: "camp-lower", label: "Lower tent camp", ...point(zone("lower-tent-zone")) },
      { id: "camp-upper", label: "Upper tent camp", ...point(zone("upper-tent-zone")) },
      { id: "camp-car", label: "Car camp", ...point(zone("car-camp-zone")) },
      { id: "parking", label: "West upper parking", ...point(landmark("west-upper-parking")) },
      // Middle Earth is the activity tier; no surveyed workshop position exists.
      { id: "workshop", label: "Middle Earth activities", ...point(zone("middle-earth-zone")), provisional: true },
      { id: "fire", label: "Night fire", x: fire.x, z: fire.z },
      { id: "start", label: "Arrival spawn", x: contract.spawn.positionWorld[0], z: contract.spawn.positionWorld[2] },
    ];
    const roads = [...plan.publicRoads, ...plan.internalDrives, ...plan.footConnectors].map((line) => ({
      id: line.id, kind: line.kind, width: line.widthMeters,
      points: line.points.map(({ x, z }) => [x, z]),
      evidence: line.evidence, sourceNote: line.sourceNote,
    }));
    const trees = dressing.forestEcology.trees.map((tree) => ({
      x: tree.x, y: tree.y, z: tree.z, height: tree.renderedHeightMeters,
      rotation: tree.rotation, family: tree.familyId,
      measuredHeight: tree.measuredHeightMeters, scale: tree.scale,
    }));
    const backdropTrees = dressing.forestEcology.backdropTrees.map((tree) => ({
      x: tree.x, y: tree.y, z: tree.z, height: tree.renderedHeightMeters,
      rotation: tree.rotation, family: tree.familyId,
      measuredHeight: tree.measuredHeightMeters, scale: tree.scale,
    }));
    const usedFamilies = new Set([...trees, ...backdropTrees].map((tree) => tree.family));
    const assets = species.families.filter((family) => usedFamilies.has(family.familyId)).map((family) => ({
      family: family.familyId,
      source: `static/models/flow-fest-sim/ecology/species/${family.file}`,
      sourceHeight: family.sourceHeight,
      license: "MIT (@dgreenheck/ez-tree)",
    })).sort((a, b) => a.family < b.family ? -1 : a.family > b.family ? 1 : 0);
    if (assets.length !== usedFamilies.size) throw new Error("Tree family manifest is incomplete");
    const camps = extractCampMeshes(dressing.root);
    return {
      version: 1,
      coordinateSystem: { units: "meters", x: "east", y: "up above NAVD88 origin", z: "south", rotation: "radians about +Y" },
      terrain: {
        width: height.width, height: height.height, spacing: height.sampleSpacingMeters,
        originElevation: manifest.worldFrame.vertical.originElevationMeters,
        minX: bounds.minX, minZ: bounds.minZ, heightFile: "terrain-height.f32",
        imageryFile: "ortho.webp", canopyFile: "surface-offset.u16", manifestFile: "terrain.manifest.json",
      },
      roads, landmarks, trees, backdropTrees, camps,
      vehicles: dressing.parkedCars.map((car) => ({
        x: car.x, y: car.y, z: car.z, rotation: car.rotation,
        model: car.modelId, paintIndex: car.paintIndex,
      })),
      assets,
      counts: { ...dressing.counts, measuredCanopyTrees: dressing.forestEcology.audit.measuredCanopyPlacements,
        siteTrees: trees.length, backdropTrees: backdropTrees.length, camps: camps.length },
      provenance: {
        branch, masterSeed: "flow-fest-thursday-01",
        terrainManifest: `${sourcePrefix}/terrain.manifest.json`, terrainSha256: sha256(heightBytes),
        canopySource: `${sourcePrefix}/surface-offset.u16`, canopySha256: sha256(canopyBytes),
        orthoSource: `${sourcePrefix}/ortho.webp`,
        runtimeContract: `${sourcePrefix}/gate2-runtime-contract.json`, runtimeContractSha256: sha256(contractBytes),
        treeManifest: modelManifestPath, treeManifestSha256: sha256(speciesBytes),
        planSource: "src/routes/test/flow-fest-sim/flow-fest-camp-plan.ts",
        productionSource: "src/routes/test/flow-fest-sim/flow-fest-production-geometry.ts",
        workshopNote: "Middle Earth activity-tier center; no surveyed workshop point in the current plan.",
      },
    };
  } finally {
    dressing.dispose();
  }
}

export async function exportSite(sourceRoot = repoRoot) {
  const data = await buildSiteData(sourceRoot);
  await mkdir(outputDir, { recursive: true });
  for (const name of ["terrain-height.f32", "surface-offset.u16", "terrain.manifest.json", "ortho.webp"]) {
    await copyFile(sourceFile(sourceRoot, name), join(outputDir, name));
  }
  await writeFile(join(outputDir, "site.json"), `${JSON.stringify(data, null, 2)}\n`);
  return data;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flag = process.argv.indexOf("--source-root");
  const sourceRoot = flag >= 0 ? process.argv[flag + 1] : repoRoot;
  if (!sourceRoot) throw new Error("--source-root needs a path");
  const data = await exportSite(resolve(sourceRoot));
  console.log(`Exported ${data.trees.length} site trees, ${data.backdropTrees.length} backdrop trees, ${data.camps.length} camp objects to ${outputDir}`);
}
