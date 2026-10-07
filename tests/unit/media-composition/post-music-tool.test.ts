/**
 * The music's panel. Its sliders and boxes hand back patches for
 * updateMusic, keyed by setting so a drag joins one undo step; its In and
 * Out hand back an edge on the post's clock for trimMusic. Suggest BPM
 * must never change the tempo by itself, and tapping along must move bar 1
 * onto the taps without renumbering the bars.
 */
import { flushSync, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountMusicTool } from "./music-tool-harness.svelte";
import type { PostMusic } from "$lib/shared/media-composition/domain/post-music";

const analyzer = vi.hoisted(() => ({
  analyzeAudioBpm: vi.fn(),
}));

vi.mock("$lib/shared/audio/bpm-analyzer", () => analyzer);

// The panel imports the analyzer on demand. Load the mock first, or the
// panel's import can race the mock and get the real analyzer.
await import("$lib/shared/audio/bpm-analyzer");

const URL = "/api/dev/feature-videos/promo/media/music/derail.wav";
const OTHER_URL = "/api/dev/feature-videos/promo/media/music/thump.wav";

function music(fields: Partial<PostMusic> = {}): PostMusic {
  return {
    id: "music-1",
    url: URL,
    label: "Derail",
    startSeconds: 0,
    sourceInSeconds: 0,
    sourceOutSeconds: 60,
    durationSeconds: 120,
    gain: 1,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
    ...fields,
  };
}

// vitest-setup.ts swaps document.createElement for canvas stubs that are not
// DOM nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;
let stubbedCreateElement: typeof document.createElement;
let tool: ReturnType<typeof mountMusicTool> | null = null;

beforeEach(() => {
  analyzer.analyzeAudioBpm.mockReset();
  stubbedCreateElement = document.createElement;
  document.createElement = realCreateElement.bind(document);
});

afterEach(() => {
  if (tool) unmount(tool.component);
  tool = null;
  document.body.innerHTML = "";
  document.createElement = stubbedCreateElement;
  vi.useRealTimers();
});

function open(start: PostMusic = music()) {
  const target = document.createElement("div");
  document.body.append(target);
  tool = mountMusicTool(target, start);
  return tool;
}

function buttonNamed(name: string): HTMLButtonElement | null {
  return (
    [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) =>
        button.getAttribute("aria-label") === name ||
        button.textContent?.trim() === name
    ) ?? null
  );
}

/** Opens a typed-value box, types into it and presses Enter. */
function typeInto(box: string, typed: string): void {
  buttonNamed(box)!.click();
  flushSync();
  const field = document.querySelector<HTMLInputElement>(".typeable input")!;
  field.value = typed;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
  );
  flushSync();
}

function slide(index: number, value: number): void {
  const range = document.querySelectorAll<HTMLInputElement>(
    "input[type='range']"
  )[index]!;
  range.value = String(value);
  range.dispatchEvent(new Event("input", { bubbles: true }));
  flushSync();
}

function setText(name: string, value: string): HTMLInputElement {
  const field = [...document.querySelectorAll<HTMLLabelElement>("label")]
    .find((label) => label.textContent?.trim().startsWith(name))!
    .querySelector("input")!;
  field.value = value;
  field.dispatchEvent(new Event("change", { bubbles: true }));
  flushSync();
  return field;
}

function statusText(): string[] {
  return [...document.querySelectorAll("[role='status']")].map(
    (status) => status.textContent?.replace(/\s+/g, " ").trim() ?? ""
  );
}

describe("the music's panel", () => {
  it("sets the level and fades, each under its own key", () => {
    const { changes, music: before } = open();
    expect(before.gain).toBe(1);
    slide(0, 150);
    slide(1, 2);
    slide(2, 3.5);
    expect(changes).toEqual([
      ["gain", { gain: 1.5 }],
      ["fadeIn", { fadeInSeconds: 2 }],
      ["fadeOut", { fadeOutSeconds: 3.5 }],
    ]);
    expect(tool!.music).toMatchObject({
      gain: 1.5,
      fadeInSeconds: 2,
      fadeOutSeconds: 3.5,
    });
  });

  it("makes a beat grid from a typed tempo, with bar 1 at the music's in point, and removes it", () => {
    const { changes } = open(music({ sourceInSeconds: 4 }));
    expect(buttonNamed("Beats per bar: 4")).toBeNull();
    typeInto("Tempo: None", "85");
    expect(changes).toEqual([["bpm", { bpm: 85 }]]);
    expect(tool!.music.grid).toEqual({
      bpm: 85,
      downbeatSeconds: 4,
      beatsPerBar: 4,
    });
    typeInto("Beats per bar: 4", "3");
    typeInto("Bar 1 at, in the song's own seconds: 4.000 s", "4.42");
    expect(tool!.music.grid).toEqual({
      bpm: 85,
      downbeatSeconds: 4.42,
      beatsPerBar: 3,
    });
    buttonNamed("Remove beat grid")!.click();
    flushSync();
    expect(changes.at(-1)).toEqual(["bpm", { bpm: null }]);
    expect(tool!.music.grid).toBeUndefined();
  });

  it("moves bar 1 onto the taps' beat, nearest where it was, while the post plays", () => {
    vi.useFakeTimers({ toFake: ["performance"] });
    const { changes, setPlaying, setPlayhead } = open(
      music({ grid: { bpm: 120, downbeatSeconds: 0, beatsPerBar: 4 } })
    );
    const tap = () => {
      buttonNamed("Tap the beat")!.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 })
      );
      // The click that follows a pointer's tap is not a second tap.
      buttonNamed("Tap the beat")!.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1 })
      );
      flushSync();
    };

    expect(buttonNamed("Tap the beat")!.disabled).toBe(true);
    setPlaying(true);
    // A beat is 0.5 s; the taps land 0.1 s after each beat of the grid.
    setPlayhead(10.1);
    tap();
    expect(changes).toEqual([]);
    vi.advanceTimersByTime(500);
    setPlayhead(10.6);
    tap();
    expect(changes).toHaveLength(1);
    expect(tool!.music.grid!.downbeatSeconds).toBeCloseTo(0.1, 9);
    expect(statusText()).toContain("2 taps");

    // Enter or Space on the button taps too.
    vi.advanceTimersByTime(500);
    setPlayhead(11.1);
    buttonNamed("Tap the beat")!.dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 0 })
    );
    flushSync();
    expect(statusText()).toContain("3 taps");

    // After a pause the count starts again: one tap alone moves nothing.
    vi.advanceTimersByTime(2500);
    setPlayhead(20.3);
    tap();
    expect(statusText()).toContain("1 tap");
    expect(tool!.music.grid!.downbeatSeconds).toBeCloseTo(0.1, 9);
    vi.advanceTimersByTime(500);
    setPlayhead(20.8);
    tap();
    expect(tool!.music.grid!.downbeatSeconds).toBeCloseTo(0.3, 9);
  });

  it("offers no tapping without a tempo", () => {
    open();
    expect(buttonNamed("Tap the beat")).toBeNull();
  });

  it("shows a suggested tempo and changes nothing until Use is pressed", async () => {
    analyzer.analyzeAudioBpm.mockResolvedValue({
      bpm: 85,
      confidence: 0.72,
      isUncertain: false,
    });
    const { changes } = open();
    buttonNamed("Suggest BPM")!.click();
    await vi.waitFor(() =>
      expect(statusText()).toContain("About 85 BPM, 72% sure.")
    );
    expect(analyzer.analyzeAudioBpm).toHaveBeenCalledWith(URL);
    expect(changes).toEqual([]);
    expect(tool!.music.grid).toBeUndefined();
    buttonNamed("Use 85 BPM")!.click();
    flushSync();
    expect(changes).toEqual([["bpm", { bpm: 85 }]]);
    expect(tool!.music.grid?.bpm).toBe(85);
    expect(buttonNamed("Use 85 BPM")).toBeNull();
  });

  it("says when the beat is unclear, missing, or the file can't be read", async () => {
    analyzer.analyzeAudioBpm.mockResolvedValueOnce({
      bpm: 140,
      confidence: 0.31,
      isUncertain: true,
    });
    open();
    buttonNamed("Suggest BPM")!.click();
    await vi.waitFor(() =>
      expect(statusText()).toContain(
        "About 140 BPM, 31% sure. The beat is unclear; check it by ear."
      )
    );

    analyzer.analyzeAudioBpm.mockResolvedValueOnce({
      bpm: 120,
      confidence: 0,
      isUncertain: true,
    });
    buttonNamed("Suggest BPM")!.click();
    await vi.waitFor(() =>
      expect(statusText()).toContain("No steady beat found. Type the tempo in.")
    );
    expect(buttonNamed("Use 120 BPM")).toBeNull();

    analyzer.analyzeAudioBpm.mockRejectedValueOnce(new Error("decode"));
    buttonNamed("Suggest BPM")!.click();
    await vi.waitFor(() =>
      expect(statusText()).toContain("Could not read the music file.")
    );
  });

  it("drops a suggestion or note once the music is another file", async () => {
    analyzer.analyzeAudioBpm.mockResolvedValueOnce({
      bpm: 120,
      confidence: 0,
      isUncertain: true,
    });
    open();
    buttonNamed("Suggest BPM")!.click();
    await vi.waitFor(() =>
      expect(statusText()).toContain("No steady beat found. Type the tempo in.")
    );
    tool!.setMusic(music({ url: OTHER_URL, label: "Thump" }));
    expect(statusText()).not.toContain(
      "No steady beat found. Type the tempo in."
    );

    analyzer.analyzeAudioBpm.mockResolvedValueOnce({
      bpm: 85,
      confidence: 0.72,
      isUncertain: false,
    });
    buttonNamed("Suggest BPM")!.click();
    await vi.waitFor(() =>
      expect(statusText()).toContain("About 85 BPM, 72% sure.")
    );
    expect(analyzer.analyzeAudioBpm).toHaveBeenLastCalledWith(OTHER_URL);
    tool!.setMusic(music());
    expect(statusText()).not.toContain("About 85 BPM, 72% sure.");
    expect(buttonNamed("Use 85 BPM")).toBeNull();
  });

  it("keeps the music's name when cleared, and clears the artist and license", () => {
    const { changes } = open();
    setText("Name", "Derail (radio edit)");
    const name = setText("Name", "   ");
    expect(name.value).toBe("Derail (radio edit)");
    setText("Artist", "Yellowbase");
    setText("License", "Epidemic Sound, trial, 2026-10-07");
    setText("Artist", "");
    expect(changes).toEqual([
      ["label", { label: "Derail (radio edit)" }],
      ["artist", { artist: "Yellowbase" }],
      ["license", { license: "Epidemic Sound, trial, 2026-10-07" }],
      ["artist", { artist: null }],
    ]);
    expect(tool!.music).toMatchObject({
      label: "Derail (radio edit)",
      license: "Epidemic Sound, trial, 2026-10-07",
    });
    expect(tool!.music.artist).toBeUndefined();
  });

  it("moves the music and trims its ends to typed times", () => {
    // The song's 4 s plays at the post's 2 s, through the song's 34 s.
    const { changes, trims } = open(
      music({ startSeconds: 2, sourceInSeconds: 4, sourceOutSeconds: 34 })
    );
    typeInto("Start: 0:02.00", "3.5");
    expect(changes).toEqual([["start", { startSeconds: 3.5 }]]);
    // In and Out are the song's own seconds; the edge moves on the post's clock.
    typeInto("In: 0:04.00", "6");
    expect(trims).toEqual([["start", 5.5]]);
    typeInto("Out: 0:34.00", "0:30");
    expect(trims.at(-1)).toEqual(["end", 29.5]);
    expect(tool!.music).toMatchObject({
      startSeconds: 5.5,
      sourceInSeconds: 6,
      sourceOutSeconds: 30,
    });
  });

  it("sets an edge to the playhead only from inside the music, and moves its start anywhere", () => {
    const { changes, trims, setPlayhead } = open(
      music({ startSeconds: 2, sourceInSeconds: 4, sourceOutSeconds: 34 })
    );
    // The playhead starts at the post's 0 s, before the music.
    expect(buttonNamed("Set to playhead: In")!.disabled).toBe(true);
    expect(buttonNamed("Set to playhead: Out")!.disabled).toBe(true);
    setPlayhead(10);
    buttonNamed("Set to playhead: In")!.click();
    flushSync();
    expect(trims).toEqual([["start", 10]]);
    expect(tool!.music).toMatchObject({
      startSeconds: 10,
      sourceInSeconds: 12,
    });
    // On the new start, an edge moved there would leave no music.
    expect(buttonNamed("Set to playhead: Out")!.disabled).toBe(true);
    setPlayhead(20);
    buttonNamed("Set to playhead: Out")!.click();
    flushSync();
    expect(trims.at(-1)).toEqual(["end", 20]);
    expect(tool!.music.sourceOutSeconds).toBe(22);
    setPlayhead(1);
    buttonNamed("Set to playhead: Start")!.click();
    flushSync();
    expect(changes).toEqual([["start", { startSeconds: 1 }]]);
  });
});
