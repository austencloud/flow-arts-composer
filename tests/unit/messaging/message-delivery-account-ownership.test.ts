/**
 * Account ownership in the outbox, against the real
 * `createMessageDeliveryState` with a deterministic deferred ledger.
 *
 * Two rounds of defect live here. `queueMessage` captures the signed-in user,
 * then awaits the pending draft write and the promotion; the resumed call used
 * to insert its row into whichever outbox was live by then, and `flush()` had no
 * owner filter. And `deliverOne` checked the owner once, then awaited its own
 * optimistic "sending" persistence before calling the coordinator — so a
 * delivery already past the filter could still hand one account's row to the
 * coordinator while another account was signed in. The real coordinator forwards
 * to `Messenger.sendMessage`, which resolves the sender from live auth, so that
 * is a message sent from the wrong account.
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

  it("does not hand a parked delivery to the coordinator after the account changes", async () => {
    const { repository, state, deliver } = setup();
    await state.activate("user-a");

    // The delivery loop parks on its own optimistic "sending" write, which is
    // AFTER the owner check that starts it.
    repository.holdNextOutboxWrite();
    await state.queueMessage({
      conversationId: "conversation-1",
      content: "Only the first account may send this",
    });
    await vi.waitFor(() =>
      expect(repository.outbox.get("message-1")).toBeDefined()
    );

    await state.activate("user-b");
    expect(state.activeUserId).toBe("user-b");

    repository.openOutboxWrite();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // The coordinator sends as whoever is signed in, so it must not be reached.
    expect(deliver).not.toHaveBeenCalled();

    // And the row is left recoverable rather than stranded mid-flight.
    expect(repository.outbox.get("message-1")).toMatchObject({
      userId: "user-a",
      status: "queued",
    });
    state.dispose();
  });

  it("delivers a parked message once, on its own account's next activation", async () => {
    const { repository, state, deliver, delivered } = setup();
    await state.activate("user-a");
    repository.holdNextOutboxWrite();
    await state.queueMessage({
      conversationId: "conversation-1",
      content: "Recoverable",
    });
    await vi.waitFor(() =>
      expect(repository.outbox.get("message-1")).toBeDefined()
    );
    await state.activate("user-b");
    repository.openOutboxWrite();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(deliver).not.toHaveBeenCalled();

    await state.activate("user-a");

    await vi.waitFor(() => expect(deliver).toHaveBeenCalledTimes(1));
    expect(delivered[0]).toMatchObject({
      userId: "user-a",
      content: "Recoverable",
    });
    state.dispose();
  });

  it("records a send that completed after the account changed, so it is not sent twice", async () => {
    const repository = new MemoryDeliveryRepository();
    let releaseDeliver: (() => void) | undefined;
    const deliverGate = new Promise<void>((resolve) => {
      releaseDeliver = resolve;
    });
    const deliver = vi.fn(async () => {
      await deliverGate;
    });
    const state = createMessageDeliveryState({
      repository,
      coordinator: { deliver } as unknown as IMessageDeliveryCoordinator,
      isOnline: () => true,
      now: () => 1_000,
      createId: () => "message-1",
    });

    await state.activate("user-a");
    await state.queueMessage({
      conversationId: "conversation-1",
      content: "In flight",
    });
    await vi.waitFor(() => expect(deliver).toHaveBeenCalledTimes(1));

    // The account changes while the coordinator is still sending.
    await state.activate("user-b");
    releaseDeliver?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // It really was sent, so the durable row has to say so — otherwise the next
    // activation of user-a re-sends it. The live outbox stays user-b's.
    expect(repository.outbox.get("message-1")).toMatchObject({
      userId: "user-a",
      status: "sent",
    });
    expect(state.outbox).toEqual([]);

    await state.activate("user-a");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(deliver).toHaveBeenCalledTimes(1);
    state.dispose();
  });
});
