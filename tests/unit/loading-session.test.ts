/**
 * Loading session contract: one load, one bar, however many surfaces show it.
 *
 * Silent regressions: a bar that jumps back when the 3D viewer's placeholder
 * hands over to the scene curtain, a load that never remembers its timing,
 * or a load that was left half way poisoning the next one's timing. JSDOM
 * has no Web Animations, so the bar runs in its placement mode (the fill's
 * transform is written per tick), which reads the same timing model.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLoadingSession } from "#lib/shared/loading/loading-session.svelte.js";

const SPEC = {
  key: "test-load",
  ranks: ["open", "canvas", "loaded", "smooth"],
  defaultProfile: { open: 0, canvas: 1000, loaded: 3000, smooth: 4000 },
} as const;

function scaleOf(element: HTMLElement): number {
  const match = /scaleX\(([^)]+)\)/.exec(element.style.transform);
  return match ? Number(match[1]) : NaN;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("loading session", () => {
  it("keeps moving forward and hands its position to the next surface", () => {
    const session = createLoadingSession(SPEC);
    const placeholder = document.createElement("div");
    const detach = session.attach(placeholder);

    const seen: number[] = [];
    for (let i = 0; i < 12; i++) {
      vi.advanceTimersByTime(80);
      seen.push(session.percent);
    }
    session.reach("canvas");
    for (let i = 0; i < 12; i++) {
      vi.advanceTimersByTime(80);
      seen.push(session.percent);
    }
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]!);
    }
    expect(seen.at(-1)!).toBeGreaterThan(seen[0]!);

    // The placeholder leaves and the curtain takes over mid-load.
    const before = session.percent;
    detach();
    vi.advanceTimersByTime(80);
    const curtain = document.createElement("div");
    session.attach(curtain);
    vi.advanceTimersByTime(80);
    expect(session.percent).toBeGreaterThanOrEqual(before);
    expect(scaleOf(curtain) * 100).toBeGreaterThanOrEqual(before - 0.5);
    session.abandon();
  });

  it("remembers a completed load's timing for the next one", () => {
    const first = createLoadingSession(SPEC);
    expect(first.firstVisit).toBe(true);
    vi.advanceTimersByTime(500);
    first.reach("canvas");
    vi.advanceTimersByTime(700);
    first.reach("loaded");
    vi.advanceTimersByTime(300);
    first.complete();

    expect(first.done).toBe(true);
    expect(first.percent).toBe(100);
    const stored = JSON.parse(
      localStorage.getItem("tka-loading-profile:test-load")!
    ) as { v: number; t: Record<string, number> };
    expect(stored.v).toBe(1);
    expect(stored.t.canvas).toBeCloseTo(500, -1);
    expect(stored.t.loaded).toBeCloseTo(1200, -1);
    expect(stored.t.smooth).toBeCloseTo(1500, -1);

    expect(createLoadingSession(SPEC).firstVisit).toBe(false);
  });

  it("stores nothing for a load that was given up", () => {
    const session = createLoadingSession(SPEC);
    vi.advanceTimersByTime(400);
    session.reach("canvas");
    session.abandon();
    session.complete();

    expect(session.done).toBe(false);
    expect(localStorage.getItem("tka-loading-profile:test-load")).toBeNull();
  });
});
