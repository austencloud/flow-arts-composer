import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDirector } from "../../../scripts/demo-capture/browser-director.mjs";

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "director-"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const frameEvent = (n: number, timestamp: number) => ({
  params: {
    sessionId: n,
    data: Buffer.from(`frame-${n}`).toString("base64"),
    metadata: { timestamp },
  },
});

function fakes(view = { width: 1920, height: 1080 }) {
  const sent: [string, Record<string, unknown>][] = [];
  const cdp = {
    send: vi.fn(
      async (method: string, params: Record<string, unknown> = {}) => {
        sent.push([method, params]);
        return {};
      }
    ),
    readEvents: vi.fn(async (options: { afterSequence?: number } = {}) => {
      if (options.afterSequence === undefined)
        return { cursor: 0, events: [], hasMore: false, truncated: false };
      const events =
        options.afterSequence < 2
          ? [frameEvent(1, 10), frameEvent(2, 10.1)]
          : [];
      return { cursor: 2, events, hasMore: false, truncated: false };
    }),
  };
  const page = {
    evaluate: vi.fn(async (fn: () => unknown) => {
      if (fn.toString().includes("innerWidth")) return view;
      throw new Error("unexpected evaluate");
    }),
    fillByRole: vi.fn(),
    url: async () => "https://localhost:5173/create/construct",
    snapshot: async () => ({ title: "Construct" }),
  };
  return { cdp, page, sent };
}

describe("createDirector shot", () => {
  it("writes frames and a capture.json where the options say, at the size asked for", async () => {
    const { cdp, page, sent } = fakes({ width: 720, height: 1280 });
    const framesDir = path.join(root, "captures", "frames");
    const director = createDirector(page, cdp, root, {
      framesDir,
      size: { width: 1080, height: 1920 },
    });
    const result = await director.shot("builder", 0.1);
    expect(result.frames).toBe(2);
    const files = await fs.readdir(path.join(framesDir, "builder"));
    expect(files.sort()).toEqual(["00000.jpg", "00001.jpg", "capture.json"]);
    const proof = JSON.parse(
      await fs.readFile(path.join(framesDir, "builder", "capture.json"), "utf8")
    );
    expect(proof.frames).toEqual([
      { file: "00000.jpg", timestamp: 10 },
      { file: "00001.jpg", timestamp: 10.1 },
    ]);
    expect(proof.url).toBe("https://localhost:5173/create/construct");
    const start = sent.find(([method]) => method === "Page.startScreencast");
    expect(start?.[1]).toMatchObject({
      maxWidth: 1080,
      maxHeight: 1920,
      format: "jpeg",
    });
    expect(
      sent.filter(([method]) => method === "Page.screencastFrameAck")
    ).toHaveLength(2);
  });

  it("parks the pointer in proportion to the viewport", async () => {
    const small = fakes({ width: 720, height: 1280 });
    await createDirector(small.page, small.cdp, root).shot("a", 0.05);
    const moved = small.sent.filter(
      ([method]) => method === "Input.dispatchMouseEvent"
    );
    expect(moved[0]?.[1]).toMatchObject({
      type: "mouseMoved",
      x: 429,
      y: 1209,
    });

    const desktop = fakes();
    await createDirector(desktop.page, desktop.cdp, root).shot("b", 0.05);
    const first = desktop.sent.find(
      ([method]) => method === "Input.dispatchMouseEvent"
    );
    expect(first?.[1]).toMatchObject({ x: 1145, y: 1020 });
  });

  it("defaults to the old folder and 1920 by 1080", async () => {
    const { cdp, page, sent } = fakes();
    await createDirector(page, cdp, root).shot("old", 0.05);
    await fs.access(
      path.join(root, "production", "frames", "old", "capture.json")
    );
    const start = sent.find(([method]) => method === "Page.startScreencast");
    expect(start?.[1]).toMatchObject({ maxWidth: 1920, maxHeight: 1080 });
  });

  it("keeps the frames and records the failure when the action throws", async () => {
    const { cdp, page } = fakes();
    const director = createDirector(page, cdp, root);
    await expect(
      director.shot("broken", 0.05, async () => {
        throw new Error("button missing");
      })
    ).rejects.toThrow("button missing");
    const proof = JSON.parse(
      await fs.readFile(
        path.join(root, "production", "frames", "broken", "capture.json"),
        "utf8"
      )
    );
    expect(proof.failure).toContain("button missing");
  });
});
