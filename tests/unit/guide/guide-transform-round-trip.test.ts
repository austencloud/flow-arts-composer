import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Guide Companion v2 P2 — transform → sequenceToStrip → saveOverride round
 * trip. Exercises the exact pipeline GuideCompanion.svelte's runTransform()
 * wires together: a pure sequence-transform service, the guide adapter's
 * sequenceToStrip(), and the override service's saveOverride(). Firestore is
 * mocked the same way tests/unit/guide/guide-overrides.test.ts mocks it.
 */

// ── Firestore mocks (same shape as guide-overrides.test.ts) ──────────────────
const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockSetDoc = vi.fn();
const mockAddDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockCollection = vi.fn((..._args: unknown[]) => "col-ref");
const mockDoc = vi.fn((..._args: unknown[]) => "doc-ref");
const mockQuery = vi.fn((...args: unknown[]) => args[0]);
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockServerTimestamp = vi.fn(() => ({ _isServerTimestamp: true }));

vi.mock("firebase/firestore", () => ({
  collection: (...args: unknown[]) => mockCollection(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  query: (...args: unknown[]) => mockQuery(...args),
  orderBy: (...args: unknown[]) => mockOrderBy(...args),
  limit: (...args: unknown[]) => mockLimit(...args),
  serverTimestamp: () => mockServerTimestamp(),
}));

vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: vi.fn().mockResolvedValue({}),
}));

let mockIsAdmin = true;
vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  isAdmin: () => mockIsAdmin,
  getEffectiveUserId: () => "test-uid",
}));

import { saveOverride } from "../../../src/routes/(public)/guide/level-1/_data/guide-overrides.svelte";
import { sequenceToStrip } from "../../../src/routes/(public)/guide/level-1/_data/guide-sequence-adapter";
import { handSwapSequence } from "../../../src/lib/shared/create/services/sequence-transforms";
import { rotateSequenceGeometry } from "../../../src/lib/shared/create/services/sequence-derived-fields";
import type { SequenceData } from "../../../src/lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "../../../src/lib/shared/foundation/domain/models/step-data";
import type { StartPlacementData } from "../../../src/lib/shared/foundation/domain/models/start-placement-data";

function makeMotion(
  hand: "left" | "right",
  startLocation: string,
  endLocation: string
) {
  return {
    motionType: "pro",
    rotationDirection: "cw",
    startLocation,
    endLocation,
    startOrientation: "in",
    endOrientation: "in",
    turns: 0,
    hand,
    propType: "staff",
    gridMode: "diamond",
  };
}

function makeStartPlacement(): StartPlacementData {
  return {
    id: "start",
    letter: null,
    isStartPlacement: true,
    gridMode: "diamond",
    motions: {
      left: makeMotion("left", "n", "n"),
      right: makeMotion("right", "s", "s"),
    },
  } as unknown as StartPlacementData;
}

function makeStep(stepNumber: number): StepData {
  return {
    id: `s-${stepNumber}`,
    letter: "A" as unknown as StepData["letter"],
    gridMode: "diamond" as unknown as StepData["gridMode"],
    startPlacement: "alpha1" as unknown as StepData["startPlacement"],
    endPlacement: "alpha3" as unknown as StepData["endPlacement"],
    stepNumber,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    motions: {
      left: makeMotion("blue", "n", "e"),
      right: makeMotion("red", "s", "w"),
    },
  } as unknown as StepData;
}

function makeSequence(): SequenceData {
  return {
    id: "seq-1",
    name: "t",
    word: "AB",
    steps: [makeStep(1)],
    startPlacement: makeStartPlacement(),
    gridMode: "diamond",
    difficulty: 1,
    metadata: {},
  } as unknown as SequenceData;
}

describe("guide companion transform round trip (P2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAdmin = true;
    mockGetDoc.mockResolvedValue({ exists: () => false });
    mockGetDocs.mockResolvedValue({ docs: [] });
    mockAddDoc.mockResolvedValue({ id: "rev-1" });
    mockSetDoc.mockResolvedValue(undefined);
  });

  it("handSwapSequence -> sequenceToStrip -> saveOverride persists left/right-swapped, JSON-serializable steps", async () => {
    const sequence = makeSequence();

    const swapped = handSwapSequence(sequence);
    const strip = sequenceToStrip(swapped);
    await saveOverride("t1l-transform-test", strip, swapped.word);

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const written = mockSetDoc.mock.calls[0]![1] as Record<string, unknown>;

    // Round trip is via JSON — the exact serialization guarantee saveOverride relies on.
    expect(() => JSON.stringify(written)).not.toThrow();
    expect(JSON.stringify(written)).not.toContain("undefined");

    const writtenSteps = written.steps as Array<Record<string, unknown>>;
    // strip[0] is the start position (stepNumber 0), strip[1] is the numbered step.
    const startBox = writtenSteps[0]!;
    const stepBox = writtenSteps[1]!;
    const startMotions = startBox.motions as Record<
      string,
      Record<string, unknown>
    >;
    const stepMotions = stepBox.motions as Record<
      string,
      Record<string, unknown>
    >;

    // Color swap: the ORIGINAL red motion's geometry now lives on blue, and vice versa.
    expect(startMotions.left!.startLocation).toBe("s"); // was red's start
    expect(startMotions.right!.startLocation).toBe("n"); // was blue's start
    expect(stepMotions.left!.startLocation).toBe("s");
    expect(stepMotions.left!.endLocation).toBe("w");
    expect(stepMotions.right!.startLocation).toBe("n");
    expect(stepMotions.right!.endLocation).toBe("e");
  });

  it("rotateSequenceGeometry(seq, 2) [90 CW] -> sequenceToStrip -> saveOverride round trip", async () => {
    const sequence = makeSequence();

    const rotated = rotateSequenceGeometry(sequence, 2);
    const strip = sequenceToStrip(rotated);
    await saveOverride("t1l-rotate-test", strip, rotated.word);

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const written = mockSetDoc.mock.calls[0]![1] as Record<string, unknown>;
    expect(() => JSON.stringify(written)).not.toThrow();

    const writtenSteps = written.steps as Array<Record<string, unknown>>;
    // n rotated 90 CW (2 x 45deg steps) becomes e; original step motion started at "n".
    const stepMotions = writtenSteps[1]!.motions as Record<
      string,
      Record<string, unknown>
    >;
    expect(stepMotions.left!.startLocation).toBe("e");
  });

  it("saveOverride throws (transform not persisted) when the caller is not admin", async () => {
    mockIsAdmin = false;
    const sequence = makeSequence();
    const swapped = handSwapSequence(sequence);
    const strip = sequenceToStrip(swapped);

    await expect(
      saveOverride("t1l-transform-test", strip, swapped.word)
    ).rejects.toThrow(/not authorized/i);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });
});
