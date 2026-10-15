import { describe, expect, it } from "vitest";
import { recentCollectionRecipients } from "./recent-collection-recipients";
import type { ConversationPreview } from "#lib/shared/messaging/domain/models/conversation-models.js";

type RecentConversation = Pick<
  ConversationPreview,
  "id" | "type" | "otherParticipant"
>;
function direct(
  id: string,
  userId: string,
  displayName = userId
): RecentConversation {
  return {
    id,
    type: "direct",
    otherParticipant: { userId, displayName, joinedAt: new Date(0) },
  };
}

describe("recent collection recipients", () => {
  it("uses participant userId for identity and retains the existing conversation", () => {
    expect(
      recentCollectionRecipients(
        [direct("thread-1", "user-1", "Alex")],
        [],
        "Unknown",
        8
      )
    ).toEqual([
      {
        id: "user-1",
        displayName: "Alex",
        username: undefined,
        avatar: undefined,
        conversationId: "thread-1",
      },
    ]);
  });

  it("excludes selected people, groups, missing identities and duplicates before applying the limit", () => {
    const conversations: RecentConversation[] = [
      direct("self", "owner"),
      { ...direct("group", "group-member"), type: "group" },
      { id: "missing", type: "direct" },
      direct("empty", ""),
      direct("first", "alex", ""),
      direct("duplicate", "alex"),
      direct("second", "blair"),
      direct("third", "casey"),
    ];
    expect(
      recentCollectionRecipients(conversations, ["owner"], "Unknown", 2)
    ).toMatchObject([
      { id: "alex", displayName: "Unknown", conversationId: "first" },
      { id: "blair", conversationId: "second" },
    ]);
  });
});
