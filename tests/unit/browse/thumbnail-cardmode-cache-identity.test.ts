/**
 * `cardMode` switches the composer to the 5:7 playing-card layout
 * (thumbnail-renderer.ts buildRenderOptions -> `cardMode`), so it is part of the
 * rendered image and must be part of the cache identity.
 *
 * It was absent from `checkInputUsesDefaults` and from both hash branches, which
 * let a card-layout raster and a standard raster share one hash — reachable
 * today through the card designer's print toggle (CardPreviewStack passes
 * `cardMode={!printMode}` while ChoreoCard resolves BOTH states to
 * `lightMode: true`), in the personal memory + IndexedDB tiers.
 *
 * Two properties this pins:
 *  - a cardMode render has its own identity;
 *  - adding it changes NO existing key: the field only enters the hash when it
 *    is true (same shape as `primaryPropColors`), and a cardMode input is no
 *    longer shared-classified, so the static/cloud population is untouched and
 *    no THUMBNAIL_RENDERER_VERSION bump is required.
 */

import { describe, expect, it } from "vitest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  deriveKey,
  inputUsesDefaults,
  type ThumbnailRenderInput,
} from "$lib/shared/browse/services/thumbnail-key-deriver";

const galleryInput: ThumbnailRenderInput = {
  sequenceName: "AB",
  sequenceId: "public-1",
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
  catDogModeEnabled: false,
  lightMode: false,
  variant: "gallery",
};

/** The designer's card face: wordcard variant, notes footer, mandalas off —
 *  which is why it is a personal (non-shared) cache class. */
const designerCard: ThumbnailRenderInput = {
  ...galleryInput,
  variant: "wordcard",
  lightMode: true,
  showNotes: true,
  customNotesText: "🔥 FireDrums 2026 🔥",
  visibility: { showQRCode: true, showMandala: false },
};

describe("cardMode cache identity", () => {
  it("gives the 5:7 card layout a different hash from the standard layout", () => {
    expect(deriveKey({ ...designerCard, cardMode: true }).hash).not.toBe(
      deriveKey({ ...designerCard, cardMode: false }).hash
    );
    // `undefined` and `false` are the same render, so they stay one key.
    expect(deriveKey({ ...designerCard, cardMode: false }).hash).toBe(
      deriveKey(designerCard).hash
    );
  });

  it("keeps a cardMode render out of the shared static/cloud class", () => {
    // The shared tiers hold one layout per (variant, prop, mode, qr) and the
    // shared hash branch does not name cardMode, so a card-layout render must
    // never be classified as shareable.
    expect(inputUsesDefaults({ ...galleryInput, cardMode: true })).toBe(false);
    expect(deriveKey({ ...galleryInput, cardMode: true }).usesDefaults).toBe(
      false
    );
  });

  it("leaves every existing key byte-identical", () => {
    // Regression guard for the whole warmed population: adding a field to the
    // hash input is only safe because it appears when cardMode is true. These
    // are the hashes main produced before the fix.
    expect(deriveKey(galleryInput).hash).toBe("-382kas");
    expect(deriveKey({ ...galleryInput, cardMode: false }).hash).toBe(
      "-382kas"
    );
    expect(deriveKey(designerCard).hash).toBe("30dl4f");
    expect(deriveKey({ ...galleryInput, variant: "wordcard" }).hash).toBe(
      "-iwx7i2"
    );
  });
});
