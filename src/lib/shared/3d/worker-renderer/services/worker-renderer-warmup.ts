import {
  Texture,
  type Camera,
  type Material,
  type Object3D,
  type Scene,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
import { collectUniqueCompileTargets } from "../../scene-boot/renderer-program-targets";
import type { WorkerRendererProgramMetric } from "../domain/worker-renderer-protocol";

export interface WorkerRendererWarmupHandles {
  renderer: Pick<WebGLRenderer, "compileAsync" | "render">;
  scene: Object3D;
  camera: Camera;
}

export interface WorkerRendererWarmupOptions {
  onProgress?: (fraction: number) => void;
  yieldBetween?: () => Promise<void>;
  shouldStop?: () => boolean;
}

/**
 * Enough work to amortize three.js's whole-scene render traversal without
 * turning first-use uploads back into one monolithic draw. The worker yields
 * after every batch, so cancellation and the browser compositor still get a
 * scheduling opportunity while the outgoing poster remains visible.
 */
export const WORKER_PRIME_BATCH_SIZE = 8;

/**
 * Dispatches each distinct program in a separate turn, then awaits the driver
 * completions together. The turns keep worker messages flowing while the
 * grouped wait lets KHR_parallel_shader_compile overlap the actual link work.
 */
export async function warmWorkerRenderer(
  handles: WorkerRendererWarmupHandles,
  options: WorkerRendererWarmupOptions = {}
): Promise<readonly WorkerRendererProgramMetric[]> {
  const { renderer, scene, camera } = handles;
  const targets = collectUniqueCompileTargets(scene);
  if (targets.length === 0) targets.push(scene);
  const metrics: Array<WorkerRendererProgramMetric | undefined> = new Array(
    targets.length
  );
  let settled = 0;
  const pending: Promise<void>[] = [];

  for (let index = 0; index < targets.length; index += 1) {
    if (options.shouldStop?.()) break;
    const target = targets[index]!;
    const material = (
      target as Object3D & {
        material?: { type?: string } | Array<{ type?: string }>;
      }
    ).material;
    const materialLabel = Array.isArray(material)
      ? material.map((value) => value.type ?? "Material").join("+")
      : material?.type;
    const startedAt = performance.now();
    const wasVisible = target.visible;
    target.visible = true;
    try {
      const compilation = renderer.compileAsync(target, camera, scene as Scene);
      pending.push(
        compilation.then(() => {
          metrics[index] = {
            label: target.name || materialLabel || target.type,
            durationMs: performance.now() - startedAt,
          };
          settled += 1;
          options.onProgress?.(settled / targets.length);
        })
      );
    } finally {
      target.visible = wasVisible;
    }
    // Dispatch every program before awaiting any one of them so the parallel
    // shader extension can actually overlap driver work. A turn between
    // dispatches keeps cancellation and worker messages flowing without
    // serializing completion again.
    if (index + 1 < targets.length) await options.yieldBetween?.();
  }

  await Promise.all(pending);
  return metrics.filter(
    (metric): metric is WorkerRendererProgramMetric => metric !== undefined
  );
}

/**
 * Forces first-use geometry and texture uploads in small, separately scheduled
 * batches. Rendering each object separately repeated three.js's whole-scene
 * traversal 70-90 times on production scenes and caused the browser's main
 * compositor to stall throughout the prime phase. Small batches preserve the
 * scheduling breaks without paying that traversal once per object.
 */
export async function primeWorkerRenderer(
  handles: WorkerRendererWarmupHandles,
  options: WorkerRendererWarmupOptions = {}
): Promise<number> {
  const { renderer, scene, camera } = handles;
  const renderables: Object3D[] = [];
  scene.traverseVisible((object) => {
    if ((object as Object3D & { material?: unknown }).material) {
      renderables.push(object);
    }
  });
  if (renderables.length === 0) return 0;

  const renderableSet = new Set(renderables);
  for (const object of renderables) object.visible = false;

  try {
    for (
      let batchStart = 0;
      batchStart < renderables.length;
      batchStart += WORKER_PRIME_BATCH_SIZE
    ) {
      if (options.shouldStop?.()) break;
      const batchEnd = Math.min(
        batchStart + WORKER_PRIME_BATCH_SIZE,
        renderables.length
      );
      const revealed = new Set<Object3D>();
      for (let index = batchStart; index < batchEnd; index += 1) {
        const target = renderables[index]!;
        for (
          let cursor: Object3D | null = target;
          cursor;
          cursor = cursor.parent
        ) {
          if (renderableSet.has(cursor)) {
            cursor.visible = true;
            revealed.add(cursor);
          }
        }
      }

      renderer.render(scene, camera);
      for (const object of revealed) object.visible = false;
      options.onProgress?.(batchEnd / renderables.length);
      if (batchEnd < renderables.length) await options.yieldBetween?.();
    }
  } finally {
    for (const object of renderables) object.visible = true;
  }

  return renderables.length;
}

export interface LateObjectPreparationHandles {
  renderer: Pick<
    WebGLRenderer,
    "compileAsync" | "initTexture" | "getRenderTarget" | "setRenderTarget"
  >;
  scene: Scene;
  camera: Camera;
}

/**
 * Readies an object that joins an already-live scene: compiles its programs
 * against the scene's lights and uploads its textures, so its first draw does
 * not stall the render loop. Program variants depend on the bound render
 * target (tone mapping and output color space), so compile against the target
 * the scene actually draws into. `compileAsync` resolves those parameters
 * synchronously, so the live binding is restored before anything awaits.
 */
export async function prepareLateWorkerObject(
  handles: LateObjectPreparationHandles,
  object: Object3D,
  sceneRenderTarget: WebGLRenderTarget | null
): Promise<void> {
  const { renderer, scene, camera } = handles;
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(sceneRenderTarget);
  let compilation: Promise<unknown>;
  try {
    compilation = renderer.compileAsync(object, camera, scene);
  } finally {
    renderer.setRenderTarget(previous);
  }

  const textures = new Set<Texture>();
  object.traverse((child) => {
    const material = (child as Object3D & { material?: Material | Material[] })
      .material;
    if (!material) return;
    for (const entry of Array.isArray(material) ? material : [material]) {
      for (const value of Object.values(entry)) {
        if (value instanceof Texture) textures.add(value);
      }
    }
  });
  for (const texture of textures) renderer.initTexture(texture);

  await compilation;
}
