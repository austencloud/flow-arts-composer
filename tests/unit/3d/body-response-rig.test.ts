/**
 * Real steps and turns under the body offset
 *
 * The body-response planner moves the performer's body under its staffs: a
 * shift, a duck, a turn about the hips, and feet that step to new places. The
 * rig contract is `AvatarAnimator.setBodyOffset(x, z, plantFeet, y, yaw,
 * feet)`, world space. These checks pose a shipped character's bind pose
 * through it and read the bones back, so a foot that slides, floats, or turns
 * the wrong way shows up as a number rather than as a frame someone has to
 * notice. With no feet and no yaw the call is the shift the stage already
 * uses, and that case is pinned first so the new arguments cannot move it.
 */

import { Group, Quaternion, Vector3, type Bone, type Object3D } from "three";
import { describe, expect, it } from "vitest";
import { createAvatarServices } from "@austencloud/scene-3d";
import { avatar, avatarAssetsPresent, loadRig } from "./locomotion-harness";

/** The contact scoreboard's performer height. */
const HEIGHT_M = 1.905;
/** The phrase stage's cast. */
const CAST = ["ch07", "ch21"];
const DT = 1 / 60;
const QUARTER = Math.PI / 2;

interface Foot {
  x: number;
  z: number;
  lift: number;
  yaw: number;
}
type Feet = { left: Foot; right: Foot } | null;

/** The six-argument contract, which the installed 0.1.6 typings predate. */
type BodyOffsetAnimator = {
  setBodyOffset(
    x: number,
    z: number,
    plantFeet: boolean,
    y?: number,
    yaw?: number,
    feet?: Feet
  ): void;
  releaseBodyOffset(): void;
  update(dt: number): void;
  setContactMode(mode: "legacy" | "prop-authoritative"): void;
};

const at = (node: Object3D) => node.getWorldPosition(new Vector3());

/** Horizontal heading of a direction, radians about world up from +Z. */
const heading = (v: Vector3) => Math.atan2(v.x, v.z);

const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

const toDeg = (rad: number) => (rad * 180) / Math.PI;

const foot = (x = 0, z = 0, lift = 0, yaw = 0): Foot => ({ x, z, lift, yaw });

async function boot(id: string) {
  const { scene } = await loadRig(avatar(id));
  const services = createAvatarServices({
    enableLocomotion: false,
    enableRootMotion: false,
    enableFootPlanting: false,
  });
  (
    services.skeleton as unknown as {
      processGLTF(scene: unknown, gltf: null, id: string): void;
    }
  ).processGLTF(scene, null, id);
  services.skeleton.setHeight(HEIGHT_M);
  const root = new Group();
  root.add(scene);
  root.position.y = -services.skeleton.getFeetOffset();
  root.updateMatrixWorld(true);
  const animator = services.animator as unknown as BodyOffsetAnimator;
  animator.setContactMode("legacy");
  const state = services.skeleton.getState();
  const hips = state.bones.get("Hips")!;
  const legs = {
    left: services.skeleton.getLeftLegChain()!,
    right: services.skeleton.getRightLegChain()!,
  };
  const toeOf = (side: "Left" | "Right") => {
    let hit: Bone | null = null;
    scene.traverse((node) => {
      if (
        !hit &&
        (node as Bone).isBone &&
        node.name.endsWith(`${side}ToeBase`)
      ) {
        hit = node as Bone;
      }
    });
    return hit as Bone | null;
  };
  const toes = { left: toeOf("Left"), right: toeOf("Right") };
  expect(hips, `${id} hips`).toBeTruthy();
  expect(legs.left && legs.right, `${id} legs`).toBeTruthy();
  expect(toes.left && toes.right, `${id} toes`).toBeTruthy();

  /** One frame the way Avatar3D runs it: take back, set, solve. */
  const frame = (
    x = 0,
    z = 0,
    plant = true,
    y = 0,
    yaw = 0,
    feet: Feet = null
  ) => {
    animator.releaseBodyOffset();
    animator.setBodyOffset(x, z, plant, y, yaw, feet);
    animator.update(DT);
    root.updateMatrixWorld(true);
    return read();
  };

  const read = () => {
    const forward = new Vector3(0, 0, 1).applyQuaternion(
      hips.getWorldQuaternion(new Quaternion())
    );
    const side = (s: "left" | "right") => {
      const chain = legs[s];
      const ankle = at(chain.effector);
      const toe = at(toes[s]!);
      return {
        ankle,
        toeHeading: heading(toe.clone().sub(ankle)),
        hip: at(chain.root),
        knee: at(chain.middle),
      };
    };
    return {
      hips: at(hips),
      hipsHeading: heading(forward),
      left: side("left"),
      right: side("right"),
    };
  };

  // Settle the arms' rest solve, then read where the clip puts everything.
  for (let i = 0; i < 30; i++) frame();
  const clip = frame();
  return {
    animator,
    frame,
    clip,
    legs,
    diagnostics: () =>
      (
        animator as unknown as {
          bodyOffsetApplied: {
            yawRad: number;
            feet: { side: string; target: Vector3; lift: number }[];
          };
        }
      ).bodyOffsetApplied,
  };
}

type Pose = ReturnType<Awaited<ReturnType<typeof boot>>["frame"]>;

/** The clip point turned by `yaw` about the vertical through `pivot`. */
const turnedAbout = (point: Vector3, pivot: Vector3, yaw: number) =>
  point
    .clone()
    .sub(pivot)
    .applyAxisAngle(new Vector3(0, 1, 0), yaw)
    .add(pivot);

/**
 * A bent knee points the way the hips face (turned by `turn`), not sideways.
 * Returns the bend, degrees, and the angle of the knee's bulge off that
 * facing, degrees; a straight leg has no bulge to measure.
 */
function kneeBend(leg: Pose["left"], facing: number) {
  const thigh = leg.knee.clone().sub(leg.hip);
  const shin = leg.ankle.clone().sub(leg.knee);
  const bend = toDeg(thigh.angleTo(shin));
  const line = leg.ankle.clone().sub(leg.hip).normalize();
  const bulge = leg.knee.clone().sub(leg.hip);
  bulge.addScaledVector(line, -bulge.dot(line));
  bulge.y = 0;
  const off = Math.abs(toDeg(wrap(heading(bulge) - facing)));
  return { bend, off };
}

describe.skipIf(!avatarAssetsPresent())("body response rig", () => {
  it("keeps today's shift: feet planted where the clip put them", async () => {
    for (const id of CAST) {
      const { frame, clip } = await boot(id);
      const pose = frame(0.15, 0, true);
      for (const s of ["left", "right"] as const) {
        expect(
          pose[s].ankle.distanceTo(clip[s].ankle),
          `${id} ${s}`
        ).toBeLessThan(0.01);
      }
      expect(pose.hips.x - clip.hips.x, `${id} hips x`).toBeCloseTo(0.15, 2);
    }
  }, 120_000);

  it("steps both feet with the body and bends the knees forward", async () => {
    for (const id of CAST) {
      const { frame, clip, diagnostics } = await boot(id);
      const pose = frame(0.15, 0, true, 0, 0, {
        left: foot(0.15),
        right: foot(0.15),
      });
      const step = new Vector3(0.15, 0, 0);
      for (const s of ["left", "right"] as const) {
        expect(
          pose[s].ankle.distanceTo(clip[s].ankle.clone().add(step)),
          `${id} ${s} ankle`
        ).toBeLessThan(0.01);
        const knee = kneeBend(pose[s], pose.hipsHeading);
        if (knee.bend > 5)
          expect(knee.off, `${id} ${s} knee plane`).toBeLessThan(30);
      }
      // Horizontally the hips move by exactly the step. The bind pose stands
      // its legs straighter than a planted leg may reach (MAX_PLANTED_LEG_USE),
      // so the existing reach limit takes up to 1.7 cm off the height (ch07).
      const moved = pose.hips.clone().sub(clip.hips);
      expect(
        Math.hypot(moved.x - 0.15, moved.z),
        `${id} hips step`
      ).toBeLessThan(0.01);
      expect(moved.y, `${id} hips height`).toBeLessThanOrEqual(1e-6);
      expect(moved.y, `${id} hips height`).toBeGreaterThan(-0.025);
      expect(
        diagnostics()
          .feet.map((f) => f.side)
          .sort()
      ).toEqual(["left", "right"]);
    }
  }, 120_000);

  it("lifts a swinging foot and leaves the other and the hips alone", async () => {
    for (const id of CAST) {
      const { frame, diagnostics } = await boot(id);
      // Both feet planted a little to the side, then the left one lifted.
      const planted = frame(0.05, 0, true, 0, 0, {
        left: foot(0.05),
        right: foot(0.05),
      });
      const pose = frame(0.05, 0, true, 0, 0, {
        left: foot(0.05, 0, 0.07),
        right: foot(0.05),
      });
      const rise = pose.left.ankle.y - planted.left.ankle.y;
      expect(rise, `${id} left rise`).toBeGreaterThan(0.06);
      expect(rise, `${id} left rise`).toBeLessThan(0.08);
      expect(
        pose.right.ankle.distanceTo(planted.right.ankle),
        `${id} right`
      ).toBeLessThan(0.01);
      expect(
        Math.abs(pose.hips.y - planted.hips.y),
        `${id} hips height`
      ).toBeLessThan(0.01);
      expect(
        diagnostics().feet.find((f) => f.side === "left")!.lift
      ).toBeCloseTo(0.07, 6);
    }
  }, 120_000);

  it("ducks the hips while both feet stay on the ground", async () => {
    for (const id of CAST) {
      const { frame, clip } = await boot(id);
      const pose = frame(0, 0, true, -0.2, 0, { left: foot(), right: foot() });
      expect(clip.hips.y - pose.hips.y, `${id} duck`).toBeGreaterThan(0.19);
      expect(clip.hips.y - pose.hips.y, `${id} duck`).toBeLessThan(0.21);
      for (const s of ["left", "right"] as const) {
        expect(
          pose[s].ankle.distanceTo(clip[s].ankle),
          `${id} ${s}`
        ).toBeLessThan(0.01);
        const knee = kneeBend(pose[s], pose.hipsHeading);
        expect(knee.bend, `${id} ${s} knee bends`).toBeGreaterThan(15);
        expect(knee.off, `${id} ${s} knee plane`).toBeLessThan(30);
      }
    }
  }, 120_000);

  it("turns the body over planted feet, and turns the feet when they step round", async () => {
    for (const id of CAST) {
      const { frame, clip, diagnostics } = await boot(id);
      const pivot = clip.hips.clone();

      // A twist over feet that stay put, whether the host names them or not.
      for (const feet of [{ left: foot(), right: foot() }, null]) {
        const twist = frame(0, 0, true, 0, QUARTER, feet);
        expect(
          Math.abs(toDeg(wrap(twist.hipsHeading - clip.hipsHeading)) - 90),
          `${id} hips turn`
        ).toBeLessThan(2);
        for (const s of ["left", "right"] as const) {
          expect(
            twist[s].ankle.distanceTo(clip[s].ankle),
            `${id} ${s} planted`
          ).toBeLessThan(0.01);
        }
        expect(diagnostics().yawRad).toBeCloseTo(QUARTER, 6);
      }

      // Feet planted at the body's yaw: they sit where the clip put them,
      // turned with the body about its hips.
      const round = frame(0, 0, true, 0, QUARTER, {
        left: foot(0, 0, 0, QUARTER),
        right: foot(0, 0, 0, QUARTER),
      });
      for (const s of ["left", "right"] as const) {
        expect(
          round[s].ankle.distanceTo(turnedAbout(clip[s].ankle, pivot, QUARTER)),
          `${id} ${s} turned`
        ).toBeLessThan(0.01);
        expect(
          Math.abs(toDeg(wrap(round[s].toeHeading - clip[s].toeHeading)) - 90),
          `${id} ${s} toes turned`
        ).toBeLessThan(2);
      }

      // Feet not planted: they travel with the turned body.
      const free = frame(0, 0, false, 0, QUARTER);
      for (const s of ["left", "right"] as const) {
        expect(
          free[s].ankle.distanceTo(turnedAbout(clip[s].ankle, pivot, QUARTER)),
          `${id} ${s} carried`
        ).toBeLessThan(0.01);
      }
    }
  }, 120_000);

  it("holds a planted foot still through a step to a new place and yaw", async () => {
    const END = { x: 0.15, z: 0.05, yaw: Math.PI / 6 };
    for (const id of CAST) {
      const { frame } = await boot(id);
      const frames: { pose: Pose; liftL: number; placeL: string }[] = [];
      const total = 90;
      for (let i = 0; i <= total; i++) {
        const t = i / total;
        // The body glides across the whole span; the left foot waits, swings
        // in the middle third, then holds its new place. The right stays.
        const swing = Math.min(1, Math.max(0, (t - 1 / 3) * 3));
        const lift =
          swing > 0 && swing < 1 ? 0.07 * Math.sin(Math.PI * swing) : 0;
        const left = foot(END.x * swing, END.z * swing, lift, END.yaw * swing);
        const pose = frame(END.x * t, END.z * t, true, 0, END.yaw * t, {
          left,
          right: foot(),
        });
        frames.push({
          pose,
          liftL: lift,
          placeL: swing === 0 ? "start" : swing === 1 ? "end" : "swing",
        });
      }
      let rightSlide = 0;
      let leftSlide = 0;
      for (let i = 1; i < frames.length; i++) {
        const a = frames[i - 1]!;
        const b = frames[i]!;
        rightSlide = Math.max(
          rightSlide,
          a.pose.right.ankle.distanceTo(b.pose.right.ankle)
        );
        if (a.liftL === 0 && b.liftL === 0 && a.placeL === b.placeL) {
          leftSlide = Math.max(
            leftSlide,
            a.pose.left.ankle.distanceTo(b.pose.left.ankle)
          );
        }
      }
      // The left foot really did step: it ends where it was sent.
      const first = frames[0]!.pose.left.ankle;
      const last = frames[frames.length - 1]!.pose.left.ankle;
      const pivot = frames[0]!.pose.hips;
      const sent = turnedAbout(first, pivot, END.yaw).add(
        new Vector3(END.x, 0, END.z)
      );
      expect(last.distanceTo(sent), `${id} left landed`).toBeLessThan(0.01);
      expect(rightSlide, `${id} right slide per frame`).toBeLessThan(0.002);
      expect(leftSlide, `${id} left slide per frame`).toBeLessThan(0.002);
    }
  }, 120_000);
});
