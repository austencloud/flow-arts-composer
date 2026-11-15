import { describe, expect, it } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { InfoCellChoice } from "#lib/shared/sequence-viewer/services/info-cell-display.js";
import {
  buildGalleryRenderInput,
  galleryQrPolicy,
  type GalleryCompositionSource,
} from "./gallery-render-input";
import { deriveKey } from "./thumbnail-key-deriver";

const sequence = (steps: number) =>
  ({
    id: `seq-${steps}`,
    word: "A",
    steps: Array.from({ length: steps }, () => ({})),
  }) as unknown as SequenceData;

function composition(
  choice: InfoCellChoice = "qr"
): GalleryCompositionSource {
  return {
    getStartPlacementLayoutForStepCount: () => "row",
    getInfoCellChoiceForStepCount: () => choice,
    showQRCode: true,
    showMandala: true,
  };
}

const build = (
  extra: Partial<Parameters<typeof buildGalleryRenderInput>[0]> & {
    steps?: number;
    choice?: InfoCellChoice;
  } = {}
) => {
  const { steps = 4, choice, ...rest } = extra;
  return buildGalleryRenderInput({
    sequence: sequence(steps),
    compositionManager: composition(choice),
    isAuthenticated: true,
    ...rest,
  });
};

describe("a gallery grid card", () => {
  for (const [who, isAuthenticated] of [
    ["signed in", true],
    ["a guest", false],
  ] as const) {
    it(`never draws a QR for ${who}, and the spare square is the mandala`, () => {
      for (const steps of [2, 4, 6, 8, 16]) {
        const input = build({ steps, isAuthenticated, gridCard: true });
        expect(input.visibility?.showQRCode).toBe(false);
        expect(input.visibility?.showMandala).toBe(true);
      }
    });
  }

  it("is the picture a signed-in reader was always shown first", () => {
    // Today's first picture: the QR input with only its QR switched off.
    for (const steps of [2, 4, 6, 8, 16]) {
      const wantsQr = build({ steps });
      const firstPicture = {
        ...wantsQr,
        visibility: { ...wantsQr.visibility, showQRCode: false },
      };
      const grid = build({ steps, gridCard: true });
      expect(deriveKey(grid).hash).toBe(deriveKey(firstPicture).hash);
    }
  });

  it("keeps a per-length 'none' pick empty instead of filling it with the mandala", () => {
    const today = build({ choice: "none" });
    const grid = build({ choice: "none", gridCard: true });
    expect(today.visibility).toMatchObject({ showQRCode: false, showMandala: false });
    expect(deriveKey(grid).hash).toBe(deriveKey(today).hash);
  });

  it("keeps a one-count card as it was", () => {
    expect(deriveKey(build({ steps: 1, gridCard: true })).hash).toBe(
      deriveKey(build({ steps: 1 })).hash
    );
  });

  it("asks for no QR policy, so nothing is prepared or allocated", () => {
    expect(galleryQrPolicy({ isAuthenticated: true, gridCard: true })).toBeUndefined();
    expect(galleryQrPolicy({ isAuthenticated: false, gridCard: true })).toBeUndefined();
  });

  it("drops a QR an explicit visibility asked for", () => {
    const input = build({
      gridCard: true,
      visibility: { showQRCode: true, showMandala: true },
    });
    expect(input.visibility?.showQRCode).toBe(false);
  });
});

describe("cards that are not grid cards", () => {
  it("still draw a QR for a signed-in reader on a gallery card", () => {
    expect(build().visibility?.showQRCode).toBe(true);
  });

  it("still ask a guest's gallery card for the prepared QR", () => {
    expect(build({ isAuthenticated: false }).visibility?.showQRCode).toBe(true);
  });

  it("keep their QR policies", () => {
    expect(galleryQrPolicy({ isAuthenticated: true })).toBe("background");
    expect(galleryQrPolicy({ isAuthenticated: false })).toBe("prepared-only");
    expect(galleryQrPolicy({ variant: "wordcard", isAuthenticated: true })).toBeUndefined();
  });

  it("keep a viewer's wordcard QR for a signed-in reader and none for a guest", () => {
    expect(build({ variant: "wordcard" }).visibility?.showQRCode).toBe(true);
    expect(
      build({ variant: "wordcard", isAuthenticated: false }).visibility?.showQRCode
    ).toBe(false);
  });
});
