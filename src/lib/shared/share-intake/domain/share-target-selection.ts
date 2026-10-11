import type { ConversationPreview } from "#lib/shared/messaging/domain/models/conversation-models.js";

/**
 * The system share sheet displays roughly four Direct Share targets. Pushing
 * more is work the user never sees.
 */
export const MAX_SHARE_TARGETS = 4;

/** One person to publish as a Direct Share target. */
export interface ShareTarget {
  /** The conversation id. Becomes the shortcut id, and comes back as EXTRA_SHORTCUT_ID. */
  id: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * Pick which conversations become Direct Share targets.
 *
 * Pure on purpose: ranking is the part worth testing exhaustively, and it
 * should not require a Capacitor plugin or a fetch mock to exercise.
 *
 * Groups are excluded in v1 - a group face means compositing an avatar stack
 * into a single bitmap, which is real work for a 48px icon.
 */
export function selectShareTargets(
  conversations: ConversationPreview[]
): ShareTarget[] {
  return conversations
    .filter((conversation) => conversation.type === "direct")
    .slice()
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .flatMap((conversation) => {
      const other = conversation.otherParticipant;
      // Optional on the type, so a malformed doc would otherwise publish a
      // nameless face into the system share sheet.
      if (!other?.displayName) return [];
      return [
        {
          id: conversation.id,
          name: other.displayName,
          avatarUrl: other.avatar ?? null,
        },
      ];
    })
    .slice(0, MAX_SHARE_TARGETS);
}
