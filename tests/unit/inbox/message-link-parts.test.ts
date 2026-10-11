import { describe, expect, it } from "vitest";
import {
  buildDetectedSequenceAttachment,
  findLatestSequencePreviewMessageId,
  findMessageSequenceLink,
  messageHasSequencePreview,
  parseMessageText,
} from "#lib/shared/inbox/domain/message-link-parts.js";

describe("message link parsing", () => {
  it("preserves surrounding text while normalizing fuzzy links to HTTPS", () => {
    expect(
      parseMessageText("Read example.com/docs, then email hi@example.com.")
    ).toEqual([
      { kind: "text", text: "Read " },
      {
        kind: "link",
        text: "example.com/docs",
        href: "https://example.com/docs",
        linkType: "url",
      },
      { kind: "text", text: ", then email " },
      {
        kind: "link",
        text: "hi@example.com",
        href: "mailto:hi@example.com",
        linkType: "email",
      },
      { kind: "text", text: "." },
    ]);
  });

  it("detects canonical sequence and short-code links", () => {
    expect(
      findMessageSequenceLink(
        "Fuse result: https://tkaflowarts.com/sequence/YR0L?bp=staff#viewer"
      )
    ).toEqual({
      href: "https://tkaflowarts.com/sequence/YR0L?bp=staff#viewer",
      route: "/sequence/YR0L?bp=staff#viewer",
      identifier: "YR0L",
    });

    expect(findMessageSequenceLink("Open tka.run/ab3d.")).toEqual({
      href: "https://tka.run/ab3d",
      route: "/sequence/AB3D",
      identifier: "AB3D",
      shortCode: "AB3D",
    });

    expect(
      findMessageSequenceLink("https://tkaflowarts.com/q/ab3d?rp=staff")
    ).toEqual({
      href: "https://tkaflowarts.com/q/ab3d?rp=staff",
      route: "/sequence/AB3D?rp=staff",
      identifier: "AB3D",
      shortCode: "AB3D",
    });

    expect(
      findMessageSequenceLink(
        "https://tkaflowarts.com/sequence/d1%3Ablue%7Cred"
      )
    ).toEqual({
      href: "https://tkaflowarts.com/sequence/d1%3Ablue%7Cred",
      route: "/sequence/d1%3Ablue%7Cred",
      identifier: "d1:blue|red",
    });
  });

  it("does not preview lookalike or unrelated links as TKA sequences", () => {
    expect(
      findMessageSequenceLink(
        "https://tkaflowarts.com.evil.example/sequence/O263"
      )
    ).toBeNull();
    expect(
      findMessageSequenceLink("https://tkaflowarts.com/guide/level-1")
    ).toBeNull();
  });

  it("builds a sparse attachment for the existing sequence-card owner", () => {
    const link = findMessageSequenceLink("https://tka.run/AB3D");
    expect(link).not.toBeNull();
    expect(buildDetectedSequenceAttachment(link!)).toEqual({
      type: "sequence",
      url: "/sequence/AB3D",
      name: "Sequence",
      metadata: {
        title: "Sequence",
        sequenceShortCode: "AB3D",
      },
    });
  });

  it("selects the newest sequence card that MessageBubble will render", () => {
    const base = {
      conversationId: "thread",
      senderId: "person",
      senderName: "Person",
      createdAt: new Date("2026-08-14T12:00:00Z"),
      readBy: [],
    };
    const messages = [
      {
        ...base,
        id: "attached",
        content: "",
        attachments: [{ type: "sequence" as const, url: "/q/AB3D" }],
      },
      {
        ...base,
        id: "image-wins",
        content: "https://tkaflowarts.com/sequence/YR0L",
        attachments: [{ type: "image" as const, url: "/image.png" }],
      },
      {
        ...base,
        id: "linked",
        content: "Latest: https://tkaflowarts.com/sequence/YR0L",
      },
    ];

    expect(messageHasSequencePreview(messages[0]!)).toBe(true);
    expect(messageHasSequencePreview(messages[1]!)).toBe(false);
    expect(findLatestSequencePreviewMessageId(messages)).toBe("linked");
  });
});
