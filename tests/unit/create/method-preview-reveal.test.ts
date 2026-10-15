/**
 * The front door's preview cards arrive together: each holds its tint until
 * every scene is ready, or until a hold runs out after the first one is, then
 * the ready cards fade in as one wave in board order. A late scene arrives on
 * its own. The turns wait for the wave to settle.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMethodPreviewReveal } from "#lib/features/create/shared/state/method-preview-reveal.svelte.js";

const ORDER = ["construct", "generate", "shape-engine", "fuse"];
const HOLD = 3000;
const STAGGER = 80;
const FADE = 280;

function setup(reduced = false) {
  const revealedOrder: string[] = [];
  const reveal = createMethodPreviewReveal({
    order: () => ORDER,
    onReveal: (id) => revealedOrder.push(id),
    reducedMotion: () => reduced,
    timing: {
      revealHoldMs: HOLD,
      revealStaggerMs: STAGGER,
      revealFadeMs: FADE,
    },
  });
  const shown = () => ORDER.filter((id) => reveal.isRevealed(id));
  return { reveal, revealedOrder, shown };
}

describe("method preview reveal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds every card until the last scene is ready, then brings them in in board order", () => {
    const { reveal, revealedOrder, shown } = setup();
    reveal.notifyReady("fuse");
    reveal.notifyReady("construct");
    vi.advanceTimersByTime(1000);
    reveal.notifyReady("shape-engine");
    expect(shown()).toEqual([]);

    reveal.notifyReady("generate");
    expect(shown()).toEqual(["construct"]);
    vi.advanceTimersByTime(STAGGER * 3);
    expect(revealedOrder).toEqual(ORDER);
  });

  it("brings in the ready cards when the hold runs out, and a late one on its own", () => {
    const { reveal, revealedOrder, shown } = setup();
    reveal.notifyReady("generate");
    reveal.notifyReady("construct");
    vi.advanceTimersByTime(HOLD - 1);
    expect(shown()).toEqual([]);

    vi.advanceTimersByTime(1);
    vi.advanceTimersByTime(STAGGER);
    expect(revealedOrder).toEqual(["construct", "generate"]);

    vi.advanceTimersByTime(10_000);
    reveal.notifyReady("shape-engine");
    expect(reveal.isRevealed("shape-engine")).toBe(true);
    expect(reveal.isRevealed("fuse")).toBe(false);
  });

  it("starts the turns once the last card of the wave has faded in", () => {
    const { reveal } = setup();
    const go = vi.fn();
    reveal.afterWave(go);
    for (const id of ORDER) reveal.notifyReady(id);

    vi.advanceTimersByTime(STAGGER * 3 + FADE - 1);
    expect(go).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(go).toHaveBeenCalledTimes(1);

    // Once the wave has settled, later waits run at once.
    const again = vi.fn();
    reveal.afterWave(again);
    expect(again).toHaveBeenCalledTimes(1);
  });

  it("brings every ready card in at once under reduced motion", () => {
    const { reveal, shown } = setup(true);
    const go = vi.fn();
    reveal.afterWave(go);
    for (const id of ORDER) reveal.notifyReady(id);
    expect(shown()).toEqual(ORDER);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("does nothing more once disposed", () => {
    const { reveal, shown } = setup();
    const go = vi.fn();
    reveal.afterWave(go);
    reveal.notifyReady("construct");
    reveal.dispose();
    vi.advanceTimersByTime(HOLD + 1000);
    expect(shown()).toEqual([]);
    expect(go).not.toHaveBeenCalled();
  });
});
