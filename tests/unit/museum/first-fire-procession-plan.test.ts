import { describe, expect, it } from "vitest";
import { buildVulcanCaveFloorPlan } from "#lib/features/museum/data/vulcan-cave-floor-plan.js";
import { computeRoomDimensions } from "#lib/features/museum/domain/wall-segment-types.js";
import {
  FIRST_FIRE_PROCESSION_AUTHORING_MINIMUM,
  FIRST_FIRE_PROCESSION_MIN_INTERIOR_METRES,
  buildFirstFireProcessionPlan,
  buildFirstFireProcessionPlanForGrid,
  buildNominalFirstFireProcessionPlan,
  isProcessionSightlineBlocked,
  pointInProcessionPolygon,
  sampleProcessionPath,
  type FireProcessionPathSection,
  type FireProcessionShrine,
} from "#lib/features/museum/data/first-fire-procession-plan.js";

const plan = buildNominalFirstFireProcessionPlan();
const EPSILON = 1e-6;

function compiledInterior(width: number, height: number) {
  const emptyWall = { segments: [], minMargin: 1 } as const;
  const compiled = computeRoomDimensions({
    walls: { north: emptyWall, south: emptyWall, east: emptyWall, west: emptyWall },
    minInteriorWidth: width,
    minInteriorHeight: height,
  });
  return { width: (compiled.w - 2) * 0.5, depth: (compiled.h - 2) * 0.5 };
}

function sampleSection(section: FireProcessionPathSection, spacing = 0.2) {
  const samples: Array<{ x: number; z: number }> = [];
  for (let index = 0; index < section.points.length - 1; index++) {
    const from = section.points[index]!;
    const to = section.points[index + 1]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / spacing));
    for (let step = 0; step < steps; step++) {
      const t = step / steps;
      samples.push({ x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t });
    }
  }
  samples.push(section.points.at(-1)!);
  return samples;
}

function distance(a: { x: number; z: number }, b: { x: number; z: number }) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function orbitOuterRadius(shrine: FireProcessionShrine) {
  return shrine.orbitRadius + shrine.orbitWidth / 2;
}

describe("First Fire Torch Procession measured plan", () => {
  it("locks the isolated 58 by 44 metre shell, doors, centre and ember threshold", () => {
    expect(FIRST_FIRE_PROCESSION_MIN_INTERIOR_METRES).toEqual({ width: 58, depth: 44 });
    expect(plan.room).toEqual({ minX: 0, maxX: 58, minZ: 0, maxZ: 44 });
    expect(plan.centre).toEqual({ x: 29, z: 22 });
    expect(plan.westDoor).toEqual({ min: 20, max: 24 });
    expect(plan.eastDoor).toEqual({ min: 32, max: 36 });
    expect(plan.threshold).toEqual({ minX: 0, maxX: 7.5, minZ: 19.5, maxZ: 24.5 });
  });

  it("captures the integer authoring trap and accepts the first non-stretched size", () => {
    expect(FIRST_FIRE_PROCESSION_AUTHORING_MINIMUM).toEqual({ width: 77, height: 59 });
    expect(compiledInterior(77, 58)).toEqual({ width: 58, depth: 43.5 });
    expect(compiledInterior(77, 59)).toEqual({ width: 58, depth: 44.5 });
    expect(() => buildFirstFireProcessionPlan({
      room: { minX: 0, maxX: 58, minZ: 0, maxZ: 43.5 },
      westDoor: { min: 19.75, max: 23.75 },
      eastDoor: { min: 31.75, max: 35.75 },
    })).toThrow(/requires a 58 m by 44 m interior/);
    expect(() => buildFirstFireProcessionPlan({
      room: { minX: 0, maxX: 58, minZ: 0, maxZ: 44.5 },
      westDoor: { min: 20.25, max: 24.25 },
      eastDoor: { min: 32.25, max: 36.25 },
    })).not.toThrow();
  });

  it("lays the procession on the compiled cave-fire room with 4 m mouths on the stamped doors", () => {
    const live = buildFirstFireProcessionPlanForGrid(buildVulcanCaveFloorPlan().grid)!;
    expect(live.room.maxX - live.room.minX).toBe(58);
    expect(live.room.maxZ - live.room.minZ).toBe(44.5);
    expect(live.doorTileSpans).toBeDefined();
    for (const side of ["west", "east"] as const) {
      const mouth = live[`${side}Door`];
      const tiles = live.doorTileSpans![side];
      expect(mouth.max - mouth.min).toBe(4);
      expect(tiles.max - tiles.min).toBe(2);
      // The mouth is centred on the doorway unless the room edge is in the way
      // (the Earth door sits at the south end of the east wall).
      expect(tiles.min).toBeGreaterThanOrEqual(mouth.min);
      expect(tiles.max).toBeLessThanOrEqual(mouth.max);
      expect(mouth.min).toBeGreaterThanOrEqual(live.room.minZ);
      expect(mouth.max).toBeLessThanOrEqual(live.room.maxZ);
    }
    expect(live.walkPath[0]).toEqual({ x: live.room.minX, z: (live.westDoor.min + live.westDoor.max) / 2 });
  });

  it("preserves the DJ, EK and FL roster with three distinct fire grammars", () => {
    expect(plan.shrines.map(({ id, performerId, sequenceId, fireGrammar, centre }) => ({ id, performerId, sequenceId, fireGrammar, centre }))).toEqual([
      { id: "dj", performerId: "cave-fire-automaton-dj", sequenceId: "cave-fire-seq-dj", fireGrammar: "broad-sweeps", centre: { x: 13, z: 10 } },
      { id: "ek", performerId: "cave-fire-automaton-ek", sequenceId: "cave-fire-seq-ek", fireGrammar: "curling-crown", centre: { x: 29, z: 34 } },
      { id: "fl", performerId: "cave-fire-automaton-fl", sequenceId: "cave-fire-seq-fl", fireGrammar: "divided", centre: { x: 45, z: 11 } },
    ]);
    expect(new Set(plan.shrines.map((shrine) => shrine.fireGrammar)).size).toBe(3);
  });

  it("walks a horseshoe: entry and exit are different sides of every shrine", () => {
    for (const shrine of plan.shrines) {
      expect(Math.abs(shrine.orbitSweepDegrees)).toBe(240);
      expect(distance(shrine.entry, shrine.exit)).toBeGreaterThan(shrine.orbitRadius);
      expect(distance(shrine.entry, shrine.centre)).toBeCloseTo(shrine.orbitRadius, 9);
      expect(distance(shrine.exit, shrine.centre)).toBeCloseTo(shrine.orbitRadius, 9);
    }
    // Adjacent shrines walk in opposite directions so the second encounter
    // cannot read as a repeat of the first.
    expect(plan.shrines.map((shrine) => Math.sign(shrine.orbitSweepDegrees))).toEqual([1, -1, 1]);
  });

  it("hides each performer until the visitor turns into their mouth", () => {
    expect(plan.gates.map(({ id, shrineId, width }) => ({ id, shrineId, width }))).toEqual([
      { id: "dj-gate", shrineId: "dj", width: 4.5 },
      { id: "ek-gate", shrineId: "ek", width: 4.5 },
      { id: "fl-gate", shrineId: "fl", width: 4.5 },
    ]);
    for (const shrine of plan.shrines) {
      const gate = plan.gates.find((candidate) => candidate.id === shrine.gateId)!;
      expect(gate.courtThreshold).toEqual(shrine.entry);
      // The mouth is visible from the corridor, the performer is not: a blind
      // turn, exactly as the approved design requires.
      expect(isProcessionSightlineBlocked(gate.approach, gate.beacon, plan.basaltMasses), `${shrine.id} mouth hidden`).toBe(false);
      expect(isProcessionSightlineBlocked(gate.approach, shrine.centre, plan.basaltMasses), `${shrine.id} performer visible too early`).toBe(true);
      expect(isProcessionSightlineBlocked(gate.courtThreshold, shrine.centre, plan.basaltMasses), `${shrine.id} performer hidden at threshold`).toBe(false);
    }
  });

  it("runs one continuous S from the Water door to the Earth door", () => {
    expect(plan.pathSections.map(({ id, kind }) => ({ id, kind }))).toEqual([
      { id: "water-steam-threshold", kind: "steam-threshold" },
      { id: "ember-bridge", kind: "ember-bridge" },
      { id: "torch-lane-to-dj", kind: "shrine-approach" },
      { id: "dj-mouth-in", kind: "shrine-mouth" },
      { id: "dj-orbit", kind: "shrine-orbit" },
      { id: "dj-mouth-out", kind: "shrine-mouth" },
      { id: "dj-to-ek", kind: "transfer" },
      { id: "ek-mouth-in", kind: "shrine-mouth" },
      { id: "ek-orbit", kind: "shrine-orbit" },
      { id: "ek-mouth-out", kind: "shrine-mouth" },
      { id: "ek-to-fl", kind: "transfer" },
      { id: "fl-mouth-in", kind: "shrine-mouth" },
      { id: "fl-orbit", kind: "shrine-orbit" },
      { id: "fl-mouth-out", kind: "shrine-mouth" },
      { id: "earth-growth-path", kind: "growth-path" },
    ]);
    for (let index = 1; index < plan.pathSections.length; index++) {
      const previous = plan.pathSections[index - 1]!.points.at(-1)!;
      const next = plan.pathSections[index]!.points[0]!;
      expect(distance(previous, next), `${plan.pathSections[index]!.id} does not continue the route`).toBeLessThan(1e-9);
    }
    expect(plan.walkPath[0]).toEqual({ x: 0, z: 22 });
    expect(plan.walkPath.at(-1)).toEqual({ x: 58, z: 34 });
    // The route never doubles back through a shrine it already walked.
    expect(new Set(plan.pathSections.map((section) => section.shrineId).filter(Boolean)).size).toBe(3);
  });

  it("keeps the full route in bounds, at least 2.4 m wide, and outside permanent rock", () => {
    expect(plan.pathSections.every((section) => section.width >= 2.4)).toBe(true);
    for (const sample of sampleProcessionPath(plan, 0.2)) {
      expect(sample.x).toBeGreaterThanOrEqual(plan.room.minX - EPSILON);
      expect(sample.x).toBeLessThanOrEqual(plan.room.maxX + EPSILON);
      expect(sample.z).toBeGreaterThanOrEqual(plan.room.minZ - EPSILON);
      expect(sample.z).toBeLessThanOrEqual(plan.room.maxZ + EPSILON);
      for (const mass of plan.basaltMasses) {
        expect(pointInProcessionPolygon(sample, mass.polygon), `${sample.x.toFixed(2)},${sample.z.toFixed(2)} enters ${mass.id}`).toBe(false);
      }
    }
  });

  it("keeps paths out of fire trenches and unrelated shrine courts", () => {
    for (const section of plan.pathSections) {
      for (const sample of sampleSection(section)) {
        for (const shrine of plan.shrines) {
          expect(distance(sample, shrine.centre), `${section.id} enters ${shrine.id} trench`).toBeGreaterThanOrEqual(shrine.trenchOuterRadius + section.width / 2 - EPSILON);
          if (section.shrineId !== shrine.id) {
            expect(pointInProcessionPolygon(sample, shrine.courtPolygon), `${section.id} enters unrelated ${shrine.id} court`).toBe(false);
          }
        }
      }
    }
    for (const shrine of plan.shrines) {
      expect(orbitOuterRadius(shrine)).toBeGreaterThan(shrine.trenchOuterRadius);
    }
  });

  it("provides four overlapping no-prompt zones across the 240 degree walk", () => {
    for (const shrine of plan.shrines) {
      expect(shrine.activationZones).toHaveLength(4);
      for (let index = 1; index < shrine.activationZones.length; index++) {
        const previous = shrine.activationZones[index - 1]!;
        const current = shrine.activationZones[index]!;
        expect(Math.abs(previous.startDegrees + previous.sweepDegrees - current.startDegrees)).toBeCloseTo(20, 9);
      }
      const last = shrine.activationZones.at(-1)!;
      const walked = Math.abs(last.startDegrees + last.sweepDegrees - shrine.orbitStartDegrees);
      expect(walked).toBeCloseTo(240, 9);
    }
  });

  it("uses permanent basalt to block every performer pair", () => {
    for (let first = 0; first < plan.shrines.length; first++) {
      for (let second = first + 1; second < plan.shrines.length; second++) {
        expect(isProcessionSightlineBlocked(plan.shrines[first]!.centre, plan.shrines[second]!.centre, plan.basaltMasses), `${plan.shrines[first]!.id} sees ${plan.shrines[second]!.id}`).toBe(true);
      }
    }
  });

  it("never exposes two performers at 0.2 m samples in either travel direction", () => {
    for (const direction of ["forward", "reverse"] as const) {
      const offenders = sampleProcessionPath(plan, 0.2, direction).flatMap((sample) => {
        const visible = plan.shrines.filter((shrine) => !isProcessionSightlineBlocked(sample, shrine.centre, plan.basaltMasses));
        return visible.length > 1 ? [`${direction} ${sample.x.toFixed(2)},${sample.z.toFixed(2)} sees ${visible.map((shrine) => shrine.id).join("+")}`] : [];
      });
      expect(offenders.slice(0, 16)).toEqual([]);
    }
  });

  it("puts every torch on the route and keeps the green path out of the lit room", () => {
    expect(plan.guidePaths.every((guide) => guide.collision === false)).toBe(true);
    // The rejected interior carried 126 scattered stems. The revival is a lane.
    expect(plan.torchBudget).toEqual({ laneStems: 24, perimeterStemsPerShrine: 12, maximumDetailedShrines: 1 });
    expect(plan.torchBudget.laneStems + plan.torchBudget.perimeterStemsPerShrine * plan.shrines.length).toBe(60);
    const growth = plan.guidePaths.find((guide) => guide.kind === "green-growth")!;
    expect(growth.state).toBe("extinguished");
    // Austen 2026-08-09: the green path must not be visible while the visitor
    // still has performers to meet. Prove it geometrically, not by state alone.
    const growthTail = growth.points.at(-2)!;
    for (const shrine of plan.shrines) {
      expect(isProcessionSightlineBlocked(shrine.centre, growthTail, plan.basaltMasses), `${shrine.id} court sees the green path`).toBe(true);
    }
    for (const guide of plan.guidePaths) {
      if (guide.kind !== "fire-wall") continue;
      const shrine = plan.shrines.find((candidate) => candidate.id === guide.state)!;
      for (const point of guide.points) {
        expect(distance(point, shrine.centre)).toBeGreaterThan(orbitOuterRadius(shrine));
      }
    }
  });

  it("carries its clear widths in carved geometry, not just as declared numbers", () => {
    // Perpendicular ray-march from every route sample to the first rock hit.
    const MARCH_MAX = 3.5;
    const MARCH_STEP = 0.05;
    const march = (
      origin: { x: number; z: number },
      nx: number,
      nz: number
    ): { t: number; id: string } => {
      for (let t = MARCH_STEP; t <= MARCH_MAX; t += MARCH_STEP) {
        const point = { x: origin.x + nx * t, z: origin.z + nz * t };
        const hit = plan.basaltMasses.find((mass) =>
          pointInProcessionPolygon(point, mass.polygon)
        );
        if (hit) return { t, id: hit.id };
      }
      return { t: MARCH_MAX, id: "" };
    };
    const offenders: string[] = [];
    for (const section of plan.pathSections) {
      for (let index = 0; index < section.points.length - 1; index++) {
        const from = section.points[index]!;
        const to = section.points[index + 1]!;
        const length = Math.hypot(to.x - from.x, to.z - from.z) || 1;
        const nx = -(to.z - from.z) / length;
        const nz = (to.x - from.x) / length;
        const steps = Math.max(1, Math.ceil(length / 0.25));
        for (let step = 0; step <= steps; step++) {
          const t = step / steps;
          const sample = { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t };
          const left = march(sample, nx, nz);
          const right = march(sample, -nx, -nz);
          if (
            Math.min(left.t, right.t) < 0.9 ||
            left.t + right.t < Math.min(section.width, 2.4)
          ) {
            offenders.push(
              `${section.id} ${sample.x.toFixed(2)},${sample.z.toFixed(2)} sides ${left.t.toFixed(2)}(${left.id})/${right.t.toFixed(2)}(${right.id})`
            );
          }
        }
      }
    }
    expect(offenders.slice(0, 12)).toEqual([]);
  });

  it("keeps every reachable floor cell within 2.5 m of the carved network", () => {
    // Flood-fill walkable floor from the Water door; assert no reachable
    // pocket strays far from corridors, threshold, or courts — "nowhere else
    // to walk" as a proof instead of an enumeration.
    const CELL = 0.5;
    const cols = Math.round((plan.room.maxX - plan.room.minX) / CELL);
    const rows = Math.round((plan.room.maxZ - plan.room.minZ) / CELL);
    const cellPoint = (cx: number, cz: number) => ({
      x: plan.room.minX + (cx + 0.5) * CELL,
      z: plan.room.minZ + (cz + 0.5) * CELL,
    });
    const walkable: boolean[] = new Array(cols * rows);
    for (let cz = 0; cz < rows; cz++) {
      for (let cx = 0; cx < cols; cx++) {
        const point = cellPoint(cx, cz);
        walkable[cz * cols + cx] = !plan.basaltMasses.some((mass) =>
          pointInProcessionPolygon(point, mass.polygon)
        );
      }
    }
    const distToSegment = (
      point: { x: number; z: number },
      a: { x: number; z: number },
      b: { x: number; z: number }
    ) => {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const lengthSq = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSq));
      return Math.hypot(point.x - (a.x + dx * t), point.z - (a.z + dz * t));
    };
    const inThreshold = (point: { x: number; z: number }) =>
      point.x >= plan.threshold.minX && point.x <= plan.threshold.maxX &&
      point.z >= plan.threshold.minZ && point.z <= plan.threshold.maxZ;
    const carvedDistance = (point: { x: number; z: number }) => {
      if (inThreshold(point)) return 0;
      let best = Number.POSITIVE_INFINITY;
      for (const corridor of plan.carved.corridors) {
        for (let index = 0; index < corridor.points.length - 1; index++) {
          best = Math.min(
            best,
            distToSegment(point, corridor.points[index]!, corridor.points[index + 1]!) - corridor.width / 2
          );
        }
      }
      for (const shrine of plan.shrines) {
        if (pointInProcessionPolygon(point, shrine.courtPolygon)) return 0;
        for (let index = 0; index < shrine.courtPolygon.length; index++) {
          best = Math.min(
            best,
            distToSegment(
              point,
              shrine.courtPolygon[index]!,
              shrine.courtPolygon[(index + 1) % shrine.courtPolygon.length]!
            )
          );
        }
      }
      return Math.max(0, best);
    };
    const start = { cx: Math.floor(1 / CELL), cz: Math.floor(22 / CELL) };
    expect(walkable[start.cz * cols + start.cx]).toBe(true);
    const reached = new Set<number>([start.cz * cols + start.cx]);
    const queue = [start.cz * cols + start.cx];
    while (queue.length > 0) {
      const index = queue.pop()!;
      const cx = index % cols;
      const cz = Math.floor(index / cols);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nextX = cx + dx;
        const nextZ = cz + dz;
        if (nextX < 0 || nextX >= cols || nextZ < 0 || nextZ >= rows) continue;
        const next = nextZ * cols + nextX;
        if (reached.has(next) || !walkable[next]) continue;
        reached.add(next);
        queue.push(next);
      }
    }
    const offenders = [...reached]
      .map((index) => cellPoint(index % cols, Math.floor(index / cols)))
      .filter((point) => carvedDistance(point) > 2.5)
      .map((point) => `${point.x.toFixed(2)},${point.z.toFixed(2)}`);
    expect(offenders.slice(0, 12)).toEqual([]);
    // Every court must be reachable at all, and the Earth door too.
    for (const shrine of plan.shrines) {
      const cx = Math.floor((shrine.entry.x - plan.room.minX) / CELL);
      const cz = Math.floor((shrine.entry.z - plan.room.minZ) / CELL);
      expect(reached.has(cz * cols + cx), `${shrine.id} entry unreachable`).toBe(true);
    }
    const earthCx = Math.floor((plan.room.maxX - 1 - plan.room.minX) / CELL);
    const earthCz = Math.floor((34 - plan.room.minZ) / CELL);
    expect(reached.has(earthCz * cols + earthCx), "Earth door unreachable").toBe(true);
  });

  it("uses extra compiled depth as symmetric rock margin without stretching geometry", () => {
    const deeper = buildFirstFireProcessionPlan({
      room: { minX: 0, maxX: 58, minZ: 0, maxZ: 44.5 },
      westDoor: { min: 20.25, max: 24.25 },
      eastDoor: { min: 32.25, max: 36.25 },
    });
    expect(deeper.threshold.minZ - plan.threshold.minZ).toBeCloseTo(0.25, 12);
    expect(deeper.threshold.maxZ - plan.threshold.maxZ).toBeCloseTo(0.25, 12);
    for (let index = 0; index < plan.shrines.length; index++) {
      expect(deeper.shrines[index]!.centre.x).toBe(plan.shrines[index]!.centre.x);
      expect(deeper.shrines[index]!.centre.z - plan.shrines[index]!.centre.z).toBeCloseTo(0.25, 12);
      expect(deeper.shrines[index]!.orbitRadius).toBeCloseTo(plan.shrines[index]!.orbitRadius, 12);
    }
  });
});
