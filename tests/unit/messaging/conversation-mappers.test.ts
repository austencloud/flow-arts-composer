import { describe, expect, it } from "vitest";
import {
  mapDocToPreview,
  previewNeedsRefresh,
} from "#lib/shared/messaging/services/conversation-mappers.js";

const timestamp = { toDate: () => new Date("2026-08-20T12:00:00Z") };

function directConversationData(username: string | null | undefined) {
  return {
    type: "direct",
    participants: ["current-user", "other-user"],
    participantInfo: {
      "current-user": {
        userId: "current-user",
        displayName: "Austen",
        username: "austencloud",
        joinedAt: timestamp,
      },
      "other-user": {
        userId: "other-user",
        displayName: "Andrew Pelarinos",
        ...(username !== undefined && { username }),
        joinedAt: timestamp,
      },
    },
    unreadCount: { "current-user": 0 },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe("conversation participant username mapping", () => {
  it("keeps a stored username in the direct-conversation preview", () => {
    const preview = mapDocToPreview(
      "conversation-1",
      directConversationData("Myst1cPurpl3"),
      "current-user"
    );

    expect(preview?.otherParticipant?.username).toBe("Myst1cPurpl3");
    expect(previewNeedsRefresh(preview)).toBeUndefined();
  });

  it("requests a one-time refresh for legacy snapshots without username", () => {
    const preview = mapDocToPreview(
      "conversation-1",
      directConversationData(undefined),
      "current-user"
    );

    expect(previewNeedsRefresh(preview)).toBe("other-user");
  });

  it("does not repeatedly refresh a profile confirmed to have no username", () => {
    const preview = mapDocToPreview(
      "conversation-1",
      directConversationData(null),
      "current-user"
    );

    expect(previewNeedsRefresh(preview)).toBeUndefined();
  });
});
