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

function setup(reduced = false, covered: () => boolean = () => false) {
  const revealedOrder: string[] = [];
  const reveal = createMethodPreviewReveal({
    order: () => ORDER,
    onReveal: (id) => revealedOrder.push(id),
    reducedMotion: () => reduced,
    covered,
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

  it("brings every card in at once, with no fade, behind the boot screen", () => {
    let covered = true;
    const { reveal, revealedOrder } = setup(false, () => covered);
    const go = vi.fn();
    reveal.afterWave(go);
    for (const id of ORDER) reveal.notifyReady(id);
    expect(revealedOrder).toEqual(ORDER);
    expect(ORDER.every((id) => reveal.isInstant(id))).toBe(true);
    expect(go).toHaveBeenCalledTimes(1);

    // Once the screen has gone, a late card fades in as usual.
    covered = false;
    const late = setup(false, () => covered);
    late.reveal.notifyReady("construct");
    vi.advanceTimersByTime(HOLD);
    late.reveal.notifyReady("fuse");
    expect(late.reveal.isRevealed("fuse")).toBe(true);
    expect(late.reveal.isInstant("fuse")).toBe(false);
  });

  it("does not wait out the hold for a card whose scene failed to load", () => {
    const { reveal, shown } = setup();
    reveal.notifyReady("construct");
    reveal.notifyReady("generate");
    reveal.notifyFailed("shape-engine");
    expect(shown()).toEqual([]);
    reveal.notifyReady("fuse");
    expect(shown()).toEqual(["construct"]);
    vi.advanceTimersByTime(STAGGER * 2);
    expect(shown()).toEqual(["construct", "generate", "fuse"]);
  });

  it("settles a board whose every scene failed", () => {
    const { reveal } = setup();
    const go = vi.fn();
    reveal.afterWave(go);
    for (const id of ORDER) reveal.notifyFailed(id);
    vi.advanceTimersByTime(FADE);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("brings the ready cards in at once, with no fade, when the screen leaves early", () => {
    const { reveal, revealedOrder } = setup();
    reveal.revealNow();
    expect(revealedOrder).toEqual([]);

    reveal.notifyReady("generate");
    reveal.notifyReady("construct");
    reveal.revealNow();
    expect(revealedOrder).toEqual(["construct", "generate"]);
    expect(reveal.isInstant("construct")).toBe(true);
    expect(reveal.isInstant("generate")).toBe(true);

    // A card ready later arrives alone, with its fade.
    reveal.notifyReady("fuse");
    expect(reveal.isRevealed("fuse")).toBe(true);
    expect(reveal.isInstant("fuse")).toBe(false);
  });
});
