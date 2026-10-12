<script lang="ts">
  /**
   * Viewer3DCornerIcon
   *
   * A 24px cube icon that appears in the bottom-right corner of the 2D viewer.
   * It fades after 3 seconds so it stays out of the way during normal use,
   * but tapping it enters 3D mode. Only rendered when WebGL2 is available, the
   * viewport is large enough to host 3D, and the viewer is currently in 2D mode.
   */

  import { getViewer3DContext } from "../context/viewer-3d-context";
  import { viewportFits3D } from "../capabilities/viewport-3d-gate.svelte";

  interface Props {
    onEnter3D: () => void;
  }

  let { onEnter3D }: Props = $props();
  const viewer3DState = getViewer3DContext();

  let faded = $state(false);

  $effect(() => {
    const timer = setTimeout(() => {
      faded = true;
    }, 3000);
    return () => clearTimeout(timer);
  });
</script>

{#if viewer3DState.renderMode === "2d" && viewer3DState.webgl2Available && viewportFits3D()}
  <button
    class="corner-icon"
    class:faded
    onclick={onEnter3D}
    aria-label="Enter 3D view"
  >
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
    >
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  </button>
{/if}

<style>
  .corner-icon {
    position: absolute;
    bottom: 12px;
    right: 12px;
    z-index: 5;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition:
      opacity var(--duration-dramatic) var(--ease-standard),
      background var(--duration-normal) var(--ease-standard);
    opacity: 1;
    padding: 0;
  }

  .corner-icon.faded {
    opacity: 0.4;
  }

  .corner-icon:hover,
  .corner-icon:active {
    opacity: 1;
    background: rgba(255, 255, 255, 0.15);
  }
</style>
