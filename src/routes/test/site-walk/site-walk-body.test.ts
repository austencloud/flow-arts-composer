import { describe, expect, it } from "vitest";
import { BEND_CROUCH, BEND_RUN, BEND_WALK, SiteWalkBody, type BodyFrame, type BodyOutput } from "./site-walk-body";

const WALK = 1.4;
const RUN = WALK * 2.2;
const DT = 1 / 60;

type Sample = BodyOutput & { yaw: number };

/** Drives the body like the scene does, keeping its position. */
function rig(yaw = 0, planStop?: BodyFrame["planStop"], always: Partial<BodyFrame> = {}) {
  const body = new SiteWalkBody(yaw);
  const position = { x: 0, z: 0 };
  const frames: Sample[] = [];
  function run(seconds: number, wantX: number, wantZ: number, more: Partial<BodyFrame> = {}): Sample[] {
    const from = frames.length;
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      const out = body.step({ wantX, wantZ, walkSpeed: WALK, dt: DT, planStop, eyeLevel: false, cameraYaw: 0, ...always, ...more });
      position.x += out.moveX;
      position.z += out.moveZ;
      frames.push({ ...out, yaw: body.yaw });
    }
    return frames.slice(from);
  }
  return { body, position, run };
}

const turned = (from: number, to: number) => Math.abs(Math.atan2(Math.sin(to - from), Math.cos(to - from)));

describe("site walk body", () => {
  it("reaches 90% of walk speed within 0.3 s of the key, and of run speed within 0.5 s", () => {
    const walk = rig();
    walk.run(0.3, 0, WALK);
    expect(walk.body.speed).toBeGreaterThan(WALK * 0.9);
    const run = rig();
    run.run(0.5, 0, RUN);
    expect(run.body.speed).toBeGreaterThan(RUN * 0.9);
  });

  it("travels along its facing, so a reversal never glides backwards", () => {
    const r = rig();
    r.run(1, 0, WALK);
    const reversal = r.run(1.8, 0, -WALK);
    for (const f of reversal) {
      const d = Math.hypot(f.moveX, f.moveZ);
      if (d < 1e-6) continue;
      expect((f.moveX * Math.sin(f.yaw) + f.moveZ * Math.cos(f.yaw)) / d).toBeGreaterThan(0.999);
    }
    expect(Math.cos(r.body.yaw)).toBeLessThan(-0.98);
    expect(reversal.at(-1)!.moveZ).toBeLessThan(0);
  });

  it("builds a turn up over several frames and lets it die away when the key comes up", () => {
    const r = rig();
    const frames = [...r.run(0.1, WALK, 0), ...r.run(0.5, 0, 0)];
    let before = 0;
    let rate = 0;
    for (const f of frames) {
      const now = turned(before, f.yaw) / DT;
      // No frame may add or drop more than a quarter of the walk's top turning rate.
      expect(Math.abs(now - rate)).toBeLessThan(BEND_WALK / 4);
      rate = now;
      before = f.yaw;
    }
    expect(rate).toBeLessThan(0.05);
  });

  it("settles on the keys' heading without swinging past it", () => {
    for (const heading of [0.4, 1.2, 2, 3]) {
      const r = rig();
      for (const f of r.run(2, Math.sin(heading) * WALK, Math.cos(heading) * WALK)) expect(f.yaw).toBeLessThan(heading + 0.02);
      expect(turned(r.body.yaw, heading)).toBeLessThan(0.01);
    }
  });

  it("turns no faster than its steps can, and no faster than the planted feet let it", () => {
    const top = (speed: number, more: Partial<BodyFrame> = {}) => {
      const r = rig(0, undefined, more);
      r.run(1, 0, speed);
      let before = r.body.yaw;
      let most = 0;
      for (const f of r.run(1, speed, 0)) {
        most = Math.max(most, turned(before, f.yaw) / DT);
        before = f.yaw;
      }
      return most;
    };
    expect(top(WALK)).toBeLessThan(BEND_WALK + 1e-6);
    expect(top(RUN)).toBeLessThan(BEND_RUN + 1e-6);
    expect(top(RUN)).toBeGreaterThan(BEND_WALK);
    expect(top(WALK, { crouched: true })).toBeLessThan(BEND_CROUCH + 1e-6);
    expect(top(WALK, { turnRoom: () => 1 })).toBeLessThan(1 + 1e-6);
  });

  it("goes the way a recorded turn says, sideways and backwards too, and not on in it after", () => {
    const r = rig();
    r.run(1, 0, WALK);
    const from = { ...r.position };
    r.run(0.5, 0, -WALK, { turn: { spin: 2, ahead: -0.5, left: 0.3 } });
    expect(Math.abs(r.body.yaw - 1)).toBeLessThan(0.1);
    expect(Math.hypot(r.position.x - from.x, r.position.z - from.z)).toBeGreaterThan(0.2);
    const after = r.run(1, Math.sin(r.body.yaw) * WALK, Math.cos(r.body.yaw) * WALK);
    const last = after.at(-1)!;
    expect((last.moveX * Math.cos(last.yaw) - last.moveZ * Math.sin(last.yaw)) / DT).toBeCloseTo(0, 3);
  });

  it("comes to rest over exactly the distance the gait asked for", () => {
    for (const [speed, distance] of [[WALK, 0.5], [RUN, 0.9]] as const) {
      const r = rig(0, () => distance);
      r.run(2, 0, speed);
      const z = r.position.z;
      const stop = r.run(2, 0, 0);
      expect(r.position.z - z).toBeCloseTo(distance * (r.body.speed === 0 ? 1 : 0), 1);
      expect(stop[0]!.stopping).toBe(true);
      expect(stop.at(-1)).toMatchObject({ moving: false, stopping: false });
      for (let i = 1; i < stop.length; i++) expect(stop[i]!.speed).toBeLessThanOrEqual(stop[i - 1]!.speed + 1e-9);
    }
  });

  it("still stops with no gait to ask, and with one that has no body yet", () => {
    for (const planStop of [undefined, () => null]) {
      const r = rig(0, planStop);
      r.run(2, 0, RUN);
      r.run(1, 0, 0);
      expect(r.body.speed).toBe(0);
    }
  });

  it("eases a run down to a walk when Shift comes up", () => {
    const r = rig();
    r.run(2, 0, RUN);
    const speeds = r.run(1.5, 0, WALK).map((f) => f.speed);
    expect(speeds[Math.round(0.2 / DT) - 1]!).toBeGreaterThan(WALK * 1.4);
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]!).toBeLessThanOrEqual(speeds[i - 1]! + 1e-9);
    expect(speeds.at(-1)!).toBeLessThan(WALK * 1.05);
  });
});
