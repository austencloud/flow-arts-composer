import { afterEach, describe, expect, it } from "vitest";
import { SceneEnvironmentId } from "#lib/shared/3d/environments/domain/scene-environment.js";
import { createViewer3DStateForTest } from "./viewer3d-test-helpers.svelte";

const STORAGE_KEY = "tka-viewer3d-environment";
const disposals: Array<() => void> = [];

afterEach(() => {
  while (disposals.length) disposals.pop()!();
  localStorage.removeItem(STORAGE_KEY);
});

function createPersistentViewer(firstUseEnvironment: SceneEnvironmentId) {
  const { state, dispose } = createViewer3DStateForTest({
    firstUseEnvironment,
    persistent: true,
  });
  disposals.push(dispose);
  return state;
}

describe("persistent 3D environment", () => {
  it("uses the paired 2D look once, then persists independently", () => {
    const first = createPersistentViewer(SceneEnvironmentId.BLOSSOM);
    expect(first.environmentId).toBe(SceneEnvironmentId.BLOSSOM);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(SceneEnvironmentId.BLOSSOM);

    first.setEnvironmentId(SceneEnvironmentId.OCEAN);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(SceneEnvironmentId.OCEAN);

    const reopened = createPersistentViewer(SceneEnvironmentId.FOREST);
    expect(reopened.environmentId).toBe(SceneEnvironmentId.OCEAN);
  });
});
