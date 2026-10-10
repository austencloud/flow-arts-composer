import {
  db,
  type TKADatabase,
} from "#lib/shared/persistence/database/tka-database.js";
import type {
  MessageDraftRecord,
  MessageOutboxRecord,
} from "../../domain/message-delivery-models";
import { getMessageDraftId } from "../../domain/message-delivery-models";
import type { IMessageDeliveryRepository } from "../contracts/IMessageDeliveryRepository";

export class MessageDeliveryRepository implements IMessageDeliveryRepository {
  constructor(private readonly database: TKADatabase = db) {}

  async listDrafts(userId: string): Promise<MessageDraftRecord[]> {
    return this.database.messageDrafts.where("userId").equals(userId).toArray();
  }

  async getDraft(
    userId: string,
    conversationId: string
  ): Promise<MessageDraftRecord | undefined> {
    return this.database.messageDrafts.get(
      getMessageDraftId(userId, conversationId)
    );
  }

  async putDraft(draft: MessageDraftRecord): Promise<void> {
    await this.database.messageDrafts.put(draft);
  }

  async deleteDraft(userId: string, conversationId: string): Promise<void> {
    await this.database.messageDrafts.delete(
      getMessageDraftId(userId, conversationId)
    );
  }

  async listOutbox(userId: string): Promise<MessageOutboxRecord[]> {
    const items = await this.database.messageOutbox
      .where("userId")
      .equals(userId)
      .toArray();
    return items.sort((a, b) => a.createdAt - b.createdAt);
  }

  async putOutbox(item: MessageOutboxRecord): Promise<void> {
    const persisted = { ...item };
    delete persisted.progress;
    await this.database.messageOutbox.put(persisted);
  }

  async deleteOutbox(messageId: string): Promise<void> {
    await this.database.messageOutbox.delete(messageId);
  }

  async promoteDraftToOutbox(
    draftId: string,
    item: MessageOutboxRecord
  ): Promise<void> {
    const persisted = { ...item };
    delete persisted.progress;
    await this.database.transaction(
      "rw",
      [this.database.messageDrafts, this.database.messageOutbox],
      async () => {
        await this.database.messageOutbox.put(persisted);
        await this.database.messageDrafts.delete(draftId);
      }
    );
  }

  async purgeUser(userId: string): Promise<void> {
    await this.database.transaction(
      "rw",
      [this.database.messageDrafts, this.database.messageOutbox],
      async () => {
        await Promise.all([
          this.database.messageDrafts.where("userId").equals(userId).delete(),
          this.database.messageOutbox.where("userId").equals(userId).delete(),
        ]);
      }
    );
  }
}
