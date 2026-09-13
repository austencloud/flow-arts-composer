/**
 * Account ownership in the outbox, against the real
 * `createMessageDeliveryState` with a deterministic deferred ledger.
 *
 * `queueMessage` captures the signed-in user, then awaits the pending draft
 * write and the promotion. Both awaits can outlive that account. Before the fix
 * the resumed call inserted its row into whichever outbox was live by then, so
 * one account's message sat in another's queue — and `flush()` had no owner
 * filter, so it would have been delivered as the wrong user.
 */
import { describe, expect, it, vi } from "vitest";
import type { IMessageDeliveryCoordinator } from "$lib/shared/inbox/services/contracts/IMessageDeliveryCoordinator";
import type { MessageOutboxRecord } from "$lib/shared/inbox/domain/message-delivery-models";
// Relative, not `$test-helpers`: that alias exists only in the browser
// component config, not in the jsdom unit config.
import { MemoryDeliveryRepository } from "../../helpers/inbox/memory-delivery-repository";
import { createMessageDeliveryState } from "$lib/shared/inbox/state/message-delivery-state.svelte";

function setup(options: { online?: boolean } = {}) {
  const repository = new MemoryDeliveryRepository();
  const delivered: MessageOutboxRecord[] = [];
  const deliver = vi.fn(async (item: MessageOutboxRecord) => {
    delivered.push(item);
  });
  const coordinator = { deliver } as unknown as IMessageDeliveryCoordinator;
  let clock = 1_000;
  const state = createMessageDeliveryState({
    repository,
    coordinator,
    isOnline: () => options.online ?? true,
    now: () => clock++,
    createId: () => "message-1",
  });
  return { repository, state, deliver, delivered };
}

describe("message delivery account ownership", () => {
  it("never leaves one account's queued message in another's outbox", async () => {
    const { repository, state, deliver } = setup();
    await state.activate("user-a");
    repository.holdDraftWrites();
    const draftSaved = state.saveDraft("conversation-1", {
      content: "Written by the first account",
    });

    // The send starts as user-a and parks on that pending draft write.
    const queued = state.queueMessage({
      conversationId: "conversation-1",
      content: "Written by the first account",
    });

    // The account changes and finishes activating while the send is parked.
    await state.activate("user-b");
    expect(state.activeUserId).toBe("user-b");

    repository.openDraftWrites();
    await draftSaved.catch(() => undefined);
    await queued;
    await vi.waitFor(() => expect(state.ready).toBe(true));

    // The live outbox belongs to the signed-in account, and nothing is
    // delivered on its behalf that it did not send.
    expect(state.outbox.map((item) => item.userId)).toEqual([]);
    expect(state.outboxFor("conversation-1")).toEqual([]);
    expect(deliver).not.toHaveBeenCalled();

    // The message is not lost: its durable row still belongs to the account
    // that wrote it, for that account's next activation.
    expect(repository.outbox.get("message-1")).toMatchObject({
      userId: "user-a",
      status: "queued",
      content: "Written by the first account",
    });
    state.dispose();
  });

  it("delivers the recovered message once its own account is back", async () => {
    const { repository, state, deliver, delivered } = setup();
    await state.activate("user-a");
    repository.holdDraftWrites();
    const draftSaved = state.saveDraft("conversation-1", { content: "Hold" });
    const queued = state.queueMessage({
      conversationId: "conversation-1",
      content: "Hold",
    });
    await state.activate("user-b");
    repository.openDraftWrites();
    await draftSaved.catch(() => undefined);
    await queued;

    await state.activate("user-a");

    await vi.waitFor(() => expect(deliver).toHaveBeenCalledTimes(1));
    expect(delivered[0]).toMatchObject({ userId: "user-a", content: "Hold" });
    state.dispose();
  });

  it("does not deliver a parked message as the account that replaced it", async () => {
    const { repository, state, deliver } = setup();
    await state.activate("user-a");
    repository.holdDraftWrites();
    const draftSaved = state.saveDraft("conversation-1", {
      content: "Only the first account may send this",
    });
    const queued = state.queueMessage({
      conversationId: "conversation-1",
      content: "Only the first account may send this",
    });

    await state.activate("user-b");
    repository.openDraftWrites();
    await draftSaved.catch(() => undefined);
    await queued;

    // Every path that can start a delivery, while the wrong account is live.
    state.handleOnline();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await vi.waitFor(() => expect(state.ready).toBe(true));

    expect(deliver).not.toHaveBeenCalled();
    state.dispose();
  });
});
