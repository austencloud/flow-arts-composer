import { describe, expect, it } from "vitest";
import {
  isQrArtwork,
  posterQrAppearance,
} from "$lib/shared/share/components/post-studio/post-qr-image-appearance";

describe("QR artwork detection", () => {
  it("accepts a full-image link code and retains its exact payload", () => {
    expect(
      isQrArtwork(
        [
          {
            rawValue: "https://tka.run/abc?view=sequence",
            boundingBox: { width: 420, height: 420 },
          },
        ],
        480,
        480
      )
    ).toBe("https://tka.run/abc?view=sequence");
  });

  it("leaves photos, multiple codes and non-link codes alone", () => {
    const code = {
      rawValue: "https://tka.run/abc",
      boundingBox: { width: 100, height: 100 },
    };
    expect(isQrArtwork([code], 480, 480)).toBeNull();
    expect(isQrArtwork([code, code], 120, 120)).toBeNull();
    expect(
      isQrArtwork([{ ...code, rawValue: "plain text" }], 120, 120)
    ).toBeNull();
  });
});

describe("poster QR appearance", () => {
  it("uses the card's mode before the viewer default", () => {
    const options = { visibilityOverrides: { darkMode: true } };
    const card = {
      kind: "card" as const,
      cardAppearance: { darkMode: false },
    };
    expect(
      posterQrAppearance(
        options,
        card as Parameters<typeof posterQrAppearance>[1]
      )
    ).toBe("light");
    expect(posterQrAppearance(options, null)).toBe("dark");
  });
});
