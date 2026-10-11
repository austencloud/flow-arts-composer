/**
 * Timing mode's take video must close its download when it leaves the page.
 * A removed video keeps its download open but stops reading it. Over HTTP/2 a
 * few of those hold the connection's whole receive window, and a remounted
 * editor's project fetch then gets headers but never a body.
 */
import { flushSync } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPostTimingSessionHarness } from "./post-timing-session-harness.svelte";

const TAKE_URL = "/api/dev/feature-videos/promo/media/footage/dck-full.mp4";

function takeVideo() {
  const video = document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "video"
  ) as HTMLVideoElement;
  video.setAttribute("src", TAKE_URL);
  const pause = vi.spyOn(video, "pause").mockImplementation(() => {});
  const load = vi.spyOn(video, "load").mockImplementation(() => {});
  return { video, pause, load };
}

describe("timing mode's take video", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lets go of its download when the stage drops it", () => {
    const harness = createPostTimingSessionHarness();
    const { video, pause, load } = takeVideo();
    harness.session.video = video;
    flushSync();
    expect(video.getAttribute("src")).toBe(TAKE_URL);
    // bind:this clears the session's element when the stage unmounts.
    harness.session.video = null;
    flushSync();
    expect(pause).toHaveBeenCalled();
    expect(video.hasAttribute("src")).toBe(false);
    expect(load).toHaveBeenCalled();
    harness.dispose();
  });

  it("lets go of its download when the editor itself goes", () => {
    const harness = createPostTimingSessionHarness();
    const { video, load } = takeVideo();
    harness.session.video = video;
    flushSync();
    harness.dispose();
    expect(video.hasAttribute("src")).toBe(false);
    expect(load).toHaveBeenCalled();
  });
});
