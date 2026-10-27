import { WebGLRenderer } from "three";
import type { Camera, Object3D, Scene } from "three";

/**
 * `renderer.compileAsync`, minus its one unguarded read.
 *
 * three 0.182's compileAsync compiles synchronously, then polls each material's
 * `properties.get(material).currentProgram.isReady()` on its own setTimeout
 * (WebGLRenderer.js, `checkMaterialsReady`). Disposing a material releases its
 * properties entry (`deallocateMaterial` → `properties.remove`), so a material
 * disposed while that poll is pending reads `currentProgram` as undefined and
 * the tick throws "Cannot read properties of undefined (reading 'isReady')".
 * The throw happens inside three's timer: no caller can catch it, it lands in
 * the global error handler (session triage E8, a cold /sequence/d1:… load),
 * and the promise never settles.
 *
 * Same compile and the same poll, except a released program counts as done:
 * nothing is left to link for a material that is gone. The 10 ms cadence and
 * the immediate first check under KHR_parallel_shader_compile follow three.
 */
export function compileAsyncGuarded(
  renderer: Pick<WebGLRenderer, "compile" | "properties" | "extensions">,
  object: Object3D,
  camera: Camera,
  targetScene: Scene | null = null
): Promise<Object3D> {
  const materials = renderer.compile(object, camera, targetScene);

  return new Promise((resolve) => {
    function checkMaterialsReady(): void {
      for (const material of materials) {
        const { currentProgram } = renderer.properties.get(material) as {
          currentProgram?: { isReady(): boolean };
        };
        if (!currentProgram || currentProgram.isReady()) {
          materials.delete(material);
        }
      }
      if (materials.size === 0) {
        resolve(object);
        return;
      }
      setTimeout(checkMaterialsReady, 10);
    }

    if (renderer.extensions.get("KHR_parallel_shader_compile") !== null) {
      checkMaterialsReady();
    } else {
      setTimeout(checkMaterialsReady, 10);
    }
  });
}

const guardedRenderers = new WeakSet<object>();

/**
 * Swap the renderer's own `compileAsync` for {@link compileAsyncGuarded}, once
 * per renderer. three assigns `compileAsync` per instance in its constructor,
 * so this replaces that instance's method only. Every Threlte warm-up reaches
 * the renderer through `resolveThrelteHandles`, which calls this.
 */
export function installGuardedCompileAsync(renderer: WebGLRenderer): void {
  if (
    guardedRenderers.has(renderer) ||
    typeof renderer.compile !== "function" ||
    typeof renderer.compileAsync !== "function" ||
    !renderer.properties ||
    !renderer.extensions
  ) {
    return;
  }
  guardedRenderers.add(renderer);
  renderer.compileAsync = (object, camera, targetScene = null) =>
    compileAsyncGuarded(renderer, object, camera, targetScene);
}

type GuardableRenderer = Pick<
  WebGLRenderer,
  "compile" | "properties" | "extensions" | "compileAsync"
>;

const guardedPrototypes = new WeakSet<object>();

/**
 * Guard every renderer of `RendererClass` built after this call, not only the
 * ones that reach {@link installGuardedCompileAsync}. scene-3d's Avatar3D
 * (character prep and swap) and its glTF cache warm-up call compileAsync on
 * the Threlte renderer directly, so the per-instance install never saw them
 * (session triage: the same isReady throw after switching to 3D Animation and
 * on the tunnel pane).
 *
 * three's constructor assigns `this.compileAsync = function …`. An accessor on
 * the prototype turns that assignment into a call here, which stores the
 * guarded version as the instance's own writable method instead.
 */
export function guardRendererClass(RendererClass: { prototype: object }): void {
  const proto = RendererClass.prototype;
  if (guardedPrototypes.has(proto)) return;
  guardedPrototypes.add(proto);
  Object.defineProperty(proto, "compileAsync", {
    configurable: true,
    get: () => undefined,
    set(this: GuardableRenderer) {
      guardedRenderers.add(this);
      const guarded: WebGLRenderer["compileAsync"] = (
        object,
        camera,
        targetScene = null
      ) => compileAsyncGuarded(this, object, camera, targetScene);
      Object.defineProperty(this, "compileAsync", {
        configurable: true,
        enumerable: true,
        writable: true,
        value: guarded,
      });
    },
  });
}

/** {@link guardRendererClass} for three's WebGLRenderer. Safe to call often. */
export function guardEveryWebGLRenderer(): void {
  guardRendererClass(WebGLRenderer);
}
