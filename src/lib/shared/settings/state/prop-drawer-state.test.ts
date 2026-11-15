import { afterEach, describe, expect, it } from "vitest";
import { propDrawerState } from "./prop-drawer-state.svelte";

describe("propDrawerState.watching3D", () => {
  afterEach(() => {
    propDrawerState.watching3D = false;
  });

  it("starts false, can be set, and can be cleared", () => {
    expect(propDrawerState.watching3D).toBe(false);
    propDrawerState.watching3D = true;
    expect(propDrawerState.watching3D).toBe(true);
    propDrawerState.watching3D = false;
    expect(propDrawerState.watching3D).toBe(false);
  });
});
