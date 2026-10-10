import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock() factories are hoisted above every top-level statement, including
// plain `const` declarations in this file - a factory that closes over a
// later `const` throws "Cannot access '<name>' before initialization" the
// first time the mocked module loads. vi.hoisted() hoists the value
// alongside the mock registration so the factory can see it.
const { openSequenceOverlay, hydrateSequence, loopDetector, toast } =
  vi.hoisted(() => ({
    openSequenceOverlay: vi.fn(),
    hydrateSequence: vi.fn(),
    loopDetector: { detect: vi.fn() },
    toast: { info: vi.fn(), error: vi.fn() },
  }));

vi.mock(
  "#lib/shared/sequence-viewer/state/sequence-viewer-overlay-state.svelte.js",
  () => ({ openSequenceOverlay })
);

vi.mock("#lib/shared/navigation/services/sequence-hydrator.js", () => ({
  hydrateSequence: (...args: unknown[]) => hydrateSequence(...args),
}));

vi.mock("#lib/shared/create/get-loop-detector.js", () => ({
  getLoopDetector: () => loopDetector,
}));

vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({ toast }));

import { openFiledCard } from "#lib/shared/share-intake/services/open-filed-card.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

function sequence(overrides: Partial<SequenceData> = {}): SequenceData {
  return { id: "s1", name: "Practice", word: "ABAB" } as SequenceData;
}

describe("openFiledCard", () => {
  beforeEach(() => {
    openSequenceOverlay.mockReset();
    hydrateSequence.mockReset();
    hydrateSequence.mockImplementation(async (seq: SequenceData) => seq);
    toast.info.mockReset();
    toast.error.mockReset();
  });

  it("hydrates the resolved sequence before opening the viewer", async () => {
    const seq = sequence();

    await openFiledCard({ code: "AB12", sequence: seq, extraCards: 0 });

    expect(hydrateSequence).toHaveBeenCalledWith(seq, {
      loopDetector,
    });
    expect(openSequenceOverlay).toHaveBeenCalledWith(
      seq,
      expect.objectContaining({ shortCode: "AB12" })
    );
  });

  it("does NOT skip the history push, so back closes the viewer", async () => {
    // SequenceViewerDrawerHost passes skipHistoryPush because the ?v= URL is
    // already the history entry. A shared card has no such entry: skipping the
    // push would make Android back exit the app from the viewer.
    await openFiledCard({ code: "AB12", sequence: sequence(), extraCards: 0 });

    const options = openSequenceOverlay.mock.calls[0][1];
    expect(options.skipHistoryPush).toBeUndefined();
  });

  it("mentions the other cards rather than silently opening only the first", async () => {
    await openFiledCard({ code: "AB12", sequence: sequence(), extraCards: 2 });

    expect(toast.info).toHaveBeenCalledWith(
      "2 more cards were saved to your library."
    );
  });

  it("says nothing extra when there is only one card", async () => {
    await openFiledCard({ code: "AB12", sequence: sequence(), extraCards: 0 });
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("reports a hydration failure instead of leaving a dead screen", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    hydrateSequence.mockRejectedValue(new Error("deriver blew up"));

    await expect(
      openFiledCard({ code: "AB12", sequence: sequence(), extraCards: 0 })
    ).rejects.toThrow("deriver blew up");

    // The router records this as route-failed and the runner keeps the record.
    expect(openSequenceOverlay).not.toHaveBeenCalled();
  });

  it("uses the simplified word in the toast copy", async () => {
    await openFiledCard({
      code: "AB12",
      sequence: sequence(),
      extraCards: 1,
      // A LOOP word repeats by construction; the user never sees the expansion.
      word: "ABABABAB",
    });

    expect(toast.info).toHaveBeenCalledWith(
      '1 more card ("AB") was saved to your library.'
    );
  });
});
