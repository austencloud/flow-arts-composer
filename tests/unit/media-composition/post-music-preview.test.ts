/**
 * The preview's music element. The canvas reads its clock, aligns it after a
 * jump and holds it while footage buffers, as it does a clip's footage. It
 * must only sound while the post plays inside the music, follow the music's
 * fades, and stop when it leaves the page. A file that can't be loaded must
 * stay out of the clock, or the preview waits on it forever. The element must
 * land on the playhead when a scrub's seek finishes and when playback starts.
 */
import { flushSync, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mountMusicPreview } from "./music-preview-harness.svelte";
import type { PostMusic } from "#lib/shared/media-composition/domain/post-music.js";

const URL = "/api/dev/feature-videos/promo/media/music/derail.wav";
const OTHER_URL = "/api/dev/feature-videos/promo/media/music/thump.wav";

// The file plays from its 5 s at the post's 2 s, through its 35 s.
function music(fields: Partial<PostMusic> = {}): PostMusic {
  return {
    id: "music-1",
    url: URL,
    label: "Derail",
    startSeconds: 2,
    sourceInSeconds: 5,
    sourceOutSeconds: 35,
    durationSeconds: 90,
    gain: 1,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
    ...fields,
  };
}

/** jsdom's media elements never load or play; this one does as it is told. */
function fakeMedia(element: HTMLMediaElement) {
  const media = {
    readyState: 0,
    paused: true,
    seeking: false,
    ended: false,
    currentTime: 0,
    volume: 1,
    muted: false,
    plays: 0,
  };
  Object.defineProperties(element, {
    readyState: { get: () => media.readyState, configurable: true },
    paused: { get: () => media.paused, configurable: true },
    seeking: { get: () => media.seeking, configurable: true },
    ended: { get: () => media.ended, configurable: true },
    currentTime: {
      get: () => media.currentTime,
      set: (seconds: number) => (media.currentTime = seconds),
      configurable: true,
    },
    volume: {
      get: () => media.volume,
      set: (level: number) => (media.volume = level),
      configurable: true,
    },
    muted: {
      get: () => media.muted,
      set: (muted: boolean) => (media.muted = muted),
      configurable: true,
    },
    play: {
      value: () => {
        media.plays += 1;
        media.paused = false;
        return Promise.resolve();
      },
      configurable: true,
    },
    pause: {
      value: () => {
        media.paused = true;
      },
      configurable: true,
    },
    load: { value: () => {}, configurable: true },
  });
  return media;
}

// vitest-setup.ts swaps document.createElement for canvas stubs that are not
// DOM nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;
let stubbedCreateElement: typeof document.createElement;
let current: ReturnType<typeof mountMusicPreview> | null = null;

beforeEach(() => {
  stubbedCreateElement = document.createElement;
  document.createElement = realCreateElement.bind(document);
});

afterEach(() => {
  if (current) unmount(current.component);
  current = null;
  document.body.innerHTML = "";
  document.createElement = stubbedCreateElement;
});

function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function open(start: PostMusic = music()) {
  const target = document.createElement("div");
  document.body.append(target);
  current = mountMusicPreview(target, start);
  const element = target.querySelector("audio")!;
  return { preview: current, element, media: fakeMedia(element) };
}

/** The post is paused inside the music when its file fails to load. */
function openFailed() {
  const opened = open();
  opened.preview.setPostSeconds(10);
  opened.element.dispatchEvent(new Event("error"));
  flushSync();
  return opened;
}

describe("the preview's music", () => {
  it("loads the music file and hands the canvas a controller", () => {
    const { preview, element } = open();
    expect(element.getAttribute("src")).toBe(URL);
    expect(element.getAttribute("preload")).toBe("auto");
    expect(preview.controller).not.toBeNull();
  });

  it("is not ready until it has data, then reads at the playhead's time", () => {
    const { preview, media } = open();
    preview.setPostSeconds(10);
    expect(preview.controller!.read().ready).toBe(false);
    media.readyState = 4;
    expect(preview.controller!.read()).toEqual({
      currentTime: 13,
      ready: true,
      ended: false,
    });
  });

  it("sounds only while the post plays inside the music, and holds when told", async () => {
    const { preview, media } = open();
    media.readyState = 4;
    preview.setPostSeconds(10);
    preview.setPlaying(true);
    expect(media.paused).toBe(false);
    preview.controller!.hold(true);
    expect(media.paused).toBe(true);
    // The canvas holds or releases it on every frame, after the last play settles.
    await settled();
    preview.controller!.hold(false);
    expect(media.paused).toBe(false);
    // Before the music starts.
    preview.setPostSeconds(1);
    expect(media.paused).toBe(true);
    await settled();
    preview.setPostSeconds(10);
    expect(media.paused).toBe(false);
    preview.setPlaying(false);
    expect(media.paused).toBe(true);
  });

  it("lets playing music run on, and lands on the playhead after a jump", () => {
    const { preview, media } = open();
    media.readyState = 4;
    preview.setPostSeconds(10);
    preview.setPlaying(true);
    media.currentTime = 13.1;
    preview.setPostSeconds(10.016);
    expect(media.currentTime).toBe(13.1);
    preview.setPostSeconds(20);
    expect(media.currentTime).toBe(23);
  });

  it("follows the music's fades and stops at full volume", () => {
    const { preview, media } = open(music({ fadeInSeconds: 2, gain: 1.5 }));
    media.readyState = 4;
    preview.setPlaying(true);
    preview.setPostSeconds(3);
    expect(media.volume).toBeCloseTo(0.75, 9);
    expect(media.muted).toBe(false);
    preview.setPostSeconds(10);
    expect(media.volume).toBe(1);
    preview.setPlaying(false);
    expect(media.muted).toBe(true);
  });

  it("stops and lets go when it leaves the page", () => {
    const { preview, element, media } = open();
    media.readyState = 4;
    preview.setPostSeconds(10);
    preview.setPlaying(true);
    unmount(preview.component);
    current = null;
    expect(media.paused).toBe(true);
    expect(element.hasAttribute("src")).toBe(false);
    expect(preview.controllers.at(-1)).toBeNull();
  });

  it("tells the canvas when the music's file can't be loaded", () => {
    const { preview } = openFailed();
    preview.setPlaying(true);
    expect(preview.missingReports).toEqual([true]);
  });

  it("keeps a file that can't be loaded out of the preview clock", () => {
    const { preview } = openFailed();
    preview.setPlaying(true);
    // The canvas drops a null controller from the clock. A registered one
    // would never be ready, and the preview would wait on it for ever.
    expect(preview.controllers.at(-1)).toBeNull();
  });

  it("never plays a file that can't be loaded", () => {
    const { preview, media } = openFailed();
    preview.setPlaying(true);
    expect(media.plays).toBe(0);
  });

  it("silences music that fails while it plays", () => {
    const { preview, element, media } = open();
    media.readyState = 4;
    preview.setPostSeconds(10);
    preview.setPlaying(true);
    expect(media.paused).toBe(false);
    element.dispatchEvent(new Event("error"));
    flushSync();
    expect(media.paused).toBe(true);
    expect(preview.controllers.at(-1)).toBeNull();
  });

  it("takes the music back into the clock once it is another file", () => {
    const { preview } = openFailed();
    preview.setPlaying(true);
    preview.setMusic(music({ url: OTHER_URL, label: "Thump" }));
    expect(preview.missingReports).toEqual([true, false]);
    expect(preview.controllers.at(-1)).not.toBeNull();
  });

  it("stops saying the file is missing when it leaves the page", () => {
    const { preview } = openFailed();
    unmount(preview.component);
    current = null;
    expect(preview.missingReports).toEqual([true, false]);
  });

  it("reports nothing for an error that comes after it left the page", () => {
    const { preview, element } = open();
    preview.setPostSeconds(10);
    unmount(preview.component);
    current = null;
    // A listener that throws reaches the window as an error event.
    const thrown: unknown[] = [];
    const note = (event: ErrorEvent) => thrown.push(event.error);
    window.addEventListener("error", note);
    element.dispatchEvent(new Event("error"));
    window.removeEventListener("error", note);
    expect(thrown).toEqual([]);
    expect(preview.missingReports).toEqual([]);
  });

  it("lands on the playhead when the seek of a scrub finishes", () => {
    const { preview, element, media } = open();
    media.readyState = 4;
    preview.setPostSeconds(10);
    expect(media.currentTime).toBe(13);
    // The scrub moves on while the seek to 13 s is still under way.
    media.seeking = true;
    preview.setPostSeconds(12);
    expect(media.currentTime).toBe(13);
    media.seeking = false;
    element.dispatchEvent(new Event("seeked"));
    expect(media.currentTime).toBe(15);
  });

  it("lines up exactly when playback starts, after a seek that was dropped", () => {
    const { preview, media } = open();
    media.readyState = 4;
    preview.setPostSeconds(10);
    media.seeking = true;
    preview.setPostSeconds(10.2);
    expect(media.currentTime).toBe(13);
    // The seek ended without an event. 0.2 s is inside the slack that a
    // playing element is allowed, so only Play itself can line it up.
    media.seeking = false;
    preview.setPlaying(true);
    expect(media.currentTime).toBeCloseTo(13.2, 9);
  });
});
