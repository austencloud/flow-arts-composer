import { describe, expect, it } from "vitest";
import {
  FLOW_FEST_GNSS_CLOCK_SKEW_TOLERANCE_MILLISECONDS,
  FLOW_FEST_GNSS_MAX_ACCURACY_METERS,
  auditFlowFestGnssRoundTrip,
  createFlowFestGnssReplayTrack,
  evaluateFlowFestGnssFix,
  flowFestWgs84ToWorld,
  flowFestWorldToWgs84,
  type FlowFestFieldReference,
} from "#lib/features/flow-fest-sim/domain/flow-fest-field-positioning.js";

const REFERENCE: FlowFestFieldReference = {
  projectedCrsCode: 26916,
  originEastingMeters: 690_142,
  originNorthingMeters: 4_384_552,
  boundsWorldMeters: {
    minX: -512,
    maxX: 512,
    minZ: -512,
    maxZ: 512,
  },
};

describe("Flow Fest field positioning", () => {
  it("places the checked manifest origin at local world zero", () => {
    const world = flowFestWgs84ToWorld(REFERENCE, {
      latitude: 39.589613265369856,
      longitude: -84.78576527257212,
    });
    expect(world.x).toBeCloseTo(0, 3);
    expect(world.z).toBeCloseTo(0, 3);
  });

  it("round-trips registered site positions below a millimetre", () => {
    const points = [
      { x: 340, z: -20 },
      { x: 286.9, z: -129.9 },
      { x: 99.2, z: -113.4 },
      { x: -130, z: -15 },
      { x: -61.3, z: -73.8 },
    ];
    const audit = auditFlowFestGnssRoundTrip(REFERENCE, points);
    expect(audit.samples).toBe(points.length);
    expect(audit.maximumErrorMeters).toBeLessThan(0.001);
    for (const point of points) {
      const geographic = flowFestWorldToWgs84(REFERENCE, point);
      const world = flowFestWgs84ToWorld(REFERENCE, geographic);
      expect(world.x).toBeCloseTo(point.x, 3);
      expect(world.z).toBeCloseTo(point.z, 3);
    }
  });

  it("creates a source-order replay without duplicate adjacent fixes", () => {
    const track = createFlowFestGnssReplayTrack(REFERENCE, [
      { x: 340, z: -20 },
      { x: 340, z: -20 },
      { x: 300, z: -40 },
    ]);
    expect(track).toHaveLength(2);
    expect(track.map((sample) => sample.elapsedMilliseconds)).toEqual([0, 450]);
    expect(flowFestWgs84ToWorld(REFERENCE, track[1]).x).toBeCloseTo(300, 3);
  });

  it("accepts current in-bounds fixes and holds inaccurate ones", () => {
    const point = flowFestWorldToWgs84(REFERENCE, { x: 100, z: -115 });
    const now = 10_000;
    const accepted = evaluateFlowFestGnssFix(
      REFERENCE,
      {
        ...point,
        accuracyMeters: FLOW_FEST_GNSS_MAX_ACCURACY_METERS,
        timestampMilliseconds: now,
        headingDegrees: null,
        speedMetersPerSecond: null,
      },
      now
    );
    const held = evaluateFlowFestGnssFix(
      REFERENCE,
      {
        ...point,
        accuracyMeters: 45,
        timestampMilliseconds: now,
        headingDegrees: null,
        speedMetersPerSecond: null,
      },
      now
    );
    expect(accepted).toMatchObject({ quality: "nominal", accepted: true });
    expect(held).toMatchObject({
      quality: "degraded-accuracy",
      accepted: false,
    });
  });

  it("holds stale and outside-site fixes without moving the player", () => {
    const site = flowFestWorldToWgs84(REFERENCE, { x: 100, z: -115 });
    const outside = flowFestWorldToWgs84(REFERENCE, { x: 900, z: 900 });
    const base = {
      accuracyMeters: 4,
      headingDegrees: null,
      speedMetersPerSecond: null,
    };
    expect(
      evaluateFlowFestGnssFix(
        REFERENCE,
        { ...site, ...base, timestampMilliseconds: 0 },
        30_000
      )
    ).toMatchObject({ quality: "degraded-stale", accepted: false });
    expect(
      evaluateFlowFestGnssFix(
        REFERENCE,
        { ...outside, ...base, timestampMilliseconds: 30_000 },
        30_000
      )
    ).toMatchObject({ quality: "outside-site", accepted: false });
  });

  it("treats a fix with a future timestamp beyond the clock-skew tolerance as stale, not perfectly fresh", () => {
    const site = flowFestWorldToWgs84(REFERENCE, { x: 100, z: -115 });
    const now = 10_000;
    const evaluation = evaluateFlowFestGnssFix(
      REFERENCE,
      {
        ...site,
        accuracyMeters: 4,
        timestampMilliseconds:
          now + FLOW_FEST_GNSS_CLOCK_SKEW_TOLERANCE_MILLISECONDS + 1,
        headingDegrees: null,
        speedMetersPerSecond: null,
      },
      now
    );
    expect(evaluation).toMatchObject({
      quality: "degraded-stale",
      accepted: false,
    });
  });

  it("still accepts a fix within the small clock-skew tolerance", () => {
    const site = flowFestWorldToWgs84(REFERENCE, { x: 100, z: -115 });
    const now = 10_000;
    const evaluation = evaluateFlowFestGnssFix(
      REFERENCE,
      {
        ...site,
        accuracyMeters: 4,
        timestampMilliseconds:
          now + FLOW_FEST_GNSS_CLOCK_SKEW_TOLERANCE_MILLISECONDS - 1,
        headingDegrees: null,
        speedMetersPerSecond: null,
      },
      now
    );
    expect(evaluation).toMatchObject({
      quality: "nominal",
      accepted: true,
      ageMilliseconds: 0,
    });
  });

  it("rejects a replay whose points collapse to fewer than two distinct samples after dedup", () => {
    expect(() =>
      createFlowFestGnssReplayTrack(REFERENCE, [
        { x: 340, z: -20 },
        { x: 340, z: -20 },
      ])
    ).toThrow(/at least two distinct/);
  });
});
