import { describe, expect, it } from "vitest";
import type { PostItem, PostItemKind } from "@austencloud/video-editor/core";
import {
  coreToolRow,
  defaultPanel,
  isPanelTool,
  shownPanel,
} from "@austencloud/video-editor/ui";
import { NO_FACTS, tkaRow, type TkaRowFacts } from "./tka-row";
import { tkaAddOrder } from "./tka-add-items";
import { TKA_TOOLS } from "./tka-tools";

const TAIL = ["position", "fade", "rename", "duplicate", "delete"];
const item = (kind: string) => ({ kind }) as unknown as PostItem;
const row = (
  kind: string | null,
  facts: Partial<TkaRowFacts> = {},
  music = false
) =>
  tkaRow(
    kind === null ? null : item(kind),
    coreToolRow({ kind: kind as PostItemKind | null, music }),
    { ...NO_FACTS, ...facts }
  );

describe("tka tool rows are today's rows", () => {
  it("nothing selected, and music", () => {
    expect(row(null)).toEqual(["videos", "add", "canvas", "split", "look"]);
    expect(row(null, {}, true)).toEqual(["back", "music", "delete"]);
  });
  it("video, with and without a layout", () => {
    const tail = [
      "position",
      "border",
      "fade",
      "effects",
      "beats",
      "rename",
      "duplicate",
      "delete",
    ];
    expect(row("video")).toEqual([
      "back",
      "split",
      "trim",
      "crop",
      "speed",
      "volume",
      ...tail,
    ]);
    expect(row("video", { hasLayout: true })).toEqual([
      "back",
      "split",
      "trim",
      "crop",
      "speed",
      "volume",
      "layout",
      ...tail,
    ]);
  });
  it("animation: plain, hook, hook over footage, tunnel", () => {
    expect(row("animation")).toEqual([
      "back",
      "split",
      "appearance",
      "sequence",
      "timing",
      ...TAIL,
    ]);
    expect(row("animation", { isTunnelHook: true, hasBackdrop: true })).toEqual(
      [
        "back",
        "split",
        "appearance",
        "sequence",
        "speed",
        "crop",
        "timing",
        ...TAIL,
      ]
    );
    expect(row("animation", { isTunnel: true })).toEqual([
      "back",
      "appearance",
      "speed",
      "delete",
    ]);
    expect(row("animation", { isTunnel: true, hasBackdrop: true })).toEqual([
      "back",
      "appearance",
      "speed",
      "crop",
      "delete",
    ]);
  });
  it("moves, text, titles, carousel, image, QR image, card", () => {
    expect(row("moves")).toEqual([
      "back",
      "split",
      "appearance",
      "shows",
      "sequence",
      "timing",
      ...TAIL,
    ]);
    expect(row("text")).toEqual(["back", "split", "text", "timing", ...TAIL]);
    expect(row("titles")).toEqual(["back", "titles", "timing", ...TAIL]);
    expect(row("carousel")).toEqual(["back", "split", "timing", ...TAIL]);
    expect(row("image")).toEqual(["back", "split", "timing", ...TAIL]);
    expect(row("image", { isQrImage: true })).toEqual([
      "back",
      "split",
      "appearance",
      "timing",
      ...TAIL,
    ]);
    expect(row("card")).toEqual([
      "back",
      "split",
      "appearance",
      "sequence",
      "timing",
      ...TAIL,
    ]);
  });
  it("arrangement: Grid, Speed and the look tools; a cell's own tools", () => {
    expect(row("arrangement")).toEqual([
      "back",
      "grid",
      "split",
      "speed",
      "look",
      "effects",
      "timing",
      ...TAIL,
    ]);
    expect(row("arrangement", { cell: true })).toEqual([
      "back",
      "sequence",
      "layers",
      "grids",
      "offset",
      "look",
      "effects",
      "effort",
      "clear",
    ]);
    expect(isPanelTool("grids", TKA_TOOLS)).toBe(true);
    expect(isPanelTool("effort", TKA_TOOLS)).toBe(true);
    expect(isPanelTool("clear", TKA_TOOLS)).toBe(false);
  });
  it("the add panel keeps today's order", () => {
    expect(tkaAddOrder(["text", "card"])).toEqual([
      "arrangement",
      "animation",
      "moves",
      "mandala",
      "carousel",
      "text",
      "titles",
      "card",
      "tunnel-hook",
    ]);
  });
  // Moved from post-editor-tools.test.ts: the panel helpers on rows that hold tka's tools.
  it("opens tka's panels as before, and Beats still acts at once", () => {
    expect(isPanelTool("beats", TKA_TOOLS)).toBe(false);
    expect(defaultPanel(row("card"), TKA_TOOLS)).toBe("appearance");
    expect(defaultPanel(row("moves"), TKA_TOOLS)).toBe("appearance");
    expect(
      shownPanel(
        "layout",
        { kind: "video" },
        row("video", { hasLayout: false }),
        true,
        TKA_TOOLS
      )
    ).toBe("trim");
  });
});
