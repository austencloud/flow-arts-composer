import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { createViewer3DStateForTest } from "./viewer3d-test-helpers.svelte";
import { __resetWebGL2CapabilityForTests } from "#lib/shared/3d/capabilities/webgl-capabilities.js";
import { userProportionsState, inchesToCm } from "@austencloud/scene-3d";

beforeAll(() => {
  const originalCreateElement = document.createElement as unknown as (tag: string) => unknown;
  (document as unknown as { createElement: (tag: string) => unknown }).createElement = (tag: string) => {
    const base = originalCreateElement(tag) as Record<string, unknown>;
    if (tag === "canvas") {
      base.getContext = () => null;
    }
    return base;
  };
  __resetWebGL2CapabilityForTests();
});

const cleanups: Array<() => void> = [];
function makeState() {
  const { state, dispose } = createViewer3DStateForTest({});
  cleanups.push(dispose);
  state.performerManager.initialize();
  return state;
}
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe("prop size link mode", () => {
  it("defaults to linked", () => {
    const state = makeState();
    expect(state.propSizeLinked).toBe(true);
  });

  it("togglePropSizeLink switches to unlinked and stamps current global onto performers", () => {
    const state = makeState();
    state.performerManager.addPerformer();
    userProportionsState.setStaffLengthCm(inchesToCm(40));

    state.togglePropSizeLink();

    expect(state.propSizeLinked).toBe(false);
    const p0 = state.performerManager.performers[0];
    const p1 = state.performerManager.performers[1];
    expect(p0.settings.staffLengthCm).toBe(inchesToCm(40));
    expect(p1.settings.staffLengthCm).toBe(inchesToCm(40));
  });

  it("togglePropSizeLink back to linked clears per-performer values and syncs global", () => {
    const state = makeState();
    state.performerManager.addPerformer();
    const p1 = state.performerManager.performers[1];
    p1.setStaffLengthCm(inchesToCm(50));

    state.togglePropSizeLink(); // linked → unlinked (stamps global)
    state.selectPerformerScope(1);
    state.togglePropSizeLink(); // unlinked → linked (syncs to selected)

    expect(state.propSizeLinked).toBe(true);
    expect(state.performerManager.performers[0].settings.staffLengthCm).toBeNull();
    expect(state.performerManager.performers[1].settings.staffLengthCm).toBeNull();
    expect(userProportionsState.staffLengthCm).toBe(inchesToCm(50));
  });
});
