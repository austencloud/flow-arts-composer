/**
 * A whole pose, how clips are read into one, and how one source of poses hands
 * over to another.
 *
 * The hand-over keeps what the body was doing and lets it go: the difference
 * from the new source, and the difference in speed, are added to it and fade.
 * Nothing is played twice and no bone jumps.
 */
import { Quaternion, Vector3 } from "three";
import type { GaitClip } from "./gait-clips";

/** One clip's share of a pose. */
export interface Part {
  clip: GaitClip;
  weight: number;
  /** Its share of the arms, where that is another. */
  arms?: number;
  /** How far the clip's soles sit above the floor on this body (m). */
  floor: number;
  /** Where in the clip, 0 to 1, and how fast that moves (1/s). */
  at: number;
  rate: number;
}

/** Where a clip puts one foot on a body, relative to the body's root. */
export interface Track {
  samples: number;
  loop: boolean;
  ankle: Float32Array;
  turn: Float32Array;
}

export interface Pose {
  /** Each bone of the clips' skeleton, in its parent; the hips' in the figure. */
  q: Quaternion[];
  /** The hips, and each ankle's place and turn, relative to the body's root (m). */
  hips: Vector3;
  ankle: [Vector3, Vector3];
  turn: [Quaternion, Quaternion];
}

export function makePose(bones: number): Pose {
  return {
    q: Array.from({ length: bones }, () => new Quaternion()),
    hips: new Vector3(),
    ankle: [new Vector3(), new Vector3()],
    turn: [new Quaternion(), new Quaternion()],
  };
}

export function copyPose(from: Pose, into: Pose): void {
  from.q.forEach((q, i) => into.q[i]!.copy(q));
  into.hips.copy(from.hips);
  for (const k of [0, 1] as const) {
    into.ankle[k].copy(from.ankle[k]);
    into.turn[k].copy(from.turn[k]);
  }
}

const wrap01 = (x: number) => x - Math.floor(x);

// The two samples around a place in a clip, and how far between them.
let sampleA = 0;
let sampleB = 0;
let between = 0;

function locate(samples: number, loop: boolean, at: number): void {
  const x = loop ? wrap01(at) * samples : Math.max(0, Math.min(1, at)) * (samples - 1);
  const floor = Math.floor(x);
  sampleA = loop ? floor % samples : Math.min(floor, samples - 1);
  sampleB = loop ? (sampleA + 1) % samples : Math.min(sampleA + 1, samples - 1);
  between = x - floor;
}

export function samplePlace(clip: GaitClip, at: number, into: Vector3): Vector3 {
  locate(clip.samples, clip.loop, at);
  return into.fromArray(clip.p, sampleA * 3).lerp(other.fromArray(clip.p, sampleB * 3), between);
}

export function sampleTurn(clip: GaitClip, at: number, bone: number, bones: number, into: Quaternion): Quaternion {
  locate(clip.samples, clip.loop, at);
  return nlerp(clip.q, (sampleA * bones + bone) * 4, (sampleB * bones + bone) * 4, between, into);
}

export function trackPlace(track: Track, at: number, into: Vector3): Vector3 {
  locate(track.samples, track.loop, at);
  return into.fromArray(track.ankle, sampleA * 3).lerp(other.fromArray(track.ankle, sampleB * 3), between);
}

export function trackTurn(track: Track, at: number, into: Quaternion): Quaternion {
  locate(track.samples, track.loop, at);
  return nlerp(track.turn, sampleA * 4, sampleB * 4, between, into);
}

/** How far a move has gone at a place in it (m). */
export function sampleTravel(clip: GaitClip, at: number): number {
  if (!clip.travel) return 0;
  locate(clip.samples, clip.loop, at);
  return clip.travel[sampleA]! * (1 - between) + clip.travel[sampleB]! * between;
}

/** Which way a turn faces (rad) and where it is (m) at a place in it. */
export function sampleWay(clip: GaitClip, at: number, into: { yaw: number; x: number; z: number }): typeof into {
  const { yaw, x, z } = clip.way!;
  locate(clip.samples, clip.loop, at);
  const read = (track: Float32Array) => track[sampleA]! * (1 - between) + track[sampleB]! * between;
  into.yaw = read(yaw);
  into.x = read(x);
  into.z = read(z);
  return into;
}

function nlerp(q: Float32Array, i: number, j: number, t: number, into: Quaternion): Quaternion {
  const s = q[i]! * q[j]! + q[i + 1]! * q[j + 1]! + q[i + 2]! * q[j + 2]! + q[i + 3]! * q[j + 3]! < 0 ? -t : t;
  const r = 1 - t;
  return into.set(q[i]! * r + q[j]! * s, q[i + 1]! * r + q[j + 1]! * s, q[i + 2]! * r + q[j + 2]! * s, q[i + 3]! * r + q[j + 3]! * s).normalize();
}

/** Add a weighted rotation into a running sum, on the sum's side of the sphere. */
export function addTurn(sum: Quaternion, q: Quaternion, weight: number): void {
  const s = sum.x * q.x + sum.y * q.y + sum.z * q.z + sum.w * q.w < 0 ? -weight : weight;
  sum.set(sum.x + q.x * s, sum.y + q.y * s, sum.z + q.z * s, sum.w + q.w * s);
}

/** Turn a rotation part of the way to another, the short way round. */
export function turnToward(q: Quaternion, to: Quaternion, share: number): void {
  const s = q.x * to.x + q.y * to.y + q.z * to.z + q.w * to.w < 0 ? -share : share;
  const r = 1 - share;
  q.set(q.x * r + to.x * s, q.y * r + to.y * s, q.z * r + to.z * s, q.w * r + to.w * s).normalize();
}

function rotationVector(q: Quaternion, into: Vector3): Vector3 {
  const s = q.w < 0 ? -1 : 1;
  const n = Math.hypot(q.x, q.y, q.z);
  const k = n < 1e-7 ? 2 * s : (2 * s * Math.atan2(n, q.w * s)) / n;
  return into.set(q.x * k, q.y * k, q.z * k);
}

function turnBy(q: Quaternion, x: number, y: number, z: number): void {
  const a = Math.hypot(x, y, z);
  if (a < 1e-7) return;
  const s = Math.sin(a / 2) / a;
  q.premultiply(step.set(x * s, y * s, z * s, Math.cos(a / 2)));
}

/** How fast the fading difference may move at the hand-over (rad/s and m/s). */
const TURN_SPEED = 25;
const PLACE_SPEED = 9;

/** The numbers one pose differs from another by: a rotation vector a bone, then hips and feet. */
export function poseDifference(a: Pose, b: Pose, into: Float64Array): Float64Array {
  let n = 0;
  const put = (v: Vector3) => {
    into[n++] = v.x;
    into[n++] = v.y;
    into[n++] = v.z;
  };
  a.q.forEach((q, i) => put(rotationVector(gap.copy(b.q[i]!).invert().premultiply(q), vector)));
  put(vector.subVectors(a.hips, b.hips));
  for (const k of [0, 1] as const) {
    put(vector.subVectors(a.ankle[k], b.ankle[k]));
    put(rotationVector(gap.copy(b.turn[k]).invert().premultiply(a.turn[k]), vector));
  }
  return into;
}

export const poseNumbers = (bones: number) => bones * 3 + 3 + 12;
/** Where the hips' height sits among those numbers. */
export const hipsHeight = (bones: number) => bones * 3 + 1;

export class PoseInertia {
  private readonly x: Float64Array;
  private readonly v: Float64Array;
  private half = 0.08;
  private left = 0;

  constructor(private readonly bones: number) {
    this.x = new Float64Array(poseNumbers(bones));
    this.v = new Float64Array(poseNumbers(bones));
  }

  clear(): void {
    this.left = 0;
  }

  /** `last` was drawn, `next` is the new source at that same moment; with how fast each is changing, per second. */
  start(last: Pose, lastRate: Float64Array, next: Pose, nextRate: Float64Array, half: number): void {
    poseDifference(last, next, this.x);
    const places = this.bones * 3;
    for (let i = 0; i < this.v.length; i++) {
      const turn = i < places || (i >= places + 6 && (i - places - 3) % 6 >= 3);
      const most = turn ? TURN_SPEED : PLACE_SPEED;
      this.v[i] = Math.max(-most, Math.min(most, lastRate[i]! - nextRate[i]!));
    }
    this.half = half;
    this.left = half * 9;
  }

  apply(pose: Pose, dt: number): void {
    if (this.left <= 0) return;
    this.left -= dt;
    const { x, v } = this;
    const y = (2 * Math.LN2) / this.half;
    const e = Math.exp(-y * dt);
    for (let i = 0; i < x.length; i++) {
      const j = v[i]! + x[i]! * y;
      x[i] = e * (x[i]! + j * dt);
      v[i] = e * (v[i]! - j * y * dt);
    }
    let n = 0;
    for (const q of pose.q) {
      turnBy(q, x[n]!, x[n + 1]!, x[n + 2]!);
      n += 3;
    }
    const move = (p: Vector3) => {
      p.x += x[n]!;
      p.y += x[n + 1]!;
      p.z += x[n + 2]!;
      n += 3;
    };
    move(pose.hips);
    for (const k of [0, 1] as const) {
      move(pose.ankle[k]);
      turnBy(pose.turn[k], x[n]!, x[n + 1]!, x[n + 2]!);
      n += 3;
    }
  }
}

const other = new Vector3();
const vector = new Vector3();
const gap = new Quaternion();
const step = new Quaternion();
