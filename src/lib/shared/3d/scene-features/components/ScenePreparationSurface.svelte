<script lang="ts" module>
  export const SCENE_LOADING_LABELS = [
    "Opening 3D",
    "Setting the stage",
    "Dressing the cast",
    "Warming up",
  ] as const;
</script>

<script lang="ts">
  /**
   * The 3D viewer's loading screen: the scene's dark stage with the app's
   * loading capsule on it. The capsule shows `session`, the one bar that
   * runs from "Opening 3D" until the scene is smooth, so the host's
   * placeholder and the scene's curtain hand the same bar over.
   */
  import LoadingCapsule from "#lib/shared/components/loading/LoadingCapsule.svelte";
  import type { LoadingSession } from "#lib/shared/loading/loading-session.svelte.js";

  interface Props {
    statusText: string;
    /** Null until the load opens in the browser (server render, first
     * frame): the stage shows without its bar. */
    session: LoadingSession | null;
    /** Every status this load shows, so the capsule never resizes. */
    labels?: readonly string[];
  }

  let { statusText, session, labels = SCENE_LOADING_LABELS }: Props = $props();
</script>

<div
  class="scene-preparation-surface"
  aria-busy="true"
  aria-label={`3D viewer, ${statusText}`}
  data-scene-preparation
  data-scene-preparation-label={statusText}
  data-scene-preparation-progress={session ? session.percent / 100 : 0}
>
  <div class="depth-grid" aria-hidden="true"></div>
  <div class="progress-area">
    {#if session}
      <LoadingCapsule {session} label={statusText} {labels} />
    {/if}
    <span class="visually-hidden" role="status">{statusText}</span>
  </div>
</div>

<style>
  .scene-preparation-surface {
    position: absolute;
    inset: 0;
    z-index: 30;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: radial-gradient(
      circle at 50% 42%,
      color-mix(in srgb, var(--theme-accent, #8b7cf6) 10%, #0a0e14),
      #0a0e14 68%
    );
  }

  /* The stage floor the scene will stand on, receding under the capsule. */
  .depth-grid {
    position: absolute;
    right: -16%;
    bottom: -31%;
    left: -16%;
    height: 62%;
    opacity: 0.1;
    background-image:
      linear-gradient(rgba(170, 160, 255, 0.5) 1px, transparent 1px),
      linear-gradient(90deg, rgba(170, 160, 255, 0.5) 1px, transparent 1px);
    background-size: 42px 42px;
    mask-image: linear-gradient(
      to bottom,
      transparent,
      #000 32%,
      #000 78%,
      transparent
    );
    transform: perspective(480px) rotateX(62deg);
    transform-origin: center top;
    pointer-events: none;
  }

  .progress-area {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 16px;
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
