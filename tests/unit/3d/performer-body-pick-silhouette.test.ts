import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { avatar, loadRig } from "./locomotion-harness";
import {
  findBone,
  measureCharacter,
  type CharacterReport,
} from "./performer-body-pick-silhouette";

const IDS = [
  "ch01",
  "ch07",
  "ch10",
  "ch12",
  "ch18",
  "ch21",
  "ch22",
  "ch24",
  "ch26",
  "ch34",
  "ch41",
  "ch42",
  "ch44",
  "remy",
  "x-bot",
  "y-bot",
].filter((id) => fs.existsSync(avatar(id)));

// The GLBs are gitignored, so a fresh clone and CI have none: skip then.
const describeReal = IDS.length > 0 ? describe : describe.skip;

describeReal(
  "body pick capsules against the real characters' silhouette",
  () => {
    const reports = new Map<string, CharacterReport>();

    it.each(IDS)(
      "%s",
      async (id) => {
        const { scene } = await loadRig(avatar(id));
        const report = measureCharacter(scene);
        reports.set(id, report);
        if (process.env.BODY_PICK_REPORT) {
          const rows = report.poses.map(
            (p) =>
              `${p.pose}: overreach ${(p.overreach * 100).toFixed(1)}% uncovered ${(p.uncovered * 100).toFixed(1)}%`
          );
          const top = (r: Record<string, number>) =>
            Object.entries(r)
              .sort((l, rr) => rr[1] - l[1])
              .slice(0, 6)
              .map(([k, n]) => `${k}:${n}`)
              .join(" ");
          const worst = report.poses[0]!;
          rows.push(
            `bind front uncovered@ ${top(worst.front.uncoveredWhere)} | side ${top(worst.side.uncoveredWhere)}`,
            `bind front overreach@ ${top(worst.front.overreachWhere)} | side ${top(worst.side.overreachWhere)}`
          );
          fs.appendFileSync(
            process.env.BODY_PICK_REPORT,
            `\n[${id}] capsules=${report.capsuleCount}\n  ${rows.join("\n  ")}\n  ${report.kept.join("\n  ")}`
          );
        }

        // Each major limb part owns a capsule, so it follows its own bone.
        const owners = new Set(report.kept.map((line) => line.split(" ")[0]));
        for (const suffix of [
          "LeftArm",
          "LeftForeArm",
          "RightArm",
          "RightForeArm",
          "LeftUpLeg",
          "LeftLeg",
          "RightUpLeg",
          "RightLeg",
        ]) {
          const bone = findBone(scene, suffix);
          expect(bone, `${id} has ${suffix}`).toBeTruthy();
          expect(
            owners.has(bone!.name),
            `${id}: ${suffix} has its own capsule`
          ).toBe(true);
        }

        expect(report.capsuleCount).toBeLessThanOrEqual(32);
        for (const pose of report.poses) {
          expect(pose.overreach, `${id} ${pose.pose} overreach`).toBeLessThan(
            0.03
          );
          expect(pose.uncovered, `${id} ${pose.pose} uncovered`).toBeLessThan(
            0.04
          );
        }
      },
      120000
    );
  }
);
