/**
 * QUARANTINED REPRODUCTION — this suite is red against current `main` and is
 * skipped on purpose. It pins the third finding of
 * `docs/reports/opus-batch-2026-09-12/inbox-concurrency.md`, which that audit
 * deliberately left unfixed (its brief capped the pass at two fixes).
 *
 * `activate()` clears the outbox, awaits the durable read, then ASSIGNS the
 * loaded rows over whatever is in memory. A message queued inside that window —
 * the share sheet's send button is not gated on `ready`, unlike the composer's —
 * is written to IndexedDB and then erased from the in-memory outbox, so its
 * optimistic bubble disappears and nothing flushes it until the next
 * activation. Merging the loaded rows with the in-flight ones (keyed by id,
 * loaded row wins) is the candidate fix. Unskip to drive it.
 */
import { describe, expect, it, vi } from "vitest";
import type { IMessageDeliveryCoordinator } from "$lib/shared/inbox/services/contracts/IMessageDeliveryCoordinator";
import type { IMessageDeliveryRepository } from "$lib/shared/inbox/services/contracts/IMessageDeliveryRepository";
import type {
  MessageDraftRecord,
  MessageOutboxRecord,
} from "$lib/shared/inbox/domain/message-delivery-models";
import { createMessageDeliveryState } from "$lib/shared/inbox/state/message-delivery-state.svelte";

/** Holds `listOutbox` open so a send can land mid-activation. */
class GatedDeliveryRepository implements IMessageDeliveryRepository {
  drafts = new Map<string, MessageDraftRecord>();
  outbox = new Map<string, MessageOutboxRecord>();
  releaseListOutbox: (() => void) | undefined;
  private readonly listOutboxGate = new Promise<void>((resolve) => {
    this.releaseListOutbox = resolve;
  });

  async listDrafts(): Promise<MessageDraftRecord[]> {
    return [];
  }

  async getDraft(): Promise<MessageDraftRecord | undefined> {
    return undefined;
  }

  async putDraft(draft: MessageDraftRecord): Promise<void> {
    this.drafts.set(draft.id, draft);
  }

  async deleteDraft(): Promise<void> {}

  async listOutbox(): Promise<MessageOutboxRecord[]> {
    await this.listOutboxGate;
    return [];
  }

  async putOutbox(item: MessageOutboxRecord): Promise<void> {
    this.outbox.set(item.id, item);
  }

  async deleteOutbox(messageId: string): Promise<void> {
    this.outbox.delete(messageId);
  }

  async promoteDraftToOutbox(
    draftId: string,
    item: MessageOutboxRecord
  ): Promise<void> {
    this.outbox.set(item.id, item);
    this.drafts.delete(draftId);
  }

  async purgeUser(): Promise<void> {}
}

describe.skip("message delivery activation race", () => {
  it("keeps a message queued while the outbox was still loading", async () => {
    const repository = new GatedDeliveryRepository();
    const deliver = vi.fn(async () => undefined);
    const coordinator = { deliver } as unknown as IMessageDeliveryCoordinator;
    const state = createMessageDeliveryState({
      repository,
      coordinator,
      isOnline: () => true,
      now: () => 1000,
      createId: () => "message-1",
    });

    const activation = state.activate("user-a");
    await state.queueMessage({
      conversationId: "conversation-1",
      content: "Sent from the share sheet",
    });
    expect(state.outboxFor("conversation-1")).toHaveLength(1);

    repository.releaseListOutbox?.();
    await activation;

    // The durable row survives; the in-memory one does not, so the queue that
    // flush() reads no longer contains it.
    expect(repository.outbox.has("message-1")).toBe(true);
    expect(state.outboxFor("conversation-1")).toHaveLength(1);
    await vi.waitFor(() => expect(deliver).toHaveBeenCalledTimes(1));
    state.dispose();
  });
});
