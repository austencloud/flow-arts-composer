import { Euler, Quaternion, Vector3, type Object3D } from "three";
import type { AvatarServices } from "@austencloud/scene-3d/worker";
import type {
  WorkerPerformerLocomotionSnapshot,
  WorkerVector3,
} from "../domain/worker-renderer-protocol";

const LOCOMOTION_BASE = "/animations/locomotion-pack/";
const TURNS_BASE = "/animations/turns/";

type LocomotionStateValue = ReturnType<
  NonNullable<AvatarServices["stateMachine"]>["getState"]
>;

export interface WorkerPerformerLocomotionFrame {
  facingAngle: number;
  offset: WorkerVector3;
}

function turnPoseWeight(phase: number): number {
  const smootherStep = (value: number) => {
    const t = Math.max(0, Math.min(1, value));
    return t * t * t * (t * (t * 6 - 15) + 10);
  };
  const blendWindow = 0.18;
  return Math.min(
    smootherStep(phase / blendWindow),
    smootherStep((1 - phase) / blendWindow)
  );
}

function blendRadians(from: number, to: number, weight: number): number {
  const twoPi = Math.PI * 2;
  const delta = ((((to - from + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
  return from + delta * weight;
}

/**
 * Worker-side owner of the same animation-service pipeline used by Avatar3D.
 *
 * Choreo timing stays on the application thread. This class only evaluates
 * the immutable gait, terminal-step and turn samples it receives, then applies
 * the package's canonical mixer, turn sampler and foot planter to the worker
 * skeleton before arm IK runs.
 */
export class WorkerPerformerLocomotion {
  private readonly services: AvatarServices;
  private readonly rootWorldQuaternion = new Quaternion();
  private readonly travelVector = new Vector3();
  private readonly turnBaseEuler = new Euler();
  private readonly turnAuthoredEuler = new Euler();
  private readonly turnBlendedEuler = new Euler();
  private locomotionState: LocomotionStateValue;
  private appliedSoleOffset = -1;
  private appliedToeOffset = -1;
  private appliedLockBlendInTime = -1;
  private ready = false;

  constructor(services: AvatarServices) {
    if (!services.stateMachine) {
      throw new Error("Worker locomotion requires an animation state machine");
    }
    this.services = services;
    this.locomotionState = services.stateMachine.getState();
  }

  async initialize(avatarRoot: Object3D): Promise<void> {
    const {
      locomotion,
      footPlanter,
      legIKSolver,
      contactCurveCache,
      turnAnimator,
      skeleton,
    } = this.services;

    locomotion.configure({});
    locomotion.initialize(avatarRoot);
    if (footPlanter && legIKSolver && contactCurveCache) {
      footPlanter.initialize(skeleton, legIKSolver, contactCurveCache);
    }

    const locomotionLoad = locomotion.loadAnimations({
      idle: `${LOCOMOTION_BASE}idle.glb`,
      forward: `${LOCOMOTION_BASE}walk-forward.glb`,
      backward: `${LOCOMOTION_BASE}walk-backward.glb`,
      strafeLeft: `${LOCOMOTION_BASE}strafe-left.glb`,
      strafeRight: `${LOCOMOTION_BASE}strafe-right.glb`,
      grapevineLeft: `${LOCOMOTION_BASE}grapevine-left.glb`,
      grapevineRight: `${LOCOMOTION_BASE}grapevine-right.glb`,
      runForward: `${LOCOMOTION_BASE}run.glb`,
      runStrafeLeft: `${LOCOMOTION_BASE}strafe-run-left.glb`,
      runStrafeRight: `${LOCOMOTION_BASE}strafe-run-right.glb`,
      jump: "/animations/jump-up.glb",
      fall: "/animations/falling-idle.glb",
      land: "/animations/hard-landing.glb",
      crouch: "/animations/crouch-idle.glb",
      terminalStops: {
        left: {
          animation: "/animations/terminal-stops/walk-stop-left.glb",
          motion: "/animations/terminal-stops/walk-stop-left.motion.json",
        },
        right: {
          animation: "/animations/terminal-stops/walk-stop-right.glb",
          motion: "/animations/terminal-stops/walk-stop-right.motion.json",
        },
      },
    });

    const turnLoad = turnAnimator
      ? turnAnimator
          .initialize(avatarRoot, [
            {
              angleDeg: 90,
              glbUrl: `${TURNS_BASE}turn-left-90.glb`,
              contactUrl: `${TURNS_BASE}turn-left-90.contact.json`,
              clipName: "turn-left-90",
              includeSpine: false,
            },
            {
              angleDeg: -90,
              glbUrl: `${TURNS_BASE}turn-right-90.glb`,
              contactUrl: `${TURNS_BASE}turn-right-90.contact.json`,
              clipName: "turn-right-90",
              includeSpine: false,
            },
            {
              angleDeg: 180,
              glbUrl: `${TURNS_BASE}turn-left-180.glb`,
              contactUrl: `${TURNS_BASE}turn-left-180.contact.json`,
              clipName: "turn-left-180",
              includeSpine: false,
            },
            {
              angleDeg: -180,
              glbUrl: `${TURNS_BASE}turn-right-180.glb`,
              contactUrl: `${TURNS_BASE}turn-right-180.contact.json`,
              clipName: "turn-right-180",
              includeSpine: false,
            },
          ])
          .then(() => {
            if (!contactCurveCache) return;
            for (const curve of turnAnimator.getContactCurves()) {
              contactCurveCache.register(curve);
            }
          })
      : Promise.resolve();

    const results = await Promise.allSettled([locomotionLoad, turnLoad]);
    for (const result of results) {
      if (result.status === "rejected") {
        console.warn(
          "[WorkerPerformer] Animation asset failed to load",
          result.reason
        );
      }
    }
    this.ready = true;
  }

  update(
    deltaSeconds: number,
    snapshot: WorkerPerformerLocomotionSnapshot,
    performerRoot: Object3D,
    baseFacingAngle: number,
    avatarHeight: number,
    groundY: number
  ): WorkerPerformerLocomotionFrame {
    if (!this.ready) {
      return { facingAngle: baseFacingAngle, offset: [0, 0, 0] };
    }

    const { locomotion, stateMachine, turnAnimator, skeleton, footPlanter } =
      this.services;
    locomotion.setGaitTimingSample?.(snapshot.gaitTimingSample);
    locomotion.setTerminalStepPlan?.(snapshot.terminalStepPlan);

    if (stateMachine) {
      const state = stateMachine.update(
        {
          hasMovementInput: snapshot.isMoving,
          horizontalSpeed: snapshot.moveSpeed,
          verticalVelocity: 0,
          isGrounded: true,
          isCrouching: false,
          isJumpRequested: false,
          moveDirection: snapshot.moveDirection,
          facingAngle: baseFacingAngle,
        },
        deltaSeconds
      );
      this.locomotionState = state.state;
      locomotion.setActiveState?.(state.state);
      locomotion.setLocomotion({
        isMoving: state.isMoving,
        speed: state.animationSpeed,
        facingAngle: state.facingAngle,
        moveDirection: state.moveDirection,
        lateralGait: snapshot.lateralGait,
      });
    }
    locomotion.update(deltaSeconds);

    const gaitClock = locomotion.getGaitClock?.();
    const terminalOwnsContact =
      gaitClock?.terminal?.status === "braking" ||
      gaitClock?.terminal?.status === "landed" ||
      gaitClock?.terminal?.status === "settled";
    if (terminalOwnsContact && stateMachine) {
      this.locomotionState = "walking" as LocomotionStateValue;
    }

    let facingAngle = baseFacingAngle;
    let offsetX = 0;
    let offsetZ = 0;
    let turnClipName: string | undefined;
    let turnPhase: number | undefined;
    const turn = snapshot.turnRequest;
    if (turn && turnAnimator?.isReady()) {
      const sample = turnAnimator.sample(turn);
      const poseWeight =
        turn.poseWeight === undefined
          ? turnPoseWeight(turn.phase)
          : Math.max(0, Math.min(1, turn.poseWeight));
      for (const [boneName, quaternion] of sample.boneRotations) {
        const bone = skeleton
          .getState()
          .bones.get(
            boneName as Parameters<
              ReturnType<typeof skeleton.getState>["bones"]["get"]
            >[0]
          );
        if (!bone) continue;
        if (boneName === "Hips") {
          this.turnBaseEuler.setFromQuaternion(bone.quaternion, "XYZ");
          this.turnAuthoredEuler.setFromQuaternion(quaternion, "XYZ");
          this.turnBlendedEuler.set(
            blendRadians(
              this.turnBaseEuler.x,
              this.turnAuthoredEuler.x,
              poseWeight
            ),
            blendRadians(
              this.turnBaseEuler.y,
              this.turnAuthoredEuler.y,
              poseWeight
            ),
            this.turnBaseEuler.z,
            "XYZ"
          );
          bone.quaternion.setFromEuler(this.turnBlendedEuler);
        } else {
          bone.quaternion.slerp(quaternion, poseWeight);
        }
      }
      facingAngle = turn.fromHeading + sample.yawDelta;
      if (sample.hipsPosition) {
        const cmToScene = avatarHeight / 170;
        const localX = sample.hipsPosition.x * cmToScene * poseWeight;
        const localZ = sample.hipsPosition.y * cmToScene * poseWeight;
        const cos = Math.cos(turn.fromHeading);
        const sin = Math.sin(turn.fromHeading);
        offsetX = localX * cos + localZ * sin;
        offsetZ = -localX * sin + localZ * cos;
      }
      if (sample.clipName) {
        turnClipName = sample.clipName;
        turnPhase = turn.phase;
      }
    }

    if (footPlanter?.isReady()) {
      performerRoot.updateWorldMatrix(true, false);
      let travelDirection: { x: number; z: number } | undefined;
      if (snapshot.moveDirection.x !== 0 || snapshot.moveDirection.z !== 0) {
        performerRoot.getWorldQuaternion(this.rootWorldQuaternion);
        this.travelVector
          .set(snapshot.moveDirection.x, 0, snapshot.moveDirection.z)
          .applyQuaternion(this.rootWorldQuaternion);
        travelDirection = {
          x: this.travelVector.x,
          z: this.travelVector.z,
        };
      }

      const soleOffset = locomotion.getSoleOffset?.() ?? 0;
      if (
        soleOffset > 0 &&
        Math.abs(soleOffset - this.appliedSoleOffset) > 1e-4
      ) {
        footPlanter.configure({ footHeightOffset: soleOffset });
        this.appliedSoleOffset = soleOffset;
      }
      const toeOffset = locomotion.getToeOffset?.() ?? -1;
      if (
        toeOffset >= 0 &&
        Math.abs(toeOffset - this.appliedToeOffset) > 1e-4
      ) {
        footPlanter.configure({ toeHeightOffset: toeOffset });
        this.appliedToeOffset = toeOffset;
      }
      const lockBlendInTime = terminalOwnsContact
        ? 0.3
        : turnClipName
          ? 0.18
          : 0.08;
      if (lockBlendInTime !== this.appliedLockBlendInTime) {
        footPlanter.configure({ lockBlendInTime });
        this.appliedLockBlendInTime = lockBlendInTime;
      }
      const contact = locomotion.getFootContact?.();
      footPlanter.update(deltaSeconds, {
        groundY: performerRoot.matrixWorld.elements[13] + groundY,
        locomotionState: this.locomotionState,
        isMoving: snapshot.isMoving || terminalOwnsContact,
        currentClipName: turnClipName,
        currentClipPhase: turnPhase,
        contactLeft: contact?.left,
        contactRight: contact?.right,
        lockConfidence: turnClipName
          ? 1
          : (locomotion.getFootPlantConfidence?.() ?? 1),
        strideScale: locomotion.getStrideScale?.() ?? 1,
        travelDirection,
        settlingPlants: locomotion.getSettlingPlants?.() ?? undefined,
      });
    }

    return { facingAngle, offset: [offsetX, 0, offsetZ] };
  }

  reset(): void {
    this.services.stateMachine?.reset();
    this.services.locomotion.reset();
    this.services.footPlanter?.reset();
    if (this.services.stateMachine) {
      this.locomotionState = this.services.stateMachine.getState();
    }
  }

  dispose(): void {
    this.services.locomotion.dispose();
    this.services.stateMachine?.dispose();
    this.services.footPlanter?.dispose();
    this.services.turnAnimator?.dispose();
  }
}
