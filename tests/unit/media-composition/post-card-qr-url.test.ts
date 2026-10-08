import { describe, expect, it } from "vitest";
import {
  POST_MAX_QR_URL_LENGTH,
  POST_QR_URL_RULE,
  PostCardItemSchema,
  findItem,
  isPostCardQrUrl,
} from "$lib/shared/media-composition/domain/post-project";
import { updateItem } from "$lib/shared/media-composition/domain/post-project-edits";
import { NOW, card, project, text } from "./post-project-fixtures";

const LINK = "https://tka.run/s/abc123";
/** Exactly as long as a card's link may be. */
const LONGEST = `https://tka.run/${"a".repeat(POST_MAX_QR_URL_LENGTH - 16)}`;
const ctx = { now: NOW + 1 };

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

describe("the card item's qrUrl", () => {
  it("is kept when it follows the rule and refused with the rule otherwise", () => {
    expect(
      PostCardItemSchema.parse({ ...card("end"), qrUrl: LINK })
    ).toMatchObject({
      qrUrl: LINK,
    });
    expect(
      PostCardItemSchema.safeParse({
        ...card("end"),
        qrUrl: "http://tka.run/s/abc123",
      }).success
    ).toBe(false);
    const tooLong = PostCardItemSchema.safeParse({
      ...card("end"),
      qrUrl: `${LONGEST}a`,
    });
    expect(tooLong.error?.issues[0]?.message).toBe(POST_QR_URL_RULE);
  });

  it("is optional", () => {
    expect(PostCardItemSchema.parse(card("end"))).not.toHaveProperty("qrUrl");
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
