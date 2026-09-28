/**
 * A retracted arm grows back in time, not in frames
 *
 * When a forearm would pass through the body, the animator shortens the reach
 * and remembers the ratio, then grows it back while the fuller reach clears.
 * The growth used to be 0.04 every 12 frames: a hand pulled in to 60% took two
 * seconds at 60 fps to reach full length again, four at 30 fps, and read as a
 * lingering let-go. It now grows at a fixed rate per second.
 */

import { Group, Vector3, type Object3D } from "three";
import { describe, expect, it } from "vitest";
import { createAvatarServices, Plane } from "@austencloud/scene-3d";
import { avatar, avatarAssetsPresent, loadRig } from "../3d/locomotion-harness";

/** The contact scoreboard's performer height. */
const HEIGHT_M = 1.905;

const at = (node: Object3D) => node.getWorldPosition(new Vector3());

/**
 * Hold the left grip out in front of the shoulder, press it into the chest for
 * a quarter second, then put it back, and time the wrist's return at `fps`.
 */
async function recovery(fps: number) {
  const { scene } = await loadRig(avatar("ch07"));
  const services = createAvatarServices({
    enableLocomotion: false,
    enableRootMotion: false,
    enableFootPlanting: false,
  });
  // processGLTF is on the implementation, not the contract.
  (
    services.skeleton as unknown as {
      processGLTF(scene: unknown, gltf: null, id: string): void;
    }
  ).processGLTF(scene, null, "ch07");
  services.skeleton.setHeight(HEIGHT_M);
  const root = new Group();
  root.add(scene);
  root.position.y = -services.skeleton.getFeetOffset();
  root.updateMatrixWorld(true);
  services.animator.setContactMode("legacy");

  const chain = services.skeleton.getLeftArmChain()!;
  const chest = services.skeleton.getState().bones.get("Spine2")!;
  // The rig faces +Z. A grip at 80% of the arm's length ahead of the shoulder
  // clears the body; one just in front of the chest cannot.
  const ahead = at(chain.root).add(
    new Vector3(0.05, -0.05, chain.totalLength * 0.8)
  );
  const inChest = at(chest).add(new Vector3(0, 0, 0.05));
  const dt = 1 / fps;
  const hold = (grip: Vector3) => {
    // Only a hand on a plane gets the elbow pole that body clearance steers.
    services.animator.setPropsAndBlend(
      {
        worldPosition: grip,
        staffRotationAngle: 0,
        plane: Plane.WALL,
      } as never,
      null
    );
    services.animator.update(dt);
    root.updateMatrixWorld(true);
  };

  for (let t = 0; t < 1; t += dt) hold(ahead);
  const settled = at(chain.effector);
  for (let t = 0; t < 0.25; t += dt) hold(inChest);

  let seconds = 0;
  let firstMiss = 0;
  for (let frame = 0; seconds < 5; frame++) {
    hold(ahead);
    seconds += dt;
    const miss = at(chain.effector).distanceTo(settled);
    if (frame === 0) firstMiss = miss;
    if (miss <= 0.01) break;
  }
  return { firstMiss, seconds };
}

describe.skipIf(!avatarAssetsPresent())("arm clearance recovery", () => {
  it("returns a pulled-in hand to its grip in the same short time at 30 and 120 fps", async () => {
    const slow = await recovery(30);
    const fast = await recovery(120);
    for (const run of [slow, fast]) {
      // The chest press must actually have pulled the hand in.
      expect(
        run.firstMiss,
        "metres short on the first frame back"
      ).toBeGreaterThan(0.05);
      expect(run.seconds, "seconds until the wrist is back").toBeLessThan(0.4);
    }
    expect(Math.abs(slow.seconds - fast.seconds)).toBeLessThan(1 / 30 + 1e-6);
  }, 120_000);
});
