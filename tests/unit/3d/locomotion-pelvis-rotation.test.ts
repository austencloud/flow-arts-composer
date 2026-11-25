/**
 * The pelvis turns, tilts and lists the way the clip does.
 *
 * Until 2026-11-22 every clip's Hips rotation track was thrown away, because
 * copied across as it stands it lays a rig on its back: the pack's walks are
 * exported under an armature turned a quarter turn about X, and their Hips
 * keys carry that turn. Throwing it away also threw away the walk's pelvis:
 * no twist, no list, a trunk held bolt upright on a run that leans twenty
 * degrees, and a strafe whose legs were authored for a pelvis turned toward
 * travel swinging from one that faces straight ahead.
 *
 * The track is now converted: each key becomes the change from the source's
 * own rest, in the character's frame, applied on the target's rest. Forward,
 * backward and run cycles lose only their mean yaw, a few degrees of standing
 * turn. Strafes and grapevines lose most of theirs too, so the body faces the
 * audience while it travels sideways; see the sideways cases below.
 *
 * Every number here is a fraction of the same reading taken on the source
 * clip, played on the armature it was authored on with its own pelvis and
 * root travel (`driveSourceClip`), so the targets say how much of the clip
 * survives rather than what a walk ought to look like.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  analyzePosture,
  avatar,
  avatarAssetsPresent,
  driveRig,
  driveSourceClip,
  editedScene3d,
  loadPackClips,
  loadPackClipsWith,
  type DriveRigResult,
  type PostureReport,
} from "./locomotion-harness";

beforeAll(loadPackClips, 120_000);

const RIGS = ["x-bot", "ch01", "ch12", "ch44"];

async function source(clip: string): Promise<PostureReport> {
  const run = await driveSourceClip({ clip, seconds: 8 });
  return analyzePosture(run.frames, run.posture, run.report);
}

async function target(
  rig: string,
  speed: number,
  direction = { x: 0, z: 1 }
): Promise<PostureReport> {
  const run = await driveRig({
    rig: avatar(rig),
    speedAt: () => speed,
    seconds: 8,
    settleSeconds: 3,
    planting: true,
    direction,
  });
  return analyzePosture(run.frames, run.posture, run.report);
}

/**
 * How far each upper arm hangs out from the body in the frontal plane, the
 * median over every frame and both arms, in degrees.
 */
function armAbduction(posture: DriveRigResult["posture"]): number {
  const angles: number[] = [];
  for (const p of posture) {
    const across = Math.hypot(
      p.rightShoulder.x - p.leftShoulder.x,
      p.rightShoulder.z - p.leftShoulder.z
    );
    const ux = (p.rightShoulder.x - p.leftShoulder.x) / across;
    const uz = (p.rightShoulder.z - p.leftShoulder.z) / across;
    for (const [shoulder, wrist, outward] of [
      [p.leftShoulder, p.leftWrist, -1],
      [p.rightShoulder, p.rightWrist, 1],
    ] as const) {
      const out =
        ((wrist.x - shoulder.x) * ux + (wrist.z - shoulder.z) * uz) * outward;
      angles.push((Math.atan2(out, shoulder.y - wrist.y) * 180) / Math.PI);
    }
  }
  angles.sort((a, b) => a - b);
  return angles[Math.floor(angles.length / 2)]!;
}

describe.skipIf(!avatarAssetsPresent() || !editedScene3d)(
  "pelvis rotation carried from the clip",
  () => {
    // Standing, ch01's arms hung 3.5 degrees wider than the clip's. The arm
    // clearance bake fits each hand off its thigh, and it was fitting them
    // against an upright pelvis the idle clip does not have: with the clip's
    // own pelvis the hands already clear, and the arms hang where they were
    // authored. X-Bot, the wide-hipped body, is still opened by the bake.
    it.each(["ch01", "ch12", "ch44"])(
      "stands %s with its arms where the clip hangs them",
      async (rig) => {
        const clip = await driveSourceClip({ clip: "idle", seconds: 6 });
        const stand = await driveRig({
          rig: avatar(rig),
          speedAt: () => 0,
          seconds: 6,
          settleSeconds: 2,
        });
        expect(
          Math.abs(armAbduction(stand.posture) - armAbduction(clip.posture))
        ).toBeLessThan(1.5);
      },
      120_000
    );

    it.each(RIGS)("walks %s with the clip's lean, twist and list", async (rig) => {
      const clip = await source("forward");
      const walk = await target(rig, 1.4);
      expect(Math.abs(walk.trunkLean - clip.trunkLean)).toBeLessThan(3);
      expect(walk.pelvisTwistAmplitude).toBeGreaterThanOrEqual(
        0.8 * clip.pelvisTwistAmplitude
      );
      expect(walk.pelvisListAmplitude).toBeGreaterThanOrEqual(
        0.8 * clip.pelvisListAmplitude
      );
      // The standing turn is taken out, so the pelvis faces the heading.
      expect(Math.abs(walk.pelvisTwistMean)).toBeLessThan(2);
    }, 120_000);

    // Remy leans 3.2 degrees further back than the clip on the walk, and 3.4
    // further back standing: the same spine rotations on Remy's skeleton put
    // its neck further behind its hips. What the walk adds is the clip's own
    // lean, which is what this holds every rig to, Remy included.
    it.each([...RIGS, "remy"])(
      "walks %s leaning as far ahead of its own stance as the clip does",
      async (rig) => {
        const k = rig === "remy" ? 3.211 / 1.671 : 1;
        const lean = async (clip: string) => {
          const run = await driveSourceClip({ clip, seconds: 6 });
          return analyzePosture(run.frames, run.posture, run.report).trunkLean;
        };
        const clipGain = (await lean("forward")) - (await lean("idle"));
        const stand = await driveRig({
          rig: avatar(rig),
          speedAt: () => 0,
          seconds: 4,
          settleSeconds: 2,
        });
        const walk = await driveRig({
          rig: avatar(rig),
          speedAt: () => 1.4 * k,
          seconds: 8,
          settleSeconds: 3,
          planting: true,
        });
        const gain =
          analyzePosture(walk.frames, walk.posture, walk.report).trunkLean -
          analyzePosture(stand.frames, stand.posture, stand.report).trunkLean;
        expect(Math.abs(gain - clipGain)).toBeLessThan(1);
      },
      120_000
    );

    it.each(RIGS)("runs %s leaning into it", async (rig) => {
      const clip = await source("runForward");
      const run = await target(rig, 3.9);
      expect(clip.trunkLean).toBeGreaterThan(15);
      expect(Math.abs(run.trunkLean - clip.trunkLean)).toBeLessThan(3);
      expect(run.pelvisTwistAmplitude).toBeGreaterThanOrEqual(
        0.8 * clip.pelvisTwistAmplitude
      );
      expect(run.pelvisListAmplitude).toBeGreaterThanOrEqual(
        0.8 * clip.pelvisListAmplitude
      );
    }, 120_000);

    // The clip's strafes are authored walking a diagonal: pelvis turned 69
    // degrees toward travel, chest 46, head straight ahead. Performers spin
    // props in the wall plane, square to the audience, so a sidestep here has
    // to face front: the chest within 15 degrees of ahead, the head ahead, and
    // the pelvis turned no more than 25 degrees past the chest so the spine
    // is not wrung. The feet may not slide more than the clip's own do at the
    // same speed.
    const SIDEWAYS = [
      ["sidestep", "strafeRight", { x: 1, z: 0 }],
      ["sidestep", "strafeLeft", { x: -1, z: 0 }],
      ["grapevine", "grapevineRight", { x: 1, z: 0 }],
      ["grapevine", "grapevineLeft", { x: -1, z: 0 }],
    ] as const;
    // Remy is built about twice the size of the others, so it is driven at
    // the same pace for its legs, and its slip read back in the same units.
    const SCALE: Record<string, number> = { remy: 3.211 / 1.671 };
    const cases = [...RIGS, "remy"].flatMap((rig) =>
      SIDEWAYS.map(([gait, clip, direction]) => [rig, gait, clip, direction] as const)
    );
    let vineClips: Awaited<ReturnType<typeof loadPackClipsWith>> | null = null;

    it.each(cases)(
      "%s %s (%s) faces the audience",
      async (rig, gait, clip, direction) => {
        const k = SCALE[rig] ?? 1;
        if (gait === "grapevine") {
          vineClips ??= await loadPackClipsWith(["grapevineLeft", "grapevineRight"]);
        }
        const run = await driveRig({
          rig: avatar(rig),
          speedAt: () => 1.0 * k,
          seconds: 8,
          settleSeconds: 3,
          planting: true,
          direction,
          lateralGait: gait,
          ...(gait === "grapevine" && vineClips ? { clipSet: vineClips } : {}),
        });
        const side = analyzePosture(run.frames, run.posture, run.report);
        const authored = await driveSourceClip({ clip, seconds: 8, speed: 1.0 });
        expect(Math.abs(side.chestYaw)).toBeLessThan(15);
        expect(Math.abs(side.headYaw)).toBeLessThan(15);
        // The hip line is read off the thigh joints, and Remy's sit 3.8
        // degrees off square to its body at rest, so each rig's spine twist
        // is read from where it stands, against where the clip stands.
        const restTwist = async (run: DriveRigResult) => {
          const p = analyzePosture(run.frames, run.posture, run.report);
          return p.pelvisTwistMean - p.chestYaw;
        };
        const bias =
          (await restTwist(
            await driveRig({ rig: avatar(rig), speedAt: () => 0, seconds: 3, settleSeconds: 2 })
          )) - (await restTwist(await driveSourceClip({ clip: "idle", seconds: 3 })));
        expect(
          Math.abs(side.pelvisTwistMean - side.chestYaw - bias)
        ).toBeLessThanOrEqual(25);
        // A centimetre of give: x-bot's grapevine slides with the clip's own
        // 39 cm, the planter's limit on that rig, not the turn's.
        expect(run.report.peakSlip / k).toBeLessThanOrEqual(
          authored.report.peakSlip + 0.01
        );
      },
      120_000
    );
  }
);
