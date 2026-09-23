import { describe, expect, it } from "vitest";
import {
  allowedTipOffset,
  decodeTeachingKeys,
  defaultTeachingKeys,
  encodeTeachingKeys,
  sampleTeachingPose,
  upsertTeachingKey,
} from "../../../src/routes/test/grip-lab/isolation-teaching";
import { sampleStaffIsolation } from "../../../src/lib/shared/3d/performers/staff-isolation";

describe("taught isolation poses", () => {
  it("blends the North grip in both directions and retains it in copied links", () => {
    const keys = defaultTeachingKeys();
    expect(sampleTeachingPose(1, keys).gripRelaxation).toBe(0);
    expect(sampleTeachingPose(1.5, keys).gripRelaxation).toBeCloseTo(0.5);
    expect(sampleTeachingPose(2, keys).gripRelaxation).toBe(1);
    expect(sampleTeachingPose(2.5, keys).gripRelaxation).toBeCloseTo(0.5);
    expect(sampleTeachingPose(3, keys).gripRelaxation).toBe(0);
    const edited = upsertTeachingKey(keys, 2, {
      gripRelaxation: 0.75,
      gripTilt: 0.9,
    });
    expect(decodeTeachingKeys(encodeTeachingKeys(edited))).toEqual(edited);
  });

  it("preserves the closed grip and all authored channels in older pose links", () => {
    const rows = [
      [0, 0, 0, 0, 0, 0, 0, -0.2, -0.8, 0.35, 0, 0.09, 0],
      [0.747, 0, 0, 0, 0, 0, 0, -0.82, -0.8, 0.35, 0, 0.0144, 0],
      [2, 0, 0, 0, 0, 0, 0, -0.2, -0.8, 0.35, 0, 0, 0],
    ];
    const restored = decodeTeachingKeys(JSON.stringify(rows));
    expect(restored).toHaveLength(3);
    expect(restored.every((key) => key.gripRelaxation === 0)).toBe(true);
    const encoded = JSON.parse(encodeTeachingKeys(restored));
    rows.forEach((row, i) => {
      expect(encoded[i][0]).toBeCloseTo(row[0]);
      expect(encoded[i].slice(1, 13)).toEqual(row.slice(1));
    });
  });

  it("bounds grip editing without corrupting the other pose channels", () => {
    const changed = upsertTeachingKey(defaultTeachingKeys(), 2, {
      gripRelaxation: -1,
      gripTilt: 99,
    });
    const pose = sampleTeachingPose(2, changed);
    expect(pose.gripRelaxation).toBe(0);
    expect(pose.gripTilt).toBeCloseTo((80 * Math.PI) / 180, 4);
    expect(pose.turn).toBe(0);
    expect(pose.elbowY).toBe(-0.8);
  });
  it("retains individual finger and wrist edits while accepting pre-hand pose links", () => {
    const keys = upsertTeachingKey(defaultTeachingKeys(), 2, {
      wristBend: -0.2,
      thumbSpread: 0.35,
      indexCurl: -0.3,
      pinkyCurl: 0.2,
    });
    expect(decodeTeachingKeys(encodeTeachingKeys(keys))).toEqual(keys);
    const oldRows = defaultTeachingKeys().map((key) => JSON.parse(encodeTeachingKeys([key]))[0].slice(0, 15));
    const restored = decodeTeachingKeys(JSON.stringify(oldRows));
    expect(restored[2]?.gripRelaxation).toBe(1);
    expect(restored[2]?.thumbSpread).toBe(0);
    expect(restored[2]?.wristBend).toBe(0);
  });
  it("turns only after North, countershifts stage right, and returns continuously at South", () => {
    const keys = defaultTeachingKeys();
    for (const phase of [0, 0.5, 1, 1.5, 2])
      expect(sampleTeachingPose(phase, keys).turn).toBe(0);
    const middle = sampleTeachingPose(2.5, keys);
    expect(middle.turn).toBeGreaterThan(0);
    expect(middle.pelvisX).toBeLessThan(0);
    expect(middle.pelvisZ).toBeGreaterThan(0);
    expect(sampleTeachingPose(4, keys)).toEqual(sampleTeachingPose(0, keys));
    expect(sampleTeachingPose(3.9999, keys).turn).toBeCloseTo(0, 6);
  });
  it("restores an edited instant and its neighbors from a copied pose URL payload", () => {
    const original = defaultTeachingKeys();
    const keys = upsertTeachingKey(original, 2.375, {
      turn: 0.321,
      pelvisZ: 0.071,
    });
    const restored = decodeTeachingKeys(encodeTeachingKeys(keys));
    expect(original).toHaveLength(5);
    expect(restored).toHaveLength(6);
    for (const phase of [2, 2.2, 2.375, 2.8, 3.9, 4]) {
      expect(sampleTeachingPose(phase, restored)).toEqual(
        sampleTeachingPose(phase, keys)
      );
    }
    expect(sampleTeachingPose(2.375, restored).turn).toBe(0.321);
    expect(upsertTeachingKey(keys, 2.375, { turn: 0.4 })).toHaveLength(6);
  });
  it("bounds total tip drift without changing the rigid staff orientation", () => {
    const pose = {
      ...sampleTeachingPose(3, defaultTeachingKeys()),
      tipX: 0.1,
      tipY: 0.1,
      tipZ: -0.1,
    };
    const offset = allowedTipOffset(pose, 0.04);
    expect(Math.hypot(...offset)).toBeCloseTo(0.04, 10);
    expect(allowedTipOffset(pose, 0)).toEqual([0, 0, -0]);
    const ideal = sampleStaffIsolation(2.8);
    const shifted = sampleStaffIsolation(2.8, offset);
    expect(shifted.worldRotation!.angleTo(ideal.worldRotation!)).toBeCloseTo(
      0,
      7
    );
    expect(shifted.worldPosition!.distanceTo(ideal.worldPosition!)).toBeCloseTo(
      0.04,
      10
    );
  });
  it("rejects malformed links and bounds out-of-range authored values", () => {
    for (const payload of ["null", "{}", "[]", "[[0,1]]", "broken"]) {
      expect(decodeTeachingKeys(payload)).toEqual(defaultTeachingKeys());
    }
    const keys = upsertTeachingKey(defaultTeachingKeys(), 4, {
      turn: 999,
      tipZ: Infinity,
    });
    expect(keys).toHaveLength(5);
    expect(sampleTeachingPose(0, keys).turn).toBeCloseTo(Math.PI / 2, 4);
    expect(sampleTeachingPose(0, keys).tipZ).toBe(0);
    const nearSeam = upsertTeachingKey(defaultTeachingKeys(), 3.9999, {
      turn: 0.2,
    });
    expect(decodeTeachingKeys(encodeTeachingKeys(nearSeam))).toEqual(nearSeam);
    expect(sampleTeachingPose(0, nearSeam).turn).toBe(0.2);
  });
});
