import { describe, expect, it, vi } from "vitest";

import {
  runMandalaMorph,
  SHAPE_MATRIX_MORPH_BACK_CLASS,
  SHAPE_MATRIX_MORPH_CLASS,
  type MandalaMorphDependencies,
} from "@tka/shape-engine/app/services/shape-matrix-mandala-morph.js";

function createHarness(startMorph: MandalaMorphDependencies["startMorph"]) {
  const classes = new Set<string>();
  const root = {
    classList: {
      add: (name: string) => void classes.add(name),
      remove: (...names: string[]) => names.forEach((n) => classes.delete(n)),
    } as unknown as DOMTokenList,
  };
  const host = {
    beginMandalaHandoff: vi.fn(),
    endMandalaHandoff: vi.fn(),
  };
  const settle = vi.fn(async () => {});
  const deps: MandalaMorphDependencies = {
    startMorph,
    flush: (fn) => fn(),
    root: () => root,
    settle,
  };
  return { classes, host, deps, settle };
}

describe("runMandalaMorph", () => {
  it("hands its endpoint settle step to the morph so the capture waits for it", () => {
    const startMorph = vi.fn((fn: () => void) => {
      fn();
      return null;
    });
    const { deps, settle } = createHarness(startMorph);

    runMandalaMorph(
      { beginMandalaHandoff() {}, endMandalaHandoff() {} },
      () => {},
      {},
      deps
    );

    const handedOver = startMorph.mock.calls[0][1] as () => Promise<void>;
    void handedOver();
    expect(settle).toHaveBeenCalledTimes(1);
  });

  it("marks a flight going back, and only until it ends", async () => {
    let land: () => void = () => {};
    const finished = new Promise<void>((resolve) => {
      land = resolve;
    });
    const startMorph = vi.fn(() => ({ finished }) as unknown as ViewTransition);
    const { classes, host, deps } = createHarness(startMorph);

    runMandalaMorph(host, () => {}, { back: true }, deps);
    expect(classes.has(SHAPE_MATRIX_MORPH_BACK_CLASS)).toBe(true);

    land();
    await new Promise((resolve) => setTimeout(resolve));
    expect(classes.has(SHAPE_MATRIX_MORPH_BACK_CLASS)).toBe(false);
    expect(classes.has(SHAPE_MATRIX_MORPH_CLASS)).toBe(false);
  });

  it("leaves a forward flight unmarked", () => {
    const startMorph = vi.fn((fn: () => void) => {
      fn();
      return null;
    });
    const added: string[] = [];
    const { host, deps } = createHarness(startMorph);
    const root = deps.root()!;
    const add = root.classList.add;
    root.classList.add = (...names: string[]) => {
      added.push(...names);
      add(...names);
    };

    runMandalaMorph(host, () => {}, {}, deps);
    expect(added).toEqual([SHAPE_MATRIX_MORPH_CLASS]);
  });

  it("applies the mutation plainly and restores the flags when no transition runs", () => {
    const mutate = vi.fn();
    const startMorph = vi.fn((fn: () => void) => {
      fn();
      return null;
    });
    const { classes, host, deps } = createHarness(startMorph);

    const result = runMandalaMorph(host, mutate, {}, deps);

    expect(result).toBeNull();
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(host.beginMandalaHandoff).toHaveBeenCalledTimes(1);
    expect(host.endMandalaHandoff).toHaveBeenCalledTimes(1);
    expect(classes.has(SHAPE_MATRIX_MORPH_CLASS)).toBe(false);
  });

  it("runs before and the handoff ahead of the snapshot, and ends them after the transition", async () => {
    const order: string[] = [];
    let settle: () => void = () => {};
    const finished = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const transition = { finished } as unknown as ViewTransition;
    const startMorph = vi.fn((fn: () => void) => {
      order.push("snapshot");
      fn();
      order.push("mutate");
      return transition;
    });
    const { classes, host, deps } = createHarness(startMorph);
    host.beginMandalaHandoff.mockImplementation(() => order.push("begin"));
    host.endMandalaHandoff.mockImplementation(() => order.push("end"));

    const result = runMandalaMorph(
      host,
      () => order.push("mutation"),
      { before: () => order.push("before") },
      deps
    );

    expect(result).toBe(transition);
    expect(order).toEqual([
      "before",
      "begin",
      "snapshot",
      "mutation",
      "mutate",
    ]);
    expect(classes.has(SHAPE_MATRIX_MORPH_CLASS)).toBe(true);
    expect(host.endMandalaHandoff).not.toHaveBeenCalled();

    settle();
    await finished;
    await Promise.resolve();
    await Promise.resolve();

    expect(host.endMandalaHandoff).toHaveBeenCalledTimes(1);
    expect(classes.has(SHAPE_MATRIX_MORPH_CLASS)).toBe(false);
  });

  it("restores the flags when the transition is skipped or fails", async () => {
    const finished = Promise.reject(new Error("skipped"));
    const transition = { finished } as unknown as ViewTransition;
    const { classes, host, deps } = createHarness(() => transition);

    runMandalaMorph(host, () => {}, {}, deps);
    await finished.catch(() => {});
    await Promise.resolve();
    await Promise.resolve();

    expect(host.endMandalaHandoff).toHaveBeenCalledTimes(1);
    expect(classes.has(SHAPE_MATRIX_MORPH_CLASS)).toBe(false);
  });

  it("cleans up and rethrows when the mutation throws", () => {
    const { classes, host, deps } = createHarness(() => {
      throw new Error("boom");
    });

    expect(() => runMandalaMorph(host, () => {}, {}, deps)).toThrow("boom");
    expect(host.endMandalaHandoff).toHaveBeenCalledTimes(1);
    expect(classes.has(SHAPE_MATRIX_MORPH_CLASS)).toBe(false);
  });
});
