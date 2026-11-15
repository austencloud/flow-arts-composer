import { describe, expect, it } from "vitest";
import {
  POST_DEFAULT_CARD_SECONDS,
  findItem,
  type PostItem,
  type PostProject,
} from "@austencloud/video-editor/core";
import {
  POST_QR_URL_RULE,
  editContext,
} from "#lib/shared/post-studio-plugin/index.js";
import {
  applyPostProjectOps,
  type PostProjectOp,
} from "#lib/shared/media-composition/domain/post-project-ops.js";
import { NOW, card, project, video } from "./post-project-fixtures";

const ctx = editContext(NOW + 1);
const LINK = "https://tka.run/s/abc123";
const apply = (before: PostProject, ...ops: PostProjectOp[]) =>
  applyPostProjectOps(before, ops, ctx);
/** An op as a script might send it, wrong types and all. */
const loose = (op: object) => op as unknown as PostProjectOp;

describe("add-card", () => {
  it("puts a card at the end of the main track", () => {
    const next = apply(project([video("v1")]), {
      op: "add-card",
      label: "End",
      fadeIn: 0.5,
    });
    const items = next.tracks[0]!.items;
    expect(items.map((item) => item.kind)).toEqual(["video", "card"]);
    expect(items[1]).toMatchObject({
      kind: "card",
      label: "End",
      start: 10,
      duration: POST_DEFAULT_CARD_SECONDS,
      fadeIn: 0.5,
    });
    expect(items[1]).not.toHaveProperty("qrUrl");
  });

  it("gives the card a link and shows the QR in its info cell", () => {
    const next = apply(project([video("v1")]), { op: "add-card", qrUrl: LINK });
    expect(next.tracks[0]!.items[1]).toMatchObject({
      kind: "card",
      qrUrl: LINK,
      cardAppearance: { infoCellChoice: "qr" },
    });
  });

  it("names what is wrong", () => {
    const before = project([video("v1")]);
    expect(() =>
      apply(before, { op: "add-card", qrUrl: "http://tka.run/s/abc123" })
    ).toThrow(POST_QR_URL_RULE);
    expect(() => apply(before, loose({ op: "add-card", fadeIn: -1 }))).toThrow(
      "fadeIn must be 0 or more."
    );
    expect(() => apply(before, loose({ op: "add-card", fadeIn: "1" }))).toThrow(
      "fadeIn must be 0 or more."
    );
    expect(() => apply(before, loose({ op: "add-card", label: 7 }))).toThrow(
      "label must be text."
    );
  });
});

describe("the item op and a card's link", () => {
  it("sets the link, and null removes it", () => {
    const linked = apply(project([card("end")]), {
      op: "item",
      item: "end",
      patch: { qrUrl: LINK },
    });
    expect(findItem(linked, "end")?.item).toMatchObject({ qrUrl: LINK });
    const cleared = apply(linked, {
      op: "item",
      item: "end",
      patch: { qrUrl: null },
    });
    expect(findItem(cleared, "end")?.item).not.toHaveProperty("qrUrl");
  });

  it("says why a link is refused", () => {
    expect(() =>
      apply(project([card("end")]), {
        op: "item",
        item: "end",
        patch: { qrUrl: "javascript:alert(1)" },
      })
    ).toThrow(POST_QR_URL_RULE);
  });

  it("shows a new link in the card's QR cell and keeps its other looks", () => {
    const before = project([
      card("end", 5, {
        cardAppearance: { darkMode: true, infoCellChoice: "mandala" },
      }),
    ]);
    const linked = apply(before, {
      op: "item",
      item: "end",
      patch: { qrUrl: LINK },
    });
    expect(findItem(linked, "end")?.item).toMatchObject({
      qrUrl: LINK,
      cardAppearance: { darkMode: true, infoCellChoice: "qr" },
    });
  });

  it("refuses a link on an item that is not a card", () => {
    expect(() =>
      apply(project([video("v1")]), {
        op: "item",
        item: "v1",
        patch: { qrUrl: LINK },
      })
    ).toThrow("Only a card keeps a scan link.");
  });
});

describe("sound", () => {
  it("sets whether the takes' own sound plays", () => {
    const before = project([video("v1")]);
    expect(before.audio).toBe("takes");
    expect(apply(before, { op: "sound", sound: "silent" }).audio).toBe(
      "silent"
    );
  });

  it("refuses anything but takes or silent", () => {
    expect(() =>
      apply(project([video("v1")]), loose({ op: "sound", sound: "loud" }))
    ).toThrow("sound must be takes or silent.");
  });
});

describe("trim carries the app's own times", () => {
  it("keeps a card's ring on the same moment when its start is trimmed", () => {
    const before = project(
      [video("v1")],
      [[card("end", 6, { start: 10, ring: { at: 3, every: 0.5 } } as Partial<PostItem>)]]
    );
    // The card runs 10 to 16 over the clip; its ring arrives at post 13.
    const next = apply(before, {
      op: "trim",
      item: "end",
      edge: "start",
      seconds: 12,
    });
    const trimmed = findItem(next, "end")!.item as PostItem & {
      ring?: { at: number };
    };
    expect(trimmed.start).toBeCloseTo(12);
    expect(trimmed.ring?.at).toBeCloseTo(1);
  });

  it("keeps a titles clip's lit span on the same moments when its start is trimmed", () => {
    const titles = {
      ...card("t", 6),
      kind: "titles",
      start: 1,
      lit: { from: 2, to: 4 },
    } as unknown as PostItem;
    const before = project([video("v1")], [[titles]]);
    // Lit from post 3 to 5; the start moves to post 4.
    const next = apply(before, {
      op: "trim",
      item: "t",
      edge: "start",
      seconds: 4,
    });
    const trimmed = findItem(next, "t")!.item as PostItem & {
      lit?: { from: number; to: number };
    };
    expect(trimmed.start).toBeCloseTo(4);
    expect(trimmed.lit).toEqual({ from: 0, to: 1 });
  });
});

describe("the item op and a clip's held last frame", () => {
  const held = (p: PostProject) =>
    (findItem(p, "v1")!.item as PostItem & { holdOut?: number }).holdOut;

  it("sets holdOut on a video clip, and null or 0 clears it", () => {
    const before = project([video("v1")]);
    const set = apply(before, {
      op: "item",
      item: "v1",
      patch: { holdOut: 2 },
    });
    expect(held(set)).toBe(2);
    expect(findItem(set, "v1")!.item.duration).toBeCloseTo(12);
    const cleared = apply(set, {
      op: "item",
      item: "v1",
      patch: { holdOut: null },
    });
    expect(held(cleared)).toBeUndefined();
    expect(findItem(cleared, "v1")!.item.duration).toBeCloseTo(10);
    expect(
      held(apply(set, { op: "item", item: "v1", patch: { holdOut: 0 } }))
    ).toBeUndefined();
  });

  it("names what is wrong", () => {
    const before = project([video("v1")], [[card("end", 5)]]);
    for (const holdOut of [-1, 31, "2"]) {
      expect(() =>
        apply(before, loose({ op: "item", item: "v1", patch: { holdOut } }))
      ).toThrow("holdOut must be seconds from 0 to 30, or null to clear it.");
    }
    expect(() =>
      apply(before, { op: "item", item: "end", patch: { holdOut: 2 } })
    ).toThrow("Only a video clip holds its last frame.");
  });
});
