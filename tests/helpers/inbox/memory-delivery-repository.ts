import type { IMessageDeliveryRepository } from "$lib/shared/inbox/services/contracts/IMessageDeliveryRepository";
import type {
  MessageDraftRecord,
  MessageOutboxRecord,
} from "$lib/shared/inbox/domain/message-delivery-models";

/**
 * In-memory draft/outbox ledger for inbox tests that need the REAL
 * `createMessageDeliveryState` — its `activeUserId` and `ready` are runes, so a
 * hand-written object double cannot wake the effects that read them.
 *
 * `listOutbox` can be held open to reproduce work that lands mid-activation.
 * `tests/unit/messaging/message-delivery-state.test.ts` keeps its own copy; it
 * predates this helper and is left alone.
 */
export class MemoryDeliveryRepository implements IMessageDeliveryRepository {
  drafts = new Map<string, MessageDraftRecord>();
  outbox = new Map<string, MessageOutboxRecord>();
  failNextDraftPut = false;
  private listOutboxGate: Promise<void> | null = null;
  private releaseListOutbox: (() => void) | null = null;

  /** Make every `listOutbox` wait until `openOutboxRead()` is called. */
  holdOutboxRead(): void {
    this.listOutboxGate = new Promise<void>((resolve) => {
      this.releaseListOutbox = resolve;
    });
  }

  openOutboxRead(): void {
    this.releaseListOutbox?.();
    this.releaseListOutbox = null;
    this.listOutboxGate = null;
  }

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
    if (this.failNextDraftPut) {
      this.failNextDraftPut = false;
      throw new Error("IndexedDB unavailable");
    }
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
    if (this.listOutboxGate) await this.listOutboxGate;
    return [...this.outbox.values()].filter((item) => item.userId === userId);
  }

  async putOutbox(item: MessageOutboxRecord): Promise<void> {
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
