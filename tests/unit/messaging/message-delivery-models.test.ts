import { describe, expect, it } from "vitest";
import {
  persistMessageAttachment,
  restoreMessageAttachment,
} from "#lib/shared/inbox/domain/message-delivery-models.js";

describe("message delivery attachment persistence", () => {
  it("round-trips image bytes and file metadata", async () => {
    const file = new File([new Uint8Array([7, 8, 9])], "jam.webp", {
      type: "image/webp",
      lastModified: 1234,
    });

    const persisted = persistMessageAttachment({
      type: "image",
      file,
      messageId: "message-1",
      attachmentId: "attachment-1",
    });
    const restored = restoreMessageAttachment(persisted);

    expect(restored.type).toBe("image");
    if (restored.type !== "image") throw new Error("Expected image");
    expect(restored.file.name).toBe("jam.webp");
    expect(restored.file.type).toBe("image/webp");
    expect(restored.file.lastModified).toBe(1234);
    expect(new Uint8Array(await restored.file.arrayBuffer())).toEqual(
      new Uint8Array([7, 8, 9])
    );
    expect(restored.messageId).toBe("message-1");
    expect(restored.attachmentId).toBe("attachment-1");
  });
});
