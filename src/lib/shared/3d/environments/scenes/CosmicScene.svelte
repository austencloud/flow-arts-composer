<script lang="ts">
  import { useTask, useThrelte } from "@threlte/core";
  import { onMount, untrack } from "svelte";
  import type { WebGLRenderer } from "three";
  import { userProportionsState } from "@austencloud/scene-3d";
  import { getErrorHandler } from "#lib/shared/application/get-error-handler.js";
  import type { CosmicVariant } from "../domain/enums/environment-enums";
  import {
    createDefaultCosmicAuroraConfig,
    createDefaultCosmicNightConfig,
    type CosmicSceneConfig,
  } from "../domain/models/scene-configs";
  import {
    prefersReducedMotion,
    resolveMotionScale,
  } from "../primitives/motion-preference";
  import {
    createCosmicEnvironmentWorld,
    type CosmicEnvironmentWorld,
  } from "../worlds/cosmic/cosmic-environment-world";
  import { getSceneFeatureContext } from "../../scene-features/context/scene-feature-context";

  interface Props {
    variant?: CosmicVariant;
    config?: CosmicSceneConfig;
    performerCount?: number;
    stageRadius?: number;
    stageRadiusGrowth?: number;
  }

  let {
    variant = "night",
    config,
    performerCount: _performerCount = 1,
    stageRadius = 3,
    stageRadiusGrowth = 0,
  }: Props = $props();

  const defaultConfigs = {
    night: createDefaultCosmicNightConfig,
    aurora: createDefaultCosmicAuroraConfig,
  };
  const activeConfig = $derived(config ?? defaultConfigs[variant]());
  const motionScale = $derived(resolveMotionScale(prefersReducedMotion()));
  const { camera, renderer, scene } = useThrelte() as unknown as ReturnType<
    typeof useThrelte
  > & { renderer: WebGLRenderer };
  const sceneFeatures = getSceneFeatureContext();
  let world: CosmicEnvironmentWorld | null = null;
  let elapsed = 0;

  $effect(() => {
    const nextConfig = activeConfig;
    const nextGroundY = untrack(() => userProportionsState.groundY);
    const nextMotionScale = motionScale;
    let cancelled = false;
    let attached: CosmicEnvironmentWorld | null = null;
    const previousFog = scene.fog;

    void createCosmicEnvironmentWorld({
      renderer,
      groundY: nextGroundY,
      config: nextConfig,
      stageRadius,
      stageRadiusGrowth,
      motionScale: nextMotionScale,
      onAssetProgress: (fraction) => {
        if (!cancelled) sceneFeatures?.reportProgress("environment", fraction);
      },
      onAudienceReady: () => {
        if (!cancelled) sceneFeatures?.reportReady("audience");
      },
      onAudienceError: (error) => {
        if (cancelled) return;
        const failure =
          error instanceof Error ? error : new Error(String(error));
        sceneFeatures?.reportFailed(
          "audience",
          "Audience models couldn't load."
        );
        getErrorHandler().showUserError({
          message: "The audience couldn't load. Use Retry in Scene settings.",
          technicalDetails: failure.message,
          error: failure,
          severity: "error",
          context: { module: "3d", tab: "scene", action: "loadAudience" },
        });
      },
    })
      .then((next) => {
        if (cancelled) {
          next.dispose();
          return;
        }
        attached = next;
        world = next;
        next.setGroundY(userProportionsState.groundY);
        elapsed = 0;
        scene.add(next.root);
        scene.fog = next.fog;
        sceneFeatures?.reportProgress("environment", 1);
        sceneFeatures?.reportReady("environment");
        void next.audienceReady.catch(() => undefined);
      })
      .catch((error) => {
        if (cancelled) return;
        const failure =
          error instanceof Error ? error : new Error(String(error));
        console.error("[CosmicScene] environment failed to load", failure);
        sceneFeatures?.reportFailed(
          "environment",
          "The Cosmic environment couldn't load."
        );
      });

    return () => {
      cancelled = true;
      if (!attached) return;
      if (world === attached) world = null;
      scene.remove(attached.root);
      if (scene.fog === attached.fog) scene.fog = previousFog;
      attached.dispose();
    };
  });

  $effect(() => {
    world?.setGroundY(userProportionsState.groundY);
  });

  useTask((delta) => {
    const activeWorld = world;
    const activeCamera = camera.current;
    if (!activeWorld || !activeCamera) return;
    elapsed += delta;
    activeWorld.update(delta, elapsed, activeCamera);
  });

  onMount(() => {
    const timer = setTimeout(() => {
      if (sceneFeatures && !sceneFeatures.isReady("environment")) {
        console.warn("[CosmicScene] asset loading timed out — lifting curtain");
        sceneFeatures.reportReady("environment");
      }
    }, 15_000);
    return () => clearTimeout(timer);
  });
</script>
