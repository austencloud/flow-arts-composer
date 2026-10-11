import { describe, it, expect, vi } from "vitest";

// buildBaseIndex color-swaps via the shared create transforms, whose import
// chain reaches firebase/firestore. Node has no Firebase app — stub it out the
// same way tests/unit/guide/guide-transform-round-trip.test.ts does.
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn(),
  deleteDoc: vi.fn(),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(),
}));
vi.mock("#lib/shared/auth/firebase.js", () => ({
  getFirestoreInstance: vi.fn().mockResolvedValue({}),
}));

import { buildBaseIndex, resolveBase } from "../build-realization-sequence";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import {
  createSequenceData,
  type SequenceData,
} from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  HandSide,
  MotionType,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";

type TestMotionStyle = "pro" | "anti";

const seq = (
  word: string,
  left: TestMotionStyle,
  right: TestMotionStyle
): SequenceData =>
  createSequenceData({
    id: `l1-tnd-${word}`,
    name: word,
    word,
    steps: [
      createStepData({
        motions: {
          left: createMotionData({
            hand: HandSide.LEFT,
            motionType: left === "pro" ? MotionType.PRO : MotionType.ANTI,
          }),
          right: createMotionData({
            hand: HandSide.RIGHT,
            motionType: right === "pro" ? MotionType.PRO : MotionType.ANTI,
          }),
        },
      }),
    ],
  });

// A representative slice of the 22-word base catalog with real style pairs.
const bases = [
  seq("AAAA", "pro", "pro"), // SS pro/pro
  seq("CCCC", "pro", "anti"), // SS pro/anti
  seq("BBBB", "anti", "anti"), // SS anti/anti
  seq("JDJD", "pro", "pro"), // SO pro/pro
  seq("DJDJ", "pro", "pro"), // TO pro/pro
  seq("FLFL", "anti", "pro"), // TO anti/pro — the ONLY mixed TO order seeded
  seq("MPMP", "pro", "pro"), // QO pro/pro
  seq("UUUU", "pro", "anti"), // QS pro/anti
  seq("VVVV", "anti", "pro"), // QS anti/pro — QS seeds BOTH mixed orders
];

describe("buildBaseIndex / resolveBase", () => {
  it("indexes the opposite-direction 2-letter words that the old letter lookup dropped", () => {
    const idx = buildBaseIndex(bases);
    // SO/TO/QO now resolve — the bug was that "D" never matched the "DJDJ" key.
    expect(resolveBase(idx, "SO", "pro", "pro")?.word).toBe("JDJD");
    expect(resolveBase(idx, "TO", "pro", "pro")?.word).toBe("DJDJ");
    expect(resolveBase(idx, "QO", "pro", "pro")?.word).toBe("MPMP");
  });

  it("resolves same-direction words by mode + style pair", () => {
    const idx = buildBaseIndex(bases);
    expect(resolveBase(idx, "SS", "pro", "pro")?.word).toBe("AAAA");
    expect(resolveBase(idx, "SS", "pro", "anti")?.word).toBe("CCCC");
    expect(resolveBase(idx, "SS", "anti", "anti")?.word).toBe("BBBB");
    expect(resolveBase(idx, "QS", "pro", "anti")?.word).toBe("UUUU");
  });

  it("fills a missing mixed order with the seeded twin COLOR-SWAPPED, keeping each hand's own style", () => {
    const idx = buildBaseIndex(bases);
    // No blue=pro/red=anti TO word is seeded (FLFL is blue=anti/red=pro). The old
    // raw-mirror fallback returned FLFL as-is, so the blue prop performed ANTI —
    // an isolation cell visibly played an antispin path (the 2026-07-19 bug).
    // The color-swapped twin keeps blue on blue's style.
    const r = resolveBase(idx, "TO", "pro", "anti");
    expect(r?.word).toBe("FLFL");
    expect(r?.steps?.[0]?.motions?.left?.motionType).toBe("pro");
    expect(r?.steps?.[0]?.motions?.right?.motionType).toBe("anti");
  });

  it("resolves an anti×pro cell whose mode seeds only the pro×anti order", () => {
    const idx = buildBaseIndex(bases);
    const r = resolveBase(idx, "SS", "anti", "pro");
    expect(r?.word).toBe("CCCC");
    expect(r?.steps?.[0]?.motions?.left?.motionType).toBe("anti");
    expect(r?.steps?.[0]?.motions?.right?.motionType).toBe("pro");
  });

  it("prefers a seeded word over a synthesized swap when both orders exist", () => {
    const idx = buildBaseIndex(bases);
    // QS seeds UUUU (pro/anti) AND VVVV (anti/pro) — each order must resolve to
    // its own real word, never to the other one color-swapped.
    const proAnti = resolveBase(idx, "QS", "pro", "anti");
    const antiPro = resolveBase(idx, "QS", "anti", "pro");
    expect(proAnti?.word).toBe("UUUU");
    expect(proAnti?.steps?.[0]?.motions?.left?.motionType).toBe("pro");
    expect(antiPro?.word).toBe("VVVV");
    expect(antiPro?.steps?.[0]?.motions?.left?.motionType).toBe("anti");
  });

  it("returns null when a mode has no base word at all", () => {
    const idx = buildBaseIndex(bases);
    expect(resolveBase(idx, "TS", "anti", "anti")).toBeNull(); // no TS word in this slice
  });

  it("ignores sequences whose word isn't a known base motion", () => {
    const idx = buildBaseIndex([seq("ZZZZ", "pro", "pro"), ...bases]);
    expect(idx.has("SS|pro|pro")).toBe(true);
    expect([...idx.values()].some((s) => s.word === "ZZZZ")).toBe(false);
  });
});
