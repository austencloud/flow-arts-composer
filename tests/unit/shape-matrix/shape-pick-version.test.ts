/**
 * A "V2" pick in the Shape tab's prop picker has to end at Version 2.
 *
 * The picker writes the version through settings the moment the tile is
 * pressed, but the engine writes the prop pair only after its matrix load
 * lands, and a pair write that names no version resets Version 2 to
 * Version 1 (withPickVersion). So the version has to travel with the pair.
 * These tests run the real settings state, the real prop source and the real
 * app state together, with the load held open the way a real one is.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildFlowerAxis } from "#lib/shared/shape-matrix/domain/flower-signature.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

vi.mock("$app/env", () => ({
  browser: true,
  dev: true,
  building: false,
  version: "test",
}));
vi.mock("#lib/shared/auth/firebase.js", () => ({ auth: { currentUser: null } }));
vi.mock("#lib/shared/analytics/services/posthog-activity-logger.js", () => ({
  logSettingChange: vi.fn(),
}));

const { settingsService } = await import(
  "#lib/shared/settings/state/settings-state.svelte.js"
);
const { createShapeMatrixAppState } = await import(
  "#lib/shared/shape-matrix/app/state/shape-matrix-app-state.svelte.js"
);
const { createShapeEnginePropSource } = await import(
  "#lib/features/create/shape-engine/shape-engine-prop-source.js"
);

type PropPair = { left: PropType; right: PropType };

function createShapeTab() {
  const axis = buildFlowerAxis();
  const releases: Array<() => void> = [];
  const loadMatrix = vi.fn(
    (props: PropPair) =>
      new Promise((resolve) => {
        releases.push(() =>
          resolve({
            axis,
            left: new Map(),
            right: new Map(),
            props,
            tips: { left: { dx: 100, dy: 0 }, right: { dx: 100, dy: 0 } },
            reach: { left: 100, right: 100 },
            clubTipDx: 100,
          })
        );
      })
  );
  const propSource = createShapeEnginePropSource({
    getSettings: () => settingsService.settings,
    updateSettings: (patch) => settingsService.updateSettings(patch),
  });
  // The wiring ShapeMatrixApp.svelte does for a host with a prop source.
  const state = createShapeMatrixAppState(
    {
      loadMatrix: loadMatrix as never,
      syncState: () => {},
      onPropPairChange: (pair, catDog, look) =>
        propSource.set(
          look === undefined ? { ...pair, catDog } : { ...pair, catDog, look }
        ),
    },
    {
      surface: "matrix",
      theoryLeftRatio: { propRotations: 1, handCycles: 3 },
      theoryRightRatio: { propRotations: 1, handCycles: 3 },
      theoryMode: "SS",
      theoryPair: null,
      level: 2,
      leftTurn: 0,
      rightTurn: 0,
      activeAxis: "both",
      labelMode: "turns",
      leftPropType: propSource.left,
      rightPropType: propSource.right,
      pair: null,
      mode: null,
      propMode: null,
      solo: null,
    },
    false
  );
  const landLoad = () => {
    const release = releases.shift();
    if (!release) throw new Error("no pending load");
    release();
  };
  return { state, landLoad };
}

describe("a version-carrying pick in the Shape tab", () => {
  beforeEach(async () => {
    localStorage.clear();
    await settingsService.updateSettings({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.STAFF,
      catDogMode: false,
      propArtwork: "pictograph",
    });
  });

  it("ends at Version 2 once the late pair write lands", async () => {
    const { state, landLoad } = createShapeTab();
    const initial = state.load();
    landLoad();
    await initial;

    // The prop grid writes the version through settings as the tile is
    // pressed, then hands the pick to the host, whose load is still pending.
    await settingsService.updateSettings({ propArtwork: "model" });
    const pick = state.setPropType(PropType.CAPSULE_BATON, undefined, "model");
    expect(settingsService.settings.propArtwork).toBe("model");
    expect(settingsService.settings.leftPropType).toBe(PropType.STAFF);

    landLoad();
    await pick;
    await vi.waitFor(() => {
      expect(settingsService.settings).toMatchObject({
        leftPropType: PropType.CAPSULE_BATON,
        rightPropType: PropType.CAPSULE_BATON,
        propArtwork: "model",
      });
    });
  });

  it("still starts a pick that names no version at Version 1", async () => {
    const { state, landLoad } = createShapeTab();
    const initial = state.load();
    landLoad();
    await initial;
    await settingsService.updateSettings({ propArtwork: "model" });

    const pick = state.setPropType(PropType.CLUB);
    landLoad();
    await pick;
    await vi.waitFor(() => {
      expect(settingsService.settings).toMatchObject({
        leftPropType: PropType.CLUB,
        propArtwork: "pictograph",
      });
    });
  });
});
