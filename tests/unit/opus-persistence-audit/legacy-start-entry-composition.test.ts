/**
 * AUDIT REPRO — the legacy inline start entry is stripped on the publish path
 * and composed into a real beat on the owner path.
 *
 * `normalizeSequenceForPersistence` step 2 strips `stepNumber === 0` before
 * anything counts, composes, or hashes, and its comment states exactly what
 * happens otherwise: "`extractStepPairings` and `extractSoloProp` map `steps`
 * 1:1, so leaving it in mints a pairing and a solo-prop beat for a non-beat:
 * `sequenceLength` disagrees with the word by one, and the next pairings-only
 * republish throws IncompleteWordError on the letterless leading pairing — a
 * locked document."
 *
 * That strip lives in the normalizer, and the normalizer is wired into the
 * PUBLISH path only (`public-index-syncer.ts:88`). The owner save path calls
 * `ensureComposition` directly (`library-repository.ts:574`), which has no such
 * strip — so the described outcome is what an owner save produces today.
 *
 * QUARANTINE: `it.fails` marks the assertions that should pass once the strip
 * moves into the shared owner (`ensureComposition`) or the owner save routes
 * through the normalizer. This file is green while the defect is live.
 */
import { describe, expect, it } from "vitest";

import { ensureComposition, hydrate } from "$lib/shared/foundation/services/sequence-hydrator";
import { computeHash } from "$lib/shared/library/services/sequence-content-hasher";
import { normalizeSequenceForPersistence } from "$lib/shared/library/services/sequence-persistence-normalizer";
import { IncompleteWordError } from "$lib/shared/foundation/services/word-deriver";

import {
  asStoredDocument,
  buildSequence,
  makeLegacyStartEntry,
  makeStep,
} from "./fixtures";

/** Two content beats plus the legacy letterless start entry inside `steps`. */
const legacyDocument = () =>
  buildSequence([makeLegacyStartEntry(), makeStep(0, "A"), makeStep(1, "B")]);

describe("legacy inline start entry through the owner save path", () => {
  it("measured: the owner path mints a pairing and a solo-prop beat for the non-beat", () => {
    const stored = asStoredDocument(ensureComposition(legacyDocument()));

    // Two content beats were authored; three pairings were persisted.
    expect(stored.stepPairings).toHaveLength(3);
    expect(stored.leftSoloProp?.steps).toHaveLength(3);
    expect(stored.rightSoloProp?.steps).toHaveLength(3);
    // The extra leading pairing is letterless, because a start entry has no letter.
    expect(stored.stepPairings?.[0]?.letter).toBeNull();
    expect(stored.stepPairings?.slice(1).map((p) => p.letter)).toEqual(["A", "B"]);
  });

  it("measured: the publish path strips it, so the two paths disagree on length and identity", async () => {
    const legacy = legacyDocument();
    const normalized = await normalizeSequenceForPersistence(legacy);

    expect(normalized.sequenceLength).toBe(2);
    expect(normalized.exactWord).toBe("AB");
    // `library-repository.ts:424` hashes the sequence as handed in.
    expect(await computeHash(legacy)).not.toBe(normalized.contentHash);
  });

  it("measured: once composed by the owner path, the document can never be published", async () => {
    const reread = hydrate(asStoredDocument(ensureComposition(legacyDocument())));
    expect(reread.steps).toHaveLength(3);

    await expect(normalizeSequenceForPersistence(reread)).rejects.toBeInstanceOf(
      IncompleteWordError
    );
  });

  it.fails(
    "SHOULD PASS AFTER FIX: composition persists one pairing per content beat",
    () => {
      const stored = asStoredDocument(ensureComposition(legacyDocument()));
      expect(stored.stepPairings).toHaveLength(2);
    }
  );

  it.fails(
    "SHOULD PASS AFTER FIX: an owner-composed legacy document stays publishable",
    async () => {
      const reread = hydrate(asStoredDocument(ensureComposition(legacyDocument())));
      const normalized = await normalizeSequenceForPersistence(reread);
      expect(normalized.exactWord).toBe("AB");
    }
  );
});
