// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const startMorph = vi.fn<(mutate: () => void) => ViewTransition | null>();
vi.mock("#lib/shared/transitions/results-morph.js", () => ({
  startMorph: (mutate: () => void) => startMorph(mutate),
}));

const claims = vi.fn<(name: string) => number>(() => 0);
vi.mock("#lib/shared/transitions/view-transition-name-registry.js", () => ({
  countViewTransitionNameClaims: (name: string) => claims(name),
}));

import { whenMotionSettled } from "#lib/shared/foundation/utils/background-scheduling.js";
import { generateCardFlight } from "../state/generate-card-flight.svelte";
import {
  generateCardMorphName,
  lastGenerateCardMorphRan,
  morphGenerateCard,
} from "./generate-card-morph";

beforeEach(() => {
  startMorph.mockReset();
  claims.mockReset();
  claims.mockReturnValue(0);
  document.documentElement.className = "";
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
  it("runs the mutation plainly when no card wrapper has claimed the name", async () => {
    const mutate = vi.fn();
    const onSettled = vi.fn();
    const ran = morphGenerateCard("customize", mutate, { onSettled });
    expect(mutate).toHaveBeenCalledOnce();
    expect(startMorph).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(onSettled).toHaveBeenCalledOnce());
    expect(ran).toBe(false);
    expect(lastGenerateCardMorphRan()).toBe(false);
  });

  it("waits for a real card morph to settle before continuing a handoff", async () => {
    claims.mockReturnValue(1);
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    startMorph.mockImplementation((mutate) => {
      mutate();
      return { finished } as ViewTransition;
    });
    const onSettled = vi.fn();

    morphGenerateCard("customize", vi.fn(), { onSettled });
    expect(onSettled).not.toHaveBeenCalled();
    expect(document.documentElement).toHaveClass(
      "generate-card-morph-active",
      "generate-card-morph-customize"
    );

    finish();
    await finished;
    await Promise.resolve();
    expect(onSettled).toHaveBeenCalledOnce();
    expect(document.documentElement).not.toHaveClass(
      "generate-card-morph-active",
      "generate-card-morph-customize"
    );
  });

  it("routes through startMorph when the name is claimed and reports whether a transition ran", async () => {
    claims.mockReturnValue(1);
    const mutate = vi.fn();
    startMorph.mockImplementation((m) => {
      m();
      return { finished: Promise.resolve() } as ViewTransition;
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
    const onSettled = vi.fn();
    expect(morphGenerateCard("loop", secondMutate, { onSettled })).toBe(false);
    expect(secondMutate).toHaveBeenCalledOnce();
    expect(onSettled).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(onSettled).toHaveBeenCalledOnce());
    expect(lastGenerateCardMorphRan()).toBe(false);
  });
});

describe("start-up work during a card morph", () => {
  async function deferredWorkRan(): Promise<boolean> {
    let ran = false;
    void whenMotionSettled().then(() => (ran = true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    return ran;
  }

  it("waits until the card lands, including when the morph is skipped", async () => {
    claims.mockReturnValue(1);
    for (const end of ["resolve", "reject"] as const) {
      let finish!: { resolve: () => void; reject: () => void };
      const finished = new Promise<void>((resolve, reject) => {
        finish = { resolve, reject: () => reject(new Error("skipped")) };
      });
      startMorph.mockImplementationOnce((mutate) => {
        mutate();
        return { finished } as unknown as ViewTransition;
      });
      morphGenerateCard("loop", () => {});
      expect(await deferredWorkRan()).toBe(false);
      finish[end]();
      await finished.catch(() => {});
      expect(await deferredWorkRan()).toBe(true);
    }
  });

  it("does not hold anything when the change applies plainly", async () => {
    claims.mockReturnValue(1);
    startMorph.mockImplementationOnce((mutate) => {
      mutate();
      return null;
    });
    morphGenerateCard("loop", () => {});
    expect(await deferredWorkRan()).toBe(true);
  });
});

describe("the card a morph is carrying open", () => {
  function deferredMorph() {
    let finish!: { resolve: () => void; reject: () => void };
    const finished = new Promise<void>((resolve, reject) => {
      finish = { resolve, reject: () => reject(new Error("skipped")) };
    });
    let pending: (() => void) | null = null;
    startMorph.mockImplementationOnce((mutate) => {
      pending = mutate;
      return { finished } as unknown as ViewTransition;
    });
    return {
      finished,
      finish,
      runUpdate: () => pending?.(),
    };
  }

  beforeEach(() => {
    generateCardFlight.opening = null;
    document.body.innerHTML = "";
  });

  it("is set while the morph opens a card and cleared when it lands, or is skipped", async () => {
    claims.mockReturnValue(1);
    for (const end of ["resolve", "reject"] as const) {
      const morph = deferredMorph();
      let seen: string | null = "unset";
      morphGenerateCard("customize", () => (seen = generateCardFlight.opening));
      expect(generateCardFlight.opening).toBeNull();
      morph.runUpdate();
      expect(seen).toBe("customize");
      morph.finish[end]();
      await morph.finished.catch(() => {});
      await Promise.resolve();
      expect(generateCardFlight.opening).toBeNull();
    }
  });

  it("is never set when the card opens plainly", () => {
    claims.mockReturnValue(1);
    let seen: string | null = "unset";
    startMorph.mockImplementationOnce((mutate) => {
      mutate();
      return null;
    });
    morphGenerateCard("customize", () => (seen = generateCardFlight.opening));
    expect(seen).toBeNull();
  });

  it("is not set when the morph closes an open card", () => {
    claims.mockReturnValue(1);
    document.body.innerHTML =
      '<div class="expanded-card-stage" data-card-id="customize"></div>';
    const morph = deferredMorph();
    let seen: string | null = "unset";
    morphGenerateCard("customize", () => (seen = generateCardFlight.opening));
    morph.runUpdate();
    expect(seen).toBeNull();
  });
});
