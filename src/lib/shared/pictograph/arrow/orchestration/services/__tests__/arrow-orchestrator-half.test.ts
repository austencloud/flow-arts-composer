import { describe, it, expect, afterEach, vi } from "vitest";
import { setDefaultOverrideResolver } from "#lib/shared/pictograph/arrow/positioning/placement/services/arrow-placer.js";
import { calculateArrowPoint } from "#lib/shared/pictograph/arrow/orchestration/services/arrow-positioning-orchestrator.js";
import { calculateSegmentRotation } from "#lib/shared/pictograph/arrow/positioning/calculation/services/segment-rotation.js";
import { arrowLocationCalculator } from "#lib/shared/pictograph/arrow/positioning/calculation/services/arrow-location-calculator.js";
import { getInitialPosition } from "#lib/shared/pictograph/arrow/orchestration/services/arrow-grid-coordinator.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  MotionType,
  HandSide,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { ArrowPlacer } from "#lib/shared/pictograph/arrow/positioning/placement/services/arrow-placer.js";
import { SimpleJsonCache } from "#lib/shared/pictograph/shared/services/simple-json-cache.js";

vi.mock("#lib/shared/net/asset-fetch.js", () => ({
  assetFetch: vi.fn(async () =>
    new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  ),
}));

const HALF = { t0: 0, t1: 0.5 };

function segmentPictograph() {
  const motion = createMotionData({
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    startLocation: GridLocation.EAST,
    endLocation: GridLocation.SOUTHEAST,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.CLOCK,
    turns: 1,
    hand: HandSide.RIGHT,
    segment: HALF,
  });
  const picto = {
    letter: null,
    gridMode: motion.gridMode,
    motions: { right: motion, left: undefined },
  } as unknown as PictographData;
  return { picto, motion };
}

describe("orchestrator — segment frames bypass the letter-adjustment machinery", () => {
  it("positions a letterless half-frame with a {0,0} adjustment (no letter-A tiers)", async () => {
    const { picto, motion } = segmentPictograph();
    const [x, y, rotation] = await calculateArrowPoint(picto, motion);
    expect(rotation).toBeCloseTo(
      calculateSegmentRotation(
        Orientation.CLOCK,
        GridLocation.SOUTHEAST,
        GridLocation.EAST
      ),
      6
    );
    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(y)).toBe(true);
  });

  // Regression: the `_half` default-tier lookup replaced a hardcoded 0. The
  // real `_half` data files are empty today, so the JSON fetch in this unit
  // env fails -> {} -> {0,0}, same as the old hardcoded baseline. This proves
  // the lookup swap didn't change the final position.
  it("resolves an unauthored _half bucket to {0,0} — final position equals the unadjusted initial position", async () => {
    const { picto, motion } = segmentPictograph();
    const location = arrowLocationCalculator.calculateLocation(motion, picto);
    const initial = getInitialPosition(motion, location);
    const [x, y] = await calculateArrowPoint(picto, motion);
    expect(x).toBeCloseTo(initial.x, 6);
    expect(y).toBeCloseTo(initial.y, 6);
  });
});

describe("orchestrator — segment adjustments are GLYPH-LOCAL (rotate with the glyph)", () => {
  afterEach(() => setDefaultOverrideResolver(null));

  it("rotates an authored _half adjustment by the segment rotation before applying", async () => {
    // Inject a known glyph-local nudge via the default-override seam (the same
    // seam Firestore admin overrides use).
    setDefaultOverrideResolver((_g, motionType, placementKey, turns) =>
      motionType === "pro_half" && placementKey === "pro" && turns === "1"
        ? [10, 0]
        : null
    );
    const { picto, motion } = segmentPictograph();
    const location = arrowLocationCalculator.calculateLocation(motion, picto);
    const initial = getInitialPosition(motion, location);
    const [x, y, rotation] = await calculateArrowPoint(picto, motion);
    // PRO cw -> not mirrored; local (10, 0) rotated by R.
    const rad = (rotation * Math.PI) / 180;
    expect(x).toBeCloseTo(initial.x + 10 * Math.cos(rad), 6);
    expect(y).toBeCloseTo(initial.y + 10 * Math.sin(rad), 6);
  });
});

// The ArrowPlacer lookup is the load-bearing new code (the orchestrator swap
// is a thin call-site change around it). The orchestrator's singleton use of
// `arrowPlacer` isn't dependency-injected, so exercising the authored-data
// path end-to-end through the orchestrator would mean either refactoring it
// to accept an injected placer or fetch-mocking the global cache — both out
// of scope here. Testing ArrowPlacer directly with an injected fake cache
// (its constructor already supports this) proves the same lookup behavior.
describe("ArrowPlacer — _half default-tier lookup", () => {
  class FakeJsonCache extends SimpleJsonCache {
    constructor(private readonly filesByPath: Record<string, unknown>) {
      super();
    }
    override async get<T = unknown>(path: string): Promise<T> {
      if (path in this.filesByPath) return this.filesByPath[path] as T;
      // Mirrors the real cache's "missing file" outcome at the loader level —
      // loadPlacements() catches the throw and stores {} for that bucket.
      return {} as T;
    }
  }

  const PRO_HALF_PATH =
    "/data/arrow_placement/default/default_pro_half_placements.json";

  it("falls through to {0,0} when the _half bucket has no authored data (today's baseline)", async () => {
    const placer = new ArrowPlacer(new FakeJsonCache({}));
    const adjustment = await placer.getDefaultAdjustment(
      "pro_half",
      "pro",
      1,
      GridMode.DIAMOND
    );
    expect(adjustment).toEqual({ x: 0, y: 0 });
  });

  it("resolves an authored _half nudge from its own sibling bucket, keyed by the basic motion-type placement key", async () => {
    const placer = new ArrowPlacer(
      new FakeJsonCache({ [PRO_HALF_PATH]: { pro: { "1": [5, -3] } } })
    );
    const adjustment = await placer.getDefaultAdjustment(
      "pro_half",
      "pro",
      1,
      GridMode.DIAMOND
    );
    expect(adjustment).toEqual({ x: 5, y: -3 });
  });

  it("formats whole-number turns the same way as the letter tiers (1.0 -> '1' key)", async () => {
    const placer = new ArrowPlacer(
      new FakeJsonCache({ [PRO_HALF_PATH]: { pro: { "1": [5, -3] } } })
    );
    const adjustment = await placer.getDefaultAdjustment(
      "pro_half",
      "pro",
      1.0,
      GridMode.DIAMOND
    );
    expect(adjustment).toEqual({ x: 5, y: -3 });
  });
});
