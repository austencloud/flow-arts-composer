/**
 * Card pictures must place arrows where the live pictograph does.
 *
 * Browse card pictures, exports and print cards are drawn by the canvas
 * composition path (main thread, or a worker seeded with a placement
 * snapshot). The live SVG pictograph re-prepares when the placement stores
 * finish loading; a drawn picture never does, and it is cached and uploaded.
 * A card drawn before the stores loaded put a pro and an anti arrow at their
 * default spots on top of each other, where the live pictograph used their
 * special placement.
 *
 * Positions, not pixels: each path resolves the arrows with the real
 * ArrowAdjustmentCalculator reading the override seam at the moment it draws.
 * Only the firebase-bound store singletons are faked; their initialize() holds
 * until the test lets the store "finish downloading", exactly the window the
 * Browse grid draws in on a cold visit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  docs: [] as unknown[],
  loaded: false,
  release: null as (() => void) | null,
  gate: null as Promise<void> | null,
}));

vi.mock("firebase/firestore", () => ({ collection: vi.fn(), doc: vi.fn() }));

vi.mock(
  "#lib/shared/pictograph/arrow/positioning/special-override/services/special-override-singleton.js",
  async () => {
    const { createSpecialArrowPlacementState } = await import(
      "#lib/shared/pictograph/arrow/positioning/special-override/state/special-arrow-placement-state.svelte.js"
    );
    const { setSpecialOverrideResolver } = await import(
      "#lib/shared/pictograph/arrow/positioning/placement/services/override-resolvers.js"
    );
    const state = createSpecialArrowPlacementState();
    return {
      getSpecialOverrideRepository: () =>
        store.loaded ? { getAll: () => state.getAllOverrides() } : null,
      // Mirrors doInitialize: download, load the state, register the resolver.
      initializeSpecialOverrides: async () => {
        await store.gate;
        state.loadAll(store.docs as never);
        store.loaded = true;
        setSpecialOverrideResolver({
          getOverride: (k) => state.getOverride(k),
          getFullOverride: (k) => state.getFullOverride(k),
        });
      },
    };
  }
);
vi.mock(
  "#lib/shared/pictograph/arrow/positioning/global/services/global-adjustment-singleton.js",
  () => ({
    getGlobalAdjustmentRepository: () => null,
    initializeGlobalAdjustments: async () => {},
    isGlobalReadDisabled: () => false,
    setGlobalReadDisabled: () => {},
  })
);
vi.mock(
  "#lib/shared/pictograph/arrow/positioning/default-override/services/default-override-singleton.js",
  () => ({
    getDefaultOverrideRepository: () => null,
    initializeDefaultOverrides: async () => {},
  })
);
vi.mock(
  "#lib/shared/pictograph/arrow/positioning/prop-geometry/services/prop-geometry-singleton.js",
  () => ({
    getPropGeometryRepository: () => null,
    initializePropGeometryAdjustments: async () => {},
  })
);

// The real preparer's dependency chain is unavailable here, so the card path's
// preparer resolves each arrow with the same calculator the live path uses.
const positionArrows = vi.hoisted(() => ({
  fn: null as null | ((p: unknown) => Promise<unknown>),
}));
vi.mock("#lib/shared/pictograph/shared/services/pictograph-preparer.js", () => ({
  pictographPreparer: {
    prepareSingle: async (p: unknown) => ({
      _prepared: await positionArrows.fn!(p),
    }),
  },
}));

import { ArrowAdjustmentCalculator } from "#lib/shared/pictograph/arrow/positioning/calculation/services/arrow-adjustment-calculator.js";
import { arrowLocationCalculator } from "#lib/shared/pictograph/arrow/positioning/calculation/services/arrow-location-calculator.js";
import {
  setGlobalAdjustmentResolver,
  setPropGeometryResolver,
  setSpecialOverrideResolver,
} from "#lib/shared/pictograph/arrow/positioning/placement/services/override-resolvers.js";
import { computeSpecialOverrideKey } from "#lib/shared/pictograph/arrow/positioning/special-override/services/special-override-key.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { ImageComposer } from "#lib/shared/render/services/image-composer.js";
import { seedOverrideResolvers } from "#lib/shared/render/services/seed-override-resolvers.js";
import { whenArrowPlacementDataReady } from "#lib/shared/pictograph/arrow/positioning/placement/services/initialize-arrow-placement-data.js";

const DEFAULT_VALUE = { x: 0, y: -50 };
// The authored special spots that keep the two arrows apart.
const SPECIAL = { left: { x: 40, y: -20 }, right: { x: -35, y: 25 } };

/** Letter C: blue pro, red anti, both from south to west. */
function proAntiPictograph(): PictographData {
  const left = createMotionData({
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    startLocation: GridLocation.SOUTH,
    endLocation: GridLocation.WEST,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    turns: 0,
    hand: HandSide.LEFT,
  });
  const right = createMotionData({
    motionType: MotionType.ANTI,
    rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
    startLocation: GridLocation.SOUTH,
    endLocation: GridLocation.WEST,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.OUT,
    turns: 0,
    hand: HandSide.RIGHT,
  });
  return {
    letter: "C",
    placementFrame: right.placementFrame,
    motions: { left, right },
  } as unknown as PictographData;
}

function specialDoc(picto: PictographData, hand: HandSide) {
  const motion = picto.motions[hand]!;
  const value = SPECIAL[hand as "left" | "right"];
  return {
    key: computeSpecialOverrideKey(picto, motion, hand),
    placementFrame: "canonical",
    oriFolder: "from_layer1",
    letter: "C",
    turnsTuple: "(0, 0)",
    motionType: motion.motionType,
    attributeKey: hand,
    propType: "staff",
    adjustmentX: value.x,
    adjustmentY: value.y,
    originalX: 0,
    originalY: 0,
    suppressed: false,
    updatedAt: undefined as never,
    updatedBy: "test",
  };
}

/** No static special entry: the special spots exist only in the store. */
function calculator() {
  return new ArrowAdjustmentCalculator(
    {
      getSpecialJsonAdjustmentOnly: async () => null,
      getSpecialAdjustment: async () => null,
    } as never,
    {
      getAvailablePlacementKeys: async () => ["pro", "anti"],
      getDefaultAdjustment: async () => DEFAULT_VALUE,
    } as never,
    { processDirectionalTuples: (p: { x: number; y: number }) => p } as never
  );
}

async function resolvePositions(p: unknown) {
  const picto = p as PictographData;
  const out: Record<string, { x: number; y: number }> = {};
  for (const hand of [HandSide.LEFT, HandSide.RIGHT]) {
    const motion = picto.motions[hand]!;
    const r = await calculator().calculateAdjustmentResult(
      picto,
      motion,
      "C",
      arrowLocationCalculator.calculateLocation(motion, picto),
      hand
    );
    out[hand] = { x: r.x, y: r.y };
  }
  return out;
}

function storeStillDownloading() {
  store.loaded = false;
  store.gate = new Promise<void>((r) => (store.release = r));
}

function clearSeam() {
  setSpecialOverrideResolver(null);
  setGlobalAdjustmentResolver(null);
  setPropGeometryResolver(null);
}

beforeEach(() => {
  clearSeam();
  const picto = proAntiPictograph();
  store.docs = [
    specialDoc(picto, HandSide.LEFT),
    specialDoc(picto, HandSide.RIGHT),
  ];
  positionArrows.fn = resolvePositions;
});
afterEach(clearSeam);

describe("card picture arrow placement waits for the placement stores", () => {
  // Order matters: whenArrowPlacementDataReady settles once per session, so the
  // cold-visit case runs first, then the live reference once the stores are in.
  it("main-thread card path resolves the live positions when drawn before the stores load", async () => {
    storeStillDownloading();
    const composer = new ImageComposer(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );
    // As getImageComposer() wires the app's main-thread composer.
    composer.setPlacementReadiness?.(whenArrowPlacementDataReady);

    const drawing = (
      composer as unknown as {
        prepareForRaster: (
          p: PictographData,
          v: object
        ) => Promise<{ _prepared: Record<string, unknown> }>;
      }
    ).prepareForRaster(proAntiPictograph(), {});
    await new Promise((r) => setTimeout(r, 0));
    store.release!();
    const card = (await drawing)._prepared;

    // Live pictograph: prepares (again) once the stores have loaded.
    const live = await resolvePositions(proAntiPictograph());
    expect(live).toEqual(SPECIAL);
    expect(card).toEqual(live);
    expect(card.left).not.toEqual(DEFAULT_VALUE);
  });

  it("worker seed snapshot requested before the stores load carries the special placements", async () => {
    // A fresh session: readiness settles once per page load, so reload the
    // modules and start with the store mid-download, as a Browse prewarm does.
    vi.resetModules();
    storeStillDownloading();
    const fresh = await import(
      "#lib/shared/render/services/override-placement-bundle.js"
    );
    const requested = fresh.loadOverridePlacementBundle();
    await new Promise((r) => setTimeout(r, 0));
    store.release!();
    const bundle = await requested;
    expect(bundle.special).toHaveLength(2);

    clearSeam();
    seedOverrideResolvers(bundle);
    const worker = await resolvePositions(proAntiPictograph());
    expect(worker).toEqual(SPECIAL);
  });
});
