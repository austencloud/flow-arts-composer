import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import WorkspacePlayback from "./WorkspacePlayback.svelte";

vi.mock(
  "#lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte",
  async () => ({
    default: (await import("./__test-stubs__/PlayerStub.svelte")).default,
  })
);
vi.mock("#lib/shared/timeline/StepStrip.svelte", async () => ({
  default: (await import("./__test-stubs__/StripStub.svelte")).default,
}));

/**
 * Layout proof for the Create preview. Play grows this box from the editor's
 * height to most of the screen, and the notation rail joins partway through.
 * The canvas must never give up room before the rail is there to fill it.
 */

// .playback-layout's inset: 4px top, 8px bottom, 12px either side.
const INSET_Y = 12;
const INSET_X = 24;
const SEEK = 44;

function mount(width: number, height: number) {
  const { container } = render(WorkspacePlayback, {
    sequence: createSequenceData({
      id: "rail-test",
      name: "Rail",
      word: "A",
      steps: [],
    }),
    active: true,
    run: 1,
    onready: () => {},
    onerror: () => {},
  });
  const host = container as HTMLElement;
  // The app's motion tokens (src/app.css), which this harness does not load.
  host.style.setProperty("--duration-emphasis", "280ms");
  host.style.setProperty("--ease-out", "cubic-bezier(0.16, 1, 0.3, 1)");
  host.style.width = `${width}px`;
  host.style.height = `${height}px`;
  const find = (selector: string) => {
    const el = host.querySelector<HTMLElement>(selector);
    if (!el) throw new Error(`${selector} never rendered`);
    return el;
  };
  return {
    host,
    media: find(".playback-media"),
    rail: find(".notation-rail"),
    strip: find(".strip-stub"),
  };
}

const nextFrame = () =>
  new Promise<number>((resolve) => requestAnimationFrame(resolve));
const widthOf = (el: HTMLElement) => el.getBoundingClientRect().width;
const heightOf = (el: HTMLElement) => el.getBoundingClientRect().height;

describe("WorkspacePlayback layout", () => {
  it("keeps the whole height for the canvas while the rail is closed", async () => {
    // 350px of layout: just short of the rail. The outer box is past 360, which
    // once shrank the canvas for the rail while the rail itself stayed hidden.
    const { media, rail } = mount(705, 350 + INSET_Y);
    await expect.poll(() => widthOf(media)).toBeCloseTo(350 - SEEK, 0);
    expect(getComputedStyle(rail).visibility).toBe("hidden");
    expect(heightOf(rail)).toBe(0);
  });

  it("grows the canvas without a step back while the rail opens", async () => {
    const { host, media, rail } = mount(705, 290);
    await expect
      .poll(() => widthOf(media))
      .toBeCloseTo(290 - INSET_Y - SEEK, 0);

    // Play's growth on an unfolded Fold: 290px to 636px in about a quarter
    // second, crossing the rail's threshold on the way.
    const widths: number[] = [];
    for (let height = 290; height <= 636; height += 24) {
      host.style.height = `${height}px`;
      await nextFrame();
      widths.push(widthOf(media));
    }
    host.style.height = "636px";
    const settleUntil = performance.now() + 600;
    while (performance.now() < settleUntil) {
      await nextFrame();
      widths.push(widthOf(media));
    }

    // Sub-pixel easing wobble is fine; a frame that gives back room is not.
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeGreaterThanOrEqual(widths[i - 1]! - 1.5);
    }
    const layoutHeight = 636 - INSET_Y;
    const railSize = Math.min(104, Math.max(72, layoutHeight * 0.14));
    expect(heightOf(rail)).toBeCloseTo(railSize, 0);
    expect(widthOf(media)).toBeCloseTo(layoutHeight - railSize - SEEK, 0);
    expect(getComputedStyle(rail).visibility).toBe("visible");
  });

  it("lays out the closed rail on a wide player so its cells exist before it opens", async () => {
    const { media, rail, strip } = mount(705, 300);
    await expect.poll(() => widthOf(strip)).toBeCloseTo(widthOf(media), 0);
    expect(getComputedStyle(rail).visibility).toBe("hidden");
    expect(heightOf(rail)).toBe(0);
  });

  it("leaves the rail out of layout on a player too narrow to ever show it", async () => {
    const { media, rail, strip } = mount(520 + INSET_X - 1, 636);
    await expect.poll(() => widthOf(media)).toBeGreaterThan(0);
    expect(getComputedStyle(rail).display).toBe("none");
    expect(widthOf(strip)).toBe(0);
  });
});
