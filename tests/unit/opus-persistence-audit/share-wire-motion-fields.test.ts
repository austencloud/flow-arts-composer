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
import { createStartPlacementData } from "$lib/shared/foundation/domain/factories/create-start-placement-data";
import {
  ensureComposition,
  hydrate,
} from "$lib/shared/foundation/services/sequence-hydrator";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

import {
  asStoredDocument,
  buildSequence,
  diffMotionIdentity,
  makeStep,
  motionAt,
  realCorpusSequences,
} from "./fixtures";

const startCell = () =>
  createStartPlacementData({
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
    { startPlacement: startCell() }
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

  it("measured: TWO hash-basis fields diverge over the wire — plane is dropped, handPath is synthesized", () => {
    // An earlier revision of this file omitted `handPath` from the compared
    // set and concluded "plane is the only field that diverges". That was
    // wrong: `handPath` is in the V3 hash basis
    // (`sequence-content-hasher.ts:198`), and the decoder assigns it a value
    // the source did not have. That synthesis moves the corpus identity hash;
    // dropping `plane` only moves it for a non-wall authored plane because the
    // V3 hasher defaults an absent plane to wall.
    const corpus = realCorpusSequences();
    let motionsChecked = 0;
    let planeDropped = 0;
    let handPathSynthesized = 0;
    const otherDivergences: string[] = [];

    for (const { label, sequence } of corpus) {
      const back = decodeSequence(encodeSequence(sequence));
      motionsChecked += sequence.steps.length * 2;
      for (const line of diffMotionIdentity(sequence, back)) {
        if (line.includes(".plane:")) planeDropped++;
        else if (line.includes(".handPath:")) handPathSynthesized++;
        else otherDivergences.push(`${label}: ${line}`);
      }
    }

    expect(motionsChecked).toBeGreaterThan(500);
    // Every generated motion carries `plane: "wall"`; every one comes back absent.
    expect(planeDropped).toBe(motionsChecked);
    // Every generated motion carries `handPath: null`; the decoder derives
    // cw/ccw/dash for every one via `getHandpathDirection`.
    expect(handPathSynthesized).toBe(motionsChecked);
    // Everything else — locations, orientations, motion types, rotation
    // directions, turns — survives the orientation-chaining decoder, so this
    // is field coverage, not a broken derivation.
    expect(otherDivergences).toEqual([]);
  });

  it("measured: the composition round trip diverges on neither field", () => {
    // The contrast that localizes both divergences to the WIRE format. Same
    // fixtures, same comparison, through save/read instead of encode/decode.
    for (const { label, sequence } of realCorpusSequences()) {
      const back = hydrate(asStoredDocument(ensureComposition(sequence)));
      expect(
        diffMotionIdentity(sequence, back).map((l) => `${label}: ${l}`)
      ).toEqual([]);
    }
  });

  it("measured: handPath is unset on every generated motion — a generator property, not a corpus survey", () => {
    // Bounds the finding above. The synthesis is only observable because the
    // source value is null. How many STORED documents carry a null handPath is
    // not measurable from here, so no prevalence is claimed either way.
    const corpus = realCorpusSequences();
    const values = new Set<unknown>();
    for (const { sequence } of corpus) {
      for (const step of sequence.steps) {
        values.add(step.motions.left.handPath ?? null);
        values.add(step.motions.right.handPath ?? null);
      }
    }
    expect([...values]).toEqual([null]);
  });

  it("measured: per-beat letters are not carried by the wire format", () => {
    // Recovered downstream by `navigation/sequence-hydrator.hydrateSequence`,
    // which re-derives letters and the word for every decoded sequence. Pinned
    // here so the loss stays a deliberate, recovered one.
    const corpus = realCorpusSequences();
    const back = decodeSequence(encodeSequence(corpus[0]!.sequence));
    expect(corpus[0]!.sequence.steps.some((s) => s.letter !== null)).toBe(true);
    expect(back.steps.every((s) => s.letter === null)).toBe(true);
    expect(back.word).toBe("");
  });

  it.fails(
    "SHOULD PASS AFTER FIX: an authored plane survives a share round trip",
    () => {
      const back = decodeSequence(encodeSequence(authoredSequence()));
      expect(back.steps[0]!.motions.left.plane).toBe("wheel");
    }
  );

  it.fails(
    "SHOULD PASS AFTER FIX: authored skew survives a share round trip",
    () => {
      const back = decodeSequence(encodeSequence(authoredSequence()));
      expect(back.steps[0]!.motions.left.skewSteps).toBe(2);
      expect(back.steps[0]!.motions.left.skewDir).toBe("+");
    }
  );
});

describe("share/QR flat wire format input validation", () => {
  it("measured: malformed segments are refused with a typed error, not silently repaired", () => {
    expect(() => decodeSequence("")).toThrow(/empty sequence/i);
    expect(() => decodeSequence("garbage")).toThrow(/missing data/i);
    expect(() => decodeSequence("iiSS|nonox0|zzzzc0")).toThrow(
      /Invalid motion encoding/
    );
    expect(() => decodeSequence("iiSS|nonox0|nonocNaN")).toThrow(
      /Invalid motion encoding/
    );
    expect(() => decodeSequence("iiSS|nonox0|nonoc0:nonoc0:dabc")).toThrow(
      /Invalid duration encoding/
    );
  });

  it("measured: a very large finite turn count is accepted verbatim", () => {
    // This is the whole measurement, and its scope is deliberately narrow: the
    // decoder's guard is shape-only (`/^-?(?:\d+(?:\.\d*)?|\.\d+)$/` plus
    // `Number.isFinite`), so a huge finite value passes through unchanged on a
    // public, attacker-supplied surface (scanned QR / pasted URL).
    //
    // NO CLAIM IS MADE ABOUT WHAT THE LEGAL SET IS. `Motion.turns` is typed
    // `number | "fl"` (`packages/tka-types/src/motion.ts:30`) with no bound,
    // and `rg` for a turns validator across `packages/tka-types`,
    // `packages/sequence-engine` and `src/lib/shared/pictograph` finds none —
    // only prose in `IOrientationPropagator.ts:21` ("0, 0.5, 1, 1.5, 2, etc.").
    // There is therefore nothing in-repo to bind a range check to, and this
    // audit will not invent a palette. Whether an upper bound exists at all is
    // an OPEN QUESTION for the canonical domain owner (Flow Arts MCP), which
    // was not reachable from this checkout. No `it.fails` is written for it:
    // that would assert a policy nobody has approved.
    const decoded = decodeSequence("iiSS|nonox0|nonoc999999999999");
    expect(decoded.steps[0]!.motions.left.turns).toBe(999999999999);
  });
});
