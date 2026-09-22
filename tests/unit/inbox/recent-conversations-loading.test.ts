import { describe, expect, it } from "vitest";
import { inboxState } from "$lib/shared/inbox/state/inbox-state.svelte";

// The send picker reads an empty recents list as "no conversations" and
// focuses the search, so it must be able to tell "none" from "not loaded yet".
describe("recent conversations loading", () => {
  it("is pending until a subscription reports, even an empty one", () => {
    inboxState.markConversationsPending();
    expect(inboxState.conversationsLoaded).toBe(false);

    inboxState.setConversations([]);
    expect(inboxState.conversationsLoaded).toBe(true);
    expect(inboxState.conversations).toEqual([]);
  });

  it("goes pending again when a new subscription starts", () => {
    inboxState.setConversations([]);
    inboxState.markConversationsPending();
    expect(inboxState.conversationsLoaded).toBe(false);
  });
});
