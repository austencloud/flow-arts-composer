/**
 * Content Hash Duplicate Detection Tests
 *
 * HIGH VALUE: Two sequences with identical motion content produce the same hash,
 * which the repository uses to block exact duplicates from being saved.
 * If this breaks, users get phantom "variations" that are actually clones.
 *
 * Tests the SequenceContentHasher directly — the Firestore query in
 * LibraryRepository.saveSequence() relies on these hashes being correct.
 */

import { describe, expect, it } from "vitest";
import {
  computeHash,
  HASH_VERSION_V1,
  HASH_VERSION_V2,
} from "../../../src/lib/shared/library/services/sequence-content-hasher";
import { HandSide } from "../../../src/lib/shared/pictograph/shared/domain/enums/pictograph-enums";

// Minimal motion data that satisfies the hasher's extraction
function makeMotion(overrides: Record<string, unknown> = {}) {
  return {
    motionType: "pro",
    rotationDirection: "cw",
    startLocation: "n",
    endLocation: "s",
    turns: 1,
    startOrientation: "in",
    endOrientation: "out",
    handPath: null,
    gridMode: "diamond",
    skewSteps: null,
    skewDir: null,
    ...overrides,
  };
}

function makeStep(overrides: Record<string, unknown> = {}) {
  return {
    letter: "A",
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    duration: 1,
    motions: {
      [HandSide.LEFT]: makeMotion(),
      [HandSide.RIGHT]: makeMotion(),
    },
    gridMode: "diamond",
    ...overrides,
  };
}

function makeSequence(overrides: Record<string, unknown> = {}) {
  return {
    id: "test-id",
    name: "test",
    word: "A",
    steps: [makeStep()],
    gridMode: "diamond",
    startPlacement: {
      motions: {
        [HandSide.LEFT]: makeMotion(),
        [HandSide.RIGHT]: makeMotion(),
      },
      gridMode: "diamond",
    },
    ...overrides,
  } as any;
}

describe("SequenceContentHasher — Duplicate Detection", () => {

  it("identical sequences produce the same hash", async () => {
    const a = makeSequence();
    const b = makeSequence();

    const hashA = await computeHash(a);
    const hashB = await computeHash(b);

    expect(hashA).toBe(hashB);
  });

  it("metadata changes do NOT affect the hash", async () => {
    const base = makeSequence();
    const withDifferentMeta = makeSequence({
      id: "different-id",
      name: "totally different name",
      word: "DIFFERENT",
      tags: ["foo", "bar"],
      visibility: "private",
      thumbnails: ["http://example.com/thumb.png"],
      notes: "some notes",
      ownerDisplayName: "Someone Else",
    });

    const hashBase = await computeHash(base);
    const hashMeta = await computeHash(withDifferentMeta);

    expect(hashBase).toBe(hashMeta);
  });

  it("different orientation produces a different hash", async () => {
    const a = makeSequence();
    const b = makeSequence({
      steps: [
        makeStep({
          motions: {
            [HandSide.LEFT]: makeMotion({ startOrientation: "out" }),
            [HandSide.RIGHT]: makeMotion(),
          },
        }),
      ],
    });

    const hashA = await computeHash(a);
    const hashB = await computeHash(b);

    expect(hashA).not.toBe(hashB);
  });

  it("different turn count produces a different hash", async () => {
    const a = makeSequence();
    const b = makeSequence({
      steps: [
        makeStep({
          motions: {
            [HandSide.LEFT]: makeMotion({ turns: 2 }),
            [HandSide.RIGHT]: makeMotion(),
          },
        }),
      ],
    });

    const hashA = await computeHash(a);
    const hashB = await computeHash(b);

    expect(hashA).not.toBe(hashB);
  });

  it("different location produces a different hash", async () => {
    const a = makeSequence();
    const b = makeSequence({
      steps: [
        makeStep({
          motions: {
            [HandSide.LEFT]: makeMotion({ endLocation: "e" }),
            [HandSide.RIGHT]: makeMotion(),
          },
        }),
      ],
    });

    const hashA = await computeHash(a);
    const hashB = await computeHash(b);

    expect(hashA).not.toBe(hashB);
  });

  it("different letter produces a different hash", async () => {
    const a = makeSequence();
    const b = makeSequence({
      steps: [makeStep({ letter: "B" })],
    });

    const hashA = await computeHash(a);
    const hashB = await computeHash(b);

    expect(hashA).not.toBe(hashB);
  });

  it("grid mode is V1 identity but excluded from V2 (re-derived on hydrate)", async () => {
    const a = makeSequence({ gridMode: "diamond" });
    const b = makeSequence({ gridMode: "box" });

    // V1: gridMode contributes to identity.
    expect(await computeHash(a, HASH_VERSION_V1)).not.toBe(
      await computeHash(b, HASH_VERSION_V1)
    );
    // V2: gridMode is re-derived by deriveStepGridMode on every load, so it is
    // dropped from identity — with identical locations these are the same.
    expect(await computeHash(a, HASH_VERSION_V2)).toBe(
      await computeHash(b, HASH_VERSION_V2)
    );
  });

  it("hash is a 64-character hex string (SHA-256)", async () => {
    const hash = await computeHash(makeSequence());

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("reversal flag is V1 identity but excluded from V2 (re-derived on hydrate)", async () => {
    const a = makeSequence();
    const b = makeSequence({
      steps: [makeStep({ leftReversal: true })],
    });

    // V1: reversal flags contribute to identity.
    expect(await computeHash(a, HASH_VERSION_V1)).not.toBe(
      await computeHash(b, HASH_VERSION_V1)
    );
    // V2: reversal flags are re-derived by processReversals on every load, so
    // they are dropped from identity (this is the phantom-fork-on-resave fix).
    expect(await computeHash(a, HASH_VERSION_V2)).toBe(
      await computeHash(b, HASH_VERSION_V2)
    );
  });

  it("undefined step gridMode inherits from sequence and matches explicit value", async () => {
    // This was the actual bug: one sequence had step.gridMode = undefined
    // (inheriting "diamond" from the sequence), while its duplicate had
    // step.gridMode = "diamond" explicitly. They should hash the same.
    const withExplicit = makeSequence({
      gridMode: "diamond",
      steps: [makeStep({ gridMode: "diamond" })],
    });
    const withInherited = makeSequence({
      gridMode: "diamond",
      steps: [makeStep({ gridMode: undefined })],
    });

    const hashExplicit = await computeHash(withExplicit);
    const hashInherited = await computeHash(withInherited);

    expect(hashExplicit).toBe(hashInherited);
  });

  it("null step gridMode also inherits from sequence", async () => {
    const withExplicit = makeSequence({
      gridMode: "box",
      steps: [makeStep({ gridMode: "box" })],
    });
    const withNull = makeSequence({
      gridMode: "box",
      steps: [makeStep({ gridMode: null })],
    });

    const hashExplicit = await computeHash(withExplicit);
    const hashNull = await computeHash(withNull);

    expect(hashExplicit).toBe(hashNull);
  });
});
