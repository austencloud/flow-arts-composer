import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import UnifiedTimeline from "./UnifiedTimeline.svelte";
import type { UnifiedPlaybackContext } from "./unified-playback-context";

/**
 * The transport's scrubber is the shared progress line along its top edge,
 * with a grab area under the whole row. Two things can go wrong without
 * anything looking broken: a key press moving two beats (the line and the
 * transport both handling the arrow), and a tap in the row seeking to the
 * wrong spot because the ratio was measured against something other than the
 * full-width line.
 */

const BEATS = [0.25, 0.5, 0.75];

function makePlayback(overrides: Partial<UnifiedPlaybackContext> = {}) {
  const seek = vi.fn();
  const togglePlay = vi.fn();
  const playback: UnifiedPlaybackContext = {
    overallProgress: 0.1,
    currentStep: 1,
    totalSteps: 4,
    isPlaying: false,
    isLooping: undefined,
    duration: 8,
    elapsed: 0.8,
    beatMarkerPositions: BEATS,
    bpm: undefined,
    playbackMode: undefined,
    seek,
    togglePlay,
    toggleLoop: vi.fn(),
    ...overrides,
  };
  return { playback, seek, togglePlay };
}

function sliderOf(container: HTMLElement): HTMLElement {
  const sliders = container.querySelectorAll<HTMLElement>('[role="slider"]');
  expect(sliders).toHaveLength(1);
  return sliders[0]!;
}

describe("UnifiedTimeline progress line", () => {
  it("steps one beat per arrow press", async () => {
    const { playback, seek, togglePlay } = makePlayback();
    const { container } = render(UnifiedTimeline, { playback });
    const slider = sliderOf(container as HTMLElement);

    slider.focus();
    slider.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })
    );

    expect(seek).toHaveBeenCalledTimes(1);
    expect(seek).toHaveBeenCalledWith(0.25);
    // A key press only moves the playhead; it never toggles playback.
    expect(togglePlay).not.toHaveBeenCalled();
  });

  it("seeks to where a tap in the row lands along the full-width line", async () => {
    const { playback, seek } = makePlayback();
    const { container } = render(UnifiedTimeline, { playback });
    const slider = sliderOf(container as HTMLElement);
    const timeline = (container as HTMLElement).querySelector<HTMLElement>(
      ".unified-timeline"
    )!;

    const line = slider.getBoundingClientRect();
    const bar = timeline.getBoundingClientRect();
    // The grab area spans the whole bar, edge to edge, top to bottom.
    expect(line.width).toBeCloseTo(bar.width, 0);
    expect(line.height).toBeCloseTo(bar.height, 0);

    // Below the line, in the row's empty middle, 70% of the way across.
    const x = line.left + line.width * 0.7;
    const y = line.top + line.height * 0.6;
    const hit = document.elementFromPoint(x, y);
    expect(hit === slider || slider.contains(hit)).toBe(true);

    slider.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: x,
        clientY: y,
        button: 0,
        pointerId: 1,
        bubbles: true,
      })
    );

    expect(seek).toHaveBeenCalledTimes(1);
    expect(seek.mock.calls[0]![0]).toBeCloseTo(0.7, 2);
  });

  it("pauses for a drag and resumes after it when it was playing", async () => {
    const { playback, togglePlay } = makePlayback({ isPlaying: true });
    const { container } = render(UnifiedTimeline, { playback });
    const slider = sliderOf(container as HTMLElement);
    const rect = slider.getBoundingClientRect();
    const at = { clientX: rect.left + 10, clientY: rect.top + 2 };

    slider.dispatchEvent(
      new PointerEvent("pointerdown", {
        ...at,
        button: 0,
        pointerId: 1,
        bubbles: true,
      })
    );
    expect(togglePlay).toHaveBeenCalledTimes(1);
    slider.dispatchEvent(
      new PointerEvent("pointerup", { ...at, pointerId: 1, bubbles: true })
    );
    expect(togglePlay).toHaveBeenCalledTimes(2);
  });
});
