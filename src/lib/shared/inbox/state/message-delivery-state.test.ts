import { afterEach, describe, expect, it, vi } from "vitest";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { buildSequenceSharePayload } from "../domain/build-sequence-share-payload";
import {
  getMessageDraftId,
  type MessageDraftRecord,
  type MessageOutboxRecord,
} from "../domain/message-delivery-models";
import type { PendingMessageAttachment } from "../domain/pending-message-attachment";
import type { IMessageDeliveryCoordinator } from "../services/contracts/IMessageDeliveryCoordinator";
import type { IMessageDeliveryRepository } from "../services/contracts/IMessageDeliveryRepository";
import {
  createMessageDeliveryState,
  type MessageDeliveryState,
} from "./message-delivery-state.svelte";
import { asReactiveInput } from "./message-delivery-test-helpers.svelte";

/**
 * IndexedDB structured-clones every record it stores and throws DataCloneError
 * on a Proxy; Dexie passes records through untouched. The check is the clone,
 * the stored value is the original: Node's structuredClone flattens a jsdom
 * File to `{}`, which would hide whether the image arm kept its file.
 */
function storable<T>(record: T): T {
  structuredClone(record);
  return record;
}

function createCloningRepository() {
  const drafts = new Map<string, MessageDraftRecord>();
  const outbox = new Map<string, MessageOutboxRecord>();
  const repository: IMessageDeliveryRepository = {
    async listDrafts(userId) {
      return [...drafts.values()].filter((draft) => draft.userId === userId);
    },
    async getDraft(userId, conversationId) {
      return drafts.get(getMessageDraftId(userId, conversationId));
    },
    async putDraft(draft) {
      drafts.set(draft.id, storable(draft));
    },
    async deleteDraft(userId, conversationId) {
      drafts.delete(getMessageDraftId(userId, conversationId));
    },
    async listOutbox(userId) {
      return [...outbox.values()].filter((item) => item.userId === userId);
    },
    async putOutbox(item) {
      outbox.set(item.id, storable(item));
    },
    async deleteOutbox(messageId) {
      outbox.delete(messageId);
    },
    async promoteDraftToOutbox(draftId, item) {
      outbox.set(item.id, storable(item));
      drafts.delete(draftId);
    },
    async purgeUser() {
      drafts.clear();
      outbox.clear();
    },
  };
  return { repository, drafts, outbox };
}

function createSequenceAttachment(): PendingMessageAttachment {
  return {
    type: "sequence",
    payload: buildSequenceSharePayload(
      createSequenceData({
        id: "sequence-1",
        name: "Practice pair",
        word: "ABABABAB",
      })
    ),
  };
}

describe("message delivery state persistence", () => {
  const states: MessageDeliveryState[] = [];

  function createState(
    repository: IMessageDeliveryRepository,
    deliver: IMessageDeliveryCoordinator["deliver"] = async () => {}
  ): MessageDeliveryState {
    const state = createMessageDeliveryState({
      repository,
      coordinator: { deliver },
      isOnline: () => true,
      createId: () => "message-1",
    });
    states.push(state);
    return state;
  }

  afterEach(() => {
    states.splice(0).forEach((state) => state.dispose());
  });

  it("queues a sequence attachment handed over as reactive state", async () => {
    const { repository, outbox } = createCloningRepository();
    const state = createState(repository);
    await state.activate("user-1");

    await state.queueMessage({
      conversationId: "conv-1",
      content: "",
      attachment: asReactiveInput(createSequenceAttachment()),
    });

    expect(outbox.get("message-1")?.attachment).toEqual(
      createSequenceAttachment()
    );
  });

  it("saves a draft attachment handed over as reactive state", async () => {
    const { repository, drafts } = createCloningRepository();
    const state = createState(repository);
    await state.activate("user-1");

    await state.saveDraft("conv-1", {
      content: "",
      attachment: asReactiveInput(createSequenceAttachment()),
    });

    expect(drafts.get("user-1:conv-1")?.attachment).toEqual(
      createSequenceAttachment()
    );
  });

  it("delivers a queued message whose record was read back out of the outbox", async () => {
    const { repository, outbox } = createCloningRepository();
    const deliver = vi.fn(async () => {});
    const state = createState(repository, deliver);
    await state.activate("user-1");

    // Plain input, so the only proxies in play are the ones the delivery loop
    // picks up when it reads the queued record back out of reactive state.
    await state.queueMessage({
      conversationId: "conv-1",
      content: "Try this one",
      replyTo: {
        messageId: "message-0",
        senderName: "Paul",
        content: "Any ideas?",
      },
      attachment: createSequenceAttachment(),
    });

    await vi.waitFor(() => {
      expect(state.outboxFor("conv-1")[0]?.status).toBe("sent");
    });
    expect(deliver).toHaveBeenCalledOnce();
    expect(outbox.get("message-1")).toMatchObject({
      status: "sent",
      lastError: undefined,
    });
  });

  it("keeps an image attachment's file intact", async () => {
    const { repository, outbox } = createCloningRepository();
    const state = createState(repository);
    await state.activate("user-1");
    const file = new File(["png-bytes"], "card.png", { type: "image/png" });

    await state.queueMessage({
      conversationId: "conv-1",
      content: "",
      attachment: asReactiveInput<PendingMessageAttachment>({
        type: "image",
        file,
        messageId: "message-1",
        attachmentId: "attachment-1",
      }),
    });

    const persisted = outbox.get("message-1")?.attachment;
    expect(persisted?.type).toBe("image");
    if (persisted?.type !== "image") return;
    expect(persisted.blob).toBeInstanceOf(Blob);
    expect(persisted.fileName).toBe("card.png");
  });
});
