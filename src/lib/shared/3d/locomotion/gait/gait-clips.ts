/**
 * The clips the GaitAnimator plays, as baked by `scripts/gait/bake-gait-clips.mjs`.
 *
 * Every step clip is one cycle with the left touchdown at phase 0 and the
 * right at 0.5, so any two of them can be blended at the same phase. An idle
 * is a loop in place. A move is played once, along the path stored beside it.
 */
import { mirrorClip } from "./gait-mirror";

export type GaitSide = "left" | "right";
export type GaitName = "walk" | "run" | "crouchWalk" | "crouchRun";
export type IdleName = "stand" | "crouch";
export type TurnName = "turnStand" | "turnWalk" | "turnRun" | "turnCrouch";
export type MoveName = "jump" | "leap" | "fall" | "landRun" | "landHard" | "slide" | "roll" | "rollStand" | TurnName;
export type GestureName = "wave" | "point" | "clap" | "bow" | "cheer";

/** Moves that start from a stride or go to one side, so they need a version for either. */
export const SIDED_MOVES: readonly MoveName[] = ["leap", "landRun", "slide", "roll", "turnStand", "turnWalk", "turnRun", "turnCrouch"];

/** A stretch of the clip, 0 to 1; in a cycle the end may pass 1 when it wraps. */
export type PhaseSpan = readonly [number, number];

export interface GaitContact {
  /** Any part of the foot holding the floor. */
  grip: PhaseSpan;
  /** The ball of the foot holding the floor. */
  ball: PhaseSpan;
}

/** A turn's way over the floor, a number a sample, from standing at nought facing +z. */
export interface Way<T = Float32Array> {
  /** Which way it faces (rad, positive to its left), going on past a half turn. */
  yaw: T;
  /** Where it is (m). */
  x: T;
  z: T;
}

export interface GaitClip {
  samples: number;
  /** Once through at the clip's own pace (s). */
  seconds: number;
  /** Ground covered once through by the clip's own performer (m). */
  distance: number;
  /** Whether its end runs into its start. */
  loop: boolean;
  left?: GaitContact;
  right?: GaitContact;
  /** A move: how far it has travelled at each sample (m). */
  travel?: Float32Array;
  /** A turn: which way it faces and where it gets to. The pose is the one seen from there. */
  way?: Way;
  /** A move: when each foot stands on the floor. */
  down?: Record<GaitSide, PhaseSpan[]>;
  /** A jump: when it leaves the floor and when it meets it again. Its arc is taken out. */
  air?: PhaseSpan;
  /** samples x bones x 4: local rotations, except the hips' which are the figure's. */
  q: Float32Array;
  /** samples x 3: the hips, with the travel taken out (m). */
  p: Float32Array;
}

export interface GaitSkeleton {
  bones: string[];
  parents: number[];
  /** Rest rotation of each bone in the figure's space, 4 numbers each. */
  restQ: number[];
  /** Rest position of each bone in the figure's space (m), 3 numbers each. */
  restP: number[];
}

export interface GaitClipSet extends Record<GaitName | IdleName, GaitClip> {
  skeleton: GaitSkeleton;
  moves: Record<MoveName, GaitClip>;
  /** The sided moves, left for right. */
  mirrored: Partial<Record<MoveName, GaitClip>>;
}

export type GestureSet = Record<GestureName, GaitClip>;

interface BakedClip {
  samples: number;
  seconds: number;
  distance: number;
  loop?: boolean;
  left?: GaitContact;
  right?: GaitContact;
  travel?: number[];
  way?: Way<number[]>;
  down?: Record<GaitSide, PhaseSpan[]>;
  air?: PhaseSpan;
  q: string;
  p: number[];
}

export interface BakedGaitClips {
  version: number;
  skeleton: GaitSkeleton;
  clips: Record<GaitName | IdleName | MoveName, BakedClip>;
}

export interface BakedGestures {
  version: number;
  clips: Record<GestureName, BakedClip>;
}

export const GAIT_CLIPS_URL = "/animations/gait/gait-clips.json";
export const GAIT_GESTURES_URL = "/animations/gait/gait-gestures.json";

function unpack(base64: string): Float32Array {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const ints = new Int16Array(bytes.buffer);
  return Float32Array.from(ints, (x) => x / 32767);
}

function decode(c: BakedClip): GaitClip {
  return {
    samples: c.samples,
    seconds: c.seconds,
    distance: c.distance,
    loop: c.loop ?? false,
    left: c.left,
    right: c.right,
    travel: c.travel && Float32Array.from(c.travel),
    way: c.way && { yaw: Float32Array.from(c.way.yaw), x: Float32Array.from(c.way.x), z: Float32Array.from(c.way.z) },
    down: c.down,
    air: c.air,
    q: unpack(c.q),
    p: Float32Array.from(c.p),
  };
}

export function decodeGaitClips(baked: BakedGaitClips): GaitClipSet {
  const { skeleton, clips } = baked;
  const { walk, run, crouchWalk, crouchRun, stand, crouch, ...rest } = clips;
  const moves = Object.fromEntries(Object.entries(rest).map(([name, c]) => [name, decode(c)])) as Record<MoveName, GaitClip>;
  return {
    skeleton,
    walk: decode(walk),
    run: decode(run),
    crouchWalk: decode(crouchWalk),
    crouchRun: decode(crouchRun),
    stand: decode(stand),
    crouch: decode(crouch),
    moves,
    mirrored: Object.fromEntries(SIDED_MOVES.map((name) => [name, mirrorClip(skeleton, moves[name])])),
  };
}

export function decodeGestures(baked: BakedGestures): GestureSet {
  return Object.fromEntries(Object.entries(baked.clips).map(([name, c]) => [name, decode(c)])) as GestureSet;
}

/** Fetched once for the whole page; a failed fetch is tried again next time. */
function once<T>(url: string, read: (json: unknown) => T): () => Promise<T> {
  let loading: Promise<T> | null = null;
  return () => {
    loading ??= fetch(url)
      .then(async (response) => {
        if (!response.ok) throw new Error(`${url}: ${response.status}`);
        return read(await response.json());
      })
      .catch((error: unknown) => {
        loading = null;
        throw error;
      });
    return loading;
  };
}

export const loadGaitClips = once(GAIT_CLIPS_URL, (json) => decodeGaitClips(json as BakedGaitClips));
export const loadGaitGestures = once(GAIT_GESTURES_URL, (json) => decodeGestures(json as BakedGestures));

const wrap01 = (x: number) => x - Math.floor(x);

/** Whether `phase` falls inside a span that may wrap past 1. */
export function inSpan(phase: number, [start, end]: PhaseSpan): boolean {
  return wrap01(phase - start) < end - start;
}

/** Whether a place in a move falls inside a span of it. */
export const within = (at: number, [start, end]: PhaseSpan): boolean => at >= start && at <= end;
