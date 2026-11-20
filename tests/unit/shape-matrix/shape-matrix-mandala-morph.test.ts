import { describe, expect, it, vi } from "vitest";

import { SHAPE_MATRIX_ACTIVE_MANDALA_NAME } from "@tka/shape-engine/services/shape-matrix-artwork.js";
import {
  claimedMandalaFloor,
  runMandalaMorph,
  SHAPE_MATRIX_MORPH_BACK_CLASS,
  SHAPE_MATRIX_MORPH_CLASS,
  SHAPE_MATRIX_MORPH_FOLD_CLASS,
  type FoldBox,
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
  const settle = vi.fn(async (read: () => void) => read());
  const props = new Map<string, string>();
  const vars = {
    set: vi.fn((values: Record<string, string>) => {
      for (const [name, value] of Object.entries(values)) props.set(name, value);
    }),
    clear: vi.fn(() => props.clear()),
  };
  const deps: MandalaMorphDependencies = {
    startMorph,
    flush: (fn) => fn(),
    root: () => root,
    settle,
    vars,
  };
  return { classes, host, deps, settle, vars, props };
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

describe("the grid folding into the back chip", () => {
  // The pane exists only before the mutation and the glyph only after it, so
  // each box has to be read on its own side; the shell's fold keyframes read
  // the result from the transition's own stylesheet and fall back to the
  // plain fade without it.
  function foldHarness(boxes: {
    pane: () => FoldBox | null;
    glyph: () => FoldBox | null;
  }) {
    let land: () => void = () => {};
    const finished = new Promise<void>((resolve) => {
      land = resolve;
    });
    let update: () => Promise<void> = async () => {};
    const startMorph = vi.fn((_mutate: () => void, settle: () => Promise<void>) => {
      update = settle;
      return { finished } as unknown as ViewTransition;
    });
    const harness = createHarness(startMorph);
    harness.deps.foldBoxes = boxes;
    return { ...harness, land: () => land(), update: () => update() };
  }

  const pane = { left: 0, top: 100, width: 400, height: 600 };
  const glyph = { left: 20, top: 20, width: 16, height: 16 };

  it("measures the pane before the mutation and the glyph after it, then clears them", async () => {
    let glyphShowing = false;
    const { props, classes, host, deps, land, update } = foldHarness({
      pane: () => (glyphShowing ? null : pane),
      glyph: () => (glyphShowing ? glyph : null),
    });

    runMandalaMorph(host, () => {}, {}, deps);
    glyphShowing = true;
    await update();

    expect(props.get("--shape-matrix-fold-x")).toBe("-172px");
    expect(props.get("--shape-matrix-fold-y")).toBe("-372px");
    expect(props.get("--shape-matrix-fold-scale")).toBe("0.04");
    expect(classes.has(SHAPE_MATRIX_MORPH_FOLD_CLASS)).toBe(true);

    land();
    await new Promise((resolve) => setTimeout(resolve));
    expect(props.size).toBe(0);
    expect(classes.has(SHAPE_MATRIX_MORPH_FOLD_CLASS)).toBe(false);
  });

  it("reads the same trip going back, glyph first and pane after", async () => {
    let gridShowing = false;
    const { props, host, deps, update } = foldHarness({
      pane: () => (gridShowing ? pane : null),
      glyph: () => (gridShowing ? null : glyph),
    });

    runMandalaMorph(host, () => {}, { back: true }, deps);
    gridShowing = true;
    await update();

    expect(props.get("--shape-matrix-fold-x")).toBe("-172px");
    expect(props.get("--shape-matrix-fold-scale")).toBe("0.04");
  });

  it("sets nothing when a box cannot be measured, so the plain fade runs", async () => {
    const { props, classes, host, deps, update } = foldHarness({
      pane: () => pane,
      glyph: () => null,
    });

    runMandalaMorph(host, () => {}, {}, deps);
    await update();

    expect(props.size).toBe(0);
    expect(classes.has(SHAPE_MATRIX_MORPH_FOLD_CLASS)).toBe(false);
  });
});

describe("the tap's reads and writes", () => {
  // Every read of a box or a style forces the page to lay out whatever was
  // written before it. On each side the flight reads everything first and
  // writes after, so the tap pays for one layout per side, the one the
  // snapshot needs anyway. Its values go on the transition's own stylesheet,
  // never on the root element, whose custom properties every element in the
  // page inherits: setting them there restyled the whole page before the
  // flight could start.
  function orderedHarness(back: boolean) {
    const order: string[] = [];
    let update: () => Promise<void> = async () => {};
    const startMorph = vi.fn(
      (_mutate: () => void, settleStep: () => Promise<void>) => {
        order.push("startMorph");
        update = settleStep;
        return { finished: new Promise<void>(() => {}) } as unknown as ViewTransition;
      }
    );
    const harness = createHarness(startMorph);
    const rootWrites: string[] = [];
    const root = harness.deps.root()!;
    const watchedRoot = Object.assign(root, {
      style: new Proxy(
        {},
        {
          get: (_target, key) => {
            rootWrites.push(String(key));
            return () => {};
          },
        }
      ),
    });
    harness.deps.root = () => watchedRoot;
    harness.deps.flush = (fn) => {
      fn();
      order.push("flush");
    };
    harness.deps.settle = vi.fn(async (read: () => void) => {
      order.push("measure art");
      read();
      order.push("flush pictures");
    });
    harness.deps.foldBoxes = {
      pane: () => {
        order.push("read pane");
        return { left: 0, top: 100, width: 400, height: 600 };
      },
      glyph: () => {
        order.push("read glyph");
        return { left: 20, top: 20, width: 16, height: 16 };
      },
    };
    harness.deps.floorRest = () => {
      order.push("read floor");
      return "0.01";
    };
    harness.vars.set.mockImplementation((values: Record<string, string>) => {
      order.push("write vars");
      for (const [name, value] of Object.entries(values)) {
        harness.props.set(name, value);
      }
    });
    runMandalaMorph(harness.host, () => {}, { back }, harness.deps);
    return { ...harness, order, rootWrites, update: () => update() };
  }

  it("opening: reads the pane after the handoff, then the glyph and floor before the pictures flush, then writes once", async () => {
    const { order, rootWrites, vars, update } = orderedHarness(false);
    await update();
    expect(order).toEqual([
      "flush",
      "read pane",
      "startMorph",
      "measure art",
      "read glyph",
      "read floor",
      "flush pictures",
      "write vars",
    ]);
    expect(vars.set).toHaveBeenCalledTimes(1);
    expect(rootWrites).toEqual([]);
  });

  it("going back: reads the glyph and the floor as they stand, then the pane on the new side", async () => {
    const { order, rootWrites, vars, props, update } = orderedHarness(true);
    await update();
    expect(order).toEqual([
      "flush",
      "read glyph",
      "read floor",
      "startMorph",
      "measure art",
      "read pane",
      "flush pictures",
      "write vars",
    ]);
    expect(vars.set).toHaveBeenCalledTimes(1);
    expect(props.get("--shape-matrix-floor-rest")).toBe("0.01");
    expect(rootWrites).toEqual([]);
  });

  it("clears its values when the flight lands", async () => {
    let land: () => void = () => {};
    const finished = new Promise<void>((resolve) => {
      land = resolve;
    });
    const { host, deps, vars, props } = createHarness(
      (_mutate, settleStep) => {
        void settleStep();
        return { finished } as unknown as ViewTransition;
      }
    );
    deps.floorRest = () => "1";
    runMandalaMorph(host, () => {}, {}, deps);
    await Promise.resolve();
    expect(props.get("--shape-matrix-floor-rest")).toBe("1");

    land();
    await new Promise((resolve) => setTimeout(resolve));
    expect(vars.clear).toHaveBeenCalled();
    expect(props.size).toBe(0);
  });
});

describe("claimedMandalaFloor", () => {
  // Both surfaces keep a stage mounted, so the page holds two floors: the
  // Level Matrix drill's, first in the page and hidden behind the Ratio
  // Playground, and the Playground's own. Reading the first one recorded the
  // hidden floor's strength as the strength the flight lands on.
  function element(
    viewTransitionName: string,
    floor: object | null
  ): HTMLElement {
    return {
      style: { viewTransitionName },
      closest: (selector: string) =>
        selector === "[data-mandala-floor]" ? floor : null,
    } as unknown as HTMLElement;
  }
  function page(elements: HTMLElement[]): ParentNode {
    return {
      querySelectorAll: (selector: string) =>
        selector === "[style]" ? elements : [],
    } as unknown as ParentNode;
  }

  it("reads the floor whose art holds the flower's name, not the first floor", () => {
    const hiddenFloor = { id: "drill" };
    const shownFloor = { id: "ratios" };
    const root = page([
      element("", hiddenFloor),
      element(SHAPE_MATRIX_ACTIVE_MANDALA_NAME, shownFloor),
    ]);
    expect(claimedMandalaFloor(root)).toBe(shownFloor);
  });

  it("finds no floor while a tile holds the name", () => {
    const root = page([
      element(SHAPE_MATRIX_ACTIVE_MANDALA_NAME, null),
      element("", { id: "drill" }),
    ]);
    expect(claimedMandalaFloor(root)).toBeNull();
  });
});
