<script lang="ts">
  /**
   * Environment3D
   *
   * Switcher component that renders the appropriate 3D environment
   * based on the BackgroundType setting. This unifies the 2D background
   * and 3D environment selection - they are the same setting.
   */

  import { BackgroundType } from "@austencloud/backgrounds";
  import { T, useTask, useThrelte } from "@threlte/core";
  import { onDestroy, untrack } from "svelte";
  import { getSceneFeatureContext } from "../../scene-features/context/scene-feature-context";
  import { getStageCoordinateFrame } from "../domain/stage-coordinate-frame";
  import { tryGetEnvironmentTransitionVisualContext } from "../context/environment-transition-visual-context";
  import { loadAutumnSceneModule } from "../scenes/autumn/runtime/autumn-scene-module";
  import type { ForestSceneConfig } from "../domain/models/scene-configs/forest-scene-config";
  import {
    DEFAULT_ENVIRONMENT_TRANSITION_TIMING,
    advanceEnvironmentTransition,
    createEnvironmentTransitionState,
    getEnvironmentVeilOpacity,
    requestEnvironment,
    switchEnvironmentBehindHost,
    type EnvironmentTransitionObservation,
  } from "../domain/environment-transition";

  interface Props {
    /** Background type from settings */
    backgroundType: BackgroundType;
    /** Number of performers on stage. Scenes use this to size platforms. */
    performerCount?: number;
    /** Live X/Z stage positions for environments that respond to presence. */
    performerPositions?: readonly { x: number; z: number }[];
    /** Computed stage width from performer bounding box. */
    stageWidth?: number;
    /** Computed stage depth from performer bounding box. */
    stageDepth?: number;
    /** Exact circular clearance from the scene origin. */
    stageRadius?: number;
    /** Radius added above a scene's authored solo platform for larger casts. */
    stageRadiusGrowth?: number;
    /** Legacy stage offset. Morphing stages stay centered at zero. */
    stageZOffset?: number;
    /** Forest-only authored atmosphere override. Other scenes ignore it. */
    forestConfig?: ForestSceneConfig;
    /** Winter review harness may hide the legacy ice platform behind a revision overlay. */
    winterPlatformVisible?: boolean;
    /** Reports the transition owner's semantic state for hosts and diagnostics. */
    onTransitionChange?: (
      observation: EnvironmentTransitionObservation<BackgroundType>
    ) => void;
    /** Worlds that stay mounted after their first film preparation pass. */
    retainedEnvironmentTypes?: readonly BackgroundType[];
    /**
     * A film host can own the visible edit while this component performs an
     * atomic retained-world switch behind that host's opaque frame.
     */
    transitionVisualMode?: "internal" | "host-controlled";
  }

  let {
    backgroundType,
    performerCount = 1,
    performerPositions = [],
    stageWidth = 6,
    stageDepth = 6,
    stageRadius = 3,
    stageRadiusGrowth = 0,
    stageZOffset = 0,
    forestConfig,
    winterPlatformVisible = true,
    onTransitionChange,
    retainedEnvironmentTypes = [],
    transitionVisualMode = "internal",
  }: Props = $props();

  const { scene, renderer } = useThrelte();
  const sceneFeatures = getSceneFeatureContext();
  // Full viewer canvases provide the DOM veil and shader readiness signal.
  // Smaller embedded canvases can still mount Environment3D safely; they use
  // the reduced-motion timing instead of waiting for a visual host they do not
  // own.
  const transitionVisual = tryGetEnvironmentTransitionVisualContext();

  type SceneConfig =
    | { scene: "forest"; variant: "firefly" }
    | { scene: "autumn" }
    | { scene: "cosmic"; variant: "night" | "aurora" }
    | { scene: "winter" }
    | { scene: "ocean" }
    | { scene: "ember" }
    | { scene: "blossom" }
    | { scene: "rainbow" }
    | { scene: "celestial" }
    | { scene: "void" }
    | { scene: "none" };

  function getSceneConfig(bg: BackgroundType): SceneConfig {
    switch (bg) {
      case BackgroundType.AUTUMN:
        return { scene: "autumn" };
      case BackgroundType.FOREST:
        return { scene: "forest", variant: "firefly" };
      case BackgroundType.COSMIC:
        return { scene: "cosmic", variant: "night" };
      case BackgroundType.WINTER:
        return { scene: "winter" };
      case BackgroundType.OCEAN:
        return { scene: "ocean" };
      case BackgroundType.EMBER:
        return { scene: "ember" };
      case BackgroundType.BLOSSOM:
        return { scene: "blossom" };
      case BackgroundType.PRIDE:
        return { scene: "rainbow" };
      case BackgroundType.CELESTIAL:
        return { scene: "celestial" };
      case BackgroundType.VOID:
        return { scene: "void" };
      // Unrecognized types show no 3D scene
      default:
        return { scene: "none" };
    }
  }

  let transition = $state(
    createEnvironmentTransitionState(untrack(() => backgroundType))
  );
  let prefersReducedMotion = $state(false);

  const mountedBackgroundType = $derived(transition.mountedKey);
  const config = $derived(
    mountedBackgroundType === null
      ? ({ scene: "none" } as const)
      : getSceneConfig(mountedBackgroundType)
  );
  const coordinateFrame = $derived(
    mountedBackgroundType === null
      ? null
      : getStageCoordinateFrame(
          mountedBackgroundType,
          sceneFeatures.isEnabled("stage")
        )
  );
  const environmentYOffset = $derived(coordinateFrame?.environmentYOffset ?? 0);
  const transitionTiming = $derived(
    transitionVisualMode === "host-controlled" ||
      prefersReducedMotion ||
      !transitionVisual
      ? { coverDurationMs: 0, revealDurationMs: 0 }
      : DEFAULT_ENVIRONMENT_TRANSITION_TIMING
  );
  const mountedEnvironmentSettled = $derived(
    mountedBackgroundType !== null &&
      (sceneFeatures.getError("environment") !== null ||
        (sceneFeatures.isReady("environment") &&
          (transitionVisual?.rendererReady ?? true)))
  );
  // Only worlds with a dedicated always-mounted block below can honor a
  // retention request. A retained type WITHOUT such a block must fall back to
  // the ordinary single-scene path — treating it as retained would gate off
  // the fallback renderer too, so nothing mounts, "environment" never reports
  // ready, and a film host's warmup waits on a settle signal that cannot come.
  const RETAINABLE_ENVIRONMENT_TYPES = new Set<BackgroundType>([
    BackgroundType.AUTUMN,
    BackgroundType.FOREST,
    BackgroundType.OCEAN,
    BackgroundType.CELESTIAL,
  ]);
  const retainedEnvironments = $derived(
    new Set(
      retainedEnvironmentTypes.filter((type) =>
        RETAINABLE_ENVIRONMENT_TYPES.has(type)
      )
    )
  );
  const mountedEnvironmentIsRetained = $derived(
    mountedBackgroundType !== null &&
      retainedEnvironments.has(mountedBackgroundType)
  );
  const autumnRetryRequest = $derived(
    sceneFeatures.getRetryRequest("environment")
  );
  const autumnSceneModule = $derived.by(() => {
    // A retry must create a fresh await promise even when the browser already
    // cached the module. That remounts Autumn after either a chunk failure or a
    // later scene-owned asset failure requested the shared retry action.
    void autumnRetryRequest;
    return loadAutumnSceneModule(
      () => import("../scenes/AutumnScene.svelte"),
      (message) => sceneFeatures.reportFailed("environment", message)
    );
  });

  function getScene() {
    return scene;
  }

  function getRenderer() {
    return renderer;
  }

  function clearSceneGlobals(): void {
    const s = getScene();
    const r = getRenderer();
    if (s?.isScene) {
      s.fog = null;
      s.background = null;
      s.environment = null;
    }
    if (r?.clear) r.clear();
  }

  $effect(() => {
    const requestedBackground = backgroundType;
    // This effect belongs to the scene-choice prop, not to the animation
    // state it updates. Reading transition outside untrack makes every frame
    // reschedule this effect; during covering that used to become an endless
    // same-scene write before the renderer could paint another frame.
    untrack(() => {
      const currentTransition = transition;

      if (transitionVisualMode === "host-controlled") {
        if (
          requestedBackground === currentTransition.mountedKey &&
          requestedBackground === currentTransition.requestedKey
        ) {
          return;
        }

        // The host has already covered the WebGL canvas with a complete frame.
        // Never pass through the ordinary empty-world gap here: retained film
        // worlds can switch in one update, report readiness, and render behind
        // the host before it reveals the incoming shot.
        transitionVisual?.setRendererReady(false);
        sceneFeatures.resetReady("environment");
        transition = switchEnvironmentBehindHost(
          currentTransition,
          requestedBackground
        );
        return;
      }

      const nextTransition = requestEnvironment(
        currentTransition,
        requestedBackground
      );
      if (nextTransition === currentTransition) return;

      if (requestedBackground !== currentTransition.mountedKey) {
        // Capture while the outgoing world is still mounted. The next render
        // may already be the empty gap, particularly with reduced motion.
        transitionVisual?.retainFrame();
        transitionVisual?.setRendererReady(false);
      }
      transition = nextTransition;
    });
  });

  $effect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => {
      prefersReducedMotion = media.matches;
    };
    syncPreference();
    media.addEventListener("change", syncPreference);
    return () => media.removeEventListener("change", syncPreference);
  });

  let previousMountedBackground = untrack(() => transition.mountedKey);
  $effect(() => {
    const mounted = transition.mountedKey;
    if (mounted === null && previousMountedBackground !== null) {
      clearSceneGlobals();
      // Clear readiness in the empty-frame phase itself. Deferring this to a
      // microtask can erase the next environment's cached-asset ready signal
      // after it mounts, stranding the transition until the safety timeout.
      sceneFeatures.resetReady("environment");
    }
    previousMountedBackground = mounted;
  });

  $effect(() => {
    if (transitionVisualMode === "host-controlled") {
      transitionVisual?.setFrame(0, "idle");
    } else {
      transitionVisual?.setFrame(
        getEnvironmentVeilOpacity(transition),
        transition.phase
      );
    }
  });

  $effect(() => {
    const observation: EnvironmentTransitionObservation<BackgroundType> = {
      requestedKey: transition.requestedKey,
      mountedKey: transition.mountedKey,
      phase: transition.phase,
      settled: transition.phase === "idle" && mountedEnvironmentSettled,
    };
    untrack(() => onTransitionChange?.(observation));
  });

  useTask((delta) => {
    transition = advanceEnvironmentTransition(
      transition,
      delta * 1000,
      mountedEnvironmentSettled,
      transitionTiming
    );
  });

  onDestroy(() => {
    clearSceneGlobals();
    transitionVisual?.reset();
  });
</script>

{#if retainedEnvironments.has(BackgroundType.AUTUMN)}
  {@const frame = getStageCoordinateFrame(
    BackgroundType.AUTUMN,
    sceneFeatures.isEnabled("stage")
  )}
  <T.Group
    position.y={frame.environmentYOffset}
    visible={mountedBackgroundType === BackgroundType.AUTUMN}
  >
    {#key autumnRetryRequest}
      {#await autumnSceneModule then { default: AutumnScene }}
        <AutumnScene
          active={mountedBackgroundType === BackgroundType.AUTUMN}
          {performerPositions}
          {stageWidth}
          {stageDepth}
          {stageZOffset}
          showDirectionCues={sceneFeatures.isEnabled("stage")}
        />
      {:catch}
        <!-- The viewer's scene-feature boundary owns the retry UI. -->
      {/await}
    {/key}
  </T.Group>
{/if}

{#if retainedEnvironments.has(BackgroundType.FOREST)}
  {@const frame = getStageCoordinateFrame(
    BackgroundType.FOREST,
    sceneFeatures.isEnabled("stage")
  )}
  <T.Group
    position.y={frame.environmentYOffset}
    visible={mountedBackgroundType === BackgroundType.FOREST}
  >
    {#await import("../scenes/ForestScene.svelte") then { default: ForestScene }}
      <ForestScene
        active={mountedBackgroundType === BackgroundType.FOREST}
        variant="firefly"
        config={forestConfig}
        {stageWidth}
        {stageDepth}
        {stageZOffset}
      />
    {/await}
  </T.Group>
{/if}

{#if retainedEnvironments.has(BackgroundType.OCEAN)}
  {@const frame = getStageCoordinateFrame(
    BackgroundType.OCEAN,
    sceneFeatures.isEnabled("stage")
  )}
  <T.Group
    position.y={frame.environmentYOffset}
    visible={mountedBackgroundType === BackgroundType.OCEAN}
  >
    {#await import("../scenes/ocean/OceanScene.svelte") then { default: OceanScene }}
      <OceanScene
        active={mountedBackgroundType === BackgroundType.OCEAN}
        {performerCount}
        {stageWidth}
        {stageDepth}
        {stageZOffset}
        worldYOffset={frame.environmentYOffset}
      />
    {/await}
  </T.Group>
{/if}

{#if retainedEnvironments.has(BackgroundType.CELESTIAL)}
  {@const frame = getStageCoordinateFrame(
    BackgroundType.CELESTIAL,
    sceneFeatures.isEnabled("stage")
  )}
  <T.Group
    position.y={frame.environmentYOffset}
    visible={mountedBackgroundType === BackgroundType.CELESTIAL}
  >
    {#await import("../scenes/CelestialScene.svelte") then { default: CelestialScene }}
      <CelestialScene
        active={mountedBackgroundType === BackgroundType.CELESTIAL}
        {stageWidth}
        {stageDepth}
        {stageRadius}
        {stageZOffset}
        worldYOffset={frame.environmentYOffset}
      />
    {/await}
  </T.Group>
{/if}

{#if coordinateFrame && !mountedEnvironmentIsRetained}
  <T.Group position.y={environmentYOffset}>
    {#if config.scene === "forest"}
      {#await import("../scenes/ForestScene.svelte") then { default: ForestScene }}
        <ForestScene
          variant={config.variant}
          config={forestConfig}
          {stageWidth}
          {stageDepth}
          {stageZOffset}
        />
      {/await}
    {:else if config.scene === "autumn"}
      {#key autumnRetryRequest}
        {#await autumnSceneModule then { default: AutumnScene }}
          <AutumnScene
            {performerPositions}
            {stageWidth}
            {stageDepth}
            {stageZOffset}
          />
        {:catch}
          <!-- The viewer's scene-feature boundary owns the retry UI. -->
        {/await}
      {/key}
    {:else if config.scene === "cosmic"}
      {#await import("../scenes/CosmicScene.svelte") then { default: CosmicScene }}
        <CosmicScene
          variant={config.variant}
          {performerCount}
          {stageRadius}
          {stageRadiusGrowth}
        />
      {/await}
    {:else if config.scene === "winter"}
      {#await import("../scenes/WinterScene.svelte") then { default: WinterScene }}
        <WinterScene
          {stageRadius}
          {stageRadiusGrowth}
          {stageZOffset}
          platformVisible={winterPlatformVisible}
          worldYOffset={environmentYOffset}
        />
      {/await}
    {:else if config.scene === "ocean"}
      {#await import("../scenes/ocean/OceanScene.svelte") then { default: OceanScene }}
        <OceanScene
          {performerCount}
          {stageWidth}
          {stageDepth}
          {stageZOffset}
          worldYOffset={environmentYOffset}
        />
      {/await}
    {:else if config.scene === "ember"}
      {#await import("../scenes/EmberScene.svelte") then { default: EmberScene }}
        <EmberScene {stageRadius} {stageRadiusGrowth} />
      {/await}
    {:else if config.scene === "blossom"}
      {#await import("../scenes/BlossomScene.svelte") then { default: BlossomScene }}
        <BlossomScene
          {stageWidth}
          {stageDepth}
          {stageZOffset}
          showDirectionCues={sceneFeatures.isEnabled("stage")}
        />
      {/await}
    {:else if config.scene === "rainbow"}
      {#await import("../scenes/RainbowScene.svelte") then { default: RainbowScene }}
        <RainbowScene
          {stageRadius}
          {stageRadiusGrowth}
          worldYOffset={environmentYOffset}
        />
      {/await}
    {:else if config.scene === "celestial"}
      {#await import("../scenes/CelestialScene.svelte") then { default: CelestialScene }}
        <CelestialScene
          {stageWidth}
          {stageDepth}
          {stageRadius}
          {stageRadiusGrowth}
          {stageZOffset}
          worldYOffset={environmentYOffset}
        />
      {/await}
    {:else if config.scene === "void"}
      {#await import("../scenes/VoidScene.svelte") then { default: VoidScene }}
        <VoidScene {stageRadius} {stageRadiusGrowth} />
      {/await}
    {/if}
  </T.Group>
{/if}

<!-- Unrecognized background types render nothing - just the default grid -->
