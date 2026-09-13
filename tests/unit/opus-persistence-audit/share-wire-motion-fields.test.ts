/**
 * AUDIT REPRO — the share/QR flat wire format carries fewer motion fields than
 * the identity hash reads, and its own round-trip check cannot notice.
 *
 * `sequence-encoder.encodeMotion` emits exactly
 * `${startLoc}${endLoc}${rotation}${turns}` (plus one prefloat byte for a
 * float). There is no byte for `plane`, `skewSteps`, or `skewDir`, and
 * `decodeMotion` never restores them.
 *
 * Two consumers care:
 *   - `sequence-content-hasher.ts:206` — V3, ACTIVE since 2026-09-04, hashes
 *     `plane: m.plane ?? Plane.wall`. V3 exists precisely because "plane was
 *     previously dropped by composition, so no V1/V2 stored identity could
 *     distinguish physically different multi-plane choreography". The
 *     composition path was fixed; the wire format was not.
 *   - `sequence-decomposer.ts:49` and `sequence-content-hasher.ts:204` both
 *     carry `skewSteps`/`skewDir`, and `hand-path-data-builder.ts:200` authors
 *     them.
 *
 * `verifySequenceRoundTrip` lists `skewSteps` and `skewDir` among the fields it
 * compares, but it compares `decode(x)` against `decode(encode(decode(x)))` —
 * both sides have already been through the lossy encoder, so an encode-side
 * loss is invisible to it. It reports `ok: true` on a sequence whose skew and
 * plane it just dropped.
 *
 * Today every corpus motion is `plane: "wall"`, which the V3 hasher's `?? wall`
 * default absorbs, so no stored identity breaks yet. Multi-plane authoring
 * exists only in `src/routes/test/spatial-sculpture` — the day it ships to a
 * real surface, every QR and share link silently flattens it.
 *
 * QUARANTINE: `it.fails` marks the assertions that should pass once the wire
 * format carries these fields. This file is green while the defect is live.
 */
import { describe, expect, it } from "vitest";

import {
  decodeSequence,
  encodeSequence,
  verifySequenceRoundTrip,
} from "$lib/shared/navigation/services/sequence-encoder";
import { createStartPositionData } from "$lib/shared/foundation/domain/factories/create-start-position-data";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

import {
  buildSequence,
  diffMotionIdentity,
  makeStep,
  motionAt,
  realCorpusSequences,
} from "./fixtures";

const startCell = () =>
  createStartPositionData({
    id: "start",
    motions: {
      left: motionAt(GridLocation.NORTH, GridLocation.NORTH, HandSide.LEFT),
      right: motionAt(GridLocation.SOUTH, GridLocation.SOUTH, HandSide.RIGHT),
    },
  });

/** One beat authored off the wall plane with a skewed left shift. */
function authoredSequence(): SequenceData {
  return buildSequence(
    [
      makeStep(0, "A", { plane: "wheel", skewSteps: 2, skewDir: "+" }),
      makeStep(1, "B"),
    ],
    { startPosition: startCell() }
  );
}

describe("share/QR flat wire format motion fidelity", () => {
  it("measured: plane and skew are absent from the encoded bytes", () => {
    const encoded = encodeSequence(authoredSequence());
    // Locations, rotation and turns only — nothing encodes "wheel" or the skew.
    expect(encoded).toBe("iiSS|nonox0:sosox0|noeac0:sowec0|easoc0:wenoc0");
  });

  it("measured: a decoded beat has lost plane and skew", () => {
    const back = decodeSequence(encodeSequence(authoredSequence()));
    const left = back.steps[0]!.motions.left;

    expect(left.plane).toBeUndefined();
    expect(left.skewSteps ?? null).toBeNull();
    expect(left.skewDir ?? null).toBeNull();
    // Everything the format DOES carry survived, so this is a field-coverage
    // gap, not a broken encoder.
    expect(left.startLocation).toBe(GridLocation.NORTH);
    expect(left.endLocation).toBe(GridLocation.EAST);
    expect(left.turns).toBe(0);
  });

  it("measured: verifySequenceRoundTrip reports ok on the sequence it just flattened", () => {
    const result = verifySequenceRoundTrip(encodeSequence(authoredSequence()));
    expect(result.ok).toBe(true);
  });

  it("measured: every plane in the real corpus is dropped by a share round trip", () => {
    const corpus = realCorpusSequences();
    let motionsChecked = 0;
    let planeLosses = 0;

    for (const { sequence } of corpus) {
      const back = decodeSequence(encodeSequence(sequence));
      motionsChecked += sequence.steps.length * 2;
      planeLosses += diffMotionIdentity(sequence, back).filter((line) =>
        line.includes(".plane:")
      ).length;
    }

    expect(motionsChecked).toBeGreaterThan(500);
    // The corpus stores `plane: "wall"` on every motion; every one comes back absent.
    expect(planeLosses).toBe(motionsChecked);
  });

  it.fails(
    "SHOULD PASS AFTER FIX: an authored plane survives a share round trip",
    () => {
      const back = decodeSequence(encodeSequence(authoredSequence()));
      expect(back.steps[0]!.motions.left.plane).toBe("wheel");
    }
  );

  it.fails("SHOULD PASS AFTER FIX: authored skew survives a share round trip", () => {
    const back = decodeSequence(encodeSequence(authoredSequence()));
    expect(back.steps[0]!.motions.left.skewSteps).toBe(2);
    expect(back.steps[0]!.motions.left.skewDir).toBe("+");
  });
});

describe("share/QR flat wire format input validation", () => {
  it("measured: malformed segments are refused with a typed error, not silently repaired", () => {
    expect(() => decodeSequence("")).toThrow(/empty sequence/i);
    expect(() => decodeSequence("garbage")).toThrow(/missing data/i);
    expect(() => decodeSequence("iiSS|nonox0|zzzzc0")).toThrow(/Invalid motion encoding/);
    expect(() => decodeSequence("iiSS|nonox0|nonocNaN")).toThrow(/Invalid motion encoding/);
    expect(() => decodeSequence("iiSS|nonox0|nonoc0:nonoc0:dabc")).toThrow(
      /Invalid duration encoding/
    );
  });

  it("measured: turns are parsed without any range check", () => {
    // A public, attacker-supplied surface (scanned QR / pasted URL). Turns are a
    // bounded domain quantity; the decoder accepts any finite number.
    const decoded = decodeSequence("iiSS|nonox0|nonoc999999999999");
    expect(decoded.steps[0]!.motions.left.turns).toBe(999999999999);
  });

  it.fails("SHOULD PASS AFTER FIX: an out-of-domain turn count is refused", () => {
    expect(() => decodeSequence("iiSS|nonox0|nonoc999999999999")).toThrow();
  });
});
