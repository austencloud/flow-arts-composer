import { readFileSync } from "node:fs";
import { Group, Line3, Quaternion, Vector3 } from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { BodyMoves } from "#lib/shared/3d/locomotion/gait/body-moves";
import { GaitAnimator } from "#lib/shared/3d/locomotion/gait/gait-animator";
import { decodeGaitClips, type GaitClipSet } from "#lib/shared/3d/locomotion/gait/gait-clips";
import { gaitTestBody } from "#lib/shared/3d/locomotion/gait/gait-test-body";
import { SiteWalkBody } from "./site-walk-body";

const DT = 1 / 60;
const WALK = 1.41;
const RUN = 3.08;
const CROUCH = 1.09;
const CROUCH_RUN = 2.5;
const DEG = Math.PI / 180;
let clips: GaitClipSet;

beforeAll(() => {
  clips = decodeGaitClips(JSON.parse(readFileSync("static/animations/gait/gait-clips.json", "utf8")));
});

interface Foot {
  x: number;
  z: number;
  /** The ball's and the heel's height over where they stand. */
  ball: number;
  heel: number;
  /** Which way it points. */
  yaw: number;
}

interface Frame {
  t: number;
  yaw: number;
  speed: number;
  move: string | null;
  left: Foot;
  right: Foot;
  /** How near either hand or forearm comes to a thigh's bone (m). */
  hands: number;
}

interface Ask {
  /** Speed, and where to: straight ahead first, then another way. */
  speed: number;
  degrees: number;
  /** Already going when it is asked, this long; or from standing. */
  going: number | null;
  crouched?: boolean;
}

/** The whole body as the scene puts it together, asked for one change of direction. */
function change({ speed, degrees, going, crouched = false }: Ask): { frames: Frame[]; asked: number } {
  const { root, bone } = gaitTestBody(clips);
  const host = new Group().add(root);
  const animator = new GaitAnimator(clips);
  animator.attach(root);
  const body = new SiteWalkBody(0);
  const moves = new BodyMoves(clips.moves);
  const still = crouched ? 2 : 0.4;
  const asked = still + (going ?? 0);
  const at = (name: string) => bone(name).getWorldPosition(new Vector3());
  const turnOf = (name: string) => bone(name).getWorldQuaternion(new Quaternion());
  host.updateMatrixWorld(true);
  const rest = (side: "Left" | "Right") => ({ ball: at(`${side}ToeBase`).y, heel: at(`${side}Foot`).y, back: turnOf(`${side}Foot`).invert() });
  const rests = { Left: rest("Left"), Right: rest("Right") };
  const foot = (side: "Left" | "Right"): Foot => {
    const ball = at(`${side}ToeBase`);
    const q = turnOf(`${side}Foot`).multiply(rests[side].back);
    return { x: ball.x, z: ball.z, ball: ball.y - rests[side].ball, heel: at(`${side}Foot`).y - rests[side].heel, yaw: 2 * Math.atan2(q.y, q.w) };
  };
  const thighs = (["Left", "Right"] as const).map((side) => ({ side, line: new Line3() }));
  const handsToThighs = (): number => {
    for (const { side, line } of thighs) line.set(at(`${side}UpLeg`), at(`${side}Leg`));
    const arms = (["Left", "Right"] as const).flatMap((side) => {
      const wrist = at(`${side}Hand`);
      return [wrist, at(`${side}HandMiddle1`), at(`${side}HandMiddle3`), at(`${side}ForeArm`).lerp(wrist, 0.6)];
    });
    return Math.min(...arms.flatMap((p) => thighs.map(({ line }) => line.closestPointToPoint(p, true, new Vector3()).distanceTo(p))));
  };
  const frames: Frame[] = [];
  let pace = 0;
  for (let i = 0; i * DT < asked + 2.4; i++) {
    const t = i * DT;
    const heading = t >= asked - 1e-9 ? degrees * DEG : 0;
    const want = t >= asked - 1e-9 || (going !== null && t >= still) ? speed : 0;
    const wantX = Math.sin(heading) * want;
    const wantZ = Math.cos(heading) * want;
    const doing = moves.step({
      dt: DT,
      grounded: true,
      speed: pace,
      rise: 0,
      wantsMove: want > 0,
      sprinting: want > 1.5,
      jump: false,
      crouch: crouched && i === 6,
      roll: false,
      room: () => true,
      wantX,
      wantZ,
      yaw: body.yaw,
      feet: animator,
    });
    const before = body.yaw;
    const out = body.step({
      wantX,
      wantZ,
      walkSpeed: 1.4,
      dt: DT,
      planStop: (v) => animator.planStop(v),
      turnRoom: (way, v) => animator.turnRoom(way, v),
      eyeLevel: false,
      cameraYaw: 0,
      air: doing.air,
      drive: doing.drive,
      planted: doing.planted,
      crouched: doing.crouched,
      turn: doing.turn,
    });
    host.position.x += out.moveX;
    host.position.z += out.moveZ;
    host.rotation.y = body.yaw;
    host.updateMatrixWorld(true);
    pace = Math.hypot(out.moveX, out.moveZ) / DT;
    const turned = Math.atan2(Math.sin(body.yaw - before), Math.cos(body.yaw - before));
    animator.update(DT, { speed: out.speed, turnRate: turned / DT, stopping: out.stopping, crouched: doing.crouched, move: doing.move });
    host.updateMatrixWorld(true);
    frames.push({ t, yaw: body.yaw, speed: pace, move: doing.move?.name ?? null, left: foot("Left"), right: foot("Right"), hands: handsToThighs() });
  }
  return { frames, asked };
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** The most any foot slides while it stands (m), and spins (rad), from just before it is asked. */
function worst({ frames, asked }: ReturnType<typeof change>): { slide: number; spin: number } {
  const seen = frames.filter((f) => f.t > asked - 0.3);
  let slide = 0;
  let spin = 0;
  for (const side of ["left", "right"] as const) {
    const feet = seen.map((f) => f[side]);
    const pace = (i: number) => (i > 0 ? Math.hypot(feet[i]!.x - feet[i - 1]!.x, feet[i]!.z - feet[i - 1]!.z) / DT : 0);
    // Low, and not already pushed off with the heel up and the ball on its way.
    const stands = feet.map((f, i) => f.ball < 0.02 && !(f.heel > 0.045 && pace(i) > 0.6) && !(f.heel > 0.02 && pace(i) > 1.2));
    for (let i = 0; i < feet.length; i++) {
      if (!stands[i] || (i > 0 && stands[i - 1])) continue;
      let end = i;
      while (end + 1 < feet.length && stands[end + 1]) end++;
      // Not the first of coming down nor the last of going up.
      for (let j = i + 2; j <= end - 4; j++) {
        slide = Math.max(slide, Math.hypot(feet[j]!.x - feet[i + 2]!.x, feet[j]!.z - feet[i + 2]!.z));
        spin = Math.max(spin, Math.abs(wrap(feet[j]!.yaw - feet[i + 2]!.yaw)));
      }
    }
  }
  return { slide, spin };
}

/** Seconds until it faces within ten degrees of the way asked for. */
function facesIn({ frames, asked }: ReturnType<typeof change>, degrees: number): number {
  const there = frames.find((f) => f.t > asked && Math.abs(wrap(f.yaw - degrees * DEG)) < 10 * DEG);
  return there ? there.t - asked : Infinity;
}

// The recorded turns' own feet slide 1 to 9 cm and spin up to 45 degrees.
describe("a change of direction", () => {
  const starts: Array<[string, Ask, string | null, number]> = [
    ["a walk off to the side from standing", { speed: WALK, degrees: 90, going: null }, "turnStand", 0.9],
    ["a walk off to the other side", { speed: WALK, degrees: -90, going: null }, "turnStand", 0.9],
    ["a walk off backwards from standing", { speed: WALK, degrees: 180, going: null }, "turnWalk", 0.9],
    ["a run off to the side from standing", { speed: RUN, degrees: 90, going: null }, "turnStand", 0.9],
    ["a crouched step off to the side", { speed: CROUCH, degrees: 90, going: null, crouched: true }, "turnCrouch", 0.65],
    ["a crouched step off to the other side", { speed: CROUCH, degrees: -90, going: null, crouched: true }, "turnCrouch", 0.65],
    ["a crouched step off backwards", { speed: CROUCH, degrees: 180, going: null, crouched: true }, "turnCrouch", 1.2],
  ];
  it.each(starts)("plants its feet: %s", (_, ask, move, seconds) => {
    const run = change(ask);
    const { slide, spin } = worst(run);
    expect(slide).toBeLessThan(0.06);
    expect(spin).toBeLessThan(50 * DEG);
    expect(facesIn(run, ask.degrees)).toBeLessThan(seconds);
    expect(run.frames.find((f) => f.move)?.move ?? null).toBe(move);
  });

  // Asked at every eighth of a stride. The recorded running turn skids as it stops.
  const bends: Array<[string, Ask, number, string | null, number, number, number]> = [
    ["walking, a quarter", { speed: WALK, degrees: 90, going: 1.8 }, 1.05, null, 0.03, 45, 1],
    ["walking, a quarter the other way", { speed: WALK, degrees: -90, going: 1.8 }, 1.05, null, 0.03, 45, 1],
    ["walking, back", { speed: WALK, degrees: 180, going: 1.8 }, 1.05, "turnWalk", 0.06, 50, 0.9],
    ["running, a quarter", { speed: RUN, degrees: 90, going: 1.8 }, 0.72, null, 0.03, 30, 0.7],
    ["running, back", { speed: RUN, degrees: 180, going: 1.8 }, 0.72, "turnRun", 0.16, 45, 0.8],
    ["crouched, a quarter", { speed: CROUCH, degrees: 90, going: 1.8, crouched: true }, 1.5, null, 0.03, 45, 1.1],
    ["crouched, a quarter the other way", { speed: CROUCH, degrees: -90, going: 1.8, crouched: true }, 1.5, null, 0.03, 45, 1.1],
    ["crouched, back", { speed: CROUCH, degrees: 180, going: 1.8, crouched: true }, 1.5, null, 0.03, 45, 2.1],
  ];
  it.each(bends)("plants its feet: %s", (_, ask, stride, move, most, spinMost, seconds) => {
    const slides: number[] = [];
    for (let k = 0; k < 8; k++) {
      const run = change({ ...ask, going: ask.going! + (k / 8) * stride });
      const { slide, spin } = worst(run);
      slides.push(slide);
      expect(slide).toBeLessThan(most);
      expect(spin).toBeLessThan(spinMost * DEG);
      expect(facesIn(run, ask.degrees)).toBeLessThan(seconds);
      expect(run.frames.find((f) => f.move)?.move ?? null).toBe(move);
    }
    slides.sort((a, b) => a - b);
    expect(slides[4]!).toBeLessThan(0.04);
  });

  it("walks on straight after, at its own speed", () => {
    for (const going of [null, 1.8]) {
      const { frames } = change({ speed: WALK, degrees: 180, going });
      const last = frames.at(-1)!;
      expect(Math.abs(wrap(last.yaw - Math.PI))).toBeLessThan(0.02);
      expect(last.speed).toBeCloseTo(WALK, 1);
      expect(last.move).toBeNull();
    }
  });

  it("turns no one who only leans off line", () => {
    for (const going of [null, 1.8]) expect(change({ speed: WALK, degrees: 30, going }).frames.every((f) => f.move === null)).toBe(true);
  });
});

// A thigh is about 9 cm thick round its bone and a hand 3.
describe("crouched hands", () => {
  const moves: Array<[string, Ask, number]> = [
    ["still", { speed: 0, degrees: 0, going: null, crouched: true }, 0.2],
    ["walking", { speed: CROUCH, degrees: 0, going: 0.5, crouched: true }, 0.2],
    ["turning into a walk", { speed: CROUCH, degrees: 90, going: null, crouched: true }, 0.17],
    ["turning back into a walk", { speed: CROUCH, degrees: -180, going: null, crouched: true }, 0.17],
    ["walking, a quarter", { speed: CROUCH, degrees: 90, going: 1.8, crouched: true }, 0.2],
    // Nearer than 0.2 where the arms come into the run with the legs.
    ["running", { speed: CROUCH_RUN, degrees: 0, going: 0.5, crouched: true }, 0.2],
    ["turning into a run", { speed: CROUCH_RUN, degrees: 90, going: null, crouched: true }, 0.17],
    ["turning the other way into a run", { speed: CROUCH_RUN, degrees: -90, going: null, crouched: true }, 0.17],
    ["running, a quarter", { speed: CROUCH_RUN, degrees: 90, going: 1.8, crouched: true }, 0.2],
    ["running, back", { speed: CROUCH_RUN, degrees: 180, going: 1.8, crouched: true }, 0.2],
  ];
  it.each(moves)("stay out of the legs: %s", (_, ask, clear) => {
    const { frames } = change(ask);
    expect(Math.min(...frames.filter((f) => f.t > 1).map((f) => f.hands))).toBeGreaterThan(clear);
  });
});
