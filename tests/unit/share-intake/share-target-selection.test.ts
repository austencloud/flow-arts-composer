import { describe, it, expect } from "vitest";
import {
  selectShareTargets,
  MAX_SHARE_TARGETS,
} from "#lib/shared/share-intake/domain/share-target-selection.js";
import type { ConversationPreview } from "#lib/shared/messaging/domain/models/conversation-models.js";

function direct(
  id: string,
  name: string,
  minutesAgo: number,
  avatar?: string
): ConversationPreview {
  return {
    id,
    type: "direct",
    otherParticipant: {
      userId: `u_${id}`,
      displayName: name,
      ...(avatar ? { avatar } : {}),
      joinedAt: new Date(0),
    },
    unreadCount: 0,
    updatedAt: new Date(Date.now() - minutesAgo * 60_000),
  };
}

function group(id: string, minutesAgo: number): ConversationPreview {
  return {
    id,
    type: "group",
    groupName: "Fire jam",
    participantCount: 4,
    unreadCount: 0,
    updatedAt: new Date(Date.now() - minutesAgo * 60_000),
  };
}

describe("selectShareTargets", () => {
  it("returns the most recent direct conversations, newest first", () => {
    const result = selectShareTargets([
      direct("c1", "Paul", 30),
      direct("c2", "Nina", 5),
      direct("c3", "Lion", 90),
    ]);

    expect(result.map((t) => t.name)).toEqual(["Nina", "Paul", "Lion"]);
  });

  it("excludes groups", () => {
    // v1 scope: a group icon needs an avatar stack composited into one bitmap.
    const result = selectShareTargets([group("g1", 1), direct("c1", "Paul", 10)]);

    expect(result.map((t) => t.id)).toEqual(["c1"]);
  });

  it("caps at MAX_SHARE_TARGETS", () => {
    const many = Array.from({ length: 12 }, (_, i) => direct(`c${i}`, `P${i}`, i));

    expect(selectShareTargets(many)).toHaveLength(MAX_SHARE_TARGETS);
  });

  it("drops a direct conversation with no other participant", () => {
    // The field is optional on the type, so a malformed doc must not produce a
    // nameless face in the system share sheet.
    const malformed = { ...direct("c1", "Paul", 1) };
    delete (malformed as { otherParticipant?: unknown }).otherParticipant;

    expect(selectShareTargets([malformed, direct("c2", "Nina", 2)])).toHaveLength(1);
  });

  it("carries the avatar url through, and null when there is none", () => {
    const result = selectShareTargets([
      direct("c1", "Paul", 1, "https://cdn/paul.webp"),
      direct("c2", "Nina", 2),
    ]);

    expect(result[0]?.avatarUrl).toBe("https://cdn/paul.webp");
    expect(result[1]?.avatarUrl).toBeNull();
  });

  it("is empty for an empty list", () => {
    expect(selectShareTargets([])).toEqual([]);
  });
});
