import { readFileSync } from "node:fs";
import { Vector3 } from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { BodyMoves, GRAVITY, SLIDE_SPEED, type MoveOutput } from "./body-moves";
import { GaitAnimator } from "./gait-animator";
import { decodeGaitClips, type GaitClipSet, type MoveName } from "./gait-clips";
import { mirrorClip } from "./gait-mirror";
import { gaitTestBody } from "./gait-test-body";

const RUN = 3.08;
let clips: GaitClipSet;

beforeAll(() => {
  clips = decodeGaitClips(JSON.parse(readFileSync("static/animations/gait/gait-clips.json", "utf8")));
});

interface Ask {
  speed?: number;
  jump?: boolean;
  crouch?: boolean;
  roll?: boolean;
  room?: boolean;
  /** Where the floor is now. */
  floor?: number;
}

/** A body on a floor, at even frames. */
function body(dt = 1 / 60, floor = 0) {
  const moves = new BodyMoves(clips.moves);
  let y = floor;
  let rise = 0;
  let pace = 0;
  let grounded = true;
  const heights: number[] = [];
  const step = (ask: Ask = {}): MoveOutput => {
    const wanted = ask.speed ?? 0;
    const out = moves.step({
      dt,
      grounded,
      speed: pace,
      rise,
      wantsMove: wanted > 0,
      sprinting: wanted > 1.5,
      jump: ask.jump ?? false,
      crouch: ask.crouch ?? false,
      roll: ask.roll ?? false,
      room: () => ask.room ?? true,
    });
    if (!out.air) pace = out.drive ?? wanted;
    if (out.launch !== null) rise = out.launch;
    const off = out.launch !== null || !grounded;
    if (!off) rise = 0;
    else {
      y += rise * dt - 0.5 * GRAVITY * dt * dt;
      rise -= GRAVITY * dt;
    }
    const under = ask.floor ?? floor;
    grounded = y <= under + (off ? 0 : 0.02);
    if (grounded) y = under;
    heights.push(y);
    return out;
  };
  const go = (seconds: number, ask: Ask = {}): MoveOutput[] => Array.from({ length: Math.round(seconds / dt) }, () => step(ask));
  return { moves, step, go, heights, pace: () => pace, rise: () => rise };
}

const names = (outs: MoveOutput[]): MoveName[] => [...new Set(outs.flatMap((o) => (o.move ? [o.move.name] : [])))];

describe("body moves", () => {
  it("leaves the floor at once and lands back on it, at any frame rate", () => {
    for (const fps of [30, 60, 144]) {
      const b = body(1 / fps);
      b.go(0.2);
      const outs = [b.step({ jump: true }), ...b.go(1.4)];
      expect(outs.findIndex((o) => o.launch !== null) / fps).toBeLessThan(0.16);
      expect(Math.max(...b.heights)).toBeGreaterThan(0.4);
      expect(Math.max(...b.heights)).toBeLessThan(0.5);
      expect(b.heights.at(-1)).toBe(0);
      expect(names(outs)).toEqual(["jump"]);
    }
  });

  it("jumps off a run within three frames, and runs on after it", () => {
    const b = body();
    b.go(0.5, { speed: RUN });
    const outs = [b.step({ speed: RUN, jump: true }), ...b.go(1.2, { speed: RUN })];
    expect(outs.findIndex((o) => o.launch !== null)).toBeLessThanOrEqual(3);
    expect(names(outs)).toEqual(["leap"]);
    expect(outs.at(-1)!.move).toBeNull();
  });

  it("takes a jump pressed just before the ground, or just past an edge", () => {
    const early = body();
    early.go(0.2, { speed: RUN });
    early.step({ speed: RUN, jump: true });
    while (early.rise() > -2.2) early.step({ speed: RUN });
    expect(early.go(0.5, { speed: RUN, jump: true }).some((o) => o.launch !== null)).toBe(true);

    const late = body(1 / 60, 2);
    late.go(0.3, { speed: RUN });
    late.go(0.05, { speed: RUN, floor: 0 });
    expect(late.go(0.1, { speed: RUN, floor: 0, jump: true }).some((o) => o.launch !== null)).toBe(true);

    const tooLate = body(1 / 60, 2);
    tooLate.go(0.3, { speed: RUN });
    tooLate.go(0.3, { speed: RUN, floor: 0 });
    expect(tooLate.step({ speed: RUN, floor: 0, jump: true }).launch).toBeNull();
  });

  it("falls off an edge, and lands hard from high up", () => {
    const b = body(1 / 60, 2);
    b.go(0.3);
    const outs = b.go(1.2, { floor: 0 });
    expect(names(outs)).toEqual(["fall", "landHard"]);
    expect(outs.some((o) => o.planted)).toBe(true);
    const small = body(1 / 60, 0.1);
    small.go(0.3, { speed: RUN });
    expect(names(small.go(1, { speed: RUN, floor: 0 }))).toEqual([]);
  });

  it("crouches on the key, stands on the next, and stays down where there is no room", () => {
    const b = body();
    expect(b.step({ crouch: true }).crouched).toBe(true);
    expect(b.go(0.5, { speed: 1 }).at(-1)!.crouched).toBe(true);
    expect(b.step({ crouch: true, room: false }).crouched).toBe(true);
    expect(b.step({ jump: true, room: false }).launch).toBeNull();
    expect(b.step({ crouch: true }).crouched).toBe(false);
  });

  it("keeps a crouch through the run key, a jump, a roll and a fall, and gives it back after", () => {
    const b = body();
    b.step({ crouch: true });
    expect(b.go(0.6, { speed: RUN }).every((o) => o.crouched)).toBe(true);

    const jump = [b.step({ speed: RUN, jump: true }), ...b.go(1.2, { speed: RUN })];
    expect(jump.some((o) => o.launch !== null)).toBe(true);
    expect(jump.filter((o) => o.air).every((o) => !o.crouched)).toBe(true);
    expect(jump.at(-1)!.crouched).toBe(true);

    const roll = [b.step({ speed: RUN, roll: true }), ...b.go(2, { speed: RUN })];
    expect(names(roll)).toEqual(["roll"]);
    expect(roll.filter((o) => o.low).every((o) => !o.crouched)).toBe(true);
    expect(roll.at(-1)!.crouched).toBe(true);

    const still = body();
    still.step({ crouch: true });
    const up = [still.step({ jump: true }), ...still.go(1.4)];
    expect(up.some((o) => o.launch !== null)).toBe(true);
    expect(up.at(-1)!.crouched).toBe(true);

    const edge = body(1 / 60, 2);
    edge.step({ crouch: true });
    edge.go(0.3);
    const fell = edge.go(2, { floor: 0 });
    expect(names(fell)).toEqual(["fall", "landHard"]);
    expect(fell.at(-1)!.crouched).toBe(true);
  });

  it("takes the crouch key in the air as how to come down", () => {
    const low = body();
    low.step({ crouch: true });
    low.step({ jump: true });
    low.go(0.25);
    low.step({ crouch: true });
    expect(low.go(1.4).at(-1)!.crouched).toBe(false);

    const tall = body();
    tall.step({ jump: true });
    tall.go(0.25);
    tall.step({ crouch: true });
    expect(tall.go(1.4).at(-1)!.crouched).toBe(true);
  });

  it("slides only from a run, keeps the pace, and comes up crouched under something low", () => {
    const walking = body();
    walking.go(0.5, { speed: 1.4 });
    expect(names([walking.step({ speed: 1.4, crouch: true }), ...walking.go(0.3, { speed: 1.4 })])).toEqual([]);

    const b = body();
    b.go(0.5, { speed: RUN });
    const outs = [b.step({ speed: RUN, crouch: true }), ...b.go(2, { speed: RUN, room: false })];
    expect(names(outs)).toEqual(["slide"]);
    const driven = outs.flatMap((o) => (o.drive === null ? [] : [o.drive]));
    // No brake and no leap going in, at a running speed coming out.
    expect(Math.abs(driven[0]! - RUN)).toBeLessThan(0.5);
    expect(Math.min(...driven)).toBeGreaterThan(SLIDE_SPEED * 0.8);
    expect(Math.max(...driven)).toBeLessThan(RUN * 1.8);
    expect(outs.some((o) => o.low)).toBe(true);
    expect(outs.at(-1)!.crouched).toBe(true);
  });

  it("ends a roll that something solid holds up", () => {
    const moves = new BodyMoves(clips.moves);
    const frame = { dt: 1 / 60, grounded: true, rise: 0, wantsMove: true, sprinting: true, jump: false, crouch: false, room: () => true };
    moves.step({ ...frame, speed: RUN, roll: true });
    expect(moves.state).toBe("roll");
    let frames = 0;
    while (moves.state === "roll" && frames < 120) {
      moves.step({ ...frame, speed: 0, roll: false });
      frames++;
    }
    expect(frames).toBeLessThan(25);
  });

  it("stays within its clips", () => {
    const b = body();
    const keys: Ask[] = [{ jump: true }, { roll: true }, { crouch: true }, {}];
    for (let i = 0; i < 1500; i++) {
      const ask = i % 37 === 0 ? keys[(i / 37) % keys.length]! : {};
      const out = b.step({ ...ask, speed: [0, 1.4, RUN][Math.floor(i / 211) % 3]! });
      if (!out.move) continue;
      expect(Number.isFinite(out.move.at) && out.move.at >= 0).toBe(true);
      if (!clips.moves[out.move.name].loop) expect(out.move.at).toBeLessThan(1.06);
    }
  });
});

/** The clips' skeleton, moved by the moves and drawn by the animator; the most any foot's speed changes in a frame (m). */
function worstJolt(seconds: number, ask: (t: number) => Ask, from = 0.5): number {
  const { root, bone } = gaitTestBody(clips);
  const animator = new GaitAnimator(clips);
  animator.attach(root);
  const b = body();
  const toes = ["LeftToeBase", "RightToeBase"].map(bone);
  const seen: Vector3[][] = [];
  let worst = 0;
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i++) {
    const out = b.step(ask(i / 60));
    const pace = b.pace();
    root.position.z += pace / 60;
    root.position.y = b.heights.at(-1)!;
    root.updateMatrixWorld(true);
    animator.update(1 / 60, { speed: pace, crouched: out.crouched, move: out.move, lift: b.heights.at(-1)! > 0 ? b.rise() : 0 });
    root.updateMatrixWorld(true);
    seen.push(toes.map((toe) => toe.getWorldPosition(new Vector3())));
    if (i < from * 60) continue;
    for (const k of [0, 1]) {
      const [p, q, r] = [seen[i - 2]![k]!, seen[i - 1]![k]!, seen[i]![k]!];
      worst = Math.max(worst, p.clone().add(r).addScaledVector(q, -2).length());
    }
  }
  return worst;
}

describe("a move and the walk around it", () => {
  // The recordings' own feet change speed by up to 0.13 m a frame: landing from the air, dropping into a slide.
  const press = (at: number, key: Ask) => (t: number) => ({ speed: RUN, ...(Math.abs(t - at) < 1 / 120 ? key : {}) });
  const cases: Array<[string, Ask]> = [
    ["jump", { jump: true }],
    ["slide", { crouch: true }],
    ["roll", { roll: true }],
  ];
  it.each(cases)("hands over without a jolt: %s", (_, key) => {
    for (const at of [1, 1.15, 1.3]) expect(worstJolt(3.5, press(at, key))).toBeLessThan(0.14);
  });

  it("runs crouched and jumps from a crouch without one", () => {
    // The crouched run clip's own feet change speed by up to 0.027 m a frame. An instant
    // change of pace jolts them 0.074, a little less than the same change standing up
    // (0.076), and from standing still 0.102.
    const paceChange = (crouch: boolean) =>
      worstJolt(4.5, (t) => ({ crouch: crouch && t < 1 / 120, speed: t < 1.5 ? 1.09 : t < 3 ? 2.5 : 1.09 }), 1);
    expect(worstJolt(4, (t) => ({ crouch: t < 1 / 120, speed: 2.5 }), 1.5)).toBeLessThan(0.035);
    expect(paceChange(true)).toBeLessThan(paceChange(false));
    expect(worstJolt(4, (t) => ({ crouch: Math.abs(t - 0.4) < 1 / 120, speed: t < 0.9 ? 0 : t < 2.6 ? 2.5 : t < 3.4 ? 1.09 : 0 }))).toBeLessThan(0.11);
    expect(worstJolt(3, (t) => ({ crouch: Math.abs(t - 0.4) < 1 / 120, jump: Math.abs(t - 1.2) < 1 / 120 }))).toBeLessThan(0.14);
    expect(worstJolt(3.5, (t) => ({ crouch: t < 1 / 120, jump: Math.abs(t - 1.6) < 1 / 120, speed: 2.5 }), 1)).toBeLessThan(0.14);
  });

  it("goes down into a crouch and up again without one", () => {
    expect(worstJolt(2.5, (t) => ({ crouch: Math.abs(t - 0.8) < 1 / 120 || Math.abs(t - 1.6) < 1 / 120 }))).toBeLessThan(0.012);
  });

  it("a clip mirrored twice is itself", () => {
    const { leap } = clips.moves;
    const twice = mirrorClip(clips.skeleton, mirrorClip(clips.skeleton, leap));
    let most = 0;
    leap.q.forEach((x, i) => (most = Math.max(most, Math.abs(Math.abs(x) - Math.abs(twice.q[i]!)))));
    expect(most).toBeLessThan(2e-3);
    expect(Array.from(twice.p)).toEqual(Array.from(leap.p));
  });
});
