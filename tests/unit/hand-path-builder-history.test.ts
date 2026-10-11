import { describe, expect, it } from "vitest";
import { createBuilderState } from "#lib/features/hand-paths/hand-path-builder/state/builder-state.svelte.js";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("hand path builder history during animation", () => {
  it("keeps Undo and hand switching unavailable until the new point commits", async () => {
    const builder = createBuilderState();
    await builder.addLocation(GridLocation.NORTH);
    await builder.addLocation(GridLocation.EAST);
    const animation = deferred();
    builder.setAnimationCallback(() => animation.promise);
    const addition = builder.addLocation(GridLocation.SOUTH);

    expect(builder.canUndo).toBe(false);
    expect(builder.canSwitchToRight).toBe(false);
    builder.undo();
    builder.switchToRight();
    expect(builder.phase).toBe("left");
    expect(builder.leftLocations).toEqual([
      GridLocation.NORTH,
      GridLocation.EAST,
    ]);

    animation.resolve();
    await addition;
    builder.undo();
    expect(builder.leftLocations).toEqual([
      GridLocation.NORTH,
      GridLocation.EAST,
    ]);
    expect(builder.rightLocations).toEqual([]);
  });

  it("does not restore a cleared point when its animation finishes", async () => {
    const builder = createBuilderState();
    await builder.addLocation(GridLocation.NORTH);
    const animation = deferred();
    builder.setAnimationCallback(() => animation.promise);
    const addition = builder.addLocation(GridLocation.EAST);
    builder.reset();

    expect(builder.isAnimating).toBe(false);
    animation.resolve();
    await addition;
    expect(builder.leftLocations).toEqual([]);
    expect(builder.canUndo).toBe(false);
  });

  it("does not let an old animation unlock or alter a new path after a grid change", async () => {
    const builder = createBuilderState();
    await builder.addLocation(GridLocation.NORTH);
    const oldAnimation = deferred();
    builder.setAnimationCallback(() => oldAnimation.promise);
    const oldAddition = builder.addLocation(GridLocation.EAST);
    builder.setGridMode(GridMode.BOX);

    await builder.addLocation(GridLocation.NORTHEAST);
    const newAnimation = deferred();
    builder.setAnimationCallback(() => newAnimation.promise);
    const newAddition = builder.addLocation(GridLocation.SOUTHEAST);
    oldAnimation.resolve();
    await oldAddition;
    expect(builder.isAnimating).toBe(true);
    expect(builder.leftLocations).toEqual([GridLocation.NORTHEAST]);

    newAnimation.resolve();
    await newAddition;
    builder.undo();
    expect(builder.leftLocations).toEqual([GridLocation.NORTHEAST]);
  });

  it("undoes only the active hand and exposes no Undo after completion", async () => {
    const builder = createBuilderState();
    await builder.addLocation(GridLocation.NORTH);
    await builder.addLocation(GridLocation.EAST);
    builder.switchToRight();
    await builder.addLocation(GridLocation.SOUTH);
    await builder.addLocation(GridLocation.WEST);
    builder.undo();
    expect(builder.leftLocations).toEqual([
      GridLocation.NORTH,
      GridLocation.EAST,
    ]);
    expect(builder.rightLocations).toEqual([GridLocation.SOUTH]);
    await builder.addLocation(GridLocation.WEST);
    builder.complete();
    expect(builder.canUndo).toBe(false);
    builder.undo();
    expect(builder.rightLocations).toEqual([
      GridLocation.SOUTH,
      GridLocation.WEST,
    ]);
  });
});
