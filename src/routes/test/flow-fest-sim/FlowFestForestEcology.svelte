<script lang="ts">
  import { T, useTask, useThrelte } from "@threlte/core";
  import { useDraco, useGltf, useMeshopt } from "@threlte/extras";
  import { untrack } from "svelte";
  import {
    Color,
    Group,
    type InstancedMesh,
    type Mesh,
    type MeshStandardMaterial,
    type Object3D,
  } from "three";
  import {
    createForestRuntimeGrassField,
    createForestRuntimeTreeInstances,
    disposeForestRuntimeEcology,
    selectForestRuntimeGrassDensity,
  } from "#lib/shared/3d/environments/scenes/forest/forest-runtime-ecology.js";
  import {
    createInstanceFrustumCuller,
    type InstanceFrustumCuller,
    type InstanceFrustumCullingStats,
  } from "#lib/shared/3d/rendering/instance-frustum-culling.js";
  import { prepareCoveragePreservingAlphaMipmaps } from "#lib/shared/3d/rendering/alpha-coverage-mipmaps.js";
  import ForestClearingWind from "#lib/shared/3d/environments/scenes/forest/ForestClearingWind.svelte";
  import {
    deriveFlowFestTreeInstanceTint,
    FLOW_FEST_FOREST_GRASS_ASSET,
    FLOW_FEST_FOREST_DISTANCE_GRASS_ASSETS,
    FLOW_FEST_FOREST_GROUND_LIFE_ASSETS,
    FLOW_FEST_FOREST_DISTANCE_LOD,
    FLOW_FEST_FOREST_DISTANCE_TREE_ASSETS,
    FLOW_FEST_FOREST_TREE_ASSETS,
    isFlowFestForestFoliageMaterial,
    summarizeFlowFestForestEcologyAssets,
    type FlowFestForestEcologyAssetEntry,
    type FlowFestForestEcologyAssetReport,
    type FlowFestForestEcologyLayout,
    type FlowFestForestDistanceTreeFamilyId,
    type FlowFestForestTreeFamilyId,
    type FlowFestForestTreePlacement,
  } from "./flow-fest-forest-ecology";
  import { FLOW_FEST_TREE_COLOR_GRADES } from "./flow-fest-tree-species";

  interface Props {
    layout: FlowFestForestEcologyLayout;
    foliageTint: string;
    barkTint: string;
    grassTint: string;
    onAssetReport?: (report: FlowFestForestEcologyAssetReport) => void;
    onReady?: (details: {
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
    }) => void;
    onCullingSample?: (details: InstanceFrustumCullingStats) => void;
    onGrassCullingSample?: (details: InstanceFrustumCullingStats) => void;
  }

  let {
    layout,
    foliageTint,
    barkTint,
    grassTint,
    onAssetReport,
    onReady,
    onCullingSample,
    onGrassCullingSample,
  }: Props = $props();
  /**
   * Everything that gets drawn. Site trees and backdrop woodland share the
   * distance tiers and the cullers, so a backdrop tree 40 m past the property
   * line renders on the same full asset a site tree does at that range. Only
   * the venue's own trees carry collision and leaf litter, and those consumers
   * read `layout.trees` directly.
   */
  const renderedTrees = $derived([
    ...layout.trees,
    ...layout.backdropTrees,
  ]);
  const { camera } = useThrelte();
  const loaderOptions = {
    dracoLoader: useDraco("/draco/"),
    meshoptDecoder: useMeshopt(),
  };
  const treeFamilyIds = Object.keys(
    FLOW_FEST_FOREST_TREE_ASSETS
  ) as FlowFestForestTreeFamilyId[];
  // Every family loads its near source plus its own mid and far tier. The
  // records are keyed `near:`/`mid:`/`far:` + familyId so the ledger, the
  // scene maps, and the tier builders all address the same load.
  const treeAssetUrlByKey = new Map<string, string>();
  for (const familyId of treeFamilyIds) {
    treeAssetUrlByKey.set(
      `near:${familyId}`,
      FLOW_FEST_FOREST_TREE_ASSETS[familyId]
    );
    treeAssetUrlByKey.set(
      `mid:${familyId}`,
      FLOW_FEST_FOREST_DISTANCE_TREE_ASSETS.mid[familyId]
    );
    treeAssetUrlByKey.set(
      `far:${familyId}`,
      FLOW_FEST_FOREST_DISTANCE_TREE_ASSETS.far[familyId]
    );
  }
  const treeGltfByKey = new Map(
    [...treeAssetUrlByKey].map(([key, url]) => [
      key,
      useGltf(url, loaderOptions),
    ])
  );
  const grassPrototypes = useGltf(FLOW_FEST_FOREST_GRASS_ASSET, loaderOptions);
  const grassMidPrototypes = useGltf(
    FLOW_FEST_FOREST_DISTANCE_GRASS_ASSETS.mid,
    loaderOptions
  );
  const grassFarPrototypes = useGltf(
    FLOW_FEST_FOREST_DISTANCE_GRASS_ASSETS.far,
    loaderOptions
  );
  const dampSedge = useGltf(
    FLOW_FEST_FOREST_GROUND_LIFE_ASSETS["damp-sedge-tussock"],
    loaderOptions
  );
  const hazelShrub = useGltf(
    FLOW_FEST_FOREST_GROUND_LIFE_ASSETS["woodland-hazel-shrub"],
    loaderOptions
  );

  interface EcologyAssetSource {
    subscribe: (run: (value: unknown) => void) => () => void;
    error: {
      subscribe: (run: (value: Error | undefined) => void) => () => void;
    };
  }

  const ecologyAssetSources: ReadonlyArray<{
    key: string;
    url: string;
    source: EcologyAssetSource;
  }> = [
    ...[...treeGltfByKey].map(
      ([key, source]) => [key, treeAssetUrlByKey.get(key)!, source] as const
    ),
    ["grass:near", FLOW_FEST_FOREST_GRASS_ASSET, grassPrototypes] as const,
    [
      "grass:mid",
      FLOW_FEST_FOREST_DISTANCE_GRASS_ASSETS.mid,
      grassMidPrototypes,
    ] as const,
    [
      "grass:far",
      FLOW_FEST_FOREST_DISTANCE_GRASS_ASSETS.far,
      grassFarPrototypes,
    ] as const,
    [
      "ground-life:damp-sedge-tussock",
      FLOW_FEST_FOREST_GROUND_LIFE_ASSETS["damp-sedge-tussock"],
      dampSedge,
    ] as const,
    [
      "ground-life:woodland-hazel-shrub",
      FLOW_FEST_FOREST_GROUND_LIFE_ASSETS["woodland-hazel-shrub"],
      hazelShrub,
    ] as const,
  ].map(([key, url, source]) => ({
    key: key as string,
    url: url as string,
    source: source as unknown as EcologyAssetSource,
  }));

  const assetLedger = new Map<string, FlowFestForestEcologyAssetEntry>(
    ecologyAssetSources.map(({ key, url }) => [
      key,
      { key, url, state: "pending" as const },
    ])
  );
  let assetLedgerRevision = $state(0);
  const loadedTreeScenes = new Map<string, Object3D>();

  $effect(() => {
    const unsubscribers: Array<() => void> = [];
    for (const { key, url, source } of ecologyAssetSources) {
      unsubscribers.push(
        source.subscribe((value) => {
          const entry = assetLedger.get(key);
          if (!entry || !value || entry.state === "ready") return;
          const scene = (value as { scene?: Object3D }).scene;
          if (scene && treeAssetUrlByKey.has(key)) {
            loadedTreeScenes.set(key, scene);
          }
          entry.state = "ready";
          entry.message = null;
          assetLedgerRevision += 1;
        })
      );
      unsubscribers.push(
        source.error.subscribe((error) => {
          const entry = assetLedger.get(key);
          if (!entry || !error || entry.state === "failed") return;
          entry.state = "failed";
          entry.message = error.message || String(error);
          console.error(
            `[flow-fest-sim] Forest ecology asset failed to load: ${key} (${url})`,
            error
          );
          assetLedgerRevision += 1;
        })
      );
    }
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  });

  const assetReport = $derived.by(() => {
    void assetLedgerRevision;
    return summarizeFlowFestForestEcologyAssets(
      ecologyAssetSources.map(({ key, url }) => {
        const entry = assetLedger.get(key);
        return {
          key,
          url,
          state: entry?.state ?? "pending",
          message: entry?.message ?? null,
        };
      })
    );
  });

  $effect(() => {
    onAssetReport?.(assetReport);
  });

  let treeRoots = $state<Group[]>([]);
  let grassRoots = $state<Group[]>([]);
  let groundLifeRoot = $state<Group | null>(null);
  let treeCullers: InstanceFrustumCuller[] = [];
  let grassCullers: InstanceFrustumCuller[] = [];
  let lastCullingSignature = "";
  let lastGrassCullingSignature = "";

  /**
   * Per-family HSL grade, owned by the species catalog so a family's colour
   * ships with the parameters that generated it. Sugar maple and beech share a
   * leaf atlas; without a per-form grade a mixed stand renders as one flat
   * green. The grade composes with the per-instance tint from
   * `deriveFlowFestTreeInstanceTint`.
   */
  const familyColorGrade = FLOW_FEST_TREE_COLOR_GRADES;

  function collectTreeScenes(
    tier: "near" | "mid" | "far"
  ): Map<FlowFestForestTreeFamilyId, Object3D> {
    const sources = new Map<FlowFestForestTreeFamilyId, Object3D>();
    for (const familyId of treeFamilyIds) {
      const scene = loadedTreeScenes.get(`${tier}:${familyId}`);
      if (scene) sources.set(familyId, scene);
    }
    return sources;
  }

  const treeSources = $derived.by(() => {
    void assetLedgerRevision;
    return collectTreeScenes("near");
  });
  const midTreeSources = $derived.by(() => {
    void assetLedgerRevision;
    return collectTreeScenes("mid");
  });
  const farTreeSources = $derived.by(() => {
    void assetLedgerRevision;
    return collectTreeScenes("far");
  });

  function extractGrassSources(scene: Object3D | undefined) {
    const sources = new Map<"summer-sward" | "woodland-grass", Mesh>();
    if (!scene) return sources;
    scene.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      if (mesh.name.includes("summer-sward")) {
        sources.set("summer-sward", mesh);
      } else if (mesh.name.includes("woodland-grass")) {
        sources.set("woodland-grass", mesh);
      }
    });
    return sources;
  }

  const grassSources = $derived(extractGrassSources($grassPrototypes?.scene));
  const midGrassSources = $derived(
    extractGrassSources($grassMidPrototypes?.scene)
  );
  const farGrassSources = $derived(
    extractGrassSources($grassFarPrototypes?.scene)
  );

  /**
   * A distance tier renders every family with its own simplified GLB. The tier
   * geometry keeps the near asset's material names and UVs, so borrowing the
   * near materials by name re-textures it — the same bark and the same leaf
   * atlas at every distance, which is what keeps a tree from turning into a
   * different tree as the camera approaches.
   */
  function buildDistanceTierRoot(
    tier: "mid" | "far",
    geometrySources: ReadonlyMap<FlowFestForestDistanceTreeFamilyId, Object3D>,
    materialSources: ReadonlyMap<FlowFestForestTreeFamilyId, Object3D>
  ): Group {
    const root = new Group();
    root.name = `FFS_ForestScene_TreeFamilies_${tier}`;
    for (const [familyId, geometrySource] of geometrySources) {
      const materialSource = materialSources.get(familyId);
      if (!materialSource) continue;
      const placements = renderedTrees.filter(
        (placement) => placement.familyId === familyId
      );
      if (placements.length === 0) continue;
      const tierInstances = createForestRuntimeTreeInstances(
        geometrySource,
        placements,
        familyId,
        { materialSource, distanceTier: tier }
      );
      applyTreeInstanceTints(tierInstances, placements);
      root.add(tierInstances);
    }
    return root;
  }

  /**
   * Give every tree its own colour through the instancing seam. The tint is
   * seeded from the placement's measured coordinates, so a tree keeps the same
   * personal colour in every distance tier and across reloads. `instanceColor`
   * multiplies into the moment tint, so the day/night grade still owns the
   * palette — this only stops a family rendering as one flat mass.
   */
  function applyTreeInstanceTints(
    root: Object3D,
    placements: FlowFestForestTreePlacement[]
  ): void {
    const scratch = new Color();
    root.traverse((object) => {
      const mesh = object as InstancedMesh;
      if (!mesh.isMesh || !("instanceMatrix" in mesh)) return;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      const part = materials.some((candidate) =>
        isFlowFestForestFoliageMaterial(candidate as MeshStandardMaterial)
      )
        ? ("foliage" as const)
        : ("bark" as const);
      placements.forEach((placement, index) => {
        if (index >= mesh.count) return;
        const tint = deriveFlowFestTreeInstanceTint(placement, part);
        mesh.setColorAt(index, scratch.setRGB(tint.r, tint.g, tint.b));
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }

  $effect(() => {
    const sources = treeSources;
    const activeMidTreeSources = midTreeSources;
    const activeFarTreeSources = farTreeSources;
    const activeGrassSources = grassSources;
    const activeMidGrassSources = midGrassSources;
    const activeFarGrassSources = farGrassSources;
    if (
      sources.size !== Object.keys(FLOW_FEST_FOREST_TREE_ASSETS).length ||
      activeMidTreeSources.size !==
        Object.keys(FLOW_FEST_FOREST_DISTANCE_TREE_ASSETS.mid).length ||
      activeFarTreeSources.size !==
        Object.keys(FLOW_FEST_FOREST_DISTANCE_TREE_ASSETS.far).length ||
      activeGrassSources.size !== 2 ||
      activeMidGrassSources.size !== 2 ||
      activeFarGrassSources.size !== 2
    )
      return;
    const nextNearTrees = new Group();
    nextNearTrees.name = "FFS_ForestScene_TreeFamilies_near";
    for (const [familyId, source] of sources) {
      const placements = renderedTrees.filter(
        (placement) => placement.familyId === familyId
      );
      const nearInstances = createForestRuntimeTreeInstances(
        source,
        placements,
        familyId,
        { distanceTier: "near" }
      );
      applyTreeInstanceTints(nearInstances, placements);
      nextNearTrees.add(nearInstances);
    }
    const nextMidTrees = buildDistanceTierRoot(
      "mid",
      activeMidTreeSources,
      sources
    );
    const nextFarTrees = buildDistanceTierRoot(
      "far",
      activeFarTreeSources,
      sources
    );
    const nextTreeRoots = [nextNearTrees, nextMidTrees, nextFarTrees];
    nextTreeRoots.forEach((root) => (root.visible = false));
    const nextGrassRoots = [
      createForestRuntimeGrassField(layout.grass, activeGrassSources, {
        distanceTier: "near",
      }),
      createForestRuntimeGrassField(
        selectForestRuntimeGrassDensity(
          layout.grass,
          FLOW_FEST_FOREST_DISTANCE_LOD.grassMidDensity
        ),
        activeMidGrassSources,
        { distanceTier: "mid" }
      ),
      createForestRuntimeGrassField(
        selectForestRuntimeGrassDensity(
          layout.grass,
          FLOW_FEST_FOREST_DISTANCE_LOD.grassFarDensity
        ),
        activeFarGrassSources,
        { distanceTier: "far" }
      ),
    ];
    nextGrassRoots.forEach((root) => (root.visible = false));
    const sharedCullingOptions = {
      minRenderedVerticesPerBatch: 0,
      boundsPadding: 1.25,
      cameraPositionThresholdMeters:
        FLOW_FEST_FOREST_DISTANCE_LOD.cameraPositionThresholdMeters,
      cameraRotationThresholdRadians:
        FLOW_FEST_FOREST_DISTANCE_LOD.cameraRotationThresholdRadians,
    };
    const nextTreeCullers = [
      createInstanceFrustumCuller(nextNearTrees, {
        ...sharedCullingOptions,
        maximumDistanceMeters: FLOW_FEST_FOREST_DISTANCE_LOD.nearMaximumMeters,
      }),
      createInstanceFrustumCuller(nextMidTrees, {
        ...sharedCullingOptions,
        minimumDistanceMeters: FLOW_FEST_FOREST_DISTANCE_LOD.nearMaximumMeters,
        maximumDistanceMeters: FLOW_FEST_FOREST_DISTANCE_LOD.midMaximumMeters,
      }),
      createInstanceFrustumCuller(nextFarTrees, {
        ...sharedCullingOptions,
        minimumDistanceMeters: FLOW_FEST_FOREST_DISTANCE_LOD.midMaximumMeters,
      }),
    ];
    const grassCullingOptions = {
      ...sharedCullingOptions,
      boundsPadding: 0.35,
    };
    const nextGrassCullers = [
      createInstanceFrustumCuller(nextGrassRoots[0]!, {
        ...grassCullingOptions,
        maximumDistanceMeters:
          FLOW_FEST_FOREST_DISTANCE_LOD.grassNearMaximumMeters,
      }),
      createInstanceFrustumCuller(nextGrassRoots[1]!, {
        ...grassCullingOptions,
        minimumDistanceMeters:
          FLOW_FEST_FOREST_DISTANCE_LOD.grassNearMaximumMeters,
        maximumDistanceMeters:
          FLOW_FEST_FOREST_DISTANCE_LOD.grassMidMaximumMeters,
      }),
      createInstanceFrustumCuller(nextGrassRoots[2]!, {
        ...grassCullingOptions,
        minimumDistanceMeters:
          FLOW_FEST_FOREST_DISTANCE_LOD.grassMidMaximumMeters,
        maximumDistanceMeters: FLOW_FEST_FOREST_DISTANCE_LOD.grassMaximumMeters,
      }),
    ];
    const previousTreeRoots = untrack(() => treeRoots);
    const previousTreeCullers = treeCullers;
    const previousGrassCullers = grassCullers;
    const previousGrassRoots = untrack(() => grassRoots);
    previousTreeCullers.forEach((culler) => culler.restore());
    previousGrassCullers.forEach((culler) => culler.restore());
    treeCullers = nextTreeCullers;
    grassCullers = nextGrassCullers;
    lastCullingSignature = "";
    lastGrassCullingSignature = "";
    treeRoots = nextTreeRoots;
    grassRoots = nextGrassRoots;
    previousTreeRoots.forEach(disposeForestRuntimeEcology);
    previousGrassRoots.forEach(disposeForestRuntimeEcology);
    return () => {
      if (treeRoots[0] === nextNearTrees) treeRoots = [];
      if (grassRoots[0] === nextGrassRoots[0]) grassRoots = [];
      if (treeCullers[0] === nextTreeCullers[0]) treeCullers = [];
      if (grassCullers[0] === nextGrassCullers[0]) grassCullers = [];
      nextTreeCullers.forEach((culler) => culler.restore());
      nextGrassCullers.forEach((culler) => culler.restore());
      nextTreeRoots.forEach(disposeForestRuntimeEcology);
      nextGrassRoots.forEach(disposeForestRuntimeEcology);
    };
  });

  $effect(() => {
    for (const root of [...treeRoots, groundLifeRoot]) {
      root?.traverse((object) => {
        const mesh = object as Mesh;
        if (!mesh.isMesh) return;
        const familyId = mesh.userData.forestTreeFamily as
          | FlowFestForestTreeFamilyId
          | undefined;
        const grade = familyId ? familyColorGrade[familyId] : undefined;
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const candidate of materials) {
          const material = candidate as MeshStandardMaterial;
          if (!material.isMeshStandardMaterial) continue;
          const isFoliage = isFlowFestForestFoliageMaterial(material);
          material.color.set(isFoliage ? foliageTint : barkTint);
          const adjustment = grade?.[isFoliage ? "foliage" : "bark"];
          if (adjustment) material.color.offsetHSL(...adjustment);
          // Without this the leaf maps' box-filtered mips fall under the
          // cutoff a few tiers out and every crown past ~30 m thins to twigs.
          if (isFoliage && material.map) {
            prepareCoveragePreservingAlphaMipmaps(
              material.map,
              material.alphaTest
            );
          }
        }
      });
    }
  });

  /**
   * The grass field carries its own per-tuft instance colours, authored as a
   * summer palette. three.js multiplies the material colour into those, so the
   * moment's grass tint grades 21,730 tufts without disturbing a single
   * placement. Without it, 2:13 AM renders noon-green turf everywhere the
   * headlight or the bonfire reaches.
   */
  $effect(() => {
    for (const root of grassRoots) {
      root?.traverse((object) => {
        const mesh = object as Mesh;
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const candidate of materials) {
          const material = candidate as MeshStandardMaterial;
          if (!material.isMeshStandardMaterial) continue;
          material.color.set(grassTint);
        }
      });
    }
  });

  $effect(() => {
    const sedge = $dampSedge?.scene;
    const hazel = $hazelShrub?.scene;
    if (!sedge || !hazel) return;
    const next = new Group();
    next.name = "FFS_ForestScene_GroundLife";
    for (const [species, source] of [
      ["damp-sedge-tussock", sedge],
      ["woodland-hazel-shrub", hazel],
    ] as const) {
      const placements = layout.groundLife
        .filter((placement) => placement.species === species)
        .map((placement) => ({
          ...placement,
          renderedHeightMeters:
            (species === "woodland-hazel-shrub" ? 1.45 : 0.72) *
            placement.scale,
        }));
      next.add(createForestRuntimeTreeInstances(source, placements, species));
    }
    const previous = untrack(() => groundLifeRoot);
    groundLifeRoot = next;
    if (previous) disposeForestRuntimeEcology(previous);
    return () => {
      if (groundLifeRoot === next) groundLifeRoot = null;
      disposeForestRuntimeEcology(next);
    };
  });

  $effect(() => {
    if (treeRoots.length !== 3 || grassRoots.length !== 3 || !groundLifeRoot)
      return;
    const tierMetrics = treeRoots.map((root) => {
      let drawBatches = 0;
      let renderedTriangles = 0;
      root.traverse((object) => {
        const mesh = object as Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        const instanceCount = "count" in mesh ? Number(mesh.count) : 1;
        const triangleCount =
          (mesh.geometry.index?.count ??
            mesh.geometry.getAttribute("position")?.count ??
            0) / 3;
        drawBatches += instanceCount > 0 ? 1 : 0;
        renderedTriangles += triangleCount * instanceCount;
      });
      return { drawBatches, renderedTriangles };
    });
    const culling = aggregateCullingStats(treeCullers);
    onReady?.({
      treeInstances: renderedTrees.length,
      grassInstances: layout.grass.length,
      groundLifeInstances: layout.groundLife.length,
      treeFamilies: treeSources.size,
      treeDrawBatches: tierMetrics.reduce(
        (total, tier) => total + tier.drawBatches,
        0
      ),
      treeRenderedTriangles: tierMetrics[0]?.renderedTriangles ?? 0,
      treeMidRenderedTriangles: tierMetrics[1]?.renderedTriangles ?? 0,
      treeFarRenderedTriangles: tierMetrics[2]?.renderedTriangles ?? 0,
      treeCullingSourceBatches: culling.sourceBatches,
      treeCullingBatches: culling.culledBatches,
      treeCullingCoveredVertices: culling.estimatedVerticesCovered,
    });
  });

  function aggregateCullingStats(
    cullers: readonly InstanceFrustumCuller[]
  ): InstanceFrustumCullingStats {
    return cullers.reduce<InstanceFrustumCullingStats>(
      (total, culler) => {
        const stats = culler.stats;
        total.sourceBatches += stats.sourceBatches;
        total.culledBatches += stats.culledBatches;
        total.visibleBatches += stats.visibleBatches;
        total.instances += stats.instances;
        total.estimatedVerticesCovered += stats.estimatedVerticesCovered;
        total.visibleInstances += stats.visibleInstances;
        total.estimatedSubmittedVertices += stats.estimatedSubmittedVertices;
        total.distanceRejectedInstances += stats.distanceRejectedInstances;
        total.frustumRejectedInstances += stats.frustumRejectedInstances;
        total.updates += stats.updates;
        total.skippedUpdates += stats.skippedUpdates;
        return total;
      },
      {
        sourceBatches: 0,
        culledBatches: 0,
        visibleBatches: 0,
        instances: 0,
        estimatedVerticesCovered: 0,
        visibleInstances: 0,
        estimatedSubmittedVertices: 0,
        distanceRejectedInstances: 0,
        frustumRejectedInstances: 0,
        updates: 0,
        skippedUpdates: 0,
      }
    );
  }

  useTask(() => {
    const activeCamera = camera.current;
    if (treeCullers.length !== 3 || grassCullers.length !== 3 || !activeCamera)
      return;
    treeCullers.forEach((culler) => culler.update(activeCamera));
    grassCullers.forEach((culler) => culler.update(activeCamera));
    const grassStats = aggregateCullingStats(grassCullers);
    treeRoots.forEach((root) => (root.visible = true));
    grassRoots.forEach((root) => (root.visible = true));
    const stats = aggregateCullingStats(treeCullers);
    const signature = `${stats.visibleInstances}:${stats.estimatedSubmittedVertices}:${stats.updates}`;
    if (signature === lastCullingSignature) return;
    lastCullingSignature = signature;
    onCullingSample?.(stats);
    const grassSignature = `${grassStats.visibleInstances}:${grassStats.estimatedSubmittedVertices}:${grassStats.updates}`;
    if (grassSignature === lastGrassCullingSignature) return;
    lastGrassCullingSignature = grassSignature;
    onGrassCullingSample?.(grassStats);
  });
</script>

{#each treeRoots as treeRoot (treeRoot.uuid)}
  <T is={treeRoot} />
{/each}
{#each grassRoots as grassRoot (grassRoot.uuid)}
  <T is={grassRoot} />
  <ForestClearingWind scene={grassRoot} />
{/each}
{#if groundLifeRoot}
  <T is={groundLifeRoot} />
{/if}
