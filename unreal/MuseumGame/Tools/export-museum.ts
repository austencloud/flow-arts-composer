/** Export the live one-walk layout and authored text for the native project. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildMuseumGrid } from "../../../src/lib/features/museum/services/museum-grid-builder";
import { GRID_CONFIG } from "../../../src/lib/features/museum/data/museum-room-graph";
import {
  MUSEUM_WALK_EDGES,
  MUSEUM_WALK_ROOMS,
  attachMuseumWalkTerrain,
} from "../../../src/lib/features/museum/data/museum-walk";
import { getTileMetadata } from "../../../src/lib/features/museum/domain/tile-registry";
import { buildDrownedGalleryLayout, WATERLINE_Y, GALLERY_ROOF_Y, GALLERY_FLOOR_Y, CAUSEWAY_Y, SHELF_Y } from "../../../src/lib/features/museum/data/drowned-gallery-terrain";
import { buildEarthRootTerraceLayout, BED_Y, OVERLOOK_Y, LANDING_Y, DOOR_Y } from "../../../src/lib/features/museum/data/earth-root-terrace-terrain";
import { buildEarthRootTerraceBlenderContract } from "../../../src/lib/features/museum/data/earth-root-terrace-blender-contract";
import { buildFirstFireProcessionBay } from "../../../src/lib/features/museum/data/first-fire-procession-terrain";
import { buildFirstFireBlenderContract } from "../../../src/lib/features/museum/data/first-fire-blender-contract";
import { buildMuseumNativePerformances } from "./museum-native-performances";

const project = resolve(process.cwd(), "unreal/MuseumGame");
const output = resolve(project, "Content/Data/museum.json");
const result = buildMuseumGrid(MUSEUM_WALK_ROOMS, MUSEUM_WALK_EDGES, GRID_CONFIG);
if (!result.validation.valid) {
  throw new Error(`Museum grid failed validation: ${JSON.stringify(result.validation)}`);
}
const grid = result.grid;
attachMuseumWalkTerrain(grid);
const water = buildDrownedGalleryLayout(grid);
const earth = buildEarthRootTerraceLayout(grid);
const fire = buildFirstFireProcessionBay(grid);
if (!water || !earth || !fire) throw new Error("Authored cave layout is incomplete");
const waterRooms = [water.approach, water.gallery, water.grotto];
const earthCentre = buildEarthRootTerraceBlenderContract(earth).room.planCentre;
const fireContract = buildFirstFireBlenderContract(fire.plan, fire.corridor);
const fireCentre = fireContract.room.planCentre;
const shells = [
  { id: "DrownedGallery", x: (Math.min(...waterRooms.map(r => r.minX)) + Math.max(...waterRooms.map(r => r.maxX))) / 2, z: (Math.min(...waterRooms.map(r => r.minZ)) + Math.max(...waterRooms.map(r => r.maxZ))) / 2 },
  { id: "EarthRootTerrace", x: earthCentre.x, z: earthCentre.z },
  { id: "FirstFire", x: fireCentre.x, z: fireCentre.z },
];
const centreX = (r: { minX: number; maxX: number }) => (r.minX + r.maxX) / 2;
const centreZ = (r: { minZ: number; maxZ: number }) => (r.minZ + r.maxZ) / 2;
const authoredLights = [
  { x: centreX(water.approach), y: WATERLINE_Y + 1.2, z: water.approach.minZ + 1, color: "#4a8aa8", intensity: 6, distance: 14 },
  { x: centreX(water.descentStair), y: WATERLINE_Y + 0.6, z: water.descentStair.minZ + 1, color: "#4a8aa8", intensity: 5, distance: 12 },
  { x: centreX(water.northRun), y: GALLERY_ROOF_Y - 0.5, z: water.westRun.minZ, color: "#5fbfd8", intensity: 6, distance: 16 },
  { x: centreX(water.northRun), y: GALLERY_ROOF_Y - 0.5, z: water.eastBend.maxZ, color: "#5fbfd8", intensity: 6, distance: 16 },
  { x: water.bloomAnchor.x, y: GALLERY_FLOOR_Y + 1.2, z: water.bloomAnchor.z, color: "#7fe8c8", intensity: 8, distance: 18 },
  { x: centreX(water.surfacingUpper), y: CAUSEWAY_Y + 1.6, z: water.surfacingUpper.minZ + 1, color: "#ffb35c", intensity: 10, distance: 22 },
  { x: centreX(water.apron), y: CAUSEWAY_Y + 4.5, z: centreZ(water.apron), color: "#6f93a6", intensity: 8, distance: 34 },
  { x: centreX(water.waterfall), y: CAUSEWAY_Y + 2.2, z: centreZ(water.waterfall), color: "#bfe9ff", intensity: 6, distance: 16 },
  ...water.alcoves.map((anchor) => ({ x: anchor.x, y: SHELF_Y + 2, z: water.shore.minZ + 1.6, color: "#ffb35c", intensity: 12, distance: 20 })),
  { x: earth.avenCentre.x, y: BED_Y + 7.5, z: earth.avenCentre.z, color: "#bcd8ff", intensity: 34, distance: 26 },
  { x: centreX(earth.overlook), y: OVERLOOK_Y + 2, z: earth.bed.minZ, color: "#ffb45a", intensity: 9, distance: 13 },
  { x: earth.landing.maxX - 0.35, y: LANDING_Y + 2, z: centreZ(earth.landing), color: "#ffb45a", intensity: 9, distance: 13 },
  { x: earth.vestibule.minX + 1.4, y: DOOR_Y + 2.1, z: (earth.westDoor.min + earth.westDoor.max) / 2, color: "#72d957", intensity: 14, distance: 12 },
];
const tiles = [...grid.tiles].map(([key, tile]) => {
  const [x, y] = key.split(",").map(Number);
  if (!Number.isInteger(x) || !Number.isInteger(y)) throw new Error(`Bad tile key ${key}`);
  const worldX = x * grid.tileScale;
  const worldZ = y * grid.tileScale;
  const elevation = grid.terrain?.elevationAt(worldX, worldZ) ?? 0;
  const blocked = grid.terrain?.blockedAt(worldX, worldZ) ?? false;
  return {
    x, y, type: tile.type, material: tile.material ?? "stone",
    refId: tile.refId ?? "", facing: tile.facing ?? "",
    walkable: getTileMetadata(tile.type).walkable && !blocked,
    elevation: Number.isFinite(elevation) ? Math.round(elevation * 1000) / 1000 : 0,
  };
});
const native = buildMuseumNativePerformances(grid.performers);
const payload = {
  version: 1,
  source: "src/lib/features/museum/data/museum-walk.ts",
  tileMeters: grid.tileScale,
  width: grid.width,
  height: grid.height,
  spawn: grid.spawn,
  rooms: grid.wings,
  edges: MUSEUM_WALK_EDGES,
  tiles,
  exhibits: grid.exhibits,
  performers: native.performers,
  furniture: grid.furniture,
  triggers: grid.triggers,
  shells,
  authoredCorridors: [...water.approachCorridor, ...water.galleryCorridor, ...fire.corridor, ...earth.corridor],
  authoredLights,
  fireProgression: {
    blackoutMs: 2200,
    courtLightReach: 14,
    earthDoor: fireContract.doors.earth.plan,
    waterDoor: fireContract.doors.water.plan,
    shrines: fireContract.shrines.map((shrine) => ({
      id: shrine.id,
      performerId: shrine.performerId,
      centre: shrine.planCentre,
      entry: shrine.planEntry,
      exit: shrine.planExit,
      orbitRadius: shrine.orbitRadius,
      orbitWidth: shrine.orbitWidth,
      orbitSweepDegrees: shrine.orbitSweepDegrees,
      courtOutline: fireContract.courts.find((court) => court.shrineId === shrine.id)?.planOutline ?? [],
      throatWidth: fireContract.courts.find((court) => court.shrineId === shrine.id)?.throatWidth ?? 0,
    })),
  },
};
await mkdir(resolve(project, "Content/Data"), { recursive: true });
await writeFile(output, JSON.stringify(payload));
await writeFile(resolve(project, "Content/Data/museum-performances.json"), JSON.stringify(native.manifest));
console.log(`MUSEUM_EXPORT_OK ${grid.wings.length} rooms ${grid.exhibits.length} exhibits ${grid.performers.length} performers ${tiles.length} tiles -> ${output}`);
