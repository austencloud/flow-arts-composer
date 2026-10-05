import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_TIP_POINTS,
  describeTipPointResolution,
  FAN_TIP_POINTS,
  getTipPoints,
  modelSpriteFacesAwayFromTips,
  getTipPointsBaseline,
  PROP_RENDER_KEY_TIP_POINTS,
  PROP_TIP_POINTS,
  setTipPointOverrideProvider,
  tipPointSignature,
} from "../prop-tip-points";
import { PROP_MODEL_SPRITES } from "$lib/shared/pictograph/prop/domain/prop-model-sprites.generated";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { propTipEnds } from "$lib/shared/pictograph/prop/domain/prop-tip-ends";
import { trailTipEnds } from "../trail-point-types";

const BIGFAN_SCALE = 600 / 325;

function closeTo(points: { dx: number; dy: number }[], expected: number[][]) {
  expect(points).toHaveLength(expected.length);
  points.forEach((point, index) => {
    expect(point.dx).toBeCloseTo(expected[index]![0]!, 1);
    expect(point.dy).toBeCloseTo(expected[index]![1]!, 1);
  });
}

afterEach(() => {
  setTipPointOverrideProvider(null);
});

describe("render-key tip points", () => {
  it("resolves the measured DoodleGrip Fire wicks instead of the pictograph ribs", () => {
    const fire = getTipPoints("fan__fire_bare").points;
    closeTo(fire, [
      [50, -92.54],
      [98, -55.7],
      [119.05, 0],
      [98, 55.7],
      [50, 92.54],
    ]);
    // Covers sit over the same wicks.
    expect(getTipPoints("FAN__FIRE_COVERED").points).toEqual(fire);
    expect(fire).not.toEqual(FAN_TIP_POINTS.points);
  });

  it("gives every fan build and frame its own table", () => {
    for (const key of [
      "fan__lotus",
      "fan__flat-grip",
      "fan__moon",
      "fan__day_black_bare",
      "fan__day_black_covered",
      "fan__day_white_bare",
      "fan__day_white_covered",
    ]) {
      expect(PROP_RENDER_KEY_TIP_POINTS[key], key).toBeDefined();
      expect(getTipPoints(key).points, key).toHaveLength(5);
      expect(getTipPoints(key).points, key).not.toEqual(FAN_TIP_POINTS.points);
    }
  });

  it("scales Big Fan builds about the hand pivot by the bigfan box ratio", () => {
    const lotus = getTipPoints("fan__lotus").points;
    const bigLotus = getTipPoints("bigfan__lotus").points;
    closeTo(
      bigLotus,
      lotus.map((point) => [point.dx * BIGFAN_SCALE, point.dy * BIGFAN_SCALE])
    );
  });

  it("falls back to the notation table for an unknown render key", () => {
    expect(getTipPoints("fan__not-a-build")).toBe(PROP_TIP_POINTS.fan);
    expect(getTipPoints("staff__model")).toBe(PROP_TIP_POINTS.staff);
    expect(getTipPoints("nonsense__model")).toBe(DEFAULT_TIP_POINTS);
  });

  it("prefers a render-key override, then the render table, then the base override", () => {
    const fireOverride = { points: [{ dx: 1, dy: 2 }] };
    const fanOverride = { points: [{ dx: 3, dy: 4 }] };
    setTipPointOverrideProvider((key) =>
      key === "fan__fire_bare"
        ? fireOverride
        : key === "fan"
          ? fanOverride
          : null
    );
    expect(getTipPoints("fan__fire_bare")).toBe(fireOverride);
    expect(getTipPoints("fan__lotus")).toBe(
      PROP_RENDER_KEY_TIP_POINTS["fan__lotus"]
    );
    expect(getTipPoints("fan")).toBe(fanOverride);
    expect(getTipPoints("fan__not-a-build")).toBe(fanOverride);
    expect(getTipPointsBaseline("fan__fire_bare")).toBe(
      PROP_RENDER_KEY_TIP_POINTS["fan__fire_bare"]
    );
  });

  it("reports where a key's points came from", () => {
    expect(describeTipPointResolution("fan__fire_bare")).toEqual({
      key: "fan__fire_bare",
      resolvedKey: "fan__fire_bare",
      source: "render-key",
    });
    expect(describeTipPointResolution("fan__not-a-build")).toEqual({
      key: "fan__not-a-build",
      resolvedKey: "fan",
      source: "base",
    });
    expect(describeTipPointResolution("nonsense")).toEqual({
      key: "nonsense",
      resolvedKey: null,
      source: "default",
    });
    setTipPointOverrideProvider((key) =>
      key === "fan" ? { points: [{ dx: 3, dy: 4 }] } : null
    );
    expect(describeTipPointResolution("fan")).toEqual({
      key: "fan",
      resolvedKey: "fan",
      source: "override",
    });
    expect(describeTipPointResolution("fan__not-a-build")).toEqual({
      key: "fan__not-a-build",
      resolvedKey: "fan",
      source: "override",
    });
  });

  it("changes the geometry signature when the render key changes the points", () => {
    expect(tipPointSignature("fan")).not.toBe(
      tipPointSignature("fan__fire_bare")
    );
    expect(tipPointSignature("fan__fire_bare")).toBe(
      tipPointSignature("fan__fire_covered")
    );
    expect(tipPointSignature("hand")).toBe(tipPointSignature("contactball"));
  });
});

describe("model sprite tip points", () => {
  it("places both triangle grips' five sources on their physical model stations", () => {
    // Measured model stations in metres, then converted with the capture's fit.
    // The old notation table reached 135.15 units, beyond the ~117-unit paint.
    for (const [key, stations] of [
      [
        "triangle",
        [
          [0.506285, 0],
          [0.483935, 0.2794],
          [0.483935, -0.2794],
          [0.2307925, 0.1590557],
          [0.2307925, -0.1590557],
        ],
      ],
      [
        "triangle_side",
        [
          [0.506285, 0],
          [0.02235, 0.2794],
          [0.02235, -0.2794],
          [0.2754925, 0.1590557],
          [0.2754925, -0.1590557],
        ],
      ],
    ] as const) {
      const scale = PROP_MODEL_SPRITES[key]!.fit;
      const points = getTipPoints(`${key}__model`).points;
      closeTo(
        points,
        stations.map(([axial, lateral]) => [axial * scale, lateral * scale])
      );
      const entry = PROP_MODEL_SPRITES[key]!;
      const bounds = entry.bounds!;
      const paintedReach = entry.width / 2 - bounds.x;
      const paintedHalfHeight = Math.max(
        Math.abs(bounds.y - entry.height / 2),
        Math.abs(bounds.y + bounds.height - entry.height / 2)
      );
      expect(Math.max(...points.map((point) => point.dx))).toBeLessThan(
        paintedReach
      );
      expect(
        Math.max(...points.map((point) => Math.abs(point.dy)))
      ).toBeLessThan(paintedHalfHeight);
    }
    expect(getTipPoints("triangle").points).toEqual(
      PROP_TIP_POINTS.triangle!.points
    );
  });

  it("keeps the notation reach for a one-sided sprite that fills its half box", () => {
    // The club capture faces away from the notation glyph; the sprite is
    // rotated when it is drawn, so its tip stays on the notation reach.
    expect(getTipPoints("club__model")).toBe(PROP_TIP_POINTS.club);
    expect(getTipPoints("poi__model")).toBe(PROP_TIP_POINTS.poi);
  });

  it("pulls axial tips in to a sprite that paints short of the notation reach", () => {
    // The big staff capture is drawn turned (T-bar on the thumb end), so its
    // painted left reach lands on +x and its right reach on -x.
    const entry = PROP_MODEL_SPRITES.bigstaff!;
    const bounds = entry.bounds!;
    const half = entry.width / 2;
    const points = getTipPoints("bigstaff__model").points;
    closeTo(points, [
      [-(bounds.x + bounds.width - half), 0],
      [half - bounds.x, 0],
    ]);
    expect(Math.abs(points[0]!.dx)).toBeLessThan(300);
  });

  it("turns every staff model so its T-bar sits on the thumb end", () => {
    // Staff3D puts the T-bar on the thumb end, and each capture shot it on -x.
    // The notation staff marks the thumb end at +x, the end the rotation
    // tables point at the centre for "in". Drawn as captured, a Realistic
    // staff set to "in" showed its T-bar on the outside.
    for (const prop of ["staff", "simple_staff", "staff_v2", "bigstaff"]) {
      expect(modelSpriteFacesAwayFromTips(prop), prop).toBe(true);
    }
    // Symmetric captures with no thumb marker stay as captured.
    for (const prop of ["capsule_baton", "fire_double_staff"]) {
      expect(modelSpriteFacesAwayFromTips(prop), prop).toBe(false);
    }
  });

  it("turns a one-sided capture of a two-ended prop and keeps only its painted end", () => {
    // The big club notation glyph is held in the middle, so its table carries
    // both ends; the model capture is a club held at the knob and painted only
    // on the -x half. Drawn rotated, it has one real end at +x and nothing
    // at -x. A tip pulled in to the bare knob would put a flame on the hand.
    expect(modelSpriteFacesAwayFromTips("bigclub")).toBe(true);
    const points = getTipPoints("bigclub__model").points;
    expect(points).toHaveLength(1);
    closeTo(points, [[125.79, 0]]);
  });

  it("leaves radial props on their notation table", () => {
    expect(getTipPoints("triad__model")).toBe(PROP_TIP_POINTS.triad);
    expect(getTipPoints("buugeng__model")).toBe(PROP_TIP_POINTS.buugeng);
  });

  it("turns radial and hooped captures whose arms point away from their tips", () => {
    // Each of these captures paints its lead arm, rim, or blade on -x while
    // its table reaches +x; unturned, every trail and flame floats off the
    // artwork.
    for (const prop of [
      "triad",
      "bigtriad",
      "trigeng",
      "minihoop",
      "bighoop",
      "triquetra",
      "triquetra2",
      "sword",
    ]) {
      expect(modelSpriteFacesAwayFromTips(prop), prop).toBe(true);
    }
    for (const prop of [
      "quiad",
      "bigbuugeng",
      "buugeng",
      "bigchicken",
      "guitar",
      "ukulele",
    ]) {
      expect(modelSpriteFacesAwayFromTips(prop), prop).toBe(false);
    }
  });

  it("turns the side-grip triangle capture the way it turns the corner one", () => {
    // Both captures paint on -x; both glyphs and both tip tables reach +x.
    // The side sprite key is not a prop type, so its table lives under its
    // render key; unturned, a Realistic side grip was drawn mirrored against
    // its Classic glyph and its trails.
    expect(modelSpriteFacesAwayFromTips("triangle")).toBe(true);
    expect(modelSpriteFacesAwayFromTips("triangle_side")).toBe(true);
  });

  it("never draws a capture leaning away from its tip table", () => {
    for (const [prop, entry] of Object.entries(PROP_MODEL_SPRITES)) {
      const table =
        PROP_TIP_POINTS[prop] ?? PROP_RENDER_KEY_TIP_POINTS[`${prop}__model`];
      const points = table?.points ?? [];
      if (!entry.bounds || points.length === 0) continue;
      const half = entry.width / 2;
      const xs = points.map((point) => point.dx);
      const tipBias = (Math.max(...xs) + Math.min(...xs)) / 2 / half;
      const painted = (entry.bounds.x + entry.bounds.width / 2 - half) / half;
      const drawn = modelSpriteFacesAwayFromTips(prop) ? -painted : painted;
      if (Math.abs(tipBias) > 0.1 && Math.abs(drawn) > 0.1) {
        expect(Math.sign(drawn), prop).toBe(Math.sign(tipBias));
      }
    }
  });

  it("puts a turned sword's tip on its blade end", () => {
    const entry = PROP_MODEL_SPRITES.sword!;
    const half = entry.width / 2;
    const bladeReach = half - entry.bounds!.x;
    const [tip] = getTipPoints("sword__model").points;
    expect(tip!.dx).toBeGreaterThan(0);
    expect(tip!.dx).toBeLessThanOrEqual(bladeReach + 1e-9);
    expect(tip!.dx).toBeGreaterThan(
      entry.bounds!.x + entry.bounds!.width - half
    );
  });
});

describe("render keys count as the prop they draw", () => {
  it("classifies a render key by its notation prop's ends", () => {
    expect(propTipEnds("bigclub__model")).toBe(2);
    expect(propTipEnds("staff__model")).toBe(2);
    expect(propTipEnds("bigfan__fire_bare")).toBe(1);
  });

  it("traces one end when the drawn artwork has only one tip", () => {
    expect(trailTipEnds("bigclub")).toBe(2);
    expect(trailTipEnds("bigclub__model")).toBe(1);
    expect(trailTipEnds("staff__model")).toBe(2);
  });
});

describe("tip table and tip-end classification agree", () => {
  it("gives every two-ended prop exactly two tips on opposite sides of the hand", () => {
    for (const propType of Object.values(PropType)) {
      if (propTipEnds(propType) !== 2) continue;
      const points = getTipPointsBaseline(propType).points;
      expect(points, propType).toHaveLength(2);
      expect(
        Math.sign(points[0]!.dx) * Math.sign(points[1]!.dx),
        propType
      ).toBe(-1);
    }
  });

  it("tracks the two ball centres of a double contact ball", () => {
    closeTo(getTipPoints("doublecontactball").points, [
      [-75, 0],
      [75, 0],
    ]);
    closeTo(getTipPoints("bigdoublecontactball").points, [
      [-150, 0],
      [150, 0],
    ]);
    expect(getTipPoints("contactball").points).toHaveLength(0);
  });

  it("treats every axial mirror pair in the table as two-ended", () => {
    for (const [propType, config] of Object.entries(PROP_TIP_POINTS)) {
      const points = config.points;
      const axialMirrorPair =
        points.length === 2 &&
        points.every((point) => Math.abs(point.dy) < 8) &&
        Math.sign(points[0]!.dx) * Math.sign(points[1]!.dx) === -1;
      if (!axialMirrorPair) continue;
      expect(propTipEnds(propType), propType).toBe(2);
    }
  });
});
