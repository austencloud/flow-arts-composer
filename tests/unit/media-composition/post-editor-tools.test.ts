import { describe, expect, it } from "vitest";
import {
  availablePanels,
  defaultPanel,
  isPanelTool,
  keyframeChannelFor,
  shownPanel,
  toolRow,
  type PostToolSelection,
} from "$lib/shared/share/components/post-studio/editor/post-editor-tools";

const POST: PostToolSelection = { kind: null, hasLayout: false };
const MAIN_CLIP: PostToolSelection = { kind: "video", hasLayout: true };
const OVERLAY_CLIP: PostToolSelection = { kind: "video", hasLayout: false };
const TEXT: PostToolSelection = { kind: "text", hasLayout: false };
const CARD: PostToolSelection = { kind: "card", hasLayout: false };

describe("toolRow", () => {
  it("offers the post's tools when nothing is selected", () => {
    expect(toolRow(POST)).toEqual([
      "videos",
      "add",
      "canvas",
      "split",
      "tutorial",
      "look",
    ]);
  });

  it("puts Crop beside Trim for a clip and Layout only on a main-track clip", () => {
    const main = toolRow(MAIN_CLIP);
    expect(main.slice(0, 4)).toEqual(["back", "split", "trim", "crop"]);
    expect(main).toContain("layout");
    expect(toolRow(OVERLAY_CLIP)).not.toContain("layout");
  });

  it("gives every item Back first and Delete last", () => {
    for (const kind of [
      "video",
      "animation",
      "moves",
      "carousel",
      "text",
      "card",
    ] as const) {
      const row = toolRow({ kind, hasLayout: false });
      expect(row[0]).toBe("back");
      expect(row.at(-1)).toBe("delete");
      expect(new Set(row).size).toBe(row.length);
    }
  });

  it("offers staff Effects on a video clip only, after Fade", () => {
    const row = toolRow(MAIN_CLIP);
    expect(row.indexOf("effects")).toBe(row.indexOf("fade") + 1);
    for (const kind of [
      "animation",
      "moves",
      "carousel",
      "text",
      "card",
    ] as const) {
      expect(toolRow({ kind, hasLayout: false })).not.toContain("effects");
    }
  });

  it("offers Border on a video clip only, after Position", () => {
    for (const selection of [MAIN_CLIP, OVERLAY_CLIP]) {
      const row = toolRow(selection);
      expect(row.indexOf("border")).toBe(row.indexOf("position") + 1);
    }
    for (const kind of [
      "animation",
      "moves",
      "carousel",
      "text",
      "card",
    ] as const) {
      expect(toolRow({ kind, hasLayout: false })).not.toContain("border");
    }
  });

  it("offers each kind's own tool ahead of the shared ones", () => {
    expect(toolRow({ kind: "animation", hasLayout: false })[2]).toBe(
      "appearance"
    );
    expect(toolRow({ kind: "moves", hasLayout: false })[2]).toBe("shows");
    expect(toolRow({ kind: "moves", hasLayout: false })[3]).toBe("appearance");
    expect(toolRow(TEXT)[2]).toBe("text");
    expect(toolRow(CARD)[2]).toBe("appearance");
  });
});

describe("panels", () => {
  it("tells panel tools from tools that act at once", () => {
    expect(isPanelTool("crop")).toBe(true);
    expect(isPanelTool("split")).toBe(false);
    expect(isPanelTool("delete")).toBe(false);
  });

  it("offers Export only for the post", () => {
    expect(availablePanels(POST)).toContain("export");
    expect(availablePanels(MAIN_CLIP)).not.toContain("export");
  });

  it("defaults to the row's first panel tool", () => {
    expect(defaultPanel(POST)).toBe("videos");
    expect(defaultPanel(MAIN_CLIP)).toBe("trim");
    expect(defaultPanel(TEXT)).toBe("text");
    expect(defaultPanel(CARD)).toBe("appearance");
  });

  it("keeps the chosen panel while the selection has it", () => {
    expect(shownPanel("crop", MAIN_CLIP, false)).toBe("crop");
    expect(shownPanel("fade", TEXT, true)).toBe("fade");
    expect(shownPanel("export", POST, false)).toBe("export");
  });

  it("drops a panel the new selection lacks: the default on wide, the row on a phone", () => {
    expect(shownPanel("crop", TEXT, true)).toBe("text");
    expect(shownPanel("crop", TEXT, false)).toBeNull();
    expect(shownPanel("layout", OVERLAY_CLIP, true)).toBe("trim");
    expect(shownPanel(null, POST, false)).toBeNull();
  });
});

describe("keyframeChannelFor", () => {
  it("keys the channel of the panel on screen", () => {
    expect(keyframeChannelFor("crop", "video")).toBe("framing");
    expect(keyframeChannelFor("position", "video")).toBe("box");
    expect(keyframeChannelFor("fade", "text")).toBe("opacity");
  });

  it("falls back to framing for a video and the box for anything else", () => {
    expect(keyframeChannelFor(null, "video")).toBe("framing");
    expect(keyframeChannelFor("speed", "video")).toBe("framing");
    expect(keyframeChannelFor("timing", "card")).toBe("box");
    expect(keyframeChannelFor(null, "animation")).toBe("box");
  });
});
