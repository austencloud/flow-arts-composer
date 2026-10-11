<script lang="ts">
  /**
   * RenderGraphBridge
   *
   * Transparent WebGL2 overlay canvas that sits on top of the Threlte scene.
   * The GPU effects pipeline (WebGL2Backend) renders effects (trails, fire,
   * LED, particles, bloom, etc.) into this overlay. Separate GL context from
   * Three.js to avoid state machine conflicts.
   *
   * Positioned absolutely over the parent container. Alpha-composited via CSS.
   */

  import { onMount, onDestroy } from "svelte";
  import { WebGL2Backend } from "#lib/shared/render-graph/services/web-gl2-backend.js";

  interface Props {
    enabled?: boolean;
  }

  let { enabled = true }: Props = $props();

  let overlayCanvas: HTMLCanvasElement | undefined = $state();
  let backend: WebGL2Backend | null = null;
  let resizeObserver: ResizeObserver | null = null;

  onMount(() => {
    if (!overlayCanvas || !enabled) return;

    backend = new WebGL2Backend();
    backend.initialize(overlayCanvas).catch((err) => {
      console.warn("[RenderGraphBridge] WebGL2 init failed:", err);
    });

    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !overlayCanvas) return;
      const { width, height } = entry.contentRect;
      const dpr = Math.min(window.devicePixelRatio, 2);
      const w = Math.round(width * dpr);
      const h = Math.round(height * dpr);
      if (overlayCanvas.width !== w || overlayCanvas.height !== h) {
        overlayCanvas.width = w;
        overlayCanvas.height = h;
        backend?.resize(w, h);
      }
    });
    resizeObserver.observe(overlayCanvas);
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    backend?.dispose();
    backend = null;
  });

  export function getBackend(): WebGL2Backend | null {
    return backend;
  }
</script>

{#if enabled}
  <canvas
    class="render-graph-overlay"
    bind:this={overlayCanvas}
  ></canvas>
{/if}

<style>
  .render-graph-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 3;
  }
</style>
