/**
 * Renderer Factory
 *
 * Creates either a WebGPU or WebGL renderer based on browser support and user preference.
 * Used by Threlte Canvas to enable next-gen rendering when available.
 */

import { WebGLRenderer } from "three";
import { guardEveryWebGLRenderer } from "../scene-boot/guarded-compile-async";

guardEveryWebGLRenderer();

export type RenderingBackend = "webgl" | "webgpu-auto";

export interface RendererProfile {
  antialias?: boolean;
}

/** Check if WebGPU is available in this browser */
async function checkWebGPUSupport(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    return false;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

/** Cached WebGPU support result */
let webGPUSupportCached: boolean | null = null;

/**
 * Get WebGPU support status (cached after first check)
 */
export async function isWebGPUSupported(): Promise<boolean> {
  if (webGPUSupportCached === null) {
    webGPUSupportCached = await checkWebGPUSupport();
  }
  return webGPUSupportCached;
}

/**
 * Create the appropriate renderer based on backend preference.
 *
 * Note: This is a sync function that returns a WebGLRenderer immediately.
 * WebGPU initialization is async and handled internally by Three.js.
 *
 * @param canvas - The canvas element to render to
 * @param backend - User's rendering backend preference
 */
export function createRendererForBackend(
  canvas: HTMLCanvasElement,
  backend: RenderingBackend,
  profile: RendererProfile = {}
): WebGLRenderer {
  // For WebGL mode or if we need a sync fallback, use WebGL
  if (backend === "webgl") {
    return createWebGLRenderer(canvas, profile);
  }

  // For webgpu-auto, we need to check support and potentially use WebGPU
  // But since Threlte's createRenderer must be sync, we start with WebGL
  // and upgrade to WebGPU if available (handled by initializeWebGPURenderer)
  return createWebGLRenderer(canvas, profile);
}

function createWebGLRenderer(
  canvas: HTMLCanvasElement,
  profile: RendererProfile
): WebGLRenderer {
  return new WebGLRenderer({
    canvas,
    antialias: profile.antialias ?? true,
    alpha: false,
    powerPreference: "high-performance",
  });
}

/**
 * Initialize WebGPU renderer asynchronously.
 * Call this after the scene is set up to upgrade to WebGPU if available.
 *
 * Returns the WebGPU renderer if successful, null if falling back to WebGL.
 */
export async function initializeWebGPURenderer(
  canvas: HTMLCanvasElement,
  backend: RenderingBackend
): Promise<WebGLRenderer | null> {
  if (backend !== "webgpu-auto") {
    return null;
  }

  const hasWebGPU = await isWebGPUSupported();
  if (!hasWebGPU) {
    console.info("[Renderer] WebGPU not available, using WebGL fallback");
    return null;
  }

  try {
    // Dynamic import for WebGPU renderer
    const { WebGPURenderer } = await import("three/webgpu");

    const renderer = new WebGPURenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance" as GPUPowerPreference,
    });

    // Initialize WebGPU (async)
    await renderer.init();

    console.info("[Renderer] WebGPU initialized successfully");
    return renderer as unknown as WebGLRenderer;
  } catch (error) {
    console.warn("[Renderer] WebGPU init failed, using WebGL fallback:", error);
    return null;
  }
}

/**
 * Get a human-readable label for the current renderer type
 */
export function getRendererLabel(renderer: WebGLRenderer): string {
  // WebGPURenderer has isWebGPURenderer property
  if ("isWebGPURenderer" in renderer && renderer.isWebGPURenderer) {
    return "WebGPU";
  }
  return "WebGL";
}
