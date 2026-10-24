/**
 * Session triage E8: "Cannot read properties of undefined (reading 'isReady')"
 * on a cold /sequence/d1:… load. three 0.182's compileAsync polls
 * `properties.get(material).currentProgram.isReady()` on a timer; a material
 * disposed mid-poll has its properties entry removed, so `currentProgram` is
 * undefined and the timer throws where no caller can catch it. The guarded
 * poll treats a released program as done.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Camera, Object3D, WebGLRenderer } from "three";
import {
  compileAsyncGuarded,
  installGuardedCompileAsync,
} from "#lib/shared/3d/scene-boot/guarded-compile-async.js";
import { resolveThrelteHandles } from "#lib/shared/3d/scene-boot/threlte-handles.js";

type Program = { ready: boolean; isReady(): boolean };

function program(ready = false): Program {
  return {
    ready,
    isReady() {
      return this.ready;
    },
  };
}

/** Mirrors three's WebGLProperties: `get` on a removed key yields `{}`. */
function fakeRenderer(programs: Map<object, Program>, parallel = true) {
  const entries = new WeakMap<object, { currentProgram?: Program }>();
  for (const [material, p] of programs) {
    entries.set(material, { currentProgram: p });
  }
  return {
    compile: vi.fn(() => new Set(programs.keys())),
    compileAsync: vi.fn(),
    properties: {
      get: (material: object) => {
        if (!entries.has(material)) entries.set(material, {});
        return entries.get(material);
      },
      /** What `material.dispose()` does via three's deallocateMaterial. */
      remove: (material: object) => entries.delete(material),
    },
    extensions: {
      get: (name: string) =>
        name === "KHR_parallel_shader_compile" && parallel ? {} : null,
    },
  };
}

const object = {} as Object3D;
const camera = {} as Camera;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("compileAsyncGuarded", () => {
  it("settles when a material is disposed while its program is still linking", async () => {
    const kept = {};
    const disposed = {};
    const keptProgram = program();
    const renderer = fakeRenderer(
      new Map([
        [kept, keptProgram],
        [disposed, program()],
      ])
    );
    let settled = false;
    void compileAsyncGuarded(
      renderer as unknown as WebGLRenderer,
      object,
      camera
    ).then(() => {
      settled = true;
    });

    renderer.properties.remove(disposed);
    expect(() => vi.advanceTimersByTime(30)).not.toThrow();
    expect(settled).toBe(false);

    keptProgram.ready = true;
    await vi.advanceTimersByTimeAsync(10);
    expect(settled).toBe(true);
  });

  it("resolves at once when every program is already linked", async () => {
    const renderer = fakeRenderer(new Map([[{}, program(true)]]));
    await expect(
      compileAsyncGuarded(renderer as unknown as WebGLRenderer, object, camera)
    ).resolves.toBe(object);
  });

  it("waits a tick first without parallel shader compile, as three does", async () => {
    const renderer = fakeRenderer(new Map([[{}, program(true)]]), false);
    let settled = false;
    void compileAsyncGuarded(
      renderer as unknown as WebGLRenderer,
      object,
      camera
    ).then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(10);
    expect(settled).toBe(true);
  });
});

describe("installGuardedCompileAsync", () => {
  it("routes the renderer's compileAsync through the guarded poll, once", () => {
    const renderer = fakeRenderer(new Map([[{}, program(true)]]));
    const original = renderer.compileAsync;
    installGuardedCompileAsync(renderer as unknown as WebGLRenderer);
    const installed = renderer.compileAsync;
    installGuardedCompileAsync(renderer as unknown as WebGLRenderer);

    expect(installed).not.toBe(original);
    expect(renderer.compileAsync).toBe(installed);
    void renderer.compileAsync(object, camera);
    expect(renderer.compile).toHaveBeenCalledWith(object, camera, null);
    expect(original).not.toHaveBeenCalled();
  });

  it("is installed by resolveThrelteHandles, the warm-ups' only renderer source", () => {
    const renderer = {
      ...fakeRenderer(new Map()),
      domElement: {},
    };
    const original = renderer.compileAsync;
    const handles = resolveThrelteHandles({
      renderer,
      scene: {},
      camera: { current: { isCamera: true } },
    } as never);

    expect(handles?.renderer).toBe(renderer);
    expect(renderer.compileAsync).not.toBe(original);
  });
});
