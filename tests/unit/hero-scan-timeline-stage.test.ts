/**
 * The hero timeline's stage contract.
 *
 * Guards the 2026-08-04 correction: dealing a card CLEARS the stage and the
 * scan entrance has to be earned again. The three properties the hero reads to
 * build itself — `onstage` (is the phone there), `armed` (is the iframe
 * mounted), `scanned` (which label the trigger wears) — all have to fall
 * together on a deal, and nothing may scan on its own.
 *
 * The runes live in the imported `.svelte.ts` module, which vite compiles, so
 * this stays an ordinary unit test — no browser, no component harness.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHeroScanTimeline } from "#lib/features/store/components/front-door/hero-scan-timeline.svelte.js";

/** No reduced-motion preference unless a test asks for one. */
function stubMatchMedia(reduced: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: reduced,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  );
}

describe("hero scan timeline — the stage clears on a deal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubMatchMedia(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("starts with an empty stage and an unearned entrance", () => {
    const t = createHeroScanTimeline();
    t.start();
    expect(t.phase).toBe("rest");
    expect(t.onstage).toBe(false);
    expect(t.armed).toBe(false);
    expect(t.scanned).toBe(false);
    t.stop();
  });

  it("a scan walks the entrance and leaves the phone standing, armed", () => {
    const t = createHeroScanTimeline();
    t.start();
    t.scan();
    expect(t.phase).toBe("enter");
    expect(t.onstage).toBe(true);
    expect(t.running).toBe(true);

    vi.advanceTimersByTime(640); // enter → aim: the iframe boots on landing
    expect(t.phase).toBe("aim");
    expect(t.armed).toBe(true);
    expect(t.scanned).toBe(true);

    vi.advanceTimersByTime(900 + 900 + 620); // aim → lock → opening → open
    expect(t.phase).toBe("open");
    expect(t.running).toBe(false);
    t.stop();
  });

  it("reset empties the stage: phone off, iframe unmounted, label reverts", () => {
    const t = createHeroScanTimeline();
    t.start();
    t.scan();
    vi.advanceTimersByTime(640 + 900 + 900 + 620);
    expect(t.onstage).toBe(true);
    expect(t.armed).toBe(true);

    t.reset();

    // `armed: false` is what drops HeroPhone's `src`, so the stale page cannot
    // survive the deal — the next press boots the new code with its own
    // loading beat.
    expect(t.phase).toBe("rest");
    expect(t.onstage).toBe(false);
    expect(t.armed).toBe(false);
    // `scanned` reads `armed`, so the trigger says "Scan the code" again.
    expect(t.scanned).toBe(false);
    expect(t.running).toBe(false);
    t.stop();
  });

  it("nothing advances on its own after a reset", () => {
    const t = createHeroScanTimeline();
    t.start();
    t.scan();
    vi.advanceTimersByTime(640);
    t.reset();

    // A scheduled beat from the abandoned pass must not resurrect the phone.
    vi.advanceTimersByTime(10_000);
    expect(t.phase).toBe("rest");
    expect(t.armed).toBe(false);
    t.stop();
  });

  it("the entrance is re-earned: the press after a reset starts at enter", () => {
    const t = createHeroScanTimeline();
    t.start();
    t.scan();
    vi.advanceTimersByTime(640 + 900 + 900 + 620);

    // Second press on the SAME card skips the entrance — the phone is there.
    t.scan();
    expect(t.phase).toBe("aim");
    vi.advanceTimersByTime(900 + 900 + 620);

    // After a deal it does not: the phone has to walk back on.
    t.reset();
    t.scan();
    expect(t.phase).toBe("enter");
    expect(t.onstage).toBe(true);
    t.stop();
  });

  it("reduced motion: reset is still a full stage clear", () => {
    stubMatchMedia(true);
    const t = createHeroScanTimeline();
    t.start();
    t.scan();
    expect(t.phase).toBe("open"); // no beats, straight to the payoff
    expect(t.armed).toBe(true);

    t.reset();
    expect(t.phase).toBe("rest");
    expect(t.armed).toBe(false);
    expect(t.scanned).toBe(false);
    t.stop();
  });
});
