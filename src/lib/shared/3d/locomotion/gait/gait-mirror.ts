/** A clip with left and right exchanged, so one recorded jump serves either foot. */
import { Quaternion } from "three";
import type { GaitClip, GaitSkeleton } from "./gait-clips";

const otherSide = (name: string) =>
  name.startsWith("Left") ? `Right${name.slice(4)}` : name.startsWith("Right") ? `Left${name.slice(5)}` : name;

export function mirrorClip({ bones, parents, restQ }: GaitSkeleton, clip: GaitClip): GaitClip {
  const count = bones.length;
  const rest = bones.map((_, i) => new Quaternion().fromArray(restQ, i * 4));
  const restBack = rest.map((q) => q.clone().invert());
  const twin = bones.map((name) => Math.max(0, bones.indexOf(otherSide(name))));
  const q = new Float32Array(clip.q.length);
  const world = bones.map(() => new Quaternion());
  const turned = bones.map(() => new Quaternion());
  const flipped = bones.map(() => new Quaternion());
  for (let n = 0; n < clip.samples; n++) {
    const base = n * count * 4;
    parents.forEach((p, i) => {
      world[i]!.fromArray(clip.q, base + i * 4).normalize();
      if (p >= 0) world[i]!.premultiply(world[p]!);
      turned[i]!.copy(world[i]!).multiply(restBack[i]!);
    });
    parents.forEach((p, i) => {
      // What the other side turned from its rest, reflected across the body's middle.
      const t = turned[twin[i]!]!;
      flipped[i]!.set(t.x, -t.y, -t.z, t.w).multiply(rest[i]!);
      const local = world[i]!;
      if (p < 0) local.copy(flipped[i]!);
      else local.copy(flipped[p]!).invert().multiply(flipped[i]!);
      local.toArray(q, base + i * 4);
    });
  }
  return {
    ...clip,
    left: clip.right,
    right: clip.left,
    down: clip.down && { left: clip.down.right, right: clip.down.left },
    way: clip.way && { yaw: clip.way.yaw.map((a) => -a), x: clip.way.x.map((x) => -x), z: clip.way.z },
    q,
    p: clip.p.map((x, i) => (i % 3 === 0 ? -x : x)),
  };
}
