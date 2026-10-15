<script lang="ts">
  import {
    resolveThrelteScene,
    resolveThrelteRenderer,
  } from "../../scene-boot/threlte-handles";
  import { useTask, useThrelte } from "@threlte/core";
  import { userProportionsState } from "@austencloud/scene-3d";
  import { onMount, untrack } from "svelte";
  import { tryGetAdaptiveQualityContext } from "../../context/adaptive-quality-context";
  import { getSceneFeatureContext } from "../../scene-features/context/scene-feature-context";
  import {
    createDefaultEmberConfig,
    isEmberAtmosphereLookId,
    type EmberSceneConfig,
  } from "../domain/models/scene-configs";
  import { prefersReducedMotion } from "../primitives/motion-preference";
  import {
    createLoadedEmberEnvironmentWorld,
    type EmberEnvironmentWorld,
  } from "../worlds/ember/ember-environment-world";

  interface Props {
    config?: EmberSceneConfig;
    stageRadius?: number;
    stageRadiusGrowth?: number;
  }

  let { config, stageRadius = 3, stageRadiusGrowth = 0 }: Props = $props();

  const requestedLook = (() => {
    if (
      typeof window === "undefined" ||
      !import.meta.env.DEV ||
      !window.location.pathname.startsWith("/test/")
    ) {
      return undefined;
    }
    const requested = new URLSearchParams(window.location.search).get(
      "emberLook"
    );
    return isEmberAtmosphereLookId(requested) ? requested : undefined;
  })();
  const activeConfig = $derived(
    config ?? createDefaultEmberConfig(requestedLook)
  );
  const groundDetailEnabled =
    !import.meta.env.DEV ||
    typeof window === "undefined" ||
    new URLSearchParams(window.location.search).get("emberGroundDetail") !==
      "off";
  const { camera, renderer: rendererValue, scene: sceneValue } = useThrelte();
  const scene = resolveThrelteScene(sceneValue);
  const renderer = resolveThrelteRenderer(rendererValue);
  const adaptiveQuality = tryGetAdaptiveQualityContext();
  let sceneFeatures: ReturnType<typeof getSceneFeatureContext> | null = null;
  try {
    sceneFeatures = getSceneFeatureContext();
  } catch {
    // Ember can render in isolated scene harnesses without the boot curtain.
  }
  let world: EmberEnvironmentWorld | null = null;
  let elapsed = 0;

  $effect(() => {
    const nextConfig = activeConfig;
    const nextGroundY = untrack(() => userProportionsState.groundY);
    let cancelled = false;
    let attached: EmberEnvironmentWorld | null = null;
    const previousFog = scene.fog;
    const previousBackground = scene.background;

    void createLoadedEmberEnvironmentWorld({
      renderer,
      groundY: nextGroundY,
      config: nextConfig,
      stageRadius,
      stageRadiusGrowth,
      qualityTier: adaptiveQuality?.contentTier,
      shadows: adaptiveQuality?.config.enableShadows ?? true,
      reducedMotion: prefersReducedMotion(),
      groundDetailEnabled,
      onProgress: (fraction) => {
        if (!cancelled) {
          sceneFeatures?.reportProgress("environment", fraction);
        }
      },
    })
      .then((next) => {
        if (cancelled) {
          next.dispose();
          return;
        }
        attached = next;
        world = next;
        elapsed = 0;
        next.setGroundY(userProportionsState.groundY);
        scene.add(next.root);
        scene.fog = next.fog;
        scene.background = next.background;
        sceneFeatures?.reportProgress("environment", 1);
        sceneFeatures?.reportReady("environment");
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("[EmberScene] environment failed to load", error);
        sceneFeatures?.reportFailed(
          "environment",
          "The Ember environment couldn't load."
        );
      });

    return () => {
      cancelled = true;
      if (!attached) return;
      if (world === attached) world = null;
      scene.remove(attached.root);
      if (scene.fog === attached.fog) scene.fog = previousFog;
      if (scene.background === attached.background) {
        scene.background = previousBackground;
      }
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
        console.warn("[EmberScene] GLB loading timed out - lifting curtain");
        sceneFeatures.reportReady("environment");
      }
    }, 15_000);
    return () => clearTimeout(timer);
  });
</script>
