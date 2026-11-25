/**
 * One loaded body, seen the way the clips see a body: how their rotations go
 * onto its bones, how big it is, where its feet rest, and where each clip puts
 * those feet on it.
 */
import { Matrix4, Object3D, Quaternion, Vector3 } from "three";
import { within, type GaitClip, type GaitSide, type GaitSkeleton } from "./gait-clips";
import { samplePlace, sampleTurn, type Pose, type Track } from "./gait-pose";

/** A leg is never drawn straighter than this share of its length. */
const REACH = 0.9992;
/** Samples a step is measured at. */
const STEP_SAMPLES = 96;
const STANDING_SHARE = 0.08;

export interface Leg {
  side: GaitSide;
  thigh: Object3D;
  shin: Object3D;
  ankle: Object3D;
  toe: Object3D;
  /** The way the knee hinges, in the thigh's own frame: turning about it bends the knee. */
  hinge: Vector3;
  /** How the foot is turned at rest, in the body's frame. */
  turnRest: Quaternion;
  ankleRest: number;
  toeRest: number;
  legLength: number;
}

/** How one clip sits on this body. */
export interface ClipFit {
  /** How far its soles are above the floor (m). */
  floor: number;
  tracks: [Track, Track];
  /** A step clip: the ground one cycle covers (m), and when the feet pass each other. */
  stride: number;
  passing: Record<GaitSide, number>;
}

interface Binding {
  node: Object3D;
  /** Left and right factors that carry a source rotation onto this bone. */
  pre: Quaternion;
  post: Quaternion;
}

interface Seen {
  toe: Vector3;
  ankle: Vector3;
  turn: Quaternion;
  sole: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const wrap01 = (x: number) => x - Math.floor(x);

export class GaitRig {
  /** Where the body is and faces, in metres: its root without the root's scale. */
  readonly frame = new Matrix4();
  readonly frameTurn = new Quaternion();
  readonly legs: [Leg, Leg];
  readonly spine: Object3D[];
  readonly scale: number;

  private readonly bones: Array<Binding | null> = [];
  private readonly hips: Object3D;
  private readonly hipsRest = new Vector3();
  /** The rest pose as the body came. */
  private readonly rest = new Map<Object3D, { q: Quaternion; p: Vector3 }>();
  /** Every node from the hips down to the toes, parents first. */
  private readonly chain: Object3D[] = [];
  private readonly fits = new Map<GaitClip, ClipFit>();

  /** Null if the body has no such skeleton. It has to be standing in its rest pose. */
  static on(root: Object3D, skeleton: GaitSkeleton): GaitRig | null {
    const named = new Map<string, Object3D>();
    root.traverse((node) => {
      const name = node.name.replace(/^mixamorig\d*[:_]?/i, "").replace(/[:.]/g, "");
      if (!named.has(name)) named.set(name, node);
    });
    const need = ["Hips", "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase", "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase"];
    return need.every((n) => named.has(n)) ? new GaitRig(root, skeleton, named) : null;
  }

  private constructor(
    readonly root: Object3D,
    private readonly skeleton: GaitSkeleton,
    named: Map<string, Object3D>,
  ) {
    this.see();
    const toRoot = this.frame.clone().invert();
    const rootTurn = this.frameTurn.clone().invert();
    const turnOf = (node: Object3D) => rootTurn.clone().multiply(node.getWorldQuaternion(new Quaternion()));
    const placeOf = (node: Object3D) => node.getWorldPosition(new Vector3()).applyMatrix4(toRoot);
    const srcTurn = (i: number) => new Quaternion().fromArray(skeleton.restQ, i * 4);
    const srcPlace = (i: number) => new Vector3().fromArray(skeleton.restP, i * 3);
    const at = (name: string) => skeleton.bones.indexOf(name);

    // Where a limb's rest direction differs (an A-pose body), turn it onto the clips' own.
    const next: Record<string, string> = { UpLeg: "Leg", Leg: "Foot", Arm: "ForeArm", ForeArm: "Hand" };
    const align = (name: string): Quaternion => {
      const limb = /^(Left|Right)(UpLeg|Leg|Arm|ForeArm)$/.exec(name);
      const child = limb && limb[1]! + next[limb[2]!];
      if (!child || !named.has(child) || at(child) < 0) return new Quaternion();
      const ours = placeOf(named.get(child)!).sub(placeOf(named.get(name)!)).normalize();
      const theirs = srcPlace(at(child)).sub(srcPlace(at(name))).normalize();
      return new Quaternion().setFromUnitVectors(ours, theirs);
    };
    const carry = skeleton.bones.map((name, i) => {
      const node = named.get(name);
      return node ? srcTurn(i).invert().multiply(align(name)).multiply(turnOf(node)) : null;
    });
    skeleton.bones.forEach((name, i) => {
      const node = named.get(name) ?? null;
      const post = carry[i];
      const p = skeleton.parents[i]!;
      if (!node || !post || !node.parent) {
        this.bones.push(null);
        return;
      }
      const above = turnOf(node.parent);
      const pre = new Quaternion();
      if (p < 0) pre.copy(above).invert();
      else {
        const parent = named.get(skeleton.bones[p]!)!;
        pre.copy(carry[p]!).multiply(turnOf(parent).invert()).multiply(above).invert();
      }
      this.bones.push({ node, pre, post: post.clone() });
    });

    const length = (a: Vector3, b: Vector3, c: Vector3) => a.distanceTo(b) + b.distanceTo(c);
    const part = (n: string) => placeOf(named.get(n)!);
    const ourLeg = length(part("LeftUpLeg"), part("LeftLeg"), part("LeftFoot"));
    const theirLeg = length(srcPlace(at("LeftUpLeg")), srcPlace(at("LeftLeg")), srcPlace(at("LeftFoot")));
    this.scale = ourLeg / theirLeg;
    for (const node of named.values()) this.rest.set(node, { q: node.quaternion.clone(), p: node.position.clone() });
    this.hips = named.get("Hips")!;
    this.hipsRest.copy(part("Hips"));
    this.legs = (["left", "right"] as const).map((side): Leg => {
      const S = side === "left" ? "Left" : "Right";
      return {
        side,
        thigh: named.get(`${S}UpLeg`)!,
        shin: named.get(`${S}Leg`)!,
        ankle: named.get(`${S}Foot`)!,
        toe: named.get(`${S}ToeBase`)!,
        hinge: new Vector3(1, 0, 0).applyQuaternion(turnOf(named.get(`${S}UpLeg`)!).invert()),
        turnRest: turnOf(named.get(`${S}Foot`)!),
        ankleRest: part(`${S}Foot`).y,
        toeRest: part(`${S}ToeBase`).y,
        legLength: length(part(`${S}UpLeg`), part(`${S}Leg`), part(`${S}Foot`)),
      };
    }) as [Leg, Leg];
    this.spine = ["Spine", "Spine1"].map((n) => named.get(n)).filter((n): n is Object3D => !!n);
    for (const leg of this.legs) {
      const path: Object3D[] = [];
      for (let node: Object3D | null = leg.toe; node && node !== this.hips; node = node.parent) path.unshift(node);
      for (const node of [this.hips, ...path]) if (!this.chain.includes(node)) this.chain.push(node);
    }
  }

  /** Put the body back as it came. */
  release(): void {
    for (const [node, { q, p }] of this.rest) {
      node.quaternion.copy(q);
      node.position.copy(p);
    }
  }

  /** Look where the body is now. */
  see(): void {
    this.root.updateWorldMatrix(true, true);
    this.root.matrixWorld.decompose(seenAt, this.frameTurn, seenScale);
    this.frame.compose(seenAt, this.frameTurn, ONE);
  }

  /** Where a clip has the hips on this body, from its root, the clip's soles on the floor. */
  hipsIn(clip: GaitClip, at: number, floor: number, into: Vector3): Vector3 {
    samplePlace(clip, at, into).multiplyScalar(this.scale);
    into.x += this.hipsRest.x;
    into.z += this.hipsRest.z;
    into.y -= floor;
    return into;
  }

  /** Draw a pose, the hips `sink` lower than it says. */
  write(pose: Pose, sink: number): void {
    this.bones.forEach((bone, i) => {
      if (bone) bone.node.quaternion.copy(bone.pre).multiply(pose.q[i]!).multiply(bone.post);
    });
    hipsAt.copy(pose.hips);
    hipsAt.y -= sink;
    this.putHips(hipsAt);
  }

  private putHips(place: Vector3): void {
    toParent.copy(this.hips.parent!.matrixWorld).invert().multiply(this.frame);
    this.hips.position.copy(place).applyMatrix4(toParent);
  }

  /** How a clip sits on this body; measured once. `floor` is for a clip that never stands. */
  fit(clip: GaitClip, floor?: number): ClipFit {
    const known = this.fits.get(clip);
    if (known) return known;
    this.see();
    const kept = this.bones.map((b) => b && b.node.quaternion.clone());
    const hipsKept = this.hips.position.clone();
    const made = this.measure(clip, floor);
    this.bones.forEach((b, i) => b?.node.quaternion.copy(kept[i]!));
    this.hips.position.copy(hipsKept);
    this.root.updateWorldMatrix(true, true);
    this.fits.set(clip, made);
    return made;
  }

  private look(clip: GaitClip, at: number, toRoot: Matrix4, rootTurn: Quaternion): Seen[] {
    const { bones } = this.skeleton;
    this.bones.forEach((bone, i) => {
      if (!bone || !this.chain.includes(bone.node)) return;
      bone.node.quaternion.copy(bone.pre).multiply(sampleTurn(clip, at, i, bones.length, sampled)).multiply(bone.post);
    });
    this.putHips(this.hipsIn(clip, at, 0, hipsAt));
    for (const node of this.chain) node.updateWorldMatrix(false, false);
    return this.legs.map((leg) => {
      const toe = new Vector3().setFromMatrixPosition(leg.toe.matrixWorld).applyMatrix4(toRoot);
      const ankle = new Vector3().setFromMatrixPosition(leg.ankle.matrixWorld).applyMatrix4(toRoot);
      const turn = new Quaternion();
      leg.ankle.matrixWorld.decompose(seenAt, turn, seenScale);
      turn.premultiply(rootTurn);
      return { toe, ankle, turn, sole: Math.min(toe.y - leg.toeRest, ankle.y - leg.ankleRest) };
    });
  }

  private measure(clip: GaitClip, floorGiven?: number): ClipFit {
    const toRoot = this.frame.clone().invert();
    const rootTurn = this.frameTurn.clone().invert();
    const steps = !!(clip.left && clip.right);
    const N = steps ? STEP_SAMPLES : clip.samples;
    const seen = Array.from({ length: N }, (_, i) => this.look(clip, clip.loop ? i / N : i / (N - 1), toRoot, rootTurn));

    // The lowest the soles get while they stand, a few stray samples aside.
    const { down } = clip;
    const standing = down
      ? seen.flatMap((s, i) => this.legs.flatMap((leg, k) => (down[leg.side].some((span) => within(i / (N - 1), span)) ? [s[k]!.sole] : [])))
      : seen.flatMap((s) => s.map((x) => x.sole));
    standing.sort((a, b) => a - b);
    const floor = floorGiven ?? standing[Math.floor(standing.length * STANDING_SHARE)] ?? 0;
    const tracks = this.legs.map((_, k) => ({
      samples: N,
      loop: clip.loop,
      ankle: Float32Array.from(seen.flatMap((s) => [s[k]!.ankle.x, s[k]!.ankle.y - floor, s[k]!.ankle.z])),
      turn: Float32Array.from(seen.flatMap((s) => s[k]!.turn.toArray())),
    })) as [Track, Track];

    let stride = clip.distance * this.scale;
    const passing = { left: 0.3, right: 0.8 };
    if (steps) {
      // Back-travel per unit of phase over each stance, its ends left out: the foot rolls there.
      let back = 0;
      let spans = 0;
      this.legs.forEach((leg, k) => {
        const [s, e] = clip[leg.side]!.ball;
        const a = s + (e - s) * 0.2;
        const b = s + (e - s) * 0.8;
        const z = (phase: number) => {
          const x = wrap01(phase) * N;
          const i = Math.floor(x) % N;
          const t = x - Math.floor(x);
          return seen[i]![k]!.toe.z * (1 - t) + seen[(i + 1) % N]![k]!.toe.z * t;
        };
        back += z(a) - z(b);
        spans += b - a;
      });
      if (spans > 0 && back > 0.05) stride = back / spans;
      // The feet pass where the two are side by side: one standing, one in the air.
      for (const side of ["left", "right"] as const) {
        const stand = side === "left" ? 0 : 1;
        const from = side === "left" ? 0.1 : 0.6;
        let best = Infinity;
        for (let i = 0; i < N * 0.35; i++) {
          const phase = from + i / N;
          const s = seen[Math.round(phase * N) % N]!;
          const gap = Math.abs(s[stand]!.toe.z - s[1 - stand]!.toe.z);
          if (gap < best) {
            best = gap;
            passing[side] = wrap01(phase);
          }
        }
      }
    }
    return { floor, tracks, stride, passing };
  }
}

/** Bend one leg so its ankle comes to `target` with the given turn, the knee staying in its plane. */
export function reach(leg: Leg, target: Vector3, footTurn: Quaternion): void {
  const { thigh, shin, ankle } = leg;
  footQ.copy(footTurn);
  thigh.getWorldPosition(A);
  shin.getWorldPosition(B);
  ankle.getWorldPosition(C);
  const upper = A.distanceTo(B);
  const lower = B.distanceTo(C);
  const full = (upper + lower) * REACH;
  const least = Math.abs(upper - lower) + 1e-3;
  const flexAt = (d: number) => {
    const reachable = clamp(d, least, full);
    return Math.PI - Math.acos(clamp((upper * upper + lower * lower - reachable * reachable) / (2 * upper * lower), -1, 1));
  };
  axis.copy(leg.hinge).applyQuaternion(thigh.getWorldQuaternion(local)).normalize();
  // The knee's bend, then the thigh's swing onto the new line.
  premultiplyWorld(shin, turn.setFromAxisAngle(axis, flexAt(A.distanceTo(target)) - flexAt(A.distanceTo(C))));
  shin.updateWorldMatrix(false, true);
  ankle.getWorldPosition(C);
  ac.subVectors(C, A).normalize();
  aim.subVectors(target, A).normalize();
  premultiplyWorld(thigh, turn.setFromUnitVectors(ac, aim));
  thigh.updateWorldMatrix(false, true);
  ankle.parent!.getWorldQuaternion(parentQ).invert();
  ankle.quaternion.copy(parentQ).multiply(footQ);
  ankle.updateWorldMatrix(false, true);
}

/** Turn a bone by a rotation given in the world. */
export function premultiplyWorld(bone: Object3D, world: Quaternion): void {
  bone.parent!.getWorldQuaternion(parentQ);
  bone.quaternion.premultiply(local.copy(parentQ).invert().multiply(world).multiply(parentQ));
}

const ONE = new Vector3(1, 1, 1);
const seenAt = new Vector3();
const seenScale = new Vector3();
const hipsAt = new Vector3();
const toParent = new Matrix4();
const sampled = new Quaternion();
const axis = new Vector3();
const A = new Vector3();
const B = new Vector3();
const C = new Vector3();
const ac = new Vector3();
const aim = new Vector3();
const turn = new Quaternion();
const local = new Quaternion();
const footQ = new Quaternion();
const parentQ = new Quaternion();
