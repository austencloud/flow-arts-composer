<script lang="ts">
  /**
   * SeatedAudience3D
   *
   * Renders an arc of real Mixamo characters on the downstage (+Z) side
   * of the stage, each playing a sitting-idle animation. Variety comes
   * from six different character GLBs, two idle animation variants
   * alternated per seat, per-seat time offsets for desync, and mild
   * scale jitter.
   *
   * All GLBs, FBX clips, and remapped animation clips are preloaded
   * and pre-baked before the audience renders. The scene feature
   * registry only reports "audience" ready once every asset is cached,
   * so the SceneLoadingCurtain stays down until the audience can
   * populate with zero main-thread hitches during sequence playback.
   */

  import { T } from "@threlte/core";
  import { userProportionsState } from "@austencloud/scene-3d";
  import { seatedAudienceLoader } from "@austencloud/scene-3d";
  import SeatedFigure3D from "./SeatedFigure3D.svelte";
  import { getSceneFeatureContext } from "../scene-features/context/scene-feature-context";
  import {
    SEATED_AUDIENCE_ANIMATION_URLS,
    SEATED_AUDIENCE_CHARACTER_URLS,
  } from "../config/seated-audience-assets";
  import { getErrorHandler } from "#lib/shared/application/get-error-handler.js";

  interface Props {
    count?: number;
    arcRadius?: number;
    arcSpread?: number;
    /**
     * World Y of the surface the performers stand on. Every environment is
     * moved to meet the canonical performer anchor, so this is one deck height
     * above `userProportionsState.groundY` — seating the crowd at the bare
     * ground value drops it through the floor.
     */
    groundLevel?: number;
  }

  let {
    count = 6,
    arcRadius = 4.8,
    arcSpread = Math.PI * 0.45,
    groundLevel,
  }: Props = $props();

  const groundY = $derived(groundLevel ?? userProportionsState.groundY);

  let sceneFeatures: ReturnType<typeof getSceneFeatureContext> | null = null;
  try {
    sceneFeatures = getSceneFeatureContext();
  } catch {
    // May be rendered outside scene feature system
  }

  interface Seat {
    x: number;
    z: number;
    yaw: number;
    sizeScale: number;
    modelUrl: string;
    animationUrl: string;
    timeOffset: number;
  }

  const seats = $derived.by<Seat[]>(() => {
    const result: Seat[] = [];
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const angle = (t - 0.5) * arcSpread;
      result.push({
        x: Math.sin(angle) * arcRadius,
        z: Math.cos(angle) * arcRadius,
        yaw: Math.PI + angle,
        sizeScale: 0.92 + ((i * 37) % 10) * 0.016,
        modelUrl:
          SEATED_AUDIENCE_CHARACTER_URLS[
            i % SEATED_AUDIENCE_CHARACTER_URLS.length
          ]!,
        animationUrl:
          SEATED_AUDIENCE_ANIMATION_URLS[
            i % SEATED_AUDIENCE_ANIMATION_URLS.length
          ]!,
        timeOffset: (i * 0.47) % 2.3,
      });
    }
    return result;
  });

  let isReady = $state(false);

  const RETRY_DELAY_MS = 750;
  const MAX_PRELOAD_ATTEMPTS = 2;

  $effect(() => {
    sceneFeatures?.getRetryRequest("audience");
    let cancelled = false;

    async function preloadAudience(): Promise<void> {
      isReady = false;

      let lastError: unknown = new Error("Audience preload failed");
      for (let attempt = 1; attempt <= MAX_PRELOAD_ATTEMPTS; attempt += 1) {
        try {
          await seatedAudienceLoader.preloadAll(
            SEATED_AUDIENCE_CHARACTER_URLS,
            SEATED_AUDIENCE_ANIMATION_URLS
          );
          if (cancelled) return;
          isReady = true;
          sceneFeatures?.reportReady("audience");
          return;
        } catch (error) {
          lastError = error;
          if (cancelled) return;
          if (attempt < MAX_PRELOAD_ATTEMPTS) {
            console.warn(
              `[SeatedAudience3D] preload attempt ${attempt} failed; retrying`,
              error
            );
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          }
        }
      }

      if (cancelled) return;
      const failure =
        lastError instanceof Error ? lastError : new Error(String(lastError));
      console.error("[SeatedAudience3D] preload failed:", failure);
      sceneFeatures?.reportFailed("audience", "Audience models couldn't load.");
      getErrorHandler().showUserError({
        message: "The audience couldn't load. Use Retry in Scene settings.",
        technicalDetails: failure.message,
        error: failure,
        severity: "error",
        context: {
          module: "3d",
          tab: "scene",
          action: "loadAudience",
        },
      });
    }

    void preloadAudience();

    return () => {
      cancelled = true;
    };
  });
</script>

{#if isReady}
  <T.Group position={[0, groundY, 0]}>
    {#each seats as seat, i (i)}
      <T.Group
        position={[seat.x, 0, seat.z]}
        rotation.y={seat.yaw}
        scale={seat.sizeScale}
      >
        <SeatedFigure3D
          modelUrl={seat.modelUrl}
          animationUrl={seat.animationUrl}
          timeOffset={seat.timeOffset}
        />
      </T.Group>
    {/each}
  </T.Group>
{/if}
