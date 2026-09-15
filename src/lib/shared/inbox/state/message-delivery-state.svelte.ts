import type { Message } from "$lib/shared/messaging/domain/models/message-models";
import {
  describeMessageDeliveryFailure,
  isMessageDeliveryCancelled,
} from "../domain/message-delivery-errors";
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

  /**
   * Rows the signed-in account owns. Every delivery path reads through this:
   * a row belonging to another account must never be sent, retried, scheduled
   * or counted, whatever put it in the array.
   */
  function ownedOutbox(): MessageOutboxRecord[] {
    return outbox.filter((item) => item.userId === activeUserId);
  }

  /**
   * True while a delivery begun at `token` still belongs to the signed-in
   * account. Checked after EVERY await inside a delivery, not only at its
   * start: the coordinator forwards to the messenger, which resolves the sender
   * from live auth, so a row handed over after the account changed is sent from
   * the wrong account.
   */
  function ownsDelivery(token: number, userId: string): boolean {
    return token === activation && activeUserId === userId;
  }

  /**
   * A delivery's state always reaches the durable ledger — that row belongs to
   * the account that queued it and is how the message is recovered. Only a
   * delivery still owned here is mirrored into the live outbox.
   */
  async function persistDelivery(
    record: MessageOutboxRecord,
    token: number
  ): Promise<void> {
    if (ownsDelivery(token, record.userId)) replaceOutbox(record);
    await repository.putOutbox(record);
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

    // Merge, never assign. Both arrays were emptied before the durable read, so
    // whatever is in them now was written by this same user DURING the read —
    // the share sheets can queue a message before `ready`, unlike the composer.
    // Assigning the snapshot over it erased the in-memory row while leaving the
    // durable one, so `flush()` never saw the message and nothing delivered it
    // until the next activation.
    const queuedDuringLoad = outbox;
    const draftsSavedDuringLoad = drafts;
    const mergedOutbox = new Map(normalized.map((item) => [item.id, item]));
    for (const item of queuedDuringLoad) mergedOutbox.set(item.id, item);

    const mergedDrafts = new Map(
      loadedDrafts.map((draft) => [draft.id, draft])
    );
    // A draft promoted into the outbox during the read is already deleted in the
    // repository; the snapshot predates that, so restoring it would hand the
    // composer text whose message is on its way out.
    for (const item of queuedDuringLoad) {
      mergedDrafts.delete(getMessageDraftId(item.userId, item.conversationId));
    }
    for (const draft of draftsSavedDuringLoad)
      mergedDrafts.set(draft.id, draft);

    drafts = [...mergedDrafts.values()];
    outbox = [...mergedOutbox.values()].sort(
      (a, b) => a.createdAt - b.createdAt
    );
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

    // Both awaits above can outlive the account that started the send: the
    // pending draft write, and the promotion itself. The durable row is already
    // filed under `userId` and will be picked up when that account next
    // activates, but inserting it into memory now would drop one account's
    // message into another's live outbox — and `flush()` would then deliver it
    // as the wrong user. The in-memory half belongs to whoever is active.
    if (activeUserId !== userId) return messageId;

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

  /**
   * Put a delivery back where its own account can pick it up. Nothing was sent,
   * so the attempt is un-counted: an account switch must not eat into the
   * backoff budget of a message that never reached the network.
   */
  async function abandonDelivery(
    record: MessageOutboxRecord,
    attemptCountBeforeTry: number,
    token: number
  ): Promise<void> {
    await persistDelivery(
      {
        ...record,
        status: "queued",
        attemptCount: attemptCountBeforeTry,
        progress: undefined,
        lastError: undefined,
        nextAttemptAt: undefined,
        updatedAt: now(),
      },
      token
    );
  }

  async function deliverOne(messageId: string): Promise<void> {
    const item = currentOutbox(messageId);
    if (!item) return;
    // A row belonging to another account is never this session's to deliver.
    if (item.userId !== activeUserId) return;
    if (item.status !== "queued" || !isOnline()) return;
    const token = activation;
    const owner = item.userId;
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

    // The optimistic "sending" write is itself an await, and the account can
    // change across it — the owner check that started this delivery is already
    // stale here. Handing the row to the coordinator now would send it as
    // whoever is signed in, so put it back where its own account can recover
    // it. The attempt is un-counted because nothing was attempted.
    if (!ownsDelivery(token, owner)) {
      await abandonDelivery(sending, item.attemptCount, token);
      return;
    }

    // What this delivery has produced so far. Held locally rather than re-read
    // from the outbox, so a status transition can still be written to the right
    // durable row after the live outbox has moved on to another account.
    let latest = sending;

    try {
      await coordinator.deliver(sending, {
        // The coordinator's own steps await, and the messenger under it sends
        // as whoever is signed in at dispatch. It asks this at every boundary
        // before the network so it can stop rather than send as the wrong
        // account.
        isOwned: () => ownsDelivery(token, owner),
        onProgress(progress) {
          if (!ownsDelivery(token, owner)) return;
          const current = currentOutbox(messageId);
          if (!current) return;
          latest = { ...current, progress };
          replaceOutbox(latest);
        },
        async onPrepared(attachments) {
          // Persisted even if the account changed mid-send: a prepared
          // attachment is expensive to mint again, and the durable row is what
          // the owning account resumes from.
          latest = {
            ...latest,
            preparedAttachments: attachments,
            updatedAt: now(),
          };
          await persistDelivery(latest, token);
        },
      });
      // Recorded whether or not the account is still ours: the message really
      // was sent, and leaving the durable row unfinished would re-send it on
      // that account's next activation.
      await persistDelivery(
        {
          ...latest,
          status: "sent",
          progress: undefined,
          lastError: undefined,
          nextAttemptAt: undefined,
          updatedAt: now(),
        },
        token
      );
    } catch (error) {
      // Stopped before the network because the account changed — by the
      // coordinator at one of its own boundaries, or by the messenger refusing
      // to dispatch. Nothing was sent, so this is not a failure to show or a
      // retry to back off; the row simply goes back to its account's queue.
      if (isMessageDeliveryCancelled(error)) {
        await abandonDelivery(latest, item.attemptCount, token);
        return;
      }
      const failure = describeMessageDeliveryFailure(error, isOnline());
      const delay = Math.min(
        MAX_RETRY_DELAY_MS,
        1000 * 2 ** Math.min(latest.attemptCount, 5)
      );
      await persistDelivery(
        {
          ...latest,
          status: failure.retryable ? "queued" : "failed",
          progress: undefined,
          lastError: failure.message,
          nextAttemptAt: failure.retryable ? now() + delay : undefined,
          updatedAt: now(),
        },
        token
      );
    }
  }

  async function flush(): Promise<void> {
    if (!activeUserId || !ready || !isOnline()) return;
    const queued = ownedOutbox()
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
    const nextAttempt = ownedOutbox()
      .filter(
        (item) => item.status === "queued" && item.nextAttemptAt !== undefined
      )
      .reduce<number | undefined>(
        (earliest, item) =>
          earliest === undefined
            ? item.nextAttemptAt
            : Math.min(earliest, item.nextAttemptAt!),
        undefined
      );
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
