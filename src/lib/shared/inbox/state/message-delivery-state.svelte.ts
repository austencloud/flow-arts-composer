import type { Message } from "$lib/shared/messaging/domain/models/message-models";
import { describeMessageDeliveryFailure } from "../domain/message-delivery-errors";
import type {
  MessageDraftRecord,
  MessageOutboxRecord,
  QueueMessageInput,
} from "../domain/message-delivery-models";
import {
  getMessageDraftId,
  persistMessageAttachment,
} from "../domain/message-delivery-models";
import type { IMessageDeliveryCoordinator } from "../services/contracts/IMessageDeliveryCoordinator";
import type { IMessageDeliveryRepository } from "../services/contracts/IMessageDeliveryRepository";

const MAX_RETRY_DELAY_MS = 30_000;
const SENT_RETENTION_MS = 24 * 60 * 60 * 1000;

interface MessageDeliveryStateDependencies {
  repository: IMessageDeliveryRepository;
  coordinator: IMessageDeliveryCoordinator;
  isOnline?: () => boolean;
  now?: () => number;
  createId?: () => string;
}

export interface MessageDeliveryState {
  readonly activeUserId: string | null;
  readonly ready: boolean;
  readonly drafts: MessageDraftRecord[];
  readonly outbox: MessageOutboxRecord[];
  activate(userId: string): Promise<void>;
  deactivate(): void;
  dispose(): void;
  draftFor(conversationId: string): MessageDraftRecord | undefined;
  outboxFor(conversationId: string): MessageOutboxRecord[];
  saveDraft(
    conversationId: string,
    draft: Pick<MessageDraftRecord, "content" | "replyTo"> & {
      attachment?: QueueMessageInput["attachment"];
    }
  ): Promise<void>;
  clearDraft(conversationId: string): Promise<void>;
  queueMessage(input: Omit<QueueMessageInput, "userId">): Promise<string>;
  retry(messageId: string): Promise<void>;
  remove(messageId: string): Promise<void>;
  reconcile(
    conversationId: string,
    messages: readonly Pick<Message, "id">[]
  ): Promise<void>;
  handleOnline(): void;
}

/**
 * IndexedDB structured-clones what it stores and throws DataCloneError on the
 * Proxy that `$state` wraps around plain objects. Every record that reaches the
 * repository is proxied somewhere: it arrived as reactive input
 * (inboxState.shareAttachment, a composer's pendingAttachment), or the delivery
 * loop read it back out of the reactive `outbox`/`drafts` arrays, where a
 * shallow spread still leaves the attachment, reply preview, and prepared
 * attachments proxied. Not `$state.snapshot`: that structured-clones every Blob
 * it meets, and an image attachment carries its File here.
 */
function plainRecord<T>(value: T): T {
  if (Array.isArray(value)) return value.map(plainRecord) as T;
  if (
    value === null ||
    typeof value !== "object" ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return value;
  }
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    copy[key] = plainRecord((value as Record<string, unknown>)[key]);
  }
  return copy as T;
}

/** Every write crosses into IndexedDB as a plain record, whoever hands it over. */
function withPlainRecords(
  repository: IMessageDeliveryRepository
): IMessageDeliveryRepository {
  return {
    listDrafts: (userId) => repository.listDrafts(userId),
    getDraft: (userId, conversationId) =>
      repository.getDraft(userId, conversationId),
    putDraft: (draft) => repository.putDraft(plainRecord(draft)),
    deleteDraft: (userId, conversationId) =>
      repository.deleteDraft(userId, conversationId),
    listOutbox: (userId) => repository.listOutbox(userId),
    putOutbox: (item) => repository.putOutbox(plainRecord(item)),
    deleteOutbox: (messageId) => repository.deleteOutbox(messageId),
    promoteDraftToOutbox: (draftId, item) =>
      repository.promoteDraftToOutbox(draftId, plainRecord(item)),
    purgeUser: (userId) => repository.purgeUser(userId),
  };
}

export function createMessageDeliveryState(
  dependencies: MessageDeliveryStateDependencies
): MessageDeliveryState {
  const repository = withPlainRecords(dependencies.repository);
  const { coordinator } = dependencies;
  const isOnline =
    dependencies.isOnline ??
    (() => typeof navigator === "undefined" || navigator.onLine);
  const now = dependencies.now ?? (() => Date.now());
  const createId = dependencies.createId ?? (() => crypto.randomUUID());

  let activeUserId = $state<string | null>(null);
  let ready = $state(false);
  let drafts = $state<MessageDraftRecord[]>([]);
  let outbox = $state<MessageOutboxRecord[]>([]);
  let activation = 0;
  let flushPromise: Promise<void> | null = null;
  let flushRequested = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  const draftWrites = new Map<string, Promise<void>>();

  function replaceDraft(draft: MessageDraftRecord): void {
    drafts = [...drafts.filter((entry) => entry.id !== draft.id), draft];
  }

  function replaceOutbox(item: MessageOutboxRecord): void {
    outbox = [...outbox.filter((entry) => entry.id !== item.id), item].sort(
      (a, b) => a.createdAt - b.createdAt
    );
  }

  function currentOutbox(messageId: string): MessageOutboxRecord | undefined {
    return outbox.find((entry) => entry.id === messageId);
  }

  function queueDraftWrite(
    draftId: string,
    write: () => Promise<void>
  ): Promise<void> {
    const previous = draftWrites.get(draftId) ?? Promise.resolve();
    const operation = previous.catch(() => undefined).then(write);
    draftWrites.set(draftId, operation);
    void operation
      .finally(() => {
        if (draftWrites.get(draftId) === operation) draftWrites.delete(draftId);
      })
      .catch(() => undefined);
    return operation;
  }

  async function activate(userId: string): Promise<void> {
    if (activeUserId === userId && ready) return;
    const token = ++activation;
    activeUserId = userId;
    ready = false;
    drafts = [];
    outbox = [];
    clearRetryTimer();

    const [loadedDrafts, loadedOutbox] = await Promise.all([
      repository.listDrafts(userId),
      repository.listOutbox(userId),
    ]);
    if (token !== activation || activeUserId !== userId) return;

    const cutoff = now() - SENT_RETENTION_MS;
    const expiredSent = loadedOutbox.filter(
      (item) => item.status === "sent" && item.updatedAt < cutoff
    );
    const retained = loadedOutbox.filter(
      (item) => !expiredSent.some((expired) => expired.id === item.id)
    );
    const normalized = retained.map((item) =>
      item.status === "sending"
        ? {
            ...item,
            status: "queued" as const,
            progress: undefined,
            updatedAt: now(),
          }
        : item
    );

    await Promise.all([
      ...expiredSent.map((item) => repository.deleteOutbox(item.id)),
      ...normalized
        .filter(
          (item, index) =>
            retained[index]?.status === "sending" && item.status === "queued"
        )
        .map((item) => repository.putOutbox(item)),
    ]);
    if (token !== activation || activeUserId !== userId) return;

    drafts = loadedDrafts;
    outbox = normalized;
    ready = true;
    requestFlush();
  }

  function deactivate(): void {
    activation++;
    activeUserId = null;
    ready = false;
    drafts = [];
    outbox = [];
    draftWrites.clear();
    flushRequested = false;
    clearRetryTimer();
  }

  function dispose(): void {
    deactivate();
  }

  function draftFor(conversationId: string): MessageDraftRecord | undefined {
    if (!activeUserId) return undefined;
    return drafts.find(
      (draft) =>
        draft.userId === activeUserId && draft.conversationId === conversationId
    );
  }

  function outboxFor(conversationId: string): MessageOutboxRecord[] {
    if (!activeUserId) return [];
    return outbox.filter(
      (item) =>
        item.userId === activeUserId && item.conversationId === conversationId
    );
  }

  async function saveDraft(
    conversationId: string,
    draft: Pick<MessageDraftRecord, "content" | "replyTo"> & {
      attachment?: QueueMessageInput["attachment"];
    }
  ): Promise<void> {
    const userId = activeUserId;
    if (!userId)
      throw new Error("A signed-in user is required to save a draft.");
    const id = getMessageDraftId(userId, conversationId);
    const hasDraft = Boolean(
      draft.content || draft.replyTo || draft.attachment
    );

    if (!hasDraft) {
      drafts = drafts.filter((entry) => entry.id !== id);
      return queueDraftWrite(id, () =>
        repository.deleteDraft(userId, conversationId)
      );
    }

    const record: MessageDraftRecord = {
      id,
      userId,
      conversationId,
      content: draft.content,
      replyTo: draft.replyTo,
      attachment: draft.attachment
        ? persistMessageAttachment(draft.attachment)
        : undefined,
      updatedAt: now(),
    };
    replaceDraft(record);
    return queueDraftWrite(id, () => repository.putDraft(record));
  }

  async function clearDraft(conversationId: string): Promise<void> {
    const userId = activeUserId;
    if (!userId) return;
    const id = getMessageDraftId(userId, conversationId);
    drafts = drafts.filter((entry) => entry.id !== id);
    await queueDraftWrite(id, () =>
      repository.deleteDraft(userId, conversationId)
    );
  }

  async function queueMessage(
    input: Omit<QueueMessageInput, "userId">
  ): Promise<string> {
    const userId = activeUserId;
    if (!userId)
      throw new Error("A signed-in user is required to send a message.");
    const draftId = getMessageDraftId(userId, input.conversationId);
    await draftWrites.get(draftId)?.catch(() => undefined);

    const attachment = input.attachment
      ? persistMessageAttachment(input.attachment)
      : undefined;
    const messageId =
      attachment?.type === "image" ? attachment.messageId : createId();
    const timestamp = now();
    const item: MessageOutboxRecord = {
      id: messageId,
      userId,
      conversationId: input.conversationId,
      content: input.content.trim(),
      replyTo: input.replyTo,
      attachment,
      preparedAttachments: input.preparedAttachments,
      createdAt: timestamp,
      updatedAt: timestamp,
      status: "queued",
      attemptCount: 0,
      lastError: isOnline() ? undefined : "Waiting for a connection",
    };

    await repository.promoteDraftToOutbox(draftId, item);
    drafts = drafts.filter((entry) => entry.id !== draftId);
    replaceOutbox(item);
    requestFlush();
    return messageId;
  }

  async function retry(messageId: string): Promise<void> {
    const item = currentOutbox(messageId);
    if (!item || item.status === "sending" || item.status === "sent") return;
    const queued: MessageOutboxRecord = {
      ...item,
      status: "queued",
      lastError: isOnline() ? undefined : "Waiting for a connection",
      nextAttemptAt: undefined,
      progress: undefined,
      updatedAt: now(),
    };
    replaceOutbox(queued);
    await repository.putOutbox(queued);
    requestFlush();
  }

  async function remove(messageId: string): Promise<void> {
    const item = currentOutbox(messageId);
    if (!item || item.status === "sending" || item.status === "sent") return;
    await repository.deleteOutbox(messageId);
    outbox = outbox.filter((entry) => entry.id !== messageId);
  }

  async function reconcile(
    conversationId: string,
    messages: readonly Pick<Message, "id">[]
  ): Promise<void> {
    const serverIds = new Set(messages.map((message) => message.id));
    const delivered = outbox.filter(
      (item) => item.conversationId === conversationId && serverIds.has(item.id)
    );
    if (delivered.length === 0) return;

    await Promise.all(
      delivered.map((item) => repository.deleteOutbox(item.id))
    );
    const deliveredIds = new Set(delivered.map((item) => item.id));
    outbox = outbox.filter((item) => !deliveredIds.has(item.id));
  }

  async function deliverOne(messageId: string): Promise<void> {
    const item = currentOutbox(messageId);
    if (!item || item.status !== "queued" || !isOnline()) return;
    const token = activation;
    const sending: MessageOutboxRecord = {
      ...item,
      status: "sending",
      attemptCount: item.attemptCount + 1,
      nextAttemptAt: undefined,
      lastError: undefined,
      progress: { label: "Sending" },
      updatedAt: now(),
    };
    replaceOutbox(sending);
    await repository.putOutbox(sending);

    try {
      await coordinator.deliver(sending, {
        onProgress(progress) {
          const current = currentOutbox(messageId);
          if (!current || token !== activation) return;
          replaceOutbox({ ...current, progress });
        },
        async onPrepared(attachments) {
          const current = currentOutbox(messageId);
          if (!current || token !== activation) return;
          const prepared = {
            ...current,
            preparedAttachments: attachments,
            updatedAt: now(),
          };
          replaceOutbox(prepared);
          await repository.putOutbox(prepared);
        },
      });
      const current = currentOutbox(messageId);
      if (!current || token !== activation) return;
      const sent: MessageOutboxRecord = {
        ...current,
        status: "sent",
        progress: undefined,
        lastError: undefined,
        nextAttemptAt: undefined,
        updatedAt: now(),
      };
      replaceOutbox(sent);
      await repository.putOutbox(sent);
    } catch (error) {
      const current = currentOutbox(messageId);
      if (!current || token !== activation) return;
      const failure = describeMessageDeliveryFailure(error, isOnline());
      const delay = Math.min(
        MAX_RETRY_DELAY_MS,
        1000 * 2 ** Math.min(current.attemptCount, 5)
      );
      const failed: MessageOutboxRecord = {
        ...current,
        status: failure.retryable ? "queued" : "failed",
        progress: undefined,
        lastError: failure.message,
        nextAttemptAt: failure.retryable ? now() + delay : undefined,
        updatedAt: now(),
      };
      replaceOutbox(failed);
      await repository.putOutbox(failed);
    }
  }

  async function flush(): Promise<void> {
    if (!activeUserId || !ready || !isOnline()) return;
    const queued = outbox
      .filter(
        (item) =>
          item.status === "queued" &&
          (item.nextAttemptAt === undefined || item.nextAttemptAt <= now())
      )
      .sort((a, b) => a.createdAt - b.createdAt);
    for (const item of queued) {
      await deliverOne(item.id);
    }
  }

  function requestFlush(): void {
    if (flushPromise) {
      // An item may be queued while an earlier delivery is awaiting the
      // network. Remember that work instead of letting it sit until another
      // online event happens to wake the outbox.
      flushRequested = true;
      return;
    }
    flushRequested = false;
    flushPromise = flush()
      .catch((error) => {
        // A persistence failure can happen before or after the server accepted
        // a message. Put every in-flight item back into the idempotent queue;
        // its stable ID makes retrying safe in both cases.
        console.error("[MessageDelivery] Outbox flush was interrupted:", error);
        const retryAt = now() + 1000;
        outbox = outbox.map((item) =>
          item.status === "sending"
            ? {
                ...item,
                status: "queued" as const,
                progress: undefined,
                lastError: "Delivery state could not be saved. Retrying…",
                nextAttemptAt: retryAt,
                updatedAt: now(),
              }
            : item
        );
      })
      .finally(() => {
        flushPromise = null;
        if (flushRequested) requestFlush();
        else scheduleNextFlush();
      });
  }

  function clearRetryTimer(): void {
    if (!retryTimer) return;
    clearTimeout(retryTimer);
    retryTimer = null;
  }

  function scheduleNextFlush(): void {
    clearRetryTimer();
    if (!isOnline()) return;
    const nextAttempt = outbox
      .filter(
        (item) => item.status === "queued" && item.nextAttemptAt !== undefined
      )
      .reduce<
        number | undefined
      >((earliest, item) => (earliest === undefined ? item.nextAttemptAt : Math.min(earliest, item.nextAttemptAt!)), undefined);
    if (nextAttempt === undefined) return;
    retryTimer = setTimeout(requestFlush, Math.max(0, nextAttempt - now()));
  }

  function handleOnline(): void {
    requestFlush();
  }

  return {
    get activeUserId() {
      return activeUserId;
    },
    get ready() {
      return ready;
    },
    get drafts() {
      return drafts;
    },
    get outbox() {
      return outbox;
    },
    activate,
    deactivate,
    dispose,
    draftFor,
    outboxFor,
    saveDraft,
    clearDraft,
    queueMessage,
    retry,
    remove,
    reconcile,
    handleOnline,
  };
}
