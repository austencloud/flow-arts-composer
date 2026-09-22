import { describe, expect, it } from "vitest";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { generateSequenceRoutePath } from "$lib/shared/navigation/services/sequence-encoder";
import {
  buildSequenceMessageAttachment,
  decodeLegacySequenceAttachment,
} from "$lib/shared/inbox/domain/message-attachment-builders";
import { buildSequenceSharePayload } from "$lib/shared/inbox/domain/build-sequence-share-payload";
import {
  buildReplyPreview,
  getMessagePreviewText,
  getReplyPreviewText,
} from "$lib/shared/messaging/domain/message-preview";

function findUndefinedPaths(value: unknown, path = "attachment"): string[] {
  if (value === undefined) return [path];
  if (value === null || typeof value !== "object") return [];

  return Object.entries(value).flatMap(([key, child]) =>
    findUndefinedPaths(child, `${path}.${key}`)
  );
}

describe("message attachment presentation", () => {
  it("uses useful previews for attachment-only messages", () => {
    expect(getMessagePreviewText("", [{ type: "image" }])).toBe(
      "Sent an image"
    );
    expect(getMessagePreviewText("", [{ type: "sequence" }])).toBe(
      "Shared a sequence"
    );
    expect(
      getMessagePreviewText("A caption that should win", [{ type: "image" }])
    ).toBe("A caption that should win");
  });

  it("keeps complete reply text and attachment context", () => {
    const content = "A".repeat(240);
    const reply = buildReplyPreview({
      id: "message-1",
      senderId: "sender-1",
      senderName: "Austen",
      content,
      attachments: [{ type: "sequence" }],
    });

    expect(reply).toEqual({
      messageId: "message-1",
      senderId: "sender-1",
      senderName: "Austen",
      content,
      attachmentType: "sequence",
    });
    expect(getReplyPreviewText(reply)).toBe(content);
    expect(
      getReplyPreviewText({
        messageId: "legacy-message",
        senderName: "Legacy sender",
        content: "",
      })
    ).toBe("Message");
    expect(
      getReplyPreviewText({
        messageId: "image-message",
        senderId: "sender-1",
        senderName: "Austen",
        content: "",
        attachmentType: "image",
      })
    ).toBe("Image");
  });

  it("uses a compact short-code route instead of serializing the sequence", () => {
    const sequence = createSequenceData({
      id: "private-sequence-id",
      name: "Private practice",
      word: "AB",
      displayName: "Practice pair",
    });

    const attachment = buildSequenceMessageAttachment(sequence, "AB3D");

    expect(attachment.url).toBe("/q/AB3D");
    expect(attachment.url).not.toContain("private-sequence-id");
    expect(attachment.metadata?.sequenceId).toBe("private-sequence-id");
    expect(attachment.metadata?.sequenceShortCode).toBe("AB3D");
    expect(findUndefinedPaths(attachment)).toEqual([]);
  });

  it("carries the sender's view on the attachment and its scan link", () => {
    const sequence = createSequenceData({
      id: "configured-view",
      name: "Configured view",
      word: "AB",
    });
    const viewParams = "pane=animation&fx=trail&s=abc%2Bdef";

    const attachment = buildSequenceMessageAttachment(sequence, "AB3D", {
      viewParams,
    });

    expect(attachment.url).toBe(`/q/AB3D?${viewParams}`);
    expect(attachment.metadata?.sequenceViewParams).toBe(viewParams);
    expect(findUndefinedPaths(attachment)).toEqual([]);

    // Messages sent from a surface with no viewer state stay as they were.
    const plain = buildSequenceMessageAttachment(sequence, "AB3D", {});
    expect(plain.url).toBe("/q/AB3D");
    expect(plain.metadata).not.toHaveProperty("sequenceViewParams");
  });

  it("keeps the source sequence available to the send sheet for short-code minting", () => {
    const sequence = createSequenceData({
      id: "sequence-for-send-sheet",
      name: "Send sheet sequence",
      word: "AB",
    });

    expect(buildSequenceSharePayload(sequence).sequence).toBe(sequence);
  });

  it("uses the canonical compact word in share previews and attachments", () => {
    const sequence = createSequenceData({
      id: "repeating-sequence",
      name: "Repeating sequence",
      word: "ABABABAB",
    });

    const payload = buildSequenceSharePayload(sequence);
    const attachment = buildSequenceMessageAttachment(sequence, "LOOP");

    expect(payload.sequenceWord).toBe("AB");
    expect(attachment.name).toBe("AB");
    expect(attachment.metadata?.sequenceWord).toBe("AB");
  });

  it("recovers already-sent serialized sequence attachments", () => {
    const sequence = createSequenceData({
      id: "legacy-sequence",
      name: "Legacy sequence",
      word: "AB",
    });
    const legacyAttachment = {
      type: "sequence" as const,
      url: generateSequenceRoutePath(sequence),
    };

    const decoded = decodeLegacySequenceAttachment(legacyAttachment);

    expect(decoded?.steps).toEqual([]);
  });

  it("does not treat a document ID route as a serialized sequence", () => {
    expect(
      decodeLegacySequenceAttachment({
        type: "sequence",
        url: "/sequence/private-sequence-id",
      })
    ).toBeNull();
  });
});
