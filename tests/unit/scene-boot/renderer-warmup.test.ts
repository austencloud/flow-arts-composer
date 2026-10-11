/**
 * The warm-up links every shader program the scene needs while the curtain is
 * still opaque. Whether it dispatches those links together or waits for each
 * one in turn is invisible at runtime — the scene looks identical either way,
 * it just takes longer — so the concurrency is pinned down here.
 *
 * three.js compileAsync does its traversal synchronously and then polls
 * KHR_parallel_shader_compile on a 10ms timer, so awaiting the calls one at a
 * time costs every driver link end to end plus a poll tick per program.
 */

import { describe, expect, it, vi } from "vitest";

import {
  warmupRenderer,
  type WarmupHandles,
} from "#lib/shared/3d/scene-boot/renderer-warmup.js";

interface FakeObject {
  visible: boolean;
  material?: { vertexShader: string };
  geometry?: {
    attributes: Record<string, { itemSize: number }>;
    morphAttributes: Record<string, unknown[]>;
  };
  traverse?: (callback: (object: FakeObject) => void) => void;
}

function meshWithProgram(id: string, visible = true): FakeObject {
  return {
    visible,
    material: { vertexShader: `shader-${id}` },
    geometry: {
      attributes: { position: { itemSize: 3 } },
      morphAttributes: {},
    },
  };
}

function sceneOf(children: FakeObject[]): FakeObject {
  const scene: FakeObject = { visible: true };
  scene.traverse = (callback) => {
    callback(scene);
    for (const child of children) callback(child);
  };
  return scene;
}

/** A renderer whose compiles never resolve until the test releases them. */
function deferredRenderer() {
  const releases: Array<() => void> = [];
  let inFlight = 0;
  let peakInFlight = 0;
  return {
    peak: () => peakInFlight,
    releaseAll: () => {
      for (const release of releases) release();
      releases.length = 0;
    },
    renderer: {
      compileAsync: () => {
        inFlight += 1;
        peakInFlight = Math.max(peakInFlight, inFlight);
        return new Promise<void>((resolve) => {
          releases.push(() => {
            inFlight -= 1;
            resolve();
          });
        });
      },
    },
  };
}

function handles(renderer: unknown, scene: FakeObject): WarmupHandles {
  return { renderer, scene, camera: {} } as unknown as WarmupHandles;
}

async function drainTasks(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

describe("warmupRenderer", () => {
  it("dispatches every unique program before waiting on any of them", async () => {
    const meshes = [
      meshWithProgram("a"),
      meshWithProgram("b"),
      meshWithProgram("c"),
    ];
    const { renderer, peak, releaseAll } = deferredRenderer();

    // Every dispatch still happens before any link promise is awaited. The
    // browser may receive a turn between expensive dispatches, so allow those
    // task boundaries to drain before checking peak overlap.
    const done = warmupRenderer(handles(renderer, sceneOf(meshes)));
    await drainTasks();
    expect(peak()).toBe(meshes.length);

    releaseAll();
    await expect(done).resolves.toBeUndefined();
  });

  it("compiles one target per distinct program signature, not per object", async () => {
    const compileAsync = vi.fn(() => Promise.resolve());
    const meshes = [
      meshWithProgram("shared"),
      meshWithProgram("shared"),
      meshWithProgram("unique"),
    ];

    await warmupRenderer(handles({ compileAsync }, sceneOf(meshes)));
    expect(compileAsync).toHaveBeenCalledTimes(2);
  });

  it("restores the visibility it borrowed, including on hidden targets", async () => {
    const hidden = meshWithProgram("hidden", false);
    const shown = meshWithProgram("shown", true);
    const compileAsync = vi.fn(() => Promise.resolve());

    await warmupRenderer(handles({ compileAsync }, sceneOf([hidden, shown])));
    expect(hidden.visible).toBe(false);
    expect(shown.visible).toBe(true);
  });

  it("reports progress once per target and finishes at 1", async () => {
    const meshes = [
      meshWithProgram("a"),
      meshWithProgram("b"),
      meshWithProgram("c"),
    ];
    const fractions: number[] = [];

    await warmupRenderer(
      handles({ compileAsync: () => Promise.resolve() }, sceneOf(meshes)),
      {
        onProgress: (fraction) => fractions.push(fraction),
      }
    );
    expect(fractions).toHaveLength(meshes.length);
    expect(fractions.at(-1)).toBe(1);
  });

  it("survives a driver that rejects, and still settles every other program", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const meshes = [meshWithProgram("a"), meshWithProgram("b")];
    let call = 0;
    const compileAsync = () =>
      call++ === 0
        ? Promise.reject(new Error("link failed"))
        : Promise.resolve();

    await expect(
      warmupRenderer(handles({ compileAsync }, sceneOf(meshes)))
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  // three's compileAsync polls program readiness on its own setTimeout. When a
  // material is disposed mid-poll the tick throws inside that timer and the
  // promise never settles either way, so the curtain sat at "Warming up" for
  // good. The warm-up must be able to give up on such a poll.
  it("settles as soon as the abort signal fires, even if a compile never does", async () => {
    const { renderer } = deferredRenderer();
    const abort = new AbortController();

    const done = warmupRenderer(
      handles(renderer, sceneOf([meshWithProgram("a")])),
      {
        signal: abort.signal,
      }
    );
    await drainTasks();
    abort.abort();

    await expect(done).resolves.toBeUndefined();
  });

  it("caps the wait on a compile poll that never settles, warns once and reports done", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { renderer } = deferredRenderer();
      const fractions: number[] = [];

      const done = warmupRenderer(
        handles(renderer, sceneOf([meshWithProgram("a")])),
        {
          capMs: 500,
          onProgress: (fraction) => fractions.push(fraction),
        }
      );
      await vi.advanceTimersByTimeAsync(499);
      expect(fractions).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);

      await expect(done).resolves.toBeUndefined();
      expect(fractions.at(-1)).toBe(1);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toMatch(/capped/);
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });

  it("does nothing but report done when the renderer cannot compile async", async () => {
    const onProgress = vi.fn();
    await warmupRenderer(handles({}, sceneOf([meshWithProgram("a")])), {
      onProgress,
    });
    expect(onProgress).toHaveBeenCalledExactlyOnceWith(1);
  });
});
