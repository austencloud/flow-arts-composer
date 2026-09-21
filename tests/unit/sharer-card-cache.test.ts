import { describe, expect, it, vi } from "vitest";
import type { SequenceData } from "../../src/lib/shared/foundation/domain/models/sequence-data";
import type { SequenceRenderer } from "../../src/lib/shared/render/services/sequence-renderer";

const cardRenderState = vi.hoisted(() => ({
  options: { marker: "initial" } as Record<string, unknown>,
}));

vi.mock("../../src/lib/shared/share/services/card-render-options", () => ({
  buildCardRenderOptions: vi.fn(() => cardRenderState.options),
}));

import {
  CARD_BLOB_CACHE_MAX_BYTES,
  Sharer,
} from "../../src/lib/shared/share/services/sharer";

function makeSequence(word = "TEST"): SequenceData {
  return {
    id: "sequence-1",
    word,
    name: word,
    steps: [{ letter: "A" }],
    metadata: {},
  } as unknown as SequenceData;
}

function makeSharer() {
  const renderSequenceToBlob = vi.fn(async () => {
    return new Blob([`render-${renderSequenceToBlob.mock.calls.length}`], {
      type: "image/png",
    });
  });
  const sharer = new Sharer({
    renderSequenceToBlob,
  } as unknown as SequenceRenderer);

  return { sharer, renderSequenceToBlob };
}

describe("Sharer card blob cache", () => {
  it("renders the live preview's resolved options despite later global settings", async () => {
    const { sharer, renderSequenceToBlob } = makeSharer();
    const sequence = makeSequence();
    const snapshot = {
      columnCount: 2,
      visibilityOverrides: { showTKA: false, darkMode: true },
      customNotesText: "This card",
    };
    cardRenderState.options = {
      columnCount: 8,
      customNotesText: "Later settings",
    };
    const first = await sharer.getCardImageBlob(sequence, {
      darkMode: true,
      resolvedRenderOptions: snapshot,
    });
    expect(renderSequenceToBlob.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining(snapshot)
    );
    cardRenderState.options = { columnCount: 4 };
    const second = await sharer.getCardImageBlob(sequence, {
      darkMode: true,
      resolvedRenderOptions: snapshot,
    });
    expect(second).toBe(first);
    expect(renderSequenceToBlob).toHaveBeenCalledTimes(1);
  });

  it("reuses the exact rendered card and its in-flight render", async () => {
    cardRenderState.options = { marker: "initial" };
    const { sharer, renderSequenceToBlob } = makeSharer();
    const sequence = makeSequence();

    const [first, concurrent] = await Promise.all([
      sharer.getCardImageBlob(sequence, {
        darkMode: false,
      }),
      sharer.getCardImageBlob(sequence, {
        darkMode: false,
      }),
    ]);
    const cached = await sharer.getCardImageBlob(sequence, {
      darkMode: false,
    });

    expect(renderSequenceToBlob).toHaveBeenCalledTimes(1);
    expect(concurrent).toBe(first);
    expect(cached).toBe(first);
  });

  it("renders again when sequence content or card settings change", async () => {
    cardRenderState.options = { marker: "initial" };
    const { sharer, renderSequenceToBlob } = makeSharer();

    await sharer.getCardImageBlob(makeSequence("FIRST"), {
      darkMode: false,
    });
    await sharer.getCardImageBlob(makeSequence("SECOND"), {
      darkMode: false,
    });

    cardRenderState.options = { marker: "changed" };
    await sharer.getCardImageBlob(makeSequence("SECOND"), {
      darkMode: false,
    });

    expect(renderSequenceToBlob).toHaveBeenCalledTimes(3);
  });

  it("clears a rejected in-flight render so the next request can retry", async () => {
    cardRenderState.options = { marker: "retry" };
    const recoveredBlob = new Blob(["recovered"], { type: "image/png" });
    const renderSequenceToBlob = vi
      .fn()
      .mockRejectedValueOnce(new Error("render failed"))
      .mockResolvedValueOnce(recoveredBlob);
    const sharer = new Sharer({
      renderSequenceToBlob,
    } as unknown as SequenceRenderer);
    const sequence = makeSequence("RETRY");

    await expect(
      sharer.getCardImageBlob(sequence, {
        darkMode: false,
      })
    ).rejects.toThrow("render failed");
    await expect(
      sharer.getCardImageBlob(sequence, {
        darkMode: false,
      })
    ).resolves.toBe(recoveredBlob);

    expect(renderSequenceToBlob).toHaveBeenCalledTimes(2);
  });

  it("evicts the least recently used card after the bounded cache fills", async () => {
    cardRenderState.options = { marker: "lru" };
    const { sharer, renderSequenceToBlob } = makeSharer();
    const options = { darkMode: false };

    await sharer.getCardImageBlob(makeSequence("A"), options);
    await sharer.getCardImageBlob(makeSequence("B"), options);
    await sharer.getCardImageBlob(makeSequence("C"), options);
    await sharer.getCardImageBlob(makeSequence("A"), options);
    await sharer.getCardImageBlob(makeSequence("D"), options);
    await sharer.getCardImageBlob(makeSequence("B"), options);
    await sharer.getCardImageBlob(makeSequence("A"), options);

    expect(renderSequenceToBlob).toHaveBeenCalledTimes(5);
  });

  it("evicts by total blob bytes even before the entry limit is reached", async () => {
    cardRenderState.options = { marker: "byte-budget" };
    const blobSize = Math.floor(CARD_BLOB_CACHE_MAX_BYTES / 2) + 1;
    const renderSequenceToBlob = vi.fn(async () => {
      return new Blob([new Uint8Array(blobSize)], { type: "image/png" });
    });
    const sharer = new Sharer({
      renderSequenceToBlob,
    } as unknown as SequenceRenderer);
    const options = { darkMode: false };

    await sharer.getCardImageBlob(makeSequence("A"), options);
    await sharer.getCardImageBlob(makeSequence("B"), options);
    await sharer.getCardImageBlob(makeSequence("A"), options);

    expect(renderSequenceToBlob).toHaveBeenCalledTimes(3);
  });

  it("returns but does not retain a card larger than the cache budget", async () => {
    cardRenderState.options = { marker: "oversized" };
    const oversized = new Blob(
      [new Uint8Array(CARD_BLOB_CACHE_MAX_BYTES + 1)],
      { type: "image/png" }
    );
    const renderSequenceToBlob = vi.fn(async () => oversized);
    const sharer = new Sharer({
      renderSequenceToBlob,
    } as unknown as SequenceRenderer);
    const sequence = makeSequence("OVERSIZED");
    const options = { darkMode: false };

    await expect(sharer.getCardImageBlob(sequence, options)).resolves.toBe(
      oversized
    );
    await expect(sharer.getCardImageBlob(sequence, options)).resolves.toBe(
      oversized
    );

    expect(renderSequenceToBlob).toHaveBeenCalledTimes(2);
  });
});
