import { describe, expect, it } from "vitest";
import {
  createViewerOpenTiming,
  type ViewerOpenTimingSample,
} from "./viewer-open-timing";

function setup() {
  let clock = 0;
  const sent: ViewerOpenTimingSample<string>[] = [];
  const measures: [string, number, number][] = [];
  const timing = createViewerOpenTiming<string>({
    now: () => clock,
    send: (sample) => sent.push(sample),
    measure: (name, start, end) => measures.push([name, start, end]),
  });
  return {
    timing,
    sent,
    measures,
    at(ms: number) {
      clock = ms;
    },
  };
}

describe("viewer open timing", () => {
  it("sends one event with both times once the viewer is revealed", () => {
    const t = setup();
    t.timing.start(100, "browse_gallery");
    t.at(140);
    t.timing.drawerVisible();
    expect(t.sent).toEqual([]);
    t.at(700);
    t.timing.viewerRevealed();
    t.timing.end();
    expect(t.sent).toEqual([
      {
        context: "browse_gallery",
        drawerVisibleMs: 40,
        viewerRevealedMs: 600,
      },
    ]);
    expect(t.measures).toEqual([
      ["drawer-visible", 100, 140],
      ["viewer-revealed", 100, 700],
    ]);
  });

  it("sends nothing without a start", () => {
    const t = setup();
    t.at(50);
    t.timing.drawerVisible();
    t.timing.viewerRevealed();
    t.timing.end();
    expect(t.sent).toEqual([]);
    expect(t.measures).toEqual([]);
  });

  it("lets a second open replace the first", () => {
    const t = setup();
    t.timing.start(0, "first");
    t.at(2_000);
    t.timing.start(2_000, "second");
    t.at(2_030);
    t.timing.drawerVisible();
    t.at(2_500);
    t.timing.viewerRevealed();
    expect(t.sent).toEqual([
      { context: "second", drawerVisibleMs: 30, viewerRevealedMs: 500 },
    ]);
  });

  it("sends nothing when the drawer took longer than the limit", () => {
    const t = setup();
    t.timing.start(0, "slow");
    t.at(10_001);
    t.timing.drawerVisible();
    t.timing.viewerRevealed();
    t.timing.end();
    expect(t.sent).toEqual([]);
  });

  it("sends nothing when the viewer closed before its drawer showed", () => {
    const t = setup();
    t.timing.start(0, "closed");
    t.timing.end();
    t.at(200);
    t.timing.drawerVisible();
    expect(t.sent).toEqual([]);
  });

  it("reports a close before the reveal with no reveal time", () => {
    const t = setup();
    t.timing.start(0, "gave-up");
    t.at(2_600);
    t.timing.drawerVisible();
    t.at(3_000);
    t.timing.end();
    t.timing.viewerRevealed();
    expect(t.sent).toEqual([
      { context: "gave-up", drawerVisibleMs: 2_600, viewerRevealedMs: null },
    ]);
  });

  it("reports an already drawn viewer at the drawer's time", () => {
    const t = setup();
    t.timing.start(10, "prewarmed");
    t.at(12);
    t.timing.viewerRevealed();
    expect(t.sent).toEqual([]);
    t.at(60);
    t.timing.drawerVisible();
    expect(t.sent).toEqual([
      { context: "prewarmed", drawerVisibleMs: 50, viewerRevealedMs: 50 },
    ]);
  });
});
