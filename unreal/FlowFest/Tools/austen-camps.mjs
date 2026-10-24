/**
 * Austen's camping record onto the site's camps.
 *
 * docs/superpowers/specs/flow-fest-sim/austen-camping-areas.json holds what he
 * marked on /test/flow-fest-camping: tents the game placed where nobody camps
 * (removedTents) and rough dots where tents really go (tentSpots). He said the
 * dots are approximate, so each one becomes a tent that is moved just enough to
 * stand on open ground, off roads, buildings and trunks, apart from its
 * neighbours, with its door toward the open side. Groups of four or more get a
 * shared shade canopy in front, the way groups camp. The upper tent camp
 * landmark (crowd homes, camp switching) moves to the middle of his tents.
 *
 * Run alone to rewrite Content/Data/site.json in place:
 *   node Tools/austen-camps.mjs [--record <file>] [--data <Content/Data dir>]
 * export-site.ts applies the same step to every fresh export.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_RECORD = resolve(here, "../../../docs/superpowers/specs/flow-fest-sim/austen-camping-areas.json");

// The grey building and the pink workshop cabin beside the upper field (world metres, x east,
// z south): each box covers both the roof read off the 2023 orthophoto and the footprint the game
// builds, porch and eaves included (GreyBuilding and PinkCabin in FlowFestStructures.h).
const BUILDINGS = [
  { id: "grey-building", minX: -45, maxX: -26.9, minZ: -148.6, maxZ: -132.4 },
  { id: "pink-workshop-cabin", minX: -23.5, maxX: -8.3, minZ: -148, maxZ: -132.6 },
];
const BUILDING_MARGIN = 1.5;
const ROAD_MARGIN = 1.5;
const TRUNK_CLEARANCE = 2.5;
const TENT_SPACING = 3.3;
const UNDER_CROWN = 3; // metres of canopy above the ground that count as under a tree

/** Small deterministic generator so every export lays the camp out the same way. */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Canopy height above the ground, metres, from the 1 m surface-offset grid. */
export function canopySampler(bytes, { width, height, minX, minZ, spacing = 1 }) {
  return (x, z) => {
    const column = Math.round((x - minX) / spacing);
    const row = Math.round((z - minZ) / spacing);
    if (column < 0 || row < 0 || column >= width || row >= height) return 0;
    const value = bytes.readUInt16LE((row * width + column) * 2);
    return value === 65535 ? 0 : value / 100;
  };
}

function segmentDistance(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const length = dx * dx + dz * dz;
  const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / length)) : 0;
  const cx = ax + t * dx;
  const cz = az + t * dz;
  return { distance: Math.hypot(px - cx, pz - cz), cx, cz };
}

/** One step away from whatever the point stands on, or null when it is clear. `reach` widens every margin for a bigger footprint. */
function pushAway(point, site, nearTrees, reach = 0) {
  for (const building of BUILDINGS) {
    const minX = building.minX - BUILDING_MARGIN - reach;
    const maxX = building.maxX + BUILDING_MARGIN + reach;
    const minZ = building.minZ - BUILDING_MARGIN - reach;
    const maxZ = building.maxZ + BUILDING_MARGIN + reach;
    if (point.x > minX && point.x < maxX && point.z > minZ && point.z < maxZ) {
      const exits = [
        { x: minX - point.x, z: 0 },
        { x: maxX - point.x, z: 0 },
        { x: 0, z: minZ - point.z },
        { x: 0, z: maxZ - point.z },
      ];
      const nearest = exits.reduce((best, exit) =>
        Math.hypot(exit.x, exit.z) < Math.hypot(best.x, best.z) ? exit : best
      );
      return { x: nearest.x + Math.sign(nearest.x) * 0.1, z: nearest.z + Math.sign(nearest.z) * 0.1 };
    }
  }
  for (const road of site.roads) {
    const clear = road.width / 2 + ROAD_MARGIN + reach;
    for (let index = 1; index < road.points.length; index++) {
      const [ax, az] = road.points[index - 1];
      const [bx, bz] = road.points[index];
      const { distance, cx, cz } = segmentDistance(point.x, point.z, ax, az, bx, bz);
      if (distance < clear) {
        const scale = (clear - distance + 0.1) / Math.max(distance, 0.01);
        return { x: (point.x - cx) * scale, z: (point.z - cz) * scale };
      }
    }
  }
  for (const tree of nearTrees) {
    const distance = Math.hypot(point.x - tree.x, point.z - tree.z);
    if (distance < TRUNK_CLEARANCE + reach) {
      const scale = (TRUNK_CLEARANCE + reach - distance + 0.1) / Math.max(distance, 0.01);
      return { x: (point.x - tree.x) * scale, z: (point.z - tree.z) * scale };
    }
  }
  return null;
}

/**
 * The way toward open ground, as an angle in x, z (direction cos, sin): the
 * canopy along each of 32 bearings out to 28 m, nearer trees weighing more, and
 * the bearings averaged so a wide field wins over a narrow gap.
 */
function openDirection(point, canopyAt) {
  let x = 0;
  let z = 0;
  for (let step = 0; step < 32; step++) {
    const angle = (step / 32) * Math.PI * 2;
    let cover = 0;
    for (const reach of [4, 8, 13, 19, 28]) {
      cover += Math.min(canopyAt(point.x + Math.cos(angle) * reach, point.z + Math.sin(angle) * reach), 15) * (30 / (reach + 10));
    }
    const openness = Math.exp(-cover / 20);
    x += Math.cos(angle) * openness;
    z += Math.sin(angle) * openness;
  }
  return Math.atan2(z, x);
}

/** Tents that pitch within 4.5 m of each other, chained: one group of friends. */
function clusters(points) {
  const groups = [];
  const seen = new Set();
  points.forEach((_, start) => {
    if (seen.has(start)) return;
    const group = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const index = queue.pop();
      group.push(points[index]);
      points.forEach((other, next) => {
        if (!seen.has(next) && Math.hypot(other.x - points[index].x, other.z - points[index].z) < 4.5) {
          seen.add(next);
          queue.push(next);
        }
      });
    }
    groups.push(group);
  });
  return groups;
}

/**
 * Returns the site with his removals and tents applied. `canopyAt(x, z)` gives
 * canopy height in metres. Rotation follows site.json: radians about +Y with the
 * tent facing +x at zero, so a door faces (cos r, -sin r) in x, z.
 */
export function applyAustenCamps(site, record, canopyAt) {
  const removed = record.removedTents ?? [];
  const spots = (record.tentSpots ?? []).filter(
    (spot, index, all) => all.findIndex((other) => Math.hypot(other.x - spot.x, other.z - spot.z) < 1.2) === index
  );
  const camps = site.camps.filter(
    (camp) => camp.type === "player-tent" || !removed.some((gone) => Math.hypot(gone.x - camp.x, gone.z - camp.z) < 0.3)
  );
  if (!spots.length) return { ...site, camps, counts: { ...site.counts, camps: camps.length } };

  const rng = random(0x0a57e9);
  const reach = 30;
  const nearTrees = site.trees.filter((tree) =>
    spots.some((spot) => Math.abs(tree.x - spot.x) < reach && Math.abs(tree.z - spot.z) < reach)
  );
  const placed = [];
  const blocked = (point) =>
    camps.some((camp) => Math.hypot(camp.x - point.x, camp.z - point.z) < TENT_SPACING) ||
    placed.some((tent) => Math.hypot(tent.x - point.x, tent.z - point.z) < TENT_SPACING);

  for (const spot of spots) {
    let point = { x: spot.x, z: spot.z };
    // Out from under a crown, toward the open side, a metre at a time.
    for (let step = 0; step < 6 && canopyAt(point.x, point.z) > UNDER_CROWN; step++) {
      const away = openDirection(point, canopyAt);
      point = { x: point.x + Math.cos(away), z: point.z + Math.sin(away) };
    }
    for (let step = 0; step < 12; step++) {
      const push = pushAway(point, site, nearTrees);
      if (!push) break;
      point = { x: point.x + push.x, z: point.z + push.z };
    }
    const facing = openDirection(point, canopyAt);
    // A crowded spot slides along the row, then starts a second row on the open side.
    if (blocked(point)) {
      const along = facing + Math.PI / 2;
      const options = [
        [1.7, 0], [-1.7, 0], [3.4, 0], [-3.4, 0],
        [0, 3.4], [1.7, 3.4], [-1.7, 3.4], [3.4, 3.4], [-3.4, 3.4],
      ].map(([shift, out]) => ({
        x: point.x + Math.cos(along) * shift + Math.cos(facing) * out,
        z: point.z + Math.sin(along) * shift + Math.sin(facing) * out,
      }));
      const free = options.find((option) => !blocked(option) && !pushAway(option, site, nearTrees));
      if (!free) continue;
      point = free;
    }
    const dome = rng() < 0.55;
    placed.push({
      x: point.x,
      y: 0,
      z: point.z,
      // Doors toward the open side, give or take how people actually pitch.
      rotation: -(facing + (rng() - 0.5) * 0.9),
      scale: dome ? 0.8 + rng() * 0.35 : 0.9 + rng() * 0.3,
      type: dome ? "dome" : "ridge",
    });
  }

  const canopies = [];
  for (const group of clusters(placed)) {
    if (group.length < 4) continue;
    const centre = {
      x: group.reduce((sum, tent) => sum + tent.x, 0) / group.length,
      z: group.reduce((sum, tent) => sum + tent.z, 0) / group.length,
    };
    const out = openDirection(centre, canopyAt);
    for (const distance of [4.5, 6, 7.5, 9, 11]) {
      const at = { x: centre.x + Math.cos(out) * distance, z: centre.z + Math.sin(out) * distance };
      const crowded = [...placed, ...canopies].some((other) => Math.hypot(other.x - at.x, other.z - at.z) < 3.8);
      // A 3 by 3 m canopy needs its whole footprint clear, not only its middle.
      if (!crowded && !pushAway(at, site, nearTrees, 1.5) && canopyAt(at.x, at.z) < UNDER_CROWN) {
        canopies.push({ x: at.x, y: 0, z: at.z, rotation: -out + (rng() - 0.5) * 0.4, scale: 0.95 + rng() * 0.1, type: "canopy" });
        break;
      }
    }
  }

  const all = [...placed, ...canopies];
  // The camp's middle: the mean of its tents, a few metres out toward the open
  // ground they face, so crowd members walk home to the field and not the trees.
  const mean = {
    x: all.reduce((sum, tent) => sum + tent.x, 0) / all.length,
    z: all.reduce((sum, tent) => sum + tent.z, 0) / all.length,
  };
  const inward = openDirection(mean, canopyAt);
  const centre = {
    x: Math.round((mean.x + Math.cos(inward) * 6) * 10) / 10,
    z: Math.round((mean.z + Math.sin(inward) * 6) * 10) / 10,
  };
  const landmarks = site.landmarks.map((landmark) =>
    landmark.id === "camp-upper" ? { ...landmark, x: centre.x, z: centre.z, source: "austen-camping-areas.json" } : landmark
  );
  const nextCamps = [...camps, ...all];
  return {
    ...site,
    camps: nextCamps,
    landmarks,
    counts: { ...site.counts, camps: nextCamps.length },
    provenance: { ...site.provenance, campingRecord: "docs/superpowers/specs/flow-fest-sim/austen-camping-areas.json" },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const option = (name, fallback) => {
    const index = process.argv.indexOf(name);
    return index >= 0 ? resolve(process.argv[index + 1]) : fallback;
  };
  const dataDir = option("--data", resolve(here, "../Content/Data"));
  const record = JSON.parse(readFileSync(option("--record", DEFAULT_RECORD), "utf8"));
  const sitePath = join(dataDir, "site.json");
  const site = JSON.parse(readFileSync(sitePath, "utf8"));
  if (site.provenance?.campingRecord) {
    throw new Error("site.json already has the camping record applied; export the site again first.");
  }
  const manifest = JSON.parse(readFileSync(join(dataDir, "terrain.manifest.json"), "utf8"));
  const evidence = manifest.surfaceEvidence;
  const canopyAt = canopySampler(readFileSync(join(dataDir, site.terrain.canopyFile)), {
    width: evidence.width,
    height: evidence.height,
    minX: evidence.sampleBoundsWorldMeters.minX,
    minZ: evidence.sampleBoundsWorldMeters.minZ,
    spacing: evidence.sampleSpacingMeters,
  });
  const before = site.camps.length;
  const next = applyAustenCamps(site, record, canopyAt);
  writeFileSync(sitePath, `${JSON.stringify(next, null, 2)}\n`);
  const added = next.camps.filter((camp) => !site.camps.includes(camp));
  const upper = next.landmarks.find((landmark) => landmark.id === "camp-upper");
  console.log(
    `Camps ${before} -> ${next.camps.length}: removed ${before - (next.camps.length - added.length)}, added ` +
      `${added.filter((camp) => camp.type !== "canopy").length} tents and ${added.filter((camp) => camp.type === "canopy").length} canopies; ` +
      `upper camp landmark at (${upper?.x}, ${upper?.z}).`
  );
}
