import { describe, expect, it } from "vitest";
import {
  availablePanels,
  coreToolRow,
  defaultPanel,
  isPanelTool,
  keyframeChannelFor,
  shownPanel,
  type PostToolSelection,
} from "$lib/shared/share/components/post-studio/editor/post-editor-tools";

const POST: PostToolSelection = { kind: null };
const CLIP: PostToolSelection = { kind: "video" };
const TEXT: PostToolSelection = { kind: "text" };
const CARD: PostToolSelection = { kind: "card" };

/** The panel helpers on the core row, as the editor runs them with no plugin. */
const panels = (selection: PostToolSelection) =>
  availablePanels(selection, coreToolRow(selection));
const firstPanel = (selection: PostToolSelection) =>
  defaultPanel(coreToolRow(selection));
const shown = (
  active: string | null,
  selection: PostToolSelection,
  wide: boolean
) => shownPanel(active, selection, coreToolRow(selection), wide);

describe("coreToolRow", () => {
  it("offers the post's tools when nothing is selected", () => {
    expect(coreToolRow(POST)).toEqual(["videos", "add", "canvas", "split"]);
  });

  it("puts Crop beside Trim for a clip", () => {
    expect(coreToolRow(CLIP).slice(0, 4)).toEqual([
      "back",
      "split",
      "trim",
      "crop",
    ]);
  });

  it("gives every item Back first and Delete last", () => {
    for (const selection of [CLIP, TEXT, CARD]) {
      const row = coreToolRow(selection);
      expect(row[0]).toBe("back");
      expect(row.at(-1)).toBe("delete");
      expect(new Set(row).size).toBe(row.length);
    }
  });

  it("offers staff Effects on a video clip only, after Fade", () => {
    const row = coreToolRow(CLIP);
    expect(row.indexOf("effects")).toBe(row.indexOf("fade") + 1);
    for (const selection of [TEXT, CARD]) {
      expect(coreToolRow(selection)).not.toContain("effects");
    }
  });

  it("offers Border on a video clip only, after Position", () => {
    const row = coreToolRow(CLIP);
    expect(row.indexOf("border")).toBe(row.indexOf("position") + 1);
    for (const selection of [TEXT, CARD]) {
      expect(coreToolRow(selection)).not.toContain("border");
    }
  });

  it("offers each kind's own tool ahead of the shared ones", () => {
    expect(coreToolRow(TEXT)[2]).toBe("text");
  });
});

describe("panels", () => {
  it("tells panel tools from tools that act at once", () => {
    expect(isPanelTool("crop")).toBe(true);
    expect(isPanelTool("split")).toBe(false);
    expect(isPanelTool("delete")).toBe(false);
  });

  it("offers Export only for the post", () => {
    expect(panels(POST)).toContain("export");
    expect(panels(CLIP)).not.toContain("export");
  });

  it("defaults to the row's first panel tool", () => {
    expect(firstPanel(POST)).toBe("videos");
    expect(firstPanel(CLIP)).toBe("trim");
    expect(firstPanel(TEXT)).toBe("text");
  });

  it("keeps the chosen panel while the selection has it", () => {
    expect(shown("crop", CLIP, false)).toBe("crop");
    expect(shown("fade", TEXT, true)).toBe("fade");
    expect(shown("export", POST, false)).toBe("export");
  });

  it("drops a panel the new selection lacks: the default on wide, the row on a phone", () => {
    expect(shown("crop", TEXT, true)).toBe("text");
    expect(shown("crop", TEXT, false)).toBeNull();
    expect(shown(null, POST, false)).toBeNull();
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

describe("the music", () => {
  const MUSIC: PostToolSelection = { kind: null, music: true };

  it("offers Back, Music and Delete for the selected music", () => {
    expect(coreToolRow(MUSIC)).toEqual(["back", "music", "delete"]);
  });

  it("opens the music's panel, which is a panel tool", () => {
    expect(isPanelTool("music")).toBe(true);
    expect(panels(MUSIC)).toEqual(["music"]);
    expect(firstPanel(MUSIC)).toBe("music");
  });

  it("keeps the music's panel while the music is selected", () => {
    expect(shown("music", MUSIC, false)).toBe("music");
    expect(shown("trim", MUSIC, true)).toBe("music");
  });

  it("drops the music's panel once the music is not selected", () => {
    expect(shown("music", POST, true)).toBe("videos");
    expect(shown("music", POST, false)).toBeNull();
  });

  it("offers Music nowhere else", () => {
    expect(coreToolRow(POST)).not.toContain("music");
    expect(coreToolRow(CLIP)).not.toContain("music");
  });
});
