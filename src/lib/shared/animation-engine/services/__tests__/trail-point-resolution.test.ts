import { afterEach, describe, expect, it } from "vitest";
import {
  getDefaultTrailPointConfig,
  resolveTrailPointConfig,
  setTrailPointOverrideProvider,
} from "../../domain/types/trail-point-types";
import {
  BUUGENG_TIP_POINTS,
  getTipPoints,
} from "../../domain/types/prop-tip-points";
import {
  calculateTrailSourceEndpoint,
  type PropEndpointConfig,
} from "../prop-position-calculator";
import { TrailCapturer } from "../trail-capturer";
import {
  DEFAULT_TRAIL_SETTINGS,
  TrackingMode,
} from "../../domain/types/trail-types";
import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";

afterEach(() => {
  setTrailPointOverrideProvider(null);
});

describe("canonical trail point resolution", () => {
  it("anchors the fan's five effect points to its rendered SVG boundary", () => {
    // The animation canvas draws the pictograph family now, so the ribs sit on
    // that artwork's boundary — outer rib on the club's reach.
    expect(getTipPoints("fan").points).toEqual([
      { dx: 72.8, dy: -102.03 },
      { dx: 99.67, dy: -57.93 },
      { dx: 130, dy: 0 },
      { dx: 99.67, dy: 57.93 },
      { dx: 72.8, dy: 102.03 },
    ]);
  });

  it("uses the fan's center rib instead of an arbitrary edge rib", () => {
    expect(getDefaultTrailPointConfig("fan")).toEqual({
      left: { type: "tip", index: 2 },
      right: { type: "tip", index: 2 },
    });
  });

  it("anchors both buugeng trails to the pictograph SVG terminals", () => {
    expect(getTipPoints("buugeng").points).toEqual(BUUGENG_TIP_POINTS.points);
    // Bigbuugeng's terminals are tapers, not buugeng's rounded caps, and its
    // S-curve is steep enough that an on-axis pair falls off the artwork
    // entirely. These sit inside the taper at radius 295, point-symmetric.
    expect(getTipPoints("bigbuugeng").points).toEqual([
      { dx: 294.28, dy: 20.58 },
      { dx: -294.28, dy: -20.58 },
    ]);
  });

  it("tracks both buugeng terminals instead of its former diagonal interior points", () => {
    expect(getDefaultTrailPointConfig("buugeng")).toEqual({
      left: { type: "tip", index: 0 },
      right: { type: "tip", index: 1 },
    });
  });

  it("preserves both ordered endpoints for genuinely two-ended props", () => {
    expect(getDefaultTrailPointConfig("staff")).toEqual({
      left: { type: "tip", index: 0 },
      right: { type: "tip", index: 1 },
    });
  });

  it("keeps an explicit lab assignment authoritative", () => {
    setTrailPointOverrideProvider((propType) =>
      propType === "fan"
        ? {
            left: { type: "tip", index: 4 },
            right: { type: "tip", index: 4 },
          }
        : null
    );

    expect(resolveTrailPointConfig("FAN")).toEqual({
      left: { type: "tip", index: 4 },
      right: { type: "tip", index: 4 },
    });
  });

  it("does not let a legacy center-only assignment hijack prop-end tracking", () => {
    setTrailPointOverrideProvider(() => ({
      left: { type: "custom", dx: 0, dy: 0 },
      right: { type: "custom", dx: 0, dy: 0 },
    }));

    expect(resolveTrailPointConfig("staff", TrackingMode.RIGHT_END)).toEqual({
      left: { type: "tip", index: 0 },
      right: { type: "tip", index: 1 },
    });
  });

  it("keeps non-center custom assignments authoritative", () => {
    setTrailPointOverrideProvider(() => ({
      left: { type: "custom", dx: -140, dy: 5 },
      right: { type: "custom", dx: 140, dy: -5 },
    }));

    expect(resolveTrailPointConfig("staff", TrackingMode.RIGHT_END)).toEqual({
      left: { type: "custom", dx: -140, dy: 5 },
      right: { type: "custom", dx: 140, dy: -5 },
    });
  });

  it("resolves HAND mode to a single prop-center source for any prop", () => {
    const handConfig = {
      left: { type: "none" },
      right: { type: "custom", dx: 0, dy: 0 },
    };
    expect(resolveTrailPointConfig("staff", TrackingMode.HAND)).toEqual(
      handConfig
    );
    expect(resolveTrailPointConfig("fan", TrackingMode.HAND)).toEqual(
      handConfig
    );
    expect(resolveTrailPointConfig("club", TrackingMode.HAND)).toEqual(
      handConfig
    );
  });

  it("lets HAND override even an explicit lab tip assignment", () => {
    setTrailPointOverrideProvider(() => ({
      left: { type: "tip", index: 4 },
      right: { type: "tip", index: 4 },
    }));

    expect(resolveTrailPointConfig("fan", TrackingMode.HAND)).toEqual({
      left: { type: "none" },
      right: { type: "custom", dx: 0, dy: 0 },
    });
  });
});

describe("trail source world-space calculation", () => {
  const endpointConfig: PropEndpointConfig = {
    canvasSize: 950,
    propDimensions: { width: 252.8, height: 77.8 },
  };
  const centeredQuarterTurn: PropState = {
    x: 0,
    y: 0,
    centerPathAngle: 0,
    staffRotationAngle: Math.PI / 2,
  };

  it("rotates the canonical fan endpoint with the prop", () => {
    const config = resolveTrailPointConfig("fan");
    const endpoint = calculateTrailSourceEndpoint(
      centeredQuarterTurn,
      endpointConfig,
      config.right,
      "fan"
    );

    expect(endpoint).toEqual({ x: 475, y: 605, tipIndex: 2 });
  });

  it("rotates both buugeng sources from the prop's true terminal radius", () => {
    const config = resolveTrailPointConfig("buugeng");
    const first = calculateTrailSourceEndpoint(
      centeredQuarterTurn,
      endpointConfig,
      config.left,
      "buugeng"
    );
    const second = calculateTrailSourceEndpoint(
      centeredQuarterTurn,
      endpointConfig,
      config.right,
      "buugeng"
    );

    const [firstTip, secondTip] = BUUGENG_TIP_POINTS.points;
    if (!firstTip || !secondTip) {
      throw new Error("buugeng should declare at least two tip points");
    }
    expect(first?.x).toBeCloseTo(475 - firstTip.dy, 10);
    expect(first?.y).toBeCloseTo(475 + firstTip.dx, 10);
    expect(first?.tipIndex).toBe(0);
    expect(second?.x).toBeCloseTo(475 - secondTip.dy, 10);
    expect(second?.y).toBeCloseTo(475 + secondTip.dx, 10);
    expect(second?.tipIndex).toBe(1);
  });

  it("rotates custom offsets instead of treating them as canvas-space offsets", () => {
    const endpoint = calculateTrailSourceEndpoint(
      centeredQuarterTurn,
      endpointConfig,
      { type: "custom", dx: 40, dy: 10 },
      "fan"
    );

    expect(endpoint?.x).toBeCloseTo(465, 8);
    expect(endpoint?.y).toBeCloseTo(515, 8);
    expect(endpoint?.tipIndex).toBeNull();
  });

  it("does not invent a point for a disabled trail source", () => {
    expect(
      calculateTrailSourceEndpoint(
        centeredQuarterTurn,
        endpointConfig,
        { type: "none" },
        "fan"
      )
    ).toBeNull();
  });

  it("places the HAND source at the prop center regardless of rotation", () => {
    // custom {0,0} = prop center = hand path. A centered prop sits at the
    // canvas center (475,475 at canvasSize 950), independent of rotation.
    const handSource = resolveTrailPointConfig(
      "staff",
      TrackingMode.HAND
    ).right;
    const endpoint = calculateTrailSourceEndpoint(
      centeredQuarterTurn,
      endpointConfig,
      handSource,
      "staff"
    );
    expect(endpoint?.x).toBeCloseTo(475, 8);
    expect(endpoint?.y).toBeCloseTo(475, 8);
    expect(endpoint?.tipIndex).toBeNull();
  });
});

describe("legacy trail capture endpoint parity", () => {
  it("captures the same single fan center source as the overlay renderers", () => {
    const capturer = new TrailCapturer();
    capturer.initialize({
      canvasSize: 500,
      leftPropDimensions: { width: 252.8, height: 77.8 },
      rightPropDimensions: { width: 252.8, height: 77.8 },
      leftPropType: "fan",
      trailSettings: {
        ...DEFAULT_TRAIL_SETTINGS,
        trackingMode: TrackingMode.BOTH_ENDS,
      },
    });

    const initialProp: PropState = {
      x: 0,
      y: 0,
      centerPathAngle: 0,
      staffRotationAngle: 0,
    };
    const movedProp: PropState = { ...initialProp, x: 0.1 };
    capturer.captureFrame({ leftProp: initialProp, rightProp: null }, 0, 1000);
    capturer.captureFrame({ leftProp: movedProp, rightProp: null }, 0.1, 1600);

    const points = capturer.getAllTrailPoints().left;
    const expected = calculateTrailSourceEndpoint(
      movedProp,
      {
        canvasSize: 500,
        propDimensions: { width: 252.8, height: 77.8 },
      },
      resolveTrailPointConfig("fan").right,
      "fan"
    );

    expect(points).toHaveLength(1);
    expect(points[0]?.tipIndex).toBe(2);
    expect(points[0]?.x).toBeCloseTo(expected!.x, 8);
    expect(points[0]?.y).toBeCloseTo(expected!.y, 8);
  });

  it("captures a single hand-path point for a two-ended prop in HAND mode", () => {
    const capturer = new TrailCapturer();
    capturer.initialize({
      canvasSize: 500,
      leftPropDimensions: { width: 252.8, height: 77.8 },
      rightPropDimensions: { width: 252.8, height: 77.8 },
      leftPropType: "staff",
      trailSettings: {
        ...DEFAULT_TRAIL_SETTINGS,
        trackingMode: TrackingMode.HAND,
      },
    });

    const initialProp: PropState = {
      x: 0,
      y: 0,
      centerPathAngle: 0,
      staffRotationAngle: 0,
    };
    const movedProp: PropState = { ...initialProp, x: 0.1 };
    capturer.captureFrame({ leftProp: initialProp, rightProp: null }, 0, 1000);
    capturer.captureFrame({ leftProp: movedProp, rightProp: null }, 0.1, 1600);

    const points = capturer.getAllTrailPoints().left;
    // staff is two-ended, but HAND collapses to one prop-center source.
    const expected = calculateTrailSourceEndpoint(
      movedProp,
      { canvasSize: 500, propDimensions: { width: 252.8, height: 77.8 } },
      resolveTrailPointConfig("staff", TrackingMode.HAND).right,
      "staff"
    );

    expect(points).toHaveLength(1);
    expect(points[0]?.x).toBeCloseTo(expected!.x, 8);
    expect(points[0]?.y).toBeCloseTo(expected!.y, 8);
  });

  it("does not record Tunnel formation travel and resumes from a fresh path", () => {
    const capturer = new TrailCapturer();
    capturer.initialize({
      canvasSize: 500,
      leftPropDimensions: { width: 252.8, height: 77.8 },
      rightPropDimensions: { width: 252.8, height: 77.8 },
      leftPropType: "staff",
      trailSettings: {
        ...DEFAULT_TRAIL_SETTINGS,
        trackingMode: TrackingMode.BOTH_ENDS,
      },
    });
    const prop = (x: number): PropState => ({
      x,
      y: 0,
      centerPathAngle: 0,
      staffRotationAngle: 0,
    });
    const frame = (x: number, time: number, trailCaptureSuppressed = false) =>
      capturer.captureFrame(
        {
          leftProp: null,
          rightProp: null,
          additionalLayers: [
            {
              leftProp: prop(x),
              rightProp: null,
              trailCaptureSuppressed,
              formationTransitionActive: trailCaptureSuppressed,
            },
          ],
        },
        x,
        time
      );

    frame(0, 1000);
    frame(0.1, 1600);
    expect(capturer.getAllTrailPoints().additionalLayers[0]?.left.length).toBe(
      2
    );

    frame(0.3, 1700, true);
    frame(0.5, 1800, true);
    expect(capturer.getAllTrailPoints().additionalLayers[0]?.left).toEqual([]);

    frame(0.5, 1900);
    expect(capturer.getAllTrailPoints().additionalLayers[0]?.left).toHaveLength(
      2
    );
  });
});
