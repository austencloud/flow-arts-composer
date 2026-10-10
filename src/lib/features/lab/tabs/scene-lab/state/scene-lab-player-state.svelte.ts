/**
 * Scene Lab Player State
 *
 * Reactive AvatarState for driving UnifiedCameraController in walk/fly mode.
 * Uses $state so Avatar3D picks up position/facing/locomotion changes each
 * frame — plain mutable objects caused the avatar mesh to stay at spawn
 * and the locomotion animator to never leave IDLE.
 *
 * No physics — the controller's kinematic branch writes directly to
 * position.x/y/z each frame, clamped to its built-in SCENE_BOUNDS (±50m).
 */

import type {
  AvatarState,
  PhysicsProvider,
} from "#lib/shared/3d/camera/types.js";
import { createFlycamPhysicsProvider } from "@austencloud/camera-3d";

export function createSceneLabPlayerState(): {
  avatarState: AvatarState;
  physicsProvider: PhysicsProvider;
  resetSpawn: () => void;
} {
  // position.y is the avatar's FEET. The camera controller adds its own eye
  // offset (1.6m in first-person) on top, and renders the avatar body from
  // the feet up. Spawning at y=0 puts feet on the snow, eye at 1.6m.
  //
  // $state so UCC's per-frame mutations propagate to Avatar3D's template.
  let position = $state({ x: 0, y: 0, z: 10 });
  let facingAngle = $state(0);
  let targetYaw = $state(0);
  let isMoving = $state(false);
  let moveDir = $state({ x: 0, z: 0 });
  let isCrouching = $state(false);
  const ROTATION_SPEED = 8;

  const avatarState: AvatarState = {
    get position() {
      return position;
    },
    get facingAngle() {
      return facingAngle;
    },
    get isMoving() {
      return isMoving;
    },
    get moveDirection() {
      return moveDir;
    },
    get isCrouching() {
      return isCrouching;
    },
    set isCrouching(v: boolean) {
      isCrouching = v;
    },
    setMoveInput(input: { x: number; z: number }) {
      moveDir = input;
      isMoving = input.x !== 0 || input.z !== 0;
    },
    updateMovement(_delta: number, _cameraAngle: number) {
      // No-op — the controller's kinematic branch writes position directly
      // when physicsProvider is null.
    },
    setFacingAngle(angle: number) {
      targetYaw = angle;
    },
    snapFacingAngle(angle: number) {
      facingAngle = angle;
      targetYaw = angle;
    },
    updateLocomotion(delta: number) {
      // Smooth yaw toward target so the facing direction doesn't snap.
      let diff = targetYaw - facingAngle;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      if (Math.abs(diff) < 0.01) {
        facingAngle = targetYaw;
      } else {
        const maxStep = ROTATION_SPEED * delta;
        facingAngle += Math.sign(diff) * Math.min(Math.abs(diff), maxStep);
      }
    },
  };

  function resetSpawn() {
    position.x = 0;
    position.y = 0;
    position.z = 10;
    facingAngle = 0;
    targetYaw = 0;
    isMoving = false;
    moveDir = { x: 0, z: 0 };
    isCrouching = false;
  }

  const physicsProvider = createFlycamPhysicsProvider(position);

  return { avatarState, physicsProvider, resetSpawn };
}
