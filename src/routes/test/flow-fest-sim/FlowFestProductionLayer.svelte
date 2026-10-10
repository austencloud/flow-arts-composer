<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { T, useTask, useThrelte } from "@threlte/core";
  import {
    Color,
    FogExp2,
    type Mesh,
    type MeshStandardMaterial,
    type Object3D,
  } from "three";
  import type { InstanceFrustumCullingStats } from "#lib/shared/3d/rendering/instance-frustum-culling.js";
  import SkyGradient from "#lib/shared/3d/environments/primitives/SkyGradient.svelte";
  import FallingParticles from "#lib/shared/3d/environments/primitives/FallingParticles.svelte";
  import ForestLighting from "#lib/shared/3d/environments/scenes/forest/ForestLighting.svelte";
  import {
    loadGeospatialEvidenceLayers,
    loadGeospatialTerrain,
    parseGeospatialTerrainManifest,
  } from "#lib/shared/3d/procedural-engine/generation/geospatial-terrain.js";
  import type {
    FlowFestMoment,
    FlowFestProgressPhase,
  } from "#lib/features/flow-fest-sim/state/flow-fest-progress.js";
  import { isFlowFestCampEstablishedPhase } from "#lib/features/flow-fest-sim/state/flow-fest-progress.js";
  import {
    loadFlowFestRuntimeContract,
    type FlowFestBranchId,
    type FlowFestRuntimeContract,
  } from "../flow-fest-graybox/flow-fest-runtime-contract";
  import type { FlowFestFireJamState } from "#lib/features/flow-fest-sim/domain/flow-fest-fire-jam.js";
  import type { FlowFestLivingCommunityFrame } from "#lib/features/flow-fest-sim/domain/flow-fest-living-fire-jam.js";
  import {
    buildFlowFestProductionDressing,
    type FlowFestProductionDressing,
  } from "./flow-fest-production-geometry";
  import type { FlowFestForestEcologyAssetReport } from "./flow-fest-forest-ecology";
  import FlowFestFestivalCommunity from "./FlowFestFestivalCommunity.svelte";
  import FlowFestPopulation from "./FlowFestPopulation.svelte";
  import {
    createFlowFestPopulationSite,
    flowFestTerrainGroundY,
  } from "./flow-fest-population-site";
  import {
    composeFlowFestFireJamLayout,
    flowFestClockLabel,
    flowFestFireJamAttendance,
    type FlowFestPopulationFrame,
    type FlowFestPopulationSite,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-population.js";
  import type { FlowFestPerformerSequenceProof } from "./flow-fest-performer-sequences";
  import FlowFestForestEcology from "./FlowFestForestEcology.svelte";
  import FlowFestParkedCars from "./FlowFestParkedCars.svelte";
  import {
    settleFlowFestParkedCarOnGround,
    type FlowFestParkedCarPlacement,
  } from "./flow-fest-parked-cars";
  import { flowFestParkedCarModel } from "./flow-fest-parked-car-catalog";
  import type { FlowFestGateQueueCar } from "./flow-fest-camp-plan";
  import { sampleFlowFestTerrainWorldY } from "../flow-fest-graybox/flow-fest-terrain-host";
  import type { ImportedTerrainDataV2 } from "#lib/shared/3d/procedural-engine/generation/real-terrain-zone.js";
  import FlowFestGroundSurface from "./FlowFestGroundSurface.svelte";
  import FlowFestHeroFire from "./FlowFestHeroFire.svelte";
  import { getFlowFestVisualProfile } from "./flow-fest-visual-system";
  import { buildFlowFestEntranceGradedTerrain } from "./flow-fest-entrance-terrain";

  interface Props {
    selectedBranch: FlowFestBranchId;
    moment: FlowFestMoment;
    progressPhase: FlowFestProgressPhase;
    fireJamState?: FlowFestFireJamState;
    fireJamEnergy?: number;
    playerPosition?: { x: number; y: number; z: number };
    showCampDressing?: boolean;
    /** Other arrivals waiting at the gate, placed like the lot's parked cars. */
    gateQueueCars?: readonly FlowFestGateQueueCar[];
    onForestCullingSample?: (details: InstanceFrustumCullingStats) => void;
    onGrassCullingSample?: (details: InstanceFrustumCullingStats) => void;
    onReady?: (
      details: FlowFestProductionDressing["counts"] & {
        contract: FlowFestRuntimeContract;
        spatialAudit: FlowFestProductionDressing["spatialAudit"];
        collision: FlowFestProductionDressing["collision"];
        festivalCommunity: FlowFestProductionDressing["festivalCommunity"];
        festivalCommunityAudit: FlowFestProductionDressing["festivalCommunityAudit"];
      }
    ) => void;
    onError?: (message: string) => void;
  }

  const props: Props = $props();
  const { renderer, scene } = useThrelte();
  const MANIFEST_PATH = "/data/flow-fest-sim/terrain.manifest.json";

  let dressing = $state<FlowFestProductionDressing | null>(null);
  let contract = $state<FlowFestRuntimeContract | null>(null);
  let queueTerrain = $state.raw<ImportedTerrainDataV2 | null>(null);
  let heroFireY = $state(12);
  let nightHeartY = $state(12);
  let heroFirePosition = $state({ x: 89, z: -113.5 });
  let nightHeartPosition = $state({ x: 120, z: -103 });
  let readyCommunityAvatarIds = $state<string[]>([]);
  let populationSite = $state<FlowFestPopulationSite | null>(null);
  let fireJamAttendance = $state({ spectators: 0, performers: 0 });
  let builtBranch: FlowFestBranchId | null = null;
  let buildEpoch = 0;
  let destroyed = false;
  let sceneElapsed = 0;
  let animatedLedRings: Object3D[] = [];
  let staticSceneSetupComplete = false;

  const campEstablished = $derived(
    isFlowFestCampEstablishedPhase(props.progressPhase)
  );
  /**
   * The gate queue settles on the same graded terrain as the lot, so its
   * tyres meet the drive instead of hovering over the highest wheel.
   */
  const gateQueuePlacements = $derived.by((): FlowFestParkedCarPlacement[] => {
    const terrain = queueTerrain;
    const cars = props.gateQueueCars ?? [];
    if (!terrain || cars.length === 0) return [];
    return cars.map((car) => {
      const rotation = car.headingRadians - Math.PI / 2;
      return {
        x: car.x,
        z: car.z,
        rotation,
        modelId: car.modelId,
        paintIndex: car.paintIndex,
        ...settleFlowFestParkedCarOnGround(
          flowFestParkedCarModel(car.modelId),
          { x: car.x, z: car.z, rotation },
          (x, z) => sampleFlowFestTerrainWorldY(terrain, x, z)
        ),
      };
    });
  });
  const parkedCarPlacements = $derived(
    dressing
      ? gateQueuePlacements.length > 0
        ? [...dressing.parkedCars, ...gateQueuePlacements]
        : dressing.parkedCars
      : []
  );
  const festivalActive = $derived(
    props.moment === "night" ||
      props.moment === "dawn" ||
      props.progressPhase === "festival-night" ||
      props.progressPhase === "night-free-roam" ||
      props.progressPhase === "night-return"
  );

  // The authored fire-circle layout is the capacity. The population layer says
  // who actually walked in, and the circle is composed down to that.
  const festivalCommunity = $derived(
    dressing
      ? composeFlowFestFireJamLayout(
          dressing.festivalCommunity,
          fireJamAttendance
        )
      : null
  );

  const atmosphere = $derived(getFlowFestVisualProfile(props.moment));
  const forestHemisphere = $derived({
    skyColor: atmosphere.hemisphere.sky,
    groundColor: atmosphere.hemisphere.ground,
    intensity: atmosphere.hemisphere.intensity,
  });
  const forestLighting = $derived({
    key: {
      color: atmosphere.sun.color,
      intensity: atmosphere.sun.intensity,
      direction: atmosphere.sun.direction,
      shadowIntensity: props.moment === "night" ? 0.42 : 0.72,
    },
    fill: { ...atmosphere.fill },
    ambient: { ...atmosphere.ambient },
    stage: { color: "#b9d9d4", intensity: 0, distance: 0 },
  });
  const forestLightAnchor = $derived(
    props.playerPosition ?? {
      x: nightHeartPosition.x,
      y: nightHeartY,
      z: nightHeartPosition.z,
    }
  );
  const forestShadowRefreshToken = $derived(
    [
      props.selectedBranch,
      props.moment,
      props.progressPhase,
      campEstablished,
      festivalActive,
      props.showCampDressing !== false,
    ].join(":")
  );

  async function build(branch: FlowFestBranchId): Promise<void> {
    const epoch = ++buildEpoch;
    const [loadedContract, sourceTerrain, manifestResponse] = await Promise.all(
      [
        loadFlowFestRuntimeContract(),
        loadGeospatialTerrain(MANIFEST_PATH),
        fetch(MANIFEST_PATH),
      ]
    );
    if (!manifestResponse.ok) {
      throw new Error(
        `Flow Fest surface manifest failed to load (${manifestResponse.status})`
      );
    }
    const manifest = parseGeospatialTerrainManifest(
      await manifestResponse.json()
    );
    const evidence = await loadGeospatialEvidenceLayers(manifest);
    if (destroyed || epoch !== buildEpoch) return;
    const terrain = buildFlowFestEntranceGradedTerrain(sourceTerrain).terrain;
    const next = buildFlowFestProductionDressing(
      loadedContract,
      terrain,
      {
        offsetsCentimeters: evidence.surfaceOffsetsCentimeters,
        width: terrain.heightmap.width,
        height: terrain.heightmap.height,
      },
      branch
    );
    readyCommunityAvatarIds = [];
    const cameraColliderPrefixes = [
      "FFS_TreeTrunks_",
      "FFS_Tents_",
      "FFS_PlayerTent_",
      "FFS_Cars_",
      "FFS_LEDFlowCircle_CanopyPost_",
      "FFS_FireJam_CentralFireRing_",
      "FFS_EntranceGatehouse_",
      "FFS_EntranceFence_",
      "FFS_EntranceUtilityPole_",
    ];
    const nextAnimatedLedRings: Object3D[] = [];
    next.root.traverse((object) => {
      if (
        cameraColliderPrefixes.some((prefix) => object.name.startsWith(prefix))
      ) {
        object.userData.cameraCollider = true;
      }
      if (object.name.startsWith("FFS_LEDFlowCircle_HangingRing_")) {
        nextAnimatedLedRings.push(object);
      }
    });
    if (destroyed || epoch !== buildEpoch) {
      next.dispose();
      return;
    }
    next.setCampEstablished(campEstablished);
    next.setCampDressingVisible(props.showCampDressing !== false);
    next.setFestivalActive(festivalActive);
    dressing?.dispose();
    dressing = next;
    queueTerrain = terrain;
    animatedLedRings = nextAnimatedLedRings;
    contract = loadedContract;
    builtBranch = branch;
    const population = createFlowFestPopulationSite({
      contract: loadedContract,
      plan: next.campPlan,
      branch,
      fireCenter: next.festivalCommunity.fireCenter,
      ledCircleCenter: next.festivalCommunity.ledCircleCenter,
      groundY: flowFestTerrainGroundY(terrain),
    });
    populationSite = population.site;
    fireJamAttendance = { spectators: 0, performers: 0 };
    heroFirePosition = {
      x: next.festivalCommunity.fireCenter.x,
      z: next.festivalCommunity.fireCenter.z,
    };
    heroFireY = next.festivalCommunity.fireCenter.y;
    nightHeartPosition = {
      x: next.festivalCommunity.ledCircleCenter.x,
      z: next.festivalCommunity.ledCircleCenter.z,
    };
    nightHeartY = next.festivalCommunity.ledCircleCenter.y;
    const proof = {
      contractFingerprint:
        loadedContract.coordinateContentFingerprint.canonicalPayloadSha256,
      branch,
      moment: props.moment,
      counts: next.counts,
      sourceClasses: {
        terrain: "measured-dtm",
        canopy: "lidar-derived-local-canopy-peaks",
        forestEcology:
          "forest-scene-approved-tree-families-and-rooted-wind-ground-system",
        publicRoad: "ODOT-road-inventory-centerline-terrain-conforming-surface",
        internalDrives:
          "2023-public-domain-orthophoto-interpreted-private-access",
        footConnectors: "austen-traced-over-registered-orthophoto",
        entranceReference:
          "august-2024-google-street-view-observed-proportions-without-repository-imagery-copy",
        festival: "authored-fictional-rehearsal",
      },
      orientationAudit: next.orientationAudit,
      collisionPolicy:
        "measured terrain plus LiDAR-center tree-trunk volumes and visible-derived tent, vehicle, and festival-fixture collision",
      collision: {
        staticVisibleObjects: next.collision.staticMesh.visibleObjectCount,
        campEstablishedVisibleObjects:
          next.collision.campEstablishedMesh.visibleObjectCount,
        festivalActiveVisibleObjects:
          next.collision.festivalActiveMesh.visibleObjectCount,
        ...next.collision.visibleSolidCounts,
      },
      spatialAudit: next.spatialAudit,
      campEstablished,
      visualProfile: atmosphere.id,
      visualHierarchy:
        "measured land > registered paths > organic fire-jam perimeter and open ingress > rotating active fire floor > separate LED circle",
      festivalCommunity: {
        spectators: next.festivalCommunity.spectatorCount,
        performers: next.festivalCommunity.performerCount,
        avatarsReady: 0,
        fireCenter: next.festivalCommunity.fireCenter,
        ledCircleCenter: next.festivalCommunity.ledCircleCenter,
        interactionState: props.fireJamState ?? "not-started",
        responseIntensity: props.fireJamEnergy ?? 0,
        spatialAudit: next.festivalCommunityAudit,
      },
      population: {
        ...population.report,
        corridorPolicy:
          "registered person legs plus camp-plan foot connectors; open-field drift only inside measured-open zone envelopes",
        clockLabel: flowFestClockLabel(0),
        dayPhase: null as string | null,
        agentsSimulated: 0,
        agentsRendered: 0,
        fireJamAttendees: 0,
        travelling: 0,
        interrupted: 0,
        unroutable: 0,
      },
      performerSequences: {
        source: "boot-placeholders",
        note: "Generated LOOPs replace these once the generator answers.",
      } as Record<string, unknown>,
      forestEcology: {
        ...next.forestEcology.audit,
        treeAssetsReady: 0,
        grassAssetsReady: 0,
        groundLifeAssetsReady: 0,
      },
      groundSurface: next.groundSurface.audit,
      parkedCars: {
        placements: next.parkedCars.length,
        models: new Set(next.parkedCars.map((car) => car.modelId)).size,
        carInstancesReady: 0,
        carModelsReady: 0,
      } as Record<string, unknown>,
    };
    (globalThis as Record<string, unknown>).__flowFestProduction = proof;
    props.onReady?.({
      ...next.counts,
      contract: loadedContract,
      spatialAudit: next.spatialAudit,
      collision: next.collision,
      festivalCommunity: next.festivalCommunity,
      festivalCommunityAudit: next.festivalCommunityAudit,
    });
  }

  function recordLivingCommunityFrame(
    frame: FlowFestLivingCommunityFrame
  ): void {
    const proof = (globalThis as Record<string, unknown>)
      .__flowFestProduction as
      | { festivalCommunity?: Record<string, unknown> }
      | undefined;
    if (!proof?.festivalCommunity) return;
    proof.festivalCommunity.rotationOrdinal = frame.rotationOrdinal;
    proof.festivalCommunity.activeFirePerformerIds =
      frame.activeFirePerformerIds;
    proof.festivalCommunity.movingSpectators = frame.movingSpectatorCount;
    proof.festivalCommunity.talkingSpectators = frame.talkingSpectatorCount;
  }

  function recordPopulationFrame(frame: FlowFestPopulationFrame): void {
    const attendance = flowFestFireJamAttendance(frame);
    if (
      attendance.spectators !== fireJamAttendance.spectators ||
      attendance.performers !== fireJamAttendance.performers
    ) {
      fireJamAttendance = attendance;
    }
    const proof = (globalThis as Record<string, unknown>)
      .__flowFestProduction as
      | { population?: Record<string, unknown> }
      | undefined;
    if (!proof?.population) return;
    proof.population.clockLabel = flowFestClockLabel(frame.minuteOfDay);
    proof.population.dayPhase = frame.dayPhase;
    proof.population.agentsSimulated = frame.agents.length;
    proof.population.agentsRendered = frame.agents.filter(
      (agent) => !agent.atFireJam
    ).length;
    proof.population.fireJamAttendees = frame.fireJamAttendeeCount;
    proof.population.travelling = frame.travellingCount;
    proof.population.interrupted = frame.interruptedCount;
    proof.population.unroutable = frame.unroutableCount;
  }

  function recordPerformerSequences(
    details: FlowFestPerformerSequenceProof
  ): void {
    const proof = (globalThis as Record<string, unknown>)
      .__flowFestProduction as Record<string, unknown> | undefined;
    if (!proof) return;
    proof.performerSequences = { ...details };
  }

  function markCommunityAvatarReady(id: string): void {
    if (readyCommunityAvatarIds.includes(id)) return;
    readyCommunityAvatarIds = [...readyCommunityAvatarIds, id];
    const proof = (globalThis as Record<string, unknown>)
      .__flowFestProduction as
      | { festivalCommunity?: Record<string, unknown> }
      | undefined;
    if (proof?.festivalCommunity) {
      proof.festivalCommunity.avatarsReady = readyCommunityAvatarIds.length;
    }
  }

  function recordForestEcologyReady(details: {
    treeInstances: number;
    grassInstances: number;
    groundLifeInstances: number;
    treeFamilies: number;
    treeDrawBatches: number;
    treeRenderedTriangles: number;
    treeCullingSourceBatches: number;
    treeCullingBatches: number;
    treeCullingCoveredVertices: number;
    treeMidRenderedTriangles: number;
    treeFarRenderedTriangles: number;
  }): void {
    const proof = (globalThis as Record<string, unknown>)
      .__flowFestProduction as
      | { forestEcology?: Record<string, unknown> }
      | undefined;
    if (!proof?.forestEcology) return;
    proof.forestEcology.treeAssetsReady = details.treeInstances;
    proof.forestEcology.grassAssetsReady = details.grassInstances;
    proof.forestEcology.groundLifeAssetsReady = details.groundLifeInstances;
    proof.forestEcology.treeFamiliesReady = details.treeFamilies;
    proof.forestEcology.treeDrawBatches = details.treeDrawBatches;
    proof.forestEcology.treeRenderedTriangles = details.treeRenderedTriangles;
    proof.forestEcology.treeMidRenderedTriangles =
      details.treeMidRenderedTriangles;
    proof.forestEcology.treeFarRenderedTriangles =
      details.treeFarRenderedTriangles;
    proof.forestEcology.treeCullingSourceBatches =
      details.treeCullingSourceBatches;
    proof.forestEcology.treeCullingBatches = details.treeCullingBatches;
    proof.forestEcology.treeCullingCoveredVertices =
      details.treeCullingCoveredVertices;
  }

  let reportedForestAssetFailure = "";

  function recordForestEcologyAssets(
    report: FlowFestForestEcologyAssetReport
  ): void {
    const proof = (globalThis as Record<string, unknown>)
      .__flowFestProduction as
      | { forestEcology?: Record<string, unknown> }
      | undefined;
    if (proof?.forestEcology) {
      proof.forestEcology.assetStatus = report.status;
      proof.forestEcology.assetsExpected = report.expected;
      proof.forestEcology.assetsLoaded = report.ready;
      proof.forestEcology.assetsPending = report.pending;
      proof.forestEcology.assetsFailed = report.failed;
    }
    if (report.status !== "failed") return;
    const signature = report.failed.map((entry) => entry.key).join(",");
    if (signature === reportedForestAssetFailure) return;
    reportedForestAssetFailure = signature;
    const detail = report.failed
      .map((entry) => `${entry.key} (${entry.url}): ${entry.message}`)
      .join("; ");
    console.error(
      `[flow-fest-sim] Forest ecology is incomplete — ${report.failed.length} of ${report.expected} assets failed to load. ${detail}`
    );
    props.onError?.(
      `Forest ecology assets failed to load (${report.failed.length} of ${report.expected}): ${detail}`
    );
  }

  let reportedParkedCarAssetFailure = "";

  function recordParkedCarAssets(
    report: FlowFestForestEcologyAssetReport
  ): void {
    const proof = (globalThis as Record<string, unknown>)
      .__flowFestProduction as
      | { parkedCars?: Record<string, unknown> }
      | undefined;
    if (proof?.parkedCars) {
      proof.parkedCars.assetStatus = report.status;
      proof.parkedCars.assetsExpected = report.expected;
      proof.parkedCars.assetsLoaded = report.ready;
      proof.parkedCars.assetsPending = report.pending;
      proof.parkedCars.assetsFailed = report.failed;
    }
    if (report.status !== "failed") return;
    const signature = report.failed.map((entry) => entry.key).join(",");
    if (signature === reportedParkedCarAssetFailure) return;
    reportedParkedCarAssetFailure = signature;
    const detail = report.failed
      .map((entry) => `${entry.key} (${entry.url}): ${entry.message}`)
      .join("; ");
    console.error(
      `[flow-fest-sim] Parked cars are incomplete — ${report.failed.length} of ${report.expected} bodies failed to load. ${detail}`
    );
    props.onError?.(
      `Parked-car assets failed to load (${report.failed.length} of ${report.expected}): ${detail}`
    );
  }

  function recordParkedCarsReady(details: {
    carInstances: number;
    carModels: number;
  }): void {
    const proof = (globalThis as Record<string, unknown>)
      .__flowFestProduction as
      | { parkedCars?: Record<string, unknown> }
      | undefined;
    if (!proof?.parkedCars) return;
    proof.parkedCars.carInstancesReady = details.carInstances;
    proof.parkedCars.carModelsReady = details.carModels;
  }

  function recordForestEcologyCulling(
    details: InstanceFrustumCullingStats
  ): void {
    props.onForestCullingSample?.({ ...details });
    const proof = (globalThis as Record<string, unknown>)
      .__flowFestProduction as
      | { forestEcology?: Record<string, unknown> }
      | undefined;
    if (!proof?.forestEcology) return;
    proof.forestEcology.treeCullingBatchInstances = details.instances;
    proof.forestEcology.treeVisibleBatchInstances = details.visibleInstances;
    proof.forestEcology.treeCullingCoveredVertices =
      details.estimatedVerticesCovered;
    proof.forestEcology.treeSubmittedVertices =
      details.estimatedSubmittedVertices;
  }

  function recordForestGrassCulling(
    details: InstanceFrustumCullingStats
  ): void {
    props.onGrassCullingSample?.({ ...details });
    const proof = (globalThis as Record<string, unknown>)
      .__flowFestProduction as
      | { forestEcology?: Record<string, unknown> }
      | undefined;
    if (!proof?.forestEcology) return;
    proof.forestEcology.grassCullingBatchInstances = details.instances;
    proof.forestEcology.grassVisibleBatchInstances = details.visibleInstances;
    proof.forestEcology.grassSubmittedVertices =
      details.estimatedSubmittedVertices;
  }

  function configureStaticScene(activeScene: Object3D): boolean {
    const reviewOverlay = activeScene.getObjectByName("FFS_ReviewOverlay");
    if (reviewOverlay) reviewOverlay.visible = false;
    // The chunked terrain host names every render batch
    // `FFS_Terrain_ChunkedRender_<column>_<row>`, so a single fixed-name lookup
    // silently matched nothing and the moment grade never reached the ground.
    const graded = new Set<string>();
    let terrainMeshes = 0;
    activeScene.traverse((object) => {
      if (!object.name.startsWith("FFS_Terrain_")) return;
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      terrainMeshes += 1;
      mesh.receiveShadow = true;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const candidate of materials) {
        const material = candidate as MeshStandardMaterial;
        if (!("color" in material) || graded.has(material.uuid)) continue;
        graded.add(material.uuid);
        // How much this reads depends on the moment's
        // `terrainDetailColorStrength`: in daylight it is a restrained multiply
        // under the authored atlas, so the orthophoto still owns roads and
        // clearing edges; at night the atlas steps back and this tint becomes
        // the ground's actual value.
        material.color.set(atmosphere.grade.terrainTint);
        material.roughness = 1;
      }
    });
    if (terrainMeshes === 0) return false;
    const proof = (globalThis as Record<string, unknown>)
      .__flowFestProduction as Record<string, unknown> | undefined;
    if (proof) {
      proof.terrainGrade = {
        meshes: terrainMeshes,
        materials: graded.size,
        tint: atmosphere.grade.terrainTint,
        detailColorStrength: atmosphere.grade.terrainDetailColorStrength,
      };
    }
    return true;
  }

  onMount(() => {
    void build(props.selectedBranch).catch((error: unknown) => {
      props.onError?.(
        error instanceof Error
          ? error.message
          : "Festival dressing did not load"
      );
    });
  });

  $effect(() => {
    if (!dressing || props.selectedBranch === builtBranch) return;
    void build(props.selectedBranch).catch((error: unknown) => {
      props.onError?.(
        error instanceof Error
          ? error.message
          : "Festival dressing did not rebuild"
      );
    });
  });

  $effect(() => {
    dressing?.setCampEstablished(campEstablished);
    dressing?.setCampDressingVisible(props.showCampDressing !== false);
    dressing?.setFestivalActive(festivalActive);
    const proof = (globalThis as Record<string, unknown>)
      .__flowFestProduction as Record<string, unknown> | undefined;
    if (proof) {
      proof.campEstablished = campEstablished;
      proof.festivalActive = festivalActive;
    }
  });

  $effect(() => {
    const fog = new FogExp2(atmosphere.fog.color, atmosphere.fog.density);
    // Threlte 8 exposes `scene` and `renderer` directly on the context, not as
    // CurrentWritable stores. Reading `.current` yielded undefined, so this
    // effect returned early on every run: the fog, the tone-mapping exposure
    // and the terrain grade below it had never reached the renderer.
    const activeScene = scene;
    const activeRenderer = renderer;
    if (!activeScene || !activeRenderer) return;
    activeScene.fog = fog;
    activeRenderer.toneMappingExposure = atmosphere.grade.exposure;
    staticSceneSetupComplete = false;
    const proof = (globalThis as Record<string, unknown>)
      .__flowFestProduction as Record<string, unknown> | undefined;
    if (proof) proof.moment = props.moment;
    return () => {
      if (activeScene.fog === fog) activeScene.fog = null;
    };
  });

  /**
   * Camp fabric and vehicle paint carry their own per-instance colours, so the
   * moment's light on them is a multiply against the authored colour, not a
   * repaint. Without the base snapshot the multiply would compound every time
   * the moment changed and the campground would fade to black by dawn.
   */
  const DRESSING_GRADE_PREFIXES = [
    "FFS_Tents_",
    "FFS_TentsDome_",
    "FFS_PlayerTent_",
    "FFS_Cars_",
  ];

  function gradeDressingMaterial(
    material: MeshStandardMaterial,
    tint: string
  ): void {
    const base = (material.userData.flowFestBaseColor ??=
      material.color.clone()) as Color;
    material.color.copy(base).multiply(dressingGradeColor.set(tint));
  }

  const dressingGradeColor = new Color();

  $effect(() => {
    dressing?.root.traverse((object) => {
      if (!("material" in object)) return;
      const mesh = object as Mesh;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of materials) {
        if (!("color" in material)) continue;
        const standard = material as MeshStandardMaterial;
        if (object.name.startsWith("FFS_TreeTrunks")) {
          standard.color.set(atmosphere.grade.barkTint);
        } else if (
          DRESSING_GRADE_PREFIXES.some((prefix) =>
            object.name.startsWith(prefix)
          )
        ) {
          gradeDressingMaterial(standard, atmosphere.grade.dressingTint);
        }
      }
    });

    const proof = (globalThis as Record<string, unknown>)
      .__flowFestProduction as Record<string, unknown> | undefined;
    if (proof) {
      proof.visualProfile = atmosphere.id;
      proof.visualExposure = atmosphere.grade.exposure;
      proof.shadowKey =
        "camera-bounded-92m-frustum-6m-anchor-grid-30hz-refresh";
    }
  });

  $effect(() => {
    const proof = (globalThis as Record<string, unknown>)
      .__flowFestProduction as
      | { festivalCommunity?: Record<string, unknown> }
      | undefined;
    if (!proof?.festivalCommunity) return;
    proof.festivalCommunity.interactionState =
      props.fireJamState ?? "not-started";
    proof.festivalCommunity.responseIntensity = props.fireJamEnergy ?? 0;
  });

  useTask((delta) => {
    sceneElapsed += delta;
    const activeScene = scene;
    const proof = (globalThis as Record<string, unknown>)
      .__flowFestProduction as Record<string, unknown> | undefined;
    if (proof) {
      // Report what is actually true. This flag used to be set unconditionally
      // above an early return that always fired.
      proof.sceneAvailable = Boolean(activeScene);
      proof.sceneTaskFrames =
        ((proof.sceneTaskFrames as number | undefined) ?? 0) + 1;
    }
    if (!activeScene) return;
    // Diagnostic handle. Without it there is no way to inspect fog, exposure or
    // material grade from the browser, which is exactly how a terrain grade that
    // matched nothing survived for weeks.
    (globalThis as Record<string, unknown>).__flowFestSceneRef = activeScene;
    if (!staticSceneSetupComplete) {
      staticSceneSetupComplete = configureStaticScene(activeScene);
    }

    const energy = props.fireJamEnergy ?? 0;
    const pulse =
      1 + Math.sin(sceneElapsed * (1.8 + energy * 3.2)) * energy * 0.045;
    for (const ring of animatedLedRings) {
      ring.rotation.z += delta * (0.035 + energy * 0.52);
      ring.scale.setScalar(pulse);
    }
  });

  onDestroy(() => {
    destroyed = true;
    buildEpoch += 1;
    animatedLedRings = [];
    dressing?.dispose();
    delete (globalThis as Record<string, unknown>).__flowFestProduction;
    delete (globalThis as Record<string, unknown>).__flowFestSceneRef;
  });
</script>

<SkyGradient
  topColor={atmosphere.sky.top}
  midColor={atmosphere.sky.mid}
  bottomColor={atmosphere.sky.bottom}
  radius={9000}
  gradientStart={0.22}
  gradientEnd={0.92}
  sun={{
    enabled: atmosphere.sun.enabled,
    direction: atmosphere.sun.direction,
    color: atmosphere.sun.color,
    angularDiameterDegrees: atmosphere.sun.angularDiameterDegrees,
    glowScale: atmosphere.sun.glowScale,
    glowOpacity: atmosphere.sun.glowOpacity,
  }}
/>

<ForestLighting
  hemisphere={forestHemisphere}
  profile={forestLighting}
  anchor={forestLightAnchor}
  shadowExtentMeters={46}
  keyLightDistanceMeters={92}
  shadowAnchorSnapMeters={6}
  shadowRefreshIntervalSeconds={1 / 30}
  shadowRefreshMinimumFrameGap={2}
  shadowMapSize={1024}
  shadowRefreshToken={forestShadowRefreshToken}
/>

{#if dressing}
  <T is={dressing.root} />
  <FlowFestGroundSurface
    surface={dressing.groundSurface}
    scene={dressing.root}
    detailColorStrength={atmosphere.grade.terrainDetailColorStrength}
    onPatched={() => {
      staticSceneSetupComplete = false;
    }}
  />
  <FlowFestForestEcology
    layout={dressing.forestEcology}
    foliageTint={atmosphere.grade.foliageTint}
    barkTint={atmosphere.grade.barkTint}
    grassTint={atmosphere.grade.grassTint}
    onAssetReport={recordForestEcologyAssets}
    onReady={recordForestEcologyReady}
    onCullingSample={recordForestEcologyCulling}
    onGrassCullingSample={recordForestGrassCulling}
  />
  <FlowFestParkedCars
    placements={parkedCarPlacements}
    visible={props.showCampDressing !== false}
    onAssetReport={recordParkedCarAssets}
    onReady={recordParkedCarsReady}
  />
{/if}

{#if populationSite}
  <FlowFestPopulation
    site={populationSite}
    moment={props.moment}
    onFrame={recordPopulationFrame}
  />
{/if}

{#if festivalCommunity && festivalActive}
  <FlowFestFestivalCommunity
    community={festivalCommunity}
    energy={props.fireJamEnergy}
    onAvatarReady={markCommunityAvatarReady}
    onSimulationFrame={recordLivingCommunityFrame}
    onSequencePool={recordPerformerSequences}
  />
{/if}

{#if contract && (props.moment === "night" || props.moment === "dawn")}
  <FlowFestHeroFire
    position={{
      x: heroFirePosition.x,
      y: heroFireY + 0.1,
      z: heroFirePosition.z,
    }}
    energy={props.fireJamEnergy}
  />
  <!-- The LED circle is the second light source on the field. It has to emit
       its own colour, not merely be a bright object, so the canopy posts and
       the ground under it read cyan against the fire's orange. -->
  <T.PointLight
    position={[nightHeartPosition.x, nightHeartY + 2.5, nightHeartPosition.z]}
    color="#8bdfff"
    intensity={42 + (props.fireJamEnergy ?? 0) * 22}
    distance={34}
    decay={2}
  />
  <T.Group
    position={[nightHeartPosition.x, nightHeartY + 0.4, nightHeartPosition.z]}
  >
    <FallingParticles
      type="fireflies"
      count={34}
      area={{ width: 36, height: 8, depth: 30 }}
      speed={0.16}
      colors={["#ffe59a", "#bbffb7", "#8ee8ff"]}
      sizeRange={[0.025, 0.085]}
      spin={true}
    />
  </T.Group>
{/if}
