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
import { buildDrownedGalleryLayout } from "../../../src/lib/features/museum/data/drowned-gallery-terrain";
import { buildEarthRootTerraceLayout } from "../../../src/lib/features/museum/data/earth-root-terrace-terrain";
import { buildEarthRootTerraceBlenderContract } from "../../../src/lib/features/museum/data/earth-root-terrace-blender-contract";
import { buildFirstFireProcessionBay } from "../../../src/lib/features/museum/data/first-fire-procession-terrain";
import { buildFirstFireBlenderContract } from "../../../src/lib/features/museum/data/first-fire-blender-contract";

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
const fireCentre = buildFirstFireBlenderContract(fire.plan, fire.corridor).room.planCentre;
const shells = [
  { id: "DrownedGallery", x: (Math.min(...waterRooms.map(r => r.minX)) + Math.max(...waterRooms.map(r => r.maxX))) / 2, z: (Math.min(...waterRooms.map(r => r.minZ)) + Math.max(...waterRooms.map(r => r.maxZ))) / 2 },
  { id: "EarthRootTerrace", x: earthCentre.x, z: earthCentre.z },
  { id: "FirstFire", x: fireCentre.x, z: fireCentre.z },
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
  performers: grid.performers,
  furniture: grid.furniture,
  triggers: grid.triggers,
  shells,
};
await mkdir(resolve(project, "Content/Data"), { recursive: true });
await writeFile(output, JSON.stringify(payload));
console.log(`MUSEUM_EXPORT_OK ${grid.wings.length} rooms ${grid.exhibits.length} exhibits ${grid.performers.length} performers ${tiles.length} tiles -> ${output}`);
