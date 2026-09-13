/**
 * AUDIT REPRO — identity hash is computed before the data it describes is final.
 *
 * `library-repository.saveSequence` computes the stored identity hash at
 * :424 (`computeHash(sequence)`) but only refreshes the compositional fields at
 * :574 (`ensureComposition(libSeq)`). `ensureComposition` DERIVES a
 * `startPosition` when the incoming sequence has none
 * (`sequence-hydrator.ts:250-254`), and `startPosition` is part of the hash
 * basis at every version (`sequence-content-hasher.ts:extractStartPosition`).
 *
 * So save #1 stores hash(document-without-start) next to a document that DOES
 * carry a start. The read path re-derives steps through `hydrate`
 * (`library-repository.ts:456-459` says so explicitly), so a save #2 with no
 * user edit hashes the start-bearing document, the two hashes differ, and
 * `decideFork` — same hash version, different hash — forks a brand-new
 * variation document (`library-repository.ts:466-490`, default
 * `visibility: "public"`).
 *
 * `normalizeSequenceForPersistence` already fixes the order for the PUBLISH
 * path ("8. Hash the normalized data — after every field it covers is final"),
 * but the owner save path does not route through it.
 *
 * ## What is proven here, and what is NOT
 *
 * PROVEN: the ordering defect. Given a sequence with no `startPosition`, the
 * hash stamped at save time does not describe the document that save writes,
 * and the next read/save cycle produces a different hash.
 *
 * NOT PROVEN: that anything reaches the save path in that shape. The corpus
 * run below strips `startPosition` itself — it is a controlled variable that
 * isolates the MECHANISM across 45 generated sequences, NOT a survey of stored
 * documents and NOT evidence of a current producer. This audit did not find a
 * runtime path that hands `saveSequence` a start-less sequence, and did not
 * have corpus access to count them. Exposure is therefore conditional: the
 * defect is real and latent, and becomes live only for whatever producer emits
 * that shape.
 *
 * QUARANTINE: the "should" assertions below are marked `it.fails`, so this file
 * is GREEN while the defect is live and turns RED the moment it is fixed —
 * whoever fixes it is told to flip the marker. `it(...)` blocks pin the
 * measured current behaviour and must stay green either way.
 */
import { describe, expect, it } from "vitest";

import {
  ensureComposition,
  hydrate,
} from "$lib/shared/foundation/services/sequence-hydrator";
import { computeHash } from "$lib/shared/library/services/sequence-content-hasher";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

import {
  asStoredDocument,
  buildSequence,
  makeStep,
  realCorpusSequences,
} from "./fixtures";

/** save #1: what `library-repository.ts:424` hashes. */
function hashAsSaved(sequence: SequenceData): Promise<string> {
  return computeHash(sequence);
}

/** save #2 with no edit: read the stored doc back, then hash it again. */
async function hashAfterReadBack(sequence: SequenceData): Promise<string> {
  return computeHash(hydrate(asStoredDocument(ensureComposition(sequence))));
}

const withoutStart = () => buildSequence([makeStep(0, "A"), makeStep(1, "B")]);

const withStart = () => ensureComposition(withoutStart());

describe("content hash operation order (library-repository.saveSequence)", () => {
  it("measured: a sequence saved with a startPosition keeps one stable identity", async () => {
    const sequence = withStart();
    expect(sequence.startPosition).toBeDefined();
    expect(await hashAfterReadBack(sequence)).toBe(await hashAsSaved(sequence));
  });

  it("measured: a sequence saved WITHOUT a startPosition gains one during the same save", async () => {
    const sequence = withoutStart();
    expect(sequence.startPosition).toBeUndefined();
    expect(ensureComposition(sequence).startPosition).toBeDefined();
  });

  it("measured: the stored hash therefore stops matching the document it describes", async () => {
    const sequence = withoutStart();
    expect(await hashAfterReadBack(sequence)).not.toBe(
      await hashAsSaved(sequence)
    );
  });

  it.fails(
    "SHOULD PASS AFTER FIX: hashing a startPosition-less sequence survives one save/read/save cycle",
    async () => {
      const sequence = withoutStart();
      expect(await hashAfterReadBack(sequence)).toBe(
        await hashAsSaved(sequence)
      );
    }
  );

  it("measured: the drift is caused by the derived start position, not by composition in general", async () => {
    // A controlled experiment over 45 generated sequences, NOT a survey of
    // stored data. Both runs use the same fixtures; the single variable is
    // whether the document carries its own start position, which this test
    // removes itself. That isolates the mechanism. It says nothing about how
    // many real documents are start-less — see the header.
    const corpus = realCorpusSequences();
    expect(corpus.length).toBeGreaterThan(20);

    let driftWithStart = 0;
    let driftWithoutStart = 0;
    for (const { sequence } of corpus) {
      if (
        (await hashAfterReadBack(sequence)) !== (await hashAsSaved(sequence))
      ) {
        driftWithStart++;
      }
      const stripped = {
        ...sequence,
        startPosition: undefined,
      } as SequenceData;
      if (
        (await hashAfterReadBack(stripped)) !== (await hashAsSaved(stripped))
      ) {
        driftWithoutStart++;
      }
    }

    expect(driftWithStart).toBe(0);
    expect(driftWithoutStart).toBe(corpus.length);
  });

  it("measured: a start-bearing sequence is the shape the generator actually emits", async () => {
    // The counterpart to the experiment above: every fixture as generated
    // carries a start position and is therefore NOT exposed to this defect.
    // Recorded so the 45/45 number above can never be read as prevalence.
    const corpus = realCorpusSequences();
    expect(
      corpus.every(({ sequence }) => sequence.startPosition !== undefined)
    ).toBe(true);
  });
});
