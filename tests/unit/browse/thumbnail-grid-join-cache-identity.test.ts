/**
 * A joined-grid card is a different image of the same sequence, so the join
 * must be part of the thumbnail cache identity, in the hash and in the cloud
 * filename. One-grid keys must not move, or the whole warmed population would
 * cold-start.
 */

import { describe, expect, it } from "vitest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  deriveKey,
  type ThumbnailRenderInput,
} from "$lib/shared/browse/services/thumbnail-key-deriver";
import {
  DEFAULT_GALLERY_COMPOSITION,
  buildGalleryRenderInput,
} from "$lib/shared/browse/services/gallery-render-input";

const galleryInput: ThumbnailRenderInput = {
  sequenceName: "AB",
  sequenceId: "public-1",
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
  catDogModeEnabled: false,
  lightMode: false,
  variant: "gallery",
};

function sequence(fields: Partial<SequenceData>): SequenceData {
  return {
    id: "public-1",
    name: "AB",
    word: "AB",
    steps: [{}, {}],
    ...fields,
  } as unknown as SequenceData;
}

function inputFor(fields: Partial<SequenceData>): ThumbnailRenderInput {
  return buildGalleryRenderInput({
    sequence: sequence(fields),
    leftPropType: PropType.STAFF,
    rightPropType: PropType.STAFF,
    compositionManager: DEFAULT_GALLERY_COMPOSITION,
    isAuthenticated: false,
  });
}

describe("joined-grid thumbnail cache identity", () => {
  it("keys a joined card apart from the one-grid card, in hash and filename", () => {
    const joined = deriveKey({ ...galleryInput, gridJoin: "e1" });
    const single = deriveKey(galleryInput);
    expect(joined.hash).not.toBe(single.hash);
    expect(joined.cloudPath).toContain("_je1-t3_");
    expect(single.cloudPath).not.toContain("_j");
    // Each join is its own image.
    expect(deriveKey({ ...galleryInput, gridJoin: "e2" }).hash).not.toBe(
      joined.hash
    );
  });

  it("leaves one-grid keys byte-identical", () => {
    // The hash main produced before joins existed.
    expect(deriveKey(galleryInput).hash).toBe("-382kas");
    expect(inputFor({}).gridJoin).toBeUndefined();
    expect(deriveKey(inputFor({})).hash).toBe(
      deriveKey(inputFor({ conjoined: undefined })).hash
    );
  });

  it("names the join from the sequence alone", () => {
    expect(inputFor({ conjoined: { toward: "e", steps: 1 } }).gridJoin).toBe(
      "e1"
    );
    // A join a step carries on its own changes nothing: one join per sequence.
    expect(
      inputFor({
        conjoined: { toward: "e", steps: 1 },
        steps: [{}, { conjoined: null }] as never,
      }).gridJoin
    ).toBe("e1");
    expect(
      inputFor({
        steps: [{ conjoined: { toward: "ne", steps: 2 } }, {}] as never,
      }).gridJoin
    ).toBeUndefined();
  });
});
