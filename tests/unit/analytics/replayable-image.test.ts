// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { replayableImage } from "#lib/shared/analytics/replayable-image.js";
import {
  replayCanvasFps,
  setReplayRecordingProbe,
} from "#lib/shared/analytics/replay-recording.js";

const BLOB = "blob:https://tkaflowarts.com/1234";

function img(src: string): HTMLImageElement {
  document.body.innerHTML = `<img src="${src}">`;
  return document.body.querySelector("img")!;
}

async function settle() {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

describe("replayCanvasFps", () => {
  const desktop = { maxTouchPoints: 0, hardwareConcurrency: 8, deviceMemory: 8 };

  it("records 12 frames a second on a strong desktop", () => {
    expect(replayCanvasFps(desktop)).toBe(12);
    // Safari and Firefox do not report memory.
    expect(replayCanvasFps({ maxTouchPoints: 0, hardwareConcurrency: 8 })).toBe(12);
  });

  it("stays at 4 on anything weak, whatever its core count says", () => {
    expect(replayCanvasFps({ ...desktop, maxTouchPoints: 5 })).toBe(4);
    expect(replayCanvasFps({ ...desktop, hardwareConcurrency: 4 })).toBe(4);
    expect(replayCanvasFps({ ...desktop, deviceMemory: 2 })).toBe(4);
    expect(replayCanvasFps({ ...desktop, connection: { saveData: true } })).toBe(4);
  });
});

describe("replayableImage", () => {
  afterEach(() => {
    setReplayRecordingProbe(null);
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("carries a blob picture as data while replay records", async () => {
    setReplayRecordingProbe(() => true);
    vi.stubGlobal(
      "fetch",
      async () => new Response(new Blob(["png"], { type: "image/png" }))
    );
    const node = img(BLOB);

    replayableImage(node, BLOB);
    await settle();

    expect(node.getAttribute("src")).toMatch(/^data:.*;base64,/);
  });

  it("leaves the blob alone when nobody is recording", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const node = img(BLOB);

    replayableImage(node, BLOB);
    await settle();

    expect(fetch).not.toHaveBeenCalled();
    expect(node.getAttribute("src")).toBe(BLOB);
  });

  it("leaves a picture alone inside an area replays leave out", async () => {
    setReplayRecordingProbe(() => true);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    document.body.innerHTML = `<div class="ph-no-capture"><div><img src="${BLOB}"></div></div>`;
    const node = document.body.querySelector("img")!;

    replayableImage(node, BLOB);
    await settle();

    expect(fetch).not.toHaveBeenCalled();
    expect(node.getAttribute("src")).toBe(BLOB);
  });

  it("does not overwrite a newer picture", async () => {
    setReplayRecordingProbe(() => true);
    vi.stubGlobal(
      "fetch",
      async () => new Response(new Blob(["png"], { type: "image/png" }))
    );
    const node = img(BLOB);

    const action = replayableImage(node, BLOB);
    node.setAttribute("src", "https://cdn.example/next.webp");
    action.update("https://cdn.example/next.webp");
    await settle();

    expect(node.getAttribute("src")).toBe("https://cdn.example/next.webp");
  });
});
