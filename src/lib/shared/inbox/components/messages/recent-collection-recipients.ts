import type { ConversationPreview } from "#lib/shared/messaging/domain/models/conversation-models.js";

export interface CollectionShareRecipient {
  id: string;
  displayName: string;
  username?: string | null;
  avatar?: string;
  conversationId?: string;
}

export function recentCollectionRecipients(
  conversations: readonly Pick<
    ConversationPreview,
    "id" | "type" | "otherParticipant"
  >[],
  excludeUserIds: readonly string[],
  unknownName: string,
  limit: number
): CollectionShareRecipient[] {
  const seen = new Set<string>();
  const people: CollectionShareRecipient[] = [];
  for (const conversation of conversations) {
    if (conversation.type === "group" || !conversation.otherParticipant)
      continue;
    const person = conversation.otherParticipant;
    if (
      !person.userId ||
      seen.has(person.userId) ||
      excludeUserIds.includes(person.userId)
    )
      continue;
    seen.add(person.userId);
    people.push({
      id: person.userId,
      displayName: person.displayName || unknownName,
      username: person.username,
      avatar: person.avatar,
      conversationId: conversation.id,
    });
    if (people.length === limit) break;
  }
  return people;
}
