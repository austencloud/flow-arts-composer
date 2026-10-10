import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { GridJoin } from "@tka/tka-types";
import { getGridJoinLayout } from "@tka/render-core";
import {
  CENTERED_HAND_OFFSETS,
  GridJoinTween,
  handOffsetsEqual,
  pictographJoinFrame,
} from "#lib/shared/grid-join/grid-join-tween.js";
import { joinSlideDrawingKey } from "#lib/shared/grid-join/join-slide.svelte.js";
import { PILL_ORDER } from "#lib/shared/animation-panel/pill-nav/pill-types.js";

const EAST_ONE: GridJoin = { toward: "e", steps: 1 };
const EAST_TWO: GridJoin = { toward: "e", steps: 2 };
const NORTH_ONE: GridJoin = { toward: "n", steps: 1 };
const ROOT = resolve(__dirname, "../../..");

describe("the pictograph join frame", () => {
  it("is centered at full size on one grid", () => {
    const frame = pictographJoinFrame(null, "diamond");
    expect(frame.left).toEqual({ x: 0, y: 0 });
    expect(frame.right).toEqual({ x: 0, y: 0 });
    expect(frame.scale).toBe(1);
  });

  it("matches the joined layout the renderer draws", () => {
    const layout = getGridJoinLayout(EAST_TWO, "diamond");
    const frame = pictographJoinFrame(EAST_TWO, "diamond");
    expect(frame.left).toEqual(layout.offsets.left);
    expect(frame.right).toEqual(layout.offsets.right);
    expect(frame.scale).toBe(layout.scale);
    expect(frame.scale).toBeLessThan(1);
  });

  it("tells a re-join from no change", () => {
    const one = pictographJoinFrame(EAST_ONE, "diamond");
    expect(
      handOffsetsEqual(one, pictographJoinFrame(EAST_ONE, "diamond"))
    ).toBe(true);
    expect(
      handOffsetsEqual(one, pictographJoinFrame(EAST_TWO, "diamond"))
    ).toBe(false);
    expect(
      handOffsetsEqual(one, pictographJoinFrame(NORTH_ONE, "diamond"))
    ).toBe(false);
  });
});

describe("the join slide tween", () => {
  it("shrinks the fit scale with the hands as one grid splits in two", () => {
    const to = pictographJoinFrame(EAST_TWO, "diamond");
    const tween = new GridJoinTween();
    tween.start({ ...CENTERED_HAND_OFFSETS, scale: 1 }, to, 0, 450);

    const middle = tween.sample(225)!;
    expect(middle.offsets.scale).toBeLessThan(1);
    expect(middle.offsets.scale).toBeGreaterThan(to.scale!);
    expect(Math.abs(middle.offsets.right.x)).toBeGreaterThan(0);
    expect(Math.abs(middle.offsets.right.x)).toBeLessThan(Math.abs(to.right.x));

    const end = tween.sample(450)!;
    expect(end.t).toBe(1);
    expect(end.offsets.scale).toBeCloseTo(to.scale!, 9);
    expect(end.offsets.right).toEqual(to.right);
  });
});

describe("the join slide drawing key", () => {
  const pictograph = {
    id: "step-1",
    letter: "A",
    gridMode: "diamond",
    motions: {
      left: {
        motionType: "pro",
        startLocation: "n",
        endLocation: "e",
        turns: 0,
      },
      right: {
        motionType: "pro",
        startLocation: "s",
        endLocation: "w",
        turns: 0,
      },
    },
  };

  it("ignores the join, so a re-joined step slides", () => {
    expect(
      joinSlideDrawingKey({ ...pictograph, conjoined: EAST_ONE } as never)
    ).toBe(joinSlideDrawingKey(pictograph));
  });

  it("changes with what the step shows, so another step snaps", () => {
    const base = joinSlideDrawingKey(pictograph);
    expect(joinSlideDrawingKey({ ...pictograph, letter: "B" })).not.toBe(base);
    expect(
      joinSlideDrawingKey({
        ...pictograph,
        motions: {
          ...pictograph.motions,
          left: { ...pictograph.motions.left, turns: 1 },
        },
      })
    ).not.toBe(base);
  });
});

describe("a join change is a sequence edit, not a viewer setting", () => {
  it("records each Create join change as an undoable edit", () => {
    const source = readFileSync(
      resolve(
        ROOT,
        "src/lib/features/create/shared/components/CreateModule.svelte"
      ),
      "utf8"
    );
    const apply = source.slice(source.indexOf("setGridJoinContext("));
    expect(apply.indexOf("UndoOperationType.SET_GRID_JOIN")).toBeGreaterThan(0);
    expect(apply.indexOf("UndoOperationType.SET_GRID_JOIN")).toBeLessThan(
      apply.indexOf("setGridJoin(join)")
    );
  });

  it("leaves the viewer with no join control", () => {
    expect(PILL_ORDER as readonly string[]).not.toContain("join");
    const panel = readFileSync(
      resolve(
        ROOT,
        "src/lib/shared/animation-panel/components/AnimationPanel.svelte"
      ),
      "utf8"
    );
    expect(panel).not.toContain("GridJoinSection");
    const orchestrator = readFileSync(
      resolve(
        ROOT,
        "src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte"
      ),
      "utf8"
    );
    expect(orchestrator).toContain("clearGridJoinContext()");
    expect(orchestrator).not.toContain("createGridJoinController");
  });
});
