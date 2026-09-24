import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
  createDeckReleaseState,
  type DeckReleaseStateDependencies,
} from "../state/deck-release-state.svelte";
import {
  createDeckReleaserState,
  type DeckReleaserState,
} from "../state/deck-releaser-state.svelte";
import type { DeckRelease } from "../../../domain/models/DeckRelease";

function makeDeck(): DeckReleaserState {
  return createDeckReleaserState({
    storage: null,
    getLeftPropType: () => undefined,
    getRightPropType: () => undefined,
    mintSeed: () => "seed",
    nextReferenceNumber: () => 1,
  });
}

function baseRelease(overrides: Partial<DeckRelease> = {}): DeckRelease {
  return {
    deckNumber: 5,
    createdAt: new Date().toISOString(),
    theme: "rainbow",
    cardCount: 0,
    notes: "",
    sequences: [],
    stepCountDistribution: {},
    ...overrides,
  };
}

function makeDeps(
  create: DeckReleaseStateDependencies["create"]
): DeckReleaseStateDependencies & { warn: Mock<(message: string) => void> } {
  return {
    getAll: vi.fn(async () => []),
    getNextNumber: vi.fn(async () => 1),
    create,
    updateMetadata: vi.fn(async () => undefined),
    archive: vi.fn(async () => undefined),
    restore: vi.fn(async () => undefined),
    warn: vi.fn<(message: string) => void>(),
  };
}

describe("createDeckReleaseState — create() reprint-data warning", () => {
  let deck: DeckReleaserState;

  beforeEach(() => {
    deck = makeDeck();
  });

  it("warns naming the deck when the release comes back with cardDataSaved !== true", async () => {
    const release = baseRelease({ cardDataSaved: false });
    const deps = makeDeps(vi.fn(async () => release));
    const state = createDeckReleaseState(deck, deps);

    await state.create("My Deck", "desc");

    expect(deps.warn).toHaveBeenCalledTimes(1);
    const message = deps.warn.mock.calls[0]![0] as string;
    expect(message).toContain("#005");
    expect(message).toMatch(/reprint data wasn't saved/i);
  });

  it("warns when cardDataSaved is absent entirely (undefined)", async () => {
    const release = baseRelease(); // no cardDataSaved key at all
    const deps = makeDeps(vi.fn(async () => release));
    const state = createDeckReleaseState(deck, deps);

    await state.create("My Deck", "desc");

    expect(deps.warn).toHaveBeenCalledTimes(1);
  });

  it("does not warn when the release saved its card data successfully", async () => {
    const release = baseRelease({ cardDataSaved: true });
    const deps = makeDeps(vi.fn(async () => release));
    const state = createDeckReleaseState(deck, deps);

    await state.create("My Deck", "desc");

    expect(deps.warn).not.toHaveBeenCalled();
  });

  it("still advances the deck to the released step even when it warns (release stays successful)", async () => {
    const release = baseRelease({ cardDataSaved: false });
    const deps = makeDeps(vi.fn(async () => release));
    const state = createDeckReleaseState(deck, deps);

    await state.create("My Deck", "desc");

    expect(deck.step).toBe("released");
    expect(deck.releasedNumber).toBe(5);
  });
});
