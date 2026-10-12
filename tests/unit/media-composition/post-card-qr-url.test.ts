import { describe, expect, it } from "vitest";
import {
  findItem,
  type PostItem,
  updateItem,
} from "@austencloud/video-editor/core";
import {
  POST_MAX_QR_URL_LENGTH,
  POST_QR_URL_RULE,
  PostProjectSchema,
  isPostCardQrUrl,
  editContext,
} from "#lib/shared/post-studio-plugin/index.js";
import { NOW, card, project, text } from "./post-project-fixtures";

const LINK = "https://tka.run/s/abc123";
/** Exactly as long as a card's link may be. */
const LONGEST = `https://tka.run/${"a".repeat(POST_MAX_QR_URL_LENGTH - 16)}`;
const ctx = editContext(NOW + 1);

describe("isPostCardQrUrl", () => {
  it("takes an https link up to the longest allowed", () => {
    expect(LONGEST).toHaveLength(POST_MAX_QR_URL_LENGTH);
    expect(isPostCardQrUrl(LINK)).toBe(true);
    expect(isPostCardQrUrl(LONGEST)).toBe(true);
    expect(isPostCardQrUrl(`${LONGEST}a`)).toBe(false);
  });

  it.each([
    "http://tka.run/s/abc123",
    "javascript:alert(1)",
    "tka.run/s/abc123",
    "",
    "https://",
    " https://tka.run/s/abc123",
    "https://tka.run/s/abc 123",
    42,
    null,
    undefined,
  ])("refuses %j", (value) => {
    expect(isPostCardQrUrl(value)).toBe(false);
  });
});

/**
 * A saved post whose main track is one end card with these fields, parsed the
 * way a draft loads: the card's link lives in tka's card kind extension.
 */
function parseCard(fields: Partial<PostItem> = {}) {
  return PostProjectSchema.safeParse(project([card("end", 5, fields)]));
}

describe("the card item's qrUrl", () => {
  it("is kept when it follows the rule and refused with the rule otherwise", () => {
    const linked = parseCard({ qrUrl: LINK });
    expect(linked.success).toBe(true);
    const item = linked.data && findItem(linked.data, "end")?.item;
    expect(item).toMatchObject({ qrUrl: LINK });
    // A saved card keeps its keys in order: the link comes right after kind.
    const keys = Object.keys(item ?? {});
    expect(keys.indexOf("qrUrl")).toBe(keys.indexOf("kind") + 1);
    expect(parseCard({ qrUrl: "http://tka.run/s/abc123" }).success).toBe(false);
    const tooLong = parseCard({ qrUrl: `${LONGEST}a` });
    expect(tooLong.error?.issues[0]?.message).toBe(POST_QR_URL_RULE);
  });

  it("is optional", () => {
    const plain = parseCard();
    expect(plain.success).toBe(true);
    expect(plain.data && findItem(plain.data, "end")?.item).not.toHaveProperty(
      "qrUrl"
    );
  });
});

describe("updateItem with qrUrl", () => {
  const before = project([card("end")], [[text("t", 0, 2)]]);

  it("sets a card's link, and null removes it", () => {
    const linked = updateItem(before, "end", { qrUrl: LINK }, ctx);
    expect(findItem(linked, "end")?.item).toMatchObject({ qrUrl: LINK });
    const cleared = updateItem(linked, "end", { qrUrl: null }, ctx);
    expect(findItem(cleared, "end")?.item).not.toHaveProperty("qrUrl");
  });

  it("passes over a link that breaks the rule", () => {
    expect(
      updateItem(before, "end", { qrUrl: "http://tka.run/s/abc123" }, ctx)
    ).toBe(before);
  });

  it("gives no other kind of item a link", () => {
    expect(updateItem(before, "t", { qrUrl: LINK }, ctx)).toBe(before);
  });
});
