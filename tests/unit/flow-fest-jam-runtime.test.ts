import { describe, expect, it } from "vitest";
import {
  buildFlowFestJamLayout,
  distanceToPolyline,
  insidePolygon,
} from "#lib/features/flow-fest-sim/domain/flow-fest-jam-layout";
import {
  JAM_HANDOVER_SUN_ELEVATION_DEGREES,
  JAM_NIGHT_HOLD_HOUR,
  JAM_WANDER,
  JAM_LIGHT_UP_SECONDS,
  JAM_NIGHT_BUILD_SECONDS,
  createJamAttention,
  createJamEntrant,
  createJamWanderer,
  jamFireIds,
  jamHourAfterHandover,
  jamHourForSunElevation,
  jamOutsideOpenYaw,
  jamOutsideSpinnersOut,
  jamOutsideSpot,
  jamPerformersInside,
  jamSpinnerFacing,
  jamSunElevationForHour,
  jamWatcherFacing,
  sampleJamShot,
  stepJamAttention,
  stepJamWanderers,
} from "#lib/features/flow-fest-sim/domain/flow-fest-jam-runtime";

// The jam's motion is felt, not read, so a wanderer slipping through the rope
// or a duet that never triggers would pass every screenshot. These hold the
// promises the eye cannot check from one frame.
describe("flow fest jam runtime", () => {
  const layout = buildFlowFestJamLayout();
  const ring = [...layout.boundary, layout.boundary[0]];

  it("keeps every wanderer inside the rope, off it, and under walking pace for ten minutes", () => {
    const wanderers = layout.performers.map((p) => createJamWanderer(p));
    const dt = 1 / 30;
    let maxSpeed = 0;
    let worstRope = Infinity;
    for (let frame = 0; frame < 600 * 30; frame++) {
      stepJamWanderers(wanderers, dt, { boundary: layout.boundary, centre: layout.centre });
      for (const w of wanderers) {
        expect(insidePolygon(w, layout.boundary)).toBe(true);
        worstRope = Math.min(worstRope, distanceToPolyline(w, ring));
        maxSpeed = Math.max(maxSpeed, Math.hypot(w.vx, w.vz));
      }
    }
    expect(worstRope).toBeGreaterThan(JAM_WANDER.ropeMarginMeters * 0.9);
    expect(maxSpeed).toBeLessThanOrEqual(JAM_WANDER.maxSpeed + 1e-9);
  }, 30_000);

  it("pauses each wanderer for 10 to 40 seconds between walks", () => {
    const w = createJamWanderer(layout.performers[0]);
    const pauses: number[] = [];
    let run = 0;
    let wasPaused = w.paused;
    for (let frame = 0; frame < 1200 * 10; frame++) {
      stepJamWanderers([w], 0.1, { boundary: layout.boundary, centre: layout.centre });
      if (w.paused === wasPaused) {
        run += 0.1;
      } else {
        if (wasPaused && pauses.length + 1 > 0 && run > 0) pauses.push(run);
        run = 0.1;
        wasPaused = w.paused;
      }
    }
    // The first pause starts part-way through, so judge the full ones only.
    const full = pauses.slice(1);
    expect(full.length).toBeGreaterThan(5);
    for (const p of full) {
      expect(p).toBeGreaterThanOrEqual(JAM_WANDER.minPause - 0.11);
      expect(p).toBeLessThanOrEqual(JAM_WANDER.maxPause + 0.11);
    }
  });

  it("turns watchers to a flowing player only after the notice time, and the duet only after its own", () => {
    const numbers = layout.interaction;
    let state = createJamAttention();
    const flowing = { speed: 0, ropeDistance: 5, insideRope: true, flowing: true, sitting: false };
    for (let t = 0; t < numbers.noticeSeconds - 0.5; t += 0.1) state = stepJamAttention(state, 0.1, flowing, numbers);
    expect(state.notice).toBeLessThan(0.01);
    for (let t = 0; t < 4; t += 0.1) state = stepJamAttention(state, 0.1, flowing, numbers);
    expect(state.notice).toBeGreaterThan(0.5);
    expect(state.duet).toBe(false);
    while (state.flowSeconds < numbers.duetSeconds + 0.2) state = stepJamAttention(state, 0.1, flowing, numbers);
    expect(state.duet).toBe(true);

    // Stopping ends the duet at once, and attention drifts back rather than cutting.
    state = stepJamAttention(state, 0.1, { ...flowing, flowing: false }, numbers);
    expect(state.duet).toBe(false);
    expect(state.notice).toBeGreaterThan(0.8);
    for (let t = 0; t < 15; t += 0.1) state = stepJamAttention(state, 0.1, { ...flowing, flowing: false }, numbers);
    expect(state.notice).toBeLessThan(0.05);
  });

  it("does not count flowing outside the rope", () => {
    let state = createJamAttention();
    for (let t = 0; t < 30; t += 0.1)
      state = stepJamAttention(state, 0.1, { speed: 0, ropeDistance: 3, insideRope: false, flowing: true, sitting: false }, layout.interaction);
    expect(state.notice).toBe(0);
    expect(state.duet).toBe(false);
  });

  it("settles the linger framing only after slow time near the rope, and releases it on walking away", () => {
    const numbers = layout.interaction;
    let state = createJamAttention();
    const slowNear = { speed: 0.3, ropeDistance: 4, insideRope: false, flowing: false, sitting: false };
    for (let t = 0; t < numbers.lingerSettleSeconds - 0.3; t += 0.1) state = stepJamAttention(state, 0.1, slowNear, numbers);
    expect(state.linger).toBeLessThan(0.01);
    for (let t = 0; t < 5; t += 0.1) state = stepJamAttention(state, 0.1, slowNear, numbers);
    expect(state.linger).toBeGreaterThan(0.9);
    for (let t = 0; t < 3; t += 0.1) state = stepJamAttention(state, 0.1, { ...slowNear, speed: 1.4 }, numbers);
    expect(state.linger).toBeLessThan(0.05);
  });

  it("only turns watchers inside the notice radius", () => {
    const person = { x: 0, z: 0 };
    expect(jamWatcherFacing(person, 0, { x: 30, z: 0 }, 1, 14)).toBe(0);
    expect(jamWatcherFacing(person, 0, { x: 5, z: 0 }, 1, 14)).toBeCloseTo(Math.PI / 2);
  });

  it("plays the opening from its first key to its last, sun included", () => {
    const keys = layout.openingShot;
    const start = sampleJamShot(keys, 0);
    const end = sampleJamShot(keys, keys[keys.length - 1].seconds);
    expect(start.x).toBeCloseTo(keys[0].x);
    expect(start.heightAboveGround).toBeCloseTo(keys[0].heightAboveGround);
    expect(end.z).toBeCloseTo(keys[keys.length - 1].z);
    expect(end.sunElevationDegrees).toBeCloseTo(keys[keys.length - 1].sunElevationDegrees);
    expect(sampleJamShot(keys, keys[1].seconds).sunElevationDegrees).toBeCloseTo(keys[1].sunElevationDegrees);
    // The descent never climbs back up between keys.
    let previous = Infinity;
    for (let t = 0; t <= keys[keys.length - 1].seconds; t += 0.25) {
      const h = sampleJamShot(keys, t).heightAboveGround;
      expect(h).toBeLessThanOrEqual(previous + 1e-6);
      previous = h;
    }
  });

  it("builds the night from the hand-over to the 22:30 hold and holds it", () => {
    const handover = jamHourForSunElevation(JAM_HANDOVER_SUN_ELEVATION_DEGREES);
    expect(jamHourAfterHandover(0)).toBeCloseTo(handover);
    expect(jamHourAfterHandover(240)).toBeCloseTo(JAM_NIGHT_HOLD_HOUR);
    expect(jamHourAfterHandover(900)).toBeCloseTo(JAM_NIGHT_HOLD_HOUR);
    expect(jamSunElevationForHour(handover)).toBeCloseTo(JAM_HANDOVER_SUN_ELEVATION_DEGREES, 5);
    expect(jamSunElevationForHour(26)).toBeGreaterThan(-18);
  });

  it("fills the circle by the night curve and never lights more fire than the cap", () => {
    expect(jamPerformersInside(layout, 0)).toHaveLength(0);
    const all = jamPerformersInside(layout, 1);
    expect(all).toHaveLength(layout.performers.length);
    expect(jamFireIds(all, 0, 18).size).toBe(0);
    expect(jamFireIds(all, 1, 3).size).toBe(3);
    const lit = jamFireIds(all, 1, layout.light.maxFireAtOnce);
    for (const id of lit) expect(layout.performers.find((p) => p.id === id)?.finish).toBe("fire");
  });

  it("stands an entering performer at the lighting flame before they walk on", () => {
    const w = createJamEntrant(layout.performers[0], layout.entrance.flame);
    for (let t = 0; t < JAM_LIGHT_UP_SECONDS - 0.2; t += 0.1) stepJamWanderers([w], 0.1, { boundary: layout.boundary, centre: layout.centre });
    expect(Math.hypot(w.x - layout.entrance.flame.x, w.z - layout.entrance.flame.z)).toBeLessThan(0.3);
    for (let t = 0; t < 30; t += 0.1) stepJamWanderers([w], 0.1, { boundary: layout.boundary, centre: layout.centre });
    expect(Math.hypot(w.x - layout.entrance.flame.x, w.z - layout.entrance.flame.z)).toBeGreaterThan(2);
  });

  it("keeps outside spinners within their wander radius and brings them out with the circle", () => {
    for (const spinner of layout.outsideSpinners) {
      for (let t = 0; t < 1200; t += 7) {
        const spot = jamOutsideSpot(spinner, t);
        expect(Math.hypot(spot.x - spinner.x, spot.z - spinner.z)).toBeLessThanOrEqual(spinner.wanderRadius + 1e-9);
      }
    }
    expect(jamOutsideSpinnersOut(layout, 0)).toHaveLength(0);
    expect(jamOutsideSpinnersOut(layout, 1)).toHaveLength(layout.outsideSpinners.length);
  });

  it("walks each entrant from the flame to their own spot, and the night ends spread over the floor", () => {
    const context = { boundary: layout.boundary, centre: layout.centre };
    const wanderers = new Map<string, ReturnType<typeof createJamWanderer>>();
    const arrivedAfter = new Map<string, number>();
    const enteredAt = new Map<string, number>();
    const dt = 1 / 30;
    const total = JAM_NIGHT_BUILD_SECONDS + 180;
    let nearEntranceLate = 0;
    for (let frame = 0; frame * dt < total; frame++) {
      const t = frame * dt;
      const inside = Math.min(1, t / JAM_NIGHT_BUILD_SECONDS);
      for (const p of jamPerformersInside(layout, inside)) {
        if (wanderers.has(p.id)) continue;
        wanderers.set(p.id, createJamEntrant(p, layout.entrance.flame));
        enteredAt.set(p.id, t);
      }
      stepJamWanderers([...wanderers.values()], dt, context);
      for (const w of wanderers.values()) {
        if (!arrivedAfter.has(w.id) && !w.approaching) arrivedAfter.set(w.id, t - enteredAt.get(w.id)!);
      }
      if (t > 120 && frame % 30 === 0) {
        const near = [...wanderers.values()].filter((w) => Math.hypot(w.x - layout.entrance.x, w.z - layout.entrance.z) < 6).length;
        nearEntranceLate = Math.max(nearEntranceLate, near);
      }
    }
    expect(wanderers.size).toBe(layout.performers.length);
    // Every entrant lit up and walked in at about 1.3 m/s, without stalling on the way.
    for (const p of layout.performers) {
      const walk = Math.hypot(p.start.x - layout.entrance.flame.x, p.start.z - layout.entrance.flame.z);
      expect(arrivedAfter.get(p.id)).toBeLessThan(JAM_LIGHT_UP_SECONDS + walk / 1.0 + 3);
    }
    // After the first couple of minutes, nobody is crowding the way in.
    expect(nearEntranceLate).toBeLessThanOrEqual(3);
    // Spread: everyone near their own spot, and the floor's four quarters all used.
    const end = [...wanderers.values()];
    for (const w of end) expect(Math.hypot(w.x - w.home.x, w.z - w.home.z)).toBeLessThan(6);
    const quarters = new Set(end.map((w) => `${w.x > layout.centre.x ? 1 : 0}${w.z > layout.centre.z ? 1 : 0}`));
    expect(quarters.size).toBe(4);
    const nearest = end.map((w) => Math.min(...end.filter((o) => o !== w).map((o) => Math.hypot(o.x - w.x, o.z - w.z))));
    expect(nearest.reduce((a, b) => a + b, 0) / nearest.length).toBeGreaterThan(2.5);
  }, 30_000);

  it("faces settled performers out toward the crowd and walking entrants where they go", () => {
    const w = createJamWanderer(layout.performers[0]);
    const out = Math.atan2(w.x - layout.centre.x, w.z - layout.centre.z);
    for (let t = 0; t < 600; t += 13) {
      let diff = jamSpinnerFacing(w, layout.centre, t) - out;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      expect(Math.abs(diff)).toBeLessThan(Math.PI / 2);
    }
    const entrant = { ...w, vx: 1.2, vz: 0, approaching: true };
    expect(jamSpinnerFacing(entrant, layout.centre, 0)).toBeCloseTo(Math.PI / 2);
  });

  it("turns outside spinners to face open grass, not a canopy or tent", () => {
    for (const spinner of layout.outsideSpinners) {
      const yaw = jamOutsideOpenYaw(spinner, layout.obstacles);
      const ahead = { x: spinner.x + Math.cos(yaw) * 2, z: spinner.z + Math.sin(yaw) * 2 };
      for (const o of layout.obstacles) {
        if (Math.hypot(spinner.x - o.x, spinner.z - o.z) < o.radius + 0.4) continue;
        expect(Math.hypot(ahead.x - o.x, ahead.z - o.z)).toBeGreaterThan(o.radius);
      }
    }
  });
});
