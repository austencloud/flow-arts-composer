<script lang="ts">
  import {
    resolveThrelteScene,
    resolveThrelteRenderer,
  } from "../../scene-boot/threlte-handles";
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
    advanceEnvironmentTransition,
    createEnvironmentTransitionState,
    switchEnvironmentBehindHost,
    type EnvironmentTransitionObservation,
  } from "../domain/environment-transition";
  import {
    createEnvironmentHandoff,
    handoffWorlds,
    observeHandoff,
    requestHandoff,
    settleHandoff,
  } from "../domain/environment-handoff";
  import { EnvironmentHandoffGuard } from "../rendering/environment-handoff-guard";
  import { createEnvironmentModuleLoader } from "../domain/environment-module-load";

  // The host owns the visible cut, so its worlds swap in a single update.
  const HOST_CONTROLLED_TIMING = { coverDurationMs: 0, revealDurationMs: 0 };

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

  const { scene: sceneValue, renderer: rendererValue } = useThrelte();
  const scene = resolveThrelteScene(sceneValue);
  const renderer = resolveThrelteRenderer(rendererValue);
  const sceneFeatures = getSceneFeatureContext();
  // Full viewer canvases provide the shader readiness signal. Smaller embedded
  // canvases can still mount Environment3D safely; their incoming world takes
  // over as soon as its assets report ready.
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

  const hostControlled = $derived(transitionVisualMode === "host-controlled");

  // A film host covers the canvas itself and switches retained worlds behind
  // that cover in one update.
  let transition = $state(
    createEnvironmentTransitionState(untrack(() => backgroundType))
  );
  // Everywhere else the shown world stays up while the next one loads hidden.
  let handoff = $state(createEnvironmentHandoff(untrack(() => backgroundType)));
  const handoffGuard = new EnvironmentHandoffGuard();

  const mountedBackgroundType = $derived(
    hostControlled ? transition.mountedKey : handoff.shownKey
  );
  const mountedWorlds = $derived(
    hostControlled
      ? transition.mountedKey === null
        ? []
        : [transition.mountedKey]
      : handoffWorlds(handoff)
  );
  const preparingBackgroundType = $derived(
    hostControlled ? null : handoff.preparingKey
  );
  const stageFeatureEnabled = $derived(sceneFeatures.isEnabled("stage"));
  // While a world is preparing, the scene-feature "environment" slot and the
  // renderer warm-up both describe the incoming world, not the shown one.
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
  // A retained world keeps loading while it is the one being prepared.
  function isRetainedWorldActive(type: BackgroundType): boolean {
    return mountedBackgroundType === type || preparingBackgroundType === type;
  }
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

  // A world's chunk can fail to download (offline, stale deploy). Report it so
  // the handoff drops the newcomer and the picker says so, instead of the
  // tapped tile spinning forever over the old world.
  const worldModules = createEnvironmentModuleLoader<BackgroundType>(
    (message) => sceneFeatures.reportFailed("environment", message)
  );
  function loadWorld<T>(
    type: BackgroundType,
    importer: () => Promise<T>
  ): Promise<T> {
    return worldModules.load(type, importer, () =>
      untrack(() => mountedWorlds.includes(type))
    );
  }

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

  // The shown world is fully loaded, so it takes the "environment" slot back.
  function restoreShownWorldReady(): void {
    sceneFeatures.resetReady("environment");
    sceneFeatures.reportReady("environment");
  }

  $effect(() => {
    const requestedBackground = backgroundType;
    // This effect belongs to the scene-choice prop, not to the state it
    // updates. Reading that state outside untrack would reschedule it on every
    // write and can turn a same-scene request into an endless loop.
    untrack(() => {
      if (transitionVisualMode === "host-controlled") {
        const currentTransition = transition;
        if (
          requestedBackground === currentTransition.mountedKey &&
          requestedBackground === currentTransition.requestedKey
        ) {
          return;
        }

        // The host has already covered the WebGL canvas with a complete frame.
        // Retained film worlds can switch in one update, report readiness, and
        // render behind the host before it reveals the incoming shot.
        transitionVisual?.setRendererReady(false);
        sceneFeatures.resetReady("environment");
        transition = switchEnvironmentBehindHost(
          currentTransition,
          requestedBackground
        );
        return;
      }

      const current = handoff;
      const next = requestHandoff(current, requestedBackground);
      if (next === current) return;

      if (next.preparingKey !== null) {
        if (next.preparingKey !== current.preparingKey) {
          handoffGuard.begin(scene);
          transitionVisual?.setRendererReady(false);
          sceneFeatures.resetReady("environment");
        }
      } else if (current.preparingKey !== null) {
        // Back to the world on screen before the other one arrived.
        handoffGuard.cancel(scene);
        restoreShownWorldReady();
      }
      handoff = next;
    });
  });

  // The incoming world takes over once its assets are in and its shaders are
  // warm. A failure drops it and the shown world carries on.
  $effect(() => {
    if (hostControlled) return;
    const current = handoff;
    if (current.preparingKey === null) return;
    const failed = sceneFeatures.getError("environment") !== null;
    const ready =
      sceneFeatures.isReady("environment") &&
      (transitionVisual?.rendererReady ?? true);
    const next = settleHandoff(current, { ready, failed });
    if (next === current) return;
    untrack(() => {
      if (next.shownKey !== current.shownKey) {
        handoffGuard.promote(scene);
      } else {
        handoffGuard.cancel(scene);
        restoreShownWorldReady();
      }
      handoff = next;
    });
  });

  let previousMountedBackground = untrack(() => transition.mountedKey);
  $effect(() => {
    if (!hostControlled) return;
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
    // Nothing covers the canvas any more: the shown world is the cover.
    transitionVisual?.setFrame(
      0,
      hostControlled ? "idle" : handoff.preparingKey ? "preparing" : "idle"
    );
  });

  $effect(() => {
    const observation: EnvironmentTransitionObservation<BackgroundType> =
      hostControlled
        ? {
            requestedKey: transition.requestedKey,
            mountedKey: transition.mountedKey,
            phase: transition.phase,
            settled: transition.phase === "idle" && mountedEnvironmentSettled,
          }
        : observeHandoff(handoff, mountedEnvironmentSettled);
    untrack(() => onTransitionChange?.(observation));
  });

  useTask((delta) => {
    if (hostControlled) {
      transition = advanceEnvironmentTransition(
        transition,
        delta * 1000,
        mountedEnvironmentSettled,
        HOST_CONTROLLED_TIMING
      );
      return;
    }
    // Before the render stage: keep the shown world's fog, sky and lighting on
    // screen and the incoming world's roots out of it.
    handoffGuard.hold(scene);
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
          active={isRetainedWorldActive(BackgroundType.AUTUMN)}
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
        active={isRetainedWorldActive(BackgroundType.FOREST)}
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
        active={isRetainedWorldActive(BackgroundType.OCEAN)}
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
        active={isRetainedWorldActive(BackgroundType.CELESTIAL)}
        {stageWidth}
        {stageDepth}
        {stageRadius}
        {stageZOffset}
        worldYOffset={frame.environmentYOffset}
      />
    {/await}
  </T.Group>
{/if}

<!-- The shown world, plus the incoming one while it loads hidden beside it.
     Keyed by world so the incoming scene keeps its loaded state when it is
     promoted instead of mounting again. -->
{#each mountedWorlds as worldType (worldType)}
  {#if !retainedEnvironments.has(worldType)}
    {@const config = getSceneConfig(worldType)}
    {@const environmentYOffset = getStageCoordinateFrame(
      worldType,
      stageFeatureEnabled
    ).environmentYOffset}
    <T.Group
      position.y={environmentYOffset}
      visible={worldType === mountedBackgroundType}
    >
      {#if config.scene === "forest"}
        {#await loadWorld(worldType, () => import("../scenes/ForestScene.svelte")) then { default: ForestScene }}
          <ForestScene
            variant={config.variant}
            config={forestConfig}
            {stageWidth}
            {stageDepth}
            {stageZOffset}
          />
        {:catch}
          <!-- loadWorld reported the failure; the shown world stays. -->
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
        {#await loadWorld(worldType, () => import("../scenes/CosmicScene.svelte")) then { default: CosmicScene }}
          <CosmicScene
            variant={config.variant}
            {performerCount}
            {stageRadius}
            {stageRadiusGrowth}
          />
        {:catch}
          <!-- loadWorld reported the failure; the shown world stays. -->
        {/await}
      {:else if config.scene === "winter"}
        {#await loadWorld(worldType, () => import("../scenes/WinterScene.svelte")) then { default: WinterScene }}
          <WinterScene
            {stageRadius}
            {stageRadiusGrowth}
            {stageZOffset}
            platformVisible={winterPlatformVisible}
            worldYOffset={environmentYOffset}
          />
        {:catch}
          <!-- loadWorld reported the failure; the shown world stays. -->
        {/await}
      {:else if config.scene === "ocean"}
        {#await loadWorld(worldType, () => import("../scenes/ocean/OceanScene.svelte")) then { default: OceanScene }}
          <OceanScene
            {performerCount}
            {stageWidth}
            {stageDepth}
            {stageZOffset}
            worldYOffset={environmentYOffset}
          />
        {:catch}
          <!-- loadWorld reported the failure; the shown world stays. -->
        {/await}
      {:else if config.scene === "ember"}
        {#await loadWorld(worldType, () => import("../scenes/EmberScene.svelte")) then { default: EmberScene }}
          <EmberScene {stageRadius} {stageRadiusGrowth} />
        {:catch}
          <!-- loadWorld reported the failure; the shown world stays. -->
        {/await}
      {:else if config.scene === "blossom"}
        {#await loadWorld(worldType, () => import("../scenes/BlossomScene.svelte")) then { default: BlossomScene }}
          <BlossomScene
            {stageWidth}
            {stageDepth}
            {stageZOffset}
            showDirectionCues={sceneFeatures.isEnabled("stage")}
          />
        {:catch}
          <!-- loadWorld reported the failure; the shown world stays. -->
        {/await}
      {:else if config.scene === "rainbow"}
        {#await loadWorld(worldType, () => import("../scenes/RainbowScene.svelte")) then { default: RainbowScene }}
          <RainbowScene
            {stageRadius}
            {stageRadiusGrowth}
            worldYOffset={environmentYOffset}
          />
        {:catch}
          <!-- loadWorld reported the failure; the shown world stays. -->
        {/await}
      {:else if config.scene === "celestial"}
        {#await loadWorld(worldType, () => import("../scenes/CelestialScene.svelte")) then { default: CelestialScene }}
          <CelestialScene
            {stageWidth}
            {stageDepth}
            {stageRadius}
            {stageRadiusGrowth}
            {stageZOffset}
            worldYOffset={environmentYOffset}
          />
        {:catch}
          <!-- loadWorld reported the failure; the shown world stays. -->
        {/await}
      {:else if config.scene === "void"}
        {#await loadWorld(worldType, () => import("../scenes/VoidScene.svelte")) then { default: VoidScene }}
          <VoidScene {stageRadius} {stageRadiusGrowth} />
        {:catch}
          <!-- loadWorld reported the failure; the shown world stays. -->
        {/await}
      {/if}
    </T.Group>
  {/if}
{/each}

<!-- Unrecognized background types render nothing - just the default grid -->
