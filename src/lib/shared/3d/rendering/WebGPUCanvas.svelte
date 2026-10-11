<script lang="ts">
  /**
   * WebGPUCanvas
   *
   * Threlte Canvas wrapper that enables WebGPU rendering when available.
   * Checks WebGPU support before mounting Canvas, then passes the appropriate
   * renderer factory. Falls back to WebGL transparently.
   */

  import { Canvas } from "@threlte/core";
  import { type Snippet } from "svelte";
  import { WebGLRenderer, PCFSoftShadowMap, type ToneMapping } from "three";
  import { isWebGPUSupported, type RenderingBackend } from "./create-renderer";
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    /** Rendering backend preference */
    renderingBackend: RenderingBackend;
    /** Whether to enable auto-rendering */
    autoRender?: boolean;
    /** Tone mapping setting (Three.js constant) */
    toneMapping?: ToneMapping;
    /** Children snippet */
    children: Snippet;
  }

  let { renderingBackend, autoRender = true, toneMapping, children }: Props = $props();

  // Resolved state after async WebGPU check
  let isReady = $state(false);
  let shouldUseWebGPU = $state(false);
  let rendererError = $state<string | null>(null);

  // Pre-loaded WebGPU module (if available)
  let WebGPURendererClass: typeof import("three/webgpu").WebGPURenderer | null = null;

  // Check WebGPU support and pre-load the module
  async function initializeRendererSupport() {
    if (renderingBackend !== "webgpu-auto") {
      isReady = true;
      return;
    }

    const hasWebGPU = await isWebGPUSupported();
    if (!hasWebGPU) {
      isReady = true;
      return;
    }

    try {
      const module = await import("three/webgpu");
      WebGPURendererClass = module.WebGPURenderer;
      shouldUseWebGPU = true;
    } catch {
      // WebGPU module failed to load - fall back silently to WebGL
    }

    isReady = true;
  }

  initializeRendererSupport();

  /**
   * Synchronous renderer factory for Threlte.
   * Creates WebGPU renderer if supported and pre-loaded, otherwise WebGL.
   */
  function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
    if (shouldUseWebGPU && WebGPURendererClass) {
      const renderer = new WebGPURendererClass({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance" as GPUPowerPreference,
      });

      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = PCFSoftShadowMap;

      // Three.js queues renders until WebGPU init completes.
      // Surface init failures so the user isn't left with a blank canvas.
      renderer.init().catch((err: unknown) => {
        console.error("[WebGPUCanvas] WebGPU renderer.init() failed:", err);
        rendererError = err instanceof Error ? err.message : "WebGPU renderer failed to initialize";
      });

      return renderer as unknown as WebGLRenderer;
    }

    const glRenderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });

    glRenderer.shadowMap.enabled = true;
    glRenderer.shadowMap.type = PCFSoftShadowMap;

    return glRenderer;
  }
</script>

{#if rendererError}
  <div class="canvas-error">
    <span class="canvas-error-icon" aria-hidden="true">&#9888;</span>
    <span>{t("gallery_renderer_failed")}</span>
    <small>{rendererError}</small>
  </div>
{:else if isReady}
  <Canvas {autoRender} {toneMapping} {createRenderer}>
    {@render children()}
  </Canvas>
{:else}
  <div class="canvas-loading">
    <ProgressRing percent={-1} size={32} strokeWidth={3} />
    <span>{t("gallery_initializing_renderer")}</span>
  </div>
{/if}

<style>
  .canvas-loading {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #0a0a1a;
    color: rgba(255, 255, 255, 0.7);
    gap: 12px;
  }

  .canvas-error {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #0a0a1a;
    color: rgba(255, 255, 255, 0.7);
    gap: 8px;
    padding: 24px;
    text-align: center;
  }

  .canvas-error-icon {
    font-size: 32px;
    color: rgba(255, 180, 60, 0.9);
  }

  .canvas-error small {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    max-width: 280px;
    word-break: break-word;
  }
</style>
