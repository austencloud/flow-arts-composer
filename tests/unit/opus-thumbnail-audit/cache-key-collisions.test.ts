/**
 * Audit repro: thumbnail cache-key identity vs. what the renderer actually draws.
 *
 * These tests are OBSERVATIONS of current `main`, not desired behavior. Each
 * assertion that encodes a defect is marked DEFECT and says what it should
 * become once the production fix lands, so the suite is a regression tripwire
 * either way.
 *
 * Owner of the key: src/lib/shared/browse/services/thumbnail-key-deriver.ts
 * Owner of the raster: src/lib/shared/browse/services/thumbnail-renderer.ts
 */

import { describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  deriveKey,
  inputUsesDefaults,
  THUMBNAIL_RENDERER_VERSION,
  type ThumbnailRenderInput,
} from "$lib/shared/browse/services/thumbnail-key-deriver";
import { ThumbnailRenderer } from "$lib/shared/browse/services/thumbnail-renderer";

const sequence = {
  id: "public-1",
  word: "AB",
  steps: [{ id: "step-1", motions: {} }],
  loopType: null,
} as unknown as SequenceData;

const galleryInput: ThumbnailRenderInput = {
  sequenceName: "AB",
  sequenceId: "public-1",
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
  catDogModeEnabled: false,
  lightMode: false,
  variant: "gallery",
};

interface ComposedOptions {
  cardMode?: boolean;
  visibilityOverrides?: { showMandala?: boolean };
}

/** Runs the real ThumbnailRenderer and returns the options it hands the
 *  composition owner. The dispatcher is the only stubbed seam. */
async function composeOptionsFor(
  input: ThumbnailRenderInput
): Promise<ComposedOptions> {
  const compose = vi.fn(async () => new Blob(["x"], { type: "image/webp" }));
  const renderer = new ThumbnailRenderer(
    { compose } as never,
    { deriveFromFirstStep: vi.fn() } as never,
    null,
    { detectLOOPType: vi.fn(() => ({ loopType: null })) } as never
  );
  await renderer.render(sequence, input);
  return compose.mock.calls[0]?.[1] as ComposedOptions;
}

describe("thumbnail cache key vs. rendered image", () => {
  it("DEFECT: an explicit mandala render and an unset-mandala render share one key and one cloud path", async () => {
    // Both inputs are "default settings" as far as the key deriver is
    // concerned: `true` equals its canonical default, and `undefined` is
    // skipped by every check in checkInputUsesDefaults().
    const withMandala: ThumbnailRenderInput = {
      ...galleryInput,
      visibility: { showQRCode: false, showMandala: true },
    };
    const mandalaUnset: ThumbnailRenderInput = {
      ...galleryInput,
      visibility: { showQRCode: false },
    };

    expect(inputUsesDefaults(withMandala)).toBe(true);
    expect(inputUsesDefaults(mandalaUnset)).toBe(true);

    const a = deriveKey(withMandala);
    const b = deriveKey(mandalaUnset);

    // DEFECT: the shared-class hash branch omits showMandala, so these two
    // inputs are indistinguishable to every cache tier and to the shared
    // Storage path. Should become toBe(false)/not.toBe(...) once showMandala
    // is either hashed or normalized before the key is derived.
    expect(a.hash).toBe(b.hash);
    expect(a.cloudPath).toBe(b.cloudPath);

    // ...while the renderer draws two different images from them: the renderer
    // falls back to `false` on undefined, but the key deriver's canonical
    // default for the same field is `true`.
    const drawnWith = await composeOptionsFor(withMandala);
    const drawnUnset = await composeOptionsFor(mandalaUnset);
    expect(drawnWith.visibilityOverrides?.showMandala).toBe(true);
    expect(drawnUnset.visibilityOverrides?.showMandala).toBe(false);
  });

  it("DEFECT: cardMode changes the layout but is absent from both hash branches", async () => {
    const standard: ThumbnailRenderInput = { ...galleryInput };
    const playingCard: ThumbnailRenderInput = {
      ...galleryInput,
      cardMode: true,
    };

    const a = deriveKey(standard);
    const b = deriveKey(playingCard);

    // DEFECT: neither the usesDefaults branch nor buildFullHashInput() mentions
    // cardMode, and checkInputUsesDefaults() does not disqualify it, so the 5:7
    // playing-card raster and the standard raster occupy the same memory /
    // IndexedDB / cloud identity.
    expect(a.hash).toBe(b.hash);
    expect(a.cloudPath).toBe(b.cloudPath);
    expect(a.usesDefaults).toBe(true);
    expect(b.usesDefaults).toBe(true);

    const drawnStandard = await composeOptionsFor(standard);
    const drawnCard = await composeOptionsFor(playingCard);
    expect(drawnStandard.cardMode).toBe(false);
    expect(drawnCard.cardMode).toBe(true);
  });

  it("DEFECT: cardMode also collides inside the personal (non-default) hash branch", () => {
    // The ChoreoCard path always sets customNotesText, which forces
    // usesDefaults=false — so that surface is only exposed through the personal
    // memory + IndexedDB tiers, not the shared cloud path.
    const base: ThumbnailRenderInput = {
      ...galleryInput,
      variant: "wordcard",
      customNotesText: "🔥 FireDrums 2026 🔥",
    };
    expect(inputUsesDefaults(base)).toBe(false);
    expect(deriveKey(base).hash).toBe(
      deriveKey({ ...base, cardMode: true }).hash
    );
  });

  it("keeps the fields that ARE hashed isolated (control)", () => {
    const hash = (patch: Partial<ThumbnailRenderInput>) =>
      deriveKey({ ...galleryInput, ...patch }).hash;
    const baseline = hash({});

    expect(hash({ lightMode: true })).not.toBe(baseline);
    expect(
      hash({ leftPropType: PropType.FAN, rightPropType: PropType.FAN })
    ).not.toBe(baseline);
    expect(hash({ variant: "wordcard" })).not.toBe(baseline);
    expect(hash({ sequenceId: "public-2" })).not.toBe(baseline);
    expect(hash({ visibility: { showQRCode: true } })).not.toBe(baseline);
    expect(hash({ startPositionLayout: "column" })).not.toBe(baseline);
    expect(
      hash({ primaryPropColors: { left: "#0ff", right: "#f0f" } })
    ).not.toBe(baseline);
  });
});

describe("cache-key hash strength", () => {
  // The 24 TKA letters, used to build realistic gallery words.
  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWX".split("");
  const PROPS = [
    PropType.STAFF,
    PropType.FAN,
    PropType.CLUB,
    PropType.BUUGENG,
    PropType.MINIHOOP,
  ];

  /** A population shaped like a real signed-in gallery: every word × the props
   *  a user can select × both modes × QR on/off. */
  function productionShapedKeys(wordCount: number): string[] {
    const words: string[] = [];
    for (let i = 0; words.length < wordCount; i++) {
      const a = LETTERS[i % LETTERS.length]!;
      const b = LETTERS[Math.floor(i / LETTERS.length) % LETTERS.length]!;
      const c =
        LETTERS[
          Math.floor(i / (LETTERS.length * LETTERS.length)) % LETTERS.length
        ]!;
      words.push(
        i < LETTERS.length
          ? a
          : i < LETTERS.length ** 2
            ? `${a}${b}`
            : `${a}${b}${c}`
      );
    }

    const hashes: string[] = [];
    words.forEach((word, index) => {
      for (const prop of PROPS) {
        for (const lightMode of [false, true]) {
          for (const qr of [false, true]) {
            hashes.push(
              deriveKey({
                ...galleryInput,
                sequenceName: word,
                sequenceId: `public-${index}`,
                leftPropType: prop,
                rightPropType: prop,
                lightMode,
                visibility: { showQRCode: qr, showMandala: true },
              }).hash
            );
          }
        }
      }
    });
    return hashes;
  }

  it("measures collisions in the 32-bit key space for a gallery-scale population", () => {
    // computeHash() is a 32-bit Java-style string hash, so the expected
    // collision count for n distinct keys is ~n^2 / 2^33 — about 0.012 at
    // n = 10,000. Measured on this key shape: zero. Recorded as a tripwire for
    // a future key-shape change that starts colliding (a collision serves one
    // sequence's raster for another).
    const hashes = productionShapedKeys(500);
    expect(hashes).toHaveLength(10_000);
    expect(new Set(hashes).size).toBe(10_000);
  });

  it("pins the renderer version that every tier keys on", () => {
    // A silent bump without a manifest regeneration is a whole-population cold
    // cache, so the number is worth a tripwire.
    expect(THUMBNAIL_RENDERER_VERSION).toBe(6);
    expect(deriveKey(galleryInput).cloudPath).toContain(
      `_r${THUMBNAIL_RENDERER_VERSION}_dark.webp`
    );
  });
});
