/**
 * An empty hand rests half curled with its thumb in; a hand on a prop does
 * not change.
 *
 * Avatar3D gives every hand without a prop the IDLE grip, in locomotion and
 * standing alike, and a hand with one SQUARE. Until 2026-11-22 IDLE was a
 * near-flat hand, 10 to 22 degrees a joint with the thumb out, which on a
 * walking body reads as a mannequin's. A square grip loosened for contact
 * blends toward a relaxed hand too, and that blend has to land where it did
 * before, so the prop hand is checked against the rotations it had then.
 */

import { Bone, Euler, Quaternion } from "three";
import { describe, expect, it } from "vitest";
import type { FingerChains } from "@austencloud/scene-3d";
import { FINGER_BONES, FingerAnimator, GripType } from "@austencloud/scene-3d";

function createHand(rest: Quaternion) {
  return new Map(
    FINGER_BONES.map((name) => {
      const bone = new Bone();
      bone.name = name;
      bone.quaternion.copy(rest);
      return [name, bone] as const;
    })
  ) as FingerChains["left"];
}

/**
 * The installed package is rebuilt from a patch after the edit is measured;
 * until it carries the new idle hand, only the prop-hand guard runs.
 * `TKA_WALK_TESTS=all` runs everything regardless.
 */
const relaxedIdle =
  "writePoseRotation" in FingerAnimator.prototype ||
  process.env.TKA_WALK_TESTS === "all";

const LEFT_REST = new Quaternion().setFromEuler(new Euler(0.08, 1.1, -0.22));
const RIGHT_REST = new Quaternion().setFromEuler(new Euler(-0.12, -0.9, 0.18));

function settle(relaxation: number) {
  const chains: FingerChains = {
    left: createHand(LEFT_REST),
    right: createHand(RIGHT_REST),
  };
  const animator = new FingerAnimator();
  animator.initialize(chains);
  animator.setGrips(GripType.IDLE, GripType.SQUARE);
  animator.setContactRelaxation("right", relaxation);
  for (let i = 0; i < 240; i++) animator.update(1 / 60);
  return chains;
}

/** Degrees a bone has turned from its rest. */
function turned(bone: Bone, rest: Quaternion): number {
  const dot = Math.min(1, Math.abs(bone.quaternion.dot(rest)));
  return (2 * Math.acos(dot) * 180) / Math.PI;
}

describe("idle hand", () => {
  it.skipIf(!relaxedIdle)("curls an empty hand about halfway, the little finger most", () => {
    const { left } = settle(0);
    const curl = (finger: string) =>
      [1, 2, 3].reduce(
        (sum, joint) => sum + turned(left.get(`${finger}${joint}` as never)!, LEFT_REST),
        0
      );
    expect(curl("Index")).toBeGreaterThan(80);
    expect(curl("Index")).toBeLessThan(110);
    expect(curl("Pinky")).toBeGreaterThan(curl("Index"));
    expect(curl("Pinky")).toBeLessThan(140);
  });

  it.skipIf(!relaxedIdle)("brings the thumb in toward the palm", () => {
    const { left } = settle(0);
    const thumb = left.get("Thumb1")!.quaternion.clone();
    const delta = LEFT_REST.clone().invert().multiply(thumb);
    // Flexion and opposition, not the flat hand's lone abduction.
    expect(delta.x).toBeGreaterThan(0.08);
    expect(delta.y).toBeGreaterThan(0.08);
  });

  it.each([0, 0.5, 1])(
    "leaves a hand on a prop where it was (relaxation %s)",
    (relaxation) => {
      const { right } = settle(relaxation);
      const golden = PROP_HAND[String(relaxation)]!;
      FINGER_BONES.forEach((name, i) => {
        const q = right.get(name)!.quaternion;
        const g = new Quaternion(...golden[i]!);
        expect(Math.abs(q.dot(g))).toBeGreaterThan(1 - 1e-6);
      });
    }
  );
});

// Recorded from the package before the idle pose changed (2026-11-22).
const PROP_HAND: Record<string, [number, number, number, number][]> = {
  "0": [
    [0.1717946, -0.5991287, 3.65e-05, 0.7820047],
    [0.2181491, -0.3652774, 0.246554, 0.8707436],
    [0.1414373, -0.3853739, 0.2137836, 0.8864418],
    [0.4699082, -0.2742229, 0.3449903, 0.7648332],
    [0.5347723, -0.2431153, 0.3675751, 0.720973],
    [0.366066, -0.3169039, 0.3062489, 0.8196214],
    [0.4897764, -0.2650943, 0.3520533, 0.752265],
    [0.5535083, -0.2333854, 0.3738285, 0.7066909],
    [0.380264, -0.3115302, 0.3117136, 0.8131315],
    [0.5028492, -0.2589008, 0.3566327, 0.7435901],
    [0.5657173, -0.2268474, 0.3778316, 0.6969558],
    [0.4014553, -0.3032493, 0.3197754, 0.8028805],
    [0.5157494, -0.2526376, 0.3610966, 0.7347013],
    [0.5657173, -0.2268474, 0.3778316, 0.6969558],
    [0.4223594, -0.2947644, 0.3276132, 0.7920834],
  ],
  "1": [
    [0.1717946, -0.5991287, 3.65e-05, 0.7820047],
    [0.2181491, -0.3652774, 0.246554, 0.8707436],
    [0.1414373, -0.3853739, 0.2137836, 0.8864418],
    [0.1627037, -0.3801239, 0.222985, 0.882786],
    [0.2143525, -0.3663484, 0.2449599, 0.871686],
    [0.1221056, -0.3899367, 0.2053432, 0.8893108],
    [0.1041871, -0.3939895, 0.1974557, 0.8915877],
    [0.1568815, -0.3815854, 0.2204746, 0.8838392],
    [0.0792407, -0.3993515, 0.1863729, 0.8941501],
    [0.2286839, -0.346885, 0.0938047, 0.9047514],
    [0.1290212, -0.3883273, 0.2083709, 0.8883339],
    [0.0714461, -0.4009604, 0.1828858, 0.8948067],
    [0.2643828, -0.3211028, 0.0041456, 0.9093831],
    [0.1216078, -0.3900516, 0.2051249, 0.889379],
    [0.0792406, -0.3993515, 0.1863728, 0.8941501],
  ],
  "0.5": [
    [0.1717946, -0.5991287, 3.65e-05, 0.7820047],
    [0.2181491, -0.3652774, 0.246554, 0.8707436],
    [0.1414373, -0.3853739, 0.2137836, 0.8864418],
    [0.3217572, -0.3328119, 0.2888819, 0.8380071],
    [0.3820675, -0.3108377, 0.3124042, 0.8122856],
    [0.2465604, -0.3570034, 0.2583894, 0.8631289],
    [0.3050424, -0.3384863, 0.2822118, 0.8442349],
    [0.3660721, -0.3169016, 0.3062513, 0.8196186],
    [0.2332963, -0.3609235, 0.2528847, 0.8668081],
    [0.368764, -0.2976805, 0.2352953, 0.8485491],
    [0.3603079, -0.3190442, 0.3040185, 0.8221689],
    [0.2408766, -0.3586956, 0.2560351, 0.8647323],
    [0.3910997, -0.2748264, 0.1962733, 0.8561474],
    [0.3568762, -0.3203092, 0.3026854, 0.8236643],
    [0.2559395, -0.3541701, 0.2622595, 0.8603944],
  ]
};
