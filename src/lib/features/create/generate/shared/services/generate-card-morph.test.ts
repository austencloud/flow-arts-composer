import { beforeEach, describe, expect, it, vi } from "vitest";

const startMorph = vi.fn<(mutate: () => void) => ViewTransition | null>();
vi.mock("$lib/shared/transitions/results-morph", () => ({
  startMorph: (mutate: () => void) => startMorph(mutate),
}));

const claims = vi.fn<(name: string) => number>(() => 0);
vi.mock("$lib/shared/transitions/view-transition-name-registry", () => ({
  countViewTransitionNameClaims: (name: string) => claims(name),
}));

import {
  generateCardMorphName,
  lastGenerateCardMorphRan,
  morphGenerateCard,
} from "./generate-card-morph";

beforeEach(() => {
  startMorph.mockReset();
  claims.mockReset();
  claims.mockReturnValue(0);
});

describe("generateCardMorphName", () => {
  it("names the host cards and nothing else", () => {
    expect(generateCardMorphName("customize")).toBe("generate-card-customize");
    expect(generateCardMorphName("loop")).toBe("generate-card-loop");
    expect(generateCardMorphName("preset")).toBe("generate-card-preset");
    expect(generateCardMorphName("length")).toBe("");
    expect(generateCardMorphName("generate-button")).toBe("");
  });
});

describe("morphGenerateCard", () => {
  it("runs the mutation plainly when no card wrapper has claimed the name", () => {
    const mutate = vi.fn();
    const ran = morphGenerateCard("customize", mutate);
    expect(mutate).toHaveBeenCalledOnce();
    expect(startMorph).not.toHaveBeenCalled();
    expect(ran).toBe(false);
    expect(lastGenerateCardMorphRan()).toBe(false);
  });

  it("routes through startMorph when the name is claimed and reports whether a transition ran", () => {
    claims.mockReturnValue(1);
    const mutate = vi.fn();
    startMorph.mockImplementation((m) => {
      m();
      return {} as ViewTransition;
    });

    expect(morphGenerateCard("loop", mutate)).toBe(true);
    expect(startMorph).toHaveBeenCalledOnce();
    expect(mutate).toHaveBeenCalledOnce();
    expect(lastGenerateCardMorphRan()).toBe(true);

    startMorph.mockImplementation((m) => {
      m();
      return null;
    });
    const secondMutate = vi.fn();
    expect(morphGenerateCard("loop", secondMutate)).toBe(false);
    expect(secondMutate).toHaveBeenCalledOnce();
    expect(lastGenerateCardMorphRan()).toBe(false);
  });
});
