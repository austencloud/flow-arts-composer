import { describe, it, expect } from "vitest";
import { buildStartEndOptions } from "../customize-start-end-options";
import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { StartEndOptions } from "$lib/shared/create/state/panel-coordination-state.svelte";
import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

const SNAPSHOT: StartEndOptions = {
  blockedStartPlacements: [],
  startPlacement: null,
  endPlacement: null,
  endPlacements: [],
  mustContainLetters: [],
  mustNotContainLetters: [],
  leftStartOrientation: Orientation.IN,
  rightStartOrientation: Orientation.IN,
};

// Mirror of the overlay's live local state.
interface Local {
  blockedStartPlacements: GridPlacement[];
  endPlacements: GridPlacement[];
  leftStartOrientation: Orientation;
  rightStartOrientation: Orientation;
}

function localFrom(base: StartEndOptions): Local {
  return {
    blockedStartPlacements: base.blockedStartPlacements,
    endPlacements: base.endPlacements,
    leftStartOrientation: base.leftStartOrientation ?? Orientation.IN,
    rightStartOrientation: base.rightStartOrientation ?? Orientation.IN,
  };
}

describe("buildStartEndOptions", () => {
  it("changing red orientation preserves a previously-changed blue orientation", () => {
    // The overlay opens with a frozen snapshot; `engine` simulates the engine's
    // full-REPLACE setOptions(). `local` is the overlay's live mirror.
    const snapshot = SNAPSHOT;
    const local = localFrom(snapshot);
    let engine: StartEndOptions = { ...snapshot };

    // User changes blue → OUT
    local.leftStartOrientation = Orientation.OUT;
    engine = buildStartEndOptions(snapshot, local);
    expect(engine.leftStartOrientation).toBe(Orientation.OUT);
    expect(engine.rightStartOrientation).toBe(Orientation.IN);

    // User then changes red → CLOCK. Blue MUST survive (the original bug reset
    // it because the handler spread the frozen IN/IN snapshot).
    local.rightStartOrientation = Orientation.CLOCK;
    engine = buildStartEndOptions(snapshot, local);
    expect(engine.leftStartOrientation).toBe(Orientation.OUT);
    expect(engine.rightStartOrientation).toBe(Orientation.CLOCK);
  });

  it("changing orientation preserves blocked start placements", () => {
    const snapshot = SNAPSHOT;
    const local = localFrom(snapshot);
    let engine: StartEndOptions;

    const blocked = ["alpha1", "beta3"] as unknown as GridPlacement[];
    local.blockedStartPlacements = blocked;
    engine = buildStartEndOptions(snapshot, local);
    expect(engine.blockedStartPlacements).toEqual(blocked);

    // Now change blue orientation — blocked placements must not revert to [].
    local.leftStartOrientation = Orientation.COUNTER;
    engine = buildStartEndOptions(snapshot, local);
    expect(engine.blockedStartPlacements).toEqual(blocked);
    expect(engine.leftStartOrientation).toBe(Orientation.COUNTER);
  });

  it("changing a placement preserves both start orientations", () => {
    const snapshot = SNAPSHOT;
    const local = localFrom(snapshot);
    let engine: StartEndOptions;

    local.leftStartOrientation = Orientation.OUT;
    local.rightStartOrientation = Orientation.COUNTER;
    buildStartEndOptions(snapshot, local);

    // User toggles a placement. Orientations must persist.
    local.blockedStartPlacements = ["gamma11"] as unknown as GridPlacement[];
    engine = buildStartEndOptions(snapshot, local);
    expect(engine.leftStartOrientation).toBe(Orientation.OUT);
    expect(engine.rightStartOrientation).toBe(Orientation.COUNTER);
    expect(engine.blockedStartPlacements).toEqual(["gamma11"]);
  });

  it("preserves unmanaged fields (must-contain letters) from the snapshot", () => {
    const snapshot: StartEndOptions = {
      ...SNAPSHOT,
      mustContainLetters: ["A"] as unknown as StartEndOptions["mustContainLetters"],
    };
    const local = localFrom(snapshot);
    local.leftStartOrientation = Orientation.CLOCK;
    const engine = buildStartEndOptions(snapshot, local);
    expect(engine.mustContainLetters).toEqual(snapshot.mustContainLetters);
  });

  it("always clears the deprecated startPlacement", () => {
    const snapshot: StartEndOptions = {
      ...SNAPSHOT,
      startPlacement: { letter: "A" } as unknown as PictographData,
    };
    const local = localFrom(snapshot);
    const engine = buildStartEndOptions(snapshot, local);
    expect(engine.startPlacement).toBeNull();
  });
});
