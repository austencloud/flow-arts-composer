<script lang="ts">
  import { useTask, useThrelte } from "@threlte/core";
  import { userProportionsState } from "@austencloud/scene-3d";
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import type { Camera, Scene, WebGLRenderer } from "three";

  import { getErrorHandler } from "$lib/shared/application/get-error-handler";
  import { tryGetAdaptiveQualityContext } from "../../context/adaptive-quality-context";
  import { getSceneFeatureContext } from "../../scene-features/context/scene-feature-context";
  import type { BlossomSceneConfig } from "../domain/models/scene-configs";
  import {
    attachBlossomEnvironmentWorld,
    createLoadedBlossomEnvironmentWorld,
    type BlossomEnvironmentWorld,
  } from "../worlds/blossom/blossom-environment-world";
  import { detectBlossomQuality } from "./cherry-blossom/blossom-runtime";

  interface Props {
    config?: BlossomSceneConfig;
    stageWidth?: number;
    stageDepth?: number;
    stageZOffset?: number;
    showDirectionCues?: boolean;
  }

  let {
    config,
    stageWidth = 6,
    stageDepth = 6,
    stageZOffset = 0,
    showDirectionCues = true,
  }: Props = $props();

  const { camera, renderer, scene } = useThrelte() as unknown as {
    camera: { current: Camera | null };
    renderer: WebGLRenderer;
    scene: Scene;
  };
  const adaptiveQuality = tryGetAdaptiveQualityContext();
  const sceneFeatures = getSceneFeatureContext();
  let reducedMotionQuery: MediaQuery | null = null;
  let world = $state.raw<BlossomEnvironmentWorld | null>(null);
  let generation = 0;

  function getGpuRendererName(): string {
    const gl = renderer.getContext();
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    return debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
      : "";
  }

  function reducedMotion(): boolean {
    if (typeof window === "undefined") return false;
    reducedMotionQuery ??= new MediaQuery("(prefers-reduced-motion: reduce)");
    return reducedMotionQuery.current;
  }

  const qualityTier = $derived.by(
    () =>
      adaptiveQuality?.contentTier ??
      detectBlossomQuality({
        userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
        hardwareConcurrency:
          typeof navigator === "undefined"
            ? 8
            : (navigator.hardwareConcurrency ?? 4),
        gpuRenderer: getGpuRendererName(),
      })
  );

  function reportFailure(error: unknown): void {
    const failure = error instanceof Error ? error : new Error(String(error));
    sceneFeatures?.reportProgress("environment", 1);
    sceneFeatures?.reportReady("environment");
    if (typeof window === "undefined") return;
    getErrorHandler().showUserError({
      message: "Blossom couldn't load. Try again or choose another background.",
      technicalDetails: `GLB load failed: ${failure.message}`,
      error: failure,
      severity: "error",
      context: {
        module: "3d",
        tab: "blossom",
        action: "loadEnvironment",
      },
    });
  }

  $effect(() => {
    const request = ++generation;
    const initialGroundY = untrack(() => userProportionsState.groundY);
    const prefersReducedMotion = reducedMotion();
    let cancelled = false;
    let mounted: BlossomEnvironmentWorld | null = null;
    let detach: (() => void) | null = null;
    let restoreGlobals: (() => void) | null = null;
    sceneFeatures?.reportProgress("environment", 0);

    void createLoadedBlossomEnvironmentWorld({
      renderer,
      config,
      groundY: initialGroundY,
      stageWidth,
      stageDepth,
      stageZOffset,
      showDirectionCues,
      qualityTier,
      reducedMotion: prefersReducedMotion,
      onProgress(fraction) {
        if (!cancelled && request === generation) {
          sceneFeatures?.reportProgress("environment", fraction * 0.9);
        }
      },
    })
      .then((next) => {
        if (cancelled || request !== generation) {
          next.dispose();
          return;
        }
        mounted = next;
        detach = attachBlossomEnvironmentWorld(scene, next);
        const previousFog = scene.fog;
        const previousBackground = scene.background;
        scene.fog = next.fog;
        scene.background = next.background;
        restoreGlobals = () => {
          if (scene.fog === next.fog) scene.fog = previousFog;
          if (scene.background === next.background) {
            scene.background = previousBackground;
          }
        };
        world = next;
        sceneFeatures?.reportProgress("environment", 1);
        sceneFeatures?.reportReady("environment");
      })
      .catch((error: unknown) => {
        if (!cancelled) reportFailure(error);
      });

    return () => {
      cancelled = true;
      if (world === mounted) world = null;
      restoreGlobals?.();
      detach?.();
      mounted?.dispose();
    };
  });

  $effect(() => {
    world?.setGroundY(userProportionsState.groundY);
  });

  $effect(() => {
    if (adaptiveQuality || typeof window === "undefined" || !world) return;
    const previousPixelRatio = renderer.getPixelRatio();
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, world.maxPixelRatio)
    );
    return () => renderer.setPixelRatio(previousPixelRatio);
  });

  $effect(() => {
    if (world) return;
    const timer = setTimeout(() => {
      if (sceneFeatures && !sceneFeatures.isReady("environment")) {
        console.warn("[BlossomScene] loading timed out - lifting curtain");
        sceneFeatures.reportReady("environment");
      }
    }, 15_000);
    return () => clearTimeout(timer);
  });

  useTask((delta) => {
    const activeCamera = camera.current;
    if (!world || !activeCamera) return;
    world.update(delta, activeCamera);
  });
</script>
