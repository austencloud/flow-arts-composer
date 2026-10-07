/**
 * The music's row on the Post timeline. Its drags hand back post seconds,
 * snapped and clamped the way the edits will clamp them; bar 1 comes back in
 * the file's own seconds. The waveform must load once per file: the editor
 * replaces the music object on every edit, and reloading the song on each
 * frame of a drag would stall the timeline.
 */
import { flushSync, unmount } from "svelte";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { mountMusicLane } from "./music-lane-harness.svelte";
import type { PostMusic } from "$lib/shared/media-composition/domain/post-music";
import { POST_MUSIC_MIN_SECONDS } from "$lib/shared/media-composition/domain/post-music-edits";

const wave = vi.hoisted(() => ({
  created: [] as Array<{
    options: Record<string, unknown>;
    destroy: () => void;
    destroyed: boolean;
  }>,
}));

vi.mock("wavesurfer.js", () => ({
  default: {
    create: (options: Record<string, unknown>) => {
      const instance = {
        options,
        destroyed: false,
        destroy() {
          instance.destroyed = true;
        },
      };
      wave.created.push(instance);
      return instance;
    },
  },
}));

// The lane imports the waveform library on demand. Load the mock first, or
// the first lanes' imports can race the mock and get the real library.
await import("wavesurfer.js");

const URL = "/api/dev/feature-videos/promo/media/music/derail.wav";
const GRID = { bpm: 120, downbeatSeconds: 0.5, beatsPerBar: 4 };

function music(fields: Partial<PostMusic> = {}): PostMusic {
  return {
    id: "music-1",
    url: URL,
    label: "Derail",
    startSeconds: 1,
    sourceInSeconds: 0,
    sourceOutSeconds: 10,
    durationSeconds: 30,
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
let lane: ReturnType<typeof mountMusicLane> | null = null;

beforeAll(() => {
  // jsdom has no pointer capture.
  HTMLElement.prototype.setPointerCapture = () => {};
});

afterAll(() => {
  delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
});

beforeEach(() => {
  wave.created = [];
  stubbedCreateElement = document.createElement;
  document.createElement = realCreateElement.bind(document);
});

afterEach(() => {
  if (lane) unmount(lane.component);
  lane = null;
  document.body.innerHTML = "";
  document.createElement = stubbedCreateElement;
});

function open(start: PostMusic, snapTargets: number[] = []) {
  const target = document.createElement("div");
  document.body.append(target);
  lane = mountMusicLane(target, start, snapTargets);
  return lane;
}

function button(label: string): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`
  );
}

function body(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>(".music-body")!;
}

function press(element: Element, clientX: number): void {
  element.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerId: 1,
      clientX,
    })
  );
}

function moveTo(clientX: number): void {
  window.dispatchEvent(
    new PointerEvent("pointermove", { pointerId: 1, clientX })
  );
}

function release(clientX: number): void {
  window.dispatchEvent(
    new PointerEvent("pointerup", { pointerId: 1, clientX })
  );
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe("the music lane", () => {
  it("sits on the post's clock and draws bars over the beats", () => {
    const { setPixelsPerSecond } = open(music({ grid: GRID }));
    const clip = document.querySelector<HTMLElement>(".music-clip")!;
    expect([clip.style.left, clip.style.width]).toEqual(["100px", "1000px"]);
    expect(body().getAttribute("aria-label")).toBe(
      "Music: Derail, 0:01.0 to 0:11.0"
    );
    // Bar 1 sounds at the post's 1.5 s; a bar is 2 s and a beat 0.5 s.
    const bars = document.querySelectorAll<HTMLElement>(".grid-line.bar");
    expect(bars).toHaveLength(5);
    expect(bars[0]!.style.left).toBe("50px");
    expect(document.querySelectorAll(".grid-line")).toHaveLength(21);
    // Zoomed out, beats 4 px apart are left out and the bars stay.
    setPixelsPerSecond(8);
    expect(document.querySelectorAll(".grid-line")).toHaveLength(5);
  });

  it("colours only the bars the ruler numbers", () => {
    const { setPixelsPerSecond } = open(music({ grid: GRID }));
    // Bars 16 px apart: the ruler numbers bars 1, 3 and 5, at the post's
    // 1.5 s, 5.5 s and 9.5 s. Bars 2 and 4 draw as beats.
    setPixelsPerSecond(8);
    const bars = document.querySelectorAll<HTMLElement>(".grid-line.bar");
    expect([...bars].map((bar) => bar.style.left)).toEqual([
      "4px",
      "36px",
      "68px",
    ]);
    expect(document.querySelectorAll(".grid-line")).toHaveLength(5);
  });

  it("shades the part that plays past the post's end", () => {
    // The music plays at the post's 1 s to 11 s.
    const { setPostEnd } = open(music());
    expect(document.querySelector(".past-end")).toBeNull();
    setPostEnd(8);
    expect(document.querySelector<HTMLElement>(".past-end")!.style.left).toBe(
      "700px"
    );
    setPostEnd(11);
    expect(document.querySelector(".past-end")).toBeNull();
    setPostEnd(0.5);
    expect(document.querySelector<HTMLElement>(".past-end")!.style.left).toBe(
      "0px"
    );
  });

  it("draws no lines without a beat grid", () => {
    open(music());
    expect(document.querySelectorAll(".grid-line")).toHaveLength(0);
  });

  it("loads the waveform once per file, not on every edit", async () => {
    const { setMusic, music: first } = open(music());
    await vi.waitFor(() => expect(wave.created).toHaveLength(1));
    expect(wave.created[0]!.options).toMatchObject({
      url: URL,
      interact: false,
      fillParent: true,
    });

    setMusic({ ...first, gain: 0.5, startSeconds: 3 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(wave.created).toHaveLength(1);

    const other = "/api/dev/feature-videos/promo/media/music/parsec.wav";
    setMusic({ ...first, url: other });
    await vi.waitFor(() => expect(wave.created).toHaveLength(2));
    expect(wave.created[0]!.destroyed).toBe(true);
    expect(wave.created[1]!.options.url).toBe(other);

    unmount(lane!.component);
    lane = null;
    expect(wave.created[1]!.destroyed).toBe(true);
  });

  it("draws the file's whole length, shifted so the trimmed part shows", () => {
    open(music({ sourceInSeconds: 4, sourceOutSeconds: 14 }));
    const drawn = document.querySelector<HTMLElement>(".wave")!;
    expect(drawn.style.left).toBe("-400px");
    expect(drawn.style.width).toBe("3000px");
  });

  it("selects on a press that doesn't move", () => {
    const { calls } = open(music());
    press(body(), 200);
    release(201);
    expect(calls).toEqual([]);
    body().click();
    expect(calls).toEqual([["select"]]);
  });

  it("moves with the pointer, as one gesture that snaps its start to a cut", async () => {
    const { calls } = open(music(), [5]);
    press(body(), 200);
    moveTo(300);
    await nextFrame();
    expect(calls).toEqual([
      ["select"],
      ["gestureStart"],
      ["guide", null],
      ["move", 2],
    ]);
    calls.length = 0;
    // 3.95 s lands 0.05 s from the cut at 5 s, inside the 8 px snap.
    moveTo(595);
    release(595);
    expect(calls).toEqual([
      ["guide", 5],
      ["move", 5],
      ["gestureEnd"],
      ["guide", null],
    ]);
  });

  it("puts bar 1 on a cut when bar 1 is the part closest to one", () => {
    // Bar 1 sounds 0.25 s in. Dragged to 4.8 s, it reaches 5.05 s.
    const { calls } = open(
      music({ grid: { ...GRID, downbeatSeconds: 0.25 } }),
      [5.1]
    );
    press(body(), 200);
    moveTo(580);
    release(580);
    const moved = calls.find(([name]) => name === "move");
    expect(moved?.[1]).toBeCloseTo(4.85, 9);
    expect(calls).toContainEqual(["guide", 5.1]);
  });

  it("leaves the music alone on Escape, or when dragged back to where it began", () => {
    const { calls } = open(music());
    press(body(), 200);
    moveTo(400);
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", cancelable: true })
    );
    release(400);
    expect(calls).toEqual([
      ["select"],
      ["gestureStart"],
      ["guide", null],
      ["gestureCancel"],
      ["guide", null],
    ]);

    calls.length = 0;
    press(body(), 200);
    moveTo(400);
    moveTo(200);
    release(200);
    expect(calls.at(-2)).toEqual(["gestureCancel"]);
    expect(calls.some(([name]) => name === "move")).toBe(false);
  });

  it("shows its trim handles and bar 1 only while selected", () => {
    const { setSelected } = open(music({ grid: GRID }));
    expect(button("Trim the music's start")).toBeNull();
    expect(button("Move bar 1")).toBeNull();
    setSelected(true);
    expect(button("Trim the music's start")).not.toBeNull();
    expect(button("Trim the music's end")).not.toBeNull();
    expect(button("Move bar 1")?.style.left).toBe("150px");
  });

  it("trims its end to a bar or beat past the current end, and never past the file", () => {
    const { calls, setSelected } = open(music({ grid: GRID }));
    setSelected(true);
    press(button("Trim the music's end")!, 1100);
    // 13.03 s: the beat at 13 s is 0.03 s away.
    moveTo(1303);
    moveTo(4100);
    release(4100);
    expect(calls).toEqual([
      ["gestureStart"],
      ["guide", 13],
      ["guide", null],
      // The file is 30 s long and plays from the post's 1 s.
      ["trim", "end", 31],
      ["gestureEnd"],
      ["guide", null],
    ]);
  });

  it("keeps a trim inside the file, after the post's start, and long enough to see", () => {
    const { calls, setSelected } = open(
      music({ sourceInSeconds: 4, sourceOutSeconds: 14 })
    );
    setSelected(true);
    press(button("Trim the music's start")!, 100);
    moveTo(-5000);
    release(-5000);
    // The file could reach back to the post's -3 s; the post starts at 0.
    expect(calls).toContainEqual(["trim", "start", 0]);

    calls.length = 0;
    press(button("Trim the music's end")!, 1100);
    moveTo(-5000);
    release(-5000);
    expect(calls).toContainEqual(["trim", "end", 1 + POST_MUSIC_MIN_SECONDS]);
  });

  it("moves bar 1 and reports it in the file's own seconds", () => {
    // Bar 1 is the file's 1.5 s, which the post plays at 2.5 s.
    const { calls, setSelected } = open(
      music({
        startSeconds: 2,
        sourceInSeconds: 1,
        sourceOutSeconds: 11,
        grid: { ...GRID, downbeatSeconds: 1.5 },
      }),
      [3.25]
    );
    setSelected(true);
    press(button("Move bar 1")!, 250);
    moveTo(323);
    release(323);
    expect(calls).toContainEqual(["guide", 3.25]);
    expect(calls).toContainEqual(["downbeat", 2.25]);
  });

  it("moves bar 1 by whole beats when it lands near one of the song's own", () => {
    // Bar 1 is the post's 2.5 s; the song's beats fall every 0.5 s from there.
    const { calls, setSelected } = open(
      music({
        startSeconds: 2,
        sourceInSeconds: 1,
        sourceOutSeconds: 11,
        grid: { ...GRID, downbeatSeconds: 1.5 },
      })
    );
    setSelected(true);
    press(button("Move bar 1")!, 250);
    // 3.48 s: the song's beat at 3.5 s is 0.02 s away.
    moveTo(348);
    release(348);
    expect(calls).toContainEqual(["guide", 3.5]);
    expect(calls).toContainEqual(["downbeat", 2.5]);
  });

  it("hides bar 1 when the music's trim leaves it out", () => {
    const { setSelected } = open(
      music({ sourceInSeconds: 2, sourceOutSeconds: 12, grid: GRID })
    );
    setSelected(true);
    flushSync();
    expect(button("Move bar 1")).toBeNull();
  });
});
