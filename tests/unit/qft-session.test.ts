// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  loadQftSession,
  QFT_LEGACY_SESSION_KEY,
  QFT_SESSION_KEY,
  saveQftSession,
  type QftSession,
} from "../../src/lib/shared/notation/qft/qft-session";
import {
  trajectoryPropIndexAt,
  trajectoryReversals,
} from "../../src/lib/shared/notation/qft/qft-trajectory";
import { ALL_LAYERS } from "../../src/lib/shared/notation/qft/qft-layers";

beforeEach(() => {
  localStorage.clear();
});

describe("QfT session persistence", () => {
  it("returns null when neither session version exists", () => {
    expect(loadQftSession()).toBeNull();
  });

  it("round-trips the One Surface session and retires the legacy payload", () => {
    const session: QftSession = {
      entered: true,
      handCount: "two",
      left: { source: { kind: "preset", id: "triquetra" }, radius: 1.2 },
      right: { source: { kind: "flower", index: 4 }, radius: 0.75 },
      originPhase: 4,
      vtgMode: "SO",
      cursor: 3.5,
      playing: false,
      layers: ALL_LAYERS,
    };
    localStorage.setItem(QFT_LEGACY_SESSION_KEY, "{}");

    saveQftSession(session);

    expect(loadQftSession()).toEqual(session);
    expect(localStorage.getItem(QFT_LEGACY_SESSION_KEY)).toBeNull();
  });

  it("migrates a matrix session to two flower-backed hands", () => {
    localStorage.setItem(
      QFT_LEGACY_SESSION_KEY,
      JSON.stringify({
        entered: true,
        appMode: "matrix",
        blueIndex: 2,
        redIndex: 9,
        vtgMode: "QO",
        cursor: 7.25,
        playing: false,
        layers: ALL_LAYERS,
      })
    );

    const migrated = loadQftSession();

    expect(migrated?.handCount).toBe("two");
    expect(migrated?.left.source).toEqual({ kind: "flower", index: 2 });
    expect(migrated?.right.source).toEqual({ kind: "flower", index: 9 });
    expect(migrated?.vtgMode).toBe("QO");
    expect(migrated?.cursor).toBe(7.25);
  });

  it("restores a literal blue/red v3 hand pair", () => {
    localStorage.setItem(
      QFT_SESSION_KEY,
      JSON.stringify({
        entered: true,
        handCount: "two",
        blue: { source: { kind: "flower", index: 2 }, radius: 1.2 },
        red: { source: { kind: "flower", index: 9 }, radius: 0.8 },
      })
    );

    const restored = loadQftSession();
    expect(restored?.left).toMatchObject({
      source: { kind: "flower", index: 2 },
      radius: 1.2,
    });
    expect(restored?.right).toMatchObject({
      source: { kind: "flower", index: 9 },
      radius: 0.8,
    });
  });

  it("migrates a guide session to its canonical preset", () => {
    localStorage.setItem(
      QFT_LEGACY_SESSION_KEY,
      JSON.stringify({ appMode: "guide", moveIndex: 5, radius: 1 })
    );

    expect(loadQftSession()?.left.source).toEqual({
      kind: "preset",
      id: "triquetra",
    });
  });

  it("migrates the old pendulum flag into the variable-rate owner", () => {
    localStorage.setItem(
      QFT_LEGACY_SESSION_KEY,
      JSON.stringify({ appMode: "instrument", pendulum: true, radius: 1 })
    );

    const source = loadQftSession()?.left.source;
    expect(source?.kind).toBe("custom");
    if (source?.kind !== "custom")
      throw new Error("Expected a custom trajectory");

    expect(trajectoryPropIndexAt(source.trajectory, 0)).toBe(2);
    expect(trajectoryReversals(source.trajectory)).toHaveLength(2);
    expect(source.trajectory.radius).toBe(1);
  });

  it("rejects malformed custom trajectories without losing the whole session", () => {
    localStorage.setItem(
      QFT_SESSION_KEY,
      JSON.stringify({
        entered: true,
        handCount: "one",
        left: {
          source: { kind: "custom", trajectory: { propRate: [1, 2] } },
          radius: 999,
        },
      })
    );

    const restored = loadQftSession();
    expect(restored?.left.source).toEqual({ kind: "flower", index: 6 });
    expect(restored?.left.radius).toBe(1);
  });
});
