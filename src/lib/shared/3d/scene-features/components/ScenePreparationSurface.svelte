<script lang="ts" module>
  export const SCENE_LOADING_LABELS = [
    "Opening 3D",
    "Setting the stage",
    "Dressing the cast",
    "Warming up",
  ] as const;

  // Relative luminance of a #rrggbb colour (WCAG), to choose the title's ink.
  function luminance(hex: string): number {
    const channel = (start: number) => {
      const value = parseInt(hex.slice(start, start + 2), 16) / 255;
      return value <= 0.03928
        ? value / 12.92
        : Math.pow((value + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  }
</script>

<script lang="ts">
  /**
   * The 3D viewer's loading screen: the environment that is about to appear,
   * painted from its sky colours before any of it has loaded, with the
   * sequence's name above the horizon and the load's bar on the ground,
   * where the playback controls will be. When the scene is ready it fades in
   * over the same place.
   *
   * The bar shows `session`, the one bar that runs from "Opening 3D" until
   * the scene is smooth, so the host's placeholder and the scene's curtain
   * hand the same bar over.
   */
  import LoadingCapsule from "#lib/shared/components/loading/LoadingCapsule.svelte";
  import type { LoadingSession } from "#lib/shared/loading/loading-session.svelte.js";
  import type { SceneEnvironmentId } from "#lib/shared/3d/environments/domain/scene-environment.js";
  import {
    rememberedSceneEnvironmentId,
    SCENE_ENVIRONMENT_LOADING_SKY,
  } from "#lib/shared/3d/environments/domain/scene-environment-loading-sky.js";

  interface Props {
    statusText: string;
    /** Null until the load opens in the browser (server render, first
     * frame): the stage shows without its bar. */
    session: LoadingSession | null;
    /** Every status this load shows, so the bar never resizes. */
    labels?: readonly string[];
    /** The environment loading; defaults to the one the viewer remembers. */
    environmentId?: SceneEnvironmentId;
    /** The sequence's name, shown above the horizon. */
    title?: string | null;
  }

  let {
    statusText,
    session,
    labels = SCENE_LOADING_LABELS,
    environmentId,
    title = null,
  }: Props = $props();

  const sky = $derived(
    SCENE_ENVIRONMENT_LOADING_SKY[
      environmentId ??
        (typeof localStorage === "undefined"
          ? "cosmic"
          : rememberedSceneEnvironmentId())
    ]
  );
  // A daylight horizon (Celestial) takes dark ink; night skies take white.
  const lightHorizon = $derived(luminance(sky.horizon) > 0.4);
</script>

<div
  class="scene-preparation-surface"
  class:light-horizon={lightHorizon}
  style:--sky-top={sky.top}
  style:--sky-mid={sky.mid}
  style:--sky-horizon={sky.horizon}
  aria-busy="true"
  aria-label={`3D viewer, ${statusText}`}
  data-scene-preparation
  data-scene-preparation-label={statusText}
  data-scene-preparation-progress={session ? session.percent / 100 : 0}
>
  <div class="sky" aria-hidden="true"></div>
  <div class="horizon-glow" aria-hidden="true"></div>
  <div class="ground" aria-hidden="true">
    <div class="floor-grid"></div>
  </div>

  {#if title}
    <p class="title">{title}</p>
  {/if}
  <div class="status">
    {#if session}
      <LoadingCapsule {session} label={statusText} {labels} variant="line" />
    {/if}
    <span class="visually-hidden" role="status">{statusText}</span>
  </div>
</div>

<style>
  .scene-preparation-surface {
    --horizon: 62%;
    position: absolute;
    inset: 0;
    z-index: 30;
    overflow: hidden;
    container-type: size;
    background: var(--sky-mid);
  }

  .sky {
    position: absolute;
    inset: 0 0 calc(100% - var(--horizon));
    background: linear-gradient(
      to bottom,
      var(--sky-top),
      var(--sky-mid) 55%,
      var(--sky-horizon)
    );
  }

  /* The light gathered at the horizon, where the stage will stand. */
  .horizon-glow {
    position: absolute;
    top: calc(var(--horizon) - 18%);
    right: -10%;
    left: -10%;
    height: 36%;
    background: radial-gradient(
      50% 50% at 50% 50%,
      color-mix(in srgb, var(--sky-horizon) 60%, white 40%),
      transparent 70%
    );
    opacity: 0.22;
    pointer-events: none;
  }

  /* Dark enough under the status that its white text holds 4.5:1 on any
     environment's horizon, the daylight one included. */
  .ground {
    position: absolute;
    inset: var(--horizon) 0 0;
    overflow: hidden;
    background: linear-gradient(
      to bottom,
      color-mix(in srgb, var(--sky-horizon) 38%, black),
      color-mix(in srgb, var(--sky-horizon) 14%, black)
    );
    box-shadow: 0 -1px 0 color-mix(in srgb, var(--sky-horizon) 55%, white 20%);
  }

  .floor-grid {
    position: absolute;
    top: 0;
    right: -40%;
    left: -40%;
    height: 220%;
    opacity: 0.16;
    background-image:
      linear-gradient(
        color-mix(in srgb, var(--sky-mid) 40%, white) 1px,
        transparent 1px
      ),
      linear-gradient(
        90deg,
        color-mix(in srgb, var(--sky-mid) 40%, white) 1px,
        transparent 1px
      );
    background-size: 56px 56px;
    mask-image: linear-gradient(to bottom, transparent, #000 18%);
    transform: perspective(360px) rotateX(64deg);
    transform-origin: center top;
  }

  .title {
    position: absolute;
    right: 16px;
    bottom: calc(100% - var(--horizon) + clamp(20px, 7cqh, 72px));
    left: 16px;
    margin: 0;
    overflow: hidden;
    color: rgba(255, 255, 255, 0.8);
    font-size: clamp(1.5rem, 4.5cqi, 4.5rem);
    font-weight: 600;
    letter-spacing: 0.06em;
    line-height: 1.1;
    text-align: center;
    text-overflow: ellipsis;
    text-shadow: 0 2px 24px rgba(0, 0, 0, 0.35);
    white-space: nowrap;
  }

  .light-horizon .title {
    color: color-mix(in srgb, var(--sky-top) 30%, black);
    text-shadow: 0 1px 16px rgba(255, 255, 255, 0.35);
  }

  /* Low on the ground, in the band the playback controls take when the
     scene arrives. */
  .status {
    position: absolute;
    bottom: clamp(20px, 5cqh, 40px);
    /* The bar and its status grow with the stage, up to 4K. */
    --loading-line-width: clamp(240px, 24cqi, 560px);
    --loading-line-font-size: clamp(14px, 0.9cqi, 20px);
    right: 16px;
    left: 16px;
    display: flex;
    justify-content: center;
    pointer-events: none;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
