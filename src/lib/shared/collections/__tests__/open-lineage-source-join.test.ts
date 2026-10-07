import { beforeEach, describe, expect, it, vi } from "vitest";

const { openSequenceOverlay, getSequence } = vi.hoisted(() => ({
  openSequenceOverlay: vi.fn(),
  getSequence: vi.fn(),
}));

vi.mock(
  "$lib/shared/sequence-viewer/state/sequence-viewer-overlay-state.svelte",
  () => ({ openSequenceOverlay })
);
vi.mock("$lib/shared/library/get-library-repository", () => ({
  getLibraryRepository: () => ({ getSequence }),
}));

import { openLineageSource } from "../open-lineage-source";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

const steps = [{ stepNumber: 1, letter: "A" }] as unknown as StepData[];

describe("openLineageSource join", () => {
  beforeEach(() => {
    openSequenceOverlay.mockReset();
    getSequence.mockReset();
  });

  it("rebuilds from the entry's steps on the join the entry carries", async () => {
    await openLineageSource({
      sourceWord: "AB",
      steps,
      conjoined: { toward: "e", steps: 1 },
    });
    const opened = openSequenceOverlay.mock.calls[0]![0];
    expect(opened.conjoined).toEqual({ toward: "e", steps: 1 });
  });

  it("opens an entry without a join on one grid", async () => {
    await openLineageSource({ sourceWord: "AB", steps });
    expect("conjoined" in openSequenceOverlay.mock.calls[0]![0]).toBe(false);
  });

  it("drops a malformed join instead of passing it on", async () => {
    await openLineageSource({
      sourceWord: "AB",
      steps,
      conjoined: { toward: "up", steps: 3 },
    });
    expect("conjoined" in openSequenceOverlay.mock.calls[0]![0]).toBe(false);
  });

  it("opens the library sequence untouched when the id resolves", async () => {
    const librarySequence = { id: "s1", conjoined: { toward: "n", steps: 2 } };
    getSequence.mockResolvedValue(librarySequence);
    await openLineageSource({ sourceSequenceId: "s1", sourceWord: "AB", steps });
    expect(openSequenceOverlay.mock.calls[0]![0]).toBe(librarySequence);
  });
});
