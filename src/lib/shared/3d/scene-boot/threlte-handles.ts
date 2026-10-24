import type { ThrelteContext } from "@threlte/core";
import type { Camera, Object3D, Scene, WebGLRenderer } from "three";
import { installGuardedCompileAsync } from "./guarded-compile-async";

/**
 * Threlte returns `camera` wrapped in a CurrentWritable (read `.current`) while
 * `scene` and `renderer` come back as plain objects — and the repo's local type
 * augmentation still describes the older wrapped shape for all three. Unwrap
 * defensively so a version bump in either direction cannot silently hand the
 * warmup an undefined renderer and skip compilation without anyone noticing.
 *
 * The museum keeps its own copy at
 * `features/museum/components/resolve-threlte-scene.ts`; it is out of scope for
 * this module and consumes nothing from here.
 */
export function resolveThrelteScene(value: Scene | { current: Scene }): Scene {
  return "current" in value ? value.current : value;
}

export function resolveThrelteRenderer(
  value: WebGLRenderer | { current: WebGLRenderer }
): WebGLRenderer {
  return "current" in value ? value.current : value;
}

export interface ThrelteHandles {
  renderer: WebGLRenderer;
  scene: Object3D;
  camera: Camera;
}

export function resolveThrelteHandles(
  ctx: ThrelteContext | null | undefined
): ThrelteHandles | null {
  if (!ctx) return null;
  const renderer = resolveThrelteRenderer(ctx.renderer);
  const scene = resolveThrelteScene(ctx.scene);
  const camera = ctx.camera.current;
  if (!renderer?.domElement || !scene || !camera?.isCamera) return null;
  // Every warm-up compiles through these handles. three's own compileAsync
  // throws from a timer when a material is disposed mid-poll (triage E8).
  installGuardedCompileAsync(renderer);
  return { renderer, scene, camera };
}
