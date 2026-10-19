<script lang="ts">
  /**
   * Where the right shoulder actually is, this frame.
   *
   * The pose diagnostics the performer publishes carry the elbow, the wrist,
   * the palm and the shoulder WIDTH, but not the shoulder's world point:
   * `BodySnapshot.rightShoulder` exists inside the scene package and is not
   * among the values handed to `onCollisionEvents`. Three of the document's
   * measurements are anchored on that joint — whether the thumb end is above
   * the shoulder, how far past the shoulder's own frontal plane it travels,
   * and how much of the arm's length is spent — so without it the lab would be
   * reporting a guess and calling it a finding.
   *
   * This reads the bone off the rendered scene graph instead, which is the same
   * thing `GaitProbe` does for legs and for the same reason: what matters is
   * where the joint ended up after the animator, the IK and the arm solve have
   * each had their turn, not what any one of them intended.
   *
   * It renders nothing and writes nothing back into the scene.
   */

  import { useScene, useScheduler, useTask } from "@threlte/core";
  import { Vector3, type Object3D } from "three";

  interface Props {
    /** Called with the joint in world space, or null while no rig is found. */
    onShoulder: (point: { x: number; y: number; z: number } | null) => void;
    /** How often the scene is re-scanned for the bone, in seconds. */
    rescanInterval?: number;
  }

  let { onShoulder, rescanInterval = 1.5 }: Props = $props();

  const { scene } = useScene();
  const { renderStage } = useScheduler();

  /**
   * The package's own aliases for this joint, restated rather than re-derived:
   * `AvatarSkeletonBuilder`'s `BONE_NAME_ALIASES.RightArm`, same names and
   * same order. The table is not exported, and inventing a second spelling
   * list is how a probe starts disagreeing with the rig it is measuring.
   */
  const RIGHT_ARM_ALIASES = [
    "RightArm",
    "r_arm",
    "arm.R",
    "upperarm_r",
    "RightUpperArm",
  ] as const;

  let bone: Object3D | null = null;
  let sinceRescan = Infinity;
  const world = new Vector3();
  let reported: string | null = null;

  function findRightArm(): Object3D | null {
    const bones: Object3D[] = [];
    scene.traverse((node) => {
      if ((node as { isBone?: boolean }).isBone) bones.push(node);
    });

    // Exact match first, then contains — the builder's own order. A rig whose
    // bone is `mixamorigRightArm` must not be claimed by a contains match on
    // some other alias before its real name has been tried everywhere.
    for (const alias of RIGHT_ARM_ALIASES) {
      const exact = bones.find(
        (candidate) => candidate.name.toLowerCase() === alias.toLowerCase()
      );
      if (exact) return exact;
    }
    for (const alias of RIGHT_ARM_ALIASES) {
      const loose = bones.find((candidate) =>
        candidate.name.toLowerCase().includes(alias.toLowerCase())
      );
      if (loose) return loose;
    }
    return null;
  }

  useTask(
    (delta) => {
      sinceRescan += delta;
      // A body does not grow an arm mid-frame, and a bone lookup walks the
      // whole subtree, so the scan is slow and the read is per-frame.
      if (!bone || !bone.parent || sinceRescan >= rescanInterval) {
        sinceRescan = 0;
        bone = findRightArm();
      }

      if (!bone) {
        if (reported !== null) {
          reported = null;
          onShoulder(null);
        }
        return;
      }

      bone.getWorldPosition(world);
      // Reporting through a rounded signature rather than every frame keeps a
      // held pose from re-rendering the readouts sixty times a second while it
      // is not moving. A tenth of a millimetre is far below anything the panel
      // shows.
      const signature = `${world.x.toFixed(4)},${world.y.toFixed(4)},${world.z.toFixed(4)}`;
      if (signature === reported) return;
      reported = signature;
      onShoulder({ x: world.x, y: world.y, z: world.z });
    },
    // The render stage: by here the frame is settled, which is the pose the
    // reader is looking at and arguing with.
    { stage: renderStage }
  );
</script>
