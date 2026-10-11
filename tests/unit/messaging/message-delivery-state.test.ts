import { afterEach, describe, expect, it, vi } from "vitest";
import type { IMessageDeliveryCoordinator } from "#lib/shared/inbox/services/contracts/IMessageDeliveryCoordinator.js";
import type { IMessageDeliveryRepository } from "#lib/shared/inbox/services/contracts/IMessageDeliveryRepository.js";
import type {
  MessageDraftRecord,
  MessageOutboxRecord,
} from "#lib/shared/inbox/domain/message-delivery-models.js";
import { createMessageDeliveryState } from "#lib/shared/inbox/state/message-delivery-state.svelte.js";

class MemoryDeliveryRepository implements IMessageDeliveryRepository {
  drafts = new Map<string, MessageDraftRecord>();
  outbox = new Map<string, MessageOutboxRecord>();
  failNextOutboxPut = false;

  async listDrafts(userId: string): Promise<MessageDraftRecord[]> {
    return [...this.drafts.values()].filter((item) => item.userId === userId);
  }

  async getDraft(
    userId: string,
    conversationId: string
  ): Promise<MessageDraftRecord | undefined> {
    return [...this.drafts.values()].find(
      (item) => item.userId === userId && item.conversationId === conversationId
    );
  }

  async putDraft(draft: MessageDraftRecord): Promise<void> {
    this.drafts.set(draft.id, structuredClone(draft));
  }

  async deleteDraft(userId: string, conversationId: string): Promise<void> {
    for (const draft of this.drafts.values()) {
      if (draft.userId === userId && draft.conversationId === conversationId) {
        this.drafts.delete(draft.id);
      }
    }
  }

  async listOutbox(userId: string): Promise<MessageOutboxRecord[]> {
    return [...this.outbox.values()].filter((item) => item.userId === userId);
  }

  async putOutbox(item: MessageOutboxRecord): Promise<void> {
    if (this.failNextOutboxPut) {
      this.failNextOutboxPut = false;
      throw new Error("IndexedDB unavailable");
    }
    this.outbox.set(item.id, structuredClone(item));
  }

  async deleteOutbox(messageId: string): Promise<void> {
    this.outbox.delete(messageId);
  }

  async promoteDraftToOutbox(
    draftId: string,
    item: MessageOutboxRecord
  ): Promise<void> {
    this.outbox.set(item.id, structuredClone(item));
    this.drafts.delete(draftId);
  }

  async purgeUser(userId: string): Promise<void> {
    for (const draft of this.drafts.values()) {
      if (draft.userId === userId) this.drafts.delete(draft.id);
    }
    for (const item of this.outbox.values()) {
      if (item.userId === userId) this.outbox.delete(item.id);
    }
  }
}

const activeStates: Array<ReturnType<typeof createMessageDeliveryState>> = [];

afterEach(() => {
  activeStates.splice(0).forEach((state) => state.dispose());
  vi.restoreAllMocks();
});

function setup(
  options: {
    online?: boolean;
    deliver?: IMessageDeliveryCoordinator["deliver"];
    createId?: () => string;
  } = {}
) {
  const repository = new MemoryDeliveryRepository();
  const deliver = vi.fn(
    options.deliver ?? (async () => undefined)
  ) as unknown as IMessageDeliveryCoordinator["deliver"];
  const coordinator: IMessageDeliveryCoordinator = { deliver };
  let clock = 1_000;
  const state = createMessageDeliveryState({
    repository,
    coordinator,
    isOnline: () => options.online ?? false,
    now: () => clock++,
    createId: options.createId ?? (() => "message-1"),
  });
  activeStates.push(state);
  return { repository, coordinator, state };
}

describe("message delivery state", () => {
  it("loads only the active user's drafts", async () => {
    const { repository, state } = setup();
    repository.drafts.set("user-a:conversation-1", {
      id: "user-a:conversation-1",
      userId: "user-a",
      conversationId: "conversation-1",
      content: "Austen's draft",
      updatedAt: 1,
    });
    repository.drafts.set("user-b:conversation-1", {
      id: "user-b:conversation-1",
      userId: "user-b",
      conversationId: "conversation-1",
      content: "Someone else's draft",
      updatedAt: 2,
    });

    await state.activate("user-a");

    expect(state.drafts.map((draft) => draft.content)).toEqual([
      "Austen's draft",
    ]);
  });

  it("atomically promotes the current draft into a queued outbox item", async () => {
    const { repository, state } = setup();
    await state.activate("user-a");
    await state.saveDraft("conversation-1", {
      content: "Survive everything",
    });

    const messageId = await state.queueMessage({
      conversationId: "conversation-1",
      content: "Survive everything",
    });

    expect(messageId).toBe("message-1");
    expect(repository.drafts.size).toBe(0);
    expect(repository.outbox.get("message-1")).toMatchObject({
      status: "queued",
      content: "Survive everything",
      userId: "user-a",
    });
    expect(state.draftFor("conversation-1")).toBeUndefined();
  });

  it("keeps a shared prepared attachment on its durable outbox item", async () => {
    const { repository, state } = setup();
    const sequence = { id: "sequence-1", word: "AB", steps: [] } as never;
    const prepared = {
      type: "sequence" as const,
      url: "/q/ABCD",
      metadata: { sequenceShortCode: "ABCD" },
    };
    await state.activate("user-a");

    await state.queueMessage({
      conversationId: "conversation-1",
      content: "Shared from the gallery",
      attachment: {
        type: "sequence",
        payload: {
          sequence,
          sequenceId: "sequence-1",
          sequenceWord: "AB",
        },
      },
      preparedAttachments: [prepared],
    });

    expect(repository.outbox.get("message-1")).toMatchObject({
      preparedAttachments: [prepared],
      attachment: { type: "sequence" },
    });
  });

  it("keeps a successful send until the realtime stream reconciles its ID", async () => {
    const { repository, state } = setup({ online: true });
    await state.activate("user-a");
    await state.queueMessage({
      conversationId: "conversation-1",
      content: "Exactly once",
    });

    await vi.waitFor(() => {
      expect(state.outboxFor("conversation-1")[0]?.status).toBe("sent");
    });
    expect(repository.outbox.has("message-1")).toBe(true);

    await state.reconcile("conversation-1", [{ id: "message-1" }]);

    expect(state.outboxFor("conversation-1")).toEqual([]);
    expect(repository.outbox.has("message-1")).toBe(false);
  });

  it("flushes a message queued while an earlier delivery is still running", async () => {
    let finishFirst: (() => void) | undefined;
    const firstDelivery = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const deliver = vi
      .fn()
      .mockReturnValueOnce(firstDelivery)
      .mockResolvedValueOnce(undefined);
    const ids = ["message-1", "message-2"];
    const { state } = setup({
      online: true,
      deliver,
      createId: () => ids.shift()!,
    });
    await state.activate("user-a");

    await state.queueMessage({
      conversationId: "conversation-1",
      content: "First",
    });
    await vi.waitFor(() => expect(deliver).toHaveBeenCalledTimes(1));
    await state.queueMessage({
      conversationId: "conversation-1",
      content: "Second",
    });

    finishFirst?.();
    await vi.waitFor(() => expect(deliver).toHaveBeenCalledTimes(2));
    expect(state.outboxFor("conversation-1")).toEqual([
      expect.objectContaining({ id: "message-1", status: "sent" }),
      expect.objectContaining({ id: "message-2", status: "sent" }),
    ]);
  });

  it("returns an interrupted persistence update to the safe retry queue", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { coordinator, repository, state } = setup({ online: true });
    repository.failNextOutboxPut = true;
    await state.activate("user-a");

    await state.queueMessage({
      conversationId: "conversation-1",
      content: "Keep this safe",
    });

    await vi.waitFor(() => {
      expect(state.outboxFor("conversation-1")[0]).toMatchObject({
        status: "queued",
        lastError: "Delivery state could not be saved. Retrying…",
      });
    });
    expect(coordinator.deliver).not.toHaveBeenCalled();
  });

  it("keeps transient failures queued for automatic retry", async () => {
    const transient = Object.assign(new Error("connection interrupted"), {
      code: "functions/unavailable",
    });
    const deliver = vi.fn().mockRejectedValue(transient);
    const { state } = setup({ online: true, deliver });
    await state.activate("user-a");
    await state.queueMessage({
      conversationId: "conversation-1",
      content: "Hold this until the connection recovers",
    });

    await vi.waitFor(() => {
      expect(state.outboxFor("conversation-1")[0]).toMatchObject({
        status: "queued",
        lastError: "Delivery was interrupted. Retrying…",
      });
      expect(state.outboxFor("conversation-1")[0]?.nextAttemptAt).toBeTypeOf(
        "number"
      );
    });
  });

  it("makes terminal failures retryable by the user", async () => {
    const terminal = Object.assign(new Error("denied"), {
      code: "functions/permission-denied",
    });
    const deliver = vi
      .fn()
      .mockRejectedValueOnce(terminal)
      .mockResolvedValueOnce(undefined);
    const { state } = setup({ online: true, deliver });
    await state.activate("user-a");
    await state.queueMessage({
      conversationId: "conversation-1",
      content: "Try me again",
    });

    await vi.waitFor(() => {
      expect(state.outboxFor("conversation-1")[0]).toMatchObject({
        status: "failed",
        lastError:
          "You no longer have permission to send to this conversation.",
      });
    });

    await state.retry("message-1");
    await vi.waitFor(() => {
      expect(state.outboxFor("conversation-1")[0]?.status).toBe("sent");
    });
    expect(deliver).toHaveBeenCalledTimes(2);
  });

  it("normalizes an interrupted sending attempt after restart", async () => {
    const { repository, state } = setup();
    repository.outbox.set("message-1", {
      id: "message-1",
      userId: "user-a",
      conversationId: "conversation-1",
      content: "Resume me",
      createdAt: 100,
      updatedAt: 101,
      status: "sending",
      attemptCount: 1,
    });

    await state.activate("user-a");

    expect(state.outboxFor("conversation-1")[0]?.status).toBe("queued");
    expect(repository.outbox.get("message-1")?.status).toBe("queued");
  });
});
