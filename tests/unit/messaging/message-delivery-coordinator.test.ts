import { describe, expect, it, vi } from "vitest";
import type { Messenger } from "#lib/shared/messaging/services/messenger.js";
import type { IMessageImageSender } from "#lib/shared/messaging/services/contracts/IMessageImageSender.js";
import type { ShortCodeManager } from "#lib/shared/qr/services/short-code-manager.js";
import type { MessageOutboxRecord } from "#lib/shared/inbox/domain/message-delivery-models.js";
import { MessageDeliveryCoordinator } from "#lib/shared/inbox/services/implementations/MessageDeliveryCoordinator.js";

function textItem(
  overrides: Partial<MessageOutboxRecord> = {}
): MessageOutboxRecord {
  return {
    id: "message-1",
    userId: "user-1",
    conversationId: "conversation-1",
    content: "Hello",
    createdAt: 1,
    updatedAt: 1,
    status: "sending",
    attemptCount: 1,
    ...overrides,
  };
}

function setup() {
  const sendMessage = vi.fn().mockResolvedValue({});
  const imagePromise = Promise.resolve({
    messageId: "message-1",
    storagePath: "message-images/x.webp",
    width: 100,
    height: 100,
  });
  const sendImage = vi.fn(() => ({ promise: imagePromise, cancel: vi.fn() }));
  const createShortCode = vi.fn().mockResolvedValue({ code: "ABCD" });
  const coordinator = new MessageDeliveryCoordinator(
    { sendMessage } as unknown as Messenger,
    { send: sendImage } as IMessageImageSender,
    { createShortCode } as unknown as ShortCodeManager
  );
  return { coordinator, createShortCode, sendImage, sendMessage };
}

describe("MessageDeliveryCoordinator", () => {
  it("prepares a sequence short code once and persists it before delivery", async () => {
    const { coordinator, createShortCode, sendMessage } = setup();
    const onPrepared = vi.fn().mockResolvedValue(undefined);
    const sequence = { id: "sequence-1", word: "AB", steps: [] } as never;

    await coordinator.deliver(
      textItem({
        attachment: {
          type: "sequence",
          payload: {
            sequence,
            sequenceId: "sequence-1",
            sequenceWord: "AB",
          },
        },
      }),
      { onPrepared }
    );

    expect(createShortCode).toHaveBeenCalledTimes(1);
    expect(onPrepared).toHaveBeenCalledWith([
      expect.objectContaining({
        type: "sequence",
        url: "/q/ABCD",
        metadata: expect.objectContaining({ sequenceShortCode: "ABCD" }),
      }),
    ]);
    expect(onPrepared.mock.invocationCallOrder[0]).toBeLessThan(
      sendMessage.mock.invocationCallOrder[0]!
    );
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: "message-1" })
    );
  });

  it("reuses a prepared sequence attachment on retry", async () => {
    const { coordinator, createShortCode, sendMessage } = setup();
    const prepared = {
      type: "sequence" as const,
      url: "/q/ABCD",
      metadata: { sequenceShortCode: "ABCD" },
    };

    await coordinator.deliver(textItem({ preparedAttachments: [prepared] }));

    expect(createShortCode).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: [prepared] })
    );
  });

  it("uses the stable outbox IDs for image upload and finalization", async () => {
    const { coordinator, sendImage } = setup();
    const file = new File(["image"], "jam.webp", { type: "image/webp" });

    await coordinator.deliver(
      textItem({
        attachment: {
          type: "image",
          blob: file,
          fileName: file.name,
          mimeType: file.type,
          lastModified: file.lastModified,
          messageId: "message-1",
          attachmentId: "attachment-1",
        },
      })
    );

    expect(sendImage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conversation-1",
        messageId: "message-1",
        attachmentId: "attachment-1",
      })
    );
  });
});
