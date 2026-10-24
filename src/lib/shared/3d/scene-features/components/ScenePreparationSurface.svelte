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
   * where the playback controls will be.
   *
   * `leaving` plays the reveal: the title and bar fade, then the stage pushes
   * forward and dissolves into the scene behind it. The host sets the
   * timing through `--leave-chrome`, `--leave-delay` and `--leave-stage`.
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
    type SceneLoadingSky,
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
    /** A sky of the host's own, for a scene that is not one of the viewer's
     * environments (the Flow Fest jam's dusk). Wins over `environmentId`. */
    sky?: SceneLoadingSky;
    /** The sequence's name, shown above the horizon. */
    title?: string | null;
    /** The scene is ready behind it: play the reveal. */
    leaving?: boolean;
    /** The stage alone, without title or bar: the first frame of a scene
     * that builds itself around the viewer (SceneBuildIn). */
    bare?: boolean;
    /** The reveal has finished; the host can unmount the surface. */
    onLeft?: () => void;
  }

  let {
    statusText,
    session,
    labels = SCENE_LOADING_LABELS,
    environmentId,
    sky: ownSky,
    title = null,
    leaving = false,
    bare = false,
    onLeft,
  }: Props = $props();

  const sky = $derived(
    ownSky ??
      SCENE_ENVIRONMENT_LOADING_SKY[
        environmentId ??
          (typeof localStorage === "undefined"
            ? "cosmic"
            : rememberedSceneEnvironmentId())
      ]
  );
  // A daylight horizon (Celestial) takes dark ink; night skies take white.
  const lightHorizon = $derived(luminance(sky.horizon) > 0.4);

  let stageEl = $state<HTMLDivElement | undefined>(undefined);

  // Waits for the stage's own reveal rather than for any animationend: the
  // app-wide reduced-motion rule (keyframes.css) swaps every animation name,
  // so under it the reveal never plays and the surface would never leave.
  $effect(() => {
    if (!leaving || !stageEl || !onLeft) return;
    const left = onLeft;
    const reveal = stageEl
      .getAnimations()
      .filter(
        (animation) =>
          animation instanceof CSSAnimation &&
          animation.animationName === "stage-push-through"
      );
    if (reveal.length === 0) {
      left();
      return;
    }
    let current = true;
    void Promise.all(reveal.map((animation) => animation.finished)).then(
      () => current && left(),
      () => undefined
    );
    return () => {
      current = false;
    };
  });
</script>

<div
  class="scene-preparation-surface"
  class:light-horizon={lightHorizon}
  class:leaving
  style:--sky-top={sky.top}
  style:--sky-mid={sky.mid}
  style:--sky-horizon={sky.horizon}
  aria-busy="true"
  aria-label="3D viewer"
  data-scene-preparation
  data-scene-preparation-label={statusText}
  data-scene-preparation-progress={session ? session.percent / 100 : 0}
>
  <div class="stage" aria-hidden="true" bind:this={stageEl}>
    <div class="sky"></div>
    <div class="horizon-glow"></div>
    <div class="ground">
      <div class="floor-grid"></div>
    </div>
  </div>

  {#if title && !bare}
    <p class="title">{title}</p>
  {/if}
  <div class="status">
    {#if session && !bare}
      <LoadingCapsule {session} label={statusText} {labels} variant="line" />
    {/if}
    <span class="visually-hidden" role="status">{statusText}</span>
  </div>
</div>

<style>
  .scene-preparation-surface {
    /* Where the scenes' own horizons land under the viewer's camera (about
       half height in Cosmic and Celestial), so the stage dissolves into the
       scene without a second horizon crossing it. */
    --horizon: 50%;
    position: absolute;
    inset: 0;
    z-index: 30;
    overflow: hidden;
    container-type: size;
  }

  /* Whatever is behind is live once the reveal starts. */
  .leaving {
    pointer-events: none;
  }

  .stage {
    position: absolute;
    inset: 0;
    background: var(--sky-mid);
    transform-origin: 50% var(--horizon);
  }

  /* The reveal. The title and bar leave first, so neither ghosts over the
     performer or crosses the playback controls coming up beneath. Then the
     stage moves toward the viewer as it fades, opening onto the scene. Only
     opacity and transform move, so it holds its frame rate on any device
     while the scene renders. */
  .leaving .title,
  .leaving .status {
    opacity: 0;
    transition:
      opacity var(--leave-chrome, var(--duration-fast)) var(--ease-in),
      transform var(--leave-chrome, var(--duration-fast)) var(--ease-in);
  }

  .leaving .title {
    transform: translateY(calc(var(--leave-lift, 8px) * -1));
  }

  .leaving .stage {
    animation: stage-push-through var(--leave-stage, var(--duration-dramatic))
      var(--ease-in-out) var(--leave-delay, 0ms) both;
  }

  @keyframes stage-push-through {
    to {
      opacity: 0;
      transform: scale(var(--leave-scale, 1.08));
    }
  }

  /* Reduced motion keeps one quiet opacity cue, as the viewer's 2D and 3D
     handoff does (viewer-split-pane.css): the host sets no scale there, and
     this narrowly outranks the app-wide 0.01ms reduction so the stage fades
     rather than cuts. */
  @media (prefers-reduced-motion: reduce) {
    :global(:root)
      .scene-preparation-surface[data-scene-preparation].leaving
      .stage {
      animation-duration: var(--leave-stage, var(--duration-fast)) !important;
    }
  }

  :global(:root[data-motion-preference="reduce"])
    .scene-preparation-surface[data-scene-preparation].leaving
    .stage {
    animation-duration: var(--leave-stage, var(--duration-fast)) !important;
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
  }

  /* Soft 1.5px lines (no seams where a hard 1px line lands between pixels),
     a cell that grows with the stage so the floor still reads at 4K, and a
     fade at both ends so no line sits on the horizon or the bottom edge. */
  .floor-grid {
    --grid-line: color-mix(in srgb, var(--sky-mid) 40%, white);
    --grid-cell: clamp(48px, 4cqi, 120px);
    position: absolute;
    top: 0;
    right: -40%;
    left: -40%;
    height: 220%;
    opacity: 0.14;
    background-image:
      linear-gradient(transparent calc(100% - 1.5px), var(--grid-line) 100%),
      linear-gradient(
        90deg,
        transparent calc(100% - 1.5px),
        var(--grid-line) 100%
      );
    background-size: var(--grid-cell) var(--grid-cell);
    mask-image: linear-gradient(
      to bottom,
      transparent,
      #000 18%,
      #000 40%,
      transparent 48%
    );
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
