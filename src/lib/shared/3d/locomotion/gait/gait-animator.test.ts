import { readFileSync } from "node:fs";
import { Group, Quaternion, Vector3 } from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { GaitAnimator } from "./gait-animator";
import { decodeGaitClips, inSpan, type GaitClipSet } from "./gait-clips";
import { gaitTestBody } from "./gait-test-body";

const DT = 1 / 60;
const WALK = 1.4;
const RUN = 3.08;
let clips: GaitClipSet;

beforeAll(() => {
  clips = decodeGaitClips(JSON.parse(readFileSync("static/animations/gait/gait-clips.json", "utf8")));
});

interface Seen {
  hips: Vector3;
  toes: Record<"left" | "right", Vector3>;
  ankle: Record<"left" | "right", number>;
  /** How far round the hips, the chest and the head face from straight ahead (degrees). */
  faces: number[];
}

/** Walks a body forward and records it as drawn. */
function walker(size = 1) {
  const { root, bone } = gaitTestBody(clips, size);
  const animator = new GaitAnimator(clips);
  expect(animator.attach(root)).toBe(true);
  const at = (name: string) => bone(name).getWorldPosition(new Vector3());
  const angle = (side: "Left" | "Right") =>
    at(`${side}Leg`)
      .sub(at(`${side}Foot`))
      .angleTo(at(`${side}ToeBase`).sub(at(`${side}Foot`)));
  const rest = { left: angle("Left"), right: angle("Right") };
  root.updateMatrixWorld(true);
  const facing = ["Hips", "Spine2", "Head"].map((name) => ({ bone: bone(name), back: bone(name).getWorldQuaternion(new Quaternion()).invert() }));
  const seen: Seen[] = [];
  const step = (speed: number, { dt = DT, stopping = false, turnRate = 0, crouched = false } = {}) => {
    root.position.z += speed * dt;
    root.updateMatrixWorld(true);
    animator.update(dt, { speed, stopping, turnRate, crouched });
    root.updateMatrixWorld(true);
    seen.push({
      hips: at("Hips"),
      toes: { left: at("LeftToeBase"), right: at("RightToeBase") },
      // Degrees of shin over foot, past the standing angle.
      ankle: { left: ((rest.left - angle("Left")) * 180) / Math.PI, right: ((rest.right - angle("Right")) * 180) / Math.PI },
      faces: facing.map(({ bone: b, back }) => {
        const ahead = new Vector3(0, 0, 1).applyQuaternion(b.getWorldQuaternion(new Quaternion()).multiply(back));
        return Math.abs((Math.atan2(ahead.x, ahead.z) * 180) / Math.PI);
      }),
    });
  };
  const go = (seconds: number, speed: number, dt = DT, crouched = false): Seen[] => {
    const from = seen.length;
    for (let i = 0; i < Math.round(seconds / dt); i++) step(speed, { dt, crouched });
    return seen.slice(from);
  };
  /** Lets go of the keys the way the body does: even slowing over the distance asked for. */
  const stop = (speed: number, crouched = false) => {
    const distance = animator.planStop(speed);
    const from = seen.length;
    const brake = (speed * speed) / (2 * distance);
    for (let v = speed; v > 0; ) {
      const next = Math.max(0, v - brake * DT);
      step((v + next) / 2, { stopping: true, crouched });
      v = next;
    }
    for (let i = 0; i < 60; i++) step(0, { crouched });
    return { distance, frames: seen.slice(from) };
  };
  return { animator, root, go, stop, step, seen };
}

const most = (frames: Seen[], f: (a: Seen, b: Seen) => number) =>
  frames.slice(1).reduce((max, b, i) => Math.max(max, f(frames[i]!, b)), 0);

describe("gait animator", () => {
  it("never slides a foot that is on the floor", () => {
    for (const speed of [1, WALK, 2.2, RUN]) {
      const w = walker();
      w.go(1.5, speed);
      const frames = w.go(2, speed);
      for (const side of ["left", "right"] as const) {
        const low = Math.min(...frames.map((f) => f.toes[side].y));
        const slides = frames.slice(1).flatMap((b, i) => {
          const a = frames[i]!;
          if (a.toes[side].y > low + 0.01 || b.toes[side].y > low + 0.01) return [];
          return [Math.hypot(b.toes[side].x - a.toes[side].x, b.toes[side].z - a.toes[side].z) / DT];
        });
        expect(slides.length).toBeGreaterThan(8);
        slides.sort((a, b) => a - b);
        expect(slides[Math.floor(slides.length / 2)]!).toBeLessThan(0.05);
      }
    }
  });

  it("bends the ankle no further than a running person does", () => {
    const w = walker();
    w.go(1, RUN);
    const frames = w.go(2, RUN);
    // Recorded people run at 24 to 40 degrees; the walk this replaces reached 108.
    for (const side of ["left", "right"] as const) {
      const bend = Math.max(...frames.map((f) => f.ankle[side]));
      expect(bend).toBeGreaterThan(15);
      expect(bend).toBeLessThan(42);
    }
  });

  it("moves the hips smoothly through starts, changes of speed and stops", () => {
    const w = walker();
    w.go(0.5, 0);
    for (let i = 0; i < 90; i++) w.step(RUN * (1 - Math.exp(-(i * DT) / 0.15)));
    w.go(1, RUN);
    for (let i = 0; i < 90; i++) w.step(WALK + (RUN - WALK) * Math.exp(-(i * DT) / 0.45));
    w.go(0.7, WALK);
    w.stop(WALK);
    expect(most(w.seen, (a, b) => Math.abs(b.hips.y - a.hips.y))).toBeLessThan(0.02);
    expect(most(w.seen, (a, b) => Math.abs(b.hips.x - a.hips.x))).toBeLessThan(0.02);
  });

  it("comes to rest standing, feet together and still, wherever in the stride the keys come up", () => {
    for (const speed of [WALK, RUN]) {
      for (let k = 0; k < 8; k++) {
        const w = walker();
        w.go(1.2 + k * 0.09, speed);
        const { distance, frames } = w.stop(speed);
        expect(distance).toBeGreaterThan(0.15);
        expect(distance).toBeLessThan(speed * 0.3);
        const { left, right } = frames.at(-1)!.toes;
        expect(Math.abs(left.z - right.z)).toBeLessThan(0.15);
        expect(Math.max(left.y, right.y)).toBeLessThan(0.06);
        const still = (a: Seen, b: Seen) => a.toes.left.distanceTo(b.toes.left) + a.toes.right.distanceTo(b.toes.right);
        expect(most(frames.slice(-15), still)).toBeLessThan(0.002);
      }
    }
  });

  it("crouches facing the way it goes, and lowers itself rather than dropping", () => {
    for (const speed of [1.09, 2.5]) {
      for (let k = 0; k < 8; k++) {
        const w = walker();
        w.go(0.5, 0);
        w.go(1, 0, DT, true);
        w.go(1.5 + k * 0.09, speed, DT, true);
        const { frames } = w.stop(speed, true);
        expect(most(w.seen, (a, b) => a.hips.y - b.hips.y)).toBeLessThan(0.024);
        for (const frame of frames.slice(-15)) expect(Math.max(...frame.faces)).toBeLessThan(35);
        const { left, right } = frames.at(-1)!.toes;
        expect(Math.abs(left.z - right.z)).toBeLessThan(0.15);
        const still = (a: Seen, b: Seen) => a.toes.left.distanceTo(b.toes.left) + a.toes.right.distanceTo(b.toes.right);
        expect(most(frames.slice(-15), still)).toBeLessThan(0.002);
      }
    }
  });

  it("keeps the same bounce at any frame rate", () => {
    const at = (dt: number) => {
      const w = walker();
      w.go(2, RUN, dt);
      const hips = w.go(2, RUN, dt).map((f) => f.hips.y);
      return Math.max(...hips) - Math.min(...hips);
    };
    const reference = at(DT);
    for (const dt of [1 / 30, 1 / 144]) expect(Math.abs(at(dt) - reference)).toBeLessThan(0.015);
  });

  it("walks a body of another size on the floor, with steps to its own scale", () => {
    const small = walker(0.7);
    small.go(1.5, WALK);
    const frames = small.go(1.5, WALK);
    for (const side of ["left", "right"] as const) {
      const low = Math.min(...frames.map((f) => f.toes[side].y));
      expect(Math.abs(low)).toBeLessThan(0.03);
    }
    expect(small.animator.measured.strides.walk / walker().animator.measured.strides.walk).toBeCloseTo(0.7, 1);
  });

  it("gives a body back its rest pose when it takes it over again", () => {
    const w = walker();
    const standing = w.animator.measured.strides.walk;
    w.go(1, RUN);
    expect(w.animator.attach(w.root)).toBe(true);
    expect(w.animator.measured.strides.walk).toBeCloseTo(standing, 3);
  });

  it("refuses a body it has no skeleton for", () => {
    expect(new GaitAnimator(clips).attach(new Group())).toBe(false);
  });
});

describe("a contact span", () => {
  it("may run past the end of the cycle", () => {
    expect(inSpan(0.95, [0.5, 1.03])).toBe(true);
    expect(inSpan(0.02, [0.5, 1.03])).toBe(true);
    expect(inSpan(0.04, [0.5, 1.03])).toBe(false);
    expect(inSpan(0.3, [0.5, 1.03])).toBe(false);
  });
});
