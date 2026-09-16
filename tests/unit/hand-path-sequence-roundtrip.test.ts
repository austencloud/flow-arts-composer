import { describe, expect, it } from "vitest";
import { getHandPathReferenceCards } from "$lib/features/choreo-card/domain/hand-path-reference-cards";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { hydrate } from "$lib/shared/foundation/services/sequence-hydrator";
import { normalizeSequenceForPersistence } from "$lib/shared/library/services/sequence-persistence-normalizer";
import { computeHash } from "$lib/shared/library/services/sequence-content-hasher";
import {
  encodeSequence,
  decodeSequenceFromQR,
} from "$lib/shared/navigation/services/sequence-encoder";
import { buildHandPathShortCodePayload } from "$lib/shared/qr/services/hand-path-short-code-payload";
import { hydrateSelfContainedShortCodePayload } from "$lib/shared/qr/services/short-code-payload-hydrator";

describe("saved hand-path cards", () => {
  it.each(getHandPathReferenceCards())(
    "$cardTitle survives save, reload, and QR without inventing a word",
    async ({ sequence, cardTitle }) => {
      const saved = await normalizeSequenceForPersistence(sequence);
      expect(saved.ownerData).not.toHaveProperty("steps");
      const reloaded = hydrate(createSequenceData(saved.ownerData));
      expect(reloaded.sequenceKind).toBe("hand-path");
      expect(reloaded.word).toBe("");
      expect(reloaded.displayName).toBe(cardTitle);
      expect(reloaded.steps).toHaveLength(4);
      expect(await computeHash(reloaded)).toBe(saved.contentHash);
      const record = await buildHandPathShortCodePayload(reloaded);
      const scan = await hydrateSelfContainedShortCodePayload("TEST01", record);
      expect(scan).toMatchObject({
        sequenceKind: "hand-path",
        word: "",
        displayName: cardTitle,
        notes: sequence.notes,
      });
      expect(scan?.startPlacement?.motions.left?.startLocation).toBe(
        sequence.startPlacement?.motions.left?.startLocation
      );
      expect(
        scan?.steps.map((s) => [
          s.motions.left?.endLocation,
          s.motions.right?.endLocation,
        ])
      ).toEqual(
        sequence.steps.map((s) => [
          s.motions.left?.endLocation,
          s.motions.right?.endLocation,
        ])
      );
      const offline = await decodeSequenceFromQR(record.encoded!);
      expect(offline.sequenceKind).toBe("hand-path");
      expect(offline.steps).toHaveLength(4);
      expect(
        await hydrateSelfContainedShortCodePayload("TEST01", {
          ...record,
          sequenceData: undefined,
        })
      ).toMatchObject({
        sequenceKind: "hand-path",
        displayName: cardTitle,
        word: "",
      });
      expect(
        await hydrateSelfContainedShortCodePayload("TEST01", {
          ...record,
          payloadStepCount: 8,
        })
      ).toBeNull();
    }
  );

  it("keeps hands-only artifacts distinct from the same movements performed with props", async () => {
    const sequence = getHandPathReferenceCards()[0]!.sequence;
    const prop = { ...sequence, sequenceKind: undefined };
    expect(encodeSequence(sequence)).not.toBe(encodeSequence(prop));
    expect(await computeHash(sequence)).not.toBe(await computeHash(prop));
    expect(await computeHash(prop)).toBe(
      await computeHash({ ...prop, sequenceKind: "prop" })
    );
  });
});
