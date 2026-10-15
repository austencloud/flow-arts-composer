<script lang="ts">
  import { resolveThrelteScene } from "../../../scene-boot/threlte-handles";
  /**
   * ForestConfigurableScene
   *
   * A moonlit forest clearing assembled from authored environment layers.
   * Includes falling leaves and supports autumn/firefly variants.
   *
   * Scene Lab compatibility path for reactive atmosphere tuning. Shipping
   * callers use ForestScene's renderer-neutral world instead.
   */

  import { T, useThrelte } from "@threlte/core";
  import { useDraco, useGltf, useMeshopt } from "@threlte/extras";
  import SkyGradient from "../../primitives/SkyGradient.svelte";
  import CloudSkyDome from "../../primitives/CloudSkyDome.svelte";
  import CelestialCloudSky from "../../primitives/CelestialCloudSky.svelte";
  import Starfield from "../../primitives/Starfield.svelte";
  import MeteorStreaks from "../cosmic/MeteorStreaks.svelte";
  import FallingParticles from "../../primitives/FallingParticles.svelte";
  import type { ForestVariant } from "../../domain/enums/environment-enums";
  import {
    type ForestSceneConfig,
    createDefaultForestFireflyConfig,
  } from "../../domain/models/scene-configs";
  import { shouldShowForestNearFrame } from "../../domain/models/scene-configs/forest-scene-config";
  import { userProportionsState } from "@austencloud/scene-3d";
  import Stage3D from "../../../components/Stage3D.svelte";
  import VolumetricFireComponent from "../../../effects/volumetric-fire/VolumetricFireComponent.svelte";
  import { Vector3, FogExp2, type Mesh } from "three";
  import { getSceneFeatureContext } from "../../../scene-features/context/scene-feature-context";
  import ForestNearFrameLayer from "./ForestNearFrameLayer.svelte";
  import ForestStage from "./ForestStage.svelte";
  import ForestFireflyFields from "./ForestFireflyFields.svelte";
  import ForestCanopyFlight from "./ForestCanopyFlight.svelte";
  import ForestCampsite from "./ForestCampsite.svelte";
  import ForestLighting from "./ForestLighting.svelte";
  import ForestAtmosphereMaterials from "./ForestAtmosphereMaterials.svelte";
  import ForestGroundDetail from "./ForestGroundDetail.svelte";
  import { resolveForestShadowRole } from "./forest-shadow-roles";

  interface Props {
    /** Color variant. Ignored if `config` is provided. */
    variant?: ForestVariant;
    /** Full scene config (overrides variant defaults). Used by Scene Lab. */
    config?: ForestSceneConfig;
    stageWidth?: number;
    stageDepth?: number;
    stageZOffset?: number;
    /** Hide the built-in Forest stage (hub mounts its own coven stages). */
    showStage?: boolean;
    /** Override the clearing radius so the hub can widen it for N stations. */
    clearingRadius?: number;
    /** Retained film worlds load while hidden but only the active one owns globals. */
    active?: boolean;
  }

  let {
    variant = "firefly",
    config,
    stageWidth = 6,
    stageDepth = 4.5,
    stageZOffset = 0,
    showStage = true,
    clearingRadius,
    active = true,
  }: Props = $props();

  const activeConfig = $derived(config ?? createDefaultForestFireflyConfig());
  const isNightMaster = $derived(
    Boolean(activeConfig.moon?.enabled && !activeConfig.materialResponse)
  );
  const showNearFrame = $derived(shouldShowForestNearFrame(clearingRadius));
  let nearFrameReady = $state(false);
  let forestStageReady = $state(false);
  let forestStageFailed = $state(false);
  let forestCampsiteReady = $state(false);

  function handleNearFrameReady(): void {
    nearFrameReady = true;
  }

  function handleForestStageReady(): void {
    forestStageReady = true;
  }

  function handleForestStageError(error: Error): void {
    console.warn(
      "[ForestScene] Forest stage failed to load; using canonical stage",
      error
    );
    forestStageFailed = true;
    forestStageReady = true;
  }

  function handleForestCampsiteReady(): void {
    forestCampsiteReady = true;
  }

  function handleForestCampsiteError(error: Error): void {
    console.warn("[ForestScene] Forest campsite failed to load", error);
    forestCampsiteReady = true;
  }
  const forestEnvironment = useGltf("/models/forest/forest-environment.glb", {
    dracoLoader: useDraco("/draco/"),
    meshoptDecoder: useMeshopt(),
  });

  // The authored forest would cost roughly 49 million processed vertices for
  // each full shadow pass. Keep it out of the map and let only the terrain
  // receive contact shadows from the much smaller stage and campsite owners.
  $effect(() => {
    if (!$forestEnvironment) return;

    $forestEnvironment.scene.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      const shadowRole = resolveForestShadowRole(child.userData?.tka_role);
      mesh.castShadow = shadowRole.cast;
      mesh.receiveShadow = shadowRole.receive;
    });
  });

  const { scene: sceneValue } = useThrelte();
  const scene = resolveThrelteScene(sceneValue);

  // All positions and scales in METERS (1 unit = 1 meter)

  // Scene feature context - gate campfire/tent visibility and report loading readiness
  let sceneFeatures = $state<ReturnType<typeof getSceneFeatureContext> | null>(
    null
  );
  try {
    sceneFeatures = getSceneFeatureContext();
  } catch {
    // ForestScene may be rendered outside the scene feature system (e.g. standalone environments).
    // In that case, all features are shown and no readiness reporting is needed.
  }

  const groundY = $derived(userProportionsState.groundY);
  const campsiteGroundY = $derived(
    groundY + (activeConfig.campfire?.groundOffset ?? 0)
  );
  const campfireFeatureEnabled = $derived(
    Boolean(
      activeConfig.campfire?.enabled &&
      (sceneFeatures?.isEnabled("campfire") ?? true)
    )
  );
  const tentFeatureEnabled = $derived(sceneFeatures?.isEnabled("tent") ?? true);

  // Fire emitter position (reactive to config + groundY)
  const firePosition = $derived.by(() => {
    const cf = activeConfig.campfire;
    if (!cf) return new Vector3(0, groundY, 0);
    const fireHalfHeight = (cf.fireHeight * cf.fireScale) / 2;
    return new Vector3(
      cf.position.x,
      campsiteGroundY + fireHalfHeight,
      cf.position.z
    );
  });

  // Apply fog reactively — reuse instance, mutate instead of reallocating
  let fogInstance: FogExp2 | null = null;
  $effect(() => {
    if (!active) return;
    const fog = activeConfig.fog;
    if (!fogInstance) {
      fogInstance = new FogExp2(fog.color, fog.density);
      scene.fog = fogInstance;
    } else {
      fogInstance.color.set(fog.color);
      fogInstance.density = fog.density;
    }
    return () => {
      if (scene.fog === fogInstance) scene.fog = null;
      fogInstance = null;
    };
  });

  // Report per-GLB progress so the loading curtain fills smoothly
  // instead of jumping 0% → 100%.
  $effect(() => {
    if (!active) return;
    if (!sceneFeatures) return;
    const glbs = [$forestEnvironment];
    const requiredAssets = [
      ...glbs,
      ...(showNearFrame ? [nearFrameReady] : []),
      ...(showNearFrame ? [forestCampsiteReady] : []),
      ...(showStage ? [forestStageReady] : []),
    ];
    const loaded = requiredAssets.filter(Boolean).length;
    sceneFeatures.reportProgress("environment", loaded / requiredAssets.length);
    if (loaded === requiredAssets.length) {
      sceneFeatures.reportReady("environment");
    }
  });

  // Safety valve: if GLBs stall (CDN timeout, CORS failure), lift the
  // curtain after 15 s so the user isn't stuck on a permanent loading screen.
  $effect(() => {
    if (!active) return;
    const timer = setTimeout(() => {
      if (sceneFeatures && !sceneFeatures.isReady("environment")) {
        console.warn("[ForestScene] GLB loading timed out - lifting curtain");
        sceneFeatures.reportReady("environment");
      }
    }, 15_000);
    return () => clearTimeout(timer);
  });
</script>

<SkyGradient
  topColor={activeConfig.sky.topColor}
  midColor={activeConfig.sky.midColor}
  bottomColor={activeConfig.sky.bottomColor}
  moon={activeConfig.moon}
  sun={activeConfig.sun}
/>

{#if activeConfig.clouds}
  {#if activeConfig.clouds.visualSource === "celestial-2d"}
    <CelestialCloudSky config={activeConfig.clouds} />
  {:else}
    <CloudSkyDome config={activeConfig.clouds} />
  {/if}
{/if}

{#if activeConfig.starfield}
  <Starfield config={activeConfig.starfield} />
{/if}

{#if activeConfig.shootingStars}
  <MeteorStreaks config={activeConfig.shootingStars} />
{/if}

{#if showNearFrame && (activeConfig.canopyFlight ?? "bats") === "bats"}
  <ForestCanopyFlight {groundY} />
{/if}

{#if $forestEnvironment}
  <T is={$forestEnvironment.scene} position.y={groundY} dispose={false} />
  <ForestGroundDetail
    scene={$forestEnvironment.scene}
    strength={isNightMaster ? 0.18 : 0.9}
    normalResponse={isNightMaster ? 0.12 : 0.3}
    roughnessFloor={isNightMaster ? 0.99 : 0.98}
  />
  {#if activeConfig.materialResponse}
    <ForestAtmosphereMaterials
      scene={$forestEnvironment.scene}
      response={activeConfig.materialResponse}
      scope="environment"
    />
  {/if}
{/if}

{#if showNearFrame}
  <ForestNearFrameLayer
    {groundY}
    materialResponse={activeConfig.materialResponse}
    onReady={handleNearFrameReady}
  />
  <ForestCampsite
    groundY={campsiteGroundY}
    showTents={tentFeatureEnabled}
    showCampfire={campfireFeatureEnabled}
    materialResponse={activeConfig.materialResponse}
    onReady={handleForestCampsiteReady}
    onError={handleForestCampsiteError}
  />
{/if}

{#key activeConfig.leaves.count}
  <FallingParticles
    type={activeConfig.leaves.type}
    count={activeConfig.leaves.count}
    area={activeConfig.leaves.area}
    speed={activeConfig.leaves.speed}
    colors={activeConfig.leaves.colors}
    sizeRange={activeConfig.leaves.sizeRange}
    spin={activeConfig.leaves.spin}
  />
{/key}

{#if activeConfig.fireflies}
  {#if showNearFrame}
    <ForestFireflyFields config={activeConfig.fireflies} {groundY} />
  {:else}
    {#key activeConfig.fireflies.count}
      <FallingParticles
        type={activeConfig.fireflies.type}
        count={activeConfig.fireflies.count}
        area={activeConfig.fireflies.area}
        speed={activeConfig.fireflies.speed}
        colors={activeConfig.fireflies.colors}
        sizeRange={activeConfig.fireflies.sizeRange}
        spin={activeConfig.fireflies.spin}
      />
    {/key}
  {/if}
{/if}

{#if campfireFeatureEnabled && activeConfig.campfire}
  {@const cf = activeConfig.campfire}
  <VolumetricFireComponent
    position={firePosition}
    width={1.0}
    height={cf.fireHeight}
    depth={1.0}
    scale={cf.fireScale}
    sliceSpacing={0.15}
  />
  <T.PointLight
    position.x={cf.position.x}
    position.y={campsiteGroundY + cf.primaryLight.heightOffset}
    position.z={cf.position.z}
    color={cf.primaryLight.color}
    intensity={cf.primaryLight.intensity}
    distance={cf.primaryLight.distance}
    decay={cf.primaryLight.decay}
  />
  <T.PointLight
    position.x={cf.position.x}
    position.y={campsiteGroundY + cf.fillLight.heightOffset}
    position.z={cf.position.z}
    color={cf.fillLight.color}
    intensity={cf.fillLight.intensity}
    distance={cf.fillLight.distance}
    decay={cf.fillLight.decay}
  />
  <T.Group
    position.x={cf.position.x}
    position.y={campsiteGroundY + (cf.fireHeight * cf.fireScale) / 2 + 0.5}
    position.z={cf.position.z}
  >
    {#key cf.smokeCount}
      <FallingParticles
        type="smoke"
        count={cf.smokeCount}
        area={{ width: 1, height: 4, depth: 1 }}
        speed={0.04}
        colors={cf.smokeColors}
        sizeRange={[0.15, 0.4]}
        spin={false}
      />
    {/key}
  </T.Group>
{/if}

<ForestLighting
  hemisphere={activeConfig.hemisphereLight}
  profile={activeConfig.lighting}
  {groundY}
/>

{#if showStage}
  {#if forestStageFailed}
    <T.Group position.z={stageZOffset}>
      <Stage3D width={stageWidth} depth={stageDepth} />
    </T.Group>
  {:else}
    <ForestStage
      width={stageWidth}
      depth={stageDepth}
      {groundY}
      zOffset={stageZOffset}
      materialResponse={activeConfig.materialResponse}
      onReady={handleForestStageReady}
      onError={handleForestStageError}
    />
  {/if}
{/if}
