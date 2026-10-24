import { describe, expect, it } from "vitest";
import {
  JAM_CENTRE,
  JAM_CLEARING,
  JAM_OBSTACLES,
  JAM_QUEUE_POINTS,
  JAM_SEMI_AXES,
  buildFlowFestJamLayout,
  distanceToPolyline,
  insidePolygon,
  jamNightAt,
  jamRopeGlow,
  polygonIsSimple,
} from "#lib/features/flow-fest-sim/domain/flow-fest-jam-layout";

// Both engines place the jam from this one layout, so a bad rope or a chair on the
// queue shows up in two places at once. These are the promises the eye cannot check
// from one capture.
describe("flow fest jam layout", () => {
  const layout = buildFlowFestJamLayout();
  const ring = [...layout.boundary, layout.boundary[0]];

  it("is deterministic", () => {
    expect(JSON.stringify(buildFlowFestJamLayout())).toBe(
      JSON.stringify(layout)
    );
  });

  it("lays a closed, simple rope at Thursday's smaller size", () => {
    expect(polygonIsSimple(layout.boundary)).toBe(true);
    const xs = layout.boundary.map((p) => p.x);
    const zs = layout.boundary.map((p) => p.z);
    const width = Math.max(...xs) - Math.min(...xs);
    const depth = Math.max(...zs) - Math.min(...zs);
    expect(width).toBeGreaterThan(29);
    expect(width).toBeLessThan(42);
    expect(depth).toBeGreaterThan(20);
    expect(depth).toBeLessThan(31);
    expect(insidePolygon(layout.centre, layout.boundary)).toBe(true);
  });

  it("is an amoeba, not an ellipse", () => {
    const radii = layout.boundary.map((p) =>
      Math.hypot(p.x - layout.centre.x, p.z - layout.centre.z)
    );
    const a = JAM_SEMI_AXES.x;
    const b = JAM_SEMI_AXES.z;
    const deviations = layout.boundary.map((p, i) => {
      const ang = Math.atan2(p.z - layout.centre.z, p.x - layout.centre.x);
      const ellipse =
        (a * b) / Math.hypot(b * Math.cos(ang), a * Math.sin(ang));
      return Math.abs(radii[i] - ellipse);
    });
    expect(Math.max(...deviations)).toBeGreaterThan(1.5);
  });

  it("keeps the rope clear of every footprint, the queue and the tree line", () => {
    for (const p of layout.boundary) {
      for (const o of JAM_OBSTACLES)
        expect(Math.hypot(p.x - o.x, p.z - o.z)).toBeGreaterThan(
          o.radius + 1.3
        );
      expect(distanceToPolyline(p, JAM_QUEUE_POINTS)).toBeGreaterThan(2.5);
      expect(p.x).toBeGreaterThan(JAM_CLEARING.minX);
      expect(p.x).toBeLessThan(JAM_CLEARING.maxX);
      expect(p.z).toBeGreaterThan(JAM_CLEARING.minZ);
      expect(p.z).toBeLessThan(JAM_CLEARING.maxZ);
    }
  });

  it("walks you from the dip through the archway to the gap, with the lighting flame just inside", () => {
    const { entrance } = layout;
    const archToGap = Math.hypot(
      entrance.x - entrance.archway.x,
      entrance.z - entrance.archway.z
    );
    expect(archToGap).toBeGreaterThan(3);
    expect(archToGap).toBeLessThan(8);
    const step = {
      x: entrance.x + entrance.inward.x * 2,
      z: entrance.z + entrance.inward.z * 2,
    };
    expect(insidePolygon(step, layout.boundary)).toBe(true);
    expect(insidePolygon(entrance.flame, layout.boundary)).toBe(true);
    expect(
      Math.hypot(entrance.flame.x - entrance.x, entrance.flame.z - entrance.z)
    ).toBeLessThan(3);
    // The walking line reaches the archway, then the gap; each funnel side ends on its own post.
    const throughArch = layout.queue[layout.queue.length - 2];
    expect(
      Math.hypot(
        throughArch.x - entrance.archway.x,
        throughArch.z - entrance.archway.z
      )
    ).toBeLessThan(0.01);
    const ends = entrance.funnel.map((line) => line[line.length - 1]);
    expect(ends[0]).not.toEqual(ends[1]);
    for (const end of ends)
      expect(
        entrance.posts.some((post) => post.x === end.x && post.z === end.z)
      ).toBe(true);
    for (const line of entrance.funnel)
      for (const p of line.slice(0, -1))
        expect(insidePolygon(p, layout.boundary)).toBe(false);
    // The player hands over in the funnel, facing the arch.
    expect(insidePolygon(layout.handover, layout.boundary)).toBe(false);
    expect(
      Math.hypot(
        layout.handover.x - entrance.archway.x,
        layout.handover.z - entrance.archway.z
      )
    ).toBeLessThan(3);
  });

  it("spaces safety stations along the rope, outside it, facing in", () => {
    expect(layout.stations.length).toBeGreaterThanOrEqual(12);
    expect(layout.stations.length).toBeLessThanOrEqual(22);
    for (const s of layout.stations) {
      expect(insidePolygon(s, layout.boundary)).toBe(false);
      expect(distanceToPolyline(s, ring)).toBeLessThan(1.2);
      const ahead = {
        x: s.x + Math.cos(s.yaw) * 3,
        z: s.z + Math.sin(s.yaw) * 3,
      };
      expect(insidePolygon(ahead, layout.boundary)).toBe(true);
    }
  });

  it("dresses the edge without touching the circle, the queue, the entrance or each other", () => {
    expect(
      layout.dressing.filter((d) => d.kind === "chair").length
    ).toBeGreaterThan(25);
    expect(
      layout.dressing.filter((d) => d.kind === "wagon").length
    ).toBeGreaterThan(4);
    for (const d of layout.dressing) {
      expect(insidePolygon(d, layout.boundary)).toBe(false);
      expect(distanceToPolyline(d, ring)).toBeGreaterThan(1.2);
      expect(distanceToPolyline(d, JAM_QUEUE_POINTS)).toBeGreaterThan(1.4);
      expect(
        Math.hypot(d.x - layout.entrance.x, d.z - layout.entrance.z)
      ).toBeGreaterThan(4.5);
      for (const o of JAM_OBSTACLES)
        expect(Math.hypot(d.x - o.x, d.z - o.z)).toBeGreaterThan(o.radius + 1);
    }
    for (let i = 0; i < layout.dressing.length; i++)
      for (let j = i + 1; j < layout.dressing.length; j++) {
        const a = layout.dressing[i];
        const b = layout.dressing[j];
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.4);
      }
  });

  it("puts the fire inside: every performer starts in the circle, clear of the rope and each other", () => {
    expect(layout.performers.length).toBeGreaterThanOrEqual(12);
    for (const p of layout.performers) {
      expect(insidePolygon(p.start, layout.boundary)).toBe(true);
      expect(distanceToPolyline(p.start, ring)).toBeGreaterThan(2);
      expect(p.finish).toBe("fire");
    }
    for (let i = 0; i < layout.performers.length; i++)
      for (let j = i + 1; j < layout.performers.length; j++) {
        const a = layout.performers[i].start;
        const b = layout.performers[j].start;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(3);
      }
    expect(layout.performers.length).toBeLessThanOrEqual(
      layout.light.maxFireAtOnce
    );
    expect(
      layout.performers.filter((p) => p.juggler && p.prop === "clubs").length
    ).toBeGreaterThanOrEqual(2);
  });

  it("keeps the LED spinners outside, by the canopies, the vendors, the booth and the open grass", () => {
    const spinners = layout.outsideSpinners;
    expect(spinners.length).toBeGreaterThanOrEqual(15);
    for (const anchor of ["open", "canopy", "vendor", "dj"])
      expect(spinners.some((s) => s.anchor === anchor)).toBe(true);
    for (const s of spinners) {
      expect(insidePolygon(s, layout.boundary)).toBe(false);
      expect(distanceToPolyline(s, ring)).toBeGreaterThan(3);
      expect(distanceToPolyline(s, JAM_QUEUE_POINTS)).toBeGreaterThan(1.4);
      for (const line of layout.entrance.funnel)
        expect(distanceToPolyline(s, line)).toBeGreaterThan(0.8);
    }
    expect(
      spinners.filter((s) => s.juggler && s.prop === "clubs").length
    ).toBeGreaterThanOrEqual(3);
    expect(
      spinners.some((s) => s.prop === "dragon-staff" || s.prop === "rope-dart")
    ).toBe(false);
  });

  it("has about a third of the crowd performing at full night", () => {
    const performing = layout.performers.length + layout.outsideSpinners.length;
    const share = performing / (performing + layout.spectators.length);
    expect(share).toBeGreaterThan(0.27);
    expect(share).toBeLessThan(0.4);
  });

  it("stands the DJ booth at the stage edge, facing the circle, under string lights above head height", () => {
    const { djBooth } = layout;
    const stage = JAM_OBSTACLES.find((o) => o.id === "ShowcaseStage")!;
    expect(Math.hypot(djBooth.x - stage.x, djBooth.z - stage.z)).toBeLessThan(
      stage.radius + 1.5
    );
    expect(insidePolygon(djBooth, layout.boundary)).toBe(false);
    const ahead = {
      x: djBooth.x + Math.cos(djBooth.yaw),
      z: djBooth.z + Math.sin(djBooth.yaw),
    };
    expect(
      Math.hypot(ahead.x - JAM_CENTRE.x, ahead.z - JAM_CENTRE.z)
    ).toBeLessThan(
      Math.hypot(djBooth.x - JAM_CENTRE.x, djBooth.z - JAM_CENTRE.z)
    );
    expect(djBooth.untilHour).toBe(26);
    expect(layout.stringLights.length).toBeGreaterThan(0);
    for (const run of layout.stringLights)
      for (const a of run.anchors)
        expect(a.height - run.sag).toBeGreaterThan(1.9);
  });

  it("fills the circle by the night curve and lights the rope by the sun", () => {
    expect(jamNightAt(layout.night, 19).inside).toBe(0);
    expect(jamNightAt(layout.night, 22.5).inside).toBe(1);
    expect(jamNightAt(layout.night, 28).inside).toBe(0);
    expect(jamRopeGlow(layout.light, 10)).toBe(0);
    expect(jamRopeGlow(layout.light, -8)).toBe(1);
  });
});
