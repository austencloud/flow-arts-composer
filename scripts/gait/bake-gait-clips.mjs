// Bakes the clips the GaitAnimator plays: static/animations/gait/gait-clips.json
// (walking, standing, crouching and the moves) and gait-gestures.json.
//
//   node scripts/gait/bake-gait-clips.mjs <folder of Mixamo .fbx files>...
//
// A step clip becomes one seamless cycle, resampled evenly, with the left
// foot's touchdown at phase 0 and the right foot's at 0.5, travelling along +Z
// with its steady travel taken out. An idle becomes one seamless loop in place.
// A move is a stretch of a clip with the path it covers stored beside it, when
// each foot holds the floor, and, for a jump, when it leaves and meets the
// floor; the arc itself is taken out, because the body's own fall supplies it.
// A turn is a move whose path is which way it faces and where it gets to.
// Nothing is retargeted here: rotations are the source skeleton's own, stored
// with that skeleton's rest pose, so one bake serves every body.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

const SOURCES = process.argv.slice(2);
if (!SOURCES.length) throw new Error("usage: node scripts/gait/bake-gait-clips.mjs <folder of .fbx>...");
const HOME = path.resolve(import.meta.dirname, "../../static/animations/gait");
const FPS = 60;
/** Gravity the jumps are measured with (m/s^2). */
const G = 9.81;

const STEPS = [
  { name: "walk", file: "Standard_Walk.fbx", samples: 64, cycle: [0.9, 1.4] },
  { name: "run", file: "Slow_Run.fbx", samples: 48, cycle: [0.55, 0.9] },
  // Only its arms are used. It leads with one side all through: evened with its own mirror.
  { name: "sneak", file: "Sneaking_Forward.fbx", samples: 64, cycle: [1.2, 1.7], even: true, armsOnly: true },
  // Recorded with a torch and a rifle in hand, so their arms are others'. Upright arms alone hang into the raised thighs.
  { name: "crouchWalk", file: "Crouch_Torch_Walk_Forward.fbx", samples: 64, cycle: [0.95, 1.2], arms: { from: "sneak", toward: "walk", by: 0.3 } },
  { name: "crouchRun", file: "Crouched_Run.fbx", samples: 48, cycle: [0.65, 0.9], arms: { from: "sneak", toward: "run", by: 0.4 } },
];
const IDLES = [
  // The breathing and sway at a fifth of their size: blended toward the clip's own calmest frame.
  { name: "stand", file: "Breathing_Idle.fbx", fps: 10, calm: 0.2 },
  // The torch is in the left hand.
  { name: "crouch", file: "Crouch_Torch_Idle_01.fbx", fps: 10, ahead: true, arms: { middle: "sneak", toward: "stand", by: 0.3 } },
];
// Seconds into the clip. `air` is when the last foot leaves the floor and the first one meets it.
const MOVES = [
  { name: "jump", file: "Unarmed_Jump.fbx", from: 0.4, to: 2.3, air: true },
  { name: "leap", file: "Unarmed_Jump_Running.fbx", from: 0.2, to: 1.4, air: true, travel: true },
  { name: "fall", file: "Fall_A_Loop.fbx", loop: true, floating: true },
  { name: "landRun", file: "Fall_A_Land_To_Run_Forward.fbx", from: 0, to: 0.9333, travel: true },
  { name: "landHard", file: "Hard_Landing.fbx", from: 0.03, to: 2 },
  { name: "slide", file: "Running_Slide.fbx", from: 0, to: 1.5333, travel: true },
  { name: "roll", file: "Sprinting_Forward_Roll.fbx", from: 0, to: 1.1667, travel: true, clear: true },
  { name: "rollStand", file: "Stand_To_Roll.fbx", from: 0.2, to: 2.3667, travel: true, clear: true },
  // To the right, all but the crouched one; the other side is the mirror of it.
  { name: "turnStand", file: "Right_Turn_10.fbx", from: 0, to: 1, turn: true },
  { name: "turnWalk", file: "Walking_Turn_180.fbx", from: 0, to: 1, turn: true },
  { name: "turnRun", file: "Running_Turn_180.fbx", from: 0, to: 0.6667, turn: true },
  { name: "turnCrouch", file: "Crouch_Torch_Turn_Left_90.fbx", from: 0.1, to: 1.2, turn: true, arms: { middle: "sneak", free: "Right", by: 0.5 } },
];
const ARMS = /^(Left|Right)(Shoulder|Arm|ForeArm|Hand)/;
const UPPER_ARM = /^(Left|Right)Arm$/;
const GESTURES = [
  { name: "wave", file: "Waving_3.fbx", loop: true },
  { name: "point", file: "Pointing_3.fbx", from: 0.2, to: 2.6 },
  { name: "clap", file: "Clapping.fbx", loop: true },
  { name: "bow", file: "Quick_Informal_Bow.fbx", from: 0, to: 2.1 },
  { name: "cheer", file: "Cheering.fbx", loop: true },
];

const { Vector3: V, Quaternion: Q } = THREE;
const short = (n) => n.replace(/^mixamorig\d*:?/i, "").replace(/[:.]/g, "");

function load(file) {
  const folder = SOURCES.find((dir) => existsSync(path.join(dir, file)));
  if (!folder) throw new Error(`${file}: in none of the folders`);
  const bytes = readFileSync(path.join(folder, file));
  const root = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  const clip = root.animations.slice().sort((a, b) => b.duration - a.duration)[0];
  return { root, clip, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function skeletonOf(root) {
  root.updateMatrixWorld(true);
  let hips = null;
  root.traverse((b) => {
    if (!hips && short(b.name) === "Hips") hips = b;
  });
  const bones = [];
  const seen = new Set();
  hips.traverse((b) => {
    const s = short(b.name);
    if (seen.has(s) || /_End$|HeadTop|4$/.test(s)) return;
    seen.add(s);
    bones.push({ name: s, node: b });
  });
  const index = new Map(bones.map((b, i) => [b.node, i]));
  return {
    hips,
    bones: bones.map((b) => {
      let p = b.node.parent;
      while (p && !index.has(p)) p = p.parent;
      return {
        ...b,
        parent: p ? index.get(p) : -1,
        restQ: b.node.getWorldQuaternion(new Q()),
        restP: b.node.getWorldPosition(new V()),
      };
    }),
  };
}

/** Every frame of a clip: local rotations (the hips' in the world), the hips' place, and the feet's. */
function sample(src, skeleton, unit, canon) {
  const byName = new Map(skeleton.bones.map((b) => [b.name, b]));
  const mixer = new THREE.AnimationMixer(src.root);
  mixer.clipAction(src.clip).play();
  const n = Math.floor(src.clip.duration * FPS) + 1;
  const at = (name) => byName.get(name).node;
  const feet = ["LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase"].map(at);
  const frames = [];
  for (let i = 0; i < n; i++) {
    mixer.setTime(Math.min(i / FPS, src.clip.duration - 1e-4));
    src.root.updateMatrixWorld(true);
    // On the one stored skeleton: what each bone turned from its own rest, put on that rest.
    const world = canon.bones.map((name, x) => {
      const b = byName.get(name);
      const rest = new Q().fromArray(canon.restQ, x * 4);
      return b ? b.node.getWorldQuaternion(new Q()).multiply(b.restQ.clone().invert()).multiply(rest) : null;
    });
    canon.bones.forEach((_, x) => {
      const p = canon.parents[x];
      if (world[x]) return;
      const rest = (k) => new Q().fromArray(canon.restQ, k * 4);
      world[x] = world[p].clone().multiply(rest(p).invert()).multiply(rest(x));
    });
    frames.push({
      q: canon.parents.map((p, x) => (p < 0 ? world[x].clone() : world[p].clone().invert().multiply(world[x]))),
      p: skeleton.hips.getWorldPosition(new V()).multiplyScalar(unit),
      feet: feet.map((f) => f.getWorldPosition(new V()).multiplyScalar(unit)),
    });
  }
  return frames;
}

const WATCH = /UpLeg$|^(Left|Right)Leg$|Foot$|^(Left|Right)Arm$|ForeArm$|^Spine$/;
function unlike(names, a, b) {
  let s = 0;
  names.forEach((name, x) => {
    if (WATCH.test(name)) s += a.q[x].angleTo(b.q[x]);
  });
  return s;
}

function findCycle(bones, frames, lo, hi) {
  let best = null;
  for (let a = 0; a + lo < frames.length; a++) {
    for (let L = lo; L <= hi && a + L < frames.length; L++) {
      const u = unlike(bones, frames[a], frames[a + L]);
      if (!best || u < best.u) best = { a, L, u };
    }
  }
  return best;
}

const spread = (d, f) => (f >= 0 ? new Q().slerp(d, f) : new Q().slerp(d.clone().invert(), -f));

/** One seamless cycle: the small end-to-start difference is spread evenly over it. */
function closeCycle(frames, { a, L }) {
  const first = frames[a];
  const last = frames[a + L];
  const dq = first.q.map((q, x) => {
    const d = q.clone().multiply(last.q[x].clone().invert());
    return d.w < 0 ? d.set(-d.x, -d.y, -d.z, -d.w) : d;
  });
  const travel = last.p.clone().sub(first.p);
  const turn = new Q().setFromAxisAngle(new V(0, 1, 0), -Math.atan2(travel.x, travel.z));
  const mid = new V();
  for (let i = 0; i < L; i++) mid.add(frames[a + i].p.clone().addScaledVector(travel, -(i / L)));
  mid.multiplyScalar(1 / L);
  const out = [];
  for (let i = 0; i < L; i++) {
    const f = i / L - 0.5;
    const src = frames[a + i];
    const carry = travel.clone().multiplyScalar(i / L).setY(travel.y * f);
    const place = (p) => p.clone().sub(carry).sub(new V(mid.x, 0, mid.z)).applyQuaternion(turn);
    out.push({
      q: src.q.map((q, x) => {
        const r = spread(dq[x], f).multiply(q);
        return x === 0 ? turn.clone().multiply(r) : r;
      }),
      p: place(src.p),
      feet: src.feet.map(place),
    });
  }
  return { frames: out, distance: Math.hypot(travel.x, travel.z), seconds: L / FPS };
}

const wrap01 = (x) => ((x % 1) + 1) % 1;

/** Which stretch of the cycle each foot holds the floor: low, and moving back with the ground. */
function contacts(cycle, rest) {
  const n = cycle.frames.length;
  const v = cycle.distance / cycle.seconds;
  const sides = {};
  for (const [side, ankle, toe] of [
    ["left", 0, 1],
    ["right", 2, 3],
  ]) {
    const grip = [];
    const ball = [];
    for (let i = 0; i < n; i++) {
      const slip = (k) => {
        const p = cycle.frames[(i + 1) % n].feet[k];
        const m = cycle.frames[(i + n - 1) % n].feet[k];
        return Math.hypot(((p.x - m.x) * FPS) / 2, ((p.z - m.z) * FPS) / 2 + v, ((p.y - m.y) * FPS) / 2);
      };
      const low = (k, spare) => cycle.frames[i].feet[k].y < rest[k] + spare;
      const heelOn = low(ankle, 0.035) && slip(ankle) < 0.45 * v;
      const ballOn = low(toe, 0.025) && slip(toe) < 0.4 * v;
      grip.push(heelOn || ballOn);
      ball.push(ballOn);
    }
    sides[side] = { grip: longestRun(grip), ball: longestRun(ball) };
  }
  return sides;
}

function longestRun(flags) {
  const n = flags.length;
  let best = [0, 0];
  for (let s = 0; s < n; s++) {
    if (!flags[s] || flags[(s + n - 1) % n]) continue;
    let gap = 0;
    let lastOn = s;
    for (let e = s; e < s + n; e++) {
      if (flags[e % n]) {
        lastOn = e;
        gap = 0;
      } else if (++gap > 2) break;
    }
    if (lastOn + 1 - s > best[1] - best[0]) best = [s, lastOn + 1];
  }
  return best.map((x) => x / n);
}

/** Evenly over the cycle, with the left touchdown at 0 and the right at 0.5. */
function resample(cycle, c, samples) {
  const n = cycle.frames.length;
  const start = c.left.grip[0];
  const half = wrap01(c.right.grip[0] - start);
  const src = (phase) => wrap01(start + (phase < 0.5 ? (phase / 0.5) * half : half + ((phase - 0.5) / 0.5) * (1 - half)));
  const inv = (t) => {
    const u = wrap01(t - start);
    return u < half ? (u / half) * 0.5 : 0.5 + ((u - half) / (1 - half)) * 0.5;
  };
  const frames = [];
  for (let i = 0; i < samples; i++) {
    const at = src(i / samples) * n;
    const a = Math.floor(at) % n;
    const b = (a + 1) % n;
    const f = at - Math.floor(at);
    frames.push({
      q: cycle.frames[a].q.map((q, x) => q.clone().slerp(cycle.frames[b].q[x], f)),
      p: cycle.frames[a].p.clone().lerp(cycle.frames[b].p, f),
    });
  }
  const span = ([s, e]) => {
    const a = inv(s);
    const b = inv(e);
    return [a, b <= a ? b + 1 : b].map((x) => +x.toFixed(4));
  };
  const side = (k) => ({ grip: span(c[k].grip), ball: span(c[k].ball) });
  return { frames, half, left: side("left"), right: side("right") };
}

const pack = (values) =>
  Buffer.from(Int16Array.from(values, (x) => Math.max(-32767, Math.min(32767, Math.round(x * 32767)))).buffer).toString("base64");

/** The frames of the steps, for a clip that takes its arms from one. */
const baked = {};
const result = { version: 2, sources: [], skeleton: null, clips: {} };
const gestures = { version: 2, sources: [], clips: {} };
const heights = {};

function read(file, sources = result.sources) {
  const src = load(file);
  const skeleton = skeletonOf(src.root);
  const { bones } = skeleton;
  const metres = bones[0].restP.y > 10 ? 0.01 : 1;
  const names = bones.map((b) => b.name);
  heights[file] = bones[0].restP.y * metres;
  if (!result.skeleton) {
    result.skeleton = {
      bones: names,
      parents: bones.map((b) => b.parent),
      restQ: bones.flatMap((b) => b.restQ.toArray().map((x) => +x.toFixed(6))),
      restP: bones.flatMap((b) => b.restP.clone().multiplyScalar(metres).toArray().map((x) => +x.toFixed(5))),
    };
  }
  const missing = result.skeleton.bones.filter((n) => !names.includes(n));
  if (missing.some((n) => !/Hand(Thumb|Index|Middle|Ring|Pinky)/.test(n))) throw new Error(`${file}: lacks ${missing.join(" ")}`);
  if (!sources.some((s) => s.file === file)) sources.push({ file, sha256: src.sha256, seconds: +src.clip.duration.toFixed(3) });
  // A performer of another size, brought to the stored skeleton's.
  const unit = (metres * result.skeleton.restP[1]) / heights[file];
  const rest = ["LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase"].map((n) => bones.find((b) => b.name === n).restP.y * unit);
  return { frames: sample(src, skeleton, unit, result.skeleton), rest };
}

// ---------------------------------------------------------------- the moves

const at30 = (seconds) => Math.max(2, Math.round(seconds * 30) + 1);
const lerpFrame = (a, b, f) => ({ q: a.q.map((q, x) => q.clone().slerp(b.q[x], f)), p: a.p.clone().lerp(b.p, f) });

/** The frames at even steps from `from` to `to` seconds. */
function cut(frames, from, to, n) {
  return Array.from({ length: n }, (_, i) => {
    const at = Math.min((from + ((to - from) * i) / (n - 1)) * FPS, frames.length - 1.001);
    const a = Math.max(0, Math.floor(at));
    return lerpFrame(frames[a], frames[Math.min(a + 1, frames.length - 1)], at - a);
  });
}

function smooth(values, sigma) {
  const r = Math.ceil(sigma * 3);
  const n = values.length;
  // Past the ends the path goes on straight.
  const at = (i) => (i < 0 ? values[0] + i * (values[1] - values[0]) : i >= n ? values[n - 1] + (i - n + 1) * (values[n - 1] - values[n - 2]) : values[i]);
  return values.map((_, i) => {
    let s = 0;
    let w = 0;
    for (let k = -r; k <= r; k++) {
      const g = Math.exp(-(k * k) / (2 * sigma * sigma));
      s += g * at(i + k);
      w += g;
    }
    return s / w;
  });
}

/** Stretches (0 to 1) where a foot is low and still on the ground. */
function spans(frames, rest, from, to, turning = false) {
  const first = Math.round(from * FPS);
  const last = Math.min(frames.length - 1, Math.round(to * FPS));
  const out = {};
  for (const [side, ankle, toe] of [
    ["left", 0, 1],
    ["right", 2, 3],
  ]) {
    const on = [];
    for (let i = first; i <= last; i++) {
      const a = frames[Math.max(first, i - 1)].feet;
      const b = frames[Math.min(last, i + 1)].feet;
      const still = (k) => a[k].distanceTo(b[k]) * (FPS / 2) < (turning ? 0.5 : 0.55);
      on.push((frames[i].feet[toe].y < rest[toe] + 0.035 && still(toe)) || (!turning && frames[i].feet[ankle].y < rest[ankle] + 0.04 && still(ankle)));
    }
    // A gap of three frames is a flicker, and so is a contact as short.
    const runs = [];
    on.forEach((o, i) => {
      const run = runs.at(-1);
      if (!o) return;
      if (run && i - run[1] <= 3) run[1] = i;
      else runs.push([i, i]);
    });
    const n = last - first;
    out[side] = runs.filter(([s, e]) => e - s >= 3).map(([s, e]) => [+(s / n).toFixed(4), +(e / n).toFixed(4)]);
  }
  return out;
}

/** When both feet are off the floor for longest. */
function airborne(frames, rest, from, to) {
  let best = [0, 0];
  let start = null;
  const last = Math.min(frames.length - 1, Math.round(to * FPS));
  for (let i = Math.round(from * FPS); i <= last + 1; i++) {
    const up = i <= last && [1, 3].every((k) => frames[i].feet[k].y > rest[k] + 0.03) && [0, 2].every((k) => frames[i].feet[k].y > rest[k] + 0.03);
    if (up && start === null) start = i;
    if (!up && start !== null) {
      if (i - start > best[1] - best[0]) best = [start, i];
      start = null;
    }
  }
  return best.map((i) => i / FPS);
}

/** Flesh around the bones a roll goes over (m): how far it reaches from the joint, and from which point beyond it. */
const FLESH = { Head: [0.08, 0.05], Spine2: [0.055, 0], Spine1: [0.055, 0], Spine: [0.055, 0], Hips: [0.065, 0], Arm: [0.06, 0], ForeArm: [0.045, 0], Hand: [0.03, 0], UpLeg: [0.085, -0.2], Leg: [0.055, 0] };

/** How far each frame has to rise for nothing but the feet to be under the floor. */
function riseClear(frames, rise, skeleton) {
  const { bones, parents } = skeleton;
  const restQ = bones.map((_, x) => new Q().fromArray(skeleton.restQ, x * 4));
  const restP = bones.map((_, x) => new V().fromArray(skeleton.restP, x * 3));
  const under = frames.map((f, i) => {
    const q = [];
    const at = [];
    let low = 0;
    bones.forEach((name, x) => {
      const up = parents[x];
      q[x] = up < 0 ? f.q[x].clone() : q[up].clone().multiply(f.q[x]);
      at[x] = up < 0 ? f.p.clone() : restP[x].clone().sub(restP[up]).applyQuaternion(restQ[up].clone().invert()).applyQuaternion(q[up]).add(at[up]);
      const flesh = FLESH[name.replace(/^(Left|Right)/, "")];
      if (!flesh) return;
      const beyond = new V(0, flesh[1], 0).applyQuaternion(restQ[x].clone().invert()).applyQuaternion(q[x]);
      low = Math.min(low, at[x].y + beyond.y - flesh[0]);
    });
    return -low;
  });
  const widest = under.map((_, i) => Math.max(...under.slice(Math.max(0, i - rise), i + rise + 1)));
  return smooth(widest, rise / 2);
}

/** Which way the hips face, going on past a half turn. */
function facing(frames, skeleton) {
  const restBack = new Q().fromArray(skeleton.restQ, 0).invert();
  let last = 0;
  return frames.map((f, i) => {
    const ahead = new V(0, 0, 1).applyQuaternion(f.q[0].clone().multiply(restBack));
    const yaw = Math.atan2(ahead.x, ahead.z);
    last = i ? last + Math.atan2(Math.sin(yaw - last), Math.cos(yaw - last)) : yaw;
    return last;
  });
}

/** A bone's rotation on the body's own floor, up the bones it hangs from. */
function onFloor(q, parents, x) {
  const out = q[x].clone();
  for (let p = parents[x]; p >= 0; p = parents[p]) out.premultiply(q[p]);
  return out;
}

/**
 * A pose with another's arms, or only its arm on one side. The upper arms hang
 * as they do over there, not as far round as the trunk leans here; everything
 * below them comes along as it is.
 */
function withArms(q, from, { bones, parents }, side = "") {
  const mine = (name) => name.startsWith(side);
  const out = q.map((r, x) => (ARMS.test(bones[x]) && mine(bones[x]) ? from[x].clone() : r));
  bones.forEach((name, x) => {
    if (UPPER_ARM.test(name) && mine(name)) out[x] = onFloor(out, parents, parents[x]).invert().multiply(onFloor(from, parents, x));
  });
  return out;
}

/** A step's pose at some share of its cycle. */
function stepPose(name, share) {
  const frames = baked[name];
  const at = share * frames.length;
  const k = Math.floor(at);
  return frames[k].q.map((q, x) => q.clone().slerp(frames[(k + 1) % frames.length].q[x], at - k));
}

/** A step's pose with arms between two other steps' at the same place in their cycles. */
function withStepArms(q, share, { from, toward, by }, skeleton) {
  const other = withArms(q, stepPose(toward, share), skeleton);
  return withArms(q, stepPose(from, share), skeleton).map((r, x) => r.slerp(other[x], by));
}

/** A pose as a mirror shows it. */
function mirrored(q, { bones, parents, restQ }) {
  const rest = bones.map((_, x) => new Q().fromArray(restQ, x * 4));
  const across = bones.map((name) => {
    const other = name.startsWith("Left") ? `Right${name.slice(4)}` : name.startsWith("Right") ? `Left${name.slice(5)}` : name;
    return bones.indexOf(other);
  });
  const world = bones.map((_, x) => {
    const there = across[x] < 0 ? x : across[x];
    const t = onFloor(q, parents, there).multiply(rest[there].clone().invert());
    return new Q(t.x, -t.y, -t.z, t.w).multiply(rest[x]);
  });
  return bones.map((_, x) => (parents[x] < 0 ? world[x] : world[parents[x]].clone().invert().multiply(world[x])));
}

/** The middle of a step's cycle, where its arms are when they swing neither way. */
function middlePose(name) {
  const frames = baked[name];
  return frames[0].q.map((first, x) => {
    const sum = new Q(0, 0, 0, 0);
    for (const { q } of frames) {
      const sign = Math.sign(q[x].dot(first)) || 1;
      sum.set(sum.x + sign * q[x].x, sum.y + sign * q[x].y, sum.z + sign * q[x].z, sum.w + sign * q[x].w);
    }
    return sum.normalize();
  });
}

/** Frames with their arms between the middle of a step's and another clip's, or this clip's own free arm on both sides. */
function withRestArms(frames, { middle, toward, free, by }, skeleton) {
  const held = middlePose(middle);
  return frames.map((f, i) => {
    const other = free
      ? withArms(f.q, mirrored(f.q, skeleton), skeleton, free === "Right" ? "Left" : "Right")
      : withArms(f.q, stepPose(toward, i / frames.length), skeleton);
    return { ...f, q: withArms(f.q, held, skeleton).map((r, x) => r.slerp(other[x], by)) };
  });
}

/** A step halfway to its own mirror half a cycle on: the same on both sides. */
function evened(frames, skeleton) {
  const n = frames.length;
  const mirrors = frames.map((f) => mirrored(f.q, skeleton));
  return frames.map((f, i) => ({ ...f, q: f.q.map((q, x) => q.clone().slerp(mirrors[(i + n / 2) % n][x], 0.5)) }));
}

/** A turn: the pose stands on a root that faces and goes where the body does, and the root's way is kept beside it. */
function bakeTurn(spec, frames, rest, from, to, skeleton) {
  const seconds = to - from;
  const n = Math.round(seconds * FPS) + 1;
  const cutFrames = cut(frames, from, to, n);
  // The sway of the hips within a step stays in the pose.
  const yaw = smooth(facing(cutFrames, skeleton), 3);
  const x = smooth(cutFrames.map((f) => f.p.x), 3);
  const z = smooth(cutFrames.map((f) => f.p.z), 3);
  const [yaw0, x0, z0] = [yaw[0], x[0], z[0]];
  const upright = (angle) => new Q().setFromAxisAngle(new V(0, 1, 0), angle);
  const toStart = upright(-yaw0);
  const way = x.map((_, i) => new V(x[i] - x0, 0, z[i] - z0).applyQuaternion(toStart));
  let out = cutFrames.map((f, i) => {
    const back = upright(-yaw[i]);
    return {
      q: f.q.map((r, b) => (b === 0 ? back.clone().multiply(r) : r)),
      p: f.p.clone().sub(new V(x[i], 0, z[i])).applyQuaternion(back),
    };
  });
  if (spec.arms) out = withRestArms(out, spec.arms, skeleton);
  // A turning foot hardly leaves the floor and opens about its heel: it stands while its ball is still.
  const down = spans(frames, rest, from, to, true);
  const turned = ((yaw[n - 1] - yaw0) * 180) / Math.PI;
  const pace = (i) => way[Math.min(n - 1, i + 1)].clone().sub(way[Math.max(0, i - 1)]).length() * (FPS / 2) * (i === 0 || i === n - 1 ? 2 : 1);
  console.log(
    spec.name.padEnd(10),
    `${seconds.toFixed(2)} s turns ${turned.toFixed(0)} deg, in at ${pace(0).toFixed(2)} out at ${pace(n - 1).toFixed(2)} m/s, hips ${Math.min(...out.map((f) => f.p.y)).toFixed(2)} to ${Math.max(...out.map((f) => f.p.y)).toFixed(2)}`,
    `L ${JSON.stringify(down.left)} R ${JSON.stringify(down.right)}`,
  );
  const round = (values) => values.map((v) => +v.toFixed(4));
  return {
    samples: n,
    seconds: +seconds.toFixed(4),
    distance: 0,
    down,
    way: { yaw: round(yaw.map((a) => a - yaw0)), x: round(way.map((p) => p.x)), z: round(way.map((p) => p.z)) },
    q: pack(out.flatMap((f) => f.q.flatMap((q) => q.toArray()))),
    p: out.flatMap((f) => f.p.toArray().map((v) => +v.toFixed(5))),
  };
}

function bakeMove(spec, sources, skeleton) {
  const { frames, rest } = read(spec.file, sources);
  const length = frames.length / FPS;
  const { from = 0, to = length, loop = false } = spec;
  const seconds = to - from;
  if (spec.turn) return bakeTurn(spec, frames, rest, from, to, skeleton);
  let n = at30(seconds);
  let cutFrames = cut(frames, from, to, n);
  const start = cutFrames[0].p.clone();
  const gone = cutFrames[n - 1].p.clone().sub(start);
  const turn = new Q().setFromAxisAngle(new V(0, 1, 0), spec.travel ? -Math.atan2(gone.x, gone.z) : 0);
  cutFrames = cutFrames.map((f) => ({
    q: f.q.map((q, x) => (x === 0 ? turn.clone().multiply(q) : q)),
    p: f.p.clone().sub(new V(start.x, 0, start.z)).applyQuaternion(turn),
  }));
  const end = cutFrames[n - 1].p;
  const out = { seconds: +seconds.toFixed(4), distance: 0 };
  let path = cutFrames.map(() => 0);
  if (spec.travel) {
    path = smooth(cutFrames.map((f) => f.p.z), 2.4);
    const zero = path[0];
    path = path.map((z) => z - zero);
    out.distance = +path[n - 1].toFixed(4);
    out.travel = path.map((z) => +z.toFixed(4));
  }
  const drift = (i) => new V(end.x * (i / (n - 1)), 0, spec.travel ? path[i] : end.z * (i / (n - 1)));
  let p = cutFrames.map((f, i) => f.p.clone().sub(drift(i)));
  if (!spec.travel) {
    // In place: the root stands under the middle of the hips' wander at its start.
    p = p.map((x) => x.setX(x.x).setZ(x.z));
  }
  if (spec.air) {
    const [up, down] = airborne(frames, rest, from, to);
    const u0 = (up - from) / seconds;
    const u1 = (down - from) / seconds;
    const rise = (G * (down - up) ** 2) / 8;
    p = p.map((x, i) => {
      const u = (i / (n - 1) - u0) / (u1 - u0);
      return u > 0 && u < 1 ? x.setY(x.y - 4 * rise * u * (1 - u)) : x;
    });
    out.air = [+u0.toFixed(4), +u1.toFixed(4)];
  }
  if (spec.clear) {
    // Goes over the floor, not through it.
    const lift = riseClear(cutFrames, 2, skeleton);
    console.log(spec.name, "lifted", lift.map((x) => Math.round(x * 100)).join(" "));
    p = p.map((x, i) => x.setY(x.y + lift[i]));
  }
  if (!spec.floating) out.down = spans(frames, rest, from, to);
  if (loop) {
    // Spread the small end-to-start difference, and leave the repeated frame out.
    const dq = cutFrames[0].q.map((q, x) => {
      const d = q.clone().multiply(cutFrames[n - 1].q[x].clone().invert());
      return d.w < 0 ? d.set(-d.x, -d.y, -d.z, -d.w) : d;
    });
    const dy = p[0].y - p[n - 1].y;
    cutFrames = cutFrames.map((f, i) => ({ ...f, q: f.q.map((q, x) => spread(dq[x], i / (n - 1) - 0.5).multiply(q)) }));
    p = p.map((x, i) => x.setY(x.y + dy * (i / (n - 1) - 0.5)));
    n -= 1;
    cutFrames.length = n;
    p.length = n;
    out.loop = true;
    delete out.down;
  }
  console.log(
    spec.name.padEnd(10),
    `${seconds.toFixed(2)} s ${out.distance} m hips ${Math.min(...p.map((x) => x.y)).toFixed(2)} to ${Math.max(...p.map((x) => x.y)).toFixed(2)}`,
    `wander ${Math.max(...p.map((x) => Math.abs(x.x))).toFixed(2)} ${Math.max(...p.map((x) => Math.abs(x.z))).toFixed(2)} drift ${end.x.toFixed(2)}`,
    spec.air ? `air ${out.air.map((u) => (from + u * seconds).toFixed(2))}` : "",
    out.down ? `L ${JSON.stringify(out.down.left)} R ${JSON.stringify(out.down.right)}` : "",
  );
  return { samples: n, ...out, q: pack(cutFrames.flatMap((f) => f.q.flatMap((q) => q.toArray()))), p: p.flatMap((x) => x.toArray().map((v) => +v.toFixed(5))) };
}

// ------------------------------------------------------------------ the bake

for (const spec of STEPS) {
  const { frames, rest } = read(spec.file);
  const found = findCycle(result.skeleton.bones, frames, Math.round(spec.cycle[0] * FPS), Math.round(spec.cycle[1] * FPS));
  const cycle = closeCycle(frames, found);
  const r = resample(cycle, contacts(cycle, rest), spec.samples);
  if (spec.even) r.frames = evened(r.frames, result.skeleton);
  if (spec.arms) r.frames.forEach((f, i) => (f.q = withStepArms(f.q, i / spec.samples, spec.arms, result.skeleton)));
  baked[spec.name] = r.frames;
  if (spec.armsOnly) continue;
  result.clips[spec.name] = {
    samples: spec.samples,
    seconds: +cycle.seconds.toFixed(4),
    distance: +cycle.distance.toFixed(4),
    loop: true,
    left: r.left,
    right: r.right,
    q: pack(r.frames.flatMap((f) => f.q.flatMap((q) => q.toArray()))),
    p: r.frames.flatMap((f) => f.p.toArray().map((x) => +x.toFixed(5))),
  };
  console.log(
    spec.name,
    `${frames.length} frames, cycle ${cycle.seconds.toFixed(3)} s from ${found.a}, seam ${found.u.toFixed(2)} rad,`,
    `${cycle.distance.toFixed(3)} m, ${(cycle.distance / cycle.seconds).toFixed(2)} m/s, right at ${r.half.toFixed(3)}`,
    `left ${JSON.stringify(r.left)} right ${JSON.stringify(r.right)}`,
  );
}
for (const spec of IDLES) {
  let { frames } = read(spec.file);
  const L = frames.length - 1;
  const seam = unlike(result.skeleton.bones, frames[0], frames[L]);
  // closeCycle turns travel onto +Z, and an idle has none: its own facing stays.
  const still = frames.map((f) => ({ ...f, p: f.p.clone() }));
  const gone = still[L].p.clone().sub(still[0].p);
  const mid = new V();
  for (let i = 0; i < L; i++) mid.add(still[i].p.clone().addScaledVector(gone, -i / L));
  mid.multiplyScalar(1 / L);
  const dq = still[0].q.map((q, x) => {
    const d = q.clone().multiply(still[L].q[x].clone().invert());
    return d.w < 0 ? d.set(-d.x, -d.y, -d.z, -d.w) : d;
  });
  const closed = still.slice(0, L).map((f, i) => ({
    q: f.q.map((q, x) => spread(dq[x], i / L - 0.5).multiply(q)),
    p: f.p.clone().addScaledVector(gone, -i / L).sub(new V(mid.x, 0, mid.z)),
  }));
  const n = Math.round((L / FPS) * spec.fps);
  let even = Array.from({ length: n }, (_, i) => {
    const at = (i / n) * L;
    const a = Math.floor(at);
    return lerpFrame(closed[a], closed[(a + 1) % L], at - a);
  });
  if (spec.calm) {
    // The frame most like all the others, held, with the clip blended over it at `calm`.
    const away = (f) => even.reduce((s, g) => s + unlike(result.skeleton.bones, f, g) + f.p.distanceTo(g.p), 0);
    const held = even.reduce((best, f) => (away(f) < away(best) ? f : best));
    even = even.map((f) => lerpFrame(held, f, spec.calm));
  }
  if (spec.ahead) {
    // Recorded facing some other way: round to +Z.
    const round = facing(even, result.skeleton);
    const turn = new Q().setFromAxisAngle(new V(0, 1, 0), -round.reduce((s, a) => s + a / round.length, 0));
    even = even.map((f) => ({ q: f.q.map((q, x) => (x === 0 ? turn.clone().multiply(q) : q)), p: f.p.applyQuaternion(turn) }));
  }
  if (spec.arms) even = withRestArms(even, spec.arms, result.skeleton);
  baked[spec.name] = even;
  result.clips[spec.name] = {
    samples: n,
    seconds: +(L / FPS).toFixed(4),
    distance: 0,
    loop: true,
    q: pack(even.flatMap((f) => f.q.flatMap((q) => q.toArray()))),
    p: even.flatMap((f) => f.p.toArray().map((x) => +x.toFixed(5))),
  };
  console.log(spec.name, `${(L / FPS).toFixed(2)} s, seam ${seam.toFixed(2)} rad, hips ${mid.y.toFixed(2)}, sways ${Math.max(...even.map((f) => Math.abs(f.p.x))).toFixed(3)} m`);
}
for (const spec of MOVES) result.clips[spec.name] = bakeMove(spec, result.sources, result.skeleton);
for (const spec of GESTURES) gestures.clips[spec.name] = bakeMove(spec, gestures.sources, result.skeleton);

for (const [file, data] of [
  ["gait-clips.json", result],
  ["gait-gestures.json", gestures],
]) {
  const text = `${JSON.stringify(data)}\n`;
  writeFileSync(path.join(HOME, file), text);
  console.log(file, Math.round(text.length / 1024), "KB");
}
