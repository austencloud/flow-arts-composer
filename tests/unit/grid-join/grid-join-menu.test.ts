// @vitest-environment jsdom

/**
 * The grid-join submenu is offered by two right-click menus (the animation
 * canvas and the pictograph). These tests hold them to one owner: identical
 * items, one shared value, and radio states that follow it.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { GridJoin } from "@tka/tka-types";
import {
  createGridJoinController,
  type GridJoinController,
} from "$lib/shared/grid-join/grid-join-controller";
import {
  buildGridJoinChildren,
  buildGridJoinMenuItem,
} from "$lib/shared/grid-join/grid-join-menu";
import { buildCanvasContextMenuItems } from "$lib/shared/animation-engine/components/canvas-context-menu/canvas-context-menu-builder";
import { AnimationVisibilityStateManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import { buildPictographContextMenuItems } from "$lib/shared/pictograph/shared/components/context-menu/pictograph-context-menu-builder";
import { VisibilityStateManager } from "$lib/shared/pictograph/shared/state/visibility-state.svelte";
import {
  isMenuItem,
  type ContextMenuEntry,
  type ContextMenuItem,
} from "$lib/shared/components/context-menu/context-menu-types";

function holder(initial: GridJoin | null = null) {
  let join = initial;
  const sets: (GridJoin | null)[] = [];
  const controller: GridJoinController = createGridJoinController({
    get: () => join,
    apply: (next) => {
      join = next;
      sets.push(next);
    },
  });
  return { controller, sets, current: () => join };
}

function child(children: ContextMenuItem[], id: string): ContextMenuItem {
  const found = children.find((c) => c.id === id);
  if (!found) throw new Error(`no menu item ${id}`);
  return found;
}

function checkedIds(children: ContextMenuItem[]): string[] {
  return children.filter((c) => c.checked).map((c) => c.id);
}

function joinSubmenu(entries: ContextMenuEntry[]): ContextMenuItem {
  const found = entries
    .filter(isMenuItem)
    .find((e) => e.id === "grid-join-submenu");
  if (!found) throw new Error("no grid join submenu");
  return found;
}

/** What a person sees: everything but the function. */
function visible(item: ContextMenuItem): unknown {
  const { action: _action, children, ...rest } = item;
  return { ...rest, children: children?.map(visible) };
}

const DIRECTION_ARROWS: Record<string, { x: number; y: number }> = {
  e: { x: 1, y: 0 },
  w: { x: -1, y: 0 },
  n: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  ne: { x: 1, y: -1 },
  se: { x: 1, y: 1 },
  sw: { x: -1, y: 1 },
  nw: { x: -1, y: -1 },
};

describe("grid join submenu items", () => {
  it("lists one grid, both distances, then all eight directions", () => {
    const { controller } = holder();
    const ids = buildGridJoinChildren(controller).map((c) => c.id);

    expect(ids).toEqual([
      "grid-join-none",
      "grid-join-steps-1",
      "grid-join-steps-2",
      "grid-join-e",
      "grid-join-w",
      "grid-join-n",
      "grid-join-s",
      "grid-join-ne",
      "grid-join-se",
      "grid-join-sw",
      "grid-join-nw",
    ]);
  });

  it("names each direction by where red's grid sits from blue's", () => {
    const { controller } = holder();
    const children = buildGridJoinChildren(controller);

    expect(child(children, "grid-join-e").label).toBe("Red right");
    expect(child(children, "grid-join-w").label).toBe("Red left");
    expect(child(children, "grid-join-n").label).toBe("Red above");
    expect(child(children, "grid-join-s").label).toBe("Red below");
    expect(child(children, "grid-join-ne").label).toBe("Red above right");
    expect(child(children, "grid-join-se").label).toBe("Red below right");
    expect(child(children, "grid-join-sw").label).toBe("Red below left");
    expect(child(children, "grid-join-nw").label).toBe("Red above left");
    expect(child(children, "grid-join-none").label).toBe("One grid");
    expect(child(children, "grid-join-steps-1").label).toBe("1 point across");
    expect(child(children, "grid-join-steps-2").label).toBe("2 points across");
  });

  it("points each direction's arrow where red's grid goes", () => {
    const { controller } = holder();
    const children = buildGridJoinChildren(controller);

    for (const [toward, vector] of Object.entries(DIRECTION_ARROWS)) {
      const item = child(children, `grid-join-${toward}`);
      expect(item.icon).toBe("fa-arrow-right");
      // A right-pointing arrow turned clockwise on a y-down screen.
      const turned = ((item.iconRotate ?? 0) * Math.PI) / 180;
      const pointing = { x: Math.cos(turned), y: Math.sin(turned) };
      const wanted = Math.hypot(vector.x, vector.y);
      expect(pointing.x, toward).toBeCloseTo(vector.x / wanted, 9);
      expect(pointing.y, toward).toBeCloseTo(vector.y / wanted, 9);
    }
  });

  it("keeps the menu open on every choice", () => {
    const { controller } = holder();
    for (const item of buildGridJoinChildren(controller)) {
      expect(item.keepOpen, item.id).toBe(true);
    }
  });
});

describe("grid join radio states", () => {
  it("checks only One grid when the sequence has no join", () => {
    const { controller } = holder(null);
    expect(checkedIds(buildGridJoinChildren(controller))).toEqual([
      "grid-join-none",
    ]);
  });

  it.each([
    [{ toward: "e", steps: 1 }, ["grid-join-steps-1", "grid-join-e"]],
    [{ toward: "nw", steps: 2 }, ["grid-join-steps-2", "grid-join-nw"]],
    [{ toward: "s", steps: 2 }, ["grid-join-steps-2", "grid-join-s"]],
  ] as [GridJoin, string[]][])(
    "checks the distance and the direction of %j",
    (join, expected) => {
      const { controller } = holder(join);
      expect(checkedIds(buildGridJoinChildren(controller))).toEqual(expected);
    }
  );
});

describe("grid join choices", () => {
  it("One grid removes the join", () => {
    const state = holder({ toward: "n", steps: 2 });
    child(buildGridJoinChildren(state.controller), "grid-join-none").action?.();
    expect(state.current()).toBeNull();
  });

  it("a direction keeps the current distance", () => {
    const state = holder({ toward: "n", steps: 2 });
    child(buildGridJoinChildren(state.controller), "grid-join-sw").action?.();
    expect(state.current()).toEqual({ toward: "sw", steps: 2 });
  });

  it("a distance keeps the current direction", () => {
    const state = holder({ toward: "sw", steps: 1 });
    child(
      buildGridJoinChildren(state.controller),
      "grid-join-steps-2"
    ).action?.();
    expect(state.current()).toEqual({ toward: "sw", steps: 2 });
  });

  it("from one grid, a direction joins at one point and a distance joins east", () => {
    const first = holder(null);
    child(buildGridJoinChildren(first.controller), "grid-join-nw").action?.();
    expect(first.current()).toEqual({ toward: "nw", steps: 1 });

    const second = holder(null);
    child(
      buildGridJoinChildren(second.controller),
      "grid-join-steps-2"
    ).action?.();
    expect(second.current()).toEqual({ toward: "e", steps: 2 });
  });

  it("does nothing when the choice is already the join", () => {
    const state = holder({ toward: "e", steps: 1 });
    child(buildGridJoinChildren(state.controller), "grid-join-e").action?.();
    child(
      buildGridJoinChildren(state.controller),
      "grid-join-steps-1"
    ).action?.();
    expect(state.sets).toEqual([]);

    const none = holder(null);
    child(buildGridJoinChildren(none.controller), "grid-join-none").action?.();
    expect(none.sets).toEqual([]);
  });

  it("tells subscribers about a change, and not after they leave", () => {
    const state = holder(null);
    let calls = 0;
    const stop = state.controller.subscribe(() => {
      calls++;
    });

    state.controller.set({ toward: "e", steps: 1 });
    expect(calls).toBe(1);
    stop();
    state.controller.set({ toward: "w", steps: 1 });
    expect(calls).toBe(1);
  });
});

describe("one owner for both menus", () => {
  let vm: AnimationVisibilityStateManager;
  let pictographVm: VisibilityStateManager;

  beforeEach(() => {
    localStorage.clear();
    vm = new AnimationVisibilityStateManager({ ephemeral: true });
    pictographVm = new VisibilityStateManager();
  });

  function canvasSubmenu(controller: GridJoinController) {
    return joinSubmenu(
      buildCanvasContextMenuItems({
        visibilityManager: vm,
        gridJoin: controller,
      })
    );
  }

  function pictographSubmenu(controller: GridJoinController) {
    return joinSubmenu(
      buildPictographContextMenuItems({
        visibilityManager: pictographVm,
        gridJoin: controller,
      })
    );
  }

  it.each([
    null,
    { toward: "e", steps: 1 },
    { toward: "ne", steps: 2 },
  ] as (GridJoin | null)[])(
    "shows identical items in both menus (join %j)",
    (join) => {
      const { controller } = holder(join);

      expect(visible(canvasSubmenu(controller))).toEqual(
        visible(pictographSubmenu(controller))
      );
      expect(visible(canvasSubmenu(controller))).toEqual(
        visible(buildGridJoinMenuItem(controller))
      );
    }
  );

  it("changes in one menu show in the other", () => {
    const state = holder(null);

    child(canvasSubmenu(state.controller).children!, "grid-join-se").action?.();
    expect(checkedIds(pictographSubmenu(state.controller).children!)).toEqual([
      "grid-join-steps-1",
      "grid-join-se",
    ]);

    child(
      pictographSubmenu(state.controller).children!,
      "grid-join-steps-2"
    ).action?.();
    expect(checkedIds(canvasSubmenu(state.controller).children!)).toEqual([
      "grid-join-steps-2",
      "grid-join-se",
    ]);
    expect(state.current()).toEqual({ toward: "se", steps: 2 });
  });

  it("puts the pictograph's join submenu right after Grid & Points", () => {
    const { controller } = holder();
    const ids = buildPictographContextMenuItems({
      visibilityManager: pictographVm,
      gridJoin: controller,
    })
      .filter(isMenuItem)
      .map((e) => e.id);

    expect(ids.indexOf("grid-join-submenu")).toBe(
      ids.indexOf("grid-submenu") + 1
    );
  });

  it("offers no join where no controller is passed", () => {
    expect(
      buildPictographContextMenuItems({ visibilityManager: pictographVm })
        .filter(isMenuItem)
        .map((e) => e.id)
    ).not.toContain("grid-join-submenu");
    expect(
      buildPictographContextMenuItems({
        visibilityManager: pictographVm,
        gridJoin: null,
      })
        .filter(isMenuItem)
        .map((e) => e.id)
    ).not.toContain("grid-join-submenu");
  });
});
