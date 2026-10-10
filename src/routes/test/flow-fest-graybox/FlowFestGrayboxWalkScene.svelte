<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { T, useTask, useThrelte } from "@threlte/core";
  import { CameraMode, UnifiedCameraController } from "@austencloud/camera-3d";
  import type {
    AvatarState,
    CameraCollisionProbe,
    PhysicsProvider,
  } from "@austencloud/camera-3d";
  import type { FlowFestProductionCollisionSet } from "#lib/features/flow-fest-sim/domain/flow-fest-simulation-contract.js";
  import {
    FLOW_FEST_EUC_CONFIG,
    createFlowFestElectricUnicycleDynamics,
    deriveFlowFestEucTerrainAttitude,
    flowFestEucTraversalEnvelope,
    type FlowFestElectricUnicycleDynamics,
    type FlowFestElectricUnicycleInput,
    type FlowFestElectricUnicycleTerrainAttitude,
    type FlowFestStandardGamepadSample,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-electric-unicycle.js";
  import {
    FLOW_FEST_EUC_CONTACT_THRESHOLDS,
    FLOW_FEST_EUC_PEDAL_SEPARATION_METERS,
    FLOW_FEST_EUC_PEDAL_SURFACE_HEIGHT_METERS,
    type FlowFestEucMountedPoseDiagnostic,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-euc-mounted-pose.js";
  import { FlowFestElectricUnicycleDrive } from "#lib/features/flow-fest-sim/services/flow-fest-electric-unicycle-drive.js";
  import {
    FLOW_FEST_CAR_EDGE_MESSAGE,
    FlowFestCarDrive,
    type FlowFestCarDriveFrame,
  } from "#lib/features/flow-fest-sim/services/flow-fest-car-drive.js";
  import {
    FLOW_FEST_CAR_CONFIG,
    createFlowFestCarDynamics,
    flowFestCarCargoSetDownPoint,
    flowFestCarDriverDoorPoint,
    flowFestCarSpec,
    type FlowFestCarDynamics,
    type FlowFestCarSpec,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-car.js";
  import {
    FLOW_FEST_GROUND_VEHICLE_IDLE_INPUT,
    type FlowFestGroundVehicleInput,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-ground-vehicle.js";
  import {
    mobilityCarDynamicsFromSnapshot,
    mobilityDynamicsFromSnapshot,
    type FlowFestMobilityRuntimeUpdate,
    type FlowFestMobilitySnapshot,
  } from "#lib/features/flow-fest-sim/state/flow-fest-mobility-state.svelte.js";
  import {
    Euler,
    Mesh,
    Quaternion,
    TextureLoader,
    Vector3,
    type Group,
    type PerspectiveCamera,
    type WebGLRenderer,
  } from "three";
  import {
    loadGeospatialEvidenceLayers,
    loadGeospatialTerrain,
    parseGeospatialTerrainManifest,
  } from "#lib/shared/3d/procedural-engine/generation/geospatial-terrain.js";
  import { buildFlowFestEntranceGradedTerrain } from "../flow-fest-sim/flow-fest-entrance-terrain";
  import {
    FLOW_FEST_CAMP_PLAN_BOUNDS,
    createFlowFestCampPlan,
    identifyFlowFestPlanLocation,
    type FlowFestCampPlan,
    type FlowFestGateQueueCar,
  } from "../flow-fest-sim/flow-fest-camp-plan";
  import {
    createPhysicsWorldState,
    createRigidBody,
    castRay,
    disposePhysicsWorld,
    initPhysicsWorld,
    removeRigidBody,
    stepPhysics,
  } from "#lib/shared/3d/physics/rapier-world.js";
  import {
    createPlayerController,
    disposePlayerController,
  } from "#lib/shared/3d/physics/player-controller.js";
  import { createRapierPhysicsProvider } from "#lib/shared/3d/physics/rapier-physics-provider.js";
  import type {
    PhysicsWorldState,
    PhysicsBodyComponent,
    PlayerControllerState,
  } from "#lib/shared/3d/physics/types.js";
  import {
    buildFlowFestTerrainHost,
    buildFlowFestChunkSeamTraversal,
    flowFestColliderWindowKey,
    sampleFlowFestTerrainWorldY,
    type FlowFestTerrainHost,
    type FlowFestTerrainHostMode,
  } from "./flow-fest-terrain-host";
  import {
    allFlowFestSegments,
    horizontalToVerticalFovDegrees,
    loadFlowFestRuntimeContract,
    verticalToHorizontalFovDegrees,
    type FlowFestBranchId,
    type FlowFestReviewCamera,
    type FlowFestRuntimeContract,
  } from "./flow-fest-runtime-contract";
  import {
    auditFlowFestBarrierTopology,
    buildFlowFestLidarBarrierGeometry,
    buildFlowFestReviewOverlay,
    type FlowFestBarrierGeometry,
  } from "./flow-fest-review-geometry";
  import type { FlowFestGrayboxReadyDetails } from "./flow-fest-graybox-types";
  import FlowFestElectricUnicycle from "../flow-fest-sim/FlowFestElectricUnicycle.svelte";
  import FlowFestDrivenCar from "../flow-fest-sim/FlowFestDrivenCar.svelte";
  import { FLOW_FEST_WORLD_STEP_TASK } from "../flow-fest-sim/flow-fest-frame-tasks";
  import FlowFestOnFootPlayer from "./FlowFestOnFootPlayer.svelte";
  import { type CharacterId } from "#lib/shared/3d/domain/character-model.js";

  interface Props {
    resetToken: number;
    cameraToken: number;
    cameraId: string | null;
    externalReviewCameras?: FlowFestReviewCamera[];
    stageToken?: number;
    stagePosition?: { x: number; z: number } | null;
    selectedBranch: FlowFestBranchId;
    hostMode: FlowFestTerrainHostMode;
    moveSpeedMetersPerSecond?: number;
    sprintMultiplier?: number;
    /**
     * Horizontal acceleration and braking in m/s^2. Omitted means the instant
     * velocity this scene has always had, which is what the review harnesses
     * measure distance-over-time against; the gameplay host supplies real
     * rates so the walker has mass.
     */
    groundAccelerationMetersPerSecondSquared?: number;
    groundDecelerationMetersPerSecondSquared?: number;
    jumpForce?: number;
    enableSprint?: boolean;
    enableJump?: boolean;
    enableCrouch?: boolean;
    showReviewOverlay?: boolean;
    /**
     * The graybox walk owns a fixed daylight rig so it can be inspected on its
     * own. A host that supplies a time-of-day rig — the production layer's
     * visual profile — must pass "none". The graybox key light and hemisphere
     * sum to 2.95 in three.js light units against the night profile's 0.37, so
     * leaving them on renders 2:13 AM as an overcast noon.
     */
    ambientLighting?: "graybox-daylight" | "none";
    collisionMode?: "measured-topology" | "visible-production";
    productionCollision?: FlowFestProductionCollisionSet | null;
    productionCampEstablished?: boolean;
    productionFestivalActive?: boolean;
    /** Other arrivals queued at the gate; each gets a static body like a parked car. */
    gateQueueCars?: readonly FlowFestGateQueueCar[];
    electricUnicycleEnabled?: boolean;
    /**
     * The character the player wears on foot. It defaults to the wheel's
     * rider so stepping off the unicycle does not change who you are; a host
     * that lets the player pick one passes that choice through here.
     */
    playerCharacterId?: CharacterId;
    /**
     * Freeze the controls while a full-screen panel owns the input. The
     * loadout screen sits over the site: nothing behind it may move, and no
     * key pressed on the panel may reach the wheel or the body.
     */
    inputLocked?: boolean;
    electricUnicycleRevision?: number;
    electricUnicycleSnapshot?: FlowFestMobilitySnapshot | null;
    electricUnicycleLightsOn?: boolean;
    onReady?: (details: FlowFestGrayboxReadyDetails) => void;
    onPositionChange?: (position: { x: number; y: number; z: number }) => void;
    onViewRotationChange?: (yaw: number, pitch: number) => void;
    /**
     * The live camera eye rather than the body centre: its world position plus
     * the yaw and pitch it is aimed with, reported alongside the position task.
     *
     * A consumer that wants to describe "the view I am looking at right now"
     * must read the camera the frame was actually drawn from. Deriving it from
     * the body position and a fixed eye height is wrong the moment the player
     * crouches or mounts the wheel, both of which move the eye without moving
     * the body centre by the same amount.
     */
    onCameraPoseChange?: (pose: {
      x: number;
      y: number;
      z: number;
      yawRadians: number;
      pitchRadians: number;
      horizontalFovDegrees: number;
    }) => void;
    onElectricUnicycleChange?: (update: FlowFestMobilityRuntimeUpdate) => void;
    onError?: (message: string) => void;
  }

  const props: Props = $props();
  const { renderer, size } = useThrelte() as unknown as {
    renderer: WebGLRenderer;
    size: {
      subscribe: (
        run: (value: { width: number; height: number }) => void
      ) => () => void;
    };
  };
  const MANIFEST_PATH = "/data/flow-fest-sim/terrain.manifest.json";
  const PLAYER_RADIUS = 0.3;
  const PLAYER_HALF_HEIGHT = 0.55;
  const PLAYER_OFFSET = 0.02;
  const BODY_CENTRE_ABOVE_GROUND =
    PLAYER_HALF_HEIGHT + PLAYER_RADIUS + PLAYER_OFFSET;
  const EYE_HEIGHT = 1.7;
  /**
   * The same character the wheel already renders, so stepping off the
   * unicycle does not change who you are. The scene package's own default is
   * its untextured x-bot mannequin, which is a placeholder rather than a
   * person and must never be what the player sees.
   */
  const DEFAULT_PLAYER_CHARACTER_ID: CharacterId =
    FLOW_FEST_EUC_CONFIG.riderAvatarId;
  const CAMERA_OFFSET = EYE_HEIGHT - BODY_CENTRE_ABOVE_GROUND;
  /**
   * Below this the rig is first person and the body already carries the camera.
   * The first-person rig still nudges the eye 5 cm forward, so the floor sits
   * well above that rather than treating the nudge as a chase boom.
   */
  const MINIMUM_RIG_BOOM_METERS = 0.25;
  /** Above this the reading is a rig mid-settle, not a real chase distance. */
  const MAXIMUM_RIG_BOOM_METERS = 12;
  /** Frames a deferred boom correction may wait for the rig to produce one. */
  const RIG_CORRECTION_FRAME_BUDGET = 90;
  /** Past this the player has taken over and the correction is not ours to make. */
  const RIG_CORRECTION_DRIFT_TOLERANCE_METERS = 0.5;
  const DESTINATION_ID = "flow-fest-gate2-measured-walk";
  const REVIEW_WALK_SPEED_METERS_PER_SECOND = 1.2;
  /** Per-second convergence rate for the smoothed ground speed. */
  const GROUND_SPEED_SMOOTHING = 12;
  const CHUNK_SIZE_METERS = 32;
  const CHUNK_COLLIDER_BUFFER_METERS = 64;

  let physicsState: PhysicsWorldState | null = null;
  let playerState: PlayerControllerState | null = null;
  let physicsProvider = $state<PhysicsProvider | null>(null);
  let electricUnicycleDrive: FlowFestElectricUnicycleDrive | null = null;
  let terrainHost = $state<FlowFestTerrainHost | null>(null);
  let overlay = $state<Group | null>(null);
  let barrier = $state<FlowFestBarrierGeometry | null>(null);
  let contract = $state<FlowFestRuntimeContract | null>(null);
  let terrain: Awaited<ReturnType<typeof loadGeospatialTerrain>> | null = null;
  let initialized = $state(false);
  let disposed = false;
  const probeThirdPersonCameraCollision: CameraCollisionProbe = (
    origin,
    direction,
    maxDistance
  ) => {
    if (!physicsState?.world || !playerState) return null;
    return (
      castRay(
        physicsState,
        origin,
        direction,
        maxDistance,
        playerState.collider
      )?.distance ?? null
    );
  };
  let appliedResetToken = props.resetToken;
  let appliedCameraToken = props.cameraToken;
  let appliedStageToken = props.stageToken ?? 0;
  let appliedBranch: FlowFestBranchId | null = null;
  let cameraRevision = $state(0);
  let reviewCamera = $state<PerspectiveCamera>();
  let initialPitch = $state(0);
  let activeHorizontalFov = $state(65);
  let playerYaw = $state(0);
  let targetPlayerYaw = $state(0);
  let playerPosition = $state({ x: 340, y: 12, z: -20 });
  let electricUnicycleMounted = $state(false);
  let electricUnicycleDynamics = $state<FlowFestElectricUnicycleDynamics>(
    createFlowFestElectricUnicycleDynamics()
  );
  let electricUnicycleInput = $state<FlowFestElectricUnicycleInput>({
    throttle: 0,
    brake: 0,
    steer: 0,
    performanceMode: false,
    source: "none",
  });
  let electricUnicycleWheelPosition = $state({ x: 340, y: 12, z: -20 });
  let electricUnicycleTerrainAttitude =
    $state<FlowFestElectricUnicycleTerrainAttitude>({
      pitchRadians: 0,
      rollRadians: 0,
      roughnessMeters: 0,
    });
  let electricUnicycleParkedBody: PhysicsBodyComponent | null = null;
  /**
   * The car the player arrived in. It wraps the wheel's drive exactly as the
   * wheel wraps Rapier: while driving, the wheel is cargo and its drive is a
   * pass-through; parked, the car is a static box the on-foot body walks
   * around. Nothing here exists until the loadout screen sends a car through
   * the mobility snapshot.
   */
  let carDrive: FlowFestCarDrive | null = null;
  let car = $state<{ modelId: string; paintIndex: number } | null>(null);
  let carDriving = $state(false);
  let carDynamics = $state<FlowFestCarDynamics>(createFlowFestCarDynamics());
  let carInput: FlowFestGroundVehicleInput =
    FLOW_FEST_GROUND_VEHICLE_IDLE_INPUT;
  /** Body centre on the ground plane; the visual settles its own height. */
  let carPosition = $state({ x: 0, z: 0 });
  let carParkedBody: PhysicsBodyComponent | null = null;
  let gateQueueBodies: PhysicsBodyComponent[] = [];
  let carCollisionLimited = false;
  let carEdgeLimited = false;
  /** The wheel rides in the car: no body, no collider, no mount prompt. */
  let electricUnicycleCargo = $state(false);
  let carEnvironmentFrame = 0;
  let campPlan: FlowFestCampPlan | null = null;
  let campPlanBranch: FlowFestBranchId | null = null;
  const carRotation = new Quaternion();
  const carRotationEuler = new Euler();
  let electricUnicycleLongitudinalAcceleration = $state(0);
  /**
   * A review-camera teleport that ran before the chase rig had produced a frame,
   * waiting to redo itself once the boom can be measured. See
   * `reviewCameraRigBoom`.
   */
  let pendingRigCorrection: {
    cameraId: string;
    expectedX: number;
    expectedZ: number;
    framesRemaining: number;
  } | null = null;
  // View angles and the scratch vector behind `onCameraPoseChange`. Held
  // outside `$state` because nothing in this component renders from them; they
  // are read once per frame by the position task and handed straight out.
  let viewYawRadians = 0;
  let viewPitchRadians = 0;
  const cameraWorldPosition = new Vector3();
  /**
   * Last mounted-pose report. Held outside `$state` on purpose: it lands every
   * frame, and the runtime-proof surface samples it at its own throttle rather
   * than re-rendering the scene sixty times a second for a diagnostic.
   */
  let electricUnicycleMountedPose: FlowFestEucMountedPoseDiagnostic | null =
    null;
  let electricUnicycleGamepadConnected = $state(false);
  let electricUnicycleCollisionLimited = $state(false);
  let electricUnicycleTraversalDiagnostics = $state<{
    grounded: boolean;
    actualVelocity: { x: number; y: number; z: number };
    requestedVelocity: { x: number; y: number; z: number };
  } | null>(null);
  let electricUnicycleInteractionMessage = $state("Park wheel");
  /** Shift held, from the camera controller's own key set. */
  let sprintHeld = $state(false);
  let electricUnicycleKeyPressed = false;
  let electricUnicycleGamepadButtonPressed = false;
  let lastElectricUnicycleReportAt = 0;
  let appliedElectricUnicycleRevision = props.electricUnicycleRevision ?? 0;
  let isMoving = $state(false);
  let moveDirection = $state({ x: 0, z: 0 });
  /**
   * Sprint only where a run clip exists.
   *
   * The locomotion pack has a forward run and both lateral runs; it has no
   * backward run. Multiplying a backpedal asks the walk-backward clip for
   * roughly four times its own 1.004 m/s, which saturates stride and rate and
   * turns retreating into a moonwalk. Holding Shift while reversing therefore
   * buys nothing until someone authors the clip. Sideways-and-back keeps the
   * sprint, because the lateral run carries that component.
   */
  const effectiveSprintMultiplier = $derived(
    moveDirection.z < 0 ? 1 : (props.sprintMultiplier ?? 1)
  );
  /**
   * The body's real horizontal speed, not the configured one. Sprinting,
   * slopes, and collision limiting all change how fast the character is
   * actually travelling, and the locomotion animator picks its gait from
   * that number - feeding it the configured walk speed makes the legs skate
   * whenever the two disagree.
   */
  let measuredGroundSpeed = $state(0);
  let measuredVerticalVelocity = $state(0);
  let measuredGrounded = $state(true);
  let loadStartedAt = 0;
  let frameTimes: number[] = [];
  let performanceWarmupFrames = 0;
  let performanceCaptureOrdinal = 0;
  let missingColliderFrames = 0;
  const activeTerrainBodies = new Map<string, PhysicsBodyComponent>();
  let activeTerrainColliderWindowKey: string | null = null;
  let productionCollisionBodies: PhysicsBodyComponent[] = [];
  let mountedProductionCollision: FlowFestProductionCollisionSet | null = null;
  let mountedCampEstablished = false;
  let mountedFestivalActive = false;
  let activeCameraMode = CameraMode.THIRD_PERSON;
  const readinessTimeline: Record<string, number> = {};
  const cameraAspect = $derived(
    $size.height > 0 ? $size.width / $size.height : 16 / 9
  );
  const verticalCameraFov = $derived(
    horizontalToVerticalFovDegrees(activeHorizontalFov, cameraAspect)
  );

  function sampleElectricUnicycleTerrainAttitude(): void {
    if (!terrain) return;
    const { x, z } = electricUnicycleWheelPosition;
    const heading = electricUnicycleDynamics.headingRadians;
    const forwardX = Math.sin(heading);
    const forwardZ = Math.cos(heading);
    const leftX = Math.cos(heading);
    const leftZ = -Math.sin(heading);
    const longitudinalOffset = 0.55;
    const lateralOffset = 0.39;
    electricUnicycleTerrainAttitude = deriveFlowFestEucTerrainAttitude({
      centerMeters: sampleFlowFestTerrainWorldY(terrain, x, z),
      forwardMeters: sampleFlowFestTerrainWorldY(
        terrain,
        x + forwardX * longitudinalOffset,
        z + forwardZ * longitudinalOffset
      ),
      rearMeters: sampleFlowFestTerrainWorldY(
        terrain,
        x - forwardX * longitudinalOffset,
        z - forwardZ * longitudinalOffset
      ),
      leftMeters: sampleFlowFestTerrainWorldY(
        terrain,
        x + leftX * lateralOffset,
        z + leftZ * lateralOffset
      ),
      rightMeters: sampleFlowFestTerrainWorldY(
        terrain,
        x - leftX * lateralOffset,
        z - leftZ * lateralOffset
      ),
      longitudinalSpanMeters: longitudinalOffset * 2,
      lateralSpanMeters: lateralOffset * 2,
    });
  }

  function updateActiveColliderProof(): void {
    const proof = (globalThis as Record<string, unknown>).__flowFestGate2 as
      | {
          terrain?: Record<string, unknown>;
          readiness?: Record<string, unknown>;
        }
      | undefined;
    if (proof?.terrain) {
      proof.terrain.activeColliderMeshes = activeTerrainBodies.size;
    }
    if (proof?.readiness) {
      proof.readiness.missingColliderFrames = missingColliderFrames;
    }
  }

  function updateProductionCollisionProof(): void {
    const proof = (globalThis as Record<string, unknown>).__flowFestGate2 as
      | Record<string, unknown>
      | undefined;
    if (!proof) return;
    proof.productionCollision = {
      mode: props.collisionMode ?? "measured-topology",
      invisibleTopologyScreenActive:
        (props.collisionMode ?? "measured-topology") === "measured-topology",
      activeBodies: productionCollisionBodies.length,
      staticVisibleObjects:
        props.productionCollision?.staticMesh.visibleObjectCount ?? 0,
      campEstablishedVisibleObjects: props.productionCampEstablished
        ? (props.productionCollision?.campEstablishedMesh.visibleObjectCount ??
          0)
        : 0,
      festivalActiveVisibleObjects: props.productionFestivalActive
        ? (props.productionCollision?.festivalActiveMesh.visibleObjectCount ??
          0)
        : 0,
    };
  }

  function clearProductionCollisionBodies(): void {
    if (physicsState) {
      for (const body of productionCollisionBodies) {
        removeRigidBody(physicsState, body);
      }
    }
    productionCollisionBodies = [];
  }

  function mountProductionCollisionMesh(
    mesh: FlowFestProductionCollisionSet["staticMesh"]
  ): void {
    if (!physicsState || mesh.visibleObjectCount === 0) return;
    const body = createRigidBody(
      physicsState,
      { type: "static", position: { x: 0, y: 0, z: 0 } },
      {
        type: "trimesh",
        vertices: mesh.vertices,
        indices: mesh.indices,
        friction: 0.8,
      }
    );
    if (body) productionCollisionBodies.push(body);
  }

  function reconcileProductionCollision(
    collision: FlowFestProductionCollisionSet | null | undefined,
    campEstablished: boolean,
    festivalActive: boolean
  ): void {
    if (
      !initialized ||
      !physicsState?.world ||
      (props.collisionMode ?? "measured-topology") !== "visible-production"
    ) {
      return;
    }
    if (
      collision === mountedProductionCollision &&
      campEstablished === mountedCampEstablished &&
      festivalActive === mountedFestivalActive
    ) {
      return;
    }
    clearProductionCollisionBodies();
    mountedProductionCollision = collision ?? null;
    mountedCampEstablished = campEstablished;
    mountedFestivalActive = festivalActive;
    if (collision) {
      mountProductionCollisionMesh(collision.staticMesh);
      if (campEstablished) {
        mountProductionCollisionMesh(collision.campEstablishedMesh);
      }
      if (festivalActive) {
        mountProductionCollisionMesh(collision.festivalActiveMesh);
      }
      stepPhysics(physicsState, 1 / 120);
    }
    updateProductionCollisionProof();
  }

  function ensureTerrainColliders(
    x: number,
    z: number,
    pruneDistant = true
  ): boolean {
    if (!physicsState?.world || !terrainHost) return false;

    const nextWindowKey =
      props.hostMode === "bounded-static"
        ? "bounded-static"
        : terrain
          ? flowFestColliderWindowKey(
              x,
              z,
              terrain.worldBounds,
              CHUNK_SIZE_METERS
            )
          : null;
    if (
      pruneDistant &&
      nextWindowKey !== null &&
      nextWindowKey === activeTerrainColliderWindowKey
    ) {
      return true;
    }
    if (!pruneDistant) activeTerrainColliderWindowKey = null;

    const desired = new Set<string>();
    for (const collider of terrainHost.colliders) {
      const isNeeded =
        props.hostMode === "bounded-static" ||
        (Math.abs(collider.centerX - x) <=
          CHUNK_COLLIDER_BUFFER_METERS + collider.halfExtentX &&
          Math.abs(collider.centerZ - z) <=
            CHUNK_COLLIDER_BUFFER_METERS + collider.halfExtentZ);
      if (!isNeeded) continue;
      desired.add(collider.name);
      if (activeTerrainBodies.has(collider.name)) continue;

      const body = createRigidBody(
        physicsState,
        { type: "static", position: { x: 0, y: 0, z: 0 } },
        {
          type: "trimesh",
          vertices: collider.vertices,
          indices: collider.indices,
          friction: 0.8,
        }
      );
      if (body) activeTerrainBodies.set(collider.name, body);
    }

    if (pruneDistant) {
      for (const [name, body] of activeTerrainBodies) {
        if (desired.has(name)) continue;
        removeRigidBody(physicsState, body);
        activeTerrainBodies.delete(name);
      }
    }

    const containingColliderIsActive = terrainHost.colliders.some(
      (collider) =>
        activeTerrainBodies.has(collider.name) &&
        Math.abs(collider.centerX - x) <= collider.halfExtentX + 1e-6 &&
        Math.abs(collider.centerZ - z) <= collider.halfExtentZ + 1e-6
    );
    activeTerrainColliderWindowKey =
      pruneDistant && containingColliderIsActive ? nextWindowKey : null;
    updateActiveColliderProof();
    return containingColliderIsActive;
  }

  function auditDynamicTerrainTraversal(): Record<string, unknown> {
    if (!physicsState || !playerState || !terrain || !contract) {
      return { status: "not-ready" };
    }
    const savedPosition =
      physicsProvider?.getPlayerPosition() ?? playerPosition;
    let samples = 0;
    let seamCrossings = 0;
    let seamAdjacentProbes = 0;
    let endpointProbes = 0;
    let colliderWindowTransitions = 0;
    let missingColliderSamples = 0;
    let missingGroundHits = 0;
    let maximumAbsoluteErrorMeters = 0;
    let minimumActiveColliders = Number.POSITIVE_INFINITY;
    let maximumActiveColliders = 0;
    let previousWindow = "";

    for (const segment of allFlowFestSegments(contract).filter(
      (candidate) => candidate.mode === "person"
    )) {
      for (let leg = 1; leg < segment.points.length; leg += 1) {
        const start = segment.points[leg - 1]!;
        const end = segment.points[leg]!;
        const traversal = buildFlowFestChunkSeamTraversal(
          start,
          end,
          terrain.worldBounds,
          CHUNK_SIZE_METERS
        );
        seamCrossings += traversal.seamCrossings;
        seamAdjacentProbes += traversal.seamAdjacentProbes;
        endpointProbes += traversal.endpointProbes;
        for (const { x, z } of traversal.probes) {
          samples += 1;

          if (!ensureTerrainColliders(x, z)) missingColliderSamples += 1;
          const window = [...activeTerrainBodies.keys()].sort().join("|");
          if (previousWindow && window !== previousWindow) {
            colliderWindowTransitions += 1;
          }
          previousWindow = window;
          minimumActiveColliders = Math.min(
            minimumActiveColliders,
            activeTerrainBodies.size
          );
          maximumActiveColliders = Math.max(
            maximumActiveColliders,
            activeTerrainBodies.size
          );

          physicsProvider?.teleport?.(bodyPositionAt(x, z));
          stepPhysics(physicsState, 1 / 120);
          const expected = sampleFlowFestTerrainWorldY(terrain, x, z);
          const hit = castRay(
            physicsState,
            { x, y: 60, z },
            { x: 0, y: -1, z: 0 },
            100,
            playerState.collider
          );
          if (!hit) {
            missingGroundHits += 1;
          } else {
            maximumAbsoluteErrorMeters = Math.max(
              maximumAbsoluteErrorMeters,
              Math.abs(hit.point.y - expected)
            );
          }
        }
      }
    }

    ensureTerrainColliders(savedPosition.x, savedPosition.z);
    physicsProvider?.teleport?.(savedPosition);
    stepPhysics(physicsState, 1 / 120);
    const status =
      samples > 0 &&
      samples === seamAdjacentProbes + endpointProbes &&
      seamCrossings > 0 &&
      missingColliderSamples === 0 &&
      missingGroundHits === 0 &&
      maximumAbsoluteErrorMeters <= 0.05 &&
      maximumActiveColliders <= 36
        ? "passed"
        : "failed";
    return {
      status,
      samples,
      seamCrossings,
      seamAdjacentProbes,
      endpointProbes,
      colliderWindowTransitions,
      missingColliderSamples,
      missingGroundHits,
      maximumAbsoluteErrorMeters,
      minimumActiveColliders: Number.isFinite(minimumActiveColliders)
        ? minimumActiveColliders
        : 0,
      maximumActiveColliders,
    };
  }

  const avatarState: AvatarState = {
    get position() {
      return playerPosition;
    },
    get facingAngle() {
      return playerYaw;
    },
    get isMoving() {
      return isMoving;
    },
    get moveDirection() {
      return moveDirection;
    },
    setMoveInput(input) {
      moveDirection = input;
      isMoving = input.x !== 0 || input.z !== 0;
    },
    updateMovement() {},
    setFacingAngle(angle) {
      if (electricUnicycleMounted) {
        playerYaw = electricUnicycleDynamics.headingRadians;
        targetPlayerYaw = electricUnicycleDynamics.headingRadians;
        return;
      }
      targetPlayerYaw = angle;
    },
    snapFacingAngle(angle) {
      playerYaw = angle;
      targetPlayerYaw = angle;
    },
    updateLocomotion(delta) {
      if (electricUnicycleMounted) {
        playerYaw = electricUnicycleDynamics.headingRadians;
        targetPlayerYaw = electricUnicycleDynamics.headingRadians;
        return;
      }
      let difference = targetPlayerYaw - playerYaw;
      while (difference > Math.PI) difference -= Math.PI * 2;
      while (difference < -Math.PI) difference += Math.PI * 2;
      const step = Math.min(Math.abs(difference), 12 * delta);
      playerYaw += Math.sign(difference) * step;
    },
  };

  function bodyPositionAt(
    x: number,
    z: number
  ): { x: number; y: number; z: number } {
    if (!terrain) return { x, y: 50, z };
    return {
      x,
      y: sampleFlowFestTerrainWorldY(terrain, x, z) + BODY_CENTRE_ABOVE_GROUND,
      z,
    };
  }

  function yawPitchForCamera(camera: FlowFestReviewCamera): {
    yaw: number;
    pitch: number;
  } {
    const dx = camera.targetWorld[0] - camera.positionWorld[0];
    const dz = camera.targetWorld[2] - camera.positionWorld[2];
    const horizontal = Math.hypot(dx, dz);
    return {
      yaw: Math.atan2(dx, dz),
      pitch: Math.atan2(
        camera.positionWorld[1] - camera.targetWorld[1],
        horizontal
      ),
    };
  }

  function resetToGate(): void {
    if (!contract) return;
    resetCarState();
    const [x, , z] = contract.spawn.positionWorld;
    const position = bodyPositionAt(x, z);
    ensureTerrainColliders(x, z);
    const lowerGateCamera = contract.reviewCameras.find(
      (camera) => camera.id === "lower-gate"
    );
    const orientation = lowerGateCamera
      ? yawPitchForCamera(lowerGateCamera)
      : { yaw: Math.PI, pitch: 0 };
    physicsProvider?.teleport?.(position);
    playerPosition = position;
    playerYaw = orientation.yaw;
    targetPlayerYaw = orientation.yaw;
    initialPitch = orientation.pitch;
    viewYawRadians = orientation.yaw;
    viewPitchRadians = orientation.pitch;
    activeHorizontalFov = lowerGateCamera?.horizontalFovDegrees ?? 65;
    if (props.electricUnicycleEnabled && electricUnicycleDrive && terrain) {
      clearElectricUnicycleParkedBody();
      electricUnicycleDynamics = createFlowFestElectricUnicycleDynamics({
        headingRadians: orientation.yaw,
      });
      electricUnicycleDrive.replaceDynamics(electricUnicycleDynamics, true);
      electricUnicycleMounted = true;
      applyElectricUnicycleTraversalEnvelope(true);
      initialPitch = FLOW_FEST_EUC_CONFIG.chaseCameraPitchRadians;
      electricUnicycleWheelPosition = {
        x,
        y: sampleFlowFestTerrainWorldY(terrain, x, z),
        z,
      };
      emitElectricUnicycleUpdate(true);
    }
    cameraRevision += 1;
  }

  /**
   * How far the rendered camera currently sits from the body it follows.
   *
   * In first person the two coincide apart from eye height, but the electric
   * unicycle's chase rig holds the camera a fixed boom behind the aim and a
   * little above it. A review camera's `positionWorld` says where the CAMERA
   * belongs, so the body has to be planted that far forward or the frame lands
   * short of the authored one — and a shared viewpoint link, which reports the
   * real camera position, walks backwards by one boom every time it is opened.
   *
   * Measured from the live rig rather than read from config so it stays correct
   * when a collision probe shortens the boom or the mode changes. Returns a zero
   * boom before the rig has produced a plausible frame, which keeps the
   * first-person path on its exact existing arithmetic.
   */
  /**
   * How high the camera actually sits above the ground under the player.
   *
   * Before third person this was the body's eye height by construction. It is
   * not any more: the camera rides a boom whose height and distance the shared
   * rig owns and the collision probe shortens, so the only truthful number is
   * the one measured off the camera that drew the frame. The eye height is
   * the honest fallback for the frames before the camera exists.
   */
  function measuredCameraHeightAboveGround(): number {
    const fallback =
      EYE_HEIGHT +
      (electricUnicycleMounted
        ? FLOW_FEST_EUC_CONFIG.mountedEyeHeightGainMeters
        : 0);
    if (!reviewCamera || !terrain) return fallback;
    const body = physicsProvider?.getPlayerPosition() ?? playerPosition;
    reviewCamera.getWorldPosition(cameraWorldPosition);
    const groundY = sampleFlowFestTerrainWorldY(terrain, body.x, body.z);
    const height = cameraWorldPosition.y - groundY;
    return Number.isFinite(height) ? height : fallback;
  }

  function reviewCameraRigBoom(): { forward: number; vertical: number } {
    if (!reviewCamera) return { forward: 0, vertical: 0 };
    const body = physicsProvider?.getPlayerPosition() ?? playerPosition;
    reviewCamera.getWorldPosition(cameraWorldPosition);
    const forward = Math.hypot(
      cameraWorldPosition.x - body.x,
      cameraWorldPosition.z - body.z
    );
    if (
      !Number.isFinite(forward) ||
      forward < MINIMUM_RIG_BOOM_METERS ||
      forward > MAXIMUM_RIG_BOOM_METERS
    ) {
      return { forward: 0, vertical: 0 };
    }
    return { forward, vertical: cameraWorldPosition.y - body.y };
  }

  function teleportToReviewCamera(
    cameraId: string,
    correctingRigBoom = false
  ): boolean {
    if (!contract || !terrain) return false;
    const camera =
      contract.reviewCameras.find((candidate) => candidate.id === cameraId) ??
      props.externalReviewCameras?.find(
        (candidate) => candidate.id === cameraId
      );
    if (!camera) return false;
    const orientation = yawPitchForCamera(camera);
    const boom = reviewCameraRigBoom();
    const position = {
      x: camera.positionWorld[0] + boom.forward * Math.sin(orientation.yaw),
      y:
        camera.positionWorld[1] -
        (boom.forward > 0 ? boom.vertical : CAMERA_OFFSET),
      z: camera.positionWorld[2] + boom.forward * Math.cos(orientation.yaw),
    };
    ensureTerrainColliders(position.x, position.z);
    physicsProvider?.teleport?.(position);
    playerPosition = position;
    playerYaw = orientation.yaw;
    targetPlayerYaw = orientation.yaw;
    initialPitch = orientation.pitch;
    viewYawRadians = orientation.yaw;
    viewPitchRadians = orientation.pitch;
    activeHorizontalFov = camera.horizontalFovDegrees;
    cameraRevision += 1;
    // The first teleport of a page load runs before the rig has drawn anything,
    // so its boom is unmeasurable and the frame lands one boom short. Redo it
    // once the rig can answer, unless this pass already is that redo.
    pendingRigCorrection =
      correctingRigBoom || boom.forward > 0
        ? null
        : {
            cameraId,
            expectedX: position.x,
            expectedZ: position.z,
            framesRemaining: RIG_CORRECTION_FRAME_BUDGET,
          };
    return true;
  }

  function stagePlayerAt(position: { x: number; z: number }): void {
    if (!terrain) return;
    ensureTerrainColliders(position.x, position.z);
    const body = bodyPositionAt(position.x, position.z);
    physicsProvider?.teleport?.(body);
    playerPosition = body;
    cameraRevision += 1;
  }

  function clearElectricUnicycleParkedBody(): void {
    if (!electricUnicycleParkedBody || !physicsState) return;
    removeRigidBody(physicsState, electricUnicycleParkedBody);
    electricUnicycleParkedBody = null;
  }

  function mountElectricUnicycleParkedBody(): void {
    if (
      !physicsState?.world ||
      electricUnicycleMounted ||
      electricUnicycleParkedBody
    ) {
      return;
    }
    const halfYaw = electricUnicycleDynamics.headingRadians / 2;
    const yawSin = Math.sin(halfYaw);
    const yawCos = Math.cos(halfYaw);
    const quarterTurn = Math.SQRT1_2;
    electricUnicycleParkedBody = createRigidBody(
      physicsState,
      {
        type: "static",
        position: {
          x: electricUnicycleWheelPosition.x,
          y:
            electricUnicycleWheelPosition.y +
            FLOW_FEST_EUC_CONFIG.wheelRadiusMeters,
          z: electricUnicycleWheelPosition.z,
        },
        // Rapier cylinders point along local Y. Compose the wheel heading with
        // a 90-degree local-Z turn so the collider shares the visible axle.
        rotation: {
          x: yawSin * quarterTurn,
          y: yawSin * quarterTurn,
          z: yawCos * quarterTurn,
          w: yawCos * quarterTurn,
        },
      },
      {
        type: "cylinder",
        radius: FLOW_FEST_EUC_CONFIG.wheelRadiusMeters,
        halfHeight: 0.14,
        friction: 0.82,
        restitution: 0.04,
      }
    );
  }

  function electricUnicycleDistanceToPlayer(): number {
    const position = physicsProvider?.getPlayerPosition() ?? playerPosition;
    return Math.hypot(
      position.x - electricUnicycleWheelPosition.x,
      position.z - electricUnicycleWheelPosition.z
    );
  }

  function emitElectricUnicycleUpdate(force = false): void {
    if (!props.electricUnicycleEnabled || !electricUnicycleDrive || !terrain) {
      return;
    }
    const now = performance.now();
    if (!force && now - lastElectricUnicycleReportAt < 100) return;
    lastElectricUnicycleReportAt = now;
    const currentPlayer =
      physicsProvider?.getPlayerPosition() ?? playerPosition;
    if (electricUnicycleMounted) {
      electricUnicycleWheelPosition = {
        x: currentPlayer.x,
        y: sampleFlowFestTerrainWorldY(
          terrain,
          currentPlayer.x,
          currentPlayer.z
        ),
        z: currentPlayer.z,
      };
    }
    const distanceToWheelMeters = electricUnicycleMounted
      ? 0
      : electricUnicycleDistanceToPlayer();
    const canMount =
      !electricUnicycleMounted &&
      !electricUnicycleCargo &&
      distanceToWheelMeters <= FLOW_FEST_EUC_CONFIG.mountRangeMeters;
    const canDismount =
      electricUnicycleMounted &&
      Math.abs(electricUnicycleDynamics.speedMetersPerSecond) <=
        FLOW_FEST_EUC_CONFIG.safeDismountSpeedMetersPerSecond;
    const spec = carSpec();
    const distanceToDoorMeters = spec
      ? carDistanceToDoor()
      : Number.POSITIVE_INFINITY;
    const canBoard =
      Boolean(spec) &&
      !carDriving &&
      !electricUnicycleMounted &&
      distanceToDoorMeters <= FLOW_FEST_CAR_CONFIG.boardRangeMeters;
    const canExit =
      carDriving &&
      Math.abs(carDynamics.speedMetersPerSecond) <=
        FLOW_FEST_CAR_CONFIG.exitSpeedMetersPerSecond;
    electricUnicycleInteractionMessage = carDriving
      ? canExit
        ? "Get out"
        : "Brake to a stop to get out"
      : canBoard
        ? "Get in the car"
        : electricUnicycleMounted
          ? canDismount
            ? "Park wheel"
            : "Brake below 3.4 mph to step off"
          : canMount
            ? "Mount wheel"
            : electricUnicycleCargo
              ? `${distanceToDoorMeters.toFixed(1)} m to your car`
              : `${distanceToWheelMeters.toFixed(1)} m to your wheel`;
    const update: FlowFestMobilityRuntimeUpdate = {
      mounted: electricUnicycleMounted,
      player: { x: currentPlayer.x, z: currentPlayer.z },
      wheel: {
        x: electricUnicycleWheelPosition.x,
        z: electricUnicycleWheelPosition.z,
      },
      dynamics: { ...electricUnicycleDynamics },
      input: { ...electricUnicycleInput },
      parkedColliderActive: electricUnicycleParkedBody !== null,
      distanceToWheelMeters,
      canMount,
      canDismount,
      interactionMessage: electricUnicycleInteractionMessage,
      gamepadConnected: electricUnicycleGamepadConnected,
      collisionLimited: electricUnicycleCollisionLimited,
      onFoot: {
        speedMetersPerSecond: measuredGroundSpeed,
        sprinting: sprintHeld && (props.enableSprint ?? false),
      },
      car:
        car && spec
          ? {
              modelId: car.modelId,
              paintIndex: car.paintIndex,
              driving: carDriving,
              position: { x: carPosition.x, z: carPosition.z },
              dynamics: { ...carDynamics },
              input: { ...carInput },
              distanceToDoorMeters,
              canBoard,
              canExit,
              collisionLimited: carCollisionLimited,
              edgeMessage: carEdgeLimited ? FLOW_FEST_CAR_EDGE_MESSAGE : null,
            }
          : null,
    };
    (globalThis as Record<string, unknown>).__flowFestCar = update.car
      ? {
          ...update.car,
          label: spec?.label ?? null,
          wheelAsCargo: electricUnicycleCargo,
          collider: carDriving
            ? {
                shape: "lying-capsule",
                radiusMeters: (spec?.widthMeters ?? 0) / 2,
                halfHeightMeters: Math.max(
                  0.1,
                  (spec?.lengthMeters ?? 0) / 2 - (spec?.widthMeters ?? 0) / 2
                ),
              }
            : {
                shape: "parked-box",
                active: carParkedBody !== null,
              },
          camera: carDriving
            ? {
                behavior: "collision-aware-heading-chase",
                distanceMeters: FLOW_FEST_CAR_CONFIG.chaseCameraDistanceMeters,
                heightMeters: FLOW_FEST_CAR_CONFIG.chaseCameraHeightMeters,
              }
            : null,
          config: FLOW_FEST_CAR_CONFIG,
        }
      : null;
    (globalThis as Record<string, unknown>).__flowFestEuc = {
      status: initialized ? "ready" : "initializing",
      coordinateFingerprint:
        contract?.coordinateContentFingerprint.canonicalPayloadSha256 ?? null,
      mounted: update.mounted,
      player: update.player,
      wheel: update.wheel,
      playerWheelDistanceMeters: update.distanceToWheelMeters,
      parkedCollider: {
        active: update.parkedColliderActive,
        shape: "visible-wheel-envelope-cylinder",
        radiusMeters: FLOW_FEST_EUC_CONFIG.wheelRadiusMeters,
        halfHeightMeters: 0.14,
      },
      dynamics: update.dynamics,
      terrainAttitude: { ...electricUnicycleTerrainAttitude },
      traversalEnvelope: {
        ...flowFestEucTraversalEnvelope(update.mounted),
        mode: update.mounted ? "mounted-euc" : "on-foot",
      },
      traversalDiagnostics: electricUnicycleTraversalDiagnostics,
      input: update.input,
      gamepadConnected: update.gamepadConnected,
      collisionLimited: update.collisionLimited,
      affordance: update.interactionMessage,
      cameraEyeHeightMeters: measuredCameraHeightAboveGround(),
      camera: {
        mode: CameraMode.THIRD_PERSON,
        behavior: update.mounted
          ? "collision-aware-heading-chase"
          : "collision-aware-follow-walk",
        headingRadians: update.dynamics.headingRadians,
      },
      avatar: {
        // A body is on screen either way now: the wheel's rider while
        // mounted, the walking character once you step off.
        visible: true,
        owner: "@austencloud/scene-3d/Avatar3D",
        modelId: update.mounted
          ? FLOW_FEST_EUC_CONFIG.riderAvatarId
          : (props.playerCharacterId ?? DEFAULT_PLAYER_CHARACTER_ID),
        // The rider no longer hangs off a single root offset. Its feet are
        // placed on the pedal anchors by the mounted-pose rig, so the honest
        // report is the pedal surface plus the measured contact error below.
        // On foot there are no pedals and the ground is the contact surface.
        pedalSurfaceHeightMeters: update.mounted
          ? FLOW_FEST_EUC_PEDAL_SURFACE_HEIGHT_METERS
          : null,
        stanceWidthMeters: update.mounted
          ? FLOW_FEST_EUC_PEDAL_SEPARATION_METERS
          : null,
        contactPose: update.mounted
          ? "flow-fest-euc-mounted-pose-rig"
          : "scene-3d-foot-planting",
      },
      longitudinalAccelerationMetersPerSecondSquared:
        electricUnicycleLongitudinalAcceleration,
      mountedPose: update.mounted ? electricUnicycleMountedPose : null,
      mountedPoseThresholds: FLOW_FEST_EUC_CONTACT_THRESHOLDS,
      config: FLOW_FEST_EUC_CONFIG,
    };
    props.onElectricUnicycleChange?.(update);
  }

  function carSpec(): FlowFestCarSpec | null {
    return car ? flowFestCarSpec(car.modelId) : null;
  }

  function carPose(): { x: number; z: number; headingRadians: number } {
    return {
      x: carPosition.x,
      z: carPosition.z,
      headingRadians: carDynamics.headingRadians,
    };
  }

  function carDistanceToDoor(): number {
    const spec = carSpec();
    if (!spec) return Number.POSITIVE_INFINITY;
    const door = flowFestCarDriverDoorPoint(spec, carPose());
    const position = physicsProvider?.getPlayerPosition() ?? playerPosition;
    return Math.hypot(position.x - door.x, position.z - door.z);
  }

  function sampleCarGroundY(x: number, z: number): number {
    return terrain ? sampleFlowFestTerrainWorldY(terrain, x, z) : 0;
  }

  /** Where the driving body sits: the seat capsule's radius above the ground. */
  function carSeatBodyPosition(
    spec: FlowFestCarSpec,
    x: number,
    z: number
  ): { x: number; y: number; z: number } {
    return {
      x,
      y: sampleCarGroundY(x, z) + spec.widthMeters / 2 + PLAYER_OFFSET + 0.05,
      z,
    };
  }

  /**
   * The seat collider is a capsule lying along the car, as wide as the body
   * and nearly as long. Its rounded ends ride a grade change without the edge
   * of a box catching the road, and the same character controller keeps
   * grounding, slopes and collision exactly as it does for the walker.
   */
  function applyDrivingCollider(spec: FlowFestCarSpec): void {
    const rapier = physicsState?.rapier;
    const collider = playerState?.collider;
    if (!rapier || !collider) return;
    const radius = spec.widthMeters / 2;
    collider.setShape(
      new rapier.Capsule(Math.max(0.1, spec.lengthMeters / 2 - radius), radius)
    );
  }

  function applyWalkingCollider(): void {
    const rapier = physicsState?.rapier;
    const collider = playerState?.collider;
    const rigidBody = playerState?.rigidBody;
    if (!rapier || !collider || !rigidBody) return;
    collider.setShape(new rapier.Capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS));
    const upright = { x: 0, y: 0, z: 0, w: 1 };
    rigidBody.setRotation(upright, true);
    rigidBody.setNextKinematicRotation(upright);
  }

  function clearCarParkedBody(): void {
    if (!carParkedBody || !physicsState) return;
    removeRigidBody(physicsState, carParkedBody);
    carParkedBody = null;
  }

  /** A parked car is a static box the size of its body, resting on the ground. */
  function createCarStaticBox(
    spec: FlowFestCarSpec,
    x: number,
    z: number,
    headingRadians: number
  ): PhysicsBodyComponent | null {
    if (!physicsState?.world) return null;
    const halfYaw = (headingRadians - Math.PI / 2) / 2;
    return createRigidBody(
      physicsState,
      {
        type: "static",
        position: {
          x,
          y: sampleCarGroundY(x, z) + spec.heightMeters / 2,
          z,
        },
        rotation: { x: 0, y: Math.sin(halfYaw), z: 0, w: Math.cos(halfYaw) },
      },
      {
        type: "box",
        size: {
          x: spec.lengthMeters,
          y: spec.heightMeters,
          z: spec.widthMeters,
        },
        friction: 0.6,
        restitution: 0.05,
      }
    );
  }

  function mountCarParkedBody(spec: FlowFestCarSpec): void {
    if (!physicsState?.world || carDriving || carParkedBody) return;
    carParkedBody = createCarStaticBox(
      spec,
      carPosition.x,
      carPosition.z,
      carDynamics.headingRadians
    );
  }

  function clearGateQueueBodies(): void {
    if (physicsState) {
      for (const body of gateQueueBodies) removeRigidBody(physicsState, body);
    }
    gateQueueBodies = [];
  }

  function mountGateQueueBodies(cars: readonly FlowFestGateQueueCar[]): void {
    clearGateQueueBodies();
    if (!physicsState?.world || !terrain) return;
    gateQueueBodies = cars.flatMap((car) => {
      const body = createCarStaticBox(
        flowFestCarSpec(car.modelId),
        car.x,
        car.z,
        car.headingRadians
      );
      return body ? [body] : [];
    });
  }

  function resetCarState(): void {
    clearCarParkedBody();
    electricUnicycleCargo = false;
    if (carDriving) {
      carDrive?.replaceDynamics(carDynamics, false);
      applyWalkingCollider();
    }
    carDriving = false;
  }

  function handleCarDriveFrame(frame: FlowFestCarDriveFrame): void {
    carDriving = frame.driving;
    carDynamics = frame.dynamics;
    carInput = frame.input;
    carCollisionLimited = frame.collisionLimited;
    carEdgeLimited = frame.edgeLimited;
    if (frame.driving) {
      playerYaw = frame.dynamics.headingRadians;
      targetPlayerYaw = frame.dynamics.headingRadians;
    }
    emitElectricUnicycleUpdate();
  }

  /**
   * Road or field, uphill or down, sampled ten times a second. The plan's
   * lines are the surveyed road and the camp drives; anything else under the
   * car is grass or the loose gravel shoulder.
   */
  function updateCarEnvironment(position: { x: number; z: number }): void {
    if (!carDrive || !terrain || !contract) return;
    carEnvironmentFrame += 1;
    if (carEnvironmentFrame % 6 !== 0) return;
    if (!campPlan || campPlanBranch !== props.selectedBranch) {
      campPlan = createFlowFestCampPlan(contract, props.selectedBranch);
      campPlanBranch = props.selectedBranch;
    }
    const location = identifyFlowFestPlanLocation(campPlan, position);
    const onSurface =
      location.kind === "public-road" ||
      location.kind === "internal-drive" ||
      location.kind === "landmark";
    const heading = carDynamics.headingRadians;
    const forwardX = Math.sin(heading);
    const forwardZ = Math.cos(heading);
    const ahead = sampleFlowFestTerrainWorldY(
      terrain,
      position.x + forwardX * 2,
      position.z + forwardZ * 2
    );
    const behind = sampleFlowFestTerrainWorldY(
      terrain,
      position.x - forwardX * 2,
      position.z - forwardZ * 2
    );
    const rise = ahead - behind;
    carDrive.setEnvironment({
      gripFraction: onSurface ? 1 : FLOW_FEST_CAR_CONFIG.offRoadGripFraction,
      gradeSine: rise / Math.hypot(4, rise),
    });
  }

  function boardCar(): void {
    const spec = carSpec();
    if (
      !carDrive ||
      !spec ||
      !terrain ||
      carDriving ||
      electricUnicycleMounted
    ) {
      return;
    }
    if (carDistanceToDoor() > FLOW_FEST_CAR_CONFIG.boardRangeMeters) {
      emitElectricUnicycleUpdate(true);
      return;
    }
    // A wheel parked within reach goes in the boot; one left further away
    // stays where it was parked.
    if (
      !electricUnicycleCargo &&
      electricUnicycleDistanceToPlayer() <=
        FLOW_FEST_CAR_CONFIG.electricUnicycleCargoRangeMeters
    ) {
      clearElectricUnicycleParkedBody();
      electricUnicycleCargo = true;
    }
    clearCarParkedBody();
    carDrive.setSpec(spec);
    const heading = carDynamics.headingRadians;
    // Boarding stands the walker up first; the seat capsule replaces the
    // standing one only once nothing will resize it again.
    carDrive.board(heading);
    applyDrivingCollider(spec);
    const body = carSeatBodyPosition(spec, carPosition.x, carPosition.z);
    ensureTerrainColliders(body.x, body.z);
    physicsProvider?.teleport?.(body);
    playerPosition = body;
    playerYaw = heading;
    targetPlayerYaw = heading;
    initialPitch = FLOW_FEST_CAR_CONFIG.chaseCameraPitchRadians;
    cameraRevision += 1;
    emitElectricUnicycleUpdate(true);
  }

  function exitCar(): void {
    const spec = carSpec();
    if (!carDrive || !spec || !terrain || !carDriving) return;
    if (!carDrive.exit()) {
      emitElectricUnicycleUpdate(true);
      return;
    }
    const pose = carPose();
    applyWalkingCollider();
    const door = flowFestCarDriverDoorPoint(spec, pose);
    const body = bodyPositionAt(door.x, door.z);
    ensureTerrainColliders(body.x, body.z);
    physicsProvider?.teleport?.(body);
    playerPosition = body;
    mountCarParkedBody(spec);
    if (electricUnicycleCargo && electricUnicycleDrive) {
      // The wheel comes out of the boot behind the car, facing the same way.
      const setDown = flowFestCarCargoSetDownPoint(spec, pose);
      electricUnicycleCargo = false;
      electricUnicycleDynamics = createFlowFestElectricUnicycleDynamics({
        ...electricUnicycleDynamics,
        speedMetersPerSecond: 0,
        headingRadians: pose.headingRadians,
      });
      electricUnicycleDrive.replaceDynamics(electricUnicycleDynamics, false);
      electricUnicycleWheelPosition = {
        x: setDown.x,
        y: sampleFlowFestTerrainWorldY(terrain, setDown.x, setDown.z),
        z: setDown.z,
      };
      mountElectricUnicycleParkedBody();
    }
    playerYaw = pose.headingRadians;
    targetPlayerYaw = pose.headingRadians;
    initialPitch = 0;
    cameraRevision += 1;
    emitElectricUnicycleUpdate(true);
  }

  function restoreCarFromSnapshot(snapshot: FlowFestMobilitySnapshot): void {
    if (!carDrive || !terrain) return;
    if (!snapshot.car) {
      car = null;
      carDrive.replaceDynamics(createFlowFestCarDynamics(), false);
      return;
    }
    car = {
      modelId: snapshot.car.modelId,
      paintIndex: snapshot.car.paintIndex,
    };
    const spec = flowFestCarSpec(car.modelId);
    carDrive.setSpec(spec);
    carPosition = { x: snapshot.car.x, z: snapshot.car.z };
    carDynamics = mobilityCarDynamicsFromSnapshot(snapshot.car);
    carDrive.replaceDynamics(carDynamics, snapshot.car.driving);
    if (snapshot.car.driving) {
      // The wheel is cargo for the whole drive; it is set down on exit.
      electricUnicycleCargo = true;
      applyDrivingCollider(spec);
      const body = carSeatBodyPosition(spec, carPosition.x, carPosition.z);
      ensureTerrainColliders(body.x, body.z);
      physicsProvider?.teleport?.(body);
      playerPosition = body;
      playerYaw = carDynamics.headingRadians;
      targetPlayerYaw = carDynamics.headingRadians;
      initialPitch = FLOW_FEST_CAR_CONFIG.chaseCameraPitchRadians;
      return;
    }
    mountCarParkedBody(spec);
  }

  /** E and the gamepad's south button: the seat first, then the door, then the wheel. */
  function handleInteract(): void {
    if (carDriving) {
      exitCar();
      return;
    }
    if (
      car &&
      !electricUnicycleMounted &&
      carDistanceToDoor() <= FLOW_FEST_CAR_CONFIG.boardRangeMeters
    ) {
      boardCar();
      return;
    }
    toggleElectricUnicycleMount();
  }

  function handleElectricUnicycleDriveFrame(frame: {
    mounted: boolean;
    dynamics: FlowFestElectricUnicycleDynamics;
    input: FlowFestElectricUnicycleInput;
    collisionLimited: boolean;
    traversal: {
      grounded: boolean;
      actualVelocity: { x: number; y: number; z: number };
      requestedVelocity: { x: number; y: number; z: number };
    } | null;
  }): void {
    electricUnicycleMounted = frame.mounted;
    electricUnicycleDynamics = frame.dynamics;
    if (frame.mounted) {
      playerYaw = frame.dynamics.headingRadians;
      targetPlayerYaw = frame.dynamics.headingRadians;
    }
    electricUnicycleInput = frame.input;
    electricUnicycleCollisionLimited = frame.collisionLimited;
    electricUnicycleLongitudinalAcceleration =
      frame.longitudinalAccelerationMetersPerSecondSquared;
    electricUnicycleTraversalDiagnostics = frame.traversal;
    emitElectricUnicycleUpdate();
  }

  function handleMountedPoseDiagnostic(
    diagnostic: FlowFestEucMountedPoseDiagnostic
  ): void {
    electricUnicycleMountedPose = diagnostic;
  }

  function applyElectricUnicycleTraversalEnvelope(mounted: boolean): void {
    const controller = playerState?.controller;
    if (!controller) return;
    const envelope = flowFestEucTraversalEnvelope(mounted);
    controller.setMaxSlopeClimbAngle(envelope.maxSlopeClimbAngleRadians);
    controller.setMinSlopeSlideAngle(envelope.minSlopeSlideAngleRadians);
    controller.enableAutostep(
      envelope.autoStepMaxHeightMeters,
      envelope.autoStepMinWidthMeters,
      true
    );
    controller.enableSnapToGround(envelope.snapToGroundDistanceMeters);
  }

  function parkElectricUnicycle(): void {
    if (!electricUnicycleDrive || !terrain) return;
    if (
      Math.abs(electricUnicycleDynamics.speedMetersPerSecond) >
      FLOW_FEST_EUC_CONFIG.safeDismountSpeedMetersPerSecond
    ) {
      electricUnicycleInteractionMessage = "Brake below 3.4 mph to step off";
      emitElectricUnicycleUpdate(true);
      return;
    }
    const current = electricUnicycleDrive.getPlayerPosition();
    const heading = electricUnicycleDynamics.headingRadians;
    const wheelX = Math.max(
      -511,
      Math.min(
        511,
        current.x +
          Math.cos(heading) * FLOW_FEST_EUC_CONFIG.parkedSideOffsetMeters
      )
    );
    const wheelZ = Math.max(
      -511,
      Math.min(
        511,
        current.z -
          Math.sin(heading) * FLOW_FEST_EUC_CONFIG.parkedSideOffsetMeters
      )
    );
    electricUnicycleWheelPosition = {
      x: wheelX,
      y: sampleFlowFestTerrainWorldY(terrain, wheelX, wheelZ),
      z: wheelZ,
    };
    electricUnicycleDrive.dismount();
    electricUnicycleMounted = false;
    applyElectricUnicycleTraversalEnvelope(false);
    playerYaw = heading;
    targetPlayerYaw = heading;
    initialPitch = 0;
    cameraRevision += 1;
    mountElectricUnicycleParkedBody();
    emitElectricUnicycleUpdate(true);
  }

  function mountElectricUnicycle(): void {
    if (!electricUnicycleDrive || electricUnicycleMounted) return;
    // The wheel is in the boot; it comes out with the driver, not on its own.
    if (electricUnicycleCargo) return;
    if (
      electricUnicycleDistanceToPlayer() > FLOW_FEST_EUC_CONFIG.mountRangeMeters
    ) {
      emitElectricUnicycleUpdate(true);
      return;
    }
    clearElectricUnicycleParkedBody();
    electricUnicycleDrive.mount(electricUnicycleDynamics.headingRadians);
    electricUnicycleMounted = true;
    applyElectricUnicycleTraversalEnvelope(true);
    playerYaw = electricUnicycleDynamics.headingRadians;
    targetPlayerYaw = electricUnicycleDynamics.headingRadians;
    initialPitch = FLOW_FEST_EUC_CONFIG.chaseCameraPitchRadians;
    cameraRevision += 1;
    emitElectricUnicycleUpdate(true);
  }

  function toggleElectricUnicycleMount(): void {
    if (!props.electricUnicycleEnabled || !electricUnicycleDrive) return;
    if (electricUnicycleMounted) parkElectricUnicycle();
    else mountElectricUnicycle();
  }

  function handleElectricUnicycleCodes(activeCodes: readonly string[]): void {
    electricUnicycleDrive?.setKeyboardCodes(activeCodes);
    carDrive?.setKeyboardCodes(activeCodes);
    const pressed = activeCodes.includes("KeyE");
    if (pressed && !electricUnicycleKeyPressed) {
      handleInteract();
    }
    electricUnicycleKeyPressed = pressed;
  }

  function pollElectricUnicycleGamepad(): void {
    if (!electricUnicycleDrive || typeof navigator === "undefined") return;
    const gamepad = navigator
      .getGamepads?.()
      .find((candidate): candidate is Gamepad =>
        Boolean(candidate?.connected && candidate.mapping === "standard")
      );
    electricUnicycleGamepadConnected = Boolean(gamepad);
    electricUnicycleDrive.setGamepad(
      (gamepad as FlowFestStandardGamepadSample | undefined) ?? null
    );
    carDrive?.setGamepad(
      (gamepad as FlowFestStandardGamepadSample | undefined) ?? null
    );
    const mountPressed = gamepad?.buttons[0]?.pressed ?? false;
    if (mountPressed && !electricUnicycleGamepadButtonPressed) {
      handleInteract();
    }
    electricUnicycleGamepadButtonPressed = mountPressed;
  }

  function applyElectricUnicycleSnapshot(
    snapshot: FlowFestMobilitySnapshot
  ): void {
    if (
      !electricUnicycleDrive ||
      !terrain ||
      snapshot.contractFingerprint !==
        contract?.coordinateContentFingerprint.canonicalPayloadSha256
    ) {
      return;
    }
    clearElectricUnicycleParkedBody();
    resetCarState();
    const drivingCar = Boolean(snapshot.car?.driving);
    electricUnicycleDynamics = mobilityDynamicsFromSnapshot(snapshot);
    electricUnicycleMounted = snapshot.mounted && !drivingCar;
    electricUnicycleDrive.replaceDynamics(
      electricUnicycleDynamics,
      electricUnicycleMounted
    );
    applyElectricUnicycleTraversalEnvelope(electricUnicycleMounted);
    const body = bodyPositionAt(snapshot.player.x, snapshot.player.z);
    ensureTerrainColliders(body.x, body.z);
    physicsProvider?.teleport?.(body);
    playerPosition = body;
    electricUnicycleWheelPosition = snapshot.mounted
      ? {
          x: body.x,
          y: sampleFlowFestTerrainWorldY(terrain, body.x, body.z),
          z: body.z,
        }
      : {
          x: snapshot.wheel.x,
          y: sampleFlowFestTerrainWorldY(
            terrain,
            snapshot.wheel.x,
            snapshot.wheel.z
          ),
          z: snapshot.wheel.z,
        };
    // A driving snapshot carries the wheel in the car; it is set down on exit.
    if (!electricUnicycleMounted && !drivingCar) {
      mountElectricUnicycleParkedBody();
    }
    playerYaw = snapshot.headingRadians;
    targetPlayerYaw = snapshot.headingRadians;
    initialPitch = 0;
    restoreCarFromSnapshot(snapshot);
    cameraRevision += 1;
    emitElectricUnicycleUpdate(true);
  }

  function disposeOverlay(group: Group | null): void {
    group?.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((material) => material.dispose());
    });
  }

  function percentile(values: number[], fraction: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[
      Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))
    ]!;
  }

  $effect(() => {
    reconcileProductionCollision(
      props.productionCollision,
      props.productionCampEstablished ?? false,
      props.productionFestivalActive ?? false
    );
  });

  $effect(() => {
    const cars = props.gateQueueCars ?? [];
    if (!initialized) return;
    mountGateQueueBodies(cars);
  });

  onMount(async () => {
    try {
      loadStartedAt = performance.now();
      const manifestResponse = await fetch(MANIFEST_PATH);
      if (!manifestResponse.ok) {
        throw new Error(
          `Flow Fest terrain manifest failed to load (${manifestResponse.status})`
        );
      }
      const manifest = parseGeospatialTerrainManifest(
        await manifestResponse.json()
      );
      const [sourceTerrain, loadedContract, evidence] = await Promise.all([
        loadGeospatialTerrain(MANIFEST_PATH),
        loadFlowFestRuntimeContract(),
        loadGeospatialEvidenceLayers(manifest),
      ]);
      if (disposed) return;
      const loadedTerrain =
        buildFlowFestEntranceGradedTerrain(sourceTerrain).terrain;
      terrain = loadedTerrain;
      contract = loadedContract;
      const usesMeasuredTopology =
        (props.collisionMode ?? "measured-topology") === "measured-topology";
      readinessTimeline.sourcesVerifiedMilliseconds =
        performance.now() - loadStartedAt;

      const objectUrl = URL.createObjectURL(
        new Blob([evidence.orthophotoBytes], { type: "image/webp" })
      );
      let texture;
      try {
        texture = await new TextureLoader().loadAsync(objectUrl);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
      if (disposed) {
        texture.dispose();
        return;
      }

      terrainHost = buildFlowFestTerrainHost(
        loadedTerrain,
        props.hostMode,
        texture,
        props.hostMode === "chunked"
          ? {
              fullDetailBounds: FLOW_FEST_CAMP_PLAN_BOUNDS,
              fullDetailPaddingMeters: 32,
              farSampleStep: 2,
            }
          : undefined
      );
      overlay = buildFlowFestReviewOverlay(
        loadedContract,
        loadedTerrain,
        props.selectedBranch
      );
      appliedBranch = props.selectedBranch;
      let barrierTopologyAudit: ReturnType<
        typeof auditFlowFestBarrierTopology
      > | null = null;
      if (usesMeasuredTopology) {
        barrier = buildFlowFestLidarBarrierGeometry(
          loadedContract,
          loadedTerrain,
          evidence.surfaceOffsetsCentimeters
        );
        barrierTopologyAudit = auditFlowFestBarrierTopology(
          loadedContract,
          barrier
        );
        if (barrierTopologyAudit.status !== "passed") {
          throw new Error(
            "Flow Fest lidar topology does not preserve the approved corridors"
          );
        }
      }
      readinessTimeline.geometryReadyMilliseconds =
        performance.now() - loadStartedAt;

      physicsState = createPhysicsWorldState();
      await initPhysicsWorld(physicsState, { x: 0, y: -9.81, z: 0 });
      if (
        disposed ||
        !physicsState.world ||
        !terrainHost ||
        (usesMeasuredTopology && !barrier)
      )
        return;

      const [spawnX, , spawnZ] = loadedContract.spawn.positionWorld;
      if (!ensureTerrainColliders(spawnX, spawnZ)) {
        throw new Error(
          "Flow Fest authoritative spawn collider failed to mount"
        );
      }
      if (barrier) {
        createRigidBody(
          physicsState,
          { type: "static", position: { x: 0, y: 0, z: 0 } },
          {
            type: "trimesh",
            vertices: barrier.vertices,
            indices: barrier.indices,
            friction: 0.8,
          }
        );
      }
      readinessTimeline.collisionReadyMilliseconds =
        performance.now() - loadStartedAt;

      const spawnGroundY = sampleFlowFestTerrainWorldY(
        loadedTerrain,
        spawnX,
        spawnZ
      );
      playerPosition = bodyPositionAt(spawnX, spawnZ);
      playerState = createPlayerController(physicsState, {
        radius: PLAYER_RADIUS,
        halfHeight: PLAYER_HALF_HEIGHT,
        offset: PLAYER_OFFSET,
        position: playerPosition,
        maxSlopeClimbAngle: flowFestEucTraversalEnvelope(
          props.electricUnicycleEnabled
        ).maxSlopeClimbAngleRadians,
        minSlopeSlideAngle: flowFestEucTraversalEnvelope(
          props.electricUnicycleEnabled
        ).minSlopeSlideAngleRadians,
        autoStepMaxHeight: flowFestEucTraversalEnvelope(
          props.electricUnicycleEnabled
        ).autoStepMaxHeightMeters,
        autoStepMinWidth: flowFestEucTraversalEnvelope(
          props.electricUnicycleEnabled
        ).autoStepMinWidthMeters,
        snapToGroundDistance: flowFestEucTraversalEnvelope(
          props.electricUnicycleEnabled
        ).snapToGroundDistanceMeters,
      });
      const basePhysicsProvider = createRapierPhysicsProvider(
        physicsState,
        playerState
      );
      if (props.electricUnicycleEnabled) {
        electricUnicycleDrive = new FlowFestElectricUnicycleDrive(
          basePhysicsProvider,
          undefined,
          handleElectricUnicycleDriveFrame
        );
        carDrive = new FlowFestCarDrive(
          electricUnicycleDrive,
          flowFestCarSpec("ace-hatchback"),
          undefined,
          handleCarDriveFrame
        );
        physicsProvider = carDrive;
      } else {
        physicsProvider = basePhysicsProvider;
      }
      initialized = true;
      resetToGate();
      if (props.electricUnicycleSnapshot) {
        applyElectricUnicycleSnapshot(props.electricUnicycleSnapshot);
      }
      readinessTimeline.playerReadyMilliseconds =
        performance.now() - loadStartedAt;

      const details: FlowFestGrayboxReadyDetails = {
        hostMode: props.hostMode,
        buildMilliseconds: terrainHost.metrics.buildMilliseconds,
        renderMeshes: terrainHost.metrics.renderMeshes + 1 + (barrier ? 1 : 0),
        colliderMeshes: activeTerrainBodies.size + (barrier ? 1 : 0),
        vertices: terrainHost.metrics.vertices,
        triangles: terrainHost.metrics.triangles,
        geometryBytes: terrainHost.metrics.geometryBytes,
        barrierCells: barrier?.occupiedCellCount ?? 0,
        spawnGroundY,
        eyeHeightMeters: EYE_HEIGHT,
        sampleGroundY: (x: number, z: number) =>
          sampleFlowFestTerrainWorldY(loadedTerrain, x, z),
      };
      (globalThis as Record<string, unknown>).__flowFestGate2 = {
        status: "ready",
        contractFingerprint:
          loadedContract.coordinateContentFingerprint.canonicalPayloadSha256,
        worldFrame: loadedContract.runtimeWorldFrame,
        movement: {
          metersPerSecond:
            props.moveSpeedMetersPerSecond ??
            REVIEW_WALK_SPEED_METERS_PER_SECOND,
          sprint: props.enableSprint ?? false,
          sprintMultiplier: props.sprintMultiplier ?? 1,
          jump: props.enableJump ?? false,
          jumpForce: props.jumpForce ?? 0,
          crouch: props.enableCrouch ?? false,
          noclip: false,
          cameraMode: activeCameraMode,
        },
        player: {
          radius: PLAYER_RADIUS,
          halfHeight: PLAYER_HALF_HEIGHT,
          bodyCentreAboveGround: BODY_CENTRE_ABOVE_GROUND,
          cameraOffset: CAMERA_OFFSET,
          eyeHeightMeters: EYE_HEIGHT,
        },
        cameraProjection: () => ({
          registeredHorizontalFovDegrees: activeHorizontalFov,
          actualVerticalFovDegrees: reviewCamera?.fov ?? verticalCameraFov,
          actualHorizontalFovDegrees: verticalToHorizontalFovDegrees(
            reviewCamera?.fov ?? verticalCameraFov,
            cameraAspect
          ),
          aspect: cameraAspect,
        }),
        terrain: {
          sourceSamples: loadedTerrain.heightmap.heights.length,
          renderColliderIdentity: props.hostMode === "bounded-static",
          renderColliderHeightParity: props.hostMode === "bounded-static",
          fullDetailColliderHeightParity: true,
          renderStrategy:
            props.hostMode === "chunked"
              ? "independently culled 192 m adaptive render tiles: 1 m campground detail, 2 m far field, and separate 32 m full-resolution collision chunks"
              : "one full-resolution visible/collider mesh",
          cameraCollisionStrategy: "rapier-active-chunk-broadphase",
          candidateColliderMeshes: terrainHost.metrics.colliderMeshes,
          activeColliderMeshes: activeTerrainBodies.size,
          colliderBufferMeters:
            props.hostMode === "chunked" ? CHUNK_COLLIDER_BUFFER_METERS : null,
          ...terrainHost.metrics,
        },
        barriers: barrier
          ? {
              active: true,
              occupiedCells: barrier.occupiedCellCount,
              cellSizeMeters: barrier.cellSizeMeters,
              corridorClearanceMeters: barrier.corridorClearanceMeters,
              vehicleCorridorClearanceMeters:
                barrier.vehicleCorridorClearanceMeters,
              vehicleHalfWidthMeters: barrier.vehicleHalfWidthMeters,
              conservativeDilationMeters: barrier.conservativeDilationMeters,
              renderColliderIdentity: true,
              topologyAudit: barrierTopologyAudit,
              sourceClass:
                loadedContract.nodePolicy.runtimeTopologyBarrierPolicy
                  .sourceClass,
            }
          : {
              active: false,
              occupiedCells: 0,
              renderColliderIdentity: true,
              topologyAudit: null,
              sourceClass: "visible-production-solids",
            },
        spawn: { x: spawnX, z: spawnZ, groundY: spawnGroundY },
        readiness: { ...readinessTimeline, missingColliderFrames },
        auditTerrainCollision: () => {
          if (!physicsState || !playerState || !terrain) {
            return { status: "not-ready" };
          }
          let samples = 0;
          let missing = 0;
          let maximumAbsoluteErrorMeters = 0;
          const failures: Array<{
            segmentId: string;
            x: number;
            z: number;
            reason: string;
          }> = [];
          const personSegments = allFlowFestSegments(loadedContract).filter(
            (segment) => segment.mode === "person"
          );

          // Mount the union of route-adjacent chunks before querying. A single
          // physics step registers new bodies with Rapier's broad phase; the
          // player is kinematic, so this does not advance locomotion.
          for (const segment of personSegments) {
            for (const point of segment.points) {
              ensureTerrainColliders(point.x, point.z, false);
            }
          }
          stepPhysics(physicsState, 1 / 120);

          for (const segment of personSegments) {
            for (const point of segment.points) {
              samples += 1;
              const expected = sampleFlowFestTerrainWorldY(
                loadedTerrain,
                point.x,
                point.z
              );
              const hit = castRay(
                physicsState,
                { x: point.x, y: 60, z: point.z },
                { x: 0, y: -1, z: 0 },
                100,
                playerState.collider
              );
              if (!hit) {
                missing += 1;
                failures.push({
                  segmentId: segment.id,
                  x: point.x,
                  z: point.z,
                  reason: "missing-ground-hit",
                });
                continue;
              }
              const error = Math.abs(hit.point.y - expected);
              maximumAbsoluteErrorMeters = Math.max(
                maximumAbsoluteErrorMeters,
                error
              );
              if (error > 0.05) {
                failures.push({
                  segmentId: segment.id,
                  x: point.x,
                  z: point.z,
                  reason: `collision-height-error:${error.toFixed(6)}`,
                });
              }
            }
          }
          ensureTerrainColliders(playerPosition.x, playerPosition.z);
          return {
            status: failures.length === 0 ? "passed" : "failed",
            samples,
            missing,
            maximumAbsoluteErrorMeters,
            failures: failures.slice(0, 20),
          };
        },
        auditDynamicTerrainTraversal,
        teleportToReviewCamera,
        stagePlayerAt,
        playerSnapshot: () => {
          const position =
            physicsProvider?.getPlayerPosition() ?? playerPosition;
          const groundY = sampleFlowFestTerrainWorldY(
            loadedTerrain,
            position.x,
            position.z
          );
          return {
            position,
            groundY,
            eyeHeightMeters: position.y + CAMERA_OFFSET - groundY,
          };
        },
      };
      updateProductionCollisionProof();
      props.onReady?.(details);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      (globalThis as Record<string, unknown>).__flowFestGate2 = {
        status: "error",
        message,
      };
      props.onError?.(message);
    }
  });

  $effect(() => {
    if (!initialized || props.resetToken === appliedResetToken) return;
    appliedResetToken = props.resetToken;
    resetToGate();
  });

  $effect(() => {
    if (!initialized || props.cameraToken === appliedCameraToken) return;
    appliedCameraToken = props.cameraToken;
    if (props.cameraId) teleportToReviewCamera(props.cameraId);
  });

  $effect(() => {
    const token = props.stageToken ?? 0;
    if (!initialized || token === appliedStageToken) return;
    appliedStageToken = token;
    if (props.stagePosition) stagePlayerAt(props.stagePosition);
  });

  $effect(() => {
    const revision = props.electricUnicycleRevision ?? 0;
    if (
      !initialized ||
      !props.electricUnicycleEnabled ||
      revision === appliedElectricUnicycleRevision ||
      !props.electricUnicycleSnapshot
    ) {
      return;
    }
    appliedElectricUnicycleRevision = revision;
    applyElectricUnicycleSnapshot(props.electricUnicycleSnapshot);
  });

  $effect(() => {
    if (
      !initialized ||
      !contract ||
      !terrain ||
      props.selectedBranch === appliedBranch
    ) {
      return;
    }
    const previous = overlay;
    overlay = buildFlowFestReviewOverlay(
      contract,
      terrain,
      props.selectedBranch
    );
    appliedBranch = props.selectedBranch;
    disposeOverlay(previous);
  });

  // Keyed so the driven car can order its pose write after this step and
  // paint the body where physics just put it; see flow-fest-frame-tasks.ts.
  useTask(FLOW_FEST_WORLD_STEP_TASK, (delta) => {
    if (!initialized || !physicsState?.world || disposed) return;
    if (props.electricUnicycleEnabled) pollElectricUnicycleGamepad();
    const liveProof = (globalThis as Record<string, unknown>)
      .__flowFestGate2 as Record<string, unknown> | undefined;
    const liveMovement = liveProof?.movement as
      | Record<string, unknown>
      | undefined;
    const bodyVelocity = physicsProvider?.getVelocity() ?? {
      x: 0,
      y: 0,
      z: 0,
    };
    if (liveMovement) {
      liveMovement.hasInput = isMoving;
      liveMovement.velocity = bodyVelocity;
    }
    measuredVerticalVelocity = bodyVelocity.y;
    measuredGrounded = physicsProvider?.isGrounded() ?? true;
    // A single frame's velocity jitters across collision resolution and
    // terrain seams. The gait reads the smoothed value so a bump cannot
    // flip the character between idle and walking mid-stride.
    const rawGroundSpeed = Math.hypot(bodyVelocity.x, bodyVelocity.z);
    const speedBlend =
      delta > 0 && delta < 0.25
        ? 1 - Math.exp(-GROUND_SPEED_SMOOTHING * delta)
        : 1;
    measuredGroundSpeed += (rawGroundSpeed - measuredGroundSpeed) * speedBlend;
    const livePlayer = liveProof?.player as Record<string, unknown> | undefined;
    if (livePlayer && playerState?.collider) {
      livePlayer.currentCapsuleHalfHeight = playerState.collider.halfHeight();
    }
    if (delta > 0 && delta < 0.25) {
      if (performanceWarmupFrames < 120) {
        performanceWarmupFrames += 1;
      } else {
        frameTimes.push(delta * 1000);
      }
      if (frameTimes.length >= 240) {
        const proof = (globalThis as Record<string, unknown>)
          .__flowFestGate2 as Record<string, unknown> | undefined;
        if (proof) {
          performanceCaptureOrdinal += 1;
          proof.performance = {
            captureOrdinal: performanceCaptureOrdinal,
            samples: frameTimes.length,
            p50FrameMilliseconds: percentile(frameTimes, 0.5),
            p95FrameMilliseconds: percentile(frameTimes, 0.95),
            p99FrameMilliseconds: percentile(frameTimes, 0.99),
            drawCalls: renderer.info.render.calls,
            renderedTriangles: renderer.info.render.triangles,
            programs: renderer.info.programs?.length ?? 0,
            geometries: renderer.info.memory.geometries,
            textures: renderer.info.memory.textures,
          };
        }
        frameTimes = [];
      }
    }
    const currentPosition =
      physicsProvider?.getPlayerPosition() ?? playerPosition;
    if (!ensureTerrainColliders(currentPosition.x, currentPosition.z)) {
      missingColliderFrames += 1;
      updateActiveColliderProof();
      return;
    }
    if (carDriving && playerState?.rigidBody) {
      // The seat capsule lies along local Y turned onto the car's nose, then
      // yawed with the heading; YZX applies exactly that order.
      carRotationEuler.set(
        0,
        carDynamics.headingRadians - Math.PI / 2,
        -Math.PI / 2,
        "YZX"
      );
      carRotation.setFromEuler(carRotationEuler);
      playerState.rigidBody.setNextKinematicRotation(carRotation);
    }
    stepPhysics(physicsState, Math.min(delta, 1 / 30));
    const position = physicsProvider?.getPlayerPosition();
    if (!position) return;
    playerPosition = position;
    if (carDriving) {
      carPosition = { x: position.x, z: position.z };
      updateCarEnvironment(position);
    }
    if (electricUnicycleCargo && terrain) {
      electricUnicycleWheelPosition = {
        x: carPosition.x,
        y: sampleFlowFestTerrainWorldY(terrain, carPosition.x, carPosition.z),
        z: carPosition.z,
      };
    }
    if (props.electricUnicycleEnabled && electricUnicycleMounted && terrain) {
      electricUnicycleWheelPosition = {
        x: position.x,
        y: sampleFlowFestTerrainWorldY(terrain, position.x, position.z),
        z: position.z,
      };
      sampleElectricUnicycleTerrainAttitude();
    }
    // A parked wheel still has a moving player. Reporting only while mounted
    // restored the dismount point after reload instead of the campsite that
    // the player had actually walked to.
    if (props.electricUnicycleEnabled) emitElectricUnicycleUpdate();
    props.onPositionChange?.(position);
    if (pendingRigCorrection) {
      const drifted =
        Math.hypot(
          position.x - pendingRigCorrection.expectedX,
          position.z - pendingRigCorrection.expectedZ
        ) > RIG_CORRECTION_DRIFT_TOLERANCE_METERS;
      pendingRigCorrection.framesRemaining -= 1;
      if (drifted || pendingRigCorrection.framesRemaining <= 0) {
        pendingRigCorrection = null;
      } else if (reviewCameraRigBoom().forward > 0) {
        const { cameraId } = pendingRigCorrection;
        pendingRigCorrection = null;
        teleportToReviewCamera(cameraId, true);
      }
    }
    if (props.onCameraPoseChange && reviewCamera) {
      reviewCamera.getWorldPosition(cameraWorldPosition);
      props.onCameraPoseChange({
        x: cameraWorldPosition.x,
        y: cameraWorldPosition.y,
        z: cameraWorldPosition.z,
        yawRadians: viewYawRadians,
        pitchRadians: viewPitchRadians,
        horizontalFovDegrees: activeHorizontalFov,
      });
    }
  });

  onDestroy(() => {
    disposed = true;
    clearElectricUnicycleParkedBody();
    clearGateQueueBodies();
    if (playerState && physicsState) {
      disposePlayerController(physicsState, playerState);
    }
    clearProductionCollisionBodies();
    if (physicsState) disposePhysicsWorld(physicsState);
    activeTerrainBodies.clear();
    activeTerrainColliderWindowKey = null;
    terrainHost?.dispose();
    disposeOverlay(overlay);
    if (barrier) {
      barrier.mesh.geometry.dispose();
      const materials = Array.isArray(barrier.mesh.material)
        ? barrier.mesh.material
        : [barrier.mesh.material];
      materials.forEach((material) => material.dispose());
    }
    delete (globalThis as Record<string, unknown>).__flowFestGate2;
    delete (globalThis as Record<string, unknown>).__flowFestEuc;
  });
</script>

{#if (props.ambientLighting ?? "graybox-daylight") === "graybox-daylight"}
  <T.Color attach="background" args={["#b8c4b1"]} />
  <T.HemisphereLight color="#eef3e7" groundColor="#445044" intensity={1.25} />
  <T.DirectionalLight
    position={[-180, 260, 120]}
    color="#fff5dc"
    intensity={1.7}
    castShadow={false}
  />
{/if}

{#if terrainHost}
  <T is={terrainHost.root} />
{/if}
{#if barrier}
  <T is={barrier.mesh} />
{/if}
{#if overlay && props.showReviewOverlay !== false}
  <T is={overlay} />
{/if}

<!--
  On foot the player is a rendered character like every NPC in the scene.
  While mounted the body belongs to the wheel's own rider rig, which poses
  the feet onto the pedals, so exactly one of the two is ever present.
-->
{#if initialized && !(props.electricUnicycleEnabled && electricUnicycleMounted) && !carDriving}
  <FlowFestOnFootPlayer
    position={playerPosition}
    bodyCentreAboveGroundMeters={BODY_CENTRE_ABOVE_GROUND}
    facingAngle={playerYaw}
    {isMoving}
    moveSpeedMetersPerSecond={measuredGroundSpeed}
    {moveDirection}
    characterId={props.playerCharacterId ?? DEFAULT_PLAYER_CHARACTER_ID}
    isGrounded={measuredGrounded}
    verticalVelocity={measuredVerticalVelocity}
  />
{/if}

{#if props.electricUnicycleEnabled && initialized && !electricUnicycleCargo}
  <FlowFestElectricUnicycle
    position={electricUnicycleWheelPosition}
    dynamics={electricUnicycleDynamics}
    terrainAttitude={electricUnicycleTerrainAttitude}
    mounted={electricUnicycleMounted}
    lightsOn={props.electricUnicycleLightsOn ?? false}
    longitudinalAccelerationMetersPerSecondSquared={electricUnicycleLongitudinalAcceleration}
    onMountedPoseDiagnostic={handleMountedPoseDiagnostic}
  />
{/if}

<!-- The body is chosen once on the loadout screen, so the key only ever trips on a new session. -->
{#if props.electricUnicycleEnabled && initialized && car}
  {#key car.modelId}
    <FlowFestDrivenCar
      modelId={car.modelId}
      paintIndex={car.paintIndex}
      position={carPosition}
      dynamics={carDynamics}
      sampleGroundY={sampleCarGroundY}
    />
  {/key}
{/if}

{#if initialized && physicsProvider}
  {#key cameraRevision}
    <T.PerspectiveCamera
      makeDefault
      bind:ref={reviewCamera}
      fov={verticalCameraFov}
      near={0.1}
      far={10000}
    />
    <UnifiedCameraController
      destinationId={DESTINATION_ID}
      destinationDefaults={{ [DESTINATION_ID]: CameraMode.THIRD_PERSON }}
      preferencesKey="flow-fest-gate2-camera"
      {avatarState}
      {physicsProvider}
      cameraCollisionProbe={probeThirdPersonCameraCollision}
      enabled={!(props.inputLocked ?? false)}
      initialYaw={playerYaw}
      {initialPitch}
      externalYaw={(props.electricUnicycleEnabled && electricUnicycleMounted) ||
      carDriving
        ? playerYaw
        : null}
      thirdPersonDistance={carDriving
        ? FLOW_FEST_CAR_CONFIG.chaseCameraDistanceMeters
        : undefined}
      thirdPersonMinDistance={carDriving
        ? FLOW_FEST_CAR_CONFIG.chaseCameraMinDistanceMeters
        : undefined}
      thirdPersonMaxDistance={carDriving
        ? FLOW_FEST_CAR_CONFIG.chaseCameraMaxDistanceMeters
        : undefined}
      thirdPersonHeight={carDriving
        ? FLOW_FEST_CAR_CONFIG.chaseCameraHeightMeters
        : undefined}
      thirdPersonLookAtHeight={carDriving
        ? FLOW_FEST_CAR_CONFIG.chaseCameraLookAtHeightMeters
        : undefined}
      allowedModes={[CameraMode.THIRD_PERSON]}
      disableModeToggle={true}
      showControlsHint={false}
      moveSpeed={props.moveSpeedMetersPerSecond ??
        REVIEW_WALK_SPEED_METERS_PER_SECOND}
      sprintMultiplier={effectiveSprintMultiplier}
      groundAcceleration={props.groundAccelerationMetersPerSecondSquared}
      groundDeceleration={props.groundDecelerationMetersPerSecondSquared}
      jumpForce={props.jumpForce ?? 0}
      gravity={9.81}
      maximumFrameDeltaSeconds={carDriving
        ? FLOW_FEST_CAR_CONFIG.maximumSimulationCatchUpSeconds
        : props.electricUnicycleEnabled && electricUnicycleMounted
          ? FLOW_FEST_EUC_CONFIG.maximumSimulationCatchUpSeconds
          : undefined}
      firstPersonCameraOffset={CAMERA_OFFSET +
        (props.electricUnicycleEnabled && electricUnicycleMounted
          ? FLOW_FEST_EUC_CONFIG.mountedEyeHeightGainMeters
          : 0)}
      enableSprint={(props.enableSprint ?? false) &&
        !(props.electricUnicycleEnabled && electricUnicycleMounted) &&
        !carDriving}
      enableJump={(props.enableJump ?? false) &&
        !(props.electricUnicycleEnabled && electricUnicycleMounted) &&
        !carDriving}
      enableCrouch={(props.enableCrouch ?? false) &&
        !(props.electricUnicycleEnabled && electricUnicycleMounted) &&
        !carDriving}
      enableNoclip={false}
      onModeChange={(nextMode) => {
        activeCameraMode = nextMode;
        const proof = (globalThis as Record<string, unknown>)
          .__flowFestGate2 as Record<string, unknown> | undefined;
        const movement = proof?.movement as Record<string, unknown> | undefined;
        if (movement) movement.cameraMode = nextMode;
      }}
      onRotationChange={(yaw, pitch) => {
        viewYawRadians = yaw;
        viewPitchRadians = pitch;
        props.onViewRotationChange?.(yaw, pitch);
      }}
      onInputStateChange={(input) => {
        sprintHeld =
          input.activeCodes.includes("ShiftLeft") ||
          input.activeCodes.includes("ShiftRight");
        if (props.electricUnicycleEnabled) {
          handleElectricUnicycleCodes(input.activeCodes);
        }
        const proof = (globalThis as Record<string, unknown>)
          .__flowFestGate2 as Record<string, unknown> | undefined;
        const movement = proof?.movement as Record<string, unknown> | undefined;
        if (movement) movement.input = input;
      }}
      onControlReadinessChange={(ready) => {
        const proof = (globalThis as Record<string, unknown>)
          .__flowFestGate2 as Record<string, unknown> | undefined;
        const movement = proof?.movement as Record<string, unknown> | undefined;
        if (movement) movement.controllerReady = ready;
      }}
    />
  {/key}
{/if}
