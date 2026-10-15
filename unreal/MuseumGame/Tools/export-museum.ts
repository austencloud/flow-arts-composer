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

const project = resolve(process.cwd(), "unreal/MuseumGame");
const output = resolve(project, "Content/Data/museum.json");
const result = buildMuseumGrid(MUSEUM_WALK_ROOMS, MUSEUM_WALK_EDGES, GRID_CONFIG);
if (!result.validation.valid) {
  throw new Error(`Museum grid failed validation: ${JSON.stringify(result.validation)}`);
}
const grid = result.grid;
attachMuseumWalkTerrain(grid);
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
};
await mkdir(resolve(project, "Content/Data"), { recursive: true });
await writeFile(output, JSON.stringify(payload));
console.log(`MUSEUM_EXPORT_OK ${grid.wings.length} rooms ${grid.exhibits.length} exhibits ${grid.performers.length} performers ${tiles.length} tiles -> ${output}`);
