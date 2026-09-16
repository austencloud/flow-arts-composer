/**
 * CellCacheKeyDeriver Tests
 *
 * Proves that the lsp8 composition refactor produces distinct cache keys
 * for scenarios that previously collided (causing wrong-prop blobs).
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("$lib/shared/application/state/app-state.svelte", () => ({
  getSettings: () => ({ leftPropType: "staff", rightPropType: "staff" }),
}));

import { deriveCacheKey } from "$lib/shared/sequence-viewer/services/cell-cache-key-deriver";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { PreviewCellRenderOptions } from "$lib/shared/sequence-viewer/services/preview-cell-renderer";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  MotionType,
  HandSide,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

// The class-with-injected-hasher collapsed into a standalone function
// (the hasher is now imported directly inside the module). Bind it to an
// object so the existing `deriver.deriveCacheKey(...)` call sites are unchanged.
const deriver = { deriveCacheKey };

function makeStartPlacement(overrides?: {
  leftPropType?: PropType;
  rightPropType?: PropType;
  leftStartLocation?: GridLocation;
  rightStartLocation?: GridLocation;
}): PictographData {
  return {
    id: "test-start",
    letter: null,
    gridMode: GridMode.DIAMOND,
    motions: {
      [HandSide.LEFT]: {
        motionType: MotionType.STATIC,
        startLocation: overrides?.leftStartLocation ?? GridLocation.NORTH,
        endLocation: overrides?.leftStartLocation ?? GridLocation.NORTH,
        startOrientation: "in",
        endOrientation: "in",
        rotationDirection: RotationDirection.NO_ROTATION,
        turns: 0,
        color: HandSide.LEFT,
        isVisible: true,
        propType: overrides?.leftPropType ?? PropType.STAFF,
        arrowLocation: overrides?.leftStartLocation ?? GridLocation.NORTH,
        gridMode: GridMode.DIAMOND,
      },
      [HandSide.RIGHT]: {
        motionType: MotionType.STATIC,
        startLocation: overrides?.rightStartLocation ?? GridLocation.SOUTH,
        endLocation: overrides?.rightStartLocation ?? GridLocation.SOUTH,
        startOrientation: "in",
        endOrientation: "in",
        rotationDirection: RotationDirection.NO_ROTATION,
        turns: 0,
        color: HandSide.RIGHT,
        isVisible: true,
        propType: overrides?.rightPropType ?? PropType.STAFF,
        arrowLocation: overrides?.rightStartLocation ?? GridLocation.SOUTH,
        gridMode: GridMode.DIAMOND,
      },
    },
  } as PictographData;
}

function makeOptions(
  overrides?: Partial<PreviewCellRenderOptions>
): PreviewCellRenderOptions {
  return {
    size: 240,
    leftPropType: PropType.STAFF,
    showStepNumbers: false,
    showNonRadialPoints: true,
    handPointVisibility: "all",
    showTKA: true,
    showReversals: true,
    ...overrides,
  };
}

function makeBoxBetaStep(
  leftStartLocation: GridLocation,
  rightStartLocation: GridLocation,
  endLocation: GridLocation
): PictographData {
  return {
    id: `beta-${leftStartLocation}-${endLocation}`,
    letter: "K",
    gridMode: GridMode.BOX,
    motions: {
      [HandSide.LEFT]: createMotionData({
        motionType: MotionType.ANTI,
        startLocation: leftStartLocation,
        endLocation,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.COUNTER,
        rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
        turns: 0.5,
        hand: HandSide.LEFT,
        gridMode: GridMode.BOX,
        propType: PropType.STAFF,
      }),
      [HandSide.RIGHT]: createMotionData({
        motionType: MotionType.FLOAT,
        startLocation: rightStartLocation,
        endLocation,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.COUNTER,
        rotationDirection: RotationDirection.NO_ROTATION,
        turns: 0,
        hand: HandSide.RIGHT,
        gridMode: GridMode.BOX,
        propType: PropType.STAFF,
      }),
    },
  };
}

function makeQuarterTurnPictograph(turns = 0.25): PictographData {
  const pictograph = makeBoxBetaStep(
    GridLocation.NORTHEAST,
    GridLocation.SOUTHWEST,
    GridLocation.SOUTHEAST
  );
  pictograph.motions.left.turns = turns;
  return pictograph;
}

describe("CellCacheKeyDeriver (lsp11/lsp12 composition)", () => {
  it("rekeys visible-motion cells after canonical hand arrows are restored", () => {
    const key = deriver.deriveCacheKey(
      makeStartPlacement(),
      undefined,
      false,
      makeOptions()
    );

    expect(key).toContain(
      '"arrowRenderRevision":"canonical-hand-arrows-v1"'
    );
  });

  it("preserves lsp11 keys for fully-visible pictographs", () => {
    const key = deriver.deriveCacheKey(
      makeStartPlacement(),
      undefined,
      false,
      makeOptions()
    );
    expect(key).toMatch(/^lsp11-/);
    expect(key).not.toContain("isVisible");
  });

  it("separates invisible placeholders from visible static motions", () => {
    const visible = makeStartPlacement();
    const hidden = makeStartPlacement();
    (hidden.motions.right as { isVisible: boolean }).isVisible = false;

    const visibleKey = deriver.deriveCacheKey(
      visible,
      undefined,
      false,
      makeOptions()
    );
    const hiddenKey = deriver.deriveCacheKey(
      hidden,
      undefined,
      false,
      makeOptions()
    );

    expect(visibleKey).toMatch(/^lsp11-/);
    expect(hiddenKey).toMatch(/^lsp12-/);
    expect(hiddenKey).toContain('"isVisible":true');
    expect(hiddenKey).toContain('"isVisible":false');
    expect(visibleKey).not.toBe(hiddenKey);
  });

  describe("targeted beta-offset geometry revision", () => {
    it.each([
      {
        step: 1,
        leftStart: GridLocation.SOUTHWEST,
        rightStart: GridLocation.NORTHEAST,
        end: GridLocation.NORTHWEST,
      },
      {
        step: 3,
        leftStart: GridLocation.NORTHWEST,
        rightStart: GridLocation.SOUTHEAST,
        end: GridLocation.NORTHEAST,
      },
    ])("rekeys supplied step $step", ({ leftStart, rightStart, end }) => {
      const key = deriver.deriveCacheKey(
        makeBoxBetaStep(leftStart, rightStart, end),
        undefined,
        false,
        makeOptions()
      );

      expect(key).toMatch(/^lsp11-/);
      expect(key).toContain('"propGeometryRevision":"beta-shift-map-v2"');
    });

    it("preserves the existing identity for an unaffected box shift", () => {
      const key = deriver.deriveCacheKey(
        makeBoxBetaStep(
          GridLocation.NORTHEAST,
          GridLocation.SOUTHWEST,
          GridLocation.SOUTHEAST
        ),
        undefined,
        false,
        makeOptions()
      );

      expect(key).toMatch(/^lsp11-/);
      expect(key).not.toContain("propGeometryRevision");
    });
  });

  describe("targeted quarter-turn glyph revision", () => {
    it("rekeys raster cells that display the 0.25 tuple glyph", () => {
      const key = deriver.deriveCacheKey(
        makeQuarterTurnPictograph(),
        undefined,
        false,
        makeOptions({ showTKA: true })
      );

      expect(key).toMatch(/^lsp11-/);
      expect(key).toContain('"turnGlyphRevision":"quarter-turn-glyph-v1"');
    });

    it.each([0.75, 1.25, 1.75, 2.25, 2.75])(
      "rekeys raster cells that display the completed %s tuple glyph",
      (turns) => {
        const key = deriver.deriveCacheKey(
          makeQuarterTurnPictograph(turns),
          undefined,
          false,
          makeOptions({ showTKA: true })
        );

        expect(key).toMatch(/^lsp11-/);
        expect(key).toContain('"turnGlyphRevision":"quarter-turn-glyph-v2"');
      }
    );

    it("preserves existing keys when the TKA tuple is hidden", () => {
      const key = deriver.deriveCacheKey(
        makeQuarterTurnPictograph(),
        undefined,
        false,
        makeOptions({ showTKA: false })
      );

      expect(key).toMatch(/^lsp11-/);
      expect(key).not.toContain("turnGlyphRevision");
    });

    it("preserves existing keys for non-quarter turns", () => {
      const key = deriver.deriveCacheKey(
        makeBoxBetaStep(
          GridLocation.NORTHEAST,
          GridLocation.SOUTHWEST,
          GridLocation.SOUTHEAST
        ),
        undefined,
        false,
        makeOptions({ showTKA: true })
      );

      expect(key).toMatch(/^lsp11-/);
      expect(key).not.toContain("turnGlyphRevision");
    });
  });

  describe("motion-intrinsic propType differentiation (the original bug)", () => {
    it("HAND vs STAFF motion propType produces different keys even with same settings propType", () => {
      const staffStart = makeStartPlacement({
        leftPropType: PropType.STAFF,
        rightPropType: PropType.STAFF,
      });
      const handStart = makeStartPlacement({
        leftPropType: PropType.HAND,
        rightPropType: PropType.HAND,
      });

      // Both rendered with the same settings prop type
      const options = makeOptions({ leftPropType: PropType.STAFF });

      const staffKey = deriver.deriveCacheKey(
        staffStart,
        undefined,
        false,
        options
      );
      const handKey = deriver.deriveCacheKey(
        handStart,
        undefined,
        false,
        options
      );

      expect(staffKey).not.toBe(handKey);
    });

    it("FAN vs STAFF motion propType produces different keys", () => {
      const staffStart = makeStartPlacement({
        leftPropType: PropType.STAFF,
        rightPropType: PropType.STAFF,
      });
      const fanStart = makeStartPlacement({
        leftPropType: PropType.FAN,
        rightPropType: PropType.FAN,
      });

      const options = makeOptions({ leftPropType: PropType.STAFF });

      const staffKey = deriver.deriveCacheKey(
        staffStart,
        undefined,
        false,
        options
      );
      const fanKey = deriver.deriveCacheKey(
        fanStart,
        undefined,
        false,
        options
      );

      expect(staffKey).not.toBe(fanKey);
    });
  });

  describe("targeted authored-prop appearance revision", () => {
    it("rekeys club rasters without invalidating staff rasters", () => {
      const data = makeStartPlacement();
      const clubKey = deriver.deriveCacheKey(
        data,
        undefined,
        true,
        makeOptions({ leftPropType: PropType.CLUB })
      );
      const staffKey = deriver.deriveCacheKey(
        data,
        undefined,
        true,
        makeOptions({ leftPropType: PropType.STAFF })
      );

      expect(clubKey).toContain('"propAppearanceRevision":"club-art-v2"');
      expect(staffKey).not.toContain("propAppearanceRevision");
    });

    it("rekeys a cat/dog cell when either effective prop uses the revised club art", () => {
      const key = deriver.deriveCacheKey(
        makeStartPlacement(),
        undefined,
        true,
        makeOptions({
          leftPropType: PropType.STAFF,
          rightPropType: PropType.CLUB,
          catDogModeEnabled: true,
        })
      );

      expect(key).toContain('"propAppearanceRevision":"club-art-v2"');
    });

    it("keeps Regular and Classic Club raster identities separate", () => {
      const regular = deriver.deriveCacheKey(
        makeStartPlacement(),
        undefined,
        true,
        makeOptions({ leftPropType: PropType.CLUB })
      );
      const classic = deriver.deriveCacheKey(
        makeStartPlacement(),
        undefined,
        true,
        makeOptions({ leftPropType: PropType.CLASSIC_CLUB })
      );

      expect(regular).not.toBe(classic);
      expect(classic).toContain('"leftPropType":"classic_club"');
    });
  });

  describe("handPathMode differentiation", () => {
    it("handPathMode on vs off produces different keys for same pictograph data", () => {
      const data = makeStartPlacement();
      const normalOptions = makeOptions({ handPathMode: false });
      const handPathOptions = makeOptions({ handPathMode: true });

      const normalKey = deriver.deriveCacheKey(
        data,
        undefined,
        false,
        normalOptions
      );
      const handPathKey = deriver.deriveCacheKey(
        data,
        undefined,
        false,
        handPathOptions
      );

      expect(normalKey).not.toBe(handPathKey);
    });
  });

  describe("handPointVisibility differentiation", () => {
    it("'all' vs 'active' produces different keys", () => {
      const data = makeStartPlacement();
      const allOptions = makeOptions({ handPointVisibility: "all" });
      const activeOptions = makeOptions({ handPointVisibility: "active" });

      const allKey = deriver.deriveCacheKey(data, undefined, false, allOptions);
      const activeKey = deriver.deriveCacheKey(
        data,
        undefined,
        false,
        activeOptions
      );

      expect(allKey).not.toBe(activeKey);
    });
  });

  describe("gridMode differentiation (previously missing entirely)", () => {
    it("diamond vs box mode produces different keys", () => {
      // Diamond mode: cardinal locations
      const diamondStart = makeStartPlacement({
        leftStartLocation: GridLocation.NORTH,
        rightStartLocation: GridLocation.SOUTH,
      });
      // Box mode: intercardinal locations
      const boxStart = makeStartPlacement({
        leftStartLocation: GridLocation.NORTHEAST,
        rightStartLocation: GridLocation.SOUTHWEST,
      });

      const options = makeOptions();

      const diamondKey = deriver.deriveCacheKey(
        diamondStart,
        undefined,
        false,
        options
      );
      const boxKey = deriver.deriveCacheKey(
        boxStart,
        undefined,
        false,
        options
      );

      expect(diamondKey).not.toBe(boxKey);
    });
  });

  describe("cell-specific dimensions still differentiate", () => {
    it("different sizes produce different keys", () => {
      const data = makeStartPlacement();
      const small = makeOptions({ size: 120 });
      const large = makeOptions({ size: 480 });

      const smallKey = deriver.deriveCacheKey(data, undefined, false, small);
      const largeKey = deriver.deriveCacheKey(data, undefined, false, large);

      expect(smallKey).not.toBe(largeKey);
    });

    it("different step numbers produce different keys when showStepNumbers is true", () => {
      const data = makeStartPlacement();
      const options = makeOptions({ showStepNumbers: true });

      const key1 = deriver.deriveCacheKey(data, 1, false, options);
      const key2 = deriver.deriveCacheKey(data, 2, false, options);

      expect(key1).not.toBe(key2);
    });

    it("dark vs light mode produces different keys", () => {
      const data = makeStartPlacement();
      const options = makeOptions();

      const darkKey = deriver.deriveCacheKey(data, undefined, true, options);
      const lightKey = deriver.deriveCacheKey(data, undefined, false, options);

      expect(darkKey).not.toBe(lightKey);
    });
  });

  describe("reversal flags differentiation (lsp11)", () => {
    it("blueReversal true vs false produces different keys when showReversals is on", () => {
      const plain = makeStartPlacement();
      const reversed = {
        ...makeStartPlacement(),
        leftReversal: true,
      } as PictographData;
      const options = makeOptions({ showReversals: true });

      const plainKey = deriver.deriveCacheKey(plain, undefined, false, options);
      const reversedKey = deriver.deriveCacheKey(
        reversed,
        undefined,
        false,
        options
      );

      expect(plainKey).not.toBe(reversedKey);
    });

    it("redReversal true vs false produces different keys when showReversals is on", () => {
      const plain = makeStartPlacement();
      const reversed = {
        ...makeStartPlacement(),
        rightReversal: true,
      } as PictographData;
      const options = makeOptions({ showReversals: true });

      const plainKey = deriver.deriveCacheKey(plain, undefined, false, options);
      const reversedKey = deriver.deriveCacheKey(
        reversed,
        undefined,
        false,
        options
      );

      expect(plainKey).not.toBe(reversedKey);
    });

    it("reversal flags are neutralized when showReversals is off (no pointless cache split)", () => {
      const plain = makeStartPlacement();
      const reversed = {
        ...makeStartPlacement(),
        leftReversal: true,
        rightReversal: true,
      } as PictographData;
      const options = makeOptions({ showReversals: false });

      const plainKey = deriver.deriveCacheKey(plain, undefined, false, options);
      const reversedKey = deriver.deriveCacheKey(
        reversed,
        undefined,
        false,
        options
      );

      expect(plainKey).toBe(reversedKey);
    });
  });

  describe("betaSwapped differentiation (lsp11)", () => {
    it("betaSwapped true vs false produces different keys", () => {
      const plain = makeStartPlacement();
      const swapped = {
        ...makeStartPlacement(),
        betaSwapped: true,
      } as PictographData;
      const options = makeOptions();

      const plainKey = deriver.deriveCacheKey(plain, undefined, false, options);
      const swappedKey = deriver.deriveCacheKey(
        swapped,
        undefined,
        false,
        options
      );

      expect(plainKey).not.toBe(swappedKey);
    });
  });

  describe("identical inputs produce identical keys (determinism)", () => {
    it("same data and options always produce the same key", () => {
      const data = makeStartPlacement();
      const options = makeOptions();

      const key1 = deriver.deriveCacheKey(data, undefined, false, options);
      const key2 = deriver.deriveCacheKey(data, undefined, false, options);

      expect(key1).toBe(key2);
    });
  });
});
