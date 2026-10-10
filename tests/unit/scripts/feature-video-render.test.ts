import { describe, expect, it, vi } from "vitest";
import {
  browserOrigin,
  openFeatureEditor,
  renderFeature,
  renderInEditor,
} from "../../../scripts/feature-video/render.mjs";

const instant = async () => {};

describe("browserOrigin", () => {
  it("opens the editor at localhost", () => {
    expect(browserOrigin("https://[::1]:5173")).toBe("https://localhost:5173");
    expect(browserOrigin("http://127.0.0.1:5193")).toBe(
      "http://localhost:5193"
    );
    expect(browserOrigin("http://localhost:5193/x")).toBe(
      "http://localhost:5193"
    );
  });
});

/** A headless Chrome that records what it was asked to do. */
function fakeChrome() {
  const calls: string[] = [];
  const tab = {
    send: vi.fn(async (method: string) => {
      calls.push(method);
    }),
    close: vi.fn(async () => {
      calls.push("tab.close");
    }),
  };
  return {
    calls,
    tab,
    launch: vi.fn(async () => ({
      port: 9333,
      close: async () => {
        calls.push("chrome.close");
      },
    })),
    open: vi.fn(async () => tab),
    go: vi.fn(async () => {}),
  };
}

describe("openFeatureEditor", () => {
  it("waits for the new editor to join the bridge", async () => {
    const chrome = fakeChrome();
    const lists = [[], [], [{ id: "editor-1", featureSlug: "promo" }]];
    const editor = await openFeatureEditor({
      origin: "http://localhost:5193",
      feature: "promo",
      listSessions: async () => lists.shift() ?? [],
      launch: chrome.launch,
      open: chrome.open,
      go: chrome.go,
      sleep: instant,
    });
    expect(editor.sessionId).toBe("editor-1");
    expect(chrome.open).toHaveBeenCalledWith("about:blank", {
      port: 9333,
      commandTimeoutMs: 60000,
    });
    expect(chrome.go).toHaveBeenCalledWith(
      chrome.tab,
      "http://localhost:5193/post?feature=promo"
    );
    expect(chrome.calls).toEqual(["Page.bringToFront"]);
    await editor.close();
    expect(chrome.calls).toEqual([
      "Page.bringToFront",
      "tab.close",
      "chrome.close",
    ]);
  });

  it("ignores an editor that was open before and gives up in time", async () => {
    const chrome = fakeChrome();
    let clock = 0;
    await expect(
      openFeatureEditor({
        origin: "http://localhost:5193",
        feature: "promo",
        listSessions: async () => [{ id: "old", featureSlug: "promo" }],
        launch: chrome.launch,
        open: chrome.open,
        go: chrome.go,
        sleep: instant,
        waitMs: 3000,
        now: () => (clock += 1000),
      })
    ).rejects.toThrow("The editor for promo did not open within 3 s.");
    expect(chrome.calls).toContain("chrome.close");
  });
});

/** A bridge that queues one render and answers its statuses in turn. */
function fakeBridge(statuses: Record<string, unknown>[]) {
  const posts: unknown[] = [];
  const request = vi.fn(
    async (
      method: string,
      query: Record<string, string> = {},
      body?: unknown
    ) => {
      if (method === "POST") {
        posts.push(body);
        return { renderId: "render-1", state: "queued" };
      }
      expect(query).toEqual({ sessionId: "editor-1", renderId: "render-1" });
      return statuses.shift();
    }
  );
  return { request, posts };
}

describe("renderInEditor", () => {
  it("follows the render and reports each 10% step once", async () => {
    const bridge = fakeBridge([
      { state: "queued", phase: null, percent: 0 },
      { state: "rendering", phase: "audio", percent: 5 },
      { state: "rendering", phase: "rendering", percent: 42 },
      { state: "rendering", phase: "rendering", percent: 47 },
      {
        state: "completed",
        phase: "rendering",
        percent: 100,
        file: "exports/check.mp4",
        path: "C:/promo/exports/check.mp4",
        bytes: 1234,
      },
    ]);
    const lines: string[] = [];
    const saved = await renderInEditor({
      request: bridge.request,
      sessionId: "editor-1",
      name: "check.mp4",
      log: (line: string) => lines.push(line),
      sleep: instant,
    });
    expect(saved).toEqual({
      file: "exports/check.mp4",
      path: "C:/promo/exports/check.mp4",
      bytes: 1234,
    });
    expect(bridge.posts).toEqual([
      { kind: "render", sessionId: "editor-1", name: "check.mp4" },
    ]);
    expect(lines).toEqual([
      "waiting for the editor",
      "audio 0%",
      "rendering 40%",
    ]);
  });

  it("fails with the editor's reason", async () => {
    const bridge = fakeBridge([
      {
        state: "failed",
        phase: null,
        percent: 0,
        message: "The editor was not ready to render after 60 s.",
      },
    ]);
    await expect(
      renderInEditor({
        request: bridge.request,
        sessionId: "editor-1",
        sleep: instant,
      })
    ).rejects.toThrow("The editor was not ready to render after 60 s.");
    expect(bridge.posts).toEqual([{ kind: "render", sessionId: "editor-1" }]);
  });

  it("gives up on a render that stops moving", async () => {
    const bridge = fakeBridge(
      Array.from({ length: 20 }, () => ({
        state: "rendering",
        phase: "rendering",
        percent: 12,
      }))
    );
    let clock = 0;
    await expect(
      renderInEditor({
        request: bridge.request,
        sessionId: "editor-1",
        sleep: instant,
        stallMs: 3000,
        now: () => (clock += 1000),
      })
    ).rejects.toThrow(
      "The render has not moved for 3 s (rendering 10%). Is the editor's tab in front? If that tab stays open, the render carries on there; press Cancel in it to stop the render."
    );
  });
});

describe("renderFeature", () => {
  /** A bridge with these editors open, where every render completes. */
  function bridgeWith(sessions: { id: string; featureSlug?: string }[]) {
    return vi.fn(async (method: string, query: Record<string, string> = {}) => {
      if (method === "POST") return { renderId: "render-1", state: "queued" };
      if (!query.renderId) return { sessions };
      return {
        state: "completed",
        file: "exports/a.mp4",
        path: "C:/promo/exports/a.mp4",
        bytes: 1,
      };
    });
  }
  const origin = "http://localhost:5193";

  it("refuses when two editors have the video open", async () => {
    const request = bridgeWith([
      { id: "a", featureSlug: "promo" },
      { id: "b", featureSlug: "promo" },
    ]);
    await expect(
      renderFeature({ request, feature: "promo", origin })
    ).rejects.toThrow(
      "2 editors have promo open. Close all but one, then try again."
    );
  });

  it("says how to open the editor when none has the video", async () => {
    const request = bridgeWith([{ id: "a", featureSlug: "other" }]);
    await expect(
      renderFeature({ request, feature: "promo", origin })
    ).rejects.toThrow(
      "No editor has promo open. Open http://localhost:5193/post?feature=promo, or pass --open."
    );
  });

  it("renders through the editor that has the video open", async () => {
    const request = bridgeWith([{ id: "a", featureSlug: "promo" }]);
    const openEditor = vi.fn();
    await expect(
      renderFeature({
        request,
        feature: "promo",
        name: "a.mp4",
        origin,
        pollMs: 1,
        openEditor,
      })
    ).resolves.toEqual({
      file: "exports/a.mp4",
      path: "C:/promo/exports/a.mp4",
      bytes: 1,
    });
    expect(openEditor).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith(
      "POST",
      {},
      { kind: "render", sessionId: "a", name: "a.mp4" }
    );
  });

  it("with open, opens an editor and closes it after", async () => {
    const request = bridgeWith([]);
    const close = vi.fn(async () => {});
    const openEditor = vi.fn(async () => ({ sessionId: "fresh", close }));
    const lines: string[] = [];
    await renderFeature({
      request,
      feature: "promo",
      open: true,
      origin,
      pollMs: 1,
      openEditor,
      log: (line: string) => lines.push(line),
    });
    expect(openEditor).toHaveBeenCalledWith(
      expect.objectContaining({ origin, feature: "promo" })
    );
    expect(request).toHaveBeenCalledWith(
      "POST",
      {},
      { kind: "render", sessionId: "fresh" }
    );
    expect(close).toHaveBeenCalledOnce();
    expect(lines[0]).toBe("opening the editor in a headless Chrome");
  });

  it("closes the editor it opened when the render fails", async () => {
    const close = vi.fn(async () => {});
    const request = vi.fn(
      async (method: string, query: Record<string, string> = {}) => {
        if (method === "POST") return { renderId: "render-1", state: "queued" };
        if (!query.renderId) return { sessions: [] };
        return { state: "failed", message: "There is no room on the disk." };
      }
    );
    await expect(
      renderFeature({
        request,
        feature: "promo",
        open: true,
        origin,
        pollMs: 1,
        openEditor: async () => ({ sessionId: "fresh", close }),
      })
    ).rejects.toThrow("There is no room on the disk.");
    expect(close).toHaveBeenCalledOnce();
  });

  it("checks the name before it opens an editor", async () => {
    const openEditor = vi.fn();
    const findFeature = vi.fn(async (slug: string) => {
      throw new Error(`No feature video named ${slug}.`);
    });
    await expect(
      renderFeature({
        request: bridgeWith([]),
        feature: "promo-1-O",
        open: true,
        origin,
        openEditor,
        findFeature,
      })
    ).rejects.toThrow("No feature video named promo-1-O.");
    expect(findFeature).toHaveBeenCalledWith("promo-1-O");
    expect(openEditor).not.toHaveBeenCalled();
  });
});
