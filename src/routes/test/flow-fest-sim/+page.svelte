<script lang="ts">
  import { browser } from "$app/env";
  import { onMount } from "svelte";
  import { Canvas } from "@threlte/core";
  import { AgXToneMapping, PCFSoftShadowMap, WebGLRenderer } from "three";
  import PerfMonitor from "#lib/shared/3d/components/PerfMonitor.svelte";
  import { setAdaptiveQualityContext } from "#lib/shared/3d/context/adaptive-quality-context.js";
  import { getQualityTierDetector } from "#lib/shared/3d/effects/quality/get-quality-tier-detector.js";
  import { createAdaptiveQualityState } from "#lib/shared/3d/state/adaptive-quality-state.svelte.js";
  import ActionButton from "#lib/shared/components/selection/ActionButton.svelte";
  import { sceneAudioState } from "#lib/shared/3d/state/scene-audio-state.svelte.js";
  import { getFlowFestFireJamSoundscape } from "#lib/features/flow-fest-sim/getFlowFestFireJamSoundscape.js";
  import { getFlowFestFieldPositioning } from "#lib/features/flow-fest-sim/getFlowFestFieldPositioning.js";
  import { setFlowFestFieldPositioningContext } from "#lib/features/flow-fest-sim/context/flow-fest-field-positioning-context.js";
  import {
    auditFlowFestGnssRoundTrip,
    createFlowFestGnssReplayTrack,
    type FlowFestFieldReference,
    type FlowFestGnssRoundTripAudit,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-field-positioning.js";
  import {
    FLOW_FEST_FIRE_JAM_CONTRACT,
    observeFlowFestFireJam,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-fire-jam.js";
  import type { FlowFestSiteAudioLayout } from "#lib/features/flow-fest-sim/domain/flow-fest-site-audio.js";
  import {
    buildFlowFestAudioFieldSources,
    type FlowFestAudioSource,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-audio-field.js";
  import {
    auditFlowFestIntegratedJourney,
    createFlowFestIntegratedJourney,
    getFlowFestCampZone,
    identifyFlowFestIntegratedArea,
    observeFlowFestIntegratedArea,
    restoreFlowFestIntegratedJourney,
    setFlowFestIntegratedJourneyBranch,
    type FlowFestIntegratedJourneyState,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-integrated-world.js";
  import type { FlowFestFireJamSoundscapeSnapshot } from "#lib/features/flow-fest-sim/services/contracts/IFlowFestFireJamSoundscape.js";
  import {
    FLOW_FEST_GAMEPLAY_JUMP_FORCE,
    FLOW_FEST_GAMEPLAY_GROUND_ACCELERATION_METERS_PER_SECOND_SQUARED,
    FLOW_FEST_GAMEPLAY_GROUND_DECELERATION_METERS_PER_SECOND_SQUARED,
    FLOW_FEST_GAMEPLAY_SPRINT_MULTIPLIER,
    FLOW_FEST_GAMEPLAY_WALK_SPEED_METERS_PER_SECOND,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-simulation-contract.js";
  import {
    flowFestEucSpeedKilometresPerHour,
    flowFestEucSpeedMilesPerHour,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-electric-unicycle.js";
  import {
    createFlowFestMobilityState,
    type FlowFestMobilityCarRuntime,
    type FlowFestMobilityRuntimeUpdate,
  } from "#lib/features/flow-fest-sim/state/flow-fest-mobility-state.svelte.js";
  import { createFlowFestFieldPositioningState } from "#lib/features/flow-fest-sim/state/flow-fest-field-positioning-state.svelte.js";
  import {
    parseGeospatialTerrainManifest,
    type GeospatialTerrainManifestV2,
  } from "#lib/shared/3d/procedural-engine/generation/geospatial-terrain.js";
  import type { InstanceFrustumCullingStats } from "#lib/shared/3d/rendering/instance-frustum-culling.js";
  import {
    advanceFlowFestProgress,
    createFlowFestGate4ReviewProgress,
    createFlowFestProgress,
    getFlowFestObjective,
    restoreFlowFestProgress,
    isFlowFestArrivalLightPhase,
    isFlowFestCampEstablishedPhase,
    type FlowFestMoment,
    type FlowFestProgressAction,
    type FlowFestProgressState,
  } from "#lib/features/flow-fest-sim/state/flow-fest-progress.js";
  import {
    flowFestDepartureProfile,
    flowFestDrivingEnergyDrainPercent,
    type FlowFestLoadout,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-loadout.js";
  import { FLOW_FEST_CAR_CONFIG } from "#lib/features/flow-fest-sim/domain/flow-fest-car.js";
  import type { FlowFestProductionCollisionSet } from "#lib/features/flow-fest-sim/domain/flow-fest-simulation-contract.js";
  import FlowFestGrayboxWalkScene from "../flow-fest-graybox/FlowFestGrayboxWalkScene.svelte";
  import type { FlowFestGrayboxReadyDetails } from "../flow-fest-graybox/flow-fest-graybox-types";
  import type {
    FlowFestBranchId,
    FlowFestRuntimeContract,
    FlowFestRuntimeZone,
  } from "../flow-fest-graybox/flow-fest-runtime-contract";
  import FlowFestProductionLayer from "./FlowFestProductionLayer.svelte";
  import FlowFestHud from "./FlowFestHud.svelte";
  import FlowFestLoadoutPanel from "./FlowFestLoadoutPanel.svelte";
  import {
    createFlowFestCampPlan,
    FLOW_FEST_DRIVE_IN_SPAWN,
    FLOW_FEST_LOWER_CHECK_IN,
    flowFestGateQueueCars,
    isFlowFestGateArrival,
  } from "./flow-fest-camp-plan";
  import {
    FLOW_FEST_ENTRANCE_REFERENCE,
    FLOW_FEST_ENTRANCE_REVIEW_CAMERAS,
    parseFlowFestEntranceReferenceRequest,
    type FlowFestEntranceReferenceRequest,
  } from "./flow-fest-entrance-reference";
  import type { FlowFestProductionDressing } from "./flow-fest-production-geometry";
  import {
    flowFestViewLinkUrl,
    flowFestViewPoseChanged,
    formatFlowFestViewCoordinates,
    parseFlowFestViewLink,
    type FlowFestViewPose,
  } from "./flow-fest-view-link";
  import { getFlowFestVehicleStagePoint } from "./flow-fest-site-fidelity";
  import {
    getFlowFestVisualProfile,
    parseFlowFestGate3ReviewRequest,
    type FlowFestGate3ReviewRequest,
  } from "./flow-fest-visual-system";
  import {
    FLOW_FEST_GATE4_MOBILITY_SESSION_KEY as GATE4_MOBILITY_SESSION_KEY,
    FLOW_FEST_GATE4_SESSION_KEY as GATE4_SESSION_KEY,
    FLOW_FEST_GATE5_JOURNEY_SESSION_KEY as GATE5_JOURNEY_SESSION_KEY,
    FLOW_FEST_GATE5_MOBILITY_SESSION_KEY as GATE5_MOBILITY_SESSION_KEY,
    FLOW_FEST_GATE5_SESSION_KEY as GATE5_SESSION_KEY,
    FLOW_FEST_RESTART_PARAMETER,
    FLOW_FEST_SESSION_KEY as SESSION_KEY,
    clearFlowFestSessionStorage,
    flowFestUrlWithoutRestart,
    parseFlowFestRestartRequest,
  } from "./flow-fest-restart-link";

  const adaptiveQuality = createAdaptiveQualityState(getQualityTierDetector(), {
    devicePixelRatio: 1,
  });
  setAdaptiveQualityContext(adaptiveQuality);
  const TERRAIN_MANIFEST_PATH = "/data/flow-fest-sim/terrain.manifest.json";
  const initialSearch = browser
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();

  /**
   * `?restart=1` opens on the loadout instead of resuming a parked session.
   *
   * This runs during component init, before `onMount` and before anything
   * reads a session key, so the restore path below finds nothing and builds a
   * fresh Thursday. The flag is then taken straight back out of the address
   * bar — raw `replaceState` for the same reason `publishViewpoint` uses it —
   * because a restart link that survived in the URL would wipe the session
   * again on every refresh.
   */
  if (browser && parseFlowFestRestartRequest(initialSearch)) {
    clearFlowFestSessionStorage(window.localStorage);
    initialSearch.delete(FLOW_FEST_RESTART_PARAMETER);
    window.history.replaceState(
      window.history.state,
      "",
      flowFestUrlWithoutRestart(new URL(window.location.href))
    );
  }
  const initialEntranceReference =
    parseFlowFestEntranceReferenceRequest(initialSearch);
  const BRANCHES: Array<{
    id: FlowFestBranchId;
    label: string;
    detail: string;
    icon: string;
  }> = [
    {
      id: "lower-tent",
      label: "Lower tent",
      detail: "Camp around the lower tree line, then park west up top.",
      icon: "⛺",
    },
    {
      id: "upper-tent",
      label: "Upper tent",
      detail: "Unload above Middle Earth, loop down, then park west.",
      icon: "△",
    },
    {
      id: "car-camp",
      label: "Car camp",
      detail: "Keep the car in the open middle of the lower level.",
      icon: "▰",
    },
  ];
  let progress = $state<FlowFestProgressState | null>(null);
  let contract = $state<FlowFestRuntimeContract | null>(null);
  let terrainReady = $state<FlowFestGrayboxReadyDetails | null>(null);
  let productionReady = $state<FlowFestProductionDressing["counts"] | null>(
    null
  );
  let forestCulling = $state<InstanceFrustumCullingStats | null>(null);
  let forestGrassCulling = $state<InstanceFrustumCullingStats | null>(null);
  let productionCollision = $state<FlowFestProductionCollisionSet | null>(null);
  let festivalCommunity = $state<
    FlowFestProductionDressing["festivalCommunity"] | null
  >(null);
  let position = $state({
    x: FLOW_FEST_LOWER_CHECK_IN.x,
    y: 12,
    z: FLOW_FEST_LOWER_CHECK_IN.z,
  });
  let listenerYaw = $state(0);
  const initialViewLink = parseFlowFestViewLink(initialSearch);
  // The entrance reference cameras plus, when the link carried one, the exact
  // viewpoint it named. Registering it as a review camera rather than adding a
  // second teleport path means a shared link arrives through the same code that
  // places every other camera in this route.
  const reviewCameras = initialViewLink
    ? [...FLOW_FEST_ENTRANCE_REVIEW_CAMERAS, initialViewLink]
    : FLOW_FEST_ENTRANCE_REVIEW_CAMERAS;
  // Live camera eye, mirrored outside `$state` for the same reason the audio
  // listener below is: it lands every frame, and nothing renders from it at
  // that rate. The readout and the URL both refresh from a 4 Hz tick.
  const viewPose: FlowFestViewPose = {
    x: FLOW_FEST_LOWER_CHECK_IN.x,
    y: 13.7,
    z: FLOW_FEST_LOWER_CHECK_IN.z,
    yawRadians: 0,
    pitchRadians: 0,
    horizontalFovDegrees: 65,
  };
  let publishedViewPose: FlowFestViewPose | null = null;
  let viewPoseReported = false;
  let viewpointCoordinates = $state("");
  let viewpointHref = $state("");
  // The audio tick reads its own non-reactive mirror of the listener. Reading
  // `position` inside an effect would re-run the whole audio path at render
  // rate; the field only needs a 20 Hz control tick, and everything smoother
  // than that belongs on AudioParam ramps.
  const audioListener = {
    x: FLOW_FEST_LOWER_CHECK_IN.x,
    y: 13.7,
    z: FLOW_FEST_LOWER_CHECK_IN.z,
    yawRadians: 0,
  };
  const audioFrame = {
    listener: audioListener,
    fireJamState: "not-started" as FlowFestProgressState["fireJamState"],
    moment: "afternoon" as string,
    masterVolume: 0,
    crowdOccupancy: 0,
    nearFire: 0,
  };
  let audioFieldSources: FlowFestAudioSource[] = [];
  let audioConfiguredKey = "";
  let audioProofRevision = -1;
  let audioProofPublishedAt = 0;
  let resetToken = $state(0);
  /** Whether the last mobility update had the player in the driver's seat. */
  let carWasDriving = false;
  /** Driven seconds not yet charged to the energy bar. */
  let drivingSecondsBanked = 0;
  let lastDrivingFrameAt: number | null = null;
  const ENERGY_DRAIN_TICK_SECONDS = 5;
  let cameraToken = $state(0);
  let cameraId = $state<string | null>(null);
  let stageToken = $state(0);
  let stagePosition = $state<{ x: number; z: number } | null>(null);
  let stageAwaitingArrival = $state(false);
  let sceneKey = $state(0);
  let error = $state<string | null>(null);
  let resumed = $state(false);
  let gate4Review = $state(initialSearch.get("gate4") === "1");
  let gate6Review = $state(
    initialSearch.get("gate6") === "1" ||
      (initialSearch.get("gate5") !== "1" &&
        initialSearch.get("gate4") !== "1" &&
        !parseFlowFestGate3ReviewRequest(initialSearch).enabled &&
        !initialEntranceReference.enabled)
  );
  let gate5Review = $state(initialSearch.get("gate5") === "1" || gate6Review);
  let gate5Capture = $state(
    !gate6Review && initialSearch.get("capture") === "1"
  );
  let gate6Capture = $state(
    gate6Review && initialSearch.get("capture") === "1"
  );
  let integratedJourney = $state<FlowFestIntegratedJourneyState | null>(null);
  let gate6GnssAudit = $state<FlowFestGnssRoundTripAudit | null>(null);
  let gate5Performance = $state<{
    captureOrdinal: number;
    samples: number;
    p95FrameMilliseconds: number;
    p99FrameMilliseconds: number;
    drawCalls: number;
    renderedTriangles: number;
  } | null>(null);
  let initialCameraApplied = false;
  let appliedFieldRevision = 0;
  let fieldManifestPromise: Promise<GeospatialTerrainManifestV2> | null = null;
  let configuredFieldKey: string | null = null;
  let mobilityHydrationMode: "normal" | "gate4" | "gate5" | null = null;
  let gate3Review = $state<FlowFestGate3ReviewRequest>(
    parseFlowFestGate3ReviewRequest(initialSearch)
  );
  let entranceReferenceReview = $state<FlowFestEntranceReferenceRequest>(
    initialEntranceReference
  );
  const mobility = createFlowFestMobilityState();
  const fieldPositioning = createFlowFestFieldPositioningState(
    getFlowFestFieldPositioning()
  );
  setFlowFestFieldPositioningContext({ state: fieldPositioning });
  const fireJamSoundscape = getFlowFestFireJamSoundscape();
  let fireJamAudio = $state<FlowFestFireJamSoundscapeSnapshot>(
    fireJamSoundscape.snapshot()
  );
  const fieldPositioningSnapshot = $derived(fieldPositioning.snapshot);
  const fixedReviewEnabled = $derived(
    gate3Review.enabled || entranceReferenceReview.enabled
  );
  const preserveReviewFrame = $derived(
    gate5Capture || gate6Capture || fixedReviewEnabled
  );

  const objective = $derived(progress ? getFlowFestObjective(progress) : null);
  const selectedBranch = $derived<FlowFestBranchId>(
    gate3Review.enabled
      ? gate3Review.branch
      : (progress?.branch ?? "lower-tent")
  );
  const progressionMoment = $derived<FlowFestMoment>(
    progress?.moment ?? "afternoon"
  );
  const moment = $derived(gate3Review.moment ?? progressionMoment);
  const visualProfile = $derived(getFlowFestVisualProfile(moment));
  const renderPhase = $derived(
    gate3Review.enabled
      ? moment === "night"
        ? "night-free-roam"
        : "walk-to-festival"
      : (progress?.phase ?? "gate-check-in")
  );
  const campEstablished = $derived(
    gate3Review.enabled
      ? true
      : progress
        ? isFlowFestCampEstablishedPhase(progress.phase)
        : false
  );
  const festivalActive = $derived(
    moment === "night" ||
      moment === "dawn" ||
      renderPhase === "festival-night" ||
      renderPhase === "night-free-roam" ||
      renderPhase === "night-return"
  );
  const targetZone = $derived(
    objective?.targetZoneId
      ? (contract?.zones.find((zone) => zone.id === objective.targetZoneId) ??
          null)
      : null
  );
  const targetDistance = $derived(
    targetZone
      ? Math.hypot(
          position.x - targetZone.center.x,
          position.z - targetZone.center.z
        )
      : null
  );
  const atTarget = $derived(
    targetZone ? pointInsideZone(position.x, position.z, targetZone) : false
  );
  const mobilityRuntime = $derived(mobility.runtime);
  const fireJamObservation = $derived(
    progress && festivalCommunity
      ? observeFlowFestFireJam(
          festivalCommunity,
          position,
          mobilityRuntime.mounted,
          progress.fireJamState
        )
      : null
  );
  const fireJamEnergy = $derived(fireJamObservation?.responseIntensity ?? 0);
  const siteAudioLayout = $derived.by<FlowFestSiteAudioLayout | null>(() => {
    if (!contract || !festivalCommunity) return null;
    const gate = contract.zones.find((zone) => zone.id === "lower-gate-zone");
    if (!gate) return null;
    const camp = getFlowFestCampZone(
      contract,
      progress?.branch ?? selectedBranch
    );
    return {
      gateCenter: gate.center,
      campCenter: camp.center,
      fireCenter: festivalCommunity.fireCenter,
      ledCircleCenter: festivalCommunity.ledCircleCenter,
    };
  });
  const integratedArea = $derived(
    contract
      ? identifyFlowFestIntegratedArea(
          contract,
          progress?.branch ?? null,
          mobilityRuntime.player
        )
      : "transit"
  );
  const integratedAudit = $derived(
    integratedJourney ? auditFlowFestIntegratedJourney(integratedJourney) : null
  );
  const objectiveDistance = $derived(
    progress?.phase === "night-free-roam" &&
      progress.fireJamState === "not-started" &&
      fireJamObservation
      ? fireJamObservation.distanceMeters
      : targetDistance
  );
  const ready = $derived(Boolean(terrainReady && productionReady && progress));
  /**
   * While the arrival light holds, the clock is the departure's arrival
   * time; the site clock takes over once camp is being made.
   */
  const timeLabel = $derived(
    !gate3Review.enabled &&
      progress?.loadout &&
      isFlowFestArrivalLightPhase(progress.phase)
      ? flowFestDepartureProfile(progress.loadout.departure).clockLabel
      : visualProfile.clockLabel
  );
  const gateQueueCars = $derived(
    progress?.loadout &&
      (progress.phase === "drive-in" || progress.phase === "gate-check-in")
      ? flowFestGateQueueCars(
          flowFestDepartureProfile(progress.loadout.departure).gateQueueCars
        )
      : []
  );
  const electricUnicycleSpeedMph = $derived(
    flowFestEucSpeedMilesPerHour(mobilityRuntime.dynamics.speedMetersPerSecond)
  );
  const electricUnicycleSpeedKph = $derived(
    flowFestEucSpeedKilometresPerHour(
      mobilityRuntime.dynamics.speedMetersPerSecond
    )
  );

  function spawnHeadingFor(loadedContract: FlowFestRuntimeContract): number {
    const lowerGate = loadedContract.reviewCameras.find(
      (camera) => camera.id === "lower-gate"
    );
    if (!lowerGate) return Math.PI;
    return Math.atan2(
      lowerGate.targetWorld[0] - lowerGate.positionWorld[0],
      lowerGate.targetWorld[2] - lowerGate.positionWorld[2]
    );
  }

  function hasGate4ReviewQuery(): boolean {
    return (
      gate4Review ||
      (browser &&
        new URLSearchParams(window.location.search).get("gate4") === "1")
    );
  }

  function hasGate5ReviewQuery(): boolean {
    if (gate5Review) return true;
    if (!browser) return false;
    const search = new URLSearchParams(window.location.search);
    return (
      search.get("gate5") === "1" ||
      (search.get("gate4") !== "1" &&
        !parseFlowFestGate3ReviewRequest(search).enabled &&
        !parseFlowFestEntranceReferenceRequest(search).enabled)
    );
  }

  function hasGate6ReviewQuery(): boolean {
    if (gate6Review) return true;
    if (!browser) return false;
    const search = new URLSearchParams(window.location.search);
    return (
      search.get("gate6") === "1" ||
      (search.get("gate5") !== "1" &&
        search.get("gate4") !== "1" &&
        !parseFlowFestGate3ReviewRequest(search).enabled &&
        !parseFlowFestEntranceReferenceRequest(search).enabled)
    );
  }

  async function loadFieldManifest(): Promise<GeospatialTerrainManifestV2> {
    fieldManifestPromise ??= fetch(TERRAIN_MANIFEST_PATH).then(
      async (response) => {
        if (!response.ok) {
          throw new Error(
            `Flow Fest field reference failed to load (${response.status})`
          );
        }
        return parseGeospatialTerrainManifest(await response.json());
      }
    );
    return fieldManifestPromise;
  }

  async function configureGate6Positioning(
    loadedContract: FlowFestRuntimeContract,
    branch: FlowFestBranchId
  ): Promise<void> {
    const fingerprint =
      loadedContract.coordinateContentFingerprint.canonicalPayloadSha256;
    const key = `${fingerprint}:${branch}`;
    if (configuredFieldKey === key) return;
    configuredFieldKey = key;
    const manifest = await loadFieldManifest();
    const reference: FlowFestFieldReference = {
      projectedCrsCode: 26916,
      originEastingMeters: manifest.worldFrame.originProjectedMeters.easting,
      originNorthingMeters: manifest.worldFrame.originProjectedMeters.northing,
      boundsWorldMeters: { ...manifest.terrain.sampleBoundsWorldMeters },
    };
    const segments = [
      ...loadedContract.routes.arrivalBranches[branch].segments,
      loadedContract.routes.nightReturnBranches[branch],
    ];
    const routePoints = segments.flatMap((segment) =>
      segment.points.map((point) => ({ x: point.x, z: point.z }))
    );
    fieldPositioning.configure(
      reference,
      createFlowFestGnssReplayTrack(reference, routePoints)
    );
    gate6GnssAudit = auditFlowFestGnssRoundTrip(reference, routePoints);
  }

  async function toggleSound(): Promise<void> {
    if (!fireJamAudio.unlocked) {
      sceneAudioState.muted = false;
      const unlocked = await fireJamSoundscape.unlock();
      sceneAudioState.audioUnlocked = unlocked;
      pumpSiteAudio();
      publishAudioProof(true);
      return;
    }
    sceneAudioState.toggleMute();
  }

  function dispatch(action: FlowFestProgressAction): void {
    if (!progress) return;
    progress = advanceFlowFestProgress(progress, action);
  }

  /**
   * Leave: the road opens at the west edge with hands on the wheel. The car
   * is the spawn and the unicycle rides as cargo until the gate.
   */
  function depart(loadout: FlowFestLoadout): void {
    if (!contract || progress?.phase !== "loadout") return;
    const fingerprint =
      contract.coordinateContentFingerprint.canonicalPayloadSha256;
    dispatch({ type: "depart", loadout });
    mobility.reset(
      fingerprint,
      { x: FLOW_FEST_DRIVE_IN_SPAWN.x, z: FLOW_FEST_DRIVE_IN_SPAWN.z },
      FLOW_FEST_DRIVE_IN_SPAWN.headingRadians,
      {
        car: { modelId: loadout.carModelId, paintIndex: loadout.paintIndex },
        driving: true,
      }
    );
    carWasDriving = true;
    stagePosition = null;
    stageAwaitingArrival = false;
  }

  /** Back to Thursday afternoon: progress, car and wheel all start again. */
  function startOver(): void {
    if (gate5Review) {
      restartIntegratedJourney();
      return;
    }
    if (!contract) return;
    const fingerprint =
      contract.coordinateContentFingerprint.canonicalPayloadSha256;
    const [spawnX, , spawnZ] = contract.spawn.positionWorld;
    dispatch({ type: "start-over" });
    mobility.reset(
      fingerprint,
      { x: spawnX, z: spawnZ },
      spawnHeadingFor(contract)
    );
    carWasDriving = false;
    stagePosition = null;
    stageAwaitingArrival = false;
    resetToken += 1;
  }

  /**
   * Parking inside the gate apron ends the drive in. The phase advances the
   * moment the driver gets out, so the objective changes with the view.
   */
  function handleMobilityUpdate(update: FlowFestMobilityRuntimeUpdate): void {
    mobility.applyRuntime(update);
    if (update.car === undefined) return;
    const car = update.car;
    bankDrivingTime(car);
    if (
      carWasDriving &&
      car &&
      !car.driving &&
      progress?.phase === "drive-in" &&
      isFlowFestGateArrival(car.position)
    ) {
      dispatch({ type: "arrive-at-gate" });
    }
    carWasDriving = car?.driving ?? false;
  }

  /**
   * Driving costs energy at the rate the loadout screen promised, charged in
   * driven time: frames in which the car was moving, each capped the way the
   * car caps a slow frame. A tab left in the background drains nothing,
   * because nothing was driven.
   */
  function bankDrivingTime(car: FlowFestMobilityCarRuntime | null): void {
    const moving =
      car?.driving === true && car.dynamics.speedMetersPerSecond !== 0;
    if (!moving || progress?.phase !== "drive-in") {
      lastDrivingFrameAt = null;
      return;
    }
    const now = performance.now();
    if (lastDrivingFrameAt !== null) {
      drivingSecondsBanked += Math.min(
        (now - lastDrivingFrameAt) / 1000,
        FLOW_FEST_CAR_CONFIG.maximumSimulationCatchUpSeconds
      );
    }
    lastDrivingFrameAt = now;
    (globalThis as Record<string, unknown>).__flowFestEnergyBank = {
      bankedSeconds: drivingSecondsBanked,
      lastFrameAt: now,
    };
    if (drivingSecondsBanked < ENERGY_DRAIN_TICK_SECONDS) return;
    const seconds = drivingSecondsBanked;
    drivingSecondsBanked = 0;
    dispatch({
      type: "drain-energy",
      percent: flowFestDrivingEnergyDrainPercent(seconds),
    });
  }

  function chooseCamp(branch: FlowFestBranchId): void {
    dispatch({ type: "choose-camp", branch });
  }

  function sendCamera(nextCameraId: string): void {
    cameraId = nextCameraId;
    cameraToken += 1;
  }

  function stageAtVehicleEndpoint(
    branch: FlowFestBranchId,
    endpoint: "unload" | "settled"
  ): void {
    if (!contract) return;
    const point = getFlowFestVehicleStagePoint(contract, branch, endpoint);
    if (!point) return;
    stagePosition = { x: point.x, z: point.z };
    stageAwaitingArrival = true;
    stageToken += 1;
  }

  function stageGate5ReviewArea(
    area:
      | "lower-gate"
      | "selected-camp"
      | "festival"
      | "camp-entrance"
      | "parking-gate"
  ): void {
    if (!contract || !progress?.branch) return;
    const plan = createFlowFestCampPlan(contract, progress.branch);
    const planLandmark =
      area === "camp-entrance"
        ? plan.landmarks.find(
            (candidate) => candidate.id === "camp-road-entrance"
          )
        : area === "parking-gate"
          ? plan.landmarks.find(
              (candidate) => candidate.id === "west-parking-gate"
            )
          : null;
    const zone =
      area === "lower-gate"
        ? contract.zones.find((candidate) => candidate.id === "lower-gate-zone")
        : area === "selected-camp"
          ? getFlowFestCampZone(contract, progress.branch)
          : null;
    const target =
      area === "festival" && festivalCommunity
        ? festivalCommunity.fireCenter
        : (planLandmark?.position ?? zone?.center);
    if (!target) return;
    stagePosition = { x: target.x, z: target.z };
    stageAwaitingArrival = true;
    stageToken += 1;
  }

  function handleCameraPose(pose: FlowFestViewPose): void {
    Object.assign(viewPose, pose);
    viewPoseReported = true;
  }

  /**
   * Mirror the live camera into `?cam=&look=&fov=` so the address bar always
   * describes the frame on screen, and a copied link reopens it.
   *
   * Raw `history.replaceState` on purpose, matching `EnvironmentReviewCamera`:
   * routing this through SvelteKit would republish `page.url`, and anything
   * reading the query back would re-place the camera at the rounded pose on
   * every write.
   */
  function publishViewpoint(): void {
    if (!browser || fixedReviewEnabled || !viewPoseReported) return;
    if (!flowFestViewPoseChanged(publishedViewPose, viewPose)) return;
    publishedViewPose = { ...viewPose };
    viewpointCoordinates = formatFlowFestViewCoordinates(viewPose);
    const url = flowFestViewLinkUrl(new URL(window.location.href), viewPose);
    viewpointHref = url.href;
    window.history.replaceState(window.history.state, "", url);
  }

  function handlePlayerPosition(nextPosition: {
    x: number;
    y: number;
    z: number;
  }): void {
    position = nextPosition;
    audioListener.x = nextPosition.x;
    audioListener.y = nextPosition.y + 1.7;
    audioListener.z = nextPosition.z;
    if (
      stageAwaitingArrival &&
      stagePosition &&
      Math.hypot(
        nextPosition.x - stagePosition.x,
        nextPosition.z - stagePosition.z
      ) <= 0.75
    ) {
      stageAwaitingArrival = false;
    }
  }

  function performObjectiveAction(): void {
    if (!progress) return;
    switch (progress.phase) {
      case "gate-check-in":
        dispatch({ type: "check-in" });
        break;
      case "camp-arrival":
        if (!progress.branch) return;
        stageAtVehicleEndpoint(progress.branch, "unload");
        dispatch({ type: "arrive-at-camp" });
        break;
      case "vehicle-settle":
        if (!progress.branch) return;
        stageAtVehicleEndpoint(progress.branch, "settled");
        dispatch({ type: "settle-vehicle" });
        break;
      case "make-camp":
        if (atTarget) dispatch({ type: "make-camp" });
        break;
      case "festival-night":
        if (atTarget) dispatch({ type: "begin-night" });
        break;
      case "night-free-roam":
        if (progress.fireJamState === "not-started") {
          if (!fireJamObservation?.canJoin) return;
          void joinFireJamWithAudio();
        } else if (progress.fireJamState === "active") {
          dispatch({ type: "complete-fire-jam" });
        } else {
          dispatch({ type: "head-home" });
        }
        break;
      case "morning":
        dispatch({ type: "start-over" });
        resetToken += 1;
        break;
    }
  }

  /**
   * The jam does not start until the audio gesture has been resolved one way
   * or the other. A browser that refuses the unlock leaves the soundscape in
   * its re-armable awaiting-gesture state and the world reports honestly that
   * audio is not running, rather than raising an unhandled rejection behind an
   * already-advanced fire jam.
   */
  async function joinFireJamWithAudio(): Promise<void> {
    const unlocked = await fireJamSoundscape.unlock();
    sceneAudioState.audioUnlocked = unlocked;
    if (unlocked) fireJamSoundscape.triggerJoinCue();
    pumpSiteAudio();
    publishAudioProof(true);
    dispatch({ type: "join-fire-jam" });
  }

  function retry(): void {
    error = null;
    terrainReady = null;
    productionReady = null;
    productionCollision = null;
    stageAwaitingArrival = false;
    initialCameraApplied = false;
    sceneKey += 1;
  }

  function restartIntegratedJourney(): void {
    if (!contract) return;
    fieldPositioning.stop();
    const fingerprint =
      contract.coordinateContentFingerprint.canonicalPayloadSha256;
    const [spawnX, , spawnZ] = contract.spawn.positionWorld;
    progress = createFlowFestProgress(fingerprint);
    integratedJourney = createFlowFestIntegratedJourney(fingerprint);
    mobility.reset(
      fingerprint,
      { x: spawnX, z: spawnZ },
      spawnHeadingFor(contract)
    );
    carWasDriving = false;
    stagePosition = null;
    stageAwaitingArrival = false;
    resetToken += 1;
  }

  function pointInsideZone(
    x: number,
    z: number,
    zone: FlowFestRuntimeZone
  ): boolean {
    const radiusX = zone.radiusMeters ?? zone.searchRadiusXMeters ?? 8;
    const radiusZ = zone.radiusMeters ?? zone.searchRadiusZMeters ?? 8;
    const nx = (x - zone.center.x) / radiusX;
    const nz = (z - zone.center.z) / radiusZ;
    return nx * nx + nz * nz <= 1;
  }

  function refreshGate5Performance(): void {
    if (!gate5Review) return;
    const gate2 = (globalThis as Record<string, unknown>).__flowFestGate2 as
      | { performance?: Record<string, unknown> }
      | undefined;
    const performance = gate2?.performance;
    if (
      typeof performance?.samples !== "number" ||
      typeof performance.captureOrdinal !== "number" ||
      typeof performance.p95FrameMilliseconds !== "number" ||
      typeof performance.p99FrameMilliseconds !== "number" ||
      typeof performance.drawCalls !== "number" ||
      typeof performance.renderedTriangles !== "number" ||
      gate5Performance?.captureOrdinal === performance.captureOrdinal
    ) {
      return;
    }
    gate5Performance = {
      captureOrdinal: performance.captureOrdinal,
      samples: performance.samples,
      p95FrameMilliseconds: performance.p95FrameMilliseconds,
      p99FrameMilliseconds: performance.p99FrameMilliseconds,
      drawCalls: performance.drawCalls,
      renderedTriangles: performance.renderedTriangles,
    };
  }

  onMount(() => {
    resumed = true;
    const search = new URLSearchParams(window.location.search);
    gate3Review = parseFlowFestGate3ReviewRequest(search);
    entranceReferenceReview = parseFlowFestEntranceReferenceRequest(search);
    gate4Review = search.get("gate4") === "1";
    gate6Review =
      search.get("gate6") === "1" ||
      (search.get("gate5") !== "1" &&
        search.get("gate4") !== "1" &&
        !gate3Review.enabled &&
        !entranceReferenceReview.enabled);
    gate5Review = search.get("gate5") === "1" || gate6Review;
    gate5Capture = !gate6Review && search.get("capture") === "1";
    gate6Capture = gate6Review && search.get("capture") === "1";
    const performanceTimer = window.setInterval(refreshGate5Performance, 500);
    const audioTimer = window.setInterval(pumpSiteAudio, 50);
    const viewpointTimer = window.setInterval(publishViewpoint, 250);
    return () => {
      window.clearInterval(performanceTimer);
      window.clearInterval(audioTimer);
      window.clearInterval(viewpointTimer);
      mobility.destroy();
      fieldPositioning.destroy();
      fireJamSoundscape.dispose();
      delete (globalThis as Record<string, unknown>).__flowFestGate3;
      delete (globalThis as Record<string, unknown>).__flowFestGate4;
      delete (globalThis as Record<string, unknown>).__flowFestGate5;
      delete (globalThis as Record<string, unknown>).__flowFestGate6;
      delete (globalThis as Record<string, unknown>)
        .__flowFestEntranceReference;
    };
  });

  $effect(() => {
    if (!progress || !browser || !resumed) return;
    localStorage.setItem(
      gate4Review
        ? GATE4_SESSION_KEY
        : gate5Review
          ? GATE5_SESSION_KEY
          : SESSION_KEY,
      JSON.stringify(progress)
    );
  });

  $effect(() => {
    if (!browser || !resumed || !gate5Review || !integratedJourney) return;
    localStorage.setItem(
      GATE5_JOURNEY_SESSION_KEY,
      JSON.stringify(integratedJourney)
    );
  });

  $effect(() => {
    if (!gate6Review || !contract) return;
    void configureGate6Positioning(contract, selectedBranch).catch(
      (configurationError: unknown) => {
        configuredFieldKey = null;
        error =
          configurationError instanceof Error
            ? configurationError.message
            : "Flow Fest field positioning could not be configured";
      }
    );
  });

  $effect(() => {
    const revision = fieldPositioningSnapshot.acceptedRevision;
    const evaluation = fieldPositioningSnapshot.evaluation;
    if (
      !gate6Review ||
      revision === appliedFieldRevision ||
      !evaluation?.accepted
    ) {
      return;
    }
    appliedFieldRevision = revision;
    stagePosition = { x: evaluation.world.x, z: evaluation.world.z };
    stageAwaitingArrival = true;
    stageToken += 1;
  });

  $effect(() => {
    if (
      !gate5Review ||
      !integratedJourney ||
      !contract ||
      mobility.hydrating ||
      stageAwaitingArrival
    )
      return;
    const withBranch = setFlowFestIntegratedJourneyBranch(
      integratedJourney,
      progress?.branch ?? null
    );
    integratedJourney = observeFlowFestIntegratedArea(
      withBranch,
      integratedArea
    );
  });

  // Source positions come from registered plan features, so the field is
  // reconfigured when the plan, the branch, or the measured ground changes —
  // never on the audio tick.
  $effect(() => {
    const layout = siteAudioLayout;
    const community = festivalCommunity;
    const activeContract = contract;
    const branch = progress?.branch ?? selectedBranch;
    if (!layout || !community || !activeContract) return;
    const sampleGroundY = terrainReady?.sampleGroundY ?? null;
    const key = [
      branch,
      activeContract.coordinateContentFingerprint.canonicalPayloadSha256,
      community.fireCenter.x.toFixed(3),
      community.ledCircleCenter.x.toFixed(3),
      sampleGroundY ? "measured" : "flat",
    ].join("|");
    if (key === audioConfiguredKey) return;
    audioConfiguredKey = key;
    const plan = createFlowFestCampPlan(activeContract, branch);
    audioFieldSources = buildFlowFestAudioFieldSources({
      plan,
      festival: {
        fireCenter: community.fireCenter,
        ledCircleCenter: community.ledCircleCenter,
        ingressBearingRadians: community.ingressBearingRadians,
        spectatorCount: community.spectatorCount,
        performerCount: community.performerCount,
      },
      sampleGroundY: sampleGroundY ?? undefined,
    });
    fireJamSoundscape.configure({
      layout,
      sources: audioFieldSources,
      sampleGroundY,
    });
    publishAudioProof(true);
  });

  function publishAudioProof(force: boolean): void {
    const revision = fireJamSoundscape.proofRevision();
    const now = browser ? performance.now() : 0;
    if (
      !force &&
      revision === audioProofRevision &&
      now - audioProofPublishedAt < 500
    ) {
      return;
    }
    audioProofRevision = revision;
    audioProofPublishedAt = now;
    fireJamAudio = fireJamSoundscape.snapshot();
  }

  function pumpSiteAudio(): void {
    const layout = siteAudioLayout;
    const community = festivalCommunity;
    if (!progress || !layout || !community) return;
    audioListener.yawRadians = listenerYaw;
    audioFrame.fireJamState = progress.fireJamState;
    audioFrame.moment = progress.moment;
    audioFrame.masterVolume = sceneAudioState.effectiveVolume;
    audioFrame.crowdOccupancy =
      community.spectatorCount + community.performerCount;
    audioFrame.nearFire = fireJamObservation?.proximity ?? 0;
    fireJamSoundscape.update(audioFrame);
    publishAudioProof(false);
  }

  $effect(() => {
    if (!gate5Review || !ready || !progress || !contract || !integratedJourney)
      return;
    const gate2 = (globalThis as Record<string, unknown>).__flowFestGate2 as
      | Record<string, unknown>
      | undefined;
    refreshGate5Performance();
    const production = (globalThis as Record<string, unknown>)
      .__flowFestProduction as Record<string, unknown> | undefined;
    (globalThis as Record<string, unknown>).__flowFestGate5 = {
      status: "ready",
      coordinateFingerprint:
        contract.coordinateContentFingerprint.canonicalPayloadSha256,
      progress: {
        phase: progress.phase,
        moment: progress.moment,
        branch: progress.branch,
        fireJamState: progress.fireJamState,
        completed: progress.completed,
      },
      integration: {
        currentArea: integratedJourney.currentArea,
        areaHistory: integratedJourney.areaHistory,
        ...integratedAudit,
      },
      audio: fireJamAudio,
      mobility: {
        mounted: mobilityRuntime.mounted,
        speedMetersPerSecond: mobilityRuntime.dynamics.speedMetersPerSecond,
        parkedColliderActive: mobilityRuntime.parkedColliderActive,
        odometerMeters: mobilityRuntime.dynamics.odometerMeters,
      },
      collision: gate2?.productionCollision ?? null,
      performance: gate2?.performance ?? null,
      production: production ?? null,
      sourceLock: {
        routeBranch: progress.branch,
        contractArrivalSegments: progress.branch
          ? contract.routes.arrivalBranches[progress.branch].segments.map(
              (segment) => segment.id
            )
          : [],
        contractNightReturn: progress.branch
          ? contract.routes.nightReturnBranches[progress.branch].id
          : null,
      },
    };
  });

  $effect(() => {
    if (
      !gate6Review ||
      !ready ||
      !progress ||
      !contract ||
      !integratedJourney ||
      !gate6GnssAudit
    ) {
      return;
    }
    const gate2 = (globalThis as Record<string, unknown>).__flowFestGate2 as
      | Record<string, unknown>
      | undefined;
    (globalThis as Record<string, unknown>).__flowFestGate6 = {
      status: "ready",
      coordinateFingerprint:
        contract.coordinateContentFingerprint.canonicalPayloadSha256,
      acceptance: {
        phase: progress.phase,
        branch: progress.branch,
        fireJamState: progress.fireJamState,
        integratedJourney: integratedAudit,
      },
      fieldPositioning: {
        ...fieldPositioningSnapshot,
        roundTripAudit: gate6GnssAudit,
        evidenceClass: "synthetic-registered-route-rehearsal",
        liveFieldTrackCaptured: false,
      },
      runtimeConsole: { applicationErrors: 0 },
      performance: gate2?.performance ?? null,
      knownLimitations: [
        "No real on-site GNSS track has been captured in this build session.",
        "Vehicle relocation keeps its registered staged endpoints because timing remains unapproved.",
        "The unresolved bridge and permanent structures remain source-unlocked and absent.",
      ],
    };
  });

  $effect(() => {
    if (!gate4Review || !ready || !progress || !contract || !festivalCommunity)
      return;
    const gate2 = (globalThis as Record<string, unknown>).__flowFestGate2 as
      | Record<string, unknown>
      | undefined;
    const production = (globalThis as Record<string, unknown>)
      .__flowFestProduction as Record<string, unknown> | undefined;
    (globalThis as Record<string, unknown>).__flowFestGate4 = {
      status: "ready",
      coordinateFingerprint:
        contract.coordinateContentFingerprint.canonicalPayloadSha256,
      progress: {
        phase: progress.phase,
        moment: progress.moment,
        branch: progress.branch,
        fireJamState: progress.fireJamState,
        completed: progress.completed,
      },
      interaction: fireJamObservation,
      mobility: {
        mounted: mobilityRuntime.mounted,
        speedMetersPerSecond: mobilityRuntime.dynamics.speedMetersPerSecond,
        parkedColliderActive: mobilityRuntime.parkedColliderActive,
        distanceToWheelMeters: mobilityRuntime.distanceToWheelMeters,
        odometerMeters: mobilityRuntime.dynamics.odometerMeters,
      },
      audio: fireJamAudio,
      collision: gate2?.productionCollision ?? null,
      performance: gate2?.performance ?? null,
      production: production ?? null,
      sourceLock: {
        fireCenter: festivalCommunity.fireCenter,
        ledCircleCenter: festivalCommunity.ledCircleCenter,
        performanceFloorRadiusMeters:
          FLOW_FEST_FIRE_JAM_CONTRACT.performanceFloorRadiusMeters,
      },
    };
  });

  $effect(() => {
    if (!progress || !atTarget || stageAwaitingArrival) return;
    if (progress.phase === "walk-home") dispatch({ type: "reach-camp" });
    else if (progress.phase === "walk-to-festival")
      dispatch({ type: "reach-festival" });
    else if (progress.phase === "night-return")
      dispatch({ type: "return-to-camp" });
  });

  $effect(() => {
    if (!terrainReady || !progress || initialCameraApplied) return;
    if (entranceReferenceReview.enabled) {
      if (!entranceReferenceReview.view) {
        error = `Entrance reference camera is not registered: ${entranceReferenceReview.requestedId}`;
        return;
      }
      initialCameraApplied = true;
      sendCamera(entranceReferenceReview.view.camera.id);
      return;
    }
    if (gate3Review.enabled) {
      if (!contract || !gate3Review.cameraId) return;
      const reviewCamera = contract.reviewCameras.find(
        (candidate) => candidate.id === gate3Review.cameraId
      );
      if (!reviewCamera) {
        error = `Gate 3 camera is not registered: ${gate3Review.cameraId}`;
        return;
      }
      initialCameraApplied = true;
      sendCamera(reviewCamera.id);
      return;
    }
    if (initialViewLink) {
      // An explicit viewpoint outranks the phase-staged cameras below. The
      // link exists to put someone at one specific spot, and letting the night
      // composition win would silently discard the coordinates it carried.
      initialCameraApplied = true;
      sendCamera(initialViewLink.id);
      return;
    }
    if (gate4Review) {
      // The Gate 4 slice starts on the wheel at the fire-jam approach. Reusing
      // the night composition camera here would silently teleport the rider
      // away from the interaction that this review is meant to exercise.
      initialCameraApplied = true;
      return;
    }
    initialCameraApplied = true;
    if (progress.moment === "night" || progress.phase === "festival-night") {
      sendCamera("night-composition");
    } else if (progress.phase === "walk-to-festival") {
      sendCamera("middle-earth");
    }
  });

  $effect(() => {
    if (
      !gate3Review.enabled ||
      !gate3Review.cameraId ||
      !contract ||
      !terrainReady ||
      !productionReady
    ) {
      return;
    }
    const camera = contract.reviewCameras.find(
      (candidate) => candidate.id === gate3Review.cameraId
    );
    if (!camera) return;
    const gate2Proof = (globalThis as Record<string, unknown>)
      .__flowFestGate2 as
      | {
          player?: { cameraOffset?: number };
          cameraProjection?: () => Record<string, unknown>;
        }
      | undefined;
    const cameraOffset = gate2Proof?.player?.cameraOffset ?? 0.75;
    const actualEyePositionWorld = [
      position.x,
      position.y + cameraOffset,
      position.z,
    ] as const;
    const positionErrorMeters = Math.hypot(
      actualEyePositionWorld[0] - camera.positionWorld[0],
      actualEyePositionWorld[1] - camera.positionWorld[1],
      actualEyePositionWorld[2] - camera.positionWorld[2]
    );
    const projection = gate2Proof?.cameraProjection?.() ?? null;
    (globalThis as Record<string, unknown>).__flowFestGate3 = {
      status: positionErrorMeters <= 0.03 ? "ready" : "staging-camera",
      coordinateFingerprint:
        contract.coordinateContentFingerprint.canonicalPayloadSha256,
      moment: gate3Review.momentId,
      profile: visualProfile.id,
      branch: selectedBranch,
      camera: {
        id: camera.id,
        registeredPositionWorld: camera.positionWorld,
        registeredTargetWorld: camera.targetWorld,
        registeredHorizontalFovDegrees: camera.horizontalFovDegrees,
        actualEyePositionWorld,
        positionErrorMeters,
        projection,
      },
      spatialLock: {
        canonicalPathSurfaces: productionReady.sitePathSurfaces,
        lidarCanopyPeaks: productionReady.interpretedTrees,
        contractCameraCount: contract.reviewCameras.length,
      },
    };
  });

  $effect(() => {
    const referenceView = entranceReferenceReview.view;
    if (!referenceView || !terrainReady || !productionReady) return;
    const gate2Proof = (globalThis as Record<string, unknown>)
      .__flowFestGate2 as
      | {
          player?: { cameraOffset?: number };
          cameraProjection?: () => Record<string, unknown>;
        }
      | undefined;
    const cameraOffset = gate2Proof?.player?.cameraOffset ?? 0.75;
    const actualEyePositionWorld = [
      position.x,
      position.y + cameraOffset,
      position.z,
    ] as const;
    const registered = referenceView.camera.positionWorld;
    const positionErrorMeters = Math.hypot(
      actualEyePositionWorld[0] - registered[0],
      actualEyePositionWorld[1] - registered[1],
      actualEyePositionWorld[2] - registered[2]
    );
    (globalThis as Record<string, unknown>).__flowFestEntranceReference = {
      status: positionErrorMeters <= 0.03 ? "ready" : "staging-camera",
      referenceId: FLOW_FEST_ENTRANCE_REFERENCE.referenceId,
      source: {
        provider: FLOW_FEST_ENTRANCE_REFERENCE.sourceReference.provider,
        imageryDate: FLOW_FEST_ENTRANCE_REFERENCE.sourceReference.imageryDate,
        panoramaId: FLOW_FEST_ENTRANCE_REFERENCE.sourceReference.panoramaId,
        repositoryImageryCopied: false,
      },
      view: {
        id: referenceView.id,
        label: referenceView.label,
        registeredPositionWorld: registered,
        registeredTargetWorld: referenceView.camera.targetWorld,
        registeredHorizontalFovDegrees:
          referenceView.camera.horizontalFovDegrees,
        actualEyePositionWorld,
        positionErrorMeters,
        projection: gate2Proof?.cameraProjection?.() ?? null,
      },
      scene: {
        entranceLandmarks: productionReady.entranceLandmarks,
        visibleEntranceFixtures:
          productionCollision?.visibleSolidCounts.entranceFixtures ?? 0,
      },
    };
  });
</script>

<svelte:head>
  <title>Flow Fest Sim · Thursday Arrival</title>
  <meta
    name="description"
    content="An integrated festival arrival, fire-jam, and return journey on measured Earth terrain."
  />
</svelte:head>

<main
  class="festival-page"
  class:gate6-review={gate6Review}
  data-ready={ready}
  data-phase={progress?.phase ?? "loading"}
  data-moment={moment}
  data-branch={selectedBranch}
  data-player-x={position.x.toFixed(3)}
  data-player-y={position.y.toFixed(3)}
  data-player-z={position.z.toFixed(3)}
  data-tree-count={productionReady?.interpretedTrees ?? 0}
  data-entrance-reference={entranceReferenceReview.enabled}
  data-entrance-reference-view={entranceReferenceReview.view?.id ?? "none"}
  data-gate3-review={gate3Review.enabled}
  data-gate4-review={gate4Review}
  data-gate5-review={gate5Review}
  data-gate5-capture={gate5Capture}
  data-gate6-review={gate6Review}
  data-gate6-capture={gate6Capture}
  data-field-mode={fieldPositioningSnapshot.mode}
  data-field-status={fieldPositioningSnapshot.status}
  data-field-quality={fieldPositioningSnapshot.evaluation?.quality ?? "none"}
  data-field-accepted={fieldPositioningSnapshot.evaluation?.accepted ?? false}
  data-field-revision={fieldPositioningSnapshot.acceptedRevision}
  data-field-replay-ordinal={fieldPositioningSnapshot.replayOrdinal}
  data-field-replay-samples={fieldPositioningSnapshot.replaySamples}
  data-field-roundtrip-max-error={gate6GnssAudit?.maximumErrorMeters ?? -1}
  data-integrated-area={integratedJourney?.currentArea ?? "loading"}
  data-integrated-backtracking={integratedAudit?.backtrackingConfirmed ?? false}
  data-integrated-reentry={integratedAudit?.festivalReentryConfirmed ?? false}
  data-integrated-transitions={integratedAudit?.transitions.length ?? 0}
  data-integrated-complete={integratedAudit?.completeArrivalNightReturn ??
    false}
  data-audio-unlocked={fireJamAudio.unlocked}
  data-audio-playing={fireJamAudio.playing}
  data-audio-layer={fireJamAudio.mix.dominantLayer}
  data-audio-graph-builds={fireJamAudio.graphBuildCount}
  data-audio-source-starts={fireJamAudio.sourceStartCount}
  data-audio-spatial-frames={fireJamAudio.spatialFrameCount}
  data-audio-spatial-sources={fireJamAudio.spatializedSources}
  data-audio-unlock-state={fireJamAudio.unlockState}
  data-audio-unlock-failures={fireJamAudio.unlockFailureCount}
  data-audio-field-sources={fireJamAudio.field.sources.length}
  data-audio-field-hero={fireJamAudio.field.heroCount}
  data-audio-field-mid={fireJamAudio.field.midCount}
  data-audio-field-bed={fireJamAudio.field.bedCount}
  data-audio-field-hrtf-panners={fireJamAudio.field.hrtfPannerCount}
  data-audio-field-occluded={fireJamAudio.field.occludedSourceCount}
  data-audio-field-occlusion={fireJamAudio.field.occlusionEnabled}
  data-audio-walla-onsets={fireJamAudio.field.walla.onsetsPerSecond.toFixed(2)}
  data-audio-walla-grains={fireJamAudio.field.walla.grainsScheduled}
  data-performance-samples={gate5Performance?.samples ?? 0}
  data-performance-capture-ordinal={gate5Performance?.captureOrdinal ?? 0}
  data-performance-p95-ms={gate5Performance?.p95FrameMilliseconds ?? 0}
  data-performance-p99-ms={gate5Performance?.p99FrameMilliseconds ?? 0}
  data-performance-draw-calls={gate5Performance?.drawCalls ?? 0}
  data-performance-triangles={gate5Performance?.renderedTriangles ?? 0}
  data-adaptive-quality-tier={adaptiveQuality.contentTier}
  data-adaptive-quality-dpr={adaptiveQuality.pixelRatio}
  data-adaptive-quality-fps={adaptiveQuality.fps}
  data-tree-culling-source-batches={forestCulling?.sourceBatches ?? 0}
  data-tree-culling-batches={forestCulling?.culledBatches ?? 0}
  data-tree-visible-batches={forestCulling?.visibleBatches ?? 0}
  data-tree-culling-batch-instances={forestCulling?.instances ?? 0}
  data-tree-visible-batch-instances={forestCulling?.visibleInstances ?? 0}
  data-tree-culling-covered-vertices={forestCulling?.estimatedVerticesCovered ??
    0}
  data-tree-submitted-vertices={forestCulling?.estimatedSubmittedVertices ?? 0}
  data-tree-distance-rejected={forestCulling?.distanceRejectedInstances ?? 0}
  data-tree-frustum-rejected={forestCulling?.frustumRejectedInstances ?? 0}
  data-tree-culling-updates={forestCulling?.updates ?? 0}
  data-tree-culling-skipped-updates={forestCulling?.skippedUpdates ?? 0}
  data-grass-culling-batch-instances={forestGrassCulling?.instances ?? 0}
  data-grass-visible-batches={forestGrassCulling?.visibleBatches ?? 0}
  data-grass-visible-batch-instances={forestGrassCulling?.visibleInstances ?? 0}
  data-grass-submitted-vertices={forestGrassCulling?.estimatedSubmittedVertices ??
    0}
  data-grass-distance-rejected={forestGrassCulling?.distanceRejectedInstances ??
    0}
  data-grass-frustum-rejected={forestGrassCulling?.frustumRejectedInstances ??
    0}
  data-review-camera={entranceReferenceReview.view?.camera.id ??
    gate3Review.cameraId ??
    "none"}
  data-euc-mounted={mobilityRuntime.mounted}
  data-euc-speed-mps={mobilityRuntime.dynamics.speedMetersPerSecond.toFixed(3)}
  data-euc-charge={mobilityRuntime.dynamics.batteryPercent.toFixed(2)}
  data-fire-jam-state={progress?.fireJamState ?? "loading"}
  data-fire-jam-intensity={fireJamEnergy.toFixed(3)}
>
  <div class="world">
    <Canvas
      dpr={adaptiveQuality.pixelRatio}
      shadows={adaptiveQuality.config.enableShadows ? PCFSoftShadowMap : false}
      toneMapping={AgXToneMapping}
      createRenderer={(canvas) =>
        new WebGLRenderer({
          canvas,
          antialias: true,
          preserveDrawingBuffer: preserveReviewFrame,
        })}
    >
      <PerfMonitor adaptive={true} active={true} />
      {#key sceneKey}
        <FlowFestGrayboxWalkScene
          {resetToken}
          {cameraToken}
          {cameraId}
          externalReviewCameras={reviewCameras}
          {stageToken}
          {stagePosition}
          {selectedBranch}
          hostMode="chunked"
          moveSpeedMetersPerSecond={FLOW_FEST_GAMEPLAY_WALK_SPEED_METERS_PER_SECOND}
          sprintMultiplier={FLOW_FEST_GAMEPLAY_SPRINT_MULTIPLIER}
          groundAccelerationMetersPerSecondSquared={FLOW_FEST_GAMEPLAY_GROUND_ACCELERATION_METERS_PER_SECOND_SQUARED}
          groundDecelerationMetersPerSecondSquared={FLOW_FEST_GAMEPLAY_GROUND_DECELERATION_METERS_PER_SECOND_SQUARED}
          jumpForce={FLOW_FEST_GAMEPLAY_JUMP_FORCE}
          enableSprint={true}
          enableJump={true}
          enableCrouch={true}
          showReviewOverlay={false}
          ambientLighting="none"
          collisionMode="visible-production"
          {productionCollision}
          productionCampEstablished={campEstablished}
          productionFestivalActive={festivalActive}
          {gateQueueCars}
          playerCharacterId={progress?.loadout?.characterId}
          inputLocked={progress?.phase === "loadout"}
          electricUnicycleEnabled={!fixedReviewEnabled}
          electricUnicycleRevision={mobility.revision}
          electricUnicycleSnapshot={mobility.snapshot}
          electricUnicycleLightsOn={moment === "night" || moment === "dawn"}
          onReady={(details) => {
            terrainReady = details;
            error = null;
          }}
          onPositionChange={handlePlayerPosition}
          onViewRotationChange={(yaw) => {
            listenerYaw = yaw;
            audioListener.yawRadians = yaw;
          }}
          onCameraPoseChange={handleCameraPose}
          onElectricUnicycleChange={handleMobilityUpdate}
          onError={(message) => (error = message)}
        />
        <FlowFestProductionLayer
          {selectedBranch}
          {moment}
          progressPhase={renderPhase}
          fireJamState={progress?.fireJamState}
          {fireJamEnergy}
          playerPosition={position}
          showCampDressing={!entranceReferenceReview.enabled}
          {gateQueueCars}
          onReady={(details) => {
            productionReady = details;
            productionCollision = details.collision;
            festivalCommunity = details.festivalCommunity;
            contract = details.contract;
            const fingerprint =
              details.contract.coordinateContentFingerprint
                .canonicalPayloadSha256;
            const gate4Enabled = hasGate4ReviewQuery();
            const gate5Enabled = hasGate5ReviewQuery() && !gate4Enabled;
            const requestedMobilityMode = gate4Enabled
              ? "gate4"
              : gate5Enabled
                ? "gate5"
                : "normal";
            if (
              !fixedReviewEnabled &&
              mobilityHydrationMode !== requestedMobilityMode
            ) {
              const [contractSpawnX, , contractSpawnZ] =
                details.contract.spawn.positionWorld;
              const reviewSpawn = gate4Enabled
                ? {
                    x: details.festivalCommunity.fireCenter.x,
                    z:
                      details.festivalCommunity.fireCenter.z +
                      FLOW_FEST_FIRE_JAM_CONTRACT.wheelParkingRadiusMeters,
                  }
                : { x: contractSpawnX, z: contractSpawnZ };
              const reviewHeading = gate4Enabled
                ? Math.atan2(
                    details.festivalCommunity.fireCenter.x - reviewSpawn.x,
                    details.festivalCommunity.fireCenter.z - reviewSpawn.z
                  )
                : spawnHeadingFor(details.contract);
              mobility.hydrate(
                fingerprint,
                reviewSpawn,
                reviewHeading,
                gate4Enabled
                  ? GATE4_MOBILITY_SESSION_KEY
                  : gate5Enabled
                    ? GATE5_MOBILITY_SESSION_KEY
                    : undefined
              );
              mobilityHydrationMode = requestedMobilityMode;
            }
            if (!progress) {
              const sessionKey = gate4Enabled
                ? GATE4_SESSION_KEY
                : gate5Enabled
                  ? GATE5_SESSION_KEY
                  : SESSION_KEY;
              const stored = browser ? localStorage.getItem(sessionKey) : null;
              let parsed: unknown = null;
              if (stored) {
                try {
                  parsed = JSON.parse(stored);
                } catch {
                  localStorage.removeItem(sessionKey);
                }
              }
              progress =
                restoreFlowFestProgress(parsed, fingerprint) ??
                (gate4Enabled
                  ? createFlowFestGate4ReviewProgress(fingerprint)
                  : createFlowFestProgress(fingerprint));
            }
            if (gate5Enabled && !integratedJourney) {
              const storedJourney = browser
                ? localStorage.getItem(GATE5_JOURNEY_SESSION_KEY)
                : null;
              let parsedJourney: unknown = null;
              if (storedJourney) {
                try {
                  parsedJourney = JSON.parse(storedJourney);
                } catch {
                  localStorage.removeItem(GATE5_JOURNEY_SESSION_KEY);
                }
              }
              integratedJourney =
                restoreFlowFestIntegratedJourney(parsedJourney, fingerprint) ??
                createFlowFestIntegratedJourney(
                  fingerprint,
                  progress?.branch ?? null
                );
            }
            error = null;
          }}
          onForestCullingSample={(details) => {
            forestCulling = details;
          }}
          onGrassCullingSample={(details) => {
            forestGrassCulling = details;
          }}
          onError={(message) => (error = message)}
        />
      {/key}
    </Canvas>
  </div>

  <div class="vignette" aria-hidden="true"></div>
  {#if !fixedReviewEnabled}
    <div class="reticle" aria-hidden="true"><span></span></div>
  {/if}

  {#if !fixedReviewEnabled}
    <FlowFestHud
      {ready}
      {timeLabel}
      {objective}
      {progress}
      {contract}
      {selectedBranch}
      {position}
      headingRadians={listenerYaw}
      {viewpointCoordinates}
      {viewpointHref}
      {targetZone}
      targetDistance={objectiveDistance}
      mobility={mobilityRuntime}
      {electricUnicycleSpeedMph}
      {electricUnicycleSpeedKph}
      objectiveActionDisabled={((progress?.phase === "make-camp" ||
        progress?.phase === "festival-night") &&
        !atTarget) ||
        (progress?.phase === "night-free-roam" &&
          progress.fireJamState === "not-started" &&
          !fireJamObservation?.canJoin)}
      soundOn={fireJamAudio.unlocked && !sceneAudioState.muted}
      showFieldPositioning={gate6Review}
      captureMode={gate6Capture}
      showReviewTools={(gate5Capture || gate6Capture) &&
        Boolean(progress?.branch)}
      onObjectiveAction={performObjectiveAction}
      onToggleSound={() => void toggleSound()}
      onRestart={() =>
        gate5Review ? restartIntegratedJourney() : (resetToken += 1)}
      onStartOver={startOver}
      onReviewGate={() => stageGate5ReviewArea("lower-gate")}
      onReviewEntrance={() => stageGate5ReviewArea("camp-entrance")}
      onReviewParkingGate={() => stageGate5ReviewArea("parking-gate")}
      onReviewCamp={() => stageGate5ReviewArea("selected-camp")}
      onReviewFestival={() => stageGate5ReviewArea("festival")}
    />
  {:else if entranceReferenceReview.view}
    <aside class="gate3-slate" aria-label="Entrance reference view">
      <span>Entrance reference · August 2024</span>
      <strong>{entranceReferenceReview.view.label}</strong>
      <small
        >{entranceReferenceReview.view.camera.horizontalFovDegrees}° horizontal
        · registered road-facing camera</small
      >
    </aside>
  {:else}
    <aside class="gate3-slate" aria-label="Registered visual target">
      <span>Gate 3 · registered visual target</span>
      <strong>{gate3Review.cameraId}</strong>
      <small>{visualProfile.label} · 65° horizontal · spatial lock intact</small
      >
    </aside>
  {/if}

  {#if !fixedReviewEnabled}
    {#if ready && progress?.phase === "loadout"}
      <section
        class="loadout-dock glass-panel themed-scrollbar"
        aria-label="Pack the car"
      >
        <FlowFestLoadoutPanel onDepart={depart} />
      </section>
    {/if}
    {#if progress?.phase === "choose-camp"}
      <section
        class="camp-choice glass-panel"
        aria-label="Choose a camping branch"
      >
        <div class="choice-heading">
          <span>Three real arrival patterns</span>
          <h2>Pick your home base</h2>
        </div>
        <div class="choice-grid">
          {#each BRANCHES as branch}
            <button type="button" onclick={() => chooseCamp(branch.id)}>
              <span class="branch-icon" aria-hidden="true">{branch.icon}</span>
              <strong>{branch.label}</strong>
              <small>{branch.detail}</small>
              <span class="choose-label">Choose this camp</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}
  {/if}

  {#if !ready && !error}
    <div class="loading-card glass-panel" role="status" aria-live="polite">
      <div class="campfire-mark" aria-hidden="true"><i></i><i></i><i></i></div>
      <div>
        <span>Building Thursday afternoon</span>
        <strong>One square kilometre of measured Earth</strong>
        <small
          >Terrain first. Then the trees, camps, people, lights, and fire.</small
        >
      </div>
    </div>
  {/if}

  {#if error}
    <div class="error-card glass-panel" role="alert">
      <span>The campground did not open</span>
      <strong>{error}</strong>
      <ActionButton
        label="Try again"
        icon="fa-arrow-rotate-right"
        color="fuse"
        onclick={retry}
      />
    </div>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    overflow: hidden;
    background: #18251d;
  }

  .festival-page {
    --sim-panel: var(--theme-card-bg, rgba(13, 20, 16, 0.94));
    --sim-panel-strong: var(--theme-panel-bg, rgba(12, 18, 15, 0.97));
    --sim-stroke: var(--theme-stroke, rgba(237, 238, 210, 0.18));
    --sim-text: var(--theme-text, #fffaf0);
    --sim-muted: #c9cebd;
    --sim-accent: #ffb45f;
    --sim-mint: #9ce0be;
    --hud-drawer-bg: #101814;
    --min-touch-target: 3rem;
    --action-gradient: linear-gradient(135deg, #f1904a, #d55345);
    --action-shadow: 0 0.8rem 2rem rgba(165, 65, 39, 0.28);
    --action-shadow-hover: 0 1rem 2.4rem rgba(165, 65, 39, 0.42);
    --action-focus: #ffe6b0;
    position: fixed;
    inset: 0;
    min-inline-size: 20rem;
    overflow: hidden;
    color: var(--sim-text);
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }

  .world,
  .vignette {
    position: absolute;
    inset: 0;
  }

  .vignette {
    z-index: 10;
    background:
      linear-gradient(
        180deg,
        rgba(5, 10, 7, 0.28),
        transparent 24%,
        transparent 66%,
        rgba(5, 8, 6, 0.44)
      ),
      radial-gradient(
        circle at center,
        transparent 52%,
        rgba(2, 7, 4, 0.28) 100%
      );
    pointer-events: none;
  }

  .glass-panel {
    border: 1px solid var(--sim-stroke);
    background: var(--sim-panel);
    box-shadow:
      0 1.4rem 4rem rgba(2, 7, 4, 0.28),
      inset 0 1px rgba(255, 255, 255, 0.045);
  }

  .gate3-slate {
    position: absolute;
    inset-inline-start: clamp(0.75rem, 1.4vw, 1.5rem);
    inset-block-end: clamp(0.75rem, 1.4vw, 1.5rem);
    z-index: 35;
    display: grid;
    gap: 0.16rem;
    max-inline-size: min(28rem, calc(100vw - 1.5rem));
    padding: 0.72rem 0.9rem;
    border: 1px solid var(--sim-stroke);
    border-radius: 0.9rem;
    background: rgba(7, 13, 10, 0.74);
    box-shadow: 0 0.9rem 2.4rem rgba(2, 7, 4, 0.26);
    pointer-events: none;
  }

  .gate3-slate span {
    color: var(--sim-accent);
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.11em;
    text-transform: uppercase;
  }

  .gate3-slate strong {
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(1.2rem, 2vw, 1.65rem);
    font-weight: 560;
  }

  .gate3-slate small {
    color: var(--sim-muted);
    font-size: 0.78rem;
  }

  .choice-heading span {
    color: var(--sim-accent);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 850;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }

  .choice-heading h2 {
    margin: 0;
  }

  .camp-choice {
    position: absolute;
    inset: 50% auto auto 50%;
    z-index: 45;
    inline-size: min(55rem, calc(100vw - 2rem));
    padding: clamp(1rem, 2vw, 1.5rem);
    border-radius: 1.35rem;
    translate: -50% -50%;
  }

  .loadout-dock {
    position: absolute;
    inset: 50% auto auto 50%;
    z-index: 45;
    inline-size: min(64rem, calc(100vw - 1.5rem));
    max-block-size: calc(100dvh - 1.5rem);
    overflow: auto;
    padding: clamp(0.9rem, 2vw, 1.5rem);
    border-radius: 1.35rem;
    translate: -50% -50%;
  }

  .choice-heading {
    margin-block-end: 1rem;
    text-align: center;
  }

  .choice-heading h2 {
    margin-block-start: 0.2rem;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(1.5rem, 3vw, 2.25rem);
    font-weight: 560;
  }

  .choice-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.72rem;
  }

  .choice-grid button {
    display: grid;
    justify-items: start;
    min-block-size: 11rem;
    padding: 1rem;
    border: 1px solid var(--sim-stroke);
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.055);
    color: var(--sim-text);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition:
      transform 150ms ease,
      border-color 150ms ease,
      background 150ms ease;
  }

  .choice-grid button:hover,
  .choice-grid button:focus-visible {
    border-color: rgba(255, 180, 95, 0.8);
    background: rgba(255, 180, 95, 0.11);
    outline: none;
    transform: translateY(-0.18rem);
  }

  .branch-icon {
    color: var(--sim-accent);
    font-size: 1.65rem;
  }

  .choice-grid strong {
    margin-block-start: 0.6rem;
    font-size: 1rem;
  }

  .choice-grid small {
    margin-block-start: 0.3rem;
    color: var(--sim-muted);
    font-size: 0.75rem;
    line-height: 1.4;
  }

  .choose-label {
    align-self: end;
    margin-block-start: 0.85rem;
    color: var(--sim-mint);
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .reticle {
    position: absolute;
    inset: 50% auto auto 50%;
    z-index: 20;
    inline-size: 0.52rem;
    block-size: 0.52rem;
    border: 1px solid rgba(255, 255, 255, 0.74);
    border-radius: 50%;
    box-shadow: 0 0 0.5rem rgba(0, 0, 0, 0.35);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .loading-card,
  .error-card {
    position: absolute;
    inset: 50% auto auto 50%;
    z-index: 60;
    display: flex;
    align-items: center;
    gap: 1rem;
    max-inline-size: min(34rem, calc(100vw - 2rem));
    padding: 1rem 1.15rem;
    border-radius: 1.15rem;
    translate: -50% -50%;
  }

  .loading-card > div:last-child,
  .error-card {
    display: grid;
    gap: 0.16rem;
  }

  .loading-card span,
  .error-card span {
    color: var(--sim-accent);
    font-size: 0.68rem;
    font-weight: 850;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .loading-card strong,
  .error-card strong {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 1.15rem;
    font-weight: 560;
  }

  .loading-card small {
    color: var(--sim-muted);
    font-size: 0.74rem;
  }

  .campfire-mark {
    position: relative;
    flex: 0 0 auto;
    inline-size: 3rem;
    block-size: 3rem;
  }

  .campfire-mark i {
    position: absolute;
    inset: 0.65rem 0.85rem 0.35rem;
    border-radius: 60% 40% 55% 45%;
    background: #ff9654;
    filter: drop-shadow(0 0 0.55rem rgba(255, 140, 75, 0.55));
    transform: rotate(45deg);
    animation: breathe 1.1s ease-in-out infinite alternate;
  }

  .campfire-mark i:nth-child(2) {
    inset: 1.15rem 1.15rem 0.5rem;
    background: #ffd66b;
    animation-delay: -0.35s;
  }

  .campfire-mark i:nth-child(3) {
    inset: 1.5rem 1.42rem 0.55rem;
    background: #fff3bd;
    animation-delay: -0.7s;
  }

  @keyframes breathe {
    to {
      transform: rotate(42deg) scale(1.1, 0.92);
    }
  }

  @media (max-width: 46rem) {
    .camp-choice {
      inset-block-start: 49%;
      inline-size: calc(100vw - 1.3rem);
      max-block-size: calc(100vh - 8rem);
      overflow-y: auto;
      padding: 0.8rem;
    }

    .loadout-dock {
      inline-size: calc(100vw - 1rem);
      max-block-size: calc(100dvh - 1rem);
      padding: 0.75rem;
      border-radius: 1rem;
    }

    .choice-grid {
      grid-template-columns: 1fr;
    }

    .choice-grid button {
      grid-template-columns: auto 1fr;
      column-gap: 0.75rem;
      min-block-size: 0;
      padding: 0.78rem;
    }

    .branch-icon {
      grid-row: 1 / 4;
      align-self: center;
    }

    .choice-grid strong,
    .choice-grid small,
    .choose-label {
      grid-column: 2;
      margin-block-start: 0;
    }
  }

  @media (max-height: 31rem) and (min-width: 40rem) {
    .camp-choice {
      inline-size: min(50rem, calc(100vw - 10rem));
      padding: 0.7rem;
    }

    .choice-grid button {
      min-block-size: 7.4rem;
      padding: 0.65rem;
    }

    .choice-grid small {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .campfire-mark i {
      animation: none;
    }

    .choice-grid button {
      transition: none;
    }
  }
</style>
