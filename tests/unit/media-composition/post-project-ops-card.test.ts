import { describe, expect, it } from "vitest";
import {
  POST_DEFAULT_CARD_SECONDS,
  POST_QR_URL_RULE,
  findItem,
  type PostProject,
} from "#lib/shared/media-composition/domain/post-project.js";
import {
  applyPostProjectOps,
  type PostProjectOp,
} from "#lib/shared/media-composition/domain/post-project-ops.js";
import { NOW, card, project, video } from "./post-project-fixtures";

const ctx = { now: NOW + 1 };
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
